/**
 * simulate-curriculum — a "typical learner" through the live curriculum.
 *
 * Feeds the public /curriculum page: when each lesson opens and the order in
 * which facts (GPCs) arrive, for learners aged 2–5 who answer most cards
 * correctly and do one session a day. Real learner data is too sparse and too
 * old against the current curriculum to show this, so we simulate it.
 *
 * What it reads (so curriculum changes flow through on regen):
 *   - content/phoneticAnalytics/outputs-v2/generated-cards.json   (the cards)
 *   - …/strategy-configs/hierarchy-{gpc,concept,ui}.json         (gates + boosts)
 *   - …/strategy-configs/priority.json                           (tag priorities)
 *   - src/services/lessons.ts getNextLesson                      (lesson availability, real)
 *   - lib/curriculum.ts                                          (lesson gating, seed cards)
 *   - lib/card-elo.ts computeInitialElo                          (card difficulty)
 *   - src/services/sessionLengthPolicy.ts                        (session minutes by age)
 *
 * What it models (mechanism-level — a mirror of the pipeline, not the
 * pipeline itself; when those mechanisms change, update this file):
 *   - Lesson gate: a card bearing a concept tag of an unpassed lesson (or
 *     concept:unassigned) is out. hello-world counts as passed for gating.
 *   - Hierarchy gates (gpc + concept + ui): a card is out while any of its tags
 *     has an unmet prerequisite. Tag ELO is approximated by the learner's
 *     global ELO. preReqBoost / targetBoost multiply as configured.
 *   - Letter gating: spelling needs every letter of the word unlocked; missing
 *     letters needs its blanked letters unlocked.
 *   - Card choice: ELO distance (Gaussian, halfLife 300) × priority boost ×
 *     hierarchy boosts × post-intro practice boost × a [0.5, 1] jitter (the
 *     ELO generator's variety). New cards and due reviews (doubling interval
 *     on success) compete together; no card twice in a session.
 *   - Intros: an intro-core target (its list read from deploy-content.ts)
 *     surfaces once its gates pass and its expose tag has count ≥ 3; ties go
 *     to list order. Any intro card can also arrive through the ELO generator
 *     while the learner's ELO is within ELO_WINDOW of intro ELO (1000) —
 *     that's how s, which needs no exposure, comes first; an intro no group
 *     lists (c-intro-o-AO) has only that path. Blocked targets among the first 4 pending get support
 *     (their unmet prereq tags ×SUPPORT_BOOST). Sight-word intros follow
 *     dripRank, at most one per session. After any intro, the next intro waits
 *     for INTRO_COOLDOWN successful answers (introBackoff: 0.1 relaxed ×2 per
 *     success); the intro's follow-up cards run next and its exercise tag gets
 *     a ×10 boost that halves on each success (conceptBackoff, roughly).
 *   - Reviews and retries: once the learner has seen REVIEW_RAMP_CARDS cards,
 *     a REVIEW_SHARE_MAX share of slots goes to cards seen before (due ones
 *     first); a missed card comes back RETRY_AFTER slots later, at most twice.
 *   - Lessons: at session start, getNextLesson() with synthetic state; the
 *     lesson's POST_LESSON_SEED_CARDS run first in that session's practice.
 *
 * Session length: the app's auto policy (2 minutes, ramping to the child's
 * age in minutes over the first 20 sessions, capped at 6) × CARDS_PER_MINUTE
 * (3.2: a 5-year-old manages 12–20 cards in 5 minutes). The same rate at
 * every age, for want of data.
 *
 * Not modelled: interference, skill staleness, regulators, prescribed's
 * escalating pressure, the free-tier wall (we assume a paying learner),
 * per-tag ELO, any difference between ages beyond session length.
 *
 * Learner: answers by a latent skill (Elo expectation against the card's
 * seed ELO) that grows with practice (per card answered); the recorded ELO
 * tracks it. Defaults (skill 1500, +0.5/card) give ~85% accuracy early, ~65%
 * once spelling dominates. (A fixed accuracy lets this model's ELO run away into
 * spelling-only sessions, which carry no exposure tags, so intros starve. A
 * model artifact: prod's regulators keep spelling from taking over a session
 * and prescribed pressure on stale intros escalates; neither is modelled.)
 *
 * Output: src/content/curriculumSim.generated.json (deterministic: seeded
 * runs, no timestamp) — fact display data once, then per age the median
 * session of each lesson opening and fact arrival over RUNS seeds, and the
 * words readable by the end of each session — plus a console summary and one
 * age's timeline.
 * SIM_DEBUG=1 prints the first run's per-session ELO, accuracy and card mix.
 *
 * Usage (from letterspractice/):  npx tsx scripts/simulate-curriculum.ts
 *   --runs N  --rate cards/min  --skill ELO  --growth ELO/card  --reviews share
 *   --minutes N (fixed sessions)  --sessions N  --seed N  --age N (timeline to print)  --quiet
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { getNextLesson, LESSON_CATALOG } from '../src/services/lessons';
import type { LessonProgressState } from '../src/services/lessons.types';
import {
  GPC_CATALOGUE,
  LESSON_REGISTRY,
  POST_LESSON_SEED_CARDS,
  assignmentFor,
  introGatedBy,
  lessonGatedConceptTags,
} from '../src/services/curriculum';
import { computeAutoSessionMinutes } from '../src/services/sessionLengthPolicy';
import { computeInitialElo, gpcSpellingOdds } from '../content/phoneticAnalytics/lib/card-elo';
import {
  digraphGpcIntroCardId,
  gpcIntroCardId,
  splitDigraphIntroCardId,
  whoSaidThatCardId,
} from '../content/phoneticAnalytics/lib/content-labelling';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PA = resolve(__dirname, '../content/phoneticAnalytics/outputs-v2');
const OUT = resolve(__dirname, '../src/content/curriculumSim.generated.json');
const WORD_TABLE = resolve(__dirname, '../src/services/reachableWords/reachable-words.generated.json');
const DEPLOY_CONTENT = resolve(__dirname, '../content/phoneticAnalytics/scripts/deploy-content.ts');

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}

const PARAMS = {
  runs: arg('runs', 9),
  ages: [2, 3, 4, 5],
  cardsPerMinute: arg('rate', 3.2),
  /** Latent skill (ELO units) at the start, and its growth per card answered */
  skillStart: arg('skill', 1500),
  skillPerCard: arg('growth', 0.5),
  maxSessions: arg('sessions', 400),
  /** Fixed session minutes (the app's manual mode); 0 = the auto policy by age */
  manualMinutes: arg('minutes', 0),
  /** Share of a session that goes to reviews once the learner has seen enough cards */
  reviewShare: arg('reviews', 0.7),
  seed: arg('seed', 1),
  userEloStart: 1000,
  eloK: 16,
};
const QUIET = process.argv.includes('--quiet');
const PRINT_AGE = arg('age', 3);

const ELO_HALF_LIFE = 300;
const ELO_MIN_MULT = 0.05;
const INTRO_COOLDOWN = 4; // successes to clear the intro discourage (0.1 ×2⁴ ≥ 1)
const PRACTICE_BOOST = 10;
const SUPPORT_BOOST = 1.5;
const MAX_DIRECT_TARGETS = 4;
const HIERARCHY_DEFAULT_MIN_COUNT = 3;
const INTRO_EXPOSE_MIN = 3; // prescribed DEFAULT_MIN_COUNT (intro-core sets no override)
const INTRO_CARD_ELO = 1000;
// Reviews and retries. The one long real history (the first user, Jun–Oct
// 2026) ran ~80–90% reviews once ~150 distinct cards had been seen — but
// that was a worst case (a review loop on too many exposed weak skills, with
// no lesson 5 to open more), since tuned out of the app and framework. The
// default share is a moderate guess; --reviews sets it.
const REVIEW_SHARE_MAX = PARAMS.reviewShare;
const REVIEW_RAMP_CARDS = 150;
const RETRY_AFTER = 3; // slots until a missed card comes back
const MAX_RETRIES = 2;
/** The ELO generator only retrieves cards near the learner's ELO */
const ELO_WINDOW = 100;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

interface RawCard {
  _id: string;
  questionType: string;
  data: Record<string, unknown>;
  tags: string[];
  meta?: { dripRank?: number };
}

interface Prereq {
  tag: string;
  masteryThreshold?: { minCount?: number; minElo?: number };
  preReqBoost?: number;
  targetBoost?: number;
}

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf-8'));

const rawCards: RawCard[] = readJson(resolve(PA, 'generated-cards.json')).cards;

const prereqs = new Map<string, Prereq[]>();
for (const f of ['hierarchy-gpc.json', 'hierarchy-concept.json', 'hierarchy-ui.json']) {
  const doc = readJson(resolve(PA, 'strategy-configs', f));
  for (const [tag, list] of Object.entries(doc.prerequisites as Record<string, Prereq[]>)) {
    prereqs.set(tag, [...(prereqs.get(tag) ?? []), ...list]);
  }
}

const priorityDoc = readJson(resolve(PA, 'strategy-configs', 'priority.json'));
const tagPriorities: Record<string, number> = priorityDoc.tagPriorities;
const priorityInfluence: number = priorityDoc.priorityInfluence ?? 0.15;
const defaultPriority: number = priorityDoc.defaultPriority ?? 0.5;

const corpusWords: { word: string; frequency: number; gpcs: string[] }[] = readJson(
  resolve(PA, 'corpus-words.json'),
).words;
const wordFrequency = new Map(corpusWords.map((w) => [w.word, w.frequency]));
const wordGpcs = new Map(corpusWords.map((w) => [w.word, w.gpcs.map((g) => g.replace(/^GPC-/, ''))]));

const parseList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/\s+/).filter(Boolean) : [];

// ---------------------------------------------------------------------------
// Cards, precomputed
// ---------------------------------------------------------------------------

type IntroKind = 'letter' | 'digraph' | 'split' | 'sight';

interface SimCard {
  id: string;
  type: string;
  tags: string[];
  elo: number;
  /** Letters that must be unlocked keycaps (letter gating) */
  gateLetters: string;
  intro?: IntroKind;
  /** Short GPC ids this card introduces / exercises */
  introGpcs: string[];
  exerciseGpcs: string[];
  /** Graphemes written to unlockedLetters when this intro completes */
  unlocks: string[];
  followUp: string[];
  dripRank: number;
  priorityMult: number;
  gatedConcepts: string[];
}

const INTRO_KIND: Record<string, IntroKind> = {
  GpcIntro: 'letter',
  DigraphGpcIntro: 'digraph',
  SplitDigraphIntro: 'split',
  SightWordIntro: 'sight',
};

const GATED = lessonGatedConceptTags();
const cardIds = new Set(rawCards.map((c) => c._id));
const eloRng = mulberry32(12345);
// Same seed model as deploy-content, ambiguity term included.
const seedContext = { spellingOdds: gpcSpellingOdds(readJson(resolve(PA, 'teaching-words.json')).words) };

function gateLettersFor(c: RawCard): string {
  const word = String(c.data.word ?? '');
  if (c.questionType === 'SpellingQuestion') return word;
  if (c.questionType === 'MissingLetters') {
    return String(c.data.blanks ?? '')
      .split(',')
      .map(Number)
      .map((i) => word[i] ?? '')
      .join('');
  }
  return '';
}

function unlocksFor(c: RawCard): string[] {
  switch (c.questionType) {
    case 'GpcIntro':
      return [String(c.data.letter)];
    case 'DigraphGpcIntro':
      return c.data.grapheme === 'qu' ? ['qu', 'q'] : [String(c.data.grapheme)];
    case 'SplitDigraphIntro':
      return [`${c.data.vowel}_e`];
    case 'SightWordIntro':
      return [String(c.data.word), ...parseList(c.data.family)];
    default:
      return [];
  }
}

const cards: SimCard[] = rawCards.map((c) => {
  const kind = INTRO_KIND[c.questionType];
  const shortOf = (prefix: string) =>
    c.tags.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
  const introGpcs = shortOf('gpc:intro:');
  let followUp: string[] = [];
  if (kind === 'sight') followUp = parseList(c.data.followUp);
  else if (kind) {
    const wst = whoSaidThatCardId(`GPC-${introGpcs[0]}`);
    if (cardIds.has(wst)) followUp = [wst];
  }
  const pris = c.tags.map((t) => tagPriorities[t]).filter((p): p is number => p !== undefined);
  const p = pris.length ? Math.max(...pris) : defaultPriority;
  return {
    id: c._id,
    type: c.questionType,
    tags: c.tags,
    elo: computeInitialElo(c, eloRng, seedContext),
    gateLetters: gateLettersFor(c),
    intro: kind,
    introGpcs,
    exerciseGpcs: shortOf('gpc:exercise:'),
    unlocks: unlocksFor(c),
    followUp,
    dripRank: c.meta?.dripRank ?? 0,
    priorityMult: 1 + (p - 0.5) * priorityInfluence,
    gatedConcepts: c.tags.filter((t) => GATED.has(t)),
  };
});

const byId = new Map(cards.map((c) => [c.id, c]));

/**
 * intro-core's targetCardIds, in order, read from deploy-content.ts (they're
 * authored inline there). Fails loudly if that block changes shape.
 */
function introCoreTargets(): string[] {
  const src = readFileSync(DEPLOY_CONTENT, 'utf-8');
  const start = src.indexOf('id: "intro-core"');
  const listStart = src.indexOf('targetCardIds: [', start);
  const listEnd = src.indexOf('],', listStart);
  const builders: Record<string, (gpcId: string) => string> = {
    gpcIntroCardId,
    digraphGpcIntroCardId,
    splitDigraphIntroCardId,
  };
  const ids: string[] = [];
  for (const line of src.slice(listStart, listEnd).split('\n')) {
    if (line.trim().startsWith('//')) continue;
    const m = line.match(/(\w+IntroCardId)\(asGpcId\("([^"]+)"\)\)/);
    if (m && builders[m[1]]) ids.push(builders[m[1]](m[2]));
  }
  if (start < 0 || ids.length < 20) {
    throw new Error('intro-core targets not found in deploy-content.ts — update introCoreTargets()');
  }
  return ids;
}

const coreTargetIds = introCoreTargets();
const coreRank = new Map(coreTargetIds.map((id, i) => [id, i]));
// Listed targets in list order, then intro cards no group lists (ELO path only)
const coreIntros = [
  ...coreTargetIds.map((id) => byId.get(id)).filter((c): c is SimCard => !!c),
  ...cards.filter((c) => c.intro && c.intro !== 'sight' && !coreRank.has(c.id)),
];
const sightIntros = cards.filter((c) => c.intro === 'sight').sort((a, b) => a.dripRank - b.dripRank);
const exerciseCards = cards.filter((c) => !c.intro);

// Lesson of a GPC (short id), and which GPCs have an intro card at all
const lessonOfGpc = new Map<string, string>();
for (const entry of GPC_CATALOGUE) {
  const a = assignmentFor(entry);
  // A lesson standing in front of the GPC's intro card claims it for display
  // (b under the bed lesson, though b is a hello-world letter)
  if (a) lessonOfGpc.set(entry.id.replace(/^GPC-/, ''), introGatedBy(entry.id) ?? a.unlockedBy);
}
// Prototype mastery gating (--mastery): see masteryNext() in simulate()
const MASTERY = process.argv.includes('--mastery');
const SECURE_WINDOW = arg('window', 6);
const SECURE_MIN = arg('min', 5);
const DEBT_CAP = arg('debt', 8);
const SPACER_FLOOR = arg('spacer', 2);
const slateOfGpc = new Map<string, string>();
for (const entry of GPC_CATALOGUE) {
  const a = assignmentFor(entry);
  if (a) slateOfGpc.set(entry.id.replace(/^GPC-/, ''), a.unlockedBy);
}
const MASTERY_RULES: Record<string, { lesson: string; count: number }[] | undefined> = {
  digraphs: [{ lesson: 'hello-world', count: arg('hw1', 13) }],
  'split-digraphs': [
    { lesson: 'hello-world', count: arg('hw2', 18) },
    { lesson: 'digraphs', count: 3 },
  ],
  'final-open-vowels': [{ lesson: 'split-digraphs', count: arg('sd', 4) }],
  'sight-words': [{ lesson: 'hello-world', count: arg('hw3', 20) }],
};
const introducedByCard = new Set(cards.flatMap((c) => c.introGpcs));
const catalogueEntry = new Map(GPC_CATALOGUE.map((e) => [e.id.replace(/^GPC-/, ''), e]));

const liveLessons = new Set(LESSON_CATALOG.map((l) => l.id as string));
/** Spelled entirely with the live lessons' regular patterns (no weird words, no later lessons) */
const plainLiveWord = (w: string) =>
  (wordGpcs.get(w) ?? ['?']).every((g) => !g.startsWith('WORD-') && liveLessons.has(lessonOfGpc.get(g) ?? ''));

/**
 * Up to three of a fact's most frequent recorded words (from the cards that
 * exercise it), preferring words a learner of the live lessons could read.
 */
function examplesFor(gpc: string): string[] {
  if (gpc.startsWith('WORD-')) return [gpc.slice(5)];
  const words = new Set<string>();
  for (const c of rawCards) {
    const w = (c.meta as { sourceWord?: string } | undefined)?.sourceWord;
    // The word must contain the fact (a word-choice card's source can be its foil)
    if (w && c.tags.includes(`gpc:exercise:${gpc}`) && wordGpcs.get(w)?.includes(gpc)) words.add(w);
  }
  const ranked = [...words].sort((a, b) => (wordFrequency.get(b) ?? 0) - (wordFrequency.get(a) ?? 0));
  const plain = ranked.filter(plainLiveWord);
  return (plain.length ? plain : ranked).slice(0, 3);
}
const conceptsOfLesson = new Map(LESSON_REGISTRY.map((l) => [l.id as string, l.gatesConcepts as readonly string[]]));

// ---------------------------------------------------------------------------
// One learner
// ---------------------------------------------------------------------------

interface FactEvent {
  gpc: string;
  lesson: string;
  /** intro: met through its intro card; released: first practised (no intro card) */
  kind: 'intro' | 'released';
  session: number;
  order: number;
}

interface RunResult {
  lessons: { id: string; session: number }[];
  facts: FactEvent[];
  sessions: number;
}

function cardsForSession(age: number, session: number): number {
  const minutes = PARAMS.manualMinutes || computeAutoSessionMinutes(age, session - 1);
  return Math.max(2, Math.round(minutes * PARAMS.cardsPerMinute));
}

function simulate(seed: number, age: number): RunResult {
  const rng = mulberry32(seed);
  const counts = new Map<string, number>();
  const count = (t: string) => counts.get(t) ?? 0;
  const bump = (tags: string[]) => tags.forEach((t) => counts.set(t, count(t) + 1));
  let userElo = PARAMS.userEloStart;
  const passed = new Set<string>();
  const unlocked: string[] = [];
  const introsDone = new Set<string>();
  const srs = new Map<string, { due: number; interval: number }>();
  const lessons: RunResult['lessons'] = [];
  const facts: FactEvent[] = [];
  const factSeen = new Set<string>();
  let sessionsSinceLastLesson = 0;
  const progress = (): LessonProgressState => ({
    completedLessons: [...passed],
    dismissedLessons: [],
    currentLesson: null,
    skippedCount: 0,
    lastSkippedAt: null,
    postLessonPracticeFlag: null,
    sessionsSinceLastLesson,
    updatedAt: '',
  });

  const letterSet = () => new Set(unlocked.filter((g) => g.length === 1));
  const lessonOpen = (c: SimCard) =>
    c.gatedConcepts.every((t) =>
      [...passed, 'hello-world'].some((id) => conceptsOfLesson.get(id)?.includes(t)),
    );
  const prereqMet = (p: Prereq) => {
    const th = p.masteryThreshold ?? {};
    if (count(p.tag) < (th.minCount ?? HIERARCHY_DEFAULT_MIN_COUNT)) return false;
    return th.minElo === undefined || userElo >= th.minElo;
  };
  const tagOpen = (t: string) => (prereqs.get(t) ?? []).every(prereqMet);
  const hierarchyOpen = (c: SimCard) => c.tags.every(tagOpen);

  const record = (gpcs: string[], kind: FactEvent['kind'], session: number) => {
    for (const gpc of gpcs) {
      if (factSeen.has(gpc)) continue;
      factSeen.add(gpc);
      facts.push({ gpc, lesson: lessonOfGpc.get(gpc) ?? 'unassigned', kind, session, order: facts.length });
    }
  };

  // ---- Prototype: competence-bound availability (agent/mastery-gating/a.1.plan.md) ----
  // A GPC is "secure" when its last SECURE_WINDOW first attempts hold at least
  // SECURE_MIN correct, over at least two sessions. Lessons open on counts of
  // secure GPCs in the prerequisite slates, and wait while too many met GPCs
  // are not yet secure (debt).
  let sessionNow = 0;
  const recent = new Map<string, { ok: boolean; session: number }[]>();
  const pushRecent = (gpcs: string[], ok: boolean) => {
    for (const g of gpcs) {
      const buf = recent.get(g) ?? [];
      buf.push({ ok, session: sessionNow });
      if (buf.length > 12) buf.shift();
      recent.set(g, buf);
    }
  };
  const secure = (g: string) => {
    const buf = (recent.get(g) ?? []).slice(-SECURE_WINDOW);
    if (buf.length < SECURE_WINDOW) return false;
    if (buf.filter((e) => e.ok).length < SECURE_MIN) return false;
    return new Set(buf.filter((e) => e.ok).map((e) => e.session)).size >= 2;
  };
  const secureFrom = (lesson: string) => [...recent.keys()].filter((g) => slateOfGpc.get(g) === lesson && secure(g)).length;
  const debt = () => [...recent.keys()].filter((g) => !g.startsWith('WORD-') && !secure(g)).length;
  const masteryNext = (tagElo: Record<string, { score: number; count: number }>) => {
    for (const lesson of LESSON_CATALOG) {
      if (passed.has(lesson.id)) continue;
      if (!(lesson.prerequisites ?? []).every((p) => passed.has(p))) continue;
      const rule = MASTERY_RULES[lesson.id];
      if (rule === undefined) {
        // unchanged lessons (hello-world, bed): today's conditions
        const today = getNextLesson({ progress: progress(), tagElo, unlockedLetterCount: unlocked.length, unlockedGraphemes: unlocked, sessionsSinceLastLesson });
        if (today?.id === lesson.id) return today;
        continue;
      }
      if (sessionsSinceLastLesson < SPACER_FLOOR) continue;
      if (!rule.every((r) => secureFrom(r.lesson) >= r.count)) continue;
      if (DEBT_CAP > 0 && debt() > DEBT_CAP) continue;
      if (process.env.SIM_DEBUG && seed === PARAMS.seed && age === PRINT_AGE)
        console.log(`  >> ${lesson.id} opens s${sessionNow}: debt=${debt()} secure hw=${secureFrom('hello-world')} dg=${secureFrom('digraphs')} sd=${secureFrom('split-digraphs')}`);
      return lesson;
    }
    return null;
  };

  let lastEventSession = 0;
  let answered = 0;
  let right = 0;
  for (let session = 1; session <= PARAMS.maxSessions; session++) {
    // ---- Lesson at session start ----
    const queue: string[] = [];
    const tagElo: Record<string, { score: number; count: number }> = {};
    for (const [t, n] of counts) tagElo[t] = { score: userElo, count: n };
    sessionNow = session;
    const next = MASTERY
      ? masteryNext(tagElo)
      : getNextLesson({
          progress: progress(),
          tagElo,
          unlockedLetterCount: unlocked.length,
          unlockedGraphemes: unlocked,
          sessionsSinceLastLesson,
        });
    if (next) {
      passed.add(next.id);
      lessons.push({ id: next.id, session });
      sessionsSinceLastLesson = 0;
      queue.push(...(POST_LESSON_SEED_CARDS[next.id as keyof typeof POST_LESSON_SEED_CARDS] ?? []));
      lastEventSession = session;
    }

    // ---- Practice ----
    const shown = new Set<string>();
    const retries: { id: string; at: number; retry: number }[] = [];
    let slotNow = 0;
    let newThisSession = 0;
    const practiceBoost = new Map<string, number>();
    let cooldown = 0;
    let sightIntroDone = false;
    let eligible: SimCard[] = [];
    let boosts = new Map<string, number>();
    let dirty = true;

    const refresh = () => {
      const letters = letterSet();
      eligible = exerciseCards.filter(
        (c) =>
          lessonOpen(c) &&
          hierarchyOpen(c) &&
          [...c.gateLetters].every((ch) => letters.has(ch)),
      );
      boosts = new Map();
      for (const [gated, list] of prereqs) {
        if (tagOpen(gated)) continue;
        for (const p of list) {
          if (p.preReqBoost && p.preReqBoost > 1 && !prereqMet(p)) {
            boosts.set(p.tag, Math.max(boosts.get(p.tag) ?? 1, p.preReqBoost));
          }
        }
      }
      // Support for blocked intro-core targets among the first few pending
      const pending = coreIntros.filter((c) => !introsDone.has(c.id)).slice(0, MAX_DIRECT_TARGETS);
      for (const c of pending) {
        for (const t of c.tags) {
          for (const p of prereqs.get(t) ?? []) {
            if (!prereqMet(p)) boosts.set(p.tag, Math.max(boosts.get(p.tag) ?? 1, SUPPORT_BOOST));
          }
        }
      }
      dirty = false;
    };

    // Two ways in: the prescribed group (listed target, its expose tag seen
    // ≥3 times), or the ELO generator while the learner is near intro ELO
    // (how s, which needs no exposure, arrives first)
    const introReady = (c: SimCard) => {
      if (introsDone.has(c.id) || !lessonOpen(c) || !hierarchyOpen(c)) return false;
      if (c.intro === 'sight') return true;
      const prescribed =
        coreRank.has(c.id) && c.introGpcs.every((g) => count(`gpc:expose:${g}`) >= INTRO_EXPOSE_MIN);
      return prescribed || Math.abs(userElo - INTRO_CARD_ELO) <= ELO_WINDOW;
    };

    const targetBoost = (c: SimCard) => {
      let b = 1;
      for (const t of c.tags) {
        if (!tagOpen(t)) continue;
        for (const p of prereqs.get(t) ?? []) if (p.targetBoost && p.targetBoost > b) b = p.targetBoost;
      }
      return b;
    };

    const completeIntro = (c: SimCard) => {
      introsDone.add(c.id);
      shown.add(c.id);
      bump(c.tags);
      for (const g of c.unlocks) if (!unlocked.includes(g)) unlocked.push(g);
      record(c.introGpcs, 'intro', session);
      queue.push(...c.followUp.filter((id) => byId.has(id)));
      if (c.intro === 'sight') sightIntroDone = true;
      else for (const g of c.introGpcs) practiceBoost.set(`gpc:exercise:${g}`, PRACTICE_BOOST);
      cooldown = INTRO_COOLDOWN;
      lastEventSession = session;
      dirty = true;
    };

    const answer = (c: SimCard, retry = 0) => {
      shown.add(c.id);
      const expected = 1 / (1 + 10 ** ((c.elo - userElo) / 400));
      // The learner answers by latent skill (Elo expectation), so harder cards
      // are missed more often and the recorded ELO tracks the skill
      const skill = PARAMS.skillStart + PARAMS.skillPerCard * answered;
      const correct = rng() < 1 / (1 + 10 ** ((c.elo - skill) / 400));
      answered++;
      if (retry === 0) {
        // Prod grades spelling per grapheme: a missed card is a miss on one of its GPCs, not all
        if (correct || c.exerciseGpcs.length < 2) pushRecent(c.exerciseGpcs, correct);
        else {
          const miss = c.exerciseGpcs[Math.floor(rng() * c.exerciseGpcs.length)];
          pushRecent([miss], false);
          pushRecent(c.exerciseGpcs.filter((g) => g !== miss), true);
        }
      }
      if (correct) right++;
      userElo += PARAMS.eloK * ((correct ? 1 : 0) - expected);
      bump(c.tags);
      const s = srs.get(c.id);
      if (!s) newThisSession++;
      const interval = correct ? Math.max(1, (s?.interval ?? 0) * 2) : 1;
      srs.set(c.id, { due: session + interval, interval });
      const fresh = c.exerciseGpcs.filter((g) => !introducedByCard.has(g));
      if (fresh.some((g) => !factSeen.has(g))) lastEventSession = session;
      record(fresh, 'released', session);
      if (!correct && retry < MAX_RETRIES) retries.push({ id: c.id, at: slotNow + RETRY_AFTER, retry: retry + 1 });
      if (correct) {
        cooldown = Math.max(0, cooldown - 1);
        for (const t of c.tags) {
          const b = practiceBoost.get(t);
          if (b === undefined) continue;
          if (b / 2 <= 1.5) practiceBoost.delete(t);
          else practiceBoost.set(t, b / 2);
        }
      }
      if (c.exerciseGpcs.length || c.tags.some((t) => t.startsWith('gpc:expose:'))) dirty = true;
    };

    const slots = cardsForSession(age, session);
    for (let slot = 0; slot < slots; slot++) {
      slotNow = slot;
      // A missed card coming back
      const due = retries.findIndex((r) => r.at <= slot);
      if (due >= 0) {
        const [r] = retries.splice(due, 1);
        answer(byId.get(r.id)!, r.retry);
        continue;
      }

      // Required cards (seed / follow-ups) bypass the filters
      const req = queue.shift();
      if (req !== undefined) {
        const c = byId.get(req);
        if (c && !shown.has(c.id) && !(c.intro && introsDone.has(c.id))) {
          if (c.intro) completeIntro(c);
          else answer(c);
          continue;
        }
      }

      // An intro, if one is ready and the back-off has cleared
      if (cooldown === 0) {
        const ready = [
          ...coreIntros.filter(introReady),
          ...(sightIntroDone ? [] : sightIntros.filter(introReady).slice(0, 1)),
        ];
        if (ready.length) {
          // Highest targetBoost wins; ties keep target-list order (stable sort)
          ready.sort((a, b) => targetBoost(b) - targetBoost(a));
          completeIntro(ready[0]);
          continue;
        }
      }

      if (dirty) refresh();
      // Review or new: reviews take a growing share as the learner's seen pool grows
      const reviewShare = REVIEW_SHARE_MAX * Math.min(1, srs.size / REVIEW_RAMP_CARDS);
      const wantReview = rng() < reviewShare;
      let best: SimCard | null = null;
      let bestScore = -1;
      for (const pass of wantReview ? [true, false] : [false, true]) {
        for (const c of eligible) {
          if (shown.has(c.id)) continue;
          const s = srs.get(c.id);
          if (!!s !== pass) continue;
          const d = c.elo - userElo;
          const eloMult = ELO_MIN_MULT + (1 - ELO_MIN_MULT) * Math.exp(-((d / ELO_HALF_LIFE) ** 2));
          let boost = 1;
          let practice = 1;
          for (const t of c.tags) {
            boost = Math.max(boost, boosts.get(t) ?? 1);
            practice = Math.max(practice, practiceBoost.get(t) ?? 1);
          }
          const overdue = s && s.due > session ? 0.3 : 1;
          const score = eloMult * c.priorityMult * boost * practice * overdue * (0.5 + 0.5 * rng());
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (best) break;
      }
      if (!best) break;
      answer(best);
    }

    if (process.env.SIM_DEBUG && seed === PARAMS.seed && age === PRINT_AGE) {
      const mix: Record<string, number> = {};
      for (const id of shown) mix[byId.get(id)!.type] = (mix[byId.get(id)!.type] ?? 0) + 1;
      console.log(`s${session} new=${newThisSession} elo=${Math.round(userElo)} acc=${(right / answered).toFixed(2)} eligible=${eligible.length} unlocked=${unlocked.length} ${JSON.stringify(mix)}`);
    }
    sessionsSinceLastLesson++;
    // Done once everything active is in and nothing new has happened for a while
    const activeLeft = LESSON_CATALOG.some((l) => !passed.has(l.id));
    if (!activeLeft && session - lastEventSession >= 10) {
      return { lessons, facts, sessions: session };
    }
  }
  return { lessons, facts, sessions: PARAMS.maxSessions };
}

// ---------------------------------------------------------------------------
// Runs → medians
// ---------------------------------------------------------------------------

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(age: number) {
  const results = Array.from({ length: PARAMS.runs }, (_, i) => simulate(PARAMS.seed + i, age));
  const lessons = LESSON_CATALOG.map((l) => {
    const sessions = results
      .map((r) => r.lessons.find((x) => x.id === l.id)?.session)
      .filter((s): s is number => !!s);
    return {
      id: l.id,
      reachedIn: `${sessions.length}/${PARAMS.runs}`,
      session: sessions.length ? median(sessions) : null,
      range: sessions.length ? [Math.min(...sessions), Math.max(...sessions)] : null,
    };
  });
  const gpcs = [...new Set(results.flatMap((r) => r.facts.map((f) => f.gpc)))];
  const facts = gpcs
    .map((gpc) => {
      const evs = results.map((r) => r.facts.find((f) => f.gpc === gpc)).filter((e): e is FactEvent => !!e);
      return {
        gpc,
        reached: evs.length,
        session: median(evs.map((e) => e.session)),
        order: median(evs.map((e) => e.order)),
        lesson: evs[0].lesson,
        kind: evs[0].kind,
      };
    })
    // Only facts most runs reach — the rest is noise at the far tail
    .filter((f) => f.reached * 2 > PARAMS.runs)
    .sort((a, b) => a.session - b.session || a.order - b.order);
  const minutes = [1, 21].map((s) => computeAutoSessionMinutes(age, s - 1));
  return {
    age,
    sessionMinutes: minutes,
    sessionCards: [1, 21].map((s) => cardsForSession(age, s)),
    sessionsRun: median(results.map((r) => r.sessions)),
    lessons,
    facts,
    readable: readableBySession(facts),
  };
}

/**
 * Words a learner could sound out at the end of each session (index 0 =
 * session 1), from the facts met so far at their (rounded, as the page shows
 * them) median sessions: a word counts once every GPC it needs has been met.
 * The entitlement counter's predicate (introduced, not mastered:
 * freeSlateCount.ts), over the full reachable-words table rather than the
 * free slate, so split digraphs, final vowels and sight words count too.
 *
 * Base words only. An inflection — the base plus a final /s z t d/, spelt +s,
 * +es, +d or +ed (hugged: a doubled consonant) — counts with its base, not as
 * a word of its own; otherwise s as /z/ (dogs, hands, things) looked like 267
 * new words at once. Judged by sound, so *his* isn't *hi* + s. A little
 * conservative (a few forms stay counted), and *news* folds into *new*.
 */
const teachingPhonemes = new Map(
  (JSON.parse(readFileSync(resolve(PA, 'teaching-words.json'), 'utf8')) as {
    words: { word: string; phonemes: string[] }[];
  }).words.map((w) => [w.word, w.phonemes]),
);
const tableRows = (JSON.parse(readFileSync(WORD_TABLE, 'utf8')) as { words: { w: string; g: string[] }[] }).words;
const inTable = new Set(tableRows.map((r) => r.w));
const INFLECTIONS: [suffix: string, endSounds: string[]][] = [
  ['s', ['S', 'Z']],
  ['es', ['S', 'Z']],
  ['d', ['D', 'T']],
  ['ed', ['D', 'T']],
];
function isInflection(word: string): boolean {
  const p = teachingPhonemes.get(word);
  if (!p) return false;
  for (const [suffix, ends] of INFLECTIONS) {
    if (!word.endsWith(suffix) || !ends.includes(p[p.length - 1])) continue;
    const stem = word.slice(0, -suffix.length);
    const bases = suffix === 'ed' && /(.)\1$/.test(stem) ? [stem, stem.slice(0, -1)] : [stem];
    for (const base of bases) {
      const bp = teachingPhonemes.get(base);
      if (inTable.has(base) && bp?.length === p.length - 1 && bp.every((x, i) => x === p[i])) return true;
    }
  }
  return false;
}
const wordRows = tableRows.filter((r) => !isInflection(r.w));
function readableBySession(facts: { gpc: string; session: number }[]): number[] {
  const at = (f: { session: number }) => Math.max(1, Math.round(f.session));
  const last = Math.max(0, ...facts.map(at));
  const out: number[] = [];
  for (let s = 1; s <= last; s++) {
    const met = new Set(facts.filter((f) => at(f) <= s).map((f) => `GPC-${f.gpc}`));
    out.push(wordRows.filter((w) => w.g.every((g) => met.has(g))).length);
  }
  return out;
}

const profiles = PARAMS.ages.map(summarize);

// Display data once per fact (whichever profile reached it)
const factInfo = new Map<string, { lesson: string; kind: FactEvent['kind'] }>();
for (const p of profiles) for (const f of p.facts) if (!factInfo.has(f.gpc)) factInfo.set(f.gpc, f);
const facts = [...factInfo].map(([gpc, f]) => {
  const entry = catalogueEntry.get(gpc);
  return {
    gpc,
    grapheme: entry?.grapheme ?? gpc,
    /** ARPAbet, space-separated for compounds; absent for whole words */
    phoneme: gpc.startsWith('WORD-') ? undefined : entry?.phoneme,
    examples: examplesFor(gpc),
    lesson: f.lesson,
    kind: f.kind,
  };
});

const out = {
  _generated: 'scripts/simulate-curriculum.ts — do not edit by hand',
  params: PARAMS,
  facts,
  profiles: profiles.map((p) => ({
    ...p,
    facts: p.facts.map(({ gpc, session, order }) => ({ gpc, session, order })),
  })),
};
if (!process.argv.includes("--no-write")) writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

if (!QUIET) {
  console.log(
    `\n${PARAMS.runs} runs per age · ${PARAMS.cardsPerMinute} cards/min · skill ${PARAMS.skillStart} +${PARAMS.skillPerCard}/card\n`,
  );
  const ids = LESSON_CATALOG.map((l) => l.id);
  console.log(`  age  minutes  cards   ${ids.map((id) => id.slice(0, 12).padStart(12)).join(' ')}   facts  last`);
  for (const p of profiles) {
    const last = p.facts.at(-1);
    console.log(
      `  ${String(p.age).padStart(3)}  ${p.sessionMinutes.join('→').padStart(7)}  ${p.sessionCards.join('→').padStart(5)}   ` +
        `${p.lessons.map((l) => String(l.session ?? '—').padStart(12)).join(' ')}   ${String(p.facts.length).padStart(5)}  s${last?.session}`,
    );
  }

  const p = profiles.find((x) => x.age === PRINT_AGE) ?? profiles[0];
  console.log(`\nAge ${p.age}: facts by median session (lesson openings inline):`);
  const opens = p.lessons
    .filter((l) => l.session !== null)
    .map((l) => ({ ...l, title: LESSON_CATALOG.find((c) => c.id === l.id)?.title }));
  let line = '';
  let lastSession = -1;
  const flush = () => line && console.log(line);
  for (const f of p.facts) {
    while (opens.length && opens[0].session! <= f.session) {
      flush();
      line = '';
      console.log(`  ── ${opens[0].title} opens (s${opens[0].session}) ──`);
      opens.shift();
      lastSession = -1;
    }
    if (f.session !== lastSession) {
      flush();
      line = `  s${String(f.session).padEnd(5)}`;
      lastSession = f.session;
    }
    line += ` ${f.gpc}${f.kind === 'released' ? '*' : ''}`;
  }
  flush();
  console.log(`\n  (* = no intro card; first practised)\n→ ${OUT}`);
}

// ---------------------------------------------------------------------------

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
