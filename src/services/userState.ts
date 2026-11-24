/**
 * User state service layer for letterspractice.
 *
 * Provides typed read/write access to per-user, per-course state documents
 * stored via the `UsrCrsDataInterface` strategy state API. The courseId is
 * bound once (from skuilder.config.json), so consuming code never handles
 * raw courseId + strategyKey pairs.
 *
 * Storage path:
 *   PouchDB (local) → CouchDB (remote, for logged-in users)
 *   Guest data migrates automatically on signup via `migrateFunnelData()`.
 *
 * See: agent/user-state-storage/a.4.plan-revised.md
 */

import { getDataLayer } from '@vue-skuilder/db';
import type { UsrCrsDataInterface } from '@vue-skuilder/db';
import config from '../../skuilder.config.json';
import type {
  UserProfileData,
  LetterProgressionState,
  PrescribedProgressState,
  VignetteProgressState,
  FridgeSheetState,
  PlatformState,
  SessionPrefsState,
} from './userState.types';
import type { SessionLengthMode } from './sessionLengthPolicy';
import { withCompletedSession, withUnlock, type DailyDoseState } from './dailyDose';
import type { LessonProgressState } from './lessons.types';
import { USER_STATE_KEYS } from './userState.types';
import { countReachableWords } from './reachableWords/freeSlateCount';
import { STAGE_COUNT as VIGNETTE_STAGE_COUNT } from '../practicing/juggling-sessions/stages/skill-timeline';

const COURSE_ID: string = config.course;

/**
 * Get a course-scoped database interface.
 *
 * The returned object binds all operations to `COURSE_ID`, preventing
 * accidental cross-course data access.
 */
async function getCourseDB(): Promise<UsrCrsDataInterface> {
  return getDataLayer().getUserDB().getCourseInterface(COURSE_ID);
}

// ============================================================================
// User Profile (onboarding data)
// ============================================================================

/**
 * Load the user's persisted profile (onboarding data).
 *
 * @returns The profile data, or null if no profile has been persisted yet.
 */
export async function getUserProfile(): Promise<UserProfileData | null> {
  try {
    const crs = await getCourseDB();
    return await crs.getStrategyState<UserProfileData>(USER_STATE_KEYS.USER_PROFILE);
  } catch (e) {
    console.warn('[userState] Failed to load user profile from UserDB:', e);
    return null;
  }
}

/**
 * Persist the user's profile (onboarding data) to UserDB.
 *
 * This is best-effort: localStorage in the onboarding store remains the
 * primary fast path. Failures here are logged but not thrown.
 */
export async function putUserProfile(data: UserProfileData): Promise<void> {
  try {
    const crs = await getCourseDB();
    await crs.putStrategyState<UserProfileData>(USER_STATE_KEYS.USER_PROFILE, data);
  } catch (e) {
    console.warn('[userState] Failed to persist user profile to UserDB:', e);
  }
}

// ============================================================================
// Letter Progression
// ============================================================================

/**
 * In-memory progression cache, tagged with the username it was read for.
 *
 * The tag is load-bearing, not bookkeeping. Logout is an SPA navigation
 * (`router.push('/')`) — the module never reloads — so an untagged cache walks
 * straight across an identity change. That went further than a stale read:
 * because the writers below do read-modify-write, the departing account's
 * `unlockedLetters` got written into the arriving account's document, and
 * `putStrategyState` replaces the whole document. One correct WST answer after
 * an account switch was enough to permanently truncate a 32-grapheme account
 * to a sibling's 6, locally and then via replication.
 *
 * `state: null` is a real value (loaded, no document — first-time user), so
 * absence is expressed by the whole entry being undefined.
 */
type LetterProgressionCacheEntry = {
  username: string;
  state: LetterProgressionState | null;
};
let letterProgressionCache: LetterProgressionCacheEntry | undefined = undefined;

/**
 * The current identity, or null if the data layer isn't up yet.
 *
 * Used only to scope the cache. When it returns null we neither serve nor
 * populate the cache — an unidentifiable reader is exactly the case that
 * must not inherit someone else's progression.
 */
function currentUsername(): string | null {
  try {
    return getDataLayer().getUserDB().getUsername();
  } catch {
    return null;
  }
}

/**
 * Synchronous cache read for letter progression.
 *
 * Returns `undefined` if the cache has never been populated for the current
 * user (i.e. no async read or write has completed yet this session, or the
 * cached entry belongs to a previously logged-in account). Callers that need
 * to avoid an async gap (e.g. component onMounted during a card transition)
 * should check this first and fall back to getLetterProgression() only when it
 * returns undefined.
 */
export function getLetterProgressionSync(): LetterProgressionState | null | undefined {
  const username = currentUsername();
  if (username === null || letterProgressionCache?.username !== username) {
    return undefined;
  }
  return letterProgressionCache.state;
}

/**
 * Drop the in-memory progression cache so the next read hits the DB. Needed
 * when user-state docs are replaced underneath a running app —
 * `loadUserProfile` (persona/profile hydration) calls this; nothing in the
 * normal learner flow should.
 *
 * Identity changes do NOT need this: the cache is username-scoped, so a switch
 * misses on its own. Keeping correctness off the login/logout call sites is
 * deliberate — a missed invalidation there is what caused the original bug.
 */
export function invalidateLetterProgressionCache(): void {
  letterProgressionCache = undefined;
}

/**
 * Read letter progression straight from the DB, bypassing the cache.
 *
 * The read-modify-write paths use this rather than getLetterProgression(): a
 * cache hit there would let a stale (or another account's) array become the
 * base of a whole-document overwrite.
 */
async function readLetterProgressionFresh(): Promise<LetterProgressionState | null> {
  const crs = await getCourseDB();
  const result = await crs.getStrategyState<LetterProgressionState>(USER_STATE_KEYS.LETTER_PROGRESSION);
  const username = currentUsername();
  if (username !== null) {
    letterProgressionCache = { username, state: result };
  }
  return result;
}

/**
 * Load the user's letter progression state.
 *
 * Cached per-user after the first read. All writes go through
 * putLetterProgression, which keeps the cache current — so callers that follow
 * a put (e.g. WhoSaidThatView.onMounted after recordGpcIntroComplete) get a
 * synchronous resolved-promise instead of a second DB round-trip.
 *
 * @returns The progression state, or null if none exists (first-time user).
 */
export async function getLetterProgression(): Promise<LetterProgressionState | null> {
  const username = currentUsername();
  if (username !== null && letterProgressionCache?.username === username) {
    return letterProgressionCache.state;
  }
  try {
    return await readLetterProgressionFresh();
  } catch (e) {
    console.warn('[userState] Failed to load letter progression from UserDB:', e);
    return null;
  }
}

/**
 * Persist the user's letter progression state to UserDB.
 *
 * Updates the in-memory cache immediately so subsequent getLetterProgression
 * calls within the same session are synchronous.
 * Failures are logged but not thrown.
 */
export async function putLetterProgression(state: LetterProgressionState): Promise<void> {
  const username = currentUsername();
  if (username !== null) {
    letterProgressionCache = { username, state };
  }
  try {
    const crs = await getCourseDB();
    await crs.putStrategyState<LetterProgressionState>(USER_STATE_KEYS.LETTER_PROGRESSION, state);
  } catch (e) {
    console.warn('[userState] Failed to persist letter progression to UserDB:', e);
  }
}

// ============================================================================
// Prescribed Progress
// ============================================================================

/**
 * Load the user's prescribed-progress state.
 *
 * This mirrors the singleton `prescribed` navigator's strategy-state slot and
 * is primarily intended for debug / reporting surfaces inside letterspractice.
 *
 * @returns The prescribed progress state, or null if none exists yet.
 */
export async function getPrescribedProgress(): Promise<PrescribedProgressState | null> {
  try {
    const crs = await getCourseDB();
    return await crs.getStrategyState<PrescribedProgressState>(
      USER_STATE_KEYS.PRESCRIBED_PROGRESS,
    );
  } catch (e) {
    console.warn('[userState] Failed to load prescribed progress from UserDB:', e);
    return null;
  }
}

// ============================================================================
// GPC Intro — Letter Unlock
// ============================================================================

/**
 * Unlock a letter on GPC Intro completion.
 *
 * This is the primary unlock mechanism: completing the intro for a GPC
 * immediately adds the letter to `unlockedLetters`. No threshold — the
 * intro IS the gate.
 *
 * @returns The updated state, or null on failure.
 */
export async function recordGpcIntroComplete(letter: string): Promise<LetterProgressionState | null> {
  const l = letter.toLowerCase();

  try {
    // Fresh read, not getLetterProgression(): this is the base of a
    // whole-document overwrite, so it must reflect the DB rather than whatever
    // the cache happens to hold.
    const current = await readLetterProgressionFresh();

    // Already unlocked — no-op
    if (current?.unlockedLetters.includes(l)) return current;

    const unlockedLetters = [...(current?.unlockedLetters ?? []), l];

    // Copy rather than mutate: `current` may be the object the cache is
    // holding, and callers hang on to what we return.
    const state: LetterProgressionState = {
      ...current,
      unlockedLetters,
      // Recompute the entitlement metric here — the one moment its input
      // changes. Cheap (~0.03ms over a 34KB mask table), and it keeps every
      // other reader, including out-of-band ones like the lifecycle mailer,
      // free of the computation. A failure must not cost the unlock, so it
      // degrades to leaving the previous value in place.
      reachableWordCount:
        (await countReachableSafely(unlockedLetters)) ?? current?.reachableWordCount,
      lastIntroAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await putLetterProgression(state);
    return state;
  } catch (e) {
    console.warn('[userState] Failed to record GPC intro completion:', e);
    return null;
  }
}

/**
 * Count reachable words, swallowing failures.
 *
 * The mask table is a dynamic import; a chunk-load failure on a flaky
 * connection must not take down the letter unlock, which is the thing the
 * child actually just earned.
 */
async function countReachableSafely(graphemes: string[]): Promise<number | undefined> {
  try {
    return await countReachableWords(graphemes);
  } catch (e) {
    console.warn('[userState] Failed to count reachable words:', e);
    return undefined;
  }
}

/**
 * The user's reachable-word count — the entitlement metric.
 *
 * Prefers the persisted value; computes from `unlockedLetters` when absent
 * (accounts last written before the counter shipped) *without* writing —
 * see the `reachableWordCount` docblock in userState.types.ts for why the
 * backfill is deliberately left to the next GPC intro.
 */
export async function getReachableWordCount(): Promise<number> {
  const state = await getLetterProgression();
  if (!state) return 0;
  if (typeof state.reachableWordCount === 'number') return state.reachableWordCount;
  return (await countReachableSafely(state.unlockedLetters)) ?? 0;
}

// ============================================================================
// WST Progress — Spelling Gate
// ============================================================================

/** Number of correct WST answers required before spelling exercises unlock */
const WST_UNLOCK_THRESHOLD = 3;

/**
 * Record a correct WST answer for a letter.
 *
 * Tracks per-letter WST correct-answer counts in `wstProgress`. This data
 * is consumed by LetterGatingFilter to gate spelling/missing-letter cards
 * behind demonstrated phonemic awareness.
 *
 * Note: This does NOT add to `unlockedLetters` (keycap unlock). That's
 * handled by `recordGpcIntroComplete()`. WST progress gates spelling only.
 *
 * @returns The updated state, or null on failure.
 */
export async function recordWstSuccess(letter: string): Promise<LetterProgressionState | null> {
  const l = letter.toLowerCase();

  try {
    // Fresh read + copy-on-write, for the same reasons as
    // recordGpcIntroComplete(). This is the hottest write in the app — one per
    // correct WST answer — so it is also the fastest way to propagate a bad
    // base into the document.
    const current = await readLetterProgressionFresh();
    const wstProgress = { ...(current?.wstProgress ?? {}) };
    wstProgress[l] = (wstProgress[l] ?? 0) + 1;

    const state: LetterProgressionState = {
      ...current,
      unlockedLetters: [...(current?.unlockedLetters ?? [])],
      wstProgress,
      updatedAt: new Date().toISOString(),
    };

    await putLetterProgression(state);
    return state;
  } catch (e) {
    console.warn('[userState] Failed to record WST success:', e);
    return null;
  }
}

// ============================================================================
// Lesson Progress
// ============================================================================

/**
 * Load the user's lesson progress state.
 *
 * @returns The progress state, or null if none exists (first-time user).
 */
export async function getLessonProgress(): Promise<LessonProgressState | null> {
  try {
    const crs = await getCourseDB();
    return await crs.getStrategyState<LessonProgressState>(USER_STATE_KEYS.LESSON_PROGRESS);
  } catch (e) {
    console.warn('[userState] Failed to load lesson progress from UserDB:', e);
    return null;
  }
}

/**
 * Persist the user's lesson progress state to UserDB.
 *
 * Failures are logged but not thrown.
 */
export async function putLessonProgress(state: LessonProgressState): Promise<void> {
  try {
    const crs = await getCourseDB();
    await crs.putStrategyState<LessonProgressState>(USER_STATE_KEYS.LESSON_PROGRESS, state);
  } catch (e) {
    console.warn('[userState] Failed to persist lesson progress to UserDB:', e);
  }
}

/**
 * Record completion of a lesson.
 *
 * Adds the lesson ID to `completedLessons`, clears `currentLesson` if it
 * matches, and resets `skippedCount`.
 *
 * @returns The updated state, or null on failure.
 */
export async function recordLessonComplete(lessonId: string): Promise<LessonProgressState | null> {
  try {
    const current = await getLessonProgress();
    const state: LessonProgressState = current ?? {
      completedLessons: [],
      dismissedLessons: [],
      currentLesson: null,
      skippedCount: 0,
      lastSkippedAt: null,
      postLessonPracticeFlag: null,
      sessionsSinceLastLesson: 0,
      updatedAt: new Date().toISOString(),
    };

    // Ensure new fields exist on legacy state documents
    if (!state.dismissedLessons) state.dismissedLessons = [];
    if (state.sessionsSinceLastLesson === undefined) state.sessionsSinceLastLesson = 0;

    if (!state.completedLessons.includes(lessonId)) {
      state.completedLessons.push(lessonId);
    }

    // First pass only — re-viewing an already-passed lesson keeps its date.
    if (!state.passedAt) state.passedAt = {};
    if (!state.passedAt[lessonId]) state.passedAt[lessonId] = new Date().toISOString();

    if (state.currentLesson === lessonId) {
      state.currentLesson = null;
    }

    state.skippedCount = 0;
    state.lastSkippedAt = null;
    state.sessionsSinceLastLesson = 0;
    state.updatedAt = new Date().toISOString();
    await putLessonProgress(state);
    return state;
  } catch (e) {
    console.warn('[userState] Failed to record lesson completion:', e);
    return null;
  }
}

/**
 * Record that the user skipped past a queued lesson.
 *
 * Increments `skippedCount` and records the timestamp. Used by the nag
 * system to escalate urgency of lesson-viewing.
 *
 * @returns The updated state, or null on failure.
 */
export async function recordLessonSkipped(): Promise<LessonProgressState | null> {
  try {
    const current = await getLessonProgress();
    const state: LessonProgressState = current ?? {
      completedLessons: [],
      dismissedLessons: [],
      currentLesson: null,
      skippedCount: 0,
      lastSkippedAt: null,
      postLessonPracticeFlag: null,
      sessionsSinceLastLesson: 0,
      updatedAt: new Date().toISOString(),
    };

    // Ensure new fields exist on legacy state documents
    if (!state.dismissedLessons) state.dismissedLessons = [];
    if (state.sessionsSinceLastLesson === undefined) state.sessionsSinceLastLesson = 0;

    state.skippedCount += 1;
    state.lastSkippedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    await putLessonProgress(state);
    return state;
  } catch (e) {
    console.warn('[userState] Failed to record lesson skip:', e);
    return null;
  }
}

/**
 * Set the post-lesson practice flag.
 *
 * Called on lesson completion. Signals that the next practice session
 * should be hint-annotated to emphasize the lesson's gated concept tags.
 */
export async function setPostLessonPracticeFlag(lessonId: string): Promise<void> {
  try {
    const current = await getLessonProgress();
    const state: LessonProgressState = current ?? {
      completedLessons: [],
      dismissedLessons: [],
      currentLesson: null,
      skippedCount: 0,
      lastSkippedAt: null,
      postLessonPracticeFlag: null,
      sessionsSinceLastLesson: 0,
      updatedAt: new Date().toISOString(),
    };

    state.postLessonPracticeFlag = lessonId;
    state.updatedAt = new Date().toISOString();
    await putLessonProgress(state);
  } catch (e) {
    console.warn('[userState] Failed to set post-lesson practice flag:', e);
  }
}

/**
 * Clear the post-lesson practice flag.
 *
 * Called when the user engages with a practice session, indicating
 * that hint-annotation is no longer needed.
 */
export async function clearPostLessonPracticeFlag(): Promise<void> {
  try {
    const current = await getLessonProgress();
    if (!current || !current.postLessonPracticeFlag) return;

    current.postLessonPracticeFlag = null;
    current.updatedAt = new Date().toISOString();
    await putLessonProgress(current);
  } catch (e) {
    console.warn('[userState] Failed to clear post-lesson practice flag:', e);
  }
}

/**
 * Record that a lesson was dismissed/acknowledged by the parent.
 *
 * Adds the lesson ID to `dismissedLessons` (not `completedLessons`).
 * Both unlock the same content via LessonGateFilter, but tracking
 * separately enables analytics and potential re-offering.
 *
 * Also resets skippedCount and sessionsSinceLastLesson (same as
 * recordLessonComplete).
 *
 * @returns The updated state, or null on failure.
 */
export async function recordLessonDismissed(lessonId: string): Promise<LessonProgressState | null> {
  try {
    const current = await getLessonProgress();
    const state: LessonProgressState = current ?? {
      completedLessons: [],
      dismissedLessons: [],
      currentLesson: null,
      skippedCount: 0,
      lastSkippedAt: null,
      postLessonPracticeFlag: null,
      sessionsSinceLastLesson: 0,
      updatedAt: new Date().toISOString(),
    };

    // Ensure new fields exist on legacy state documents
    if (!state.dismissedLessons) state.dismissedLessons = [];
    if (state.sessionsSinceLastLesson === undefined) state.sessionsSinceLastLesson = 0;

    if (!state.dismissedLessons.includes(lessonId)) {
      state.dismissedLessons.push(lessonId);
    }

    // First pass only — re-viewing an already-passed lesson keeps its date.
    if (!state.passedAt) state.passedAt = {};
    if (!state.passedAt[lessonId]) state.passedAt[lessonId] = new Date().toISOString();

    if (state.currentLesson === lessonId) {
      state.currentLesson = null;
    }

    state.skippedCount = 0;
    state.lastSkippedAt = null;
    state.sessionsSinceLastLesson = 0;
    state.updatedAt = new Date().toISOString();
    await putLessonProgress(state);
    return state;
  } catch (e) {
    console.warn('[userState] Failed to record lesson dismissal:', e);
    return null;
  }
}

/**
 * Increment the session counter since the last lesson was passed.
 *
 * Called at the end of each practice session. The counter is used by
 * `getNextLesson()` to enforce spacing constraints between concept
 * lessons (e.g., "at least 3 sessions between lessons").
 *
 * @returns The updated state, or null on failure.
 */
export async function incrementSessionsSinceLastLesson(): Promise<LessonProgressState | null> {
  try {
    const current = await getLessonProgress();
    if (!current) return null; // No lesson state yet — nothing to increment

    if (current.sessionsSinceLastLesson === undefined) {
      current.sessionsSinceLastLesson = 0;
    }

    current.sessionsSinceLastLesson += 1;
    current.updatedAt = new Date().toISOString();
    await putLessonProgress(current);
    return current;
  } catch (e) {
    console.warn('[userState] Failed to increment sessions since last lesson:', e);
    return null;
  }
}

// ============================================================================
// Vignette Progress (post-session practicing vignettes)
// ============================================================================

/**
 * Load the vignette progress state.
 *
 * @returns The state, or null if none exists yet (first session).
 */
export async function getVignetteProgress(): Promise<VignetteProgressState | null> {
  try {
    const crs = await getCourseDB();
    return await crs.getStrategyState<VignetteProgressState>(USER_STATE_KEYS.VIGNETTE_PROGRESS);
  } catch (e) {
    console.warn('[userState] Failed to load vignette progress:', e);
    return null;
  }
}

/**
 * Advance vignette progress for a session-end screen about to show a vignette.
 *
 * Returns the 0-based stage index to display NOW (the pre-increment count),
 * and persists the incremented count for the next session. On any failure,
 * returns 0 — the viewer sees stage 1 rather than nothing.
 *
 * Stage clamping to the final (terminal) stage happens in the vignette's
 * stage loader, not here — the count keeps growing monotonically.
 */
export async function advanceVignetteProgress(): Promise<number> {
  try {
    const current = await getVignetteProgress();
    const shown = current?.vignettesShown ?? 0;
    const now = new Date().toISOString();
    // Same clamp as loadStageConfig, so the key is the stage actually shown.
    const stage = String(Math.min(shown, VIGNETTE_STAGE_COUNT - 1));
    const stageFirstShownAt = { ...(current?.stageFirstShownAt ?? {}) };
    if (!stageFirstShownAt[stage]) stageFirstShownAt[stage] = now;
    const next: VignetteProgressState = {
      updatedAt: now,
      vignettesShown: shown + 1,
      stageFirstShownAt,
    };
    const crs = await getCourseDB();
    await crs.putStrategyState<VignetteProgressState>(USER_STATE_KEYS.VIGNETTE_PROGRESS, next);
    return shown;
  } catch (e) {
    console.warn('[userState] Failed to advance vignette progress:', e);
    return 0;
  }
}

// ============================================================================
// Fridge Sheet (printable letter-sound tracker)
// ============================================================================

export async function getFridgeSheetState(): Promise<FridgeSheetState | null> {
  try {
    const crs = await getCourseDB();
    return await crs.getStrategyState<FridgeSheetState>(USER_STATE_KEYS.FRIDGE_SHEET);
  } catch (e) {
    console.warn('[userState] Failed to load fridge sheet state:', e);
    return null;
  }
}

async function putFridgeSheetState(state: FridgeSheetState): Promise<void> {
  try {
    const crs = await getCourseDB();
    await crs.putStrategyState<FridgeSheetState>(USER_STATE_KEYS.FRIDGE_SHEET, state);
  } catch (e) {
    console.warn('[userState] Failed to save fridge sheet state:', e);
  }
}

/** The family opened the PDF from the app. From here on we assume a sheet exists. */
export async function markFridgeSheetOpened(): Promise<void> {
  const current = await getFridgeSheetState();
  if (current?.openedAt) return;
  const now = new Date().toISOString();
  await putFridgeSheetState({
    updatedAt: now,
    openedAt: now,
    dismissedAt: current?.dismissedAt,
    dismissCount: current?.dismissCount ?? 0,
  });
}

/** The print prompt was waved away; snooze it (policy in services/fridgeSheet.ts). */
export async function dismissFridgeSheetPrompt(): Promise<void> {
  const current = await getFridgeSheetState();
  const now = new Date().toISOString();
  await putFridgeSheetState({
    updatedAt: now,
    openedAt: current?.openedAt,
    dismissedAt: now,
    dismissCount: (current?.dismissCount ?? 0) + 1,
  });
}

// ============================================================================
// Platform (which apps the account is used from)
// ============================================================================

/** Refresh `androidAppLastSeen` at most this often: it syncs, so don't churn it. */
const PLATFORM_STAMP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Note a Play Store app launch on this account (see services/androidApp.ts). */
export async function recordAndroidAppUse(): Promise<void> {
  try {
    const crs = await getCourseDB();
    const current = await crs.getStrategyState<PlatformState>(USER_STATE_KEYS.PLATFORM);
    const last = current?.androidAppLastSeen ? Date.parse(current.androidAppLastSeen) : NaN;
    if (Date.now() - last < PLATFORM_STAMP_INTERVAL_MS) return;
    const now = new Date().toISOString();
    await crs.putStrategyState<PlatformState>(USER_STATE_KEYS.PLATFORM, {
      ...current,
      updatedAt: now,
      androidAppFirstSeen: current?.androidAppFirstSeen ?? now,
      androidAppLastSeen: now,
    });
  } catch (e) {
    console.warn('[userState] Failed to record Android app use:', e);
  }
}

// ============================================================================
// Session Prefs (Auto/Manual session length)
// ============================================================================

/**
 * The account's session-length mode. Defaults to 'auto' when unset or
 * unreadable — a new account always starts on the 2-minute ramp.
 */
export async function getSessionLengthMode(): Promise<SessionLengthMode> {
  try {
    const crs = await getCourseDB();
    const prefs = await crs.getStrategyState<SessionPrefsState>(USER_STATE_KEYS.SESSION_PREFS);
    return prefs?.sessionLengthMode === 'manual' ? 'manual' : 'auto';
  } catch (e) {
    console.warn('[userState] Failed to load session prefs:', e);
    return 'auto';
  }
}

export async function setSessionLengthMode(mode: SessionLengthMode): Promise<void> {
  try {
    const crs = await getCourseDB();
    await crs.putStrategyState<SessionPrefsState>(USER_STATE_KEYS.SESSION_PREFS, {
      updatedAt: new Date().toISOString(),
      sessionLengthMode: mode,
    });
  } catch (e) {
    console.warn('[userState] Failed to persist session prefs:', e);
  }
}

// ============================================================================
// Daily dose (one practice session per day; see services/dailyDose.ts)
// ============================================================================

/** Null when absent or unreadable — the hub then fails open (not resting). */
export async function getDailyDose(): Promise<DailyDoseState | null> {
  try {
    const crs = await getCourseDB();
    return await crs.getStrategyState<DailyDoseState>(USER_STATE_KEYS.DAILY_DOSE);
  } catch (e) {
    console.warn('[userState] Failed to load daily dose:', e);
    return null;
  }
}

async function updateDailyDose(
  update: (state: DailyDoseState | null) => DailyDoseState,
): Promise<void> {
  try {
    const crs = await getCourseDB();
    const current = await crs.getStrategyState<DailyDoseState>(USER_STATE_KEYS.DAILY_DOSE);
    await crs.putStrategyState<DailyDoseState>(USER_STATE_KEYS.DAILY_DOSE, update(current));
  } catch (e) {
    console.warn('[userState] Failed to save daily dose:', e);
  }
}

export function recordPracticeSessionCompleted(): Promise<void> {
  return updateDailyDose((s) => withCompletedSession(s));
}

export function recordDailyDoseUnlock(): Promise<void> {
  return updateDailyDose((s) => withUnlock(s));
}
