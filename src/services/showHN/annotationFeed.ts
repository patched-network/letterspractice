/**
 * annotationFeed — the /showHN annotated-session data source.
 *
 * Produces one {@link ResponseAnnotation} per question response, carrying the
 * *observed* internals the view renders: user-ELO movement, the SRS interval
 * that got scheduled, the navigation decision, and the card's authored ELO.
 *
 * Every number here is a **read of persisted state**, never a recomputation.
 * That is the whole point of the view — the pitch is "falsifiable in real
 * time", so a client-side reimplementation of `adjustCourseScoresPerTag` (or
 * of `newInterval`) would be a claim dressed as an observation. Two concrete
 * reasons beyond the rhetorical one:
 *
 *   - a mirror silently lies the moment it drifts from `EloService`;
 *   - `newInterval` is NOT pure — it writes `bestInterval` back to the user DB
 *     as a side effect (`db/src/study/SpacedRepetition.ts`). Calling it from
 *     here would double-write the learner's SRS state.
 *
 * ## Why entries resolve asynchronously
 *
 * `OutcomeObserver` fires while both writes are still in flight — its own
 * docstring says so ("the ELO write for this response is already in flight"),
 * and `ResponseProcessor` `void`s `srsService.scheduleReview(...)`. So we
 * cannot read the results synchronously with the answer.
 *
 * Rather than fight that, the feed is an append-only *log*: the observer
 * synchronously appends an unresolved entry (card, tags, correctness, nav
 * decision), and a resolver fills in ELO + SRS a beat later by polling the
 * user's DB. This reads better anyway — the evaluator watches the machinery
 * land rather than seeing it pre-baked.
 *
 * Reads hit the user's *local PouchDB*, not remote couch, so the per-response
 * cost is local I/O. (Relevant to the HN-load criterion in SPEC.md.)
 *
 * ## Registration
 *
 * NOT registered in `useStudySession`'s default `outcomeObservers`. It is
 * passive (it never touches `SessionControls`), so global registration would
 * be harmless — but it would cost a DB read per response in production for
 * data nobody reads. The /showHN view opts in explicitly.
 */
import { ref, type Ref } from 'vue';
import { getDataLayer, type OutcomeObserver, type ScheduledCard } from '@vue-skuilder/db';
import { toCourseElo } from '@vue-skuilder/common';

/** Bounded poll for a write we know is in flight. Local pouch settles fast. */
const RESOLVE_POLL_MS = 60;
const RESOLVE_MAX_TRIES = 8;

/** A single observed read of the user's global ELO. `count` doubles as a write-marker (see `resolve`). */
interface EloReading {
  score: number;
  count: number;
}

/** User-ELO movement across a single response. `delta === 0` is a legitimate observed outcome. */
export interface EloMovement {
  before: number;
  after: number;
  delta: number;
}

/** The review this response scheduled, as persisted. */
export interface SrsScheduling {
  intervalSeconds: number;
  nextReviewAt: string;
}

export interface ResponseAnnotation {
  /** Discriminator: this feed shares a timeline with `sessionMonitor`'s events. */
  kind: 'response';
  /** Stable key for list rendering; entries are replaced, not mutated, on resolve. */
  id: string;
  at: number;
  cardId: string;
  tags: string[];
  isCorrect: boolean;
  /** `'none' | 'marked-failed' | 'dismiss-failed' | …` — the nav decision for this response. */
  nextCardAction: string;
  /**
   * The card's difficulty rating as it stood when the card was served (its
   * `elo.global.score` at hydration). Since 2026-09-18 the course DB accepts
   * bounded learner-driven card ELO writes, so this moves over time; it is a
   * snapshot, not a live value.
   */
  cardEloAtServe: number | null;
  /**
   * Resolved a beat after `at`. Null while the write is in flight, and null if
   * it never landed inside the poll window — never a stand-in zero. A landed
   * write with no movement is `{ delta: 0 }`, which is a different fact.
   */
  userElo: EloMovement | null;
  /** Null for cards that schedule no review (e.g. `srs:skip` intro cards). */
  srs: SrsScheduling | null;
  /** True once the resolver has finished, whether or not it observed anything. */
  resolved: boolean;
}

export interface AnnotationFeed {
  entries: Ref<ResponseAnnotation[]>;
  observer: OutcomeObserver;
  /**
   * Last observed user ELO. Advances only when a write is seen to land, so the
   * state strip shows a persisted value, never an optimistic one.
   */
  currentElo: Ref<number | null>;
  /** Seed the ELO baseline. Call once, before the session starts. */
  seed: (courseId: string) => Promise<void>;
  clear: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The user's ELO is stored `Eloish` (legacy bare number or `CourseElo`), so it
 * goes through `toCourseElo`. A card's `card_elo` is already a plain number —
 * no normalisation needed there.
 */
async function readUserElo(courseId: string): Promise<EloReading | null> {
  const userDB = getDataLayer().getUserDB();
  const regDoc = await userDB.getCourseRegistrationsDoc();
  const reg = regDoc.courses.find((c) => c.courseID === courseId);
  return reg ? { ...toCourseElo(reg.elo).global } : null;
}

const toIso = (t: string | { toISOString(): string }): string =>
  typeof t === 'string' ? t : t.toISOString();

/**
 * Find the review scheduled *by this response*. `scheduleReview` removes any
 * prior review for the card and inserts a fresh one, so we discriminate on
 * `scheduledAt` — the doc's creation time — being at/after the response.
 *
 * NOT on `reviewTime > now`: a stale review for the same card scheduled by an
 * *earlier* response also has a future `reviewTime`, and reading it during the
 * delete+insert window would attribute the old interval to this response.
 * (Small skew allowance: `scheduledAt` is written by the same client clock,
 * but `since` is captured before the write path runs, so >= with a 1s grace.)
 */
function findFreshReview(reviews: ScheduledCard[], cardId: string, since: number): ScheduledCard | null {
  return (
    reviews.find(
      (r) => r.cardId === cardId && Date.parse(toIso(r.scheduledAt)) >= since - 1000
    ) ?? null
  );
}

export function createAnnotationFeed(): AnnotationFeed {
  const entries = ref<ResponseAnnotation[]>([]);
  const currentElo = ref<number | null>(null);

  /**
   * Last ELO we *observed* persisted. Seeded once, then advanced on each
   * resolution — this is the `before` for the next response. Tracking it here
   * (rather than reading it inside the observer) sidesteps the in-flight race:
   * a read at observer time may catch either side of the pending write.
   */
  let lastKnownElo: EloReading | null = null;
  let seq = 0;

  const patch = (id: string, fields: Partial<ResponseAnnotation>) => {
    const i = entries.value.findIndex((e) => e.id === id);
    if (i === -1) return;
    entries.value = entries.value.map((e, j) => (j === i ? { ...e, ...fields } : e));
  };

  /**
   * Poll the in-flight writes until they land.
   *
   * ELO landing is detected on `global.count`, NOT on `global.score`. Every
   * response increments the count (`adjustScores`: `count: userElo.count + 1`),
   * but the score may legitimately move by ~0. Watching the score therefore
   * cannot distinguish "the write landed and the delta was zero" from "the
   * write hasn't landed yet" — and rendering a fabricated `delta: 0` for a
   * write we never observed is precisely the dishonesty this view exists to
   * avoid. The count is a monotonic write-marker, so it separates the two.
   *
   * On timeout, `userElo`/`srs` stay null: the entry resolves as *unobserved*,
   * and the view renders that as such rather than as a zero.
   */
  async function resolve(id: string, courseId: string, cardId: string, since: number) {
    const userDB = getDataLayer().getUserDB();
    const before = lastKnownElo;

    let userElo: EloMovement | null = null;
    let srs: SrsScheduling | null = null;

    for (let i = 0; i < RESOLVE_MAX_TRIES; i++) {
      await sleep(RESOLVE_POLL_MS);

      if (!userElo && before) {
        const after = await readUserElo(courseId);
        if (after && after.count > before.count) {
          userElo = { before: before.score, after: after.score, delta: after.score - before.score };
          lastKnownElo = after;
          currentElo.value = after.score;
        }
      }
      if (!srs) {
        // Forecast, not getPendingReviews: "pending" means DUE, i.e. reviewTime
        // in the past — a review scheduled by this response is necessarily in
        // the future and would never appear there. (That exact mistake shipped
        // first, and rendered "none scheduled" on every card.)
        const review = findFreshReview(await userDB.getReviewsForcast(365, courseId), cardId, since);
        if (review) {
          const t = toIso(review.reviewTime);
          srs = { nextReviewAt: t, intervalSeconds: Math.round((Date.parse(t) - since) / 1000) };
        }
      }
      if (userElo && srs) break;
    }

    // Not every response schedules a review (`srs:skip` intro cards), so a null
    // `srs` is expected, not an error. A null `userElo` means the write did not
    // land inside the poll window — rare, and rendered as "pending", never as 0.
    patch(id, { userElo, srs, resolved: true });
  }

  const observer: OutcomeObserver = (outcome) => {
    const at = Date.now();
    const id = `ann-${seq++}`;
    const courseId = outcome.card.course_id;
    const cardId = outcome.card.card_id;

    entries.value = [
      ...entries.value,
      {
        kind: 'response',
        id,
        at,
        cardId,
        tags: [...outcome.card.tags],
        isCorrect: outcome.record.isCorrect,
        nextCardAction: outcome.result.nextCardAction,
        cardEloAtServe: outcome.card.card_elo ?? null,
        userElo: null,
        srs: null,
        resolved: false,
      },
    ];

    // Fire-and-forget: the observer is awaited by the session, and SessionController
    // warns against stalling navigation from inside one.
    void resolve(id, courseId, cardId, at);
  };

  return {
    entries,
    observer,
    currentElo,
    seed: async (courseId: string) => {
      lastKnownElo = await readUserElo(courseId);
      currentElo.value = lastKnownElo?.score ?? null;
    },
    clear: () => {
      entries.value = [];
      seq = 0;
    },
  };
}
