/**
 * Shared composable for study session state.
 *
 * Used by:
 *   - StudyHubView: calls `initStudySession()` on mount for pipeline prefetch
 *   - StudyPracticeView: consumes warm session state for near-zero-latency start
 *
 * Uses a module-level singleton pattern so state persists across route
 * navigations within `/study/*`. The composable is not a Pinia store —
 * it's a plain reactive singleton that resets on full page reload.
 *
 * See: agent/study-split/a.1.plan.md
 */

import { ref, watch, type Ref } from 'vue';
import {
  ContentSourceID,
  getActiveController,
  getDataLayer,
  type OutcomeObserver,
  type ReplanHints,
} from '@vue-skuilder/db';
import { type StudySessionConfig, useConfigStore } from '@vue-skuilder/common-ui';
import ENV from '../ENVIRONMENT_VARS';
import { useSessionTracker } from '../stores/sessionTracker';
import { ENTITLEMENT_COURSE_ID } from '../services/courseEntitlement';
import { conceptBackoff, introBackoff } from '../services/sessionManagement';
import { captureSessionStateSnapshot } from '../services/sessionSnapshot';
import { startCourseSync } from '../services/courseSync';

// ---------------------------------------------------------------------------
// Singleton State (module-level — survives route changes)
// ---------------------------------------------------------------------------

const sessionPrepared = ref(false);
const sessionFinished = ref(false);
const sessionContentSources: Ref<ContentSourceID[]> = ref([]);
const sessionTimeLimit = ref(2);
const currentTimeRemaining = ref(0);
const sessionInitHints = ref<ReplanHints | null>(null);

let studySessionConfig: Ref<StudySessionConfig> | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Opt-in observers, registered by specific views (currently only /showHN's
 * annotation feed). Held module-side so registration can happen before the
 * lazy `studySessionConfig` exists — see {@link registerOutcomeObserver}.
 */
const extraObservers: OutcomeObserver[] = [];

/** The always-on observers. See the block comment at the config construction below. */
const baseObservers: OutcomeObserver[] = [conceptBackoff, introBackoff];

/**
 * Append a session `OutcomeObserver` for the lifetime of the calling view.
 * Returns a deregister function — call it on unmount.
 *
 * Why opt-in rather than baked into the default list: /showHN's annotation
 * feed is *passive* (it never touches `SessionControls`), so registering it
 * globally would be harmless to behaviour — but it costs a user-DB read per
 * response in production for data nobody reads. Views that want it pay for it.
 *
 * Ordering: appended AFTER the base observers, which read-modify-write shared
 * session hints and must keep their documented relative order. A passive
 * observer at the tail can't perturb them.
 *
 * Timing: `StudySession.vue` copies `outcomeObservers` into its `SessionController`
 * at construction, which happens after `sessionPrepared` flips and the component
 * mounts. Registering during a view's `setup()` therefore always lands in time.
 * Registering after the controller exists has no effect on the running session.
 */
export function registerOutcomeObserver(observer: OutcomeObserver): () => void {
  if (!extraObservers.includes(observer)) extraObservers.push(observer);

  // If the config already exists, splice into its live array. `watch` below
  // replaces the config object with a spread, which preserves this array's
  // identity, so an in-place push survives an initHints change.
  const live = studySessionConfig?.value.outcomeObservers;
  if (live && !live.includes(observer)) live.push(observer);

  return () => {
    const i = extraObservers.indexOf(observer);
    if (i !== -1) extraObservers.splice(i, 1);

    const current = studySessionConfig?.value.outcomeObservers;
    const j = current?.indexOf(observer) ?? -1;
    if (current && j !== -1) current.splice(j, 1);
  };
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export interface UseStudySessionReturn {
  /** True once course sync and content source setup are complete */
  sessionPrepared: Ref<boolean>;

  /** True once the active session has finished (user completed all cards / timed out) */
  sessionFinished: Ref<boolean>;

  /** Content sources to pass to the StudySession component */
  sessionContentSources: Ref<ContentSourceID[]>;

  /** Session time limit in minutes */
  sessionTimeLimit: Ref<number>;

  /** Current time remaining (updated by StudySession via handleTimeChanged) */
  currentTimeRemaining: Ref<number>;

  /** Session config (confetti preference, etc.) */
  studySessionConfig: Ref<StudySessionConfig>;

  /**
   * Initialize the study session: start the course sync (services/courseSync.ts)
   * + set content sources. `courseSync: 'refresh-only'` (/peek) refreshes an
   * existing course replica but never builds one; the default builds or refreshes.
   *
   * Idempotent — calling multiple times returns the same promise and
   * doesn't re-run initialization if already complete.
   */
  initStudySession: (opts?: InitStudySessionOptions) => Promise<void>;

  /** Callback for StudySession's @time-changed event */
  handleTimeChanged: (timeRemaining: number) => void;

  /** Callback for StudySession's @session-finished event */
  handleSessionFinished: () => void;

  /**
   * Callback for the timer's add-time action. Tops the session clock up by
   * ≤60s. Pass the view's session limit (minutes) to cap the top-up at the
   * originally-configured session length, mirroring the framework's own
   * `StudySession.incrementSessionClock`; omit it for an uncapped +60s.
   */
  incrementSessionTime: (sessionLimitMinutes?: number) => void;

  /** Set one-shot replan hints to apply at the start of the next session */
  setInitHints: (hints: ReplanHints) => void;

  /**
   * Reset all session state. Call when the user returns to the hub
   * after a completed session to allow a fresh session next time.
   */
  resetSession: () => void;
}

export interface InitStudySessionOptions {
  courseSync?: 'build' | 'refresh-only';
}

/**
 * Shared study session composable.
 *
 * Returns the same singleton state on every call within a page lifecycle.
 * State survives vue-router navigations but resets on full page reload.
 */
export function useStudySession(): UseStudySessionReturn {
  // Lazily initialize studySessionConfig (needs configStore + sessionTracker
  // which require Pinia — safe inside setup())
  if (!studySessionConfig) {
    const configStore = useConfigStore();
    const sessionTracker = useSessionTracker();
    const count = sessionTracker.studySessionCount;

    studySessionConfig = ref<StudySessionConfig>({
      likesConfetti: configStore.config.likesConfetti,
      defaultBatchLimit: batchLimitForSessionCount(count),
      // Failed-concept emphasis is not an observer: RecentWeaknessFilter boosts
      // recently missed skills from the per-tag evidence buffer, gently and
      // across sessions (it replaced difficultyBooster; curriculum-log C3).
      // Relies on `sessionHints`/`outcomeObservers`, available in framework
      // >= 0.2.3.
      // `conceptBackoff` relaxes the intro's durable concept boost as the
      // learner demonstrates mastery, so a single concept can't monopolise the
      // session (restores discrimination + lets a second intro surface).
      // `introBackoff` relaxes the durable `gpc:intro:*` discourage (seeded by
      // buildIntroReplanRequest) on those same practice-target successes, so the
      // next intro surfaces once the learner has worked the current one. Ordered
      // AFTER conceptBackoff: both read-modify-write the shared boostTags map on
      // disjoint keys and observers run sequentially, so they compose.
      //
      // `extraObservers` are view-scoped opt-ins (see registerOutcomeObserver),
      // spread in at the tail. A view that registered before this lazy
      // construction still gets picked up here.
      outcomeObservers: [...baseObservers, ...extraObservers],
      // Thin learner-state picture written onto the session's StudySessionDoc
      // at open and close. Gives post-hoc navigation-strategy work the
      // before-picture that card records can't supply — see
      // services/sessionSnapshot.ts. Phase is ignored: the same reads are what
      // we want on both ends, and the pair is read as a diff.
      sessionStateSnapshot: () => captureSessionStateSnapshot(),
    });
  }

  const config = studySessionConfig;

  // Sync init hints into session config reactively. Crucially, propagate a
  // `null` clear too: init hints are one-shot (consumed when a SessionController
  // is constructed in StudySession.vue and applied as session-durable hints for
  // THAT controller only). If we never clear config.initHints, the next fresh
  // SessionController re-applies the previous session's hints — e.g. the
  // post-lesson `requireCards: [wst-gpc-sh-SH]` re-surfaces on every subsequent
  // session instead of just the immediate post-lesson one.
  watch(sessionInitHints, (hints) => {
    if (config.value) {
      config.value = { ...config.value, initHints: hints ?? undefined };
    }
  }, { immediate: true });

  const setInitHints = (hints: ReplanHints) => {
    sessionInitHints.value = hints;
  };

  const initStudySession = async (opts: InitStudySessionOptions = {}): Promise<void> => {
    // If the previous session has finished, reset before re-preparing so the
    // next session starts clean. Without this, the module-level singleton
    // leaves sessionFinished=true across route navigations, which causes the
    // trophy-case keyboard (and its play-phoneme-on-press behaviour, missing
    // spacebar / showAdvance, etc.) to persist into the next visit to
    // /study or /study/practice. See bugs: "no spacebar after Progress
    // round-trip" and "trophy case persists on return nav".
    if (sessionFinished.value) {
      resetSession();
    }

    // Already done
    if (sessionPrepared.value) return;

    // Deduplicate concurrent calls
    if (initPromise) return initPromise;

    initPromise = _doInit(opts);
    return initPromise;
  };

  const handleTimeChanged = (timeRemaining: number) => {
    currentTimeRemaining.value = timeRemaining;
  };

  const handleSessionFinished = () => {
    sessionFinished.value = true;
    // Clear consumed init hints HERE (when the session that consumed them
    // ends) rather than in resetSession(). resetSession runs at the *start* of
    // the next initStudySession — after StudyPracticeView has already called
    // setInitHints() with fresh post-lesson hints for that upcoming session —
    // so clearing there would wipe hints meant for the new session.
    sessionInitHints.value = null;
  };

  // Wired 2026-07-09 for /showHN's adult-evaluator timer. NB the main learner
  // loop (/study/practice) deliberately does NOT use this: the session dose is
  // fixed by design (calm, age-measured, binge-avoidant), and that view hides
  // the affordance via `:allow-add-time="false"` instead.
  // `getActiveController()` is the same registry the framework's own overlay
  // uses. The display catches up on the controller's next 1s tick emit.
  const incrementSessionTime = (sessionLimitMinutes?: number) => {
    const controller = getActiveController();
    if (!controller) return;
    const headroom =
      sessionLimitMinutes !== undefined
        ? Math.max(0, sessionLimitMinutes * 60 - currentTimeRemaining.value)
        : 60;
    const add = Math.min(60, headroom);
    if (add > 0) controller.addTime(add);
  };

  const resetSession = () => {
    sessionPrepared.value = false;
    sessionFinished.value = false;
    sessionContentSources.value = [];
    currentTimeRemaining.value = 0;
    // NB: sessionInitHints is intentionally NOT cleared here — see
    // handleSessionFinished. resetSession runs just before preparing the next
    // session, by which point fresh post-lesson hints may already be set.
    initPromise = null;
  };

  return {
    sessionPrepared,
    sessionFinished,
    sessionContentSources,
    sessionTimeLimit,
    currentTimeRemaining,
    studySessionConfig: config,
    initStudySession,
    handleTimeChanged,
    handleSessionFinished,
    incrementSessionTime,
    setInitHints,
    resetSession,
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Compute the default pipeline batch limit based on how many study
 * sessions the user has completed. Newer users get smaller batches
 * so the planner replans more often, staying aligned with rapidly-
 * changing state (letter unlocks, ELO shifts, etc.).
 *
 * Exported so that views which construct their own `StudySessionConfig`
 * (e.g. PeekView, StudyPracticeView) can reuse the same curve.
 */
export function batchLimitForSessionCount(count: number): number {
  if (count <= 2) return 6;
  if (count <= 5) return 8;
  return 12;
}

async function _doInit(opts: InitStudySessionOptions): Promise<void> {
  if (!ENV.STATIC_COURSE_ID || ENV.STATIC_COURSE_ID === 'not_set') {
    console.error('[useStudySession] No course ID specified in environment vars!');
    return;
  }

  console.log(`[useStudySession] Starting study session init for course: ${ENV.STATIC_COURSE_ID}`);

  const dataLayer = getDataLayer();

  // Course replica: see services/courseSync.ts for when one is built. Not
  // awaited; a session that starts before it is ready runs against the server.
  startCourseSync('study session init', { onlyIfReplica: opts.courseSync === 'refresh-only' });

  sessionContentSources.value = [
    {
      type: 'course',
      id: ENV.STATIC_COURSE_ID,
    },
  ];

  // Refresh defaultBatchLimit from the authoritative source (UserDB config).
  // The initial value was set from the Pinia store's synchronous snapshot,
  // which may have been stale (default 0) if the async load hadn't completed.
  // By this point in _doInit, the data layer is ready for reads.
  try {
    const config = await dataLayer.getUserDB().getConfig();
    // sessionTracking is keyed by the entitlement key (what the tracker
    // writes), NOT the couch course id.
    const tracking = config.sessionTracking?.[ENTITLEMENT_COURSE_ID];
    const count = tracking?.studySessionCount ?? 0;
    const limit = batchLimitForSessionCount(count);

    if (studySessionConfig) {
      studySessionConfig.value = {
        ...studySessionConfig.value,
        defaultBatchLimit: limit,
      };
    }
    console.log(`[useStudySession] defaultBatchLimit set to ${limit} (studySessionCount: ${count})`);
  } catch (e) {
    console.warn('[useStudySession] Failed to read session count for batch limit, using initial value:', e);
  }

  sessionPrepared.value = true;
  console.log('[useStudySession] Session prepared');
}
