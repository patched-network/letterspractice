/**
 * userProfileSnapshot — capture and load a learner's complete user-state as a
 * portable, TIME-INVARIANT JSON snapshot.
 *
 * Primary consumer: /showHN personas ("day one" / "a few weeks in" /
 * "experienced") — canned learner states hydrated into a throwaway guest
 * namespace so an evaluator sees the mid-curriculum machinery instead of the
 * cold-start slice. Designed as the substrate the eventual general
 * profile-transfer API grows out of (per-child profiles for family sharing,
 * milestone sharables read the same surface). See agent/show-hn-view/SPEC.md.
 *
 * ## The manifest is the load-bearing artifact
 *
 * {@link USER_STATE_DOC_KINDS} enumerates every doc family that constitutes
 * "a learner". It is shared by capture, load, and wipe
 * ({@link wipeUserStateDocs}, which `clearUserProgress` also uses), so the
 * three operations cannot drift: a new user-state doc type added without a
 * manifest entry is invisible to ALL of them, which shows up immediately in
 * dev (cleared users retain state; loaded personas lack it) rather than as a
 * subtle one-consumer bug.
 *
 * ## Time invariance (why snapshots store offsets, not dates)
 *
 * A learner's state is meaningful only relative to "now": reviews due in two
 * days, a history whose last rep was yesterday. A snapshot captured in July
 * must still mean "a few weeks in" when loaded in November. So capture
 * replaces every ISO timestamp with `{ $tsOffsetMs }` — its distance from
 * capture time (negative = past) — and load rebases onto the wall clock at
 * load time. Overdue-ness is preserved exactly: a review captured 3 days
 * overdue loads 3 days overdue, which is what makes backlog pressure
 * demonstrable on /showHN.
 *
 * Authoring note: snapshots are captured from real local play (optionally
 * fast-forwarded with the dbg date-offset shim — `Date.now()` is patched, so
 * offsets stay internally consistent). Hand-crafting fixture state would be
 * fabricated state wearing a persona costume, which the /showHN
 * no-recomputation stance exists to avoid.
 *
 * ## Portability across users
 *
 * USER_OUTCOME docs embed the source username in `_id` and `userId`; capture
 * replaces it with a sentinel and load substitutes the destination user.
 * Scheduled-card `_id`s embed the review time ITSELF (the due-review read
 * path parses the id, not the field), so load regenerates them with the
 * framework's `makeScheduledCardId`.
 *
 * ## Scope notes
 *
 * - ISO-string timestamps only. The only epoch-ms numbers in these docs are
 *   durations (`timeSpent`, `bestInterval`), which must NOT be rebased.
 * - localStorage state (onboarding, session tracking) is deliberately not
 *   captured: personas hydrate fresh guests, and the demo surface doesn't
 *   consult it. Revisit if this grows into real profile transfer.
 * - Card ids referenced by histories may be orphaned by later content
 *   deploys; the app handles missing-card histories gracefully (per Colin,
 *   this is a known, handled condition).
 */

import {
  DocType,
  DocTypePrefixes,
  getDataLayer,
  makeScheduledCardId,
  type UserDBInterface,
} from '@vue-skuilder/db';
import config from '../../skuilder.config.json';
import { invalidateLetterProgressionCache } from './userState';

const COURSE_ID: string = config.course;

/** Replaces the source username inside portable docs. */
const USER_SENTINEL = '$SNAPSHOT_USER$';

/** Strict ISO-8601 datetime — what moment/Date `toISOString()` emit (plus tz-offset forms). */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})$/;

// ============================================================================
// Snapshot format
// ============================================================================

export const SNAPSHOT_FORMAT = 'lp-user-snapshot';
export const SNAPSHOT_VERSION = 1;

/** An ISO timestamp, encoded as its distance from capture time (negative = past). */
interface EncodedTimestamp {
  $tsOffsetMs: number;
}

export interface UserProfileSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  label: string;
  /** Informational. If the dbg date shim was active at capture, this is the shimmed clock. */
  capturedAt: string;
  courseId: string;
  /** Informational — the user the state was captured from. */
  sourceUsername: string;
  /** ELO block + status from the course-registration entry. */
  regEntry: { elo: unknown; status?: string } | null;
  /** All user-state docs per the manifest: `_rev` stripped, timestamps offset-encoded. */
  docs: Record<string, unknown>[];
}

// ============================================================================
// Manifest
// ============================================================================

interface UserStateDocKind {
  label: string;
  /** allDocs id-range prefix for this doc family. */
  prefix: (courseId: string) => string;
  /**
   * Make the doc portable at capture (strip embedded user/time from `_id`,
   * sentinel-ize user fields). Runs AFTER timestamp encoding.
   */
  encode?: (doc: Record<string, unknown>, sourceUsername: string) => void;
  /**
   * Reverse {@link encode} at load. Runs AFTER timestamp decoding, so
   * time-bearing fields are already rebased and ids can be derived from them.
   */
  decode?: (doc: Record<string, unknown>, destUsername: string) => void;
}

/**
 * Every doc family that constitutes a learner. Mirrors (and is now consumed
 * by) `clearUserProgress`'s delete list — if you add a kind here, all of
 * capture/load/wipe pick it up together.
 */
export const USER_STATE_DOC_KINDS: UserStateDocKind[] = [
  {
    label: 'Card histories',
    prefix: () => DocTypePrefixes[DocType.CARDRECORD],
    // `records[].timeStamp` handled by the generic timestamp walk; the id
    // embeds only course/card ids, which are portable as-is.
  },
  {
    label: 'Scheduled reviews',
    prefix: () => DocTypePrefixes[DocType.SCHEDULED_CARD],
    encode: (doc) => {
      // The id embeds the review time (and the read path PARSES the id, so it
      // is the datum). `reviewTime` carries the same instant and is already
      // offset-encoded by the walk — regenerate the id from it at load.
      doc._id = `${DocTypePrefixes[DocType.SCHEDULED_CARD]}$FROM_REVIEW_TIME`;
    },
    decode: (doc) => {
      doc._id = makeScheduledCardId(doc.reviewTime as string);
      // Clamp creation time to "now": authoring with the dev date shim can
      // leave scheduledAt up to ~a day in capture's future (the shim
      // increments at session end, per tab, so a capture from a tab holding a
      // stale offset trails the last session's writes). A future scheduledAt
      // would false-positive /showHN's "review scheduled by this response"
      // discriminator (annotationFeed.findFreshReview). Harmless to clamp:
      // scheduledAt is provenance metadata, and post-rebase it is demo
      // fiction anyway; reviewTime (the behavioral datum) is untouched.
      const schedAt = Date.parse(doc.scheduledAt as string);
      if (!Number.isNaN(schedAt) && schedAt > Date.now()) {
        doc.scheduledAt = new Date().toISOString();
      }
    },
  },
  {
    label: 'User outcomes',
    prefix: () => DocTypePrefixes[DocType.USER_OUTCOME],
    // Id format: USER_OUTCOME::{courseId}::{userId}::{periodEnd}. The userId
    // is the capture-side user; periodEnd duplicates the (rebased) field.
    encode: (doc, sourceUsername) => {
      doc._id = `${DocTypePrefixes[DocType.USER_OUTCOME]}::$FROM_FIELDS`;
      if (doc.userId === sourceUsername) doc.userId = USER_SENTINEL;
    },
    decode: (doc, destUsername) => {
      if (doc.userId === USER_SENTINEL) doc.userId = destUsername;
      doc._id = `${DocTypePrefixes[DocType.USER_OUTCOME]}::${doc.courseId}::${doc.userId}::${doc.periodEnd}`;
    },
  },
  {
    label: 'Strategy learning state',
    prefix: () => DocTypePrefixes[DocType.STRATEGY_LEARNING_STATE],
  },
  {
    label: 'Study sessions',
    // Id format: SESSION::{courseId}::{userId}::{sessionId}. Included so a
    // persona carries its own session history — /showHN's "a few weeks in"
    // learner should look like someone who has *had* sittings, and so that
    // clearUserProgress actually clears them (a manifest omission would make
    // these invisible to capture, load AND wipe alike).
    //
    // Timestamps inside (startTime/endTime, run `at`s, snapshot `at`s) are
    // offset-encoded by the generic walk, so a loaded persona's sessions sit
    // the same distance in the past as when captured.
    prefix: () => DocTypePrefixes[DocType.STUDY_SESSION],
    encode: (doc, sourceUsername) => {
      doc._id = `${DocTypePrefixes[DocType.STUDY_SESSION]}::$FROM_FIELDS`;
      if (doc.userId === sourceUsername) doc.userId = USER_SENTINEL;
    },
    decode: (doc, destUsername) => {
      if (doc.userId === USER_SENTINEL) doc.userId = destUsername;
      doc._id = `${DocTypePrefixes[DocType.STUDY_SESSION]}::${doc.courseId}::${doc.userId}::${doc.sessionId}`;
    },
  },
  {
    label: 'Strategy state (course-scoped)',
    // LetterProgression, UserProfile, lesson progress, vignette progress,
    // prescribed progress — everything under STRATEGY_STATE::{courseId}::*.
    // This family includes the lesson-progress doc, which is the actual
    // unlock key for LessonGateFilter's default-deny gating: a persona
    // without it behaves like day one regardless of its ELO.
    prefix: (courseId) => `${DocTypePrefixes[DocType.STRATEGY_STATE]}::${courseId}`,
  },
];

// ============================================================================
// Timestamp encode/decode (deep, symmetric)
// ============================================================================

function walkTimestamps(value: unknown, transform: (v: unknown) => unknown): unknown {
  const direct = transform(value);
  if (direct !== value) return direct;
  if (Array.isArray(value)) return value.map((v) => walkTimestamps(v, transform));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walkTimestamps(v, transform);
    return out;
  }
  return value;
}

function encodeTimestamps<T>(doc: T, capturedAtMs: number): T {
  return walkTimestamps(doc, (v) => {
    if (typeof v === 'string' && ISO_RE.test(v)) {
      const ms = Date.parse(v);
      if (!Number.isNaN(ms)) return { $tsOffsetMs: ms - capturedAtMs } satisfies EncodedTimestamp;
    }
    return v;
  }) as T;
}

function decodeTimestamps<T>(doc: T, nowMs: number): T {
  return walkTimestamps(doc, (v) => {
    if (v !== null && typeof v === 'object' && '$tsOffsetMs' in (v as object)) {
      return new Date(nowMs + (v as EncodedTimestamp).$tsOffsetMs).toISOString();
    }
    return v;
  }) as T;
}

// ============================================================================
// DB access
// ============================================================================

function getUserDB(): UserDBInterface {
  return getDataLayer().getUserDB();
}

/** Raw PouchDB escape hatch — same one UserDBDebugger and clearUserProgress use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRawUserDB(): any {
  const raw = (getUserDB() as any).localDB; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!raw) throw new Error('[snapshot] Unable to access raw user database.');
  return raw;
}

async function docsForKind(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawDB: any,
  kind: UserStateDocKind,
  courseId: string,
  include_docs: boolean
) {
  const prefix = kind.prefix(courseId);
  return rawDB.allDocs({ startkey: prefix, endkey: prefix + '\ufff0', include_docs });
}

// ============================================================================
// API
// ============================================================================

/**
 * Serialize the current user's complete course state. Pure read — the live
 * user is untouched.
 */
export async function captureUserProfile(label = 'unlabeled'): Promise<UserProfileSnapshot> {
  const userDB = getUserDB();
  const rawDB = getRawUserDB();
  const capturedAtMs = Date.now();
  const sourceUsername = userDB.getUsername();

  const docs: Record<string, unknown>[] = [];
  for (const kind of USER_STATE_DOC_KINDS) {
    const result = await docsForKind(rawDB, kind, COURSE_ID, true);
    for (const row of result.rows) {
      const { _rev: _drop, ...doc } = row.doc as Record<string, unknown>;
      void _drop;
      const encoded = encodeTimestamps(doc, capturedAtMs);
      kind.encode?.(encoded, sourceUsername);
      docs.push(encoded);
    }
  }

  const regDoc = await userDB.getCourseRegistrationsDoc();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = regDoc.courses.find((c: any) => c.courseID === COURSE_ID);

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    label,
    capturedAt: new Date(capturedAtMs).toISOString(),
    courseId: COURSE_ID,
    sourceUsername,
    regEntry: entry ? { elo: encodeTimestamps(entry.elo, capturedAtMs), status: entry.status } : null,
    docs,
  };
}

/**
 * Bulk-delete every manifest doc family for the current user. Shared by
 * `clearUserProgress` and {@link loadUserProfile}. Returns per-kind counts.
 */
export async function wipeUserStateDocs(): Promise<Record<string, number>> {
  const rawDB = getRawUserDB();
  const counts: Record<string, number> = {};

  for (const kind of USER_STATE_DOC_KINDS) {
    const result = await docsForKind(rawDB, kind, COURSE_ID, false);
    if (result.rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toDelete = result.rows.map((row: any) => ({
        _id: row.id,
        _rev: row.value.rev,
        _deleted: true,
      }));
      await rawDB.bulkDocs(toDelete);
    }
    counts[kind.label] = result.rows.length;
  }
  return counts;
}

/**
 * Replace the current user's course state with a snapshot, rebased so that
 * "now" plays the role capture time played. Destructive to the current
 * user's state by design — callers own the confirmation UX. The page (or at
 * minimum the session) must be reloaded afterwards; in-memory state
 * (pipelines, caches, reactive stores) is not refreshed here.
 */
export async function loadUserProfile(snapshot: UserProfileSnapshot): Promise<void> {
  if (snapshot.format !== SNAPSHOT_FORMAT || snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(`[snapshot] Unrecognized snapshot format/version.`);
  }
  if (snapshot.courseId !== COURSE_ID) {
    throw new Error(
      `[snapshot] Snapshot is for course ${snapshot.courseId}; this app runs ${COURSE_ID}.`
    );
  }

  const userDB = getUserDB();
  const rawDB = getRawUserDB();
  const nowMs = Date.now();
  const destUsername = userDB.getUsername();

  await wipeUserStateDocs();

  const byPrefix = (id: string) =>
    USER_STATE_DOC_KINDS.find((k) => id.startsWith(k.prefix(snapshot.courseId)));

  const decoded = snapshot.docs.map((raw) => {
    const doc = decodeTimestamps(raw, nowMs) as Record<string, unknown>;
    byPrefix(raw._id as string)?.decode?.(doc, destUsername);
    return doc;
  });
  await rawDB.bulkDocs(decoded);

  // Course-registration entry: ELO block + status. Creates the entry if the
  // destination user (e.g. a brand-new guest) hasn't registered yet.
  if (snapshot.regEntry) {
    const regDoc = await userDB.getCourseRegistrationsDoc();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let entry = regDoc.courses.find((c: any) => c.courseID === snapshot.courseId);
    if (!entry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entry = { courseID: snapshot.courseId } as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      regDoc.courses.push(entry as any);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry as any).elo = decodeTimestamps(snapshot.regEntry.elo, nowMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry as any).status = snapshot.regEntry.status ?? 'active';
    await rawDB.put(regDoc);
  }

  // The docs changed underneath the app; drop the one module-level cache of
  // user state so post-load reads see the loaded profile. (Everything else —
  // session controller, annotation feed, pipeline ring buffer — is owned by
  // the calling view, which is responsible for restarting its session.)
  invalidateLetterProgressionCache();
}

/**
 * The empty profile: loading it wipes to a brand-new learner (default ELO, no
 * history, no unlocks). Lets "reset to day one" share the exact code path of
 * persona loading instead of being a parallel wipe implementation.
 */
export function makeEmptySnapshot(label = 'fresh'): UserProfileSnapshot {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    label,
    capturedAt: new Date().toISOString(),
    courseId: COURSE_ID,
    sourceUsername: 'none',
    regEntry: {
      elo: { global: { score: 1000, count: 0 }, tags: {}, misc: {} },
      status: 'active',
    },
    docs: [],
  };
}

/** Trigger a browser download of a snapshot — the fixture-authoring exit ramp. */
export function downloadSnapshot(snapshot: UserProfileSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${snapshot.label.replace(/[^a-z0-9-]+/gi, '-')}.snapshot.json`;
  a.click();
  URL.revokeObjectURL(url);
}
