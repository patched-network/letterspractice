<template>
  <v-card class="pa-4 mb-4">
    <v-card-title class="d-flex align-center">
      The Pieces
      <v-chip
        v-if="stats"
        size="small"
        variant="tonal"
        color="primary"
        class="ml-2"
      >
        {{ stats.mature }}/{{ stats.total }} mastered
      </v-chip>
      <v-chip
        v-if="stats && stats.ongoing > 0"
        size="small"
        variant="tonal"
        color="info"
        class="ml-1"
      >
        {{ stats.ongoing }} learning
      </v-chip>
    </v-card-title>
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-3">
        Tracking the atomic skills and facts that make a reader.
      </p>
      <div class="curriculum-list">
        <CurriculumEntry
          v-for="(entry, i) in entries"
          :key="entry.lesson.id"
          :index="i"
          :accent="palette[i]"
          :lesson="entry.lesson"
          :status="entry.status"
          :context="entry.context"
          :navigable="navigable"
          @navigate="handleLessonClick"
        />
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { ProgressSummary } from '@/services/userDebugAPI';
import {
  LESSON_CATALOG,
  getPassedLessonIds,
  getLessonById,
  lessonMasteryConditionsMet,
  countUnlockedFromLesson,
} from '@/services/lessons';
import type { LessonDefinition } from '@/services/lessons.types';
import type { LessonDisplayStatus, LessonReportContext } from '@/services/lessons/progress/types';
import { getReporter } from '@/services/lessons/progress/registry';
import CurriculumEntry from '@/components/progress/CurriculumEntry.vue';
import { oklchToRgb } from '@/letterpeople/util/color';

interface CurriculumEntryData {
  lesson: LessonDefinition;
  status: LessonDisplayStatus;
  context: LessonReportContext;
}

const props = defineProps<{
  summary: ProgressSummary | null;
  /**
   * If false, suppresses router navigation when a lesson is clicked.
   * Defaults to true. Set false in admin / read-only contexts where the
   * viewer should not jump into another user's study session.
   */
  navigable?: boolean;
}>();

const router = useRouter();

const entries = computed<CurriculumEntryData[]>(() => {
  if (!props.summary) return [];

  const lessonProg = props.summary.lessonProgress;
  const letterProg = props.summary.letterProgression;
  const tagScores = props.summary.elo?.tagScores ?? {};

  // includeBootstrap: false — show actual user state, not gating shortcuts
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

  return LESSON_CATALOG.map((lesson): CurriculumEntryData => {
    const isPassed = passed.has(lesson.id);

    // Prereq lessons
    const prereqLessonsMet = (lesson.prerequisites ?? []).every((p) => passed.has(p));

    let blockedByLesson: string | null = null;
    if (!prereqLessonsMet) {
      const firstMissing = (lesson.prerequisites ?? []).find((p) => !passed.has(p));
      const missingLesson = firstMissing ? getLessonById(firstMissing) : null;
      blockedByLesson = missingLesson?.title ?? firstMissing ?? null;
    }

    // Mastery + breadth/in-rotation prereqs — delegated to the shared
    // evaluator so this display path can't drift from the /study offering
    // path (getNextLesson). Covers masteryPrereqs, minUnlockedLetters, and
    // minUnlockedFromLesson (the in-rotation digraph gate); spacing is handled
    // separately below (the helper intentionally excludes it — see lessons.ts).
    // Skip-if-absent semantics: an empty tagScores / null letterProgression
    // treats the corresponding gate as satisfied rather than a false negative
    // during a load race.
    const availabilityMet = lessonMasteryConditionsMet(lesson.availabilityConditions, {
      tagElo: tagScores,
      unlockedLetterCount: letterProg?.unlockedCount,
      unlockedGraphemes: letterProg?.unlockedLetters,
    });

    // In-rotation gate messaging — when the prerequisite lesson is passed but
    // not enough of its member GPCs are in rotation yet, name *that* as the
    // blocker (e.g. "At least 3 Letter Teammates") rather than falling through
    // to a bare inline report. Count + lesson label both come from the shared
    // SoT (availabilityConditions.minUnlockedFromLesson + the referenced
    // lesson's title), so this string can't drift from the gate it explains.
    if (!isPassed && prereqLessonsMet && !availabilityMet) {
      const gate = lesson.availabilityConditions?.minUnlockedFromLesson;
      if (gate && countUnlockedFromLesson(gate.lesson, letterProg?.unlockedLetters) < gate.count) {
        const gateTitle = getLessonById(gate.lesson)?.title ?? gate.lesson;
        blockedByLesson = `At least ${gate.count} ${gateTitle}`;
      }
    }

    // Spacing
    const spacing = lesson.availabilityConditions?.minSessionsSinceLastLesson ?? 0;
    const sessions = lessonProg?.sessionsSinceLastLesson ?? 0;
    const spacingMet = sessions >= spacing;

    if (!isPassed && prereqLessonsMet && availabilityMet && !spacingMet) {
      blockedByLesson = `${spacing - sessions} more session(s) needed`;
    }

    const context: LessonReportContext = {
      lesson,
      tagScores,
      passed: isPassed,
      prereqsMet: prereqLessonsMet,
      availabilityMet,
      spacingMet,
      blockedByLesson,
    };

    const reporter = getReporter(lesson.id);
    const status = reporter.getStatus(context);

    return { lesson, status, context };
  });
});

// Decorative accent per lesson bullet — a *confined* cool arc (indigo → violet
// → magenta → pink) rather than a full rainbow, so the numerals stay purely
// positional and never accidentally echo the status palette (green=mastered,
// amber=ready, blue=learning, red=error). Pastel Tier-2 — see DESIGN_SYSTEM.md.
const BULLET_HUE_START = 285; // indigo-violet
const BULLET_HUE_END = 350; //   pink (stops short of error-red ~29°)
const BULLET_LIGHTNESS = 0.7;
const BULLET_CHROMA = 0.15;

const palette = computed(() => {
  const n = entries.value.length;
  return Array.from({ length: n }, (_, i) => {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const hue = BULLET_HUE_START + (BULLET_HUE_END - BULLET_HUE_START) * t;
    return oklchToRgb(BULLET_LIGHTNESS, BULLET_CHROMA, hue);
  });
});

const stats = computed(() => {
  const list = entries.value;
  if (list.length === 0) return null;
  const mature = list.filter((e) => e.status === 'mature').length;
  const ongoing = list.filter((e) => e.status === 'ongoing').length;
  return { mature, ongoing, total: list.length };
});

function handleLessonClick(lessonId: string) {
  if (props.navigable === false) return;
  router.push(`/study/lesson/${lessonId}`);
}
</script>

<style scoped>
.curriculum-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
