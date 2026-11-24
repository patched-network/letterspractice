/**
 * Read-only pipeline runs for the admin learner views.
 *
 * Runs the course's real pipeline (the framework's generators and filters plus
 * LP's registered ones) for another learner without touching their data:
 *
 * - The learner side is a {@link LearnerDump}, already fetched by the admin
 *   views with the admin's couch cookie. {@link createReadonlyLearnerDB} serves
 *   the pipeline's user-DB reads from it and records, without applying, any
 *   write the pipeline attempts (the intake clock, prescribed-generator state,
 *   orphaned-review cleanup).
 * - The course side is the live course DB, wrapped so the two places it
 *   consults "the current user" (the logged-in admin) see the learner instead.
 *
 * {@link sessionRunupFor} reproduces what `/study/practice` passes the
 * pipeline on a fresh session (useStudySession `_doInit` + StudyPracticeView's
 * post-lesson hints), so a run here is the learner's next bootstrap run.
 *
 * Optional: tag-aware ("per-tag") ELO distance, the framework's experimental
 * mode that is off by default in production. See the eloDistance filter in
 * vue-skuilder `packages/db/src/core/navigators/filters/eloDistance.ts`.
 */

import {
  DocType,
  drainCapturedRuns,
  getDataLayer,
  type ContentNavigationStrategyData,
  type CourseDBInterface,
  type FilterImpact,
  type PipelineRunReport,
  type ReplanHints,
  type ScheduledCard,
  type StrategyContribution,
  type UserDBInterface,
} from '@vue-skuilder/db';
import type { LearnerDataset, LearnerDump } from '@vue-skuilder/db/diagnostics';
import { toCourseElo } from '@vue-skuilder/common';
import { batchLimitForSessionCount } from '@/composables/useStudySession';
import { ENTITLEMENT_COURSE_ID } from './courseEntitlement';
import { getPostLessonHints } from './lessons';
import type { LessonProgressState } from './lessons.types';
import { USER_STATE_KEYS, type LetterProgressionState } from './userState.types';
import { entitlement } from '../entitlement';

// ---------------------------------------------------------------------------
// Read-only learner user DB
// ---------------------------------------------------------------------------

/** A write the pipeline attempted against the learner, recorded instead of applied. */
export interface SuppressedWrite {
  method: string;
  /** Compact rendering of the arguments (strategy key, review id, …). */
  detail: string;
}

type RawDoc = { _id: string; [k: string]: unknown };

const WRITE_METHODS = new Set([
  'update',
  'setConfig',
  'putCardRecord',
  'registerForCourse',
  'dropCourse',
  'scheduleCardReview',
  'removeScheduledCardReview',
  'registerForClassroom',
  'dropFromClassroom',
  'updateUserElo',
  'resetUserData',
  'putStrategyState',
  'deleteStrategyState',
  'putUserOutcome',
  'putStudySession',
]);

function describeArgs(method: string, args: unknown[]): string {
  if (method === 'putStrategyState' || method === 'deleteStrategyState') return String(args[1]);
  if (method === 'removeScheduledCardReview') return String(args[0]);
  return args
    .map((a) => (typeof a === 'string' ? a : typeof a === 'object' && a ? '{…}' : String(a)))
    .join(', ');
}

function notFound(id: string): Error {
  return Object.assign(new Error(`[readonly learner] missing: ${id}`), { status: 404, name: 'not_found' });
}

/**
 * A UserDBInterface over a learner dump. Reads come from the dump; writes are
 * recorded in `writes` and resolve as no-ops; anything else throws, so an
 * unanticipated dependency fails loudly rather than reading the admin.
 */
export function createReadonlyLearnerDB(
  dump: LearnerDump,
  dataset: LearnerDataset,
): { user: UserDBInterface; writes: SuppressedWrite[] } {
  const docs = new Map<string, RawDoc>(dump.docs.map((d) => [d._id, d as RawDoc]));
  const writes: SuppressedWrite[] = [];
  const registrations = dataset.registration ?? { courses: [], studyWeight: {} };
  const allScheduled = dump.docs.filter(
    (d) => d._id.startsWith('card_review_') && typeof (d as RawDoc).cardId === 'string',
  ) as unknown as ScheduledCard[];

  const pending = (courseId?: string, horizonMs = Date.now()) =>
    allScheduled.filter(
      (r) =>
        (courseId === undefined || r.courseId === courseId) &&
        Date.parse(String(r.reviewTime)) < horizonMs,
    );

  const strategyState = <T>(courseId: string, key: string): T | null => {
    const doc = docs.get(`STRATEGY_STATE::${courseId}::${key}`);
    return doc ? ((doc.data as T) ?? null) : null;
  };

  const reads: Partial<Record<keyof UserDBInterface, unknown>> = {
    getUsername: () => dump.username,
    isLoggedIn: () => true,
    hydrationStatus: () => ({ state: 'hydrated' }),
    awaitHydration: async () => ({ state: 'hydrated' }),
    get: async (id: string) => {
      const doc = docs.get(id);
      if (!doc) throw notFound(id);
      return doc;
    },
    getConfig: async () => docs.get('CONFIG') ?? {},
    getSeenCards: async (courseId?: string) =>
      courseId === undefined || courseId === dataset.courseId
        ? dataset.cardHistories.map((h) => h.cardID)
        : [],
    getActiveCards: async () => allScheduled.map((r) => ({ courseID: r.courseId, cardID: r.cardId })),
    getCourseRegistrationsDoc: async () => registrations,
    getCourseRegDoc: async (courseId: string) => {
      const reg = registrations.courses.find((c) => c.courseID === courseId);
      if (!reg) throw new Error(`Course registration not found for course ID: ${courseId}`);
      return reg;
    },
    getActiveCourses: async () =>
      registrations.courses.filter((c) => c.status === undefined || c.status === 'active'),
    getPendingReviews: async (courseId?: string) => pending(courseId),
    getReviewsForcast: async (days: number, courseId?: string) =>
      pending(courseId, Date.now() + days * 86_400_000),
    getStudySessions: async () => dataset.sessions,
    getStrategyState: async (courseId: string, key: string) => strategyState(courseId, key),
    getCourseInterface: async (courseId: string) => ({
      getStrategyState: async (key: string) => strategyState(courseId, key),
      putStrategyState: async (key: string) => {
        writes.push({ method: 'putStrategyState', detail: key });
      },
      deleteStrategyState: async (key: string) => {
        writes.push({ method: 'deleteStrategyState', detail: key });
      },
    }),
  };

  const user = new Proxy({} as UserDBInterface, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in reads) return reads[prop as keyof UserDBInterface];
      if (WRITE_METHODS.has(prop)) {
        return async (...args: unknown[]) => {
          writes.push({ method: prop, detail: describeArgs(prop, args) });
        };
      }
      // `then` must stay undefined, or `await user` treats the proxy as a thenable.
      if (prop === 'then') return undefined;
      return () => {
        throw new Error(`[readonly learner] ${prop}() is not available in a read-only run`);
      };
    },
  });

  return { user, writes };
}

// ---------------------------------------------------------------------------
// Course DB wrapper
// ---------------------------------------------------------------------------

type NavigatorFactory = {
  createNavigator(user: UserDBInterface): Promise<{
    setEphemeralHints(hints: ReplanHints): void;
    getWeightedCards(limit: number): Promise<unknown>;
  }>;
};

/** Default eloDistance doc, as the framework's assembler would add it, but tag-aware. */
function tagAwareDefaultEloDistance(courseId: string): ContentNavigationStrategyData {
  return {
    _id: 'NAVIGATION_STRATEGY-eloDistance-default',
    docType: DocType.NAVIGATION_STRATEGY,
    name: 'ELO Distance (default, tag-aware)',
    description: 'Admin read-only run: the default ELO distance curve with tagAware on',
    implementingClass: 'eloDistance',
    course: courseId,
    serializedData: JSON.stringify({ tagAware: true }),
  };
}

/** Turn `tagAware` on in every eloDistance doc, adding one if the course declares none. */
export function withTagAwareElo(
  strategies: ContentNavigationStrategyData[],
  courseId: string,
): ContentNavigationStrategyData[] {
  let found = false;
  const out = strategies.map((s) => {
    if (s.implementingClass !== 'eloDistance') return s;
    found = true;
    let config: Record<string, unknown> = {};
    try {
      config = s.serializedData ? JSON.parse(s.serializedData) : {};
    } catch {
      config = {};
    }
    return { ...s, serializedData: JSON.stringify({ ...config, tagAware: true }) };
  });
  return found ? out : [...out, tagAwareDefaultEloDistance(courseId)];
}

/**
 * The live course DB, with its "current user" reads pointed at the learner.
 *
 * The couch CourseDB resolves `getCardsCenteredAtELO({ elo: 'user' })` (the
 * ELO generator's retrieval window) against the logged-in user, not the
 * pipeline's. Here that's the admin, so the window is re-centred on the
 * learner's global ELO.
 */
function learnerCourseDB(
  courseId: string,
  learnerElo: number,
  tagAware: boolean,
): CourseDBInterface & NavigatorFactory {
  const course = getDataLayer().getCourseDB(courseId) as CourseDBInterface & Partial<NavigatorFactory>;
  if (typeof course.createNavigator !== 'function') {
    throw new Error('This data layer has no createNavigator(); read-only runs need the couch course DB');
  }
  return new Proxy(course as CourseDBInterface & NavigatorFactory, {
    get(target, prop, receiver) {
      if (prop === 'getCardsCenteredAtELO') {
        return (options: { limit: number; elo: 'user' | 'random' | number }, filter?: unknown) =>
          target.getCardsCenteredAtELO(
            options?.elo === 'user' ? { ...options, elo: learnerElo } : options,
            filter as never,
          );
      }
      if (prop === 'getAllNavigationStrategies' && tagAware) {
        return async () => withTagAwareElo(await target.getAllNavigationStrategies(), courseId);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

// ---------------------------------------------------------------------------
// Session runup
// ---------------------------------------------------------------------------

/** What `/study/practice` would hand the pipeline for this learner's next session. */
export interface SessionRunup {
  /** Completed study sessions, from `CONFIG.sessionTracking` (the batch-limit curve's input). */
  sessionCount: number;
  batchLimit: number;
  /** Lesson whose post-lesson practice is pending, if any. */
  postLessonFlag: string | null;
  /** Hints the next session would start with (post-lesson boost / seeds). */
  hints: ReplanHints | null;
}

export function sessionRunupFor(dump: LearnerDump, dataset: LearnerDataset): SessionRunup {
  // As useStudySession's _doInit: keyed by the entitlement id, not the couch course id.
  const config = dump.docs.find((d) => d._id === 'CONFIG') as
    | { sessionTracking?: Record<string, { studySessionCount?: number }> }
    | undefined;
  const sessionCount = config?.sessionTracking?.[ENTITLEMENT_COURSE_ID]?.studySessionCount ?? 0;

  // As StudyPracticeView's onMounted.
  const lessons = dataset.strategyState[USER_STATE_KEYS.LESSON_PROGRESS] as LessonProgressState | undefined;
  const postLessonFlag = lessons?.postLessonPracticeFlag ?? null;
  const lessonHints = postLessonFlag ? getPostLessonHints(postLessonFlag) : {};

  return {
    sessionCount,
    batchLimit: batchLimitForSessionCount(sessionCount),
    postLessonFlag,
    hints: Object.keys(lessonHints).length > 0 ? lessonHints : null,
  };
}

/**
 * LP's IntroGateFilter asks the drip gate whether the account has paid, and
 * the drip gate asks about the logged-in account (the admin). That only
 * matters once the learner is at the free-tier ceiling: returns the word
 * count when it does.
 */
export function dripGateCaveat(dataset: LearnerDataset): number | null {
  const progression = dataset.strategyState[USER_STATE_KEYS.LETTER_PROGRESSION] as
    | LetterProgressionState
    | undefined;
  const count = progression?.reachableWordCount;
  const limit = entitlement.wordLimit;
  return limit !== null && typeof count === 'number' && count >= limit ? count : null;
}

/** Is the framework's browser-wide tag-aware toggle on? It overrides the per-run toggle. */
export function browserTagAwareOverride(): boolean {
  return (window as { skuilder?: { multiDimElo?: boolean } }).skuilder?.multiDimElo === true;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export interface ReadonlyRunOptions {
  tagAwareElo: boolean;
  limit: number;
  hints: ReplanHints | null;
}

export interface ReadonlyRunResult extends ReadonlyRunOptions {
  /** Local id for the admin view's run list. */
  id: number;
  username: string;
  /** When the learner data was read (the dump), and when the run executed. */
  dataAsOf: string;
  ranAt: string;
  elapsedMs: number;
  learnerElo: number;
  report: PipelineRunReport | null;
  writes: SuppressedWrite[];
}

let nextRunId = 1;

export async function runReadonlyPipeline(
  dump: LearnerDump,
  dataset: LearnerDataset,
  opts: ReadonlyRunOptions,
): Promise<ReadonlyRunResult> {
  const { user, writes } = createReadonlyLearnerDB(dump, dataset);
  const reg = dataset.registration?.courses.find((c) => c.courseID === dataset.courseId);
  if (!reg) throw new Error(`${dump.username} is not registered for ${dataset.courseId}`);
  const learnerElo = toCourseElo(reg.elo).global.score;

  const course = learnerCourseDB(dataset.courseId, learnerElo, opts.tagAwareElo);
  const started = performance.now();
  const ranAt = new Date().toISOString();

  // Runs are captured into a module buffer that a SessionController drains.
  // No session runs in an admin tab, but start from empty regardless.
  drainCapturedRuns();
  const navigator = await course.createNavigator(user);
  if (opts.hints) navigator.setEphemeralHints(opts.hints);
  await navigator.getWeightedCards(opts.limit);
  const reports = drainCapturedRuns();

  return {
    ...opts,
    id: nextRunId++,
    username: dump.username,
    dataAsOf: dump.fetchedAt,
    ranAt,
    elapsedMs: Math.round(performance.now() - started),
    learnerElo,
    report: reports[reports.length - 1] ?? null,
    writes,
  };
}

// ---------------------------------------------------------------------------
// Reading a run's ELO distance
// ---------------------------------------------------------------------------

/** What the eloDistance filter did to one card, parsed from its provenance. */
export interface EloDistanceReading {
  multiplier: number;
  distance: number;
  /** Shared tags the gap was read on; 0 when global distance was used. */
  sharedTags: number;
  /** Global gap (card − learner), when the filter reported it (tag-aware runs). */
  globalGap?: number;
  reason: string;
}

export function eloDistanceOf(provenance: StrategyContribution[]): EloDistanceReading | null {
  const entry = provenance.find((p) => p.strategy === 'eloDistance');
  if (!entry) return null;
  const reason = entry.reason ?? '';
  const multiplier = Number(/→ ([\d.]+)x/.exec(reason)?.[1] ?? NaN);
  const distance = Number(/ELO distance (\d+)/.exec(reason)?.[1] ?? NaN);
  const shared = /on (\d+) shared tag/.exec(reason);
  const global = /\(global ([+-]?\d+)\)/.exec(reason);
  return {
    multiplier,
    distance,
    sharedTags: shared ? Number(shared[1]) : 0,
    ...(global ? { globalGap: Number(global[1]) } : {}),
    reason,
  };
}

// ---------------------------------------------------------------------------
// Comparing two runs (the view's "both" mode: global vs tag-aware)
// ---------------------------------------------------------------------------

/** One card's standing in run A and run B. Absent side = not retained (in the dropped tail). */
export interface CardComparison {
  cardId: string;
  /** 1-based rank by final score among the run's retained cards. */
  rankA?: number;
  rankB?: number;
  selectedA: boolean;
  selectedB: boolean;
  multA?: number;
  multB?: number;
}

export interface RunComparison {
  cards: Map<string, CardComparison>;
  /** Selected in both. */
  kept: string[];
  /** Selected in B only, B's rank order. */
  entered: string[];
  /** Selected in A only, A's rank order. */
  left: string[];
  /** |selected A ∩ B| / |selected A ∪ B|; 1 when both are empty. */
  overlap: number;
  /** Cards retained in both, by |multB − multA| descending. */
  movers: string[];
  /** Each filter's impact in A and B, in pipeline order. */
  filters: FilterDiff[];
  /** Per-tag rollup of the selection and ELO-distance multipliers, biggest shifts first. */
  tags: TagRollup[];
}

export interface FilterDiff {
  name: string;
  a?: FilterImpact;
  b?: FilterImpact;
  /** Cards retained in both whose action from this filter differs between the runs. */
  changedActions: number;
}

export interface TagRollup {
  tag: string;
  /** Cards carrying the tag that are retained in both runs (the multiplier means' base). */
  shared: number;
  selectedA: number;
  selectedB: number;
  meanMultA?: number;
  meanMultB?: number;
}

type RunReportCardLike = PipelineRunReport['cards'][number];

function ranked(report: PipelineRunReport | null): RunReportCardLike[] {
  return [...(report?.cards ?? [])].sort((x, y) => y.finalScore - x.finalScore);
}

export function compareRuns(
  a: PipelineRunReport | null,
  b: PipelineRunReport | null,
  includeTag: (tag: string) => boolean = () => true,
): RunComparison {
  const cards = new Map<string, CardComparison>();
  const entry = (cardId: string) => {
    let e = cards.get(cardId);
    if (!e) cards.set(cardId, (e = { cardId, selectedA: false, selectedB: false }));
    return e;
  };
  const multOf = (c: RunReportCardLike) => {
    const m = eloDistanceOf(c.provenance)?.multiplier;
    return m === undefined || Number.isNaN(m) ? undefined : m;
  };
  const rankedA = ranked(a);
  const rankedB = ranked(b);
  rankedA.forEach((c, i) => Object.assign(entry(c.cardId), { rankA: i + 1, selectedA: c.selected, multA: multOf(c) }));
  rankedB.forEach((c, i) => Object.assign(entry(c.cardId), { rankB: i + 1, selectedB: c.selected, multB: multOf(c) }));

  const kept = rankedA.filter((c) => c.selected && cards.get(c.cardId)!.selectedB).map((c) => c.cardId);
  const entered = rankedB.filter((c) => c.selected && !cards.get(c.cardId)!.selectedA).map((c) => c.cardId);
  const left = rankedA.filter((c) => c.selected && !cards.get(c.cardId)!.selectedB).map((c) => c.cardId);
  const union = kept.length + entered.length + left.length;

  const delta = (e: CardComparison) => Math.abs((e.multB ?? 0) - (e.multA ?? 0));
  const movers = [...cards.values()]
    .filter((e) => e.multA !== undefined && e.multB !== undefined)
    .sort((x, y) => delta(y) - delta(x))
    .map((e) => e.cardId);

  return {
    cards,
    kept,
    entered,
    left,
    overlap: union ? kept.length / union : 1,
    movers,
    filters: compareFilters(a, b),
    tags: rollupByTag(rankedA, rankedB, cards, includeTag),
  };
}

/** Each card's action per filter (by strategy name), from its provenance. */
function actionsByFilter(report: PipelineRunReport | null): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const c of report?.cards ?? []) {
    out.set(c.cardId, new Map(c.provenance.map((p) => [p.strategyName, p.action] as [string, string])));
  }
  return out;
}

function compareFilters(a: PipelineRunReport | null, b: PipelineRunReport | null): FilterDiff[] {
  const names = [...(a?.filters ?? []), ...(b?.filters ?? [])].map((f) => f.name);
  const actionsA = actionsByFilter(a);
  const actionsB = actionsByFilter(b);
  return [...new Set(names)].map((name) => {
    let changedActions = 0;
    for (const [cardId, inA] of actionsA) {
      const inB = actionsB.get(cardId);
      if (inB && inA.get(name) !== inB.get(name)) changedActions++;
    }
    return {
      name,
      a: a?.filters.find((f) => f.name === name),
      b: b?.filters.find((f) => f.name === name),
      changedActions,
    };
  });
}

function rollupByTag(
  rankedA: RunReportCardLike[],
  rankedB: RunReportCardLike[],
  cards: Map<string, CardComparison>,
  includeTag: (tag: string) => boolean,
): TagRollup[] {
  const acc = new Map<string, { selectedA: number; selectedB: number; multA: number[]; multB: number[] }>();
  const bucket = (tag: string) => {
    let t = acc.get(tag);
    if (!t) acc.set(tag, (t = { selectedA: 0, selectedB: 0, multA: [], multB: [] }));
    return t;
  };
  const tagsOf = new Map<string, string[]>();
  for (const c of [...rankedA, ...rankedB]) {
    if (!tagsOf.has(c.cardId)) tagsOf.set(c.cardId, (c.tags ?? []).filter(includeTag));
  }
  for (const [cardId, tags] of tagsOf) {
    const x = cards.get(cardId)!;
    for (const tag of tags) {
      const t = bucket(tag);
      if (x.selectedA) t.selectedA++;
      if (x.selectedB) t.selectedB++;
      if (x.multA !== undefined && x.multB !== undefined) {
        t.multA.push(x.multA);
        t.multB.push(x.multB);
      }
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : undefined);
  const multShift = (t: TagRollup) => Math.abs((t.meanMultB ?? 0) - (t.meanMultA ?? 0));
  return [...acc.entries()]
    .map(([tag, t]) => ({
      tag,
      shared: t.multA.length,
      selectedA: t.selectedA,
      selectedB: t.selectedB,
      meanMultA: mean(t.multA),
      meanMultB: mean(t.multB),
    }))
    .sort(
      (x, y) =>
        Math.abs(y.selectedB - y.selectedA) - Math.abs(x.selectedB - x.selectedA) || multShift(y) - multShift(x),
    );
}
