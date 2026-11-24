<template>
  <div class="lessons-view">
    <div class="lessons-header">
      <h2 class="text-h6 font-weight-bold mb-1">Lessons</h2>
      <p class="text-body-2 text-medium-emphasis mb-4">
        Concept introductions for your learning journey.
      </p>
    </div>

    <div v-if="loading" class="lessons-loading">
      <v-progress-circular indeterminate color="primary" size="32" />
    </div>

    <div v-else class="lessons-list">
      <div
        v-for="entry in lessonEntries"
        :key="entry.id"
        class="lesson-item"
        :class="`lesson-item--${entry.status}`"
      >
        <!-- Status icon -->
        <div class="lesson-item__icon">
          <v-icon v-if="entry.status === 'completed'" color="success" size="22">mdi-check-circle</v-icon>
          <v-icon v-else-if="entry.status === 'dismissed'" color="success" size="22">mdi-check-circle-outline</v-icon>
          <v-icon v-else-if="entry.status === 'available'" color="warning" size="22">mdi-circle-medium</v-icon>
          <v-icon v-else color="default" size="22" style="opacity: 0.35">mdi-lock-outline</v-icon>
        </div>

        <!-- Content -->
        <div class="lesson-item__content">
          <div class="lesson-item__title">{{ entry.title }}</div>
          <div class="lesson-item__description" v-html="renderInline(entry.description)"></div>
          <v-chip
            v-if="entry.status === 'dismissed'"
            size="x-small"
            color="default"
            variant="outlined"
            class="mt-1"
          >
            Parent-taught
          </v-chip>
          <v-chip
            v-if="entry.status === 'available'"
            size="x-small"
            color="warning"
            variant="tonal"
            class="mt-1"
          >
            Ready
          </v-chip>
        </div>

        <!-- Action -->
        <div class="lesson-item__action">
          <v-btn
            v-if="entry.status === 'available'"
            size="small"
            color="primary"
            variant="elevated"
            rounded
            @click="viewLesson(entry.id)"
          >
            Start
          </v-btn>
          <v-btn
            v-else-if="entry.status === 'completed' || entry.status === 'dismissed'"
            size="small"
            variant="text"
            color="default"
            @click="viewLesson(entry.id)"
          >
            Review
          </v-btn>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getDataLayer } from '@vue-skuilder/db';
import { toCourseElo } from '@vue-skuilder/common';
import { getLessonProgress, getLetterProgression } from '../services/userState';
import {
  LESSON_CATALOG,
  getPassedLessonIds,
  lessonMasteryConditionsMet,
  type LessonTagElo,
} from '../services/lessons';
import type { LessonProgressState } from '../services/lessons.types';
import { renderInline } from '../components/landing/inlineMarkup';
import config from '../../skuilder.config.json';

const router = useRouter();
const user = getDataLayer().getUserDB();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const loading = ref(true);
const lessonProgress = ref<LessonProgressState | null>(null);
const tagElo = ref<LessonTagElo>({});
const unlockedLetterCount = ref<number | undefined>(undefined);
const unlockedGraphemes = ref<string[] | undefined>(undefined);

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

type LessonStatus = 'completed' | 'dismissed' | 'available' | 'locked';

interface LessonEntry {
  id: string;
  title: string;
  description: string;
  status: LessonStatus;
}

const lessonEntries = computed<LessonEntry[]>(() => {
  const prog = lessonProgress.value;
  // Use includeBootstrap: false so hello-world shows real state
  const passed = getPassedLessonIds(prog, { includeBootstrap: false });

  return LESSON_CATALOG.map((lesson): LessonEntry => {
    // Completed
    if (prog?.completedLessons.includes(lesson.id)) {
      return { id: lesson.id, title: lesson.title, description: lesson.description, status: 'completed' };
    }
    // Dismissed (parent-taught)
    if (prog?.dismissedLessons.includes(lesson.id)) {
      return { id: lesson.id, title: lesson.title, description: lesson.description, status: 'dismissed' };
    }
    // Locked by prerequisite lesson
    const prereqsMet = (lesson.prerequisites ?? []).every((p) => passed.has(p));
    if (!prereqsMet) {
      return { id: lesson.id, title: lesson.title, description: lesson.description, status: 'locked' };
    }
    // Check mastery + breadth prereqs (skip-if-absent: see lessonMasteryConditionsMet)
    const masteryMet = lessonMasteryConditionsMet(lesson.availabilityConditions, {
      tagElo: tagElo.value,
      unlockedLetterCount: unlockedLetterCount.value,
      unlockedGraphemes: unlockedGraphemes.value,
    });
    if (!masteryMet) {
      return { id: lesson.id, title: lesson.title, description: lesson.description, status: 'locked' };
    }
    // Available (prereqs met, not yet passed)
    return { id: lesson.id, title: lesson.title, description: lesson.description, status: 'available' };
  });
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function viewLesson(id: string) {
  router.push(`/study/lesson/${id}`);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  try {
    lessonProgress.value = await getLessonProgress();
  } catch {
    // no progress yet
  }
  try {
    const courseReg = await user.getCourseRegDoc(config.course);
    const courseElo = toCourseElo(courseReg.elo);
    for (const [tag, data] of Object.entries(courseElo.tags)) {
      tagElo.value[tag] = { score: data.score, count: data.count, recent: data.recent };
    }
  } catch {
    // no ELO yet — mastery conditions won't filter
  }
  try {
    const letterProgression = await getLetterProgression();
    unlockedLetterCount.value = letterProgression?.unlockedLetters.length ?? 0;
    unlockedGraphemes.value = letterProgression?.unlockedLetters ?? [];
  } catch {
    // no progression yet — breadth conditions won't filter
  }
  loading.value = false;
});
</script>

<style scoped>
.lessons-view {
  padding: 24px 16px;
  max-width: 520px;
  margin: 0 auto;
}

.lessons-header {
  margin-bottom: 8px;
}

.lessons-loading {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.lessons-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lesson-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 10px;
  border-radius: 10px;
  transition: background 0.15s ease;
}

.lesson-item--completed,
.lesson-item--dismissed {
  background: rgba(76, 175, 80, 0.04);
}

.lesson-item--available {
  background: rgba(255, 152, 0, 0.06);
  border: 1px solid rgba(255, 152, 0, 0.2);
}

.lesson-item--locked {
  opacity: 0.45;
}

.lesson-item__icon {
  flex-shrink: 0;
  padding-top: 1px;
}

.lesson-item__content {
  flex: 1;
  min-width: 0;
}

.lesson-item__title {
  font-weight: 600;
  font-size: 0.9rem;
  color: rgba(0, 0, 0, 0.85);
  line-height: 1.3;
}

.lesson-item__description {
  font-size: 0.78rem;
  color: rgba(0, 0, 0, 0.55);
  margin-top: 2px;
  line-height: 1.4;
}

.lesson-item__action {
  flex-shrink: 0;
  padding-top: 2px;
}
</style>
