<template>
  <div class="lesson-view-layout">
    <!-- Preview (from /curriculum, no app header): the way back, floating over the stage -->
    <a
      v-if="preview"
      :href="curriculumReturn"
      class="lesson-preview-back"
      aria-label="Back to the curriculum"
      @click="onPreviewBackClick"
    >
      <v-icon size="24">mdi-arrow-left</v-icon>
      <span class="lesson-preview-back__label">Curriculum</span>
      <kbd class="lesson-preview-back__esc" aria-hidden="true">esc</kbd>
    </a>

    <!-- Main scrollable content area -->
    <div class="lesson-content-area">
      <!-- Lesson not found -->
      <div v-if="!lesson" class="lesson-not-found">
        <v-card class="pa-6 text-center">
          <v-icon size="64" color="warning" class="mb-4">mdi-book-off-outline</v-icon>
          <h2 class="text-h5 mb-3">Lesson Not Found</h2>
          <p class="text-body-1 text-medium-emphasis mb-4">
            This lesson doesn't exist or isn't available yet.
          </p>
          <v-btn size="large" color="primary" variant="elevated" @click="preview ? backToCurriculum() : router.push('/study')">
            {{ preview ? 'Back to the curriculum' : 'Back to Menu' }}
          </v-btn>
        </v-card>
      </div>

      <!-- Preview of a 3D-only lesson where 3D can't run (the stub would pass it) -->
      <div v-else-if="preview && needs3D" class="lesson-not-found">
        <v-card class="pa-6 text-center">
          <v-icon size="64" color="info" class="mb-4">mdi-cube-off-outline</v-icon>
          <h2 class="text-h5 mb-3">This lesson needs 3D</h2>
          <p class="text-body-1 text-medium-emphasis mb-4">
            {{ lesson.title }} is staged in 3D, which this browser can't show.
          </p>
          <v-btn size="large" color="primary" variant="elevated" @click="backToCurriculum">
            Back to the curriculum
          </v-btn>
        </v-card>
      </div>

      <!-- Lesson component (hand-rolled, from registry) -->
      <component
        v-else-if="lessonComponent"
        :is="lessonComponent"
        @lesson-complete="handleLessonComplete"
        @practice-now="handlePracticeNow"
        @back-to-menu="handleBackToMenu"
      />
    </div>

    <!-- Persistent Keyboard Area (fixed at bottom, same pattern as StudyPracticeView) -->
    <div v-if="showKeyboard && !(preview && needs3D)" class="keyboard-area">
      <ProgressiveKeyboard
        ref="keyboardRef"
        :letters="keyboardLetters"
        :enabled-letters="keyboardEnabledLetters"
        :highlighted-letters="keyboardHighlightedLetters"
        :key-colors="keyboardColors"
        :space-text="keyboardSpaceText"
        :show-full-layout="keyboardContext.showFullLayout.value"
        :play-phoneme-on-press="false"
        :capture-keyboard="true"
        :lowercase-keycaps="true"
        :disabled="keyboardContext.disabled.value"
        :disable-transition-ms="keyboardContext.disableTransitionMs.value"
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
  </div>
</template>

<script setup lang="ts">
/**
 * LessonView — thin shell that:
 *   1. Resolves the lesson definition + Vue component from the registry
 *   2. Creates and provides a KeyboardContext (same pattern as StudyPracticeView)
 *   3. Renders the keyboard area at the bottom
 *   4. Delegates all lesson logic to the hand-rolled lesson component
 *
 * `preview` (the /curriculum/lesson/:id route): plays a live lesson for a
 * reader with no side effects — nothing recorded, no practice armed, no study
 * session warmed — on a full keyboard. The route is `bare` (no app header):
 * the way back to /curriculum floats over the stage, and Esc takes it too.
 * Lesson components write no user state themselves; LessonView is where
 * passage is recorded, so skipping it here is the whole sandbox.
 *
 * Each lesson component (in src/lessons/) injects the keyboard context
 * via useKeyboardContextOptional() and controls its own key layout,
 * event subscriptions, PhoneticWord interactions, Stage rendering, etc.
 *
 * See: agent/study-split/a.1.plan.md, a.3.revision.md
 */

import { ref, computed, onMounted, onBeforeUnmount, onErrorCaptured, provide, watch, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { getLessonById, getPostLessonHints } from '../services/lessons';
import { recordLessonComplete, setPostLessonPracticeFlag } from '../services/userState';
import { getLessonComponent, lessonNeeds3DHere } from '../lessons/index';
import { COMPLETE_PANE_BACK_LABEL } from '../lessons/completePaneLabel';
import { Letters3DUnavailable } from '../services/letters3d';
import ProgressiveKeyboard from '../components/keyboard/ProgressiveKeyboard.vue';
import {
  createKeyboardContext,
  provideKeyboardContext,
  type KeyEvent,
  type KeyboardContextProvider,
} from '../composables/useKeyboardContext';
import { getLetterProgression } from '../services/userState';
import { useStudySession } from '../composables/useStudySession';
import type { LessonDefinition } from '../services/lessons.types';

// ---------------------------------------------------------------------------
// Props & Router
// ---------------------------------------------------------------------------

const props = defineProps<{
  lessonId: string;
  /** Reader preview from /curriculum: no recording, no practice */
  preview?: boolean;
}>();

const curriculumReturn = computed(() => `/curriculum#lesson-${props.lessonId}`);
/** Set on mount and on a 3D failure (use3DLetters() reads the failure flag) */
const needs3D = ref(false);
const PREVIEW_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const router = useRouter();
const { initStudySession, setInitHints } = useStudySession();

/**
 * Back to /curriculum. Arrived from it: history back, so the page restores
 * the reader's exact scroll. Otherwise (a direct link): to the lesson's section.
 */
function backToCurriculum() {
  const back = (window.history.state as { back?: unknown } | null)?.back;
  if (typeof back === 'string' && back.split(/[?#]/)[0] === '/curriculum') router.back();
  else router.push(curriculumReturn.value);
}

/** A plain click goes back; a modified one (new tab, …) follows the href */
function onPreviewBackClick(e: MouseEvent) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  backToCurriculum();
}

function onPreviewKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.repeat) return;
  e.preventDefault();
  backToCurriculum();
}

if (props.preview) provide(COMPLETE_PANE_BACK_LABEL, 'Back to the curriculum');

// ---------------------------------------------------------------------------
// Lesson Resolution
// ---------------------------------------------------------------------------

const lesson = ref<LessonDefinition | null>(null);
const lessonComponent = ref<Component | null>(null);

// ---------------------------------------------------------------------------
// Keyboard Context (same setup as StudyPracticeView)
// ---------------------------------------------------------------------------

const keyboardContext: KeyboardContextProvider = createKeyboardContext();
provideKeyboardContext(keyboardContext);

const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);

watch(keyboardRef, (newRef) => {
  if (newRef) {
    keyboardContext.connectKeyboard(newRef);
  }
});

// Show keyboard once we have a valid lesson
const showKeyboard = computed(() => {
  return !!lesson.value && !!lessonComponent.value;
});

// ---------------------------------------------------------------------------
// Keyboard Computed Props (bridges context state to ProgressiveKeyboard props)
// ---------------------------------------------------------------------------

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

const keyboardSpaceText = computed(() => {
  return keyboardContext.advanceText.value;
});

// ---------------------------------------------------------------------------
// Keyboard Event Handlers (dispatch to context)
// ---------------------------------------------------------------------------

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
// Keyboard Base Letters
// ---------------------------------------------------------------------------

const initializeKeyboardBaseLetters = async () => {
  // A reader previewing a lesson gets the keyboard of a learner who's reached it
  if (props.preview) {
    keyboardContext.setBaseLetters(PREVIEW_LETTERS);
    return;
  }
  const progression = await getLetterProgression();
  keyboardContext.setBaseLetters(progression?.unlockedLetters ?? []);
};

// ---------------------------------------------------------------------------
// Lesson Completion Handlers
// ---------------------------------------------------------------------------

/**
 * Arm the post-lesson practice follow-on, on completion (not only the
 * "Practice Now" CTA — otherwise lessons exited via @lesson-complete never
 * surface their follow-on, e.g. the digraphs lesson's required WST-sh card).
 *
 * Two things are armed, both consumed by the immediate next practice session:
 *  1. The durable `postLessonPracticeFlag` (cleared on the next
 *     StudyPracticeView mount) — the canonical record that a lesson just passed.
 *  2. The session-durable init hints (requireCards / concept boost), pre-seeded
 *     into the composable NOW, while still on the lesson view.
 *
 * (2) is the fix for the dropped requireCard: warm-prep (initStudySession on
 * lesson mount) leaves `sessionPrepared=true` but builds NO SessionController
 * until StudyPracticeView mounts StudySession. If the hints are only set in
 * StudyPracticeView.onMounted (as before), that runs AFTER StudySession's
 * created()→initSession() has already read `initHints` once and planned — so
 * the require (e.g. the a_e split-digraph intro at +Infinity) never reached the
 * initial plan and the intro only weakly resurfaced via prescribed backpressure.
 * Seeding here means the warm session's FIRST plan already carries it — no
 * replan, no extra spinner, no cold reload. StudyPracticeView's flag-based set
 * remains as an idempotent fallback + the flag clear.
 */
async function armPostLessonPractice(lessonId: string): Promise<void> {
  await setPostLessonPracticeFlag(lessonId);
  const hints = getPostLessonHints(lessonId);
  if (Object.keys(hints).length > 0) {
    setInitHints(hints);
  }
}

async function handleLessonComplete() {
  if (props.preview) return;
  if (lesson.value) {
    await recordLessonComplete(lesson.value.id);
    await armPostLessonPractice(lesson.value.id);
  }
}

async function handlePracticeNow() {
  if (props.preview) {
    router.push('/study');
    return;
  }
  if (lesson.value) {
    await recordLessonComplete(lesson.value.id);
    await armPostLessonPractice(lesson.value.id);
  }
  router.push('/study/practice');
}

async function handleBackToMenu() {
  if (props.preview) {
    backToCurriculum();
    return;
  }
  if (lesson.value) {
    await recordLessonComplete(lesson.value.id);
  }
  router.push('/study');
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// A 3D lesson whose stage can't start re-mounts as SVG (3D is now marked
// failed, so the registry hands back the SVG lesson)
onErrorCaptured((err) => {
  if (!(err instanceof Letters3DUnavailable)) return;
  needs3D.value = lessonNeeds3DHere(props.lessonId);
  lessonComponent.value = getLessonComponent(props.lessonId);
  return false;
});

onMounted(async () => {
  // Warm session prep (incl. background course-DB replication) while the
  // lesson plays — NOT awaited. Usually a no-op (StudyHubView fired it on
  // mount), but covers direct links / full page reloads on /study/lesson/*,
  // where the singleton reset would otherwise delay the sync until
  // /study/practice mounts.
  if (!props.preview) initStudySession();
  if (props.preview) document.addEventListener('keydown', onPreviewKeydown);

  // Resolve lesson definition
  lesson.value = getLessonById(props.lessonId);
  if (!lesson.value) {
    console.warn(`[LessonView] Lesson not found: ${props.lessonId}`);
    return;
  }

  // Resolve lesson Vue component from registry
  needs3D.value = lessonNeeds3DHere(props.lessonId);
  lessonComponent.value = getLessonComponent(props.lessonId);
  if (!lessonComponent.value) {
    console.warn(`[LessonView] No component registered for lesson: ${props.lessonId}`);
    lesson.value = null; // trigger "not found" state
    return;
  }

  // Initialize keyboard base letters from persisted state
  await initializeKeyboardBaseLetters();
});

onBeforeUnmount(() => document.removeEventListener('keydown', onPreviewKeydown));
</script>

<style scoped>
.lesson-view-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--v-layout-top, 0px));
  overflow: hidden;
}

.lesson-content-area {
  flex: 1;
  padding: 0;
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Same pill as /curriculum's "Watch the lesson" — the way out looks like the
   way in. Above the stage, its audio button and the complete pane (z 10). */
.lesson-preview-back {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  left: max(16px, env(safe-area-inset-left));
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 14px 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  font-size: 1rem;
  font-weight: 600;
  color: #212121;
  text-decoration: none;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.lesson-preview-back:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.22);
}
.lesson-preview-back:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 3px;
}
.lesson-preview-back__esc {
  display: none;
  padding: 1px 6px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font: 600 0.7rem/1.4 ui-monospace, monospace;
  color: rgba(33, 33, 33, 0.6);
}
/* The Esc hint only where there's likely a physical keyboard */
@media (hover: hover) and (pointer: fine) {
  .lesson-preview-back__esc {
    display: inline-block;
  }
}
/* Phones: a round icon button */
@media (max-width: 600px) {
  .lesson-preview-back {
    width: 48px;
    padding: 0;
    justify-content: center;
  }
  .lesson-preview-back__label,
  .lesson-preview-back__esc {
    display: none;
  }
}

.lesson-not-found {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  padding: 24px;
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

@media (max-width: 600px) {
  .keyboard-area {
    padding: 4px 8px 8px;
  }
}

@media (min-width: 960px) {
  .keyboard-area {
    padding: 12px 24px 20px;
  }
}
</style>