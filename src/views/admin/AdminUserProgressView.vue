<template>
  <v-container fluid style="max-width: 1400px;">
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex align-center mb-4">
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-arrow-left"
            :to="back.to"
          >
            {{ back.label }}
          </v-btn>
          <v-spacer />
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-timeline-clock-outline"
            :to="{ name: 'AdminUserSessions', params: { username } }"
          >
            Sessions
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-history"
            :to="{ name: 'AdminUserCards', params: { username } }"
          >
            Card history
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-spellcheck"
            :to="{ name: 'AdminUserSpelling', params: { username } }"
          >
            Spelling misses
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-chart-scatter-plot"
            :to="{ name: 'AdminUserElo', params: { username } }"
          >
            ELO
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-play-box-outline"
            :to="{ name: 'AdminUserPipelineRun', params: { username } }"
          >
            Pipeline run
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-refresh"
            :loading="loading"
            @click="reload"
          >
            Refresh
          </v-btn>
        </div>

        <div class="d-flex align-baseline mb-4 flex-wrap" style="gap: 8px">
          <h1 class="text-h4">Progress</h1>
          <v-chip color="primary" variant="tonal" size="small">
            <v-icon start size="small">mdi-account</v-icon>
            <code>{{ username }}</code>
          </v-chip>
          <v-chip size="x-small" variant="tonal" color="grey">
            admin view
          </v-chip>
        </div>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable>
          {{ error }}
        </v-alert>

        <LearnerDbPanel :username="username" />

        <div v-if="loading" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <template v-else-if="summary">
          <v-card class="pa-4 mb-4">
            <v-card-title class="d-flex align-center flex-wrap" style="gap: 6px">
              Lessons
              <v-chip size="small" variant="tonal" color="primary">
                {{ passedCount }}/{{ LESSON_CATALOG.length }} passed
              </v-chip>
            </v-card-title>
            <v-card-text>
              <div v-if="!summary.lessonProgress" class="text-medium-emphasis">
                No lesson progress doc for this user.
              </div>
              <template v-else>
                <div class="text-body-2 text-medium-emphasis mb-3">
                  Current: <code>{{ summary.lessonProgress.currentLesson ?? '—' }}</code>
                  · skipped {{ summary.lessonProgress.skippedCount }}×
                  · {{ summary.lessonProgress.sessionsSinceLastLesson }} sessions since last pass
                </div>
                <v-table density="compact">
                  <tbody>
                    <tr v-for="row in lessonRows" :key="row.id">
                      <td style="width: 32px">
                        <v-icon v-if="row.how === 'completed'" color="success" size="18">mdi-check-circle</v-icon>
                        <v-icon v-else-if="row.how === 'dismissed'" color="success" size="18">mdi-check-circle-outline</v-icon>
                        <v-icon v-else size="18" style="opacity: 0.3">mdi-circle-outline</v-icon>
                      </td>
                      <td>
                        {{ row.title }}
                        <code class="text-caption text-medium-emphasis ml-1">{{ row.id }}</code>
                      </td>
                      <td class="text-caption">
                        <span v-if="row.how === 'dismissed'">parent-taught</span>
                        <span v-else-if="row.how === 'completed'">watched</span>
                      </td>
                      <td class="text-caption text-right">
                        <template v-if="row.how">
                          {{ row.passedAt ? formatDate(row.passedAt) : 'date not recorded' }}
                        </template>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </template>
            </v-card-text>
          </v-card>

          <v-card class="pa-4 mb-4">
            <v-card-title class="d-flex align-center flex-wrap" style="gap: 6px">
              Juggling vignette
              <v-chip size="small" variant="tonal" color="primary">
                stage {{ vignetteRows.length }}/{{ STAGE_COUNT }}
              </v-chip>
            </v-card-title>
            <v-card-text>
              <div v-if="!vignette" class="text-medium-emphasis">
                No vignette progress doc for this user (no finished sessions).
              </div>
              <template v-else>
                <div class="text-body-2 text-medium-emphasis mb-3">
                  Shown {{ vignette.vignettesShown }}×
                  · last {{ formatDate(vignette.updatedAt) }}
                </div>
                <v-table density="compact">
                  <tbody>
                    <tr v-for="row in vignetteRows" :key="row.id">
                      <td style="width: 48px" class="text-caption text-medium-emphasis">{{ row.id }}</td>
                      <td>{{ row.title }}</td>
                      <td class="text-caption text-right">
                        {{ row.firstShownAt ? formatDate(row.firstShownAt) : 'date not recorded' }}
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </template>
            </v-card-text>
          </v-card>

          <v-row>
            <v-col cols="12" md="6">
              <CurriculumCard :summary="summary" :navigable="false" />
            </v-col>
            <v-col cols="12" md="6">
              <ReachableWordsCard :summary="summary" />
            </v-col>
          </v-row>
        </template>

        <v-alert v-else type="warning" class="mt-4">
          Unable to load progress data for this user.
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LearnerDbPanel from '@/components/admin/LearnerDbPanel.vue';
import { fetchProgressSummaryForUser, fetchVignetteProgressForUser } from '@/services/adminUsersService';
import type { ProgressSummary } from '@/services/userDebugAPI';
import type { VignetteProgressState } from '@/services/userState.types';
import { STAGE_METAS, STAGE_COUNT } from '@/practicing/juggling-sessions/stages/skill-timeline';
import CurriculumCard from '@/components/progress/CurriculumCard.vue';
import ReachableWordsCard from '@/components/progress/ReachableWordsCard.vue';
import { LESSON_CATALOG, getAnyLessonById } from '@/services/lessons';

const route = useRoute();
const username = ref<string>(String(route.params.username ?? ''));

// Back to the deployment's account list if it has one (src/deployment/), else the admin index.
const router = useRouter();
const back = router.hasRoute('AdminUsers')
  ? { to: { name: 'AdminUsers' }, label: 'Back to users' }
  : { to: { name: 'AdminIndex' }, label: 'Back to admin' };

const loading = ref(true);
const summary = ref<ProgressSummary | null>(null);
const error = ref<string | null>(null);
const vignette = ref<VignetteProgressState | null>(null);

interface LessonRow {
  id: string;
  title: string;
  how: 'completed' | 'dismissed' | null;
  passedAt: string | null;
}

// Raw passed-state, straight off the LessonProgress doc. Catalog lessons in
// order, then any passed ID the live catalog doesn't know (deferred/retired)
// so nothing on the doc is hidden.
const lessonRows = computed<LessonRow[]>(() => {
  const lp = summary.value?.lessonProgress;
  if (!lp) return [];
  const howOf = (id: string): LessonRow['how'] =>
    lp.completedLessons.includes(id) ? 'completed'
      : lp.dismissedLessons.includes(id) ? 'dismissed'
      : null;
  const row = (id: string): LessonRow => ({
    id,
    title: getAnyLessonById(id)?.title ?? id,
    how: howOf(id),
    passedAt: lp.passedAt[id] ?? null,
  });
  const catalogIds = new Set(LESSON_CATALOG.map((l) => l.id));
  const extras = [...new Set([...lp.completedLessons, ...lp.dismissedLessons])]
    .filter((id) => !catalogIds.has(id));
  return [...LESSON_CATALOG.map((l) => row(l.id)), ...extras.map(row)];
});

const passedCount = computed(
  () => lessonRows.value.filter((r) => r.how && LESSON_CATALOG.some((l) => l.id === r.id)).length,
);

// Stages reached so far, in order; the last row is the stage shown most
// recently (or the terminal stage, which repeats).
const vignetteRows = computed(() => {
  const v = vignette.value;
  if (!v) return [];
  const reached = Math.min(v.vignettesShown, STAGE_COUNT);
  return STAGE_METAS.slice(0, reached).map((meta, i) => ({
    id: meta.id,
    title: meta.title,
    firstShownAt: v.stageFirstShownAt?.[String(i)] ?? null,
  }));
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.valueOf())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function load(): Promise<void> {
  if (!username.value) {
    error.value = 'No username in route.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    [summary.value, vignette.value] = await Promise.all([
      fetchProgressSummaryForUser(username.value),
      fetchVignetteProgressForUser(username.value),
    ]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    summary.value = null;
    vignette.value = null;
  } finally {
    loading.value = false;
  }
}

function reload(): void {
  void load();
}

// Re-fetch if route param changes (admin clicks back-then-forward into a
// different user without unmount).
watch(
  () => route.params.username,
  (next) => {
    username.value = String(next ?? '');
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>
