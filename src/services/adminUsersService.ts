/**
 * Learner diagnostics for the admin views (`/admin/users/:username/*`) and the
 * per-account DB tools (health probe, activity, `_design/reviewCards` repair).
 *
 * Reads the learner's own CouchDB database directly (via fetch, as
 * adminContentService does). Requires the `_admin` role on the active couch
 * session: the same gate as the /admin route guard.
 *
 * A deployment's business views (account lists, signups, paid access,
 * lifecycle email) live in its overlay (src/deployment/) and import from here.
 */
import type { TagScores } from './lessons/progress/types';
import { getCouchBaseUrl } from './usersDb';
import type { StudySessionDoc } from '@vue-skuilder/db';
import { getPhonetics } from './phonetics';
import { CARD_PREFIX_SPELLING, parseGpcTag } from './tags';
import { gradeSpelling, type SpellingGrade, type Verdict } from '../questions/spelling/grade';

// ============================================================
// Per-user DB health
// ============================================================

export interface UserDbHealth {
  username: string;
  dbName: string;
  dbExists: boolean;
  securityOk: boolean;
  hasReviewCards: boolean;
  reviewCardsQueryOk: boolean;
  /** Free-form error text from the first failure, if any. */
  error: string | null;
  /** Convenience — all four boolean checks passed. */
  healthy: boolean;
}

// ============================================================
// Per-user DB health
// ============================================================

/**
 * CouchDB per-user DB naming convention: `userdb-` + lowercase hex of the
 * username's UTF-8 bytes. Example: `Alice` → `userdb-416c696365`.
 */
export function usernameToDbName(username: string): string {
  const bytes = new TextEncoder().encode(username);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `userdb-${hex}`;
}

export function getUserDbUrl(username: string): string {
  const base = getCouchBaseUrl().replace(/\/+$/, '');
  return `${base}/${usernameToDbName(username)}`;
}

interface CouchSecurity {
  admins?: { names?: string[]; roles?: string[] };
  members?: { names?: string[]; roles?: string[] };
}

interface ReviewCardsDesignDoc {
  _id?: string;
  _rev?: string;
  views?: Record<string, { map?: string; reduce?: string }>;
}

export async function fetchUserDbHealthOne(username: string): Promise<UserDbHealth> {
  return probeUserDb(username);
}

async function probeUserDb(username: string): Promise<UserDbHealth> {
  const dbName = usernameToDbName(username);
  const dbUrl = getUserDbUrl(username);
  const result: UserDbHealth = {
    username,
    dbName,
    dbExists: false,
    securityOk: false,
    hasReviewCards: false,
    reviewCardsQueryOk: false,
    error: null,
    healthy: false,
  };

  // 1. DB exists?
  try {
    const res = await fetch(dbUrl, {
      method: 'HEAD',
      credentials: 'include',
    });
    if (!res.ok) {
      result.error = `DB ${res.status} ${res.statusText}`;
      return result;
    }
    result.dbExists = true;
  } catch (err) {
    result.error = `DB probe failed: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  // 2. _security non-empty & references the user
  try {
    const res = await fetch(`${dbUrl}/_security`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const sec = (await res.json()) as CouchSecurity;
      const memberNames = sec.members?.names ?? [];
      const memberRoles = sec.members?.roles ?? [];
      const adminNames = sec.admins?.names ?? [];
      // Healthy iff: user appears in members.names OR a non-empty members
      // collection exists (couch_peruser commonly puts the user in
      // admins.names instead — accept that too).
      const lcUser = username.toLowerCase();
      const userInMembers = memberNames.some((n) => n.toLowerCase() === lcUser);
      const userInAdmins = adminNames.some((n) => n.toLowerCase() === lcUser);
      const hasAnyMembers = memberNames.length + memberRoles.length > 0;
      result.securityOk = userInMembers || userInAdmins || hasAnyMembers;
      if (!result.securityOk && !result.error) {
        result.error = '_security empty (would 403 on user access)';
      }
    } else if (!result.error) {
      result.error = `_security ${res.status}`;
    }
  } catch (err) {
    if (!result.error) {
      result.error = `_security probe failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // 3. _design/reviewCards exists with a non-empty map fn
  try {
    const res = await fetch(`${dbUrl}/_design/reviewCards`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const doc = (await res.json()) as ReviewCardsDesignDoc;
      const map = doc.views?.reviewCards?.map;
      if (typeof map === 'string' && map.trim().length > 0) {
        result.hasReviewCards = true;
      } else if (!result.error) {
        result.error = '_design/reviewCards present but map fn is empty';
      }
    } else if (res.status === 404) {
      if (!result.error) result.error = '_design/reviewCards missing';
    } else if (!result.error) {
      result.error = `_design/reviewCards ${res.status}`;
    }
  } catch (err) {
    if (!result.error) {
      result.error = `_design/reviewCards probe failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // 4. View query actually runs (catches broken map fns even when present)
  if (result.hasReviewCards) {
    try {
      const res = await fetch(
        `${dbUrl}/_design/reviewCards/_view/reviewCards?limit=1`,
        { credentials: 'include', headers: { Accept: 'application/json' } },
      );
      if (res.ok) {
        result.reviewCardsQueryOk = true;
      } else if (!result.error) {
        result.error = `view query ${res.status}`;
      }
    } catch (err) {
      if (!result.error) {
        result.error = `view query failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  result.healthy =
    result.dbExists &&
    result.securityOk &&
    result.hasReviewCards &&
    result.reviewCardsQueryOk;
  return result;
}

// ============================================================
// Per-user activity (cardH-* docs)
// ============================================================

/**
 * CardHistory doc shape, trimmed to what we need for activity signals.
 * Canonical source: vue-skuilder `packages/db/src/core/types/types-legacy.ts`
 * (`CardHistory<T extends CardRecord>` + `CardRecord`).
 *
 * Doc IDs follow `cardH-{courseId}-{cardId}` (see `getCardHistoryID` in
 * `@vue-skuilder/db`).
 */
interface CardHistoryDoc {
  _id: string;
  records?: Array<{ timeStamp?: string | number }>;
}

export interface UserActivity {
  username: string;
  dbName: string;
  /** Distinct cards the user has interacted with (count of cardH docs). */
  cardsSeen: number;
  /** Total review records across all cardH docs. */
  totalReviews: number;
  /** Most recent review timestamp (ISO). null if never reviewed anything. */
  lastActive: string | null;
  /** Days since the last review (whole number, or null). */
  daysSinceActive: number | null;
  /**
   * Map of YYYY-MM-DD → review count, restricted to the last 90 days.
   * Used to render the heatmap. Days with zero activity are omitted from
   * the map (use 0 as the fallback).
   */
  dailyBuckets: Record<string, number>;
  /** Free-form error if the fetch failed. */
  error: string | null;
}

/**
 * Pulls all cardH-* docs from a single user DB and derives activity stats.
 * Activity signal is intentionally aggregated client-side because:
 *   1. The data volume is small (≤8 active users right now)
 *   2. We avoid building+maintaining a per-day map-reduce view
 *   3. The admin's couch session has _admin role, so we can read directly
 *
 * If/when N grows beyond ~50 active users, this should move server-side
 * with caching — see ConversionReport phase notes.
 */
export async function fetchUserActivityOne(username: string): Promise<UserActivity> {
  const dbName = usernameToDbName(username);
  const dbUrl = `${getCouchBaseUrl().replace(/\/+$/, '')}/${dbName}`;
  const result: UserActivity = {
    username,
    dbName,
    cardsSeen: 0,
    totalReviews: 0,
    lastActive: null,
    daysSinceActive: null,
    dailyBuckets: {},
    error: null,
  };

  // Key-range query for cardH-* docs. include_docs=true is required since
  // we need to read each doc's `records` array.
  const params = new URLSearchParams({
    startkey: JSON.stringify('cardH-'),
    endkey: JSON.stringify('cardH-￰'),
    include_docs: 'true',
  });

  let docs: CardHistoryDoc[];
  try {
    const res = await fetch(`${dbUrl}/_all_docs?${params}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      result.error = `_all_docs ${res.status}`;
      return result;
    }
    const json = (await res.json()) as {
      rows: Array<{ doc?: CardHistoryDoc }>;
    };
    docs = json.rows.map((r) => r.doc).filter((d): d is CardHistoryDoc => !!d);
  } catch (err) {
    result.error = `activity fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  result.cardsSeen = docs.length;

  // Bucket reviews by day. Only keep last 90 days to bound memory.
  const now = Date.now();
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
  let mostRecent = 0;

  for (const doc of docs) {
    if (!Array.isArray(doc.records)) continue;
    for (const record of doc.records) {
      const tsRaw = record?.timeStamp;
      if (tsRaw == null) continue;
      // CardRecord.timeStamp is a Moment in source; persists to couch as
      // whatever Moment.toString() produces. new Date(...) handles both
      // ISO strings and the Moment string format.
      const ts = new Date(tsRaw as string | number).getTime();
      if (Number.isNaN(ts)) continue;

      result.totalReviews++;
      if (ts > mostRecent) mostRecent = ts;

      if (ts >= ninetyDaysAgo) {
        const dayKey = new Date(ts).toISOString().slice(0, 10);
        result.dailyBuckets[dayKey] = (result.dailyBuckets[dayKey] ?? 0) + 1;
      }
    }
  }

  if (mostRecent > 0) {
    result.lastActive = new Date(mostRecent).toISOString();
    result.daysSinceActive = Math.floor((now - mostRecent) / (1000 * 60 * 60 * 24));
  }

  return result;
}

/**
 * Batched activity fetch with bounded concurrency. Same shape as
 * fetchUserDbHealth.
 */
export async function fetchUserActivityBatch(
  usernames: string[],
  concurrency: number = 4,
  onProgress?: (done: number, total: number) => void,
): Promise<UserActivity[]> {
  const results: UserActivity[] = new Array(usernames.length);
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= usernames.length) return;
      results[i] = await fetchUserActivityOne(usernames[i]);
      done++;
      onProgress?.(done, usernames.length);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, usernames.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ============================================================
// Per-user progress summary (admin view of another user's curriculum)
// ============================================================

/**
 * Fetch a `ProgressSummary`-shape object for another user, by reading
 * their userdb directly with admin couch credentials.
 *
 * Scoped down to what `CurriculumCard` needs: `elo.tagScores` (for mastery
 * thresholds) and `lessonProgress` (for completed/dismissed/spacing). Other
 * fields are populated where cheap (account identity, profile), or returned
 * as null. This is _not_ a like-for-like clone of `getProgressSummary()` —
 * scheduled reviews / session tracking / seen cards aren't loaded because
 * the curriculum block doesn't use them and the cost (extra queries +
 * localStorage cross-user reads that wouldn't make sense) isn't worth it.
 *
 * Permission model: assumes the caller's couch session has `_admin` role —
 * same gate as the rest of this service.
 */
export async function fetchProgressSummaryForUser(
  username: string,
): Promise<import('./userDebugAPI').ProgressSummary> {
  // Course ID lives in skuilder.config.json — the user-DB course
  // registration doc uses this id, _not_ the entitlement-bucket
  // 'letterspractice' string at the top of this file.
  const config = (await import('../../skuilder.config.json')).default;
  const courseId: string = config.course;

  const dbUrl = `${getCouchBaseUrl().replace(/\/+$/, '')}/${usernameToDbName(username)}`;

  // --- ELO (from CourseRegistrations doc) ---
  let elo: import('./userDebugAPI').ProgressSummary['elo'] = null;
  try {
    const res = await fetch(`${dbUrl}/CourseRegistrations`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const doc = (await res.json()) as {
        courses?: Array<{ courseID: string; elo?: unknown }>;
      };
      const entry = doc.courses?.find((c) => c.courseID === courseId);
      if (entry?.elo && typeof entry.elo !== 'number') {
        const courseElo = entry.elo as {
          global?: { score: number; count: number };
          tags?: TagScores;
        };
        const tagScores: TagScores = {};
        if (courseElo.tags) {
          for (const [tag, info] of Object.entries(courseElo.tags)) {
            tagScores[tag] = { score: info.score, count: info.count, recent: info.recent };
          }
        }
        elo = {
          globalScore: courseElo.global?.score ?? 0,
          globalCount: courseElo.global?.count ?? 0,
          tagScores,
        };
      }
    }
  } catch {
    // best-effort; leave elo=null
  }

  // --- Lesson progress (STRATEGY_STATE doc) ---
  let lessonProgress: import('./userDebugAPI').ProgressSummary['lessonProgress'] = null;
  try {
    const docId = `STRATEGY_STATE::${courseId}::LessonProgress`;
    const res = await fetch(`${dbUrl}/${encodeURIComponent(docId)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const doc = (await res.json()) as {
        data?: {
          completedLessons?: string[];
          dismissedLessons?: string[];
          currentLesson?: string | null;
          skippedCount?: number;
          sessionsSinceLastLesson?: number;
          passedAt?: Record<string, string>;
        };
      };
      const data = doc.data;
      if (data) {
        lessonProgress = {
          completedLessons: [...(data.completedLessons ?? [])],
          dismissedLessons: [...(data.dismissedLessons ?? [])],
          currentLesson: data.currentLesson ?? null,
          skippedCount: data.skippedCount ?? 0,
          sessionsSinceLastLesson: data.sessionsSinceLastLesson ?? 0,
          passedAt: { ...(data.passedAt ?? {}) },
        };
      }
    }
  } catch {
    // 404 / not yet established — null is fine
  }

  return {
    username,
    isLoggedIn: false,
    isGuest: username.startsWith('sk-guest-'),
    courseId,
    letterProgression: null,
    elo,
    lessonProgress,
    prescribedProgress: null,
    reviews: { pendingCount: 0, nextReviewTime: null },
    activity: {
      seenCardCount: 0,
      sessionCount: 0,
      firstSession: null,
      lastSession: null,
    },
    profile: null,
  };
}

/**
 * Read a user's post-session vignette progress (`VignetteProgress` strategy
 * state). Null when the doc doesn't exist yet (no finished sessions).
 * Same `_admin`-session direct-couch pattern as the rest of this service.
 */
export async function fetchVignetteProgressForUser(
  username: string,
): Promise<import('./userState.types').VignetteProgressState | null> {
  const config = (await import('../../skuilder.config.json')).default;
  const courseId: string = config.course;
  const dbUrl = `${getCouchBaseUrl().replace(/\/+$/, '')}/${usernameToDbName(username)}`;
  const docId = `STRATEGY_STATE::${courseId}::VignetteProgress`;
  try {
    const res = await fetch(`${dbUrl}/${encodeURIComponent(docId)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as {
      data?: import('./userState.types').VignetteProgressState;
    };
    return doc.data ?? null;
  } catch {
    return null;
  }
}

/** A scheduled review, trimmed to what the nudge needs (id + due time). */
export interface ScheduledReviewLite {
  cardId: string;
  /** ISO review-eligibility time; '' if absent. Earliest = most overdue. */
  reviewTime: string;
}

// ============================================================
// Per-card interaction history (scheduler/teacher debugging)
// ============================================================
//
// A high-resolution join of the three docs that together describe a user's
// relationship with one card:
//   1. `cardH-{course}-{card}`  (user DB)   — the interaction record timeline
//   2. `card_review_*`          (user DB)   — whether a review is scheduled/due
//   3. `coursedb-{course}` card doc          — the card's *current* ELO + tags
//
// Reads use the same `_admin`-session direct-couch pattern as the rest of this
// service. The join surfaces two scheduler pathologies directly (see
// `agent/scheduler-teacher-audit/perceived-bug.md`):
//   - a card with many `lapses` that STILL has a pending, overdue review
//     (failed reviews are never rescheduled/cleared)
//   - a heavily-failed card whose `cardElo` is still at its seeded value
//     (server-side card-ELO writes to the course DB are permission-denied)

/** One interaction record, normalized for display. */
export interface CardRecordLite {
  /** ISO timestamp the card was rendered. */
  timeStamp: string;
  /** ms the user spent before submitting. */
  timeSpentMs: number;
  /** null for non-question (dismiss) records. */
  isCorrect: boolean | null;
  /** Global performance score [0,1], flattened from numeric or TaggedPerformance. */
  performance: number | null;
  /** Incorrect submissions preceding this one within the same view. */
  priorAttempts: number | null;
  /** The user's raw answer, if a question record. */
  userAnswer: unknown;
  /**
   * The study session this response was produced in, joining to a
   * `SESSION::*` doc. Absent on records written before session stamping
   * shipped, and on responses produced outside a SessionController.
   */
  sessionId?: string;
}

/** A card the user has interacted with, joined across user + course DBs. */
export interface CardHistoryDetail {
  cardId: string;
  courseId: string;
  // --- from cardH doc ---
  lapses: number;
  streak: number;
  bestIntervalSeconds: number;
  records: CardRecordLite[];
  attemptCount: number;
  /** Records where isCorrect === false. */
  failCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  totalTimeMs: number;
  // --- joined: pending review (user DB card_review_*) ---
  pendingReview: { reviewTime: string; overdue: boolean } | null;
  // --- joined: card doc (course DB) ---
  /** Card's current global ELO score, or null if the card doc was unreadable. */
  cardElo: number | null;
  /** Number of ELO updates the card has accumulated globally. */
  cardEloCount: number | null;
  /** Applied content tags (from TAG docs), e.g. `gpc:exercise:s-S`. */
  tags: string[];
  /** Question view class parsed from the card's `id_view`. */
  questionType: string | null;
  /**
   * Heuristic "pain" ranking: time sunk × failures, so grind-heavy low-payoff
   * cards float to the top. Not a stored value — computed for sort only.
   */
  painScore: number;
}

interface RawCardHistoryDoc {
  _id: string;
  cardID?: string;
  courseID?: string;
  lapses?: number;
  streak?: number;
  bestInterval?: number;
  records?: Array<{
    timeStamp?: string | number;
    timeSpent?: number;
    isCorrect?: boolean;
    performance?: number | { _global?: number };
    priorAttemps?: number;
    userAnswer?: unknown;
    sessionId?: string;
  }>;
}

function flattenPerformance(p: number | { _global?: number } | undefined): number | null {
  if (typeof p === 'number') return p;
  if (p && typeof p === 'object' && typeof p._global === 'number') return p._global;
  return null;
}

/**
 * Fetch a user's full per-card interaction history, joined with each card's
 * pending-review status and current course-DB ELO/tags. Sorted most-painful
 * first (see `painScore`).
 *
 * Best-effort on the course-DB join: if the course DB is unreadable, records
 * still return with `cardElo: null` / `tags: []`.
 */
export async function fetchCardHistoriesForUser(
  username: string,
): Promise<CardHistoryDetail[]> {
  const config = (await import('../../skuilder.config.json')).default;
  const courseId: string = config.course;
  const userDbUrl = getUserDbUrl(username);
  const courseDbUrl = `${getCouchBaseUrl().replace(/\/+$/, '')}/coursedb-${courseId}`;

  // --- 1. cardH-* interaction docs (user DB) ---
  const historyDocs = await fetchDocRange<RawCardHistoryDoc>(userDbUrl, 'cardH-');
  const details: CardHistoryDetail[] = historyDocs
    .filter((d) => Array.isArray(d.records))
    .map((doc) => {
      const records: CardRecordLite[] = (doc.records ?? []).map((r) => ({
        // Normalize to ISO — cardH timeStamps persist as `Moment.toString()`,
        // which sorts alphabetically (by weekday/month name), not by time.
        timeStamp: toIsoTimestamp(r.timeStamp),
        timeSpentMs: r.timeSpent ?? 0,
        isCorrect: typeof r.isCorrect === 'boolean' ? r.isCorrect : null,
        performance: flattenPerformance(r.performance),
        priorAttempts: typeof r.priorAttemps === 'number' ? r.priorAttemps : null,
        userAnswer: r.userAnswer,
        // NB this mapping is explicit rather than a spread — a new record
        // field is invisible to every admin view until it is named here.
        sessionId: r.sessionId,
      }));
      records.sort((a, b) => {
        const ta = Date.parse(a.timeStamp);
        const tb = Date.parse(b.timeStamp);
        if (Number.isNaN(ta) || Number.isNaN(tb)) return a.timeStamp.localeCompare(b.timeStamp);
        return ta - tb;
      });

      const failCount = records.filter((r) => r.isCorrect === false).length;
      const totalTimeMs = records.reduce((s, r) => s + r.timeSpentMs, 0);
      // Derive cardId from the doc: prefer the field, fall back to the id tail
      // (`cardH-{course}-{card}`).
      const cardId =
        doc.cardID ?? doc._id.replace(new RegExp(`^cardH-${courseId}-`), '');

      return {
        cardId,
        courseId: doc.courseID ?? courseId,
        lapses: doc.lapses ?? 0,
        streak: doc.streak ?? 0,
        bestIntervalSeconds: doc.bestInterval ?? 0,
        records,
        attemptCount: records.length,
        failCount,
        firstSeen: records.length ? records[0].timeStamp : null,
        lastSeen: records.length ? records[records.length - 1].timeStamp : null,
        totalTimeMs,
        pendingReview: null,
        cardElo: null,
        cardEloCount: null,
        tags: [],
        questionType: null,
        painScore: totalTimeMs * (failCount + 1),
      } as CardHistoryDetail;
    });

  const byCardId = new Map(details.map((d) => [d.cardId, d]));

  // --- 2. card_review_* docs (user DB): mark pending/overdue ---
  try {
    const now = Date.now();
    const reviews = await fetchDocRange<{ cardId?: string; reviewTime?: string }>(
      userDbUrl,
      'card_review_',
    );
    for (const rev of reviews) {
      if (!rev.cardId) continue;
      const detail = byCardId.get(rev.cardId);
      if (!detail) continue;
      const reviewTime = rev.reviewTime ?? '';
      const overdue = reviewTime ? new Date(reviewTime).getTime() <= now : false;
      // Keep the earliest (most overdue) if multiple exist.
      if (!detail.pendingReview || reviewTime < detail.pendingReview.reviewTime) {
        detail.pendingReview = { reviewTime, overdue };
      }
    }
  } catch (err) {
    console.warn('[cardHistory] review-queue join failed for', username, err);
  }

  // --- 3. course-DB join: card ELO + tags ---
  try {
    const cardIds = details.map((d) => d.cardId);
    if (cardIds.length > 0) {
      const cards = await fetchDocsByKeys<{
        _id: string;
        id_view?: string;
        elo?: { global?: { score?: number; count?: number } };
      }>(courseDbUrl, cardIds);
      for (const card of cards) {
        const detail = byCardId.get(card._id);
        if (!detail) continue;
        detail.cardElo = card.elo?.global?.score ?? null;
        detail.cardEloCount = card.elo?.global?.count ?? null;
        if (card.id_view) {
          // "ExampleCourse.question.SpellingQuestion.SpellingQuestionView" → "SpellingQuestion"
          const parts = card.id_view.split('.');
          detail.questionType = parts.length >= 2 ? parts[parts.length - 2] : card.id_view;
        }
      }
    }

    // Reverse-map applied content tags from TAG docs (TAG.taggedCards[]).
    const tagDocs = await fetchDocRange<{ name?: string; taggedCards?: string[] }>(
      courseDbUrl,
      'TAG',
    );
    for (const tag of tagDocs) {
      if (!tag.name || !Array.isArray(tag.taggedCards)) continue;
      for (const cid of tag.taggedCards) {
        byCardId.get(cid)?.tags.push(tag.name);
      }
    }
  } catch (err) {
    console.warn('[cardHistory] course-DB join failed for', username, err);
  }

  details.sort((a, b) => b.painScore - a.painScore);
  return details;
}


// ============================================================
// Spelling misses (grader audit)
// ============================================================

/** One wrong spelling answer: what was recorded then, and what the grader says now. */
export interface SpellingAttempt {
  cardId: string;
  word: string;
  answer: string;
  /** ISO. */
  timeStamp: string;
  sessionId?: string;
  /** The view's first attempt (`priorAttemps === 0`); retries follow a correction. */
  firstAttempt: boolean;
  /**
   * The GPC verdicts written at the time, by short id (score 0 → miss), or
   * 'unjudged' when the record carries no GPC keys (the old wrong-length
   * bail-out, or no phonetics).
   */
  recorded: 'unjudged' | Record<string, Verdict>;
  /** The current grader's judgement of the same answer. */
  now: SpellingGrade;
}

/**
 * Every wrong spelling answer in a user's card histories, newest first, with
 * the verdicts recorded at the time beside the current grader's. Records the
 * framework wrote twice (a card's first record; see TODO.MINOR_ITEMS.md) are
 * listed once.
 */
export async function fetchSpellingAttemptsForUser(username: string): Promise<SpellingAttempt[]> {
  const config = (await import('../../skuilder.config.json')).default;
  const courseId: string = config.course;
  const prefix = `cardH-${courseId}-${CARD_PREFIX_SPELLING}`;
  const docs = await fetchDocRange<{
    _id: string;
    cardID?: string;
    records?: Array<{
      timeStamp?: string | number;
      isCorrect?: boolean;
      performance?: number | Record<string, number | null>;
      priorAttemps?: number;
      userAnswer?: unknown;
      sessionId?: string;
    }>;
  }>(getUserDbUrl(username), prefix);

  const attempts: SpellingAttempt[] = [];
  for (const doc of docs) {
    const cardId = doc.cardID ?? doc._id.slice(`cardH-${courseId}-`.length);
    const word = cardId.slice(CARD_PREFIX_SPELLING.length);
    const phonetics = getPhonetics(word);
    let prev = '';
    for (const r of doc.records ?? []) {
      const key = JSON.stringify(r);
      if (key === prev) continue;
      prev = key;
      if (r.isCorrect !== false || typeof r.userAnswer !== 'string') continue;

      const recorded: Record<string, Verdict> = {};
      if (r.performance && typeof r.performance === 'object') {
        for (const [tag, score] of Object.entries(r.performance)) {
          const parsed = parseGpcTag(tag);
          if (parsed?.role === 'exercise' && typeof score === 'number') {
            recorded[parsed.gpcShortId] = score > 0 ? 'hit' : 'miss';
          }
        }
      }
      attempts.push({
        cardId,
        word,
        answer: r.userAnswer,
        timeStamp: toIsoTimestamp(r.timeStamp),
        sessionId: r.sessionId,
        firstAttempt: r.priorAttemps === 0,
        recorded: Object.keys(recorded).length ? recorded : 'unjudged',
        now: gradeSpelling(word, phonetics, r.userAnswer),
      });
    }
  }
  attempts.sort((a, b) => Date.parse(b.timeStamp) - Date.parse(a.timeStamp));
  return attempts;
}


// ============================================================
// Study sessions
// ============================================================

/**
 * The stored `SESSION::*` record plus display-only derivations. Flags make the
 * list read as triage rather than as a table of totals.
 */
export interface SessionSummary {
  doc: StudySessionDoc;
  /** Null while a session is `open`. */
  durationSeconds: number | null;
  accuracy: number | null;
  /** Null components are not measurable, as distinct from zero. */
  delta: {
    letters: number | null;
    reachableWords: number | null;
    elo: number | null;
  };
  flags: SessionFlag[];
}

export type SessionFlag = 'churned' | 'starved' | 'walked' | 'stalled' | 'grinding';

export const SESSION_FLAG_META: Record<
  SessionFlag,
  { label: string; icon: string; color: string; help: string }
> = {
  churned: {
    label: 'Churned',
    icon: 'mdi-autorenew',
    color: 'warning',
    help: 'Many pipeline runs relative to cards served — the plan kept being rebuilt rather than consumed.',
  },
  starved: {
    label: 'Starved',
    icon: 'mdi-cup-off-outline',
    color: 'error',
    help: 'Ended with time left on the clock: content ran out before the session did.',
  },
  walked: {
    label: 'Walked',
    icon: 'mdi-exit-run',
    color: 'error',
    help: 'Abandoned or never closed, after real time invested. Not a mis-click.',
  },
  stalled: {
    label: 'Stalled',
    icon: 'mdi-arrow-collapse-horizontal',
    color: 'grey',
    help: 'No letters unlocked, no reachable-word movement, ELO essentially flat. The sitting produced nothing.',
  },
  grinding: {
    label: 'Grinding',
    icon: 'mdi-alert-octagon-outline',
    color: 'warning',
    help: 'Majority-incorrect, or ended with unfinished cards still in the remediation queue.',
  },
};

/** First guesses, not measurements — no historical data exists to tune against. */
const FLAG = {
  /** runs-per-card above which a session counts as churned. */
  CHURN_RUNS_PER_CARD: 1 / 3,
  /** Minimum cards before churn is meaningful — short sessions are noisy. */
  CHURN_MIN_CARDS: 4,
  /** Leftover clock (s) that counts as running out of content. */
  STARVED_SECONDS: 20,
  /** Cards below which an abandon reads as a mis-click rather than a walk-out. */
  WALK_MIN_CARDS: 2,
  /** |ELO change| below which movement is treated as flat. */
  STALL_ELO_EPSILON: 5,
  /** Accuracy below which a session reads as grinding. */
  GRIND_ACCURACY: 0.5,
};

function snapNum(
  snap: Record<string, unknown> | undefined,
  path: [string, string],
): number | null {
  if (!snap) return null;
  const outer = snap[path[0]];
  if (!outer || typeof outer !== 'object') return null;
  const v = (outer as Record<string, unknown>)[path[1]];
  return typeof v === 'number' ? v : null;
}

function diffSnap(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
  path: [string, string],
): number | null {
  const from = snapNum(a, path);
  const to = snapNum(b, path);
  if (from === null || to === null) return null;
  return to - from;
}

function flagSession(s: Omit<SessionSummary, 'flags'>): SessionFlag[] {
  const { doc, accuracy, delta } = s;
  const flags: SessionFlag[] = [];
  const cards = doc.tally?.cardsPresented ?? 0;
  const runs = doc.runs?.length ?? 0;

  if (cards >= FLAG.CHURN_MIN_CARDS && runs / cards > FLAG.CHURN_RUNS_PER_CARD) {
    flags.push('churned');
  }

  // Only a closed session can be starved — an abandoned one has time left by
  // definition.
  if (
    doc.status === 'closed' &&
    (doc.tally?.secondsRemaining ?? 0) > FLAG.STARVED_SECONDS
  ) {
    flags.push('starved');
  }

  if (doc.status === 'open') {
    // No tally exists, so there is no card count to filter mis-clicks by.
    flags.push('walked');
  } else if (doc.status === 'abandoned' && cards >= FLAG.WALK_MIN_CARDS) {
    flags.push('walked');
  }

  // Needs a measurable dimension, else every session lacking an end-snapshot
  // would flag.
  const dims = [delta.letters, delta.reachableWords, delta.elo];
  const measurable = dims.filter((d): d is number => d !== null);
  if (
    cards > 0 &&
    measurable.length > 0 &&
    (delta.letters ?? 0) === 0 &&
    (delta.reachableWords ?? 0) === 0 &&
    Math.abs(delta.elo ?? 0) < FLAG.STALL_ELO_EPSILON
  ) {
    flags.push('stalled');
  }

  if (
    (accuracy !== null && accuracy < FLAG.GRIND_ACCURACY && cards > 0) ||
    (doc.tally?.failedQRemaining ?? 0) > 0
  ) {
    flags.push('grinding');
  }

  return flags;
}

function summarizeSession(doc: StudySessionDoc): SessionSummary {
  const start = Date.parse(doc.startTime);
  const end = doc.endTime ? Date.parse(doc.endTime) : NaN;
  const durationSeconds =
    Number.isNaN(start) || Number.isNaN(end) ? null : Math.round((end - start) / 1000);

  const responses = doc.tally?.responses ?? 0;
  const accuracy = responses > 0 ? (doc.tally!.correct ?? 0) / responses : null;

  const a = doc.stateAtStart as Record<string, unknown> | undefined;
  const b = doc.stateAtEnd as Record<string, unknown> | undefined;
  const delta = {
    letters: diffSnap(a, b, ['progression', 'unlockedCount']),
    reachableWords: diffSnap(a, b, ['progression', 'reachableWordCount']),
    elo: diffSnap(a, b, ['elo', 'score']),
  };

  const base = { doc, durationSeconds, accuracy, delta };
  return { ...base, flags: flagSession(base) };
}

/** All study sessions for a user, newest first. */
export async function fetchStudySessionsForUser(
  username: string,
): Promise<SessionSummary[]> {
  const config = (await import('../../skuilder.config.json')).default;
  const courseId: string = config.course;
  const userDbUrl = getUserDbUrl(username);

  const docs = await fetchDocRange<StudySessionDoc>(
    userDbUrl,
    `SESSION::${courseId}::${username}::`,
  );

  return docs
    .map(summarizeSession)
    .sort((x, y) => y.doc.startTime.localeCompare(x.doc.startTime));
}

/**
 * Responses and pipeline runs share one time-ordered stream: a replan firing
 * between two failures is the thing worth seeing, and sequence is what a
 * per-card pivot can't show.
 */
export type SessionTimelineEntry =
  | {
      kind: 'response';
      at: string;
      cardId: string;
      /** Content tags from the course DB, e.g. `gpc:exercise:s-S`. */
      tags: string[];
      questionType: string | null;
      isCorrect: boolean | null;
      timeSpentMs: number;
      priorAttempts: number | null;
      userAnswer: unknown;
      /**
       * The ELO exchange this response produced, joined from the session doc's
       * `eloEvents[]` by cardId + nearest time. Absent when no exchange fired
       * (a retry — only first attempts move ELO), when the event was still in
       * flight at session close, or on sessions predating ELO-event logging.
       */
      elo?: ResponseEloDelta;
    }
  | {
      kind: 'run';
      at: string;
      runId: string;
      label: string;
      mode?: string;
      generatedCount: number;
      finalCount: number;
      reviewsSelected: number;
      newSelected: number;
      // --- detail (optional; absent on runs recorded before the framework
      //     began projecting it — see StudySessionRunSummary in
      //     @vue-skuilder/db). Read defensively below. ---
      userElo?: number;
      generators?: RunGeneratorSummary[];
      filters?: RunFilterImpact[];
      hints?: RunHints;
      discardedTail?: RunDiscardedTail;
    };

/**
 * App-side mirrors of the run-detail shapes the framework projects into
 * `StudySessionRunSummary` (canonical source: `@vue-skuilder/db`
 * PipelineDebugger + studySession.ts). Duplicated, not imported, so this view
 * compiles regardless of which published framework version is installed —
 * same pattern as the user-doc types in the overlay's business service.
 */
export interface RunGeneratorSummary {
  name: string;
  cardCount: number;
  newCount: number;
  reviewCount: number;
  topScore: number;
}
export interface RunFilterImpact {
  name: string;
  boosted: number;
  penalized: number;
  passed: number;
  removed: number;
}
export interface RunHints {
  boostTags?: Record<string, number>;
  boostCards?: Record<string, number>;
  requireTags?: string[];
  requireCards?: string[];
  excludeTags?: string[];
  excludeCards?: string[];
  _label?: string;
}
export interface RunDiscardedTail {
  count: number;
  scoreRange?: [number, number];
  eloRange?: [number, number];
  note: string;
}

/**
 * App-side mirror of `SessionEloEvent` (canonical: `@vue-skuilder/db`
 * studySession.ts). One learner↔card ELO exchange, persisted on the session
 * doc's `eloEvents[]`. Duplicated, not imported, so this view compiles against
 * a published framework version that predates the field — same pattern as the
 * run-detail shapes above. Read defensively off the session doc.
 */
export interface SessionEloEvent {
  cardId: string;
  at: string;
  userScore: number;
  global: { before: number; after: number };
  card?: { before: number; after: number };
  tags?: Record<string, { before: number; after: number; score: number | null }>;
}

/**
 * A `SessionEloEvent` reshaped for one response row: deltas precomputed, tags
 * flattened to a sorted array. `null`-score tags are count-only exposures
 * (`gpc:expose:*`) that move count, not ELO.
 */
export interface ResponseEloDelta {
  userScore: number;
  global: { before: number; after: number; delta: number };
  card?: { before: number; after: number; delta: number };
  tags: Array<{ tag: string; before: number; after: number; delta: number; score: number | null }>;
}

export interface SessionDetail {
  summary: SessionSummary;
  timeline: SessionTimelineEntry[];
  /** The tally claims more responses than stamped records were found. */
  responsesMissing: boolean;
}

/** Per-tag rollup of what the session actually served. */
export interface ServedTagStat {
  tag: string;
  /** Response entries carrying this tag (a card counted once per response). */
  responses: number;
  correct: number;
  incorrect: number;
  /** correct / (correct+incorrect); null when nothing gradeable was served. */
  accuracy: number | null;
  totalTimeMs: number;
  /** Distinct cards carrying this tag. */
  cards: number;
}

/**
 * Roll the response timeline up by content tag. A response with multiple tags
 * counts toward each. Exercise/intro (`gpc:*`) tags first, then the rest;
 * within each group, most-served first. Pure — safe to call in a computed.
 */
export function summarizeServedTags(timeline: SessionTimelineEntry[]): ServedTagStat[] {
  const byTag = new Map<
    string,
    { responses: number; correct: number; incorrect: number; totalTimeMs: number; cards: Set<string> }
  >();
  for (const e of timeline) {
    if (e.kind !== 'response') continue;
    for (const tag of e.tags) {
      let s = byTag.get(tag);
      if (!s) {
        s = { responses: 0, correct: 0, incorrect: 0, totalTimeMs: 0, cards: new Set<string>() };
        byTag.set(tag, s);
      }
      s.responses += 1;
      s.totalTimeMs += e.timeSpentMs;
      s.cards.add(e.cardId);
      if (e.isCorrect === true) s.correct += 1;
      else if (e.isCorrect === false) s.incorrect += 1;
    }
  }

  const stats: ServedTagStat[] = [...byTag.entries()].map(([tag, s]) => {
    const graded = s.correct + s.incorrect;
    return {
      tag,
      responses: s.responses,
      correct: s.correct,
      incorrect: s.incorrect,
      accuracy: graded > 0 ? s.correct / graded : null,
      totalTimeMs: s.totalTimeMs,
      cards: s.cards.size,
    };
  });

  stats.sort((a, b) => {
    const ga = a.tag.startsWith('gpc:') ? 0 : 1;
    const gb = b.tag.startsWith('gpc:') ? 0 : 1;
    if (ga !== gb) return ga - gb;
    if (b.responses !== a.responses) return b.responses - a.responses;
    return a.tag.localeCompare(b.tag);
  });
  return stats;
}

/**
 * Cost: responses are recovered by scanning every `cardH-*` doc and filtering
 * by `sessionId` — there is no index by session. Same scan
 * `fetchCardHistoriesForUser` already does. If it bites, add a design-doc view
 * emitting `sessionId → record`.
 */
/**
 * Normalize a record timestamp to ISO. `cardH` records persist their timeStamp
 * as `Moment.toString()` (e.g. "Fri Sep 11 2026 14:14:38 GMT-0400"), while the
 * run log uses `Date.toISOString()` — the two don't sort against each other
 * lexically. `new Date(...)` parses both formats (and epoch numbers); we fall
 * back to the raw string only if it's genuinely unparseable, so nothing is
 * dropped.
 */
function toIsoTimestamp(ts: string | number | undefined): string {
  if (ts == null) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString();
}

/** Reshape a stored ELO event into per-response deltas, tags sorted gpc-first. */
function toResponseEloDelta(ev: SessionEloEvent): ResponseEloDelta {
  const tags = Object.entries(ev.tags ?? {}).map(([tag, t]) => ({
    tag,
    before: t.before,
    after: t.after,
    delta: t.after - t.before,
    score: t.score,
  }));
  tags.sort((a, b) => {
    const ga = a.tag.startsWith('gpc:') ? 0 : 1;
    const gb = b.tag.startsWith('gpc:') ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return a.tag.localeCompare(b.tag);
  });
  return {
    userScore: ev.userScore,
    global: { before: ev.global.before, after: ev.global.after, delta: ev.global.after - ev.global.before },
    ...(ev.card
      ? { card: { before: ev.card.before, after: ev.card.after, delta: ev.card.after - ev.card.before } }
      : {}),
    tags,
  };
}

/**
 * Attach each ELO event to its response row. The event fires just after the
 * record is written, so it carries no record id — we join by cardId and
 * nearest timestamp, consuming each response at most once. Events with no
 * surviving response (e.g. the record write failed) are dropped.
 */
function attachEloEvents(
  timeline: SessionTimelineEntry[],
  events: SessionEloEvent[],
): void {
  if (events.length === 0) return;
  const responses = timeline.filter(
    (e): e is Extract<SessionTimelineEntry, { kind: 'response' }> => e.kind === 'response',
  );
  const used = new Set<number>();
  for (const ev of events) {
    const evT = Date.parse(ev.at);
    let bestIdx = -1;
    let bestGap = Infinity;
    for (let i = 0; i < responses.length; i++) {
      if (used.has(i)) continue;
      if (responses[i].cardId !== ev.cardId) continue;
      const rT = Date.parse(responses[i].at);
      const gap = Number.isNaN(rT) || Number.isNaN(evT) ? Infinity : Math.abs(rT - evT);
      if (gap < bestGap) {
        bestGap = gap;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      responses[bestIdx].elo = toResponseEloDelta(ev);
    }
  }
}

export async function fetchSessionDetail(
  username: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  const config = (await import('../../skuilder.config.json')).default;
  const courseId: string = config.course;
  const userDbUrl = getUserDbUrl(username);
  const courseDbUrl = `${getCouchBaseUrl().replace(/\/+$/, '')}/coursedb-${courseId}`;

  const sessionDocId = `SESSION::${courseId}::${username}::${sessionId}`;
  const [sessionDoc] = await fetchDocsByKeys<StudySessionDoc>(userDbUrl, [sessionDocId]);
  if (!sessionDoc) return null;

  const summary = summarizeSession(sessionDoc);
  const timeline: SessionTimelineEntry[] = [];

  // --- Pipeline runs (from the session doc itself) ---
  for (const run of sessionDoc.runs ?? []) {
    // The installed framework type may predate the projected detail fields,
    // so read them through an extended view rather than depending on them.
    const rd = run as typeof run & {
      userElo?: number;
      generators?: RunGeneratorSummary[];
      filters?: RunFilterImpact[];
      hints?: RunHints;
      discardedTail?: RunDiscardedTail;
    };
    timeline.push({
      kind: 'run',
      at: run.at,
      runId: run.runId,
      label: run.label,
      ...(run.mode ? { mode: run.mode } : {}),
      generatedCount: run.generatedCount,
      finalCount: run.finalCount,
      reviewsSelected: run.reviewsSelected,
      newSelected: run.newSelected,
      ...(typeof rd.userElo === 'number' ? { userElo: rd.userElo } : {}),
      ...(rd.generators ? { generators: rd.generators } : {}),
      ...(rd.filters ? { filters: rd.filters } : {}),
      ...(rd.hints ? { hints: rd.hints } : {}),
      ...(rd.discardedTail ? { discardedTail: rd.discardedTail } : {}),
    });
  }

  // --- Responses (cardH-* records stamped with this sessionId) ---
  const touchedCardIds = new Set<string>();
  try {
    const historyDocs = await fetchDocRange<RawCardHistoryDoc>(userDbUrl, 'cardH-');
    for (const doc of historyDocs) {
      const cardId =
        doc.cardID ?? doc._id.replace(new RegExp(`^cardH-${courseId}-`), '');
      for (const r of doc.records ?? []) {
        if (r.sessionId !== sessionId) continue;
        touchedCardIds.add(cardId);
        timeline.push({
          kind: 'response',
          // Normalize to ISO so it sorts against the run log's ISO `at`. cardH
          // records historically persist as `Moment.toString()`
          // ("Fri Sep 11 2026 14:14:38 GMT-0400"), which lexically sorts BEFORE
          // every ISO string — the reason runs used to clump ahead of all
          // responses. See `toIsoTimestamp` + the parse-based sort below.
          at: toIsoTimestamp(r.timeStamp),
          cardId,
          tags: [],
          questionType: null,
          isCorrect: typeof r.isCorrect === 'boolean' ? r.isCorrect : null,
          timeSpentMs: r.timeSpent ?? 0,
          priorAttempts: typeof r.priorAttemps === 'number' ? r.priorAttemps : null,
          userAnswer: r.userAnswer,
        });
      }
    }
  } catch (err) {
    console.warn('[sessionDetail] card-history scan failed for', username, err);
  }

  // --- Course-DB join: tags + question type for the cards actually touched ---
  if (touchedCardIds.size > 0) {
    try {
      const ids = [...touchedCardIds];
      const tagsByCard = new Map<string, string[]>();
      const typeByCard = new Map<string, string>();

      const cards = await fetchDocsByKeys<{ _id: string; id_view?: string }>(
        courseDbUrl,
        ids,
      );
      for (const card of cards) {
        if (!card.id_view) continue;
        const parts = card.id_view.split('.');
        typeByCard.set(card._id, parts.length >= 2 ? parts[parts.length - 2] : card.id_view);
      }

      const tagDocs = await fetchDocRange<{ name?: string; taggedCards?: string[] }>(
        courseDbUrl,
        'TAG',
      );
      for (const tag of tagDocs) {
        if (!tag.name || !Array.isArray(tag.taggedCards)) continue;
        for (const cid of tag.taggedCards) {
          if (!touchedCardIds.has(cid)) continue;
          const list = tagsByCard.get(cid) ?? [];
          list.push(tag.name);
          tagsByCard.set(cid, list);
        }
      }

      for (const entry of timeline) {
        if (entry.kind !== 'response') continue;
        entry.tags = tagsByCard.get(entry.cardId) ?? [];
        entry.questionType = typeByCard.get(entry.cardId) ?? null;
      }
    } catch (err) {
      console.warn('[sessionDetail] course-DB join failed for', username, err);
    }
  }

  // --- ELO exchanges (from the session doc's eloEvents[]) ---
  // Read through an extended view: the installed framework type may predate the
  // field. Joined to responses by cardId + nearest time (see attachEloEvents).
  const eloEvents = (sessionDoc as StudySessionDoc & { eloEvents?: SessionEloEvent[] })
    .eloEvents;
  if (Array.isArray(eloEvents) && eloEvents.length > 0) {
    attachEloEvents(timeline, eloEvents);
  }

  // Parse-based, NOT lexical: run `at` is ISO and response `at` is normalized
  // to ISO above, but a lexical compare would still mis-order the instant a
  // non-ISO string slipped through. Sort by epoch, falling back to lexical
  // only for genuinely unparseable timestamps.
  timeline.sort((a, b) => {
    const ta = Date.parse(a.at);
    const tb = Date.parse(b.at);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return a.at.localeCompare(b.at);
    return ta - tb;
  });

  const foundResponses = timeline.filter((e) => e.kind === 'response').length;
  return {
    summary,
    timeline,
    responsesMissing: (sessionDoc.tally?.responses ?? 0) > foundResponses,
  };
}

/**
 * `_all_docs` key-range fetch over one prefix, returning included docs.
 * Shared shape used across the per-card joins above.
 */
async function fetchDocRange<T>(dbUrl: string, prefix: string): Promise<T[]> {
  const url =
    `${dbUrl}/_all_docs?include_docs=true` +
    `&startkey=${encodeURIComponent(JSON.stringify(prefix))}` +
    `&endkey=${encodeURIComponent(JSON.stringify(prefix + '￰'))}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`_all_docs ${prefix} → ${res.status}`);
  const json = (await res.json()) as { rows: Array<{ doc?: T }> };
  return json.rows.map((r) => r.doc).filter((d): d is T => !!d);
}

/** `_all_docs` POST fetch for a specific set of doc IDs. */
async function fetchDocsByKeys<T extends { _id: string }>(
  dbUrl: string,
  keys: string[],
): Promise<T[]> {
  const res = await fetch(`${dbUrl}/_all_docs?include_docs=true`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ keys }),
  });
  if (!res.ok) throw new Error(`_all_docs (keys) → ${res.status}`);
  const json = (await res.json()) as { rows: Array<{ doc?: T }> };
  return json.rows.map((r) => r.doc).filter((d): d is T => !!d);
}

/**
 * Read the SRS review queue (`card_review_*` docs) straight from a user's
 * userdb, sorted earliest-`reviewTime` first (most overdue → most worth
 * surfacing). Used by the lifecycle nudge to list real "due for review" items.
 *
 * This is a LIVE read by design — the queue rolls forward as cards come due, so
 * (unlike the intro-forecast) it can't be snapshotted ahead of time.
 *
 * Same `_admin`-session direct-couch pattern as the rest of this service.
 */
export async function fetchReviewQueue(username: string): Promise<ScheduledReviewLite[]> {
  const dbUrl = `${getCouchBaseUrl().replace(/\/+$/, '')}/${usernameToDbName(username)}`;
  const url =
    `${dbUrl}/_all_docs?include_docs=true` +
    `&startkey=${encodeURIComponent(JSON.stringify('card_review_'))}` +
    `&endkey=${encodeURIComponent(JSON.stringify('card_review_￰'))}`;
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      rows: Array<{ doc?: { cardId?: string; reviewTime?: string } }>;
    };
    return json.rows
      .map((r) => r.doc)
      .filter((d): d is { cardId: string; reviewTime?: string } => !!d?.cardId)
      .map((d) => ({ cardId: d.cardId, reviewTime: d.reviewTime ?? '' }))
      .sort((a, b) => a.reviewTime.localeCompare(b.reviewTime));
  } catch (err) {
    console.warn('[nudge] review-queue read failed for', username, err);
    return [];
  }
}

/**
 * Out-of-band read of a user's cached intro-forecast snapshot (written
 * in-session by `services/introForecast.ts`). Reads the same
 * `STRATEGY_STATE::<course>::IntroForecast` doc the app persists, via the
 * `_admin`-session direct-couch pattern. Returns null if absent/unreadable.
 *
 * The email phrases `intros[].gpcShortId` into the `upcoming` carrot.
 */
export async function fetchIntroForecast(
  username: string,
): Promise<import('./introForecast').IntroForecastSnapshot | null> {
  const config = (await import('../../skuilder.config.json')).default;
  const courseId: string = config.course;
  const dbUrl = `${getCouchBaseUrl().replace(/\/+$/, '')}/${usernameToDbName(username)}`;
  const docId = `STRATEGY_STATE::${courseId}::IntroForecast`;
  try {
    const res = await fetch(`${dbUrl}/${encodeURIComponent(docId)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as {
      data?: import('./introForecast').IntroForecastSnapshot;
    };
    return doc.data ?? null;
  } catch (err) {
    console.warn('[nudge] intro-forecast read failed for', username, err);
    return null;
  }
}

// ============================================================
// Per-user DB repair
// ============================================================

/**
 * Canonical _design/reviewCards definition. Source-of-truth lives in
 * vue-skuilder `packages/db/src/impl/common/BaseUserDB.ts`
 * (BaseUser.designDocs). Copied verbatim — keep in sync if the framework
 * changes the map fn shape.
 *
 * The framework normally installs this on session init via
 * BaseUser.applyDesignDocs() as a background task. When that path fails or
 * never ran (e.g. accounts created before the framework version that
 * provisions the doc), users present with the symptoms we saw in prod:
 * review queries 404 / return no rows.
 */
const REVIEW_CARDS_MAP_FN = `function (doc) {
            if (doc._id && doc._id.indexOf('card_review') === 0 && doc.courseId && doc.cardId) {
              emit(doc._id, doc.courseId + '-' + doc.cardId);
            }
          }`;

export interface RepairResult {
  username: string;
  dbName: string;
  ok: boolean;
  /** True if we did a PUT (created or updated). False if no action needed. */
  changed: boolean;
  error: string | null;
}

/**
 * Install/repair `_design/reviewCards` on a single user DB. Idempotent:
 *   - missing → PUT
 *   - present but empty/wrong map fn → PUT with _rev (replace)
 *   - present with matching map fn → no-op
 */
export async function repairReviewCards(username: string): Promise<RepairResult> {
  const dbName = usernameToDbName(username);
  const dbUrl = `${getCouchBaseUrl().replace(/\/+$/, '')}/${dbName}`;
  const result: RepairResult = {
    username,
    dbName,
    ok: false,
    changed: false,
    error: null,
  };

  let existingRev: string | undefined;
  try {
    const res = await fetch(`${dbUrl}/_design/reviewCards`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const doc = (await res.json()) as ReviewCardsDesignDoc;
      existingRev = doc._rev;
      const map = doc.views?.reviewCards?.map;
      if (typeof map === 'string' && map.trim() === REVIEW_CARDS_MAP_FN.trim()) {
        result.ok = true;
        result.changed = false;
        return result;
      }
    } else if (res.status !== 404) {
      result.error = `pre-check ${res.status}`;
      return result;
    }
  } catch (err) {
    result.error = `pre-check failed: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  const body: ReviewCardsDesignDoc & { language?: string } = {
    language: 'javascript',
    views: { reviewCards: { map: REVIEW_CARDS_MAP_FN } },
  };
  if (existingRev) body._rev = existingRev;

  try {
    const res = await fetch(`${dbUrl}/_design/reviewCards`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      result.error = `PUT ${res.status}: ${text.slice(0, 200)}`;
      return result;
    }
    result.ok = true;
    result.changed = true;
    return result;
  } catch (err) {
    result.error = `PUT failed: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }
}

/**
 * Repair reviewCards across many users with bounded concurrency. Same
 * shape as fetchUserDbHealth — pass a progress callback if you want to
 * surface it in the UI.
 */
export async function repairReviewCardsBatch(
  usernames: string[],
  concurrency: number = 4,
  onProgress?: (done: number, total: number) => void,
): Promise<RepairResult[]> {
  const results: RepairResult[] = new Array(usernames.length);
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= usernames.length) return;
      results[i] = await repairReviewCards(usernames[i]);
      done++;
      onProgress?.(done, usernames.length);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, usernames.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

/**
 * Run health probes across a list of usernames with a small concurrency limit.
 * 4 requests per user × N users — bound concurrency so we don't slam couch.
 */
export async function fetchUserDbHealth(
  usernames: string[],
  concurrency: number = 4,
  onProgress?: (done: number, total: number) => void,
): Promise<UserDbHealth[]> {
  const results: UserDbHealth[] = new Array(usernames.length);
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= usernames.length) return;
      results[i] = await probeUserDb(usernames[i]);
      done++;
      onProgress?.(done, usernames.length);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, usernames.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
