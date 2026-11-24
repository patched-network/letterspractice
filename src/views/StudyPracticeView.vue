<template>
  <div class="study-view-layout">
    <!-- Main scrollable content area -->
    <div class="study-content-area">
      <!-- Study Session -->
      <div v-if="sessionPrepared && sessionLengthResolved" class="study-session-wrapper">
        <StudySession
          :key="sessionKey"
          :content-sources="sessionContentSources"
          :session-time-limit="sessionTimeLimit"
          :user="user"
          :session-config="studySessionConfig"
          :data-layer="dataLayer"
          :get-view-component="getViewComponent"
          :frameless="true"
          :hide-footer="true"
          transition-name="card-slide"
          transition-mode="default"
          @session-finished="onSessionFinished"
          @card-loaded="handleFirstCardLoaded"
          @session-error="handleSessionError"
          @time-changed="handleTimeChanged"
        >
          <template #session-finished="{ sessionRecord }">
            <SessionEndScreen
              :session-records="sessionRecord"
              :user-tier="userTier"
              :word-count="wordCount"
              :word-threshold="wordThreshold"
              :show-purchase-cta="showPurchaseCta"
              :vignette-stage="vignetteStage"
              @go-home="handleGoHome"
            />
          </template>
        </StudySession>
      </div>
      <!-- Loading overlay — covers the panel from navigation until the first
           card actually renders. Spans BOTH the cheap content-source setup
           (composable `sessionPrepared`) AND the heavier in-component prep
           (SessionController build + view warming + first card fetch) that
           StudySession does after it mounts, during which it renders nothing.
           Cleared on the framework's `card-loaded` emit. -->
      <transition name="loading-fade">
        <div v-if="showSessionLoading" class="study-session-loading">
          <!-- Adult-facing: a load failure is the parent's problem to solve
               (connection or our servers), never something the child should be asked to do. -->
          <v-card v-if="loadFailure" class="pa-6 text-center" elevation="0" max-width="420">
            <v-icon size="48" color="medium-emphasis" class="mb-3">mdi-cloud-off-outline</v-icon>
            <p class="text-h6 mb-2">We couldn't reach today's letters</p>
            <p class="text-medium-emphasis mb-5">
              Your connection may be down, or our servers may be having trouble.
              Please try again in a moment.
            </p>
            <div class="d-flex justify-center ga-3">
              <v-btn variant="text" @click="handleGoHome">Back</v-btn>
              <v-btn color="primary" variant="flat" @click="retrySessionLoad">Try again</v-btn>
            </div>
          </v-card>
          <v-card v-else class="pa-6 text-center" elevation="0">
            <PunctuationThinking :glyph-height="176" :gap="22" />
            <p class="mt-4 text-medium-emphasis">Gathering today's letters…</p>
          </v-card>
        </div>
      </transition>

    </div>

    <!-- Persistent Keyboard Area (fixed at bottom; becomes trophy-case on session end) -->
    <div v-if="showKeyboard" class="keyboard-area" :class="{ 'keyboard-area--trophy': sessionFinished }">
      <TrophyWindowBar
        v-if="sessionFinished"
        :duration-ms="trophyWindowMs"
        :started-at="trophyWindowStartedAt"
        :done="trophyResting"
      />
      <ProgressiveKeyboard
        ref="keyboardRef"
        :letters="keyboardLetters"
        :enabled-letters="keyboardEnabledLetters"
        :highlighted-letters="keyboardHighlightedLetters"
        :key-colors="keyboardColors"
        :space-text="keyboardSpaceText"
        :show-full-layout="keyboardContext.showFullLayout.value"
        :play-phoneme-on-press="false"
        :play-phoneme-on-release="sessionFinished"
        :chord-definitions="sessionFinished ? trophyChordDefinitions : undefined"
        :capture-keyboard="true"
        :lowercase-keycaps="true"
        :disabled="keyboardContext.disabled.value || trophyResting"
        :disable-transition-ms="sessionFinished ? TROPHY_DIM_MS : keyboardContext.disableTransitionMs.value"
        :enable-transition-ms="keyboardContext.enableTransitionMs.value"
        @keypress="handleKeyboardPress"
        @keyrelease="handleKeyboardRelease"
        @keytap="handleKeyboardTap"
        @keyhover="handleKeyboardHover"
        @keyhoverend="handleKeyboardHoverEnd"
        @kbd-space="handleKeyboardAdvance"
        @kbd-enter="handleKeyboardEnter"
        @arrow-left="handleKeyboardArrowLeft"
        @arrow-right="handleKeyboardArrowRight"
        @backspace="keyboardContext.dispatchBackspace()"
        @invalid-key="handleKeyboardInvalidKey"
      />
    </div>

    <!-- Timer display (hidden on end screen).
         Deliberately a sibling of the keyboard area, not a child: it's adult-
         facing status, and the keyboard is the child's interaction surface.
         Anchoring it to the layout lets it sit lower-left beside the keyboard
         on roomy screens and move clear of it entirely on phones, where the
         full-bleed keycaps reach the corner it used to occupy. -->
    <div v-if="showKeyboard && !sessionFinished" class="session-timer">
      <!-- No add-time: the session dose is deliberate (calm, age-measured,
           binge-avoidant), so the affordance is absent here — not inert.
           /showHN keeps a working one; its audience is an adult evaluator. -->
      <StudySessionTimer
        :time-remaining="currentTimeRemaining"
        :session-time-limit="sessionTimeLimit"
        :allow-add-time="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getDataLayer } from '@vue-skuilder/db';
import { StudySession, StudySessionTimer, useEntitlements } from '@vue-skuilder/common-ui';
import { useOnboardingStore } from '../stores/onboarding';
import {
  resolveSessionMinutes,
  MIN_SESSION_MINUTES,
} from '../services/sessionLengthPolicy';
import { allCourseWare } from '@vue-skuilder/courseware';
import { StudySessionRecord } from '@vue-skuilder/db';
import { useSessionTracker } from '../stores/sessionTracker';
import { useStudySession } from '../composables/useStudySession';
import ProgressiveKeyboard from '../components/keyboard/ProgressiveKeyboard.vue';
import SessionEndScreen from '../components/session-end/SessionEndScreen.vue';
import type { SessionRecordEntry } from '../composables/useSessionSummary';
import { useTrophyCase, TROPHY_DIM_MS } from '../composables/useTrophyCase';
import TrophyWindowBar from '../components/session-end/TrophyWindowBar.vue';
import { introModeState } from '../services/introModeState';
import {
  createKeyboardContext,
  provideKeyboardContext,
  type KeyEvent,
  type KeyboardContextProvider,
} from '../composables/useKeyboardContext';
import { prefetchPhonemeAudio } from '../services/phonetics/phonemeCache';
import { getLetterProgression, getLessonProgress, clearPostLessonPracticeFlag, incrementSessionsSinceLastLesson, getVignetteProgress, advanceVignetteProgress, getSessionLengthMode, getDailyDose, recordPracticeSessionCompleted } from '../services/userState';
import { isRestingToday } from '../services/dailyDose';
import { getPostLessonHints } from '../services/lessons';
import PunctuationThinking from '../components/loading/PunctuationThinking.vue';
import { ENTITLEMENT_COURSE_ID } from '../services/courseEntitlement';
import { getReachableWordCount } from '../services/userState';
import { entitlement, sellOffer } from '../entitlement';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

const router = useRouter();
const user = getDataLayer().getUserDB();
const dataLayer = getDataLayer();
const sessionTracker = useSessionTracker();
const onboardingStore = useOnboardingStore();
const { trialStatus, hasPremiumAccess, fetchEntitlements } = useEntitlements(ENTITLEMENT_COURSE_ID);

// Shared session state (pre-warmed by StudyHubView)
const {
  sessionPrepared,
  sessionFinished,
  sessionContentSources,
  currentTimeRemaining,
  studySessionConfig,
  initStudySession,
  handleTimeChanged,
  handleSessionFinished,
  setInitHints,
  resetSession,
} = useStudySession();

// Session time limit: resolved from the session-length policy.
// - Auto mode: starts at 2 min, ramps to child's age-in-years (clamped to 6 min)
//   over the first 20 completed study sessions; thereafter tracks real-time
//   aging (+~1 sec/week).
// - Manual mode: uses UserConfig.sessionTimeLimit verbatim.
// StudySession reads the limit once at mount, so it is resolved up front from
// the current account's UserDB (mode, manual minutes, session count) and the
// session waits on it — stores hydrated for a previous account must not leak in.
const sessionTimeLimit = ref(MIN_SESSION_MINUTES);
const sessionLengthResolved = ref(false);

async function resolveSessionLength(): Promise<void> {
  try {
    const [mode, userConfig] = await Promise.all([
      getSessionLengthMode(),
      user.getConfig(),
      sessionTracker.ensureCurrent(),
    ]);
    sessionTimeLimit.value = resolveSessionMinutes({
      mode,
      manualMinutes: userConfig.sessionTimeLimit,
      childAge: onboardingStore.data.childAge,
      completedAt: onboardingStore.data.completedAt,
      sessionsCount: sessionTracker.studySessionCount,
    });
  } catch (e) {
    console.warn('[StudyPracticeView] Failed to resolve session length, using minimum:', e);
  }
  sessionLengthResolved.value = true;
}

// ---------------------------------------------------------------------------
// Keyboard Context Setup
// ---------------------------------------------------------------------------

const keyboardContext: KeyboardContextProvider = createKeyboardContext();
provideKeyboardContext(keyboardContext);

const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);

watch(keyboardRef, (newRef) => {
  if (newRef) {
    keyboardContext.connectKeyboard(newRef);
  }
});

const showKeyboard = computed(() => {
  return sessionPrepared.value;
});

// ---------------------------------------------------------------------------
// First-Card Loading Gate
// ---------------------------------------------------------------------------
//
// `sessionPrepared` (from the composable) only signals that content *sources*
// are configured — it flips early and cheaply. The visible delay is the work
// StudySession does internally after mount (SessionController construction,
// view warming, fetching the first card), during which the framework component
// renders nothing. Track the first `card-loaded` emit so we can keep a spinner
// over the main panel across that whole gap instead of showing a blank screen.
const firstCardLoaded = ref(false);

const handleFirstCardLoaded = () => {
  firstCardLoaded.value = true;
  // A late first card (after the watchdog fired) still wins.
  loadFailure.value = null;
  clearLoadWatchdog();
};

const showSessionLoading = computed(() => {
  return !firstCardLoaded.value && !sessionFinished.value;
});

// ---------------------------------------------------------------------------
// Load Failure (course DB unreachable)
// ---------------------------------------------------------------------------
//
// Two ways the first card never arrives:
//  - fast: the course source throws → framework emits `session-error`.
//  - slow: a request that never settles (hung server, blackholed network) →
//    no event ever fires. The watchdog covers that case.
// Either swaps the spinner for a retry prompt instead of spinning forever.
// Budget is generous: a cold first session runs against the remote couch.
const LOAD_WATCHDOG_MS = 25_000;

const loadFailure = ref<'error' | 'timeout' | null>(null);
// Bumped on retry to force a fresh StudySession (and SessionController).
const sessionKey = ref(0);
let loadWatchdog: ReturnType<typeof setTimeout> | null = null;

function clearLoadWatchdog() {
  if (loadWatchdog) clearTimeout(loadWatchdog);
  loadWatchdog = null;
}

function startLoadWatchdog() {
  clearLoadWatchdog();
  loadWatchdog = setTimeout(() => {
    loadWatchdog = null;
    if (showSessionLoading.value && !loadFailure.value) {
      console.error(`[StudyPracticeView] No first card after ${LOAD_WATCHDOG_MS}ms`);
      loadFailure.value = 'timeout';
    }
  }, LOAD_WATCHDOG_MS);
}

const handleSessionError = (payload: { message: string; error?: unknown }) => {
  console.error('[StudyPracticeView] Study session error:', payload.message, payload.error);
  // Only a pre-first-card failure strands the learner; the framework emits
  // nothing mid-session, but guard anyway rather than blank a live card.
  if (firstCardLoaded.value) return;
  clearLoadWatchdog();
  loadFailure.value = 'error';
};

const retrySessionLoad = async () => {
  loadFailure.value = null;
  firstCardLoaded.value = false;
  // resetSession keeps any pending post-lesson init hints (see composable).
  resetSession();
  sessionKey.value++;
  startLoadWatchdog();
  await initStudySession();
};

onBeforeUnmount(clearLoadWatchdog);

// ---------------------------------------------------------------------------
// Trophy-Case Keyboard (session-end decoration)
// ---------------------------------------------------------------------------

const sessionRecords = ref<SessionRecordEntry[]>([]);
const {
  keyColors: trophyKeyColors,
  glowLetters: trophyGlowLetters,
  chordDefinitions: trophyChordDefinitions,
  resting: trophyResting,
  windowMs: trophyWindowMs,
  windowStartedAt: trophyWindowStartedAt,
  startWindow: startTrophyWindow,
  letters: trophyLetters,
  enabledLetters: trophyEnabledLetters,
  spaceText: trophySpaceText,
} = useTrophyCase(sessionRecords, keyboardContext.baseLetters);

// Vignette progression (post-session JJugglingVignette stage).
// Prefetched at setup so the end screen mounts with the right stage;
// onSessionFinished persists the advance for next time.
const vignetteStage = ref(0);
getVignetteProgress().then((progress) => {
  vignetteStage.value = progress?.vignettesShown ?? 0;
});

// ---------------------------------------------------------------------------
// Keyboard Computeds (trophy-case aware)
// ---------------------------------------------------------------------------

const keyboardLetters = computed(() => {
  // Trophy-case mode: all unlocked base letters (no question filter)
  if (sessionFinished.value) {
    return trophyLetters.value;
  }

  const active = keyboardContext.hasQuestionConfig.value
    ? [...keyboardContext.activeLetters.value]
    : [];
  if (keyboardContext.showArrows.value) {
    if (!active.includes('arrowleft')) active.push('arrowleft');
    if (!active.includes('arrowright')) active.push('arrowright');
  }
  if (!active.includes('enter')) active.push('enter');
  if (keyboardContext.showAdvance.value && !active.includes('space')) {
    active.push('space');
  }
  return active;
});

const keyboardEnabledLetters = computed(() => {
  // Trophy-case mode: all letters tappable (for phoneme playback)
  if (sessionFinished.value) {
    return trophyEnabledLetters.value;
  }

  const enabled = keyboardContext.hasQuestionConfig.value
    ? [...keyboardContext.enabledLetters.value]
    : [];
  if (keyboardContext.showArrows.value) {
    if (!enabled.includes('arrowleft')) enabled.push('arrowleft');
    if (!enabled.includes('arrowright')) enabled.push('arrowright');
  }
  if (keyboardContext.showAdvance.value && !enabled.includes('space')) {
    enabled.push('space');
  }
  return enabled;
});

const keyboardHighlightedLetters = computed(() => {
  // Trophy-case mode: highlight new-topic letters with glow
  if (sessionFinished.value) {
    return trophyGlowLetters.value;
  }

  return Array.from(keyboardContext.highlights.value.keys());
});

const keyboardColors = computed(() => {
  // Trophy-case mode: use session-derived colors
  if (sessionFinished.value) {
    return trophyKeyColors.value;
  }

  const colors: Record<string, string> = { ...keyboardContext.keyColors.value };
  for (const [letter, highlight] of keyboardContext.highlights.value.entries()) {
    if (typeof highlight === 'string') {
      colors[letter] = highlight;
    }
  }
  if (keyboardContext.advanceColor.value) {
    colors['space'] = keyboardContext.advanceColor.value;
  }
  return colors;
});

const keyboardSpaceText = computed(() => {
  if (sessionFinished.value) return trophySpaceText.value;
  return keyboardContext.advanceText.value;
});

// Keyboard event handlers
const handleKeyboardPress = (event: KeyEvent) => {
  keyboardContext.dispatchKeyPress(event);
};
const handleKeyboardRelease = (event: KeyEvent) => {
  keyboardContext.dispatchKeyRelease(event);
};
const handleKeyboardTap = (event: KeyEvent) => {
  keyboardContext.dispatchKeyTap(event);
};
const handleKeyboardHover = (event: KeyEvent) => {
  keyboardContext.dispatchKeyHover(event);
};
const handleKeyboardHoverEnd = (event: KeyEvent) => {
  keyboardContext.dispatchKeyHoverEnd(event);
};
const handleKeyboardAdvance = () => {
  keyboardContext.dispatchAdvance();
};
const handleKeyboardEnter = () => {
  keyboardContext.dispatchEnter();
};
const handleKeyboardArrowLeft = () => {
  keyboardContext.dispatchArrowLeft();
};
const handleKeyboardArrowRight = () => {
  keyboardContext.dispatchArrowRight();
};
const handleKeyboardInvalidKey = (letter: string) => {
  keyboardContext.dispatchInvalidKey(letter);
};

// ---------------------------------------------------------------------------
// Keyboard Base Letters Initialization
// ---------------------------------------------------------------------------

const initializeKeyboardBaseLetters = async () => {
  const progression = await getLetterProgression();
  keyboardContext.setBaseLetters(progression?.unlockedLetters ?? []);
};

// ---------------------------------------------------------------------------
// Funnel User Post-Session Banner
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Session-End CTA Tier
// ---------------------------------------------------------------------------

const isFunnelUser = computed(() => user.getUsername().startsWith('sk-guest-'));

const userTier = computed((): 'funnel' | 'trial' | 'paid' | 'unknown' => {
  if (isFunnelUser.value) return 'funnel';
  // Nothing for sale: every account is as good as paid.
  if (hasPremiumAccess.value || !entitlement.offer) return 'paid';
  if (trialStatus.value.isActive) return 'trial';
  return 'unknown';
});

/**
 * Free-tier word progress — refreshed after each session, since a session is
 * exactly when new graphemes get introduced.
 */
const wordCount = ref(0);
/** The free-tier ceiling; undefined when this deployment has none. */
const wordThreshold = entitlement.wordLimit ?? undefined;

async function refreshWordCount() {
  try {
    wordCount.value = await getReachableWordCount();
  } catch (e) {
    console.debug('[StudyPracticeView] Could not read reachable word count:', e);
  }
}

/**
 * When to put the purchase CTA on the session-end screen.
 *
 * Progress pressure, not time pressure: the nudge tracks how close the child
 * is to the free-tier ceiling, and never counts down a calendar. Quiet until
 * the last quarter of the free tier, then present at every session-end —
 * including permanently once the ceiling is reached, which is the one moment
 * the ask is actually informed.
 */
const showPurchaseCta = computed(
  // Only where something is for sale (not in the Play Store app; see sellOffer).
  () => sellOffer() !== null && wordThreshold !== undefined && wordCount.value >= wordThreshold * 0.75,
);

// ---------------------------------------------------------------------------
// Session Finish Handler
// ---------------------------------------------------------------------------

const getViewComponent = (view_id: string) => allCourseWare.getView(view_id);

const onSessionFinished = (records: StudySessionRecord[]) => {
  // Stash records so the summary composable can derive trophy-case colors
  sessionRecords.value = records as unknown as SessionRecordEntry[];
  handleSessionFinished();
  introModeState.clearAll();

  // Increment session counter for lesson spacing constraints
  incrementSessionsSinceLastLesson();

  // Uses up today's dose; the hub rests until tomorrow (services/dailyDose.ts)
  void recordPracticeSessionCompleted();

  // Advance vignette progression — returns the stage to show now and
  // persists the incremented count for the next session
  advanceVignetteProgress().then((stage) => {
    vignetteStage.value = stage;
  });

  // Lazy-fetch entitlements for CTA tier computation
  fetchEntitlements();

  // Re-read the word count: a session is exactly when new graphemes get
  // introduced, so this is the moment the number moves. The session-end
  // screen renders it.
  refreshWordCount();

  // Clear question config so keyboard reverts to base-letter mode (trophy case)
  keyboardContext.clearQuestionConfig();
  keyboardContext.updateConfig({
    disabled: false,
    showAdvance: false,
    showArrows: false,
    showFullLayout: true,
  });

  // A short wind-down, not an open-ended toy (composables/useTrophyCase.ts)
  startTrophyWindow();
};

const handleGoHome = () => {
  router.push('/study');
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  // Today's dose already used (and not unlocked by a grown-up at the hub):
  // back to the hub, which shows the rest state.
  if (isRestingToday(await getDailyDose())) {
    router.replace('/study');
    return;
  }

  startLoadWatchdog();
  void resolveSessionLength();

  // Prefetch phoneme audio
  prefetchPhonemeAudio(50);

  // Warm the free-tier word count (and, with it, the mask table) before the
  // session ends and the end-screen needs it.
  refreshWordCount();

  // Initialize keyboard base letters from persisted state
  await initializeKeyboardBaseLetters();

  // Check for post-lesson practice hints before clearing the flag.
  // When a lesson was just completed/dismissed, we identify which concept
  // tags should be boosted. Currently the pipeline naturally surfaces
  // newly-unlocked content (the LessonGateFilter just opened the gate),
  // so explicit replan injection is deferred as a future enhancement.
  try {
    const lessonProg = await getLessonProgress();
    if (lessonProg?.postLessonPracticeFlag) {
      const hints = getPostLessonHints(lessonProg.postLessonPracticeFlag);
      if (Object.keys(hints).length > 0) {
        setInitHints(hints);
        console.log(
          `[StudyPracticeView] Post-lesson init hints for "${lessonProg.postLessonPracticeFlag}":`,
          hints,
        );
      }
    }
  } catch (e) {
    console.debug('[StudyPracticeView] Could not read post-lesson practice flag:', e);
  }
  clearPostLessonPracticeFlag();

  // Init the study session. initStudySession is idempotent (returns early when
  // already prepared) AND self-heals when the prior session had finished — so
  // we call it unconditionally on every mount to guarantee that the singleton
  // sessionFinished/sessionPrepared state can't leak into a fresh visit (which
  // would otherwise leave us stuck in trophy-case mode: no spacebar, phoneme-
  // on-press still on, etc.).
  await initStudySession();
});
</script>

<style scoped>
.study-view-layout {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--v-layout-top, 0px));
  overflow: hidden;
  /* Positioning context for .session-timer, which is anchored to the whole
     view (not to the keyboard band) so it can switch corners by breakpoint. */
  position: relative;
}

.study-content-area {
  flex: 1;
  padding: 0;
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* Anchor the absolutely-positioned loading overlay to this panel. */
  position: relative;
}

/* Overlay covering the main panel until the first card renders. Opaque
   surface background so the (briefly blank / half-built) StudySession
   underneath isn't visible through it. */
.study-session-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgb(var(--v-theme-surface));
}

/* Gentle fade-out once the first card is ready, so the handoff to the
   live session doesn't snap. */
.loading-fade-leave-active {
  transition: opacity 0.3s ease;
}
.loading-fade-leave-to {
  opacity: 0;
}

.keyboard-area {
  flex-shrink: 0;
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 8px 16px 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  position: relative;
  transition: box-shadow 0.4s ease, border-color 0.4s ease;
}

.keyboard-area--trophy {
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
  border-top-color: rgba(var(--v-border-color), 0.08);
}

/* Roomy screens: unchanged — lower-left, beside the keyboard, which doesn't
   reach that corner there (row 4 is just the centered spacebar).
   z-index 1 keeps it over card content but under .study-session-loading (2),
   so the timer stays hidden behind the pre-first-card overlay. */
.session-timer {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 1;
}

.study-session-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}

@media (max-width: 600px) {
  .keyboard-area {
    /* Near-zero horizontal padding: the keyboard sizes its keycaps from the
       width it's handed, so side padding here is spent directly out of key
       size. ProgressiveKeyboard keeps its own 4px for shadow clearance. */
    padding: 4px 2px 8px;
  }

  /* Phones: the keyboard is full-bleed, so its bottom-left corner is now the
     Z keycap — the timer's old home clipped straight through it. Move it to
     the top-right of the study area instead: away from the child's hands,
     under the app bar's own right-aligned chrome (AuthStatus), and out of the
     left-to-right reading path of the word being spelled. Scaled down since
     it's peripheral status, not a control (it has no add-time affordance). */
  .session-timer {
    top: 8px;
    right: 8px;
    left: auto;
    bottom: auto;
    transform: scale(0.7);
    transform-origin: top right;
  }
}

@media (min-width: 960px) {
  .keyboard-area {
    padding: 12px 24px 20px;
  }

  .session-timer {
    left: 24px;
    bottom: 20px;
  }
}
</style>
