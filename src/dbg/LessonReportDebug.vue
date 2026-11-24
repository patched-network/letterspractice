<template>
  <div class="report-debug">
    <!-- Left panel: lesson picker + raw data -->
    <div class="report-debug__panel">
      <div class="dbg-section">
        <div class="dbg-label">Lesson</div>
        <div class="lesson-chips">
          <v-chip
            v-for="lesson in ALL_LESSONS"
            :key="lesson.id"
            size="small"
            :color="selectedId === lesson.id ? 'primary' : undefined"
            :variant="selectedId === lesson.id ? 'elevated' : 'outlined'"
            class="lesson-chip"
            @click="selectLesson(lesson.id)"
          >
            <v-icon
              v-if="statusForLesson(lesson.id)"
              size="12"
              class="mr-1"
              :color="statusIconColor(statusForLesson(lesson.id)!)"
            >{{ statusIcon(statusForLesson(lesson.id)!) }}</v-icon>
            {{ lesson.id }}
            <!-- <v-chip
              v-if="hasCustomReporter(lesson.id)"
              size="x-small"
              variant="outlined"
              color="info"
              class="ml-1"
            >custom</v-chip> -->
          </v-chip>
        </div>
      </div>

      <!-- Reporter info -->
      <div v-if="selectedLesson" class="dbg-section">
        <div class="dbg-label">Reporter</div>
        <v-switch
          v-if="selectedLesson.id === 'sight-words'"
          v-model="sampleSightWords"
          label="Sample: every other tricky word in play"
          density="compact"
          hide-details
          color="primary"
        />
        <div class="dbg-meta">
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">type</span>
            <span class="dbg-meta-val">{{ hasCustomReporter(selectedLesson.id) ? 'custom' : 'generic' }}</span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">status</span>
            <span class="dbg-meta-val">
              <v-chip
                v-if="currentStatus"
                size="x-small"
                :color="statusIconColor(currentStatus)"
                variant="tonal"
              >{{ currentStatus }}</v-chip>
              <span v-else>—</span>
            </span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">label</span>
            <span class="dbg-meta-val">{{ currentMaturityLabel ?? '—' }}</span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">gates</span>
            <span class="dbg-meta-val">{{ selectedLesson.gatesConceptTags.join(', ') }}</span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">prereqs</span>
            <span class="dbg-meta-val">{{ (selectedLesson.prerequisites ?? []).join(', ') || '—' }}</span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">passed</span>
            <span class="dbg-meta-val">{{ currentContext?.passed ?? '—' }}</span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">prereqsMet</span>
            <span class="dbg-meta-val">{{ currentContext?.prereqsMet ?? '—' }}</span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">availMet</span>
            <span class="dbg-meta-val">{{ currentContext?.availabilityMet ?? '—' }}</span>
          </div>
          <div class="dbg-meta-row">
            <span class="dbg-meta-key">spacingMet</span>
            <span class="dbg-meta-val">{{ currentContext?.spacingMet ?? '—' }}</span>
          </div>
        </div>
      </div>

      <!-- Mastery evaluation detail -->
      <div v-if="currentEvaluation" class="dbg-section dbg-section--scroll">
        <div class="dbg-label">Mastery ({{ currentEvaluation.allMet ? '✓ ALL MET' : `${metCount}/${totalCount}` }})</div>
        <div class="mastery-list">
          <div
            v-for="item in currentEvaluation.perTag"
            :key="item.tag"
            class="mastery-item"
            :class="{ 'mastery-item--met': item.met }"
          >
            <div class="mastery-item__tag">
              <span class="mastery-item__indicator">{{ item.met ? '✓' : '✗' }}</span>
              <code>{{ formatTag(item.tag) }}</code>
            </div>
            <div class="mastery-item__detail">
              <span>
                evidence: {{ item.evidence.state.kind }}
                <span class="mastery-item__pct">
                  ({{ item.evidence.strip.filter((t) => t.ok).length }}/{{ item.evidence.strip.length }} ok,
                  {{ item.evidence.distinctCards }} cards,
                  wAcc {{ Math.round(item.evidence.weightedAccuracy * 100) }}%)
                </span>
              </span>
              <span class="mastery-item__pct">
                elo {{ item.currentElo }} · n {{ item.currentCount }} (not used)
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading / error -->
      <div v-if="loading" class="dbg-section">
        <v-progress-circular indeterminate size="20" width="2" />
        <span class="ml-2 text-caption">Loading progress data...</span>
      </div>
      <div v-if="error" class="dbg-section">
        <v-alert type="error" density="compact" variant="tonal">{{ error }}</v-alert>
      </div>
    </div>

    <!-- Right area: rendered inline report component -->
    <div class="report-debug__main">
      <div v-if="selectedLesson && currentContext && currentReporter" class="report-debug__content">
        <div class="report-debug__preview-header">
          <h3 class="text-subtitle-1">Inline Report Preview</h3>
          <v-chip size="small" variant="tonal" :color="statusIconColor(currentStatus!)">
            {{ currentStatus }}
          </v-chip>
        </div>

        <!-- Full CurriculumEntry preview -->
        <div class="report-debug__entry-preview">
          <h4 class="text-caption text-medium-emphasis mb-2">CurriculumEntry (as in ProgressView)</h4>
          <div class="report-debug__entry-card">
            <CurriculumEntry
              :index="0"
              :lesson="selectedLesson"
              :status="currentStatus!"
              :context="currentContext"
              @navigate="() => {}"
            />
          </div>
        </div>

        <!-- Isolated inline component -->
        <div class="report-debug__isolated">
          <h4 class="text-caption text-medium-emphasis mb-2">Inline Component (isolated)</h4>
          <div class="report-debug__isolated-card">
            <component
              :is="currentReporter.inlineComponent"
              :context="currentContext"
            />
          </div>
        </div>

        <!-- Raw context JSON -->
        <div class="report-debug__raw">
          <h4 class="text-caption text-medium-emphasis mb-2">
            Raw Context
            <v-btn
              size="x-small"
              variant="text"
              @click="showRawContext = !showRawContext"
            >
              {{ showRawContext ? 'hide' : 'show' }}
            </v-btn>
          </h4>
          <pre v-if="showRawContext" class="report-debug__json">{{ contextJson }}</pre>
        </div>
      </div>

      <div v-else class="report-debug__placeholder">
        <v-icon size="48" color="default" style="opacity: 0.3">mdi-chart-box-outline</v-icon>
        <p class="text-body-2 text-medium-emphasis mt-2">Select a lesson to inspect its progress report</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  DEFERRED_LESSON_CATALOG,
  LESSON_CATALOG,
  getAnyLessonById,
  getPassedLessonIds,
} from '../services/lessons';
import type { TagScores } from '../services/lessons/progress/types';
import { teachableSightWords } from '../services/lessons/progress/sightWordsReporter';
import { sightWordGpcId } from '../services/tags/gpcCatalogue';
import { gpcIntroTag } from '../services/tags';
import type { LessonDefinition } from '../services/lessons.types';
import type {
  LessonDisplayStatus,
  LessonReportContext,
  LessonProgressReporter,
  MasteryEvaluation,
} from '../services/lessons/progress/types';
import { getReporter, hasCustomReporter } from '../services/lessons/progress/registry';
import { getProgressSummary, type ProgressSummary } from '../services/userDebugAPI';
import CurriculumEntry from '../components/progress/CurriculumEntry.vue';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const selectedId = ref<string | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const summary = ref<ProgressSummary | null>(null);
const showRawContext = ref(false);

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

onMounted(async () => {
  try {
    summary.value = await getProgressSummary();
  } catch (err) {
    console.error('[LessonReportDebug] Failed to load summary:', err);
    error.value = String(err);
  } finally {
    loading.value = false;
  }
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

const selectedLesson = computed<LessonDefinition | null>(() =>
  selectedId.value ? getAnyLessonById(selectedId.value) : null,
);

function selectLesson(id: string) {
  selectedId.value = id;
  showRawContext.value = false;
}

// ---------------------------------------------------------------------------
// Context building (mirrors ProgressView logic)
// ---------------------------------------------------------------------------

/** Active lessons, then deferred ones (their reports can be looked at before promotion). */
const ALL_LESSONS = [...LESSON_CATALOG, ...DEFERRED_LESSON_CATALOG];

/**
 * Sight words: pretend every other teachable word has had its intro. The
 * report has nothing to show before real intros (no intro cards deployed).
 */
const sampleSightWords = ref(false);
function withSample(tagScores: TagScores): TagScores {
  if (!sampleSightWords.value) return tagScores;
  const sample: TagScores = {};
  teachableSightWords().forEach((w, i) => {
    const gpcId = sightWordGpcId(w);
    if (gpcId && i % 2 === 0) sample[gpcIntroTag(gpcId)] = { score: 1000, count: 1 };
  });
  return { ...tagScores, ...sample };
}

function buildContext(lesson: LessonDefinition): LessonReportContext | null {
  if (!summary.value) return null;

  const lessonProg = summary.value.lessonProgress;
  const tagScores = withSample(summary.value.elo?.tagScores ?? {});

  const passed = getPassedLessonIds(
    lessonProg
      ? {
          completedLessons: lessonProg.completedLessons,
          dismissedLessons: lessonProg.dismissedLessons,
          currentLesson: lessonProg.currentLesson,
          skippedCount: lessonProg.skippedCount,
          lastSkippedAt: null,
          postLessonPracticeFlag: null,
          sessionsSinceLastLesson: lessonProg.sessionsSinceLastLesson,
          updatedAt: '',
        }
      : null,
    { includeBootstrap: false },
  );

  const isPassed = passed.has(lesson.id);
  const prereqLessonsMet = (lesson.prerequisites ?? []).every((p) => passed.has(p));

  let blockedByLesson: string | null = null;
  if (!prereqLessonsMet) {
    const firstMissing = (lesson.prerequisites ?? []).find((p) => !passed.has(p));
    const missingLesson = firstMissing ? getAnyLessonById(firstMissing) : null;
    blockedByLesson = missingLesson?.title ?? firstMissing ?? null;
  }

  const masteryPrereqs = lesson.availabilityConditions?.masteryPrereqs ?? [];
  let availabilityMet = true;
  for (const mp of masteryPrereqs) {
    const elo = tagScores[mp.tag];
    const currentCount = elo?.count ?? 0;
    const currentElo = elo?.score ?? 1000;
    if (mp.minCount !== undefined && currentCount < mp.minCount) availabilityMet = false;
    if (mp.minElo !== undefined && currentElo < mp.minElo) availabilityMet = false;
  }

  const spacing = lesson.availabilityConditions?.minSessionsSinceLastLesson ?? 0;
  const sessions = lessonProg?.sessionsSinceLastLesson ?? 0;
  const spacingMet = sessions >= spacing;

  if (!isPassed && prereqLessonsMet && availabilityMet && !spacingMet) {
    blockedByLesson = `${spacing - sessions} more session(s) needed`;
  }

  return {
    lesson,
    tagScores,
    passed: isPassed,
    prereqsMet: prereqLessonsMet,
    availabilityMet,
    spacingMet,
    blockedByLesson,
  };
}

// ---------------------------------------------------------------------------
// Computed reporter data
// ---------------------------------------------------------------------------

const currentContext = computed<LessonReportContext | null>(() => {
  if (!selectedLesson.value) return null;
  return buildContext(selectedLesson.value);
});

const currentReporter = computed<LessonProgressReporter | null>(() => {
  if (!selectedLesson.value) return null;
  return getReporter(selectedLesson.value.id);
});

const currentStatus = computed<LessonDisplayStatus | null>(() => {
  if (!currentContext.value || !currentReporter.value) return null;
  return currentReporter.value.getStatus(currentContext.value);
});

const currentEvaluation = computed<MasteryEvaluation | null>(() => {
  if (!selectedLesson.value || !currentReporter.value || !currentContext.value) return null;
  const thresholds = currentReporter.value.getMasteryThresholds(selectedLesson.value);
  return currentReporter.value.evaluateMastery(
    thresholds,
    currentContext.value.tagScores,
  );
});

const metCount = computed(() =>
  currentEvaluation.value?.perTag.filter((t) => t.met).length ?? 0,
);

const totalCount = computed(() =>
  currentEvaluation.value?.perTag.length ?? 0,
);

const currentMaturityLabel = computed<string | null>(() => {
  if (!currentContext.value || !currentReporter.value?.maturityLabel) return null;
  return currentReporter.value.maturityLabel(currentContext.value);
});

const contextJson = computed(() => {
  if (!currentContext.value) return '';
  // Slim down tagScores to only relevant tags for readability
  const ctx = currentContext.value;
  const relevantTags: Record<string, { score: number; count: number }> = {};
  if (currentEvaluation.value) {
    for (const item of currentEvaluation.value.perTag) {
      const elo = ctx.tagScores[item.tag];
      if (elo) relevantTags[item.tag] = elo;
    }
  }
  // Also include the lesson's gatesConceptTags
  for (const tag of ctx.lesson.gatesConceptTags) {
    const elo = ctx.tagScores[tag];
    if (elo) relevantTags[tag] = elo;
  }
  return JSON.stringify(
    {
      passed: ctx.passed,
      prereqsMet: ctx.prereqsMet,
      availabilityMet: ctx.availabilityMet,
      spacingMet: ctx.spacingMet,
      blockedByLesson: ctx.blockedByLesson,
      relevantTagScores: relevantTags,
    },
    null,
    2,
  );
});

// ---------------------------------------------------------------------------
// Status for all lessons (sidebar indicators)
// ---------------------------------------------------------------------------

function statusForLesson(lessonId: string): LessonDisplayStatus | null {
  const lesson = getAnyLessonById(lessonId);
  if (!lesson || !summary.value) return null;
  const ctx = buildContext(lesson);
  if (!ctx) return null;
  return getReporter(lessonId).getStatus(ctx);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTag(tag: string): string {
  const parts = tag.split(':');
  if (parts.length >= 3) {
    const namespace = parts[1];
    const rest = parts.slice(2).join(':');
    const [grapheme, ...phonemeParts] = rest.split('-');
    if (phonemeParts.length > 0) {
      return `${namespace}: ${grapheme} → ${phonemeParts.join('-')}`;
    }
    return `${namespace}:${rest}`;
  }
  return tag;
}

function statusIcon(status: LessonDisplayStatus): string {
  switch (status) {
    case 'mature': return 'mdi-check-circle';
    case 'ongoing': return 'mdi-chart-line-variant';
    case 'available': return 'mdi-circle-medium';
    case 'locked': return 'mdi-lock-outline';
  }
}

function statusIconColor(status: LessonDisplayStatus): string {
  switch (status) {
    case 'mature': return 'success';
    case 'ongoing': return 'info';
    case 'available': return 'warning';
    case 'locked': return 'grey';
  }
}
</script>

<style scoped>
.report-debug {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #f8f9fa;
}

/* Left panel */
.report-debug__panel {
  width: 300px;
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

.dbg-section--scroll {
  flex: 1;
  overflow-y: auto;
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
  min-width: 72px;
  font-weight: 600;
}

.dbg-meta-val {
  color: #333;
  word-break: break-all;
}

/* Mastery list */
.mastery-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mastery-item {
  font-size: 0.7rem;
  font-family: monospace;
  padding: 3px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.02);
}

.mastery-item--met {
  background: rgba(76, 175, 80, 0.08);
}

.mastery-item__tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mastery-item__indicator {
  font-weight: 700;
  width: 12px;
  text-align: center;
}

.mastery-item--met .mastery-item__indicator {
  color: #4caf50;
}

.mastery-item:not(.mastery-item--met) .mastery-item__indicator {
  color: #f44336;
}

.mastery-item__detail {
  margin-left: 16px;
  color: #666;
  display: flex;
  gap: 10px;
}

.mastery-item__pct {
  color: #999;
  font-size: 0.65rem;
}

/* Right: report preview */
.report-debug__main {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.report-debug__content {
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.report-debug__preview-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.report-debug__entry-preview,
.report-debug__isolated,
.report-debug__raw {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 16px;
}

.report-debug__entry-card {
  border: 1px dashed rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  padding: 8px;
}

.report-debug__isolated-card {
  border: 1px dashed rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  padding: 12px;
}

.report-debug__json {
  font-size: 0.72rem;
  font-family: monospace;
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre;
  line-height: 1.4;
}

.report-debug__placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40px;
  min-height: 300px;
}
</style>
