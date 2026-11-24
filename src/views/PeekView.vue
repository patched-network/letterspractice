<template>
  <div class="peek-view-layout">
    <!-- Main scrollable content area -->
    <div class="peek-content-area">
      <!-- Peek-to-Study Transition (after 3 peek sessions) -->
      <v-card v-if="showTransitionPrompt" class="ma-4 pa-6 text-center transition-card">
        <v-icon size="64" color="primary" class="mb-4">mdi-account-child</v-icon>
        <h2 class="text-h5 mb-3">Ready to Start Learning Together?</h2>
        <p class="text-body-1 text-medium-emphasis mb-2">
          Thank you for exploring the preview mode. Now it's time to start learning together with your child!
        </p>
        <p class="text-body-1 text-medium-emphasis mb-4">
          <strong>Study Mode</strong> is for active learning sessions where progress is tracked and responses are recorded.
        </p>
        <v-btn size="large" color="primary" variant="elevated" @click="goToStudy">
          Start Learning Together
        </v-btn>
        <p v-if="contactEmail" class="text-body-4 text-medium-emphasis mt-4">
          Still not sure? We'd love to hear your thoughts. <a :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
        </p>
      </v-card>

      <!-- Loading: waiting on initial lesson-progress check -->
      <template v-else-if="phase === 'loading'">
        <div class="study-session-loading">
          <v-card class="pa-4 text-center">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
            <p class="mt-4">Preparing preview...</p>
          </v-card>
        </div>
      </template>

      <!-- Lesson: first-time peek visitors see the hello-world intro before -->
      <!-- any session content. Same keyboard context as the session phase.   -->
      <template v-else-if="phase === 'lesson' && lessonComponent">
        <!-- Parent-facing framing: restates walkthrough beat 2 ("Micro
             lessons with involved adults") for visitors who arrived without
             reading the landing scrollytell. -->
        <Transition :css="false" @before-leave="collapseBeforeLeave" @leave="collapseLeave">
          <div v-if="showLessonBanner" class="peek-note" :style="lessonAccentStyle">
            <div class="peek-note-body">
              <p v-for="(para, i) in lessonBeatHtml" :key="i" v-html="para"></p>
            </div>
            <v-btn
              class="peek-note-close"
              icon="mdi-close"
              size="x-small"
              variant="text"
              aria-label="Dismiss"
              @click="showLessonBanner = false"
            />
          </div>
        </Transition>
        <!-- NB: do NOT advance on `lesson-complete`. The runner fires that
             automatically the instant the final 'complete' step is reached
             (useLessonRunner: watch(isComplete)), which would unmount this
             phase before LessonCompletePane's "Start Practicing" CTA ever
             renders. Advance only on the explicit user action (`practice-now`,
             emitted by that CTA / by an advance-press at the complete step) or
             `back-to-menu`. -->
        <component
          :is="lessonComponent"
          @practice-now="advanceToSession"
          @back-to-menu="advanceToSession"
        />
      </template>

      <!-- Session: preview-mode banner + StudySession -->
      <template v-else-if="phase === 'session'">
        <!-- --with-timer: this is the one banner that coexists with the
             session timer (showTimer is exactly `phase === 'session'`), which
             on phones floats over this bar's right end. The modifier reserves
             a gutter there so the dismiss button never ends up underneath it. -->
        <Transition :css="false" @before-leave="collapseBeforeLeave" @leave="collapseLeave">
          <div
            v-if="sessionBannerVisible && currentSessionBeat"
            class="peek-note peek-note--with-timer"
            :style="beatAccentStyle"
          >
            <!-- Beat-to-beat swap: new content slides in from the right while
                 the old slides out to the left (keyed by beat id; the leaving
                 copy is absolutely positioned so it overlaps instead of leaving
                 a gap). Distinct from the outer collapse transition, which only
                 fires on dismiss / re-add. -->
            <div class="peek-note-body-wrap">
              <Transition name="beat-slide">
                <div :key="currentSessionBeat?.id" class="peek-note-body">
                  <p v-for="(para, i) in sessionBeatHtml" :key="i" v-html="para"></p>
                </div>
              </Transition>
            </div>
            <v-btn
              class="peek-note-close"
              icon="mdi-close"
              size="x-small"
              variant="text"
              aria-label="Dismiss"
              @click="sessionBannerVisible = false"
            />
          </div>
        </Transition>

        <div v-if="sessionPrepared" class="study-session-wrapper">
          <StudySession
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
            @time-changed="handleTimeChanged"
            @card-loaded="onCardLoaded"
          >
            <!-- Replaces the framework's default "Study session finished!"
                 card with the on-product summary + peek funnel CTAs. -->
            <template #session-finished="{ sessionRecord }">
              <PeekEndScreen :session-records="sessionRecord" />
            </template>
          </StudySession>
        </div>
        <div v-else class="study-session-loading">
          <v-card class="pa-4 text-center">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
            <p class="mt-4">Preparing preview session...</p>
          </v-card>
        </div>
      </template>
    </div>

    <!-- Persistent Keyboard Area (fixed at bottom) -->
    <div v-if="showKeyboard" class="keyboard-area">
      <ProgressiveKeyboard
        ref="keyboardRef"
        :letters="keyboardLetters"
        :enabled-letters="keyboardEnabledLetters"
        :highlighted-letters="keyboardHighlightedLetters"
        :key-colors="keyboardColors"
        :space-text="keyboardSpaceText"
        :show-full-layout="keyboardContext.showFullLayout.value"
        :play-phoneme-on-press="sessionFinished"
        :capture-keyboard="true"
        :lowercase-keycaps="true"
        :disabled="keyboardContext.disabled.value"
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

    <!-- Adult-facing status, so it sits outside the keyboard (the child's
         interaction surface) and anchors to the layout — lower-left beside the
         keyboard on roomy screens, top-right on phones where the full-bleed
         keycaps now reach that corner. Mirrors StudyPracticeView. -->
    <div v-if="showTimer" class="session-timer">
      <StudySessionTimer
        :time-remaining="currentTimeRemaining"
        :session-time-limit="sessionTimeLimit"
        @add-time="incrementSessionTime"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getDataLayer } from '@vue-skuilder/db';
import { StudySession, StudySessionTimer } from '@vue-skuilder/common-ui';
import { allCourseWare } from '@vue-skuilder/courseware';
import { useSessionTracker } from '../stores/sessionTracker';
import { useStudySession } from '../composables/useStudySession';
import ProgressiveKeyboard from '../components/keyboard/ProgressiveKeyboard.vue';
import PeekEndScreen from '../components/session-end/PeekEndScreen.vue';
import {
  createKeyboardContext,
  provideKeyboardContext,
  type KeyEvent,
  type KeyboardContextProvider,
} from '../composables/useKeyboardContext';
import { prefetchPhonemeAudio } from '../services/phonetics/phonemeCache';
import { getLetterProgression, getLessonProgress, recordLessonComplete } from '../services/userState';
import { getLessonComponent } from '../lessons/index';
import { LESSON_BEATS, SESSION_BEATS, type PeekBeat } from '../content/peekBeats';
import { renderInline } from '../components/landing/inlineMarkup';
import { pitch } from '../deployment';
import { oklch } from '../letterpeople/util/color';

const INTRO_LESSON_ID = 'hello-world';
/** Whoever runs this deployment (its pitch); none in the open build. */
const contactEmail = pitch?.contactEmail ?? '';

const router = useRouter();
const route = useRoute();
const user = getDataLayer().getUserDB();
const dataLayer = getDataLayer();
const sessionTracker = useSessionTracker();

const {
  sessionPrepared,
  sessionFinished,
  sessionContentSources,
  currentTimeRemaining,
  studySessionConfig,
  initStudySession,
  handleTimeChanged,
  handleSessionFinished,
  incrementSessionTime,
} = useStudySession();

// A first-time visitor's peek session runs against the server: no course
// replica is built for it (services/courseSync.ts). One already on this
// device is refreshed and used.
const PEEK_INIT = { courseSync: 'refresh-only' } as const;

// Peek runs a fixed short preview session, deliberately independent of the
// account-level session-length policy (auto age-ramp / manual override). A
// leftover manual setting would otherwise leak into the pre-account preview and
// contradict the "~2 minutes" framing. 2.5 min = 150s.
const sessionTimeLimit = 2.5;

// Show transition prompt after 3 peek sessions
const showTransitionPrompt = computed(() => {
  return sessionTracker.peekSessionCount >= 3;
});

// ---------------------------------------------------------------------------
// Phase state machine: lesson → session
// ---------------------------------------------------------------------------
//
// First peek visit: hello-world lesson runs inline before the practice
// session starts. Returning peek visitors (who completed the lesson in
// their isolated peek DB) skip straight to 'session'. The lesson and
// session share the keyboard context this view provides, so no remount
// or hub-style intermediate screen is needed.

type Phase = 'loading' | 'lesson' | 'session';
const phase = ref<Phase>('loading');
const lessonComponent = ref<Component | null>(null);

// Explainer banners are dismissible; per-mount only (they return on the next
// visit, which is fine — the lesson phase itself only ever shows once).
const showLessonBanner = ref(true);

// Beat copy is dataified in content/peekBeats.ts; `md` uses the landing copy's
// inline-emphasis vocabulary, split into paragraphs on blank lines and rendered
// (escaped → emphasized) via renderInline — the same shared parser
// landingPageCopy.ts uses.
const renderBeatParagraphs = (md: string): string[] =>
  md.split(/\n{2,}/).map((p) => renderInline(p.trim()));
const lessonBeatHtml = computed(() =>
  LESSON_BEATS[0] ? renderBeatParagraphs(LESSON_BEATS[0].md) : [],
);

// Session-phase beats form an ordered queue, advanced one-per-card-load (see
// onCardLoaded / StudySession's @card-loaded). The banner shows
// SESSION_BEATS[sessionBeatIndex] while sessionBannerVisible. Advancing to a
// new beat sets visible = true — re-adding the banner if a prior beat was
// dismissed, or replacing it in place if it was still showing.
const sessionBeatIndex = ref(0);
const sessionBannerVisible = ref(true);
let cardsLoaded = 0;
const currentSessionBeat = computed(() => SESSION_BEATS[sessionBeatIndex.value] ?? null);
const sessionBeatHtml = computed(() =>
  currentSessionBeat.value ? renderBeatParagraphs(currentSessionBeat.value.md) : [],
);
const onCardLoaded = () => {
  cardsLoaded += 1;
  // The first card-load aligns with beat 0 (already shown at session start);
  // each subsequent load advances one beat, clamped at the last.
  const next = Math.min(cardsLoaded - 1, SESSION_BEATS.length - 1);
  if (next !== sessionBeatIndex.value) {
    sessionBeatIndex.value = next;
    sessionBannerVisible.value = true;
  }
};

// Per-beat accent (border + tint) as CSS custom props, generated from the beat's
// OKLCH hue (Tier-2 content color). Beats without an `accentHue` fall back to the
// base info blue (CSS default). The border-color/background transition on
// .peek-note eases the color shift as beats swap. Shared by both phases so the
// lesson beat participates in the same hue cycle as the practice beats.
const accentStyleFor = (beat: PeekBeat | null | undefined): Record<string, string> => {
  const style: Record<string, string> = {};
  const h = beat?.accentHue;
  if (h !== undefined) {
    style['--beat-accent'] = oklch(0.62, 0.16, h);
    style['--beat-accent-soft'] = oklch(0.96, 0.045, h);
  }
  return style;
};
const lessonAccentStyle = computed(() => accentStyleFor(LESSON_BEATS[0]));
const beatAccentStyle = computed(() => accentStyleFor(currentSessionBeat.value));

// Dismiss animation: collapse the banner's own box (height + vertical
// margin/padding + opacity) so the content below eases up instead of snapping.
// JS-driven (:css="false") to pin the exact pixel height — a fixed max-height
// would either clip tall copy or spend the first frames animating dead space.
const BANNER_COLLAPSE_MS = 260;
const collapseBeforeLeave = (el: Element) => {
  const e = el as HTMLElement;
  e.style.maxHeight = `${e.scrollHeight}px`;
  e.style.overflow = 'hidden';
};
const collapseLeave = (el: Element, done: () => void) => {
  const e = el as HTMLElement;
  e.style.transition =
    `max-height ${BANNER_COLLAPSE_MS}ms ease, opacity ${BANNER_COLLAPSE_MS}ms ease, ` +
    `margin ${BANNER_COLLAPSE_MS}ms ease, padding ${BANNER_COLLAPSE_MS}ms ease`;
  // Two rAFs: let the start (scrollHeight) commit before collapsing to 0.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      e.style.maxHeight = '0px';
      e.style.opacity = '0';
      e.style.marginTop = '0px';
      e.style.marginBottom = '0px';
      e.style.paddingTop = '0px';
      e.style.paddingBottom = '0px';
    }),
  );
  window.setTimeout(done, BANNER_COLLAPSE_MS + 30);
};

const advanceToSession = async () => {
  // Timing mark: the visitor leaves the intro lesson for practice.
  performance.mark?.('lp:peek-lesson-done');
  // Best-effort persistence — if writes fail, the lesson re-shows next visit
  // (acceptable behavior for preview mode).
  await recordLessonComplete(INTRO_LESSON_ID).catch((e) => {
    console.warn('[PeekView] Failed to record hello-world completion:', e);
  });
  phase.value = 'session';
  if (!sessionPrepared.value) {
    await initStudySession(PEEK_INIT);
  }
};

const goToStudy = () => {
  // /peek <-> /study crosses the namespace boundary; the router guard
  // (see router/index.ts) intercepts and does a hard reload so the
  // singleton guest user re-resolves against sk-study-uuid.
  router.push('/study');
};

// ---------------------------------------------------------------------------
// Keyboard context (mirrors StudyPracticeView)
// ---------------------------------------------------------------------------

const keyboardContext: KeyboardContextProvider = createKeyboardContext();
provideKeyboardContext(keyboardContext);

const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);

watch(keyboardRef, (newRef) => {
  if (newRef) {
    keyboardContext.connectKeyboard(newRef);
  }
});

// Keyboard is shared between lesson + session phases. The lesson component
// configures it via the injected context; we just need the actual element
// mounted whenever either phase is active.
const showKeyboard = computed(() => {
  if (showTransitionPrompt.value) return false;
  if (phase.value === 'lesson') return !!lessonComponent.value;
  if (phase.value === 'session') return sessionPrepared.value;
  return false;
});

// Timer is session-only — lesson phase has no time budget.
const showTimer = computed(() => phase.value === 'session');

const keyboardLetters = computed(() => {
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
  return Array.from(keyboardContext.highlights.value.keys());
});

const keyboardColors = computed(() => {
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

const keyboardSpaceText = computed(() => keyboardContext.advanceText.value);

const handleKeyboardPress = (event: KeyEvent) => keyboardContext.dispatchKeyPress(event);
const handleKeyboardRelease = (event: KeyEvent) => keyboardContext.dispatchKeyRelease(event);
const handleKeyboardTap = (event: KeyEvent) => keyboardContext.dispatchKeyTap(event);
const handleKeyboardHover = (event: KeyEvent) => keyboardContext.dispatchKeyHover(event);
const handleKeyboardHoverEnd = (event: KeyEvent) => keyboardContext.dispatchKeyHoverEnd(event);
const handleKeyboardAdvance = () => keyboardContext.dispatchAdvance();
const handleKeyboardEnter = () => keyboardContext.dispatchEnter();
const handleKeyboardArrowLeft = () => keyboardContext.dispatchArrowLeft();
const handleKeyboardArrowRight = () => keyboardContext.dispatchArrowRight();
const handleKeyboardInvalidKey = (letter: string) => keyboardContext.dispatchInvalidKey(letter);

const initializeKeyboardBaseLetters = async () => {
  const progression = await getLetterProgression();
  keyboardContext.setBaseLetters(progression?.unlockedLetters ?? []);
};

const getViewComponent = (view_id: string) => allCourseWare.getView(view_id);

const onSessionFinished = () => {
  handleSessionFinished();
  keyboardContext.clearQuestionConfig();
  keyboardContext.updateConfig({
    disabled: false,
    showAdvance: false,
    showArrows: false,
    showFullLayout: true,
  });
};

onMounted(async () => {
  prefetchPhonemeAudio(50);

  // Kick off session prep (incl. background course-DB replication) now, NOT
  // awaited. First-time visitors spend the next ~30s+ in the hello-world
  // readaloud; starting the sync here lets it finish during the lesson, so
  // the post-lesson session constructs its CourseDB against the warm local
  // replica instead of remote couch (slow ttfp).
  initStudySession(PEEK_INIT);

  await initializeKeyboardBaseLetters();

  // Track peek session (peek user is a guest; track separately from studySessionCount)
  if (user) {
    const username = user.getUsername();
    if (username.startsWith('sk-guest-')) {
      sessionTracker.incrementPeekSession();
      console.log('[PeekView] Peek session tracked:', {
        username,
        peekSessionCount: sessionTracker.peekSessionCount,
      });
    }
  }

  // Phase resolution: hello-world before any session content for first-time
  // peek visitors. Returning visitors (lesson already completed in this
  // peek DB) skip straight to session.
  // `?perf=session`: start the session without the lesson, as a returning
  // peek visitor does, so a page-load measurement (the PageSpeed nightly)
  // covers session preparation and the first card. Records nothing; the
  // lesson still shows on a later visit without the flag.
  let lessonCompleted = route.query.perf === 'session';
  if (!lessonCompleted) {
    try {
      const progress = await getLessonProgress();
      lessonCompleted = !!progress?.completedLessons?.includes(INTRO_LESSON_ID);
    } catch (e) {
      console.warn('[PeekView] Could not read lesson progress; defaulting to lesson phase:', e);
    }
  }

  if (!lessonCompleted) {
    lessonComponent.value = getLessonComponent(INTRO_LESSON_ID);
    if (lessonComponent.value) {
      phase.value = 'lesson';
      // Session prep is already warming in the background (see top of this
      // hook); the session itself renders only after the lesson completes.
      return;
    }
    // Fallthrough: registry miss is unexpected but shouldn't strand the view.
    console.warn('[PeekView] No component registered for', INTRO_LESSON_ID);
  }

  phase.value = 'session';
  if (!sessionPrepared.value) {
    await initStudySession(PEEK_INIT);
  }
});
</script>

<style scoped>
.peek-view-layout {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--v-layout-top, 0px));
  overflow: hidden;
  /* Positioning context for .session-timer, anchored to the whole view (not
     the keyboard band) so it can switch corners by breakpoint. */
  position: relative;
}

.peek-content-area {
  flex: 1;
  padding: 0;
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.transition-card {
  max-width: 600px;
  width: 100%;
}

/* Compact dismissible note bar (v-alert's grid wastes a full icon-row of
   vertical space on narrow screens; this is a plain flex row instead). */
.peek-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px;
  padding: 6px 10px;
  max-width: 860px;
  flex-shrink: 0;
  /* --beat-accent / --beat-accent-soft are set per session beat (beatAccentStyle);
     the lesson banner + beat 1 leave them unset and fall back to info blue. */
  border-left: 3px solid var(--beat-accent, rgb(var(--v-theme-info)));
  border-radius: 4px;
  background: var(--beat-accent-soft, rgba(var(--v-theme-info), 0.08));
  font-size: 0.95rem;
  line-height: 1.4;
  transition: border-color 0.3s ease, background-color 0.3s ease;
}

.peek-note .v-icon {
  margin-top: 1px;
  color: rgb(var(--v-theme-info));
  flex-shrink: 0;
}

/* Text column: fills the row so the dismiss button sits at the right; min-width:0
   lets the copy wrap instead of overflowing the flex row. position:relative is
   the anchor for the absolutely-positioned leaving beat during a swap. */
.peek-note-body-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
}
.peek-note-body p {
  margin: 0;
}
.peek-note-body p + p {
  margin-top: 0.7em; /* replaces the old <br><br> paragraph gap */
}

/* Beat swap: enter from the right, leave to the left. The leaving copy is taken
   out of flow (absolute) so the entering copy defines the box height immediately
   — no empty-gap collapse mid-swap. */
.beat-slide-enter-active,
.beat-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.beat-slide-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
.beat-slide-enter-from {
  transform: translateX(18px);
  opacity: 0;
}
.beat-slide-leave-to {
  transform: translateX(-18px);
  opacity: 0;
}

.peek-note-close {
  margin: -2px -6px 0 0;
}

.banner-link {
  cursor: pointer;
  font-weight: 500;
  text-decoration: underline;
}

.study-session-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
}

.study-session-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
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
}

/* Roomy screens: unchanged — lower-left, beside the keyboard, which doesn't
   reach that corner there (row 4 is just the centered spacebar). */
.session-timer {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 1;
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
     the top-right, clear of the child's hands and of the keys. Scaled down
     since it reads as peripheral status here (the hover-gated add-time button
     and tooltip are both unreachable on touch anyway). */
  .session-timer {
    top: 8px;
    right: 8px;
    left: auto;
    bottom: auto;
    transform: scale(0.7);
    transform-origin: top right;
  }

  /* Reserve the top-right corner for the floating timer by shrinking the
     banner box itself (a right *margin*, not padding). Padding would inset the
     text but leave the tinted background underlapping the clock — the reported
     bug. align-self:stretch overrides the parent's align-items:center so the
     box fills the row minus its margins, pinning the right edge deterministically
     regardless of how the copy wraps. 56px ≈ scaled timer (45px) + 8px inset +
     clearance; this also keeps the ✕ clear, so no padding-right needed. */
  .peek-note--with-timer {
    align-self: stretch;
    margin-right: 56px;
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
