import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { getDataLayer } from '@vue-skuilder/db';
import { useAuthStore } from '@vue-skuilder/common-ui';
import type { SessionTrackingData } from '@vue-skuilder/db';
import { ENTITLEMENT_COURSE_ID } from '../services/courseEntitlement';

const STORAGE_KEY_PREFIX = 'sk-session-tracking';

// Key that counts were stored under before tracking was course-scoped (every
// call site used the no-arg default). Read once as a migration source; new
// writes land under ENTITLEMENT_COURSE_ID.
const LEGACY_COURSE_KEY = 'default';

const defaultData = (): SessionTrackingData => ({
  peekSessionCount: 0,
  studySessionCount: 0,
  sessionCount: 0,
  firstSessionDate: '',
  lastSessionDate: '',
  signupPrompted: false,
  promptDismissalCount: 0,
  studyModeAcknowledged: false,
});

/**
 * Session tracker store - course-scoped
 *
 * For funnel users: stores in localStorage
 * For logged-in users: syncs to UserDB (PouchDB → CouchDB)
 *
 * @param courseId - Course identifier. Defaults to the site's entitlement key.
 *
 * Counts are held per identity: logout/login is SPA navigation, not a reload,
 * so the store re-loads whenever the current username differs from the one
 * it loaded for (same reasoning as dripGate.ts / letterProgressionCache).
 * Callers that need an accurate count right now `await ensureCurrent()`.
 *
 * NB: session counts no longer gate anything for logged-in accounts — the
 * entitlement boundary is a reachable-word threshold (services/dripGate.ts),
 * not a session budget. What remains here is the GUEST preview cap and
 * general activity accounting.
 */
export const useSessionTracker = (courseId: string = ENTITLEMENT_COURSE_ID) => defineStore(`sessionTracker-${courseId}`, () => {
  const STORAGE_KEY = `${STORAGE_KEY_PREFIX}-${courseId}`;
  const LEGACY_STORAGE_KEY = `${STORAGE_KEY_PREFIX}-${LEGACY_COURSE_KEY}`;

  // Load initial data from localStorage (for funnel users) or UserDB (for logged-in users)
  const loadData = async (): Promise<SessionTrackingData> => {
    // Try UserDB first (logged-in users)
    try {
      const userDB = getDataLayer().getUserDB();
      const config = await userDB.getConfig();

      if (config.sessionTracking?.[courseId]) {
        console.log(`[SessionTracker] Loaded from UserDB for ${courseId}`);
        return config.sessionTracking[courseId];
      }
      // Migrate counts written under the pre-course-scoped key; the next
      // save() persists them under the current key.
      if (config.sessionTracking?.[LEGACY_COURSE_KEY]) {
        console.log(`[SessionTracker] Migrating UserDB data from '${LEGACY_COURSE_KEY}' to ${courseId}`);
        return config.sessionTracking[LEGACY_COURSE_KEY];
      }
    } catch (e) {
      // User not logged in or config doesn't exist - fall back to localStorage
    }

    // Fall back to localStorage (funnel users)
    try {
      const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored) {
        console.log(`[SessionTracker] Loaded from localStorage for ${courseId}`);
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('[SessionTracker] Failed to load from localStorage:', e);
    }

    return defaultData();
  };

  const data = ref<SessionTrackingData>(defaultData());

  const currentUsername = (): string | null => {
    try {
      return getDataLayer().getUserDB().getUsername();
    } catch {
      return null;
    }
  };

  // Load is keyed by username. Mutators await this so an increment racing
  // the load can't be clobbered by it (or save() default-zeroed data over
  // real stored counts), and so they never write one account's counts into
  // another's.
  let loadedFor: string | null = null;
  let loading: Promise<void> | null = null;

  const ensureCurrent = (): Promise<void> => {
    const who = currentUsername();
    if (loading && loadedFor === who) return loading;
    loadedFor = who;
    data.value = defaultData();
    loading = loadData().then(loaded => {
      if (loadedFor === who) data.value = loaded;
    });
    return loading;
  };

  ensureCurrent();

  // Best-effort refresh for views that read counts synchronously.
  const authStore = useAuthStore();
  watch(() => authStore.isLoggedIn, () => { void ensureCurrent(); });

  // Computed getters
  const peekSessionCount = computed(() => data.value.peekSessionCount);
  const studySessionCount = computed(() => data.value.studySessionCount);
  const sessionCount = computed(() => data.value.sessionCount);
  const firstSessionDate = computed(() => data.value.firstSessionDate);
  const lastSessionDate = computed(() => data.value.lastSessionDate);
  const signupPrompted = computed(() => data.value.signupPrompted);
  const promptDismissalCount = computed(() => data.value.promptDismissalCount);
  const studyModeAcknowledged = computed(() => data.value.studyModeAcknowledged);

  // Save data (to UserDB for logged-in users, localStorage for funnel users)
  const save = async () => {
    // Try UserDB first (logged-in users)
    try {
      const userDB = getDataLayer().getUserDB();
      const config = await userDB.getConfig();

      // Initialize sessionTracking if not exists
      if (!config.sessionTracking) {
        config.sessionTracking = {};
      }

      // Update course-specific tracking
      config.sessionTracking[courseId] = { ...data.value };

      await userDB.setConfig({ sessionTracking: config.sessionTracking });
      console.log(`[SessionTracker] Saved to UserDB for ${courseId}`);
      return;
    } catch (e) {
      // User not logged in - fall back to localStorage
      console.log(`[SessionTracker] UserDB not available, using localStorage for ${courseId}`);
    }

    // Fall back to localStorage (funnel users)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.value));
    } catch (e) {
      console.error('[SessionTracker] Failed to save to localStorage:', e);
    }
  };

  // Increment peek session count
  const incrementPeekSession = async () => {
    await ensureCurrent();
    const now = new Date().toISOString();

    if (data.value.sessionCount === 0) {
      data.value.firstSessionDate = now;
    }

    data.value.peekSessionCount++;
    data.value.sessionCount++;
    data.value.lastSessionDate = now;

    await save();
  };

  // Increment study session count
  const incrementStudySession = async () => {
    await ensureCurrent();
    const now = new Date().toISOString();

    if (data.value.sessionCount === 0) {
      data.value.firstSessionDate = now;
    }

    data.value.studySessionCount++;
    data.value.sessionCount++;
    data.value.lastSessionDate = now;

    await save();
  };

  // Legacy: increment total session count (use incrementPeekSession or incrementStudySession instead)
  const incrementSession = async () => {
    await incrementStudySession();
  };

  // Get session count
  const getSessionCount = () => {
    return data.value.sessionCount;
  };

  // Acknowledge study mode
  const acknowledgeStudyMode = async () => {
    await ensureCurrent();
    data.value.studyModeAcknowledged = true;
    await save();
  };

  // Increment dismissal count
  const incrementDismissalCount = async () => {
    await ensureCurrent();
    data.value.promptDismissalCount++;
    await save();
  };

  // Mark signup prompted
  const markSignupPrompted = async () => {
    await ensureCurrent();
    data.value.signupPrompted = true;
    await save();
  };

  // Reset prompt (for re-prompting logic)
  const resetPrompt = async () => {
    await ensureCurrent();
    data.value.signupPrompted = false;
    await save();
  };

  // Reload data (useful after signup to sync from UserDB)
  const reload = async () => {
    loading = null;
    await ensureCurrent();
    console.log(`[SessionTracker] Reloaded data for ${courseId}`);
  };

  return {
    // State
    peekSessionCount,
    studySessionCount,
    sessionCount,
    firstSessionDate,
    lastSessionDate,
    signupPrompted,
    promptDismissalCount,
    studyModeAcknowledged,

    // Actions
    incrementPeekSession,
    incrementStudySession,
    incrementSession, // legacy
    getSessionCount,
    incrementDismissalCount,
    markSignupPrompted,
    resetPrompt,
    acknowledgeStudyMode,
    ensureCurrent, // Re-load if the current user changed
    reload, // Reload from UserDB/localStorage
  };
})();
