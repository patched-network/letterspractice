<template>
  <div class="lesson-debug">
    <!-- Left panel: controls -->
    <div class="lesson-debug__panel">
      <!-- Lesson picker -->
      <div class="dbg-section">
        <div class="dbg-label">Lesson</div>
        <div class="lesson-chips">
          <v-chip
            v-for="lesson in LESSON_CATALOG"
            :key="lesson.id"
            size="small"
            :color="selectedId === lesson.id ? 'primary' : undefined"
            :variant="selectedId === lesson.id ? 'elevated' : 'outlined'"
            class="lesson-chip"
            @click="selectLesson(lesson.id)"
          >
            {{ lesson.id }}
          </v-chip>
        </div>
      </div>

      <!-- Deferred lesson pickers: component-registered (previewable) vs not -->
      <div v-if="deferredBuilt.length > 0" class="dbg-section">
        <div class="dbg-label">Deferred · Previewable</div>
        <div class="lesson-chips">
          <v-chip
            v-for="lesson in deferredBuilt"
            :key="lesson.id"
            size="small"
            prepend-icon="mdi-eye-outline"
            :color="selectedId === lesson.id ? 'warning' : undefined"
            :variant="selectedId === lesson.id ? 'elevated' : 'outlined'"
            class="lesson-chip"
            @click="selectLesson(lesson.id)"
          >
            {{ lesson.id }}
          </v-chip>
        </div>
      </div>
      <div v-if="deferredUnbuilt.length > 0" class="dbg-section">
        <div class="dbg-label">Deferred · Not Implemented</div>
        <div class="lesson-chips">
          <v-chip
            v-for="lesson in deferredUnbuilt"
            :key="lesson.id"
            size="small"
            prepend-icon="mdi-clock-outline"
            :color="selectedId === lesson.id ? 'warning' : undefined"
            :variant="selectedId === lesson.id ? 'elevated' : 'outlined'"
            class="lesson-chip lesson-chip--deferred"
            @click="selectLesson(lesson.id)"
          >
            {{ lesson.id }}
          </v-chip>
        </div>
      </div>

      <!-- Pane previews -->
      <div class="dbg-section">
        <div class="dbg-label">Panes</div>
        <div class="lesson-chips">
          <v-chip
            size="small"
            :color="previewPane === 'complete' ? 'secondary' : undefined"
            :variant="previewPane === 'complete' ? 'elevated' : 'outlined'"
            class="lesson-chip"
            @click="toggleCompletePanePreview"
          >
            LessonCompletePane
          </v-chip>
        </div>
      </div>

      <!-- Reset button -->
      <div class="dbg-section">
        <v-btn size="small" variant="outlined" color="default" block @click="resetLesson">
          Reset Lesson
        </v-btn>
      </div>

      <!-- Lesson metadata -->
      <div class="dbg-section">
        <div class="dbg-label">Metadata</div>
        <div v-if="selectedDefinition" class="dbg-meta">
          <div v-if="!currentComponent" class="dbg-meta-row">
            <span class="dbg-meta-key" style="color: #e65100">status</span>
            <span class="dbg-meta-val" style="color: #e65100">deferred</span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">gates</span>
            <span class="dbg-meta-val">{{ selectedDefinition.gatesConceptTags.join(', ') }}</span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">prereqs</span>
            <span class="dbg-meta-val">{{ (selectedDefinition.prerequisites ?? []).join(', ') || '—' }}</span>
          </div>
          <div v-if="contentSummary" class="dbg-meta-row">
            <span class="dbg-meta-key">content</span>
            <span class="dbg-meta-val">
              {{ contentSummary.beatCount }} beats · {{ contentSummary.dialogueWordCount }} dialogue words ·
              <span :title="`target words: ${contentSummary.targetWords.join(', ') || '—'}`">
                {{ contentSummary.audioEventCount }} audio
                ({{ contentSummary.phonemeAudioCount }} phoneme, {{ contentSummary.wordAudioCount }} word)
              </span>
            </span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">admin</span>
            <a
              class="dbg-meta-val dbg-admin-link"
              :href="adminContentHref"
              target="_blank"
              rel="noopener"
              title="Lesson audit in /admin/content (live DB card counts, curriculum checks)"
            >
              content audit
              <v-icon size="12">mdi-open-in-new</v-icon>
            </a>
          </div>
        </div>
      </div>

      <!-- Event log -->
      <div class="dbg-section dbg-section--log">
        <div class="dbg-label">Event Log</div>
        <div class="dbg-log">
          <div v-if="events.length === 0" class="dbg-log-empty">No events yet</div>
          <div
            v-for="(evt, i) in events"
            :key="i"
            class="dbg-log-entry"
          >
            <span class="dbg-log-time">{{ evt.time }}</span>
            <v-chip size="x-small" :color="eventColor(evt.name)" variant="tonal">
              {{ evt.name }}
            </v-chip>
          </div>
        </div>
        <v-btn v-if="events.length > 0" size="x-small" variant="text" @click="events = []" class="mt-1">
          Clear
        </v-btn>
      </div>
    </div>

    <!-- Right area: lesson component + keyboard -->
    <div class="lesson-debug__main">
      <div class="lesson-debug__content">
        <LessonCompletePane
          v-if="previewPane === 'complete'"
          @practice-now="logEvent('practice-now')"
          @back-to-menu="logEvent('back-to-menu')"
        />
        <component
          v-else-if="currentComponent && lessonKey > 0"
          :is="currentComponent"
          :key="lessonKey"
          ref="lessonComponentRef"
          @lesson-complete="logEvent('lesson-complete')"
          @practice-now="logEvent('practice-now'); resetLesson()"
          @back-to-menu="logEvent('back-to-menu'); resetLesson()"
        />
        <div v-else-if="selectedId && !currentComponent" class="lesson-debug__placeholder">
          <v-icon size="48" color="warning" style="opacity: 0.5">mdi-clock-outline</v-icon>
          <p class="text-body-2 text-medium-emphasis mt-2">Not yet implemented</p>
          <p class="text-caption text-disabled mt-1">{{ selectedId }}</p>
        </div>
        <div v-else class="lesson-debug__placeholder">
          <v-icon size="48" color="default" style="opacity: 0.3">mdi-book-open-variant</v-icon>
          <p class="text-body-2 text-medium-emphasis mt-2">Select a lesson</p>
        </div>

        <!-- Lesson playback timer (lower-left overlay) -->
        <div v-if="timerVisible" class="lesson-debug__timer" :class="{ 'lesson-debug__timer--stopped': timerStopped }">
          <v-icon size="14" class="mr-1">{{ timerStopped ? 'mdi-check-circle' : 'mdi-timer-outline' }}</v-icon>
          {{ formattedElapsed }}
        </div>
      </div>

      <!-- Keyboard area (same pattern as LessonView) -->
      <div v-if="showKeyboard" class="lesson-debug__keyboard">
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
          @keypress="keyboardContext.dispatchKeyPress($event)"
          @keyrelease="keyboardContext.dispatchKeyRelease($event)"
          @keytap="keyboardContext.dispatchKeyTap($event)"
          @keyhover="keyboardContext.dispatchKeyHover($event)"
          @keyhoverend="keyboardContext.dispatchKeyHoverEnd($event)"
          @kbd-space="keyboardContext.dispatchAdvance()"
          @kbd-enter="keyboardContext.dispatchEnter()"
          @arrow-left="keyboardContext.dispatchArrowLeft()"
          @arrow-right="keyboardContext.dispatchArrowRight()"
          @backspace="keyboardContext.dispatchBackspace()"
          @invalid-key="keyboardContext.dispatchInvalidKey($event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, type Component } from 'vue';
import { LESSON_CATALOG, DEFERRED_LESSON_CATALOG, getAnyLessonById } from '../services/lessons';
import { getLessonComponent } from '../lessons/index';
import {
  summarizeLessonSteps,
  type LessonStep,
  type LessonContentSummary,
} from '../lessons/useLessonRunner';
import ProgressiveKeyboard from '../components/keyboard/ProgressiveKeyboard.vue';
import LessonCompletePane from '../lessons/LessonCompletePane.vue';
import {
  createKeyboardContext,
  provideKeyboardContext,
} from '../composables/useKeyboardContext';

// ---------------------------------------------------------------------------
// Keyboard context (same setup as LessonView)
// ---------------------------------------------------------------------------

const keyboardContext = createKeyboardContext();
provideKeyboardContext(keyboardContext);

const keyboardRef = ref<InstanceType<typeof ProgressiveKeyboard> | null>(null);

watch(keyboardRef, (newRef) => {
  if (newRef) keyboardContext.connectKeyboard(newRef);
});

const showKeyboard = computed(() => !!currentComponent.value && lessonKey.value > 0);

const keyboardLetters = computed(() => {
  const active = keyboardContext.hasQuestionConfig.value
    ? [...keyboardContext.activeLetters.value]
    : [];
  if (keyboardContext.showArrows.value) {
    if (!active.includes('arrowleft')) active.push('arrowleft');
    if (!active.includes('arrowright')) active.push('arrowright');
  }
  if (!active.includes('enter')) active.push('enter');
  if (keyboardContext.showAdvance.value && !active.includes('space')) active.push('space');
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
  if (keyboardContext.showAdvance.value && !enabled.includes('space')) enabled.push('space');
  return enabled;
});

const keyboardHighlightedLetters = computed(() =>
  Array.from(keyboardContext.highlights.value.keys()),
);

const keyboardColors = computed(() => {
  const colors: Record<string, string> = { ...keyboardContext.keyColors.value };
  for (const [letter, highlight] of keyboardContext.highlights.value.entries()) {
    if (typeof highlight === 'string') colors[letter] = highlight;
  }
  if (keyboardContext.advanceColor.value) colors['space'] = keyboardContext.advanceColor.value;
  return colors;
});

const keyboardSpaceText = computed(() => keyboardContext.advanceText.value);

// ---------------------------------------------------------------------------
// Lesson selection
// ---------------------------------------------------------------------------

const previewPane = ref<'complete' | null>(null);

function toggleCompletePanePreview() {
  previewPane.value = previewPane.value === 'complete' ? null : 'complete';
  selectedId.value = null;
  events.value = [];
}

const selectedId = ref<string | null>(null);
const lessonKey = ref(0);

// Deferred lessons partitioned by component registration: a registered
// component makes the lesson previewable here even while its catalog
// status stays deferred (see src/lessons/CLAUDE.md).
const deferredBuilt = computed(() =>
  DEFERRED_LESSON_CATALOG.filter((l) => !!getLessonComponent(l.id)),
);
const deferredUnbuilt = computed(() =>
  DEFERRED_LESSON_CATALOG.filter((l) => !getLessonComponent(l.id)),
);

const selectedDefinition = computed(() =>
  selectedId.value ? getAnyLessonById(selectedId.value) : null,
);

// Deep link into the admin content view's lesson audit. Both surfaces key
// on lesson.id from the same LESSON_CATALOG / DEFERRED_LESSON_CATALOG
// arrays, so the link can't drift from the audit card it targets.
const adminContentHref = computed(() =>
  selectedId.value
    ? `/admin/content?tab=lessons&lesson=${encodeURIComponent(selectedId.value)}`
    : '',
);

const currentComponent = computed((): Component | null => {
  if (!selectedId.value) return null;
  return getLessonComponent(selectedId.value);
});

// Reads STEPS off the mounted lesson component (via its defineExpose) to
// derive a word/beat-count report — see summarizeLessonSteps.
const lessonComponentRef = ref<{ steps?: LessonStep<string>[] } | null>(null);

const contentSummary = computed<LessonContentSummary | null>(() => {
  const steps = lessonComponentRef.value?.steps;
  return steps ? summarizeLessonSteps(steps) : null;
});

function selectLesson(id: string) {
  previewPane.value = null;
  selectedId.value = id;
  events.value = [];
  lessonKey.value++;
  startTimer();
}

function resetLesson() {
  if (selectedId.value) {
    events.value = [];
    lessonKey.value++;
    startTimer();
  }
}

// ---------------------------------------------------------------------------
// Playback timer — runs from lesson load until 'lesson-complete' is emitted
// ---------------------------------------------------------------------------

const elapsedMs = ref(0);
const timerStopped = ref(false);
const timerVisible = computed(() => !!currentComponent.value && lessonKey.value > 0);
let timerStartTs = 0;
let timerRaf: number | null = null;

function startTimer() {
  stopTimerLoop();
  elapsedMs.value = 0;
  timerStopped.value = false;
  timerStartTs = performance.now();
  const tick = () => {
    elapsedMs.value = performance.now() - timerStartTs;
    timerRaf = requestAnimationFrame(tick);
  };
  timerRaf = requestAnimationFrame(tick);
}

function stopTimer() {
  if (timerStopped.value) return;
  stopTimerLoop();
  elapsedMs.value = performance.now() - timerStartTs;
  timerStopped.value = true;
}

function stopTimerLoop() {
  if (timerRaf !== null) {
    cancelAnimationFrame(timerRaf);
    timerRaf = null;
  }
}

const formattedElapsed = computed(() => {
  const totalSec = elapsedMs.value / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const tenths = Math.floor((elapsedMs.value % 1000) / 100);
  return `${min}:${sec.toString().padStart(2, '0')}.${tenths}`;
});

onBeforeUnmount(stopTimerLoop);

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

interface LogEvent {
  name: string;
  time: string;
}

const events = ref<LogEvent[]>([]);

function logEvent(name: string) {
  const now = new Date();
  events.value.unshift({
    name,
    time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
  });
  if (events.value.length > 30) events.value.pop();
  if (name === 'lesson-complete') stopTimer();
}

function eventColor(name: string): string {
  if (name === 'lesson-complete') return 'success';
  if (name === 'practice-now') return 'primary';
  if (name === 'back-to-menu') return 'default';
  return 'info';
}
</script>

<style scoped>
.lesson-debug {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #f8f9fa;
}

/* Left panel */
.lesson-debug__panel {
  width: 240px;
  flex-shrink: 0;
  background: white;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 12px 0;
}

.dbg-section {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.dbg-section--log {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.dbg-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #888;
  margin-bottom: 8px;
}

.lesson-chips {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.lesson-chip {
  cursor: pointer;
  font-size: 0.7rem !important;
}

.lesson-chip--deferred {
  opacity: 0.65;
}

/* Metadata */
.dbg-meta {
  font-size: 0.72rem;
  font-family: monospace;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dbg-meta-row {
  display: flex;
  gap: 6px;
}

.dbg-meta-key {
  color: #888;
  min-width: 50px;
  font-weight: 600;
}

.dbg-meta-val {
  color: #333;
  word-break: break-all;
}

.dbg-admin-link {
  color: #1976d2;
  text-decoration: none;
}

.dbg-admin-link:hover {
  text-decoration: underline;
}

/* Event log */
.dbg-log {
  flex: 1;
  overflow-y: auto;
  max-height: 200px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dbg-log-empty {
  font-size: 0.75rem;
  color: #bbb;
  font-style: italic;
}

.dbg-log-entry {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dbg-log-time {
  font-size: 0.65rem;
  font-family: monospace;
  color: #aaa;
  min-width: 50px;
}

/* Right: lesson + keyboard */
.lesson-debug__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.lesson-debug__content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 0;
  position: relative;
}

.lesson-debug__placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40px;
}

.lesson-debug__timer {
  position: absolute;
  bottom: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.85rem;
  font-weight: 600;
  color: #555;
  background: rgba(255, 255, 255, 0.92);
  padding: 6px 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  z-index: 10;
  pointer-events: none;
  user-select: none;
}

.lesson-debug__timer--stopped {
  color: #2e7d32;
  background: rgba(232, 245, 233, 0.95);
}

.lesson-debug__keyboard {
  flex-shrink: 0;
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding: 8px 16px 16px;
  display: flex;
  justify-content: center;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
}
</style>
