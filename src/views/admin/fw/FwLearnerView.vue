<template>
  <v-container fluid style="max-width: 1400px">
    <div class="d-flex align-center flex-wrap mb-4" style="gap: 8px">
      <h1 class="text-h5">{{ title }}</h1>
      <v-chip color="primary" variant="tonal" size="small">
        <v-icon start size="small">mdi-account</v-icon>
        <code>{{ username }}</code>
      </v-chip>
      <v-spacer />
      <v-btn
        v-if="mode !== 'sessions'"
        variant="text"
        size="small"
        prepend-icon="mdi-format-list-bulleted"
        :to="{ name: 'AdminUserSessions', params: { username } }"
      >
        Sessions
      </v-btn>
      <v-btn
        v-if="mode !== 'cards'"
        variant="text"
        size="small"
        prepend-icon="mdi-history"
        :to="{ name: 'AdminUserCards', params: { username } }"
      >
        Card history
      </v-btn>
      <v-btn
        v-if="mode !== 'pipeline'"
        variant="text"
        size="small"
        prepend-icon="mdi-pipe"
        :to="{ name: 'AdminUserPipeline', params: { username } }"
      >
        Pipeline
      </v-btn>
      <v-btn
        v-if="mode !== 'elo'"
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
      <v-btn variant="text" size="small" prepend-icon="mdi-download" :disabled="!dump" @click="save">
        Save dump
      </v-btn>
      <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="loading" @click="reload">
        Refresh
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

    <div v-if="loading && !dataset" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="dataset">
      <learner-session-list
        v-if="mode === 'sessions'"
        :dataset="dataset"
        :interpreters="lpDiagnosticsInterpreters"
        @open="openSession"
      />
      <learner-session-detail
        v-else-if="mode === 'session'"
        :dataset="dataset"
        :session-id="sessionId"
        :interpreters="lpDiagnosticsInterpreters"
        @open-card="openCard"
      />
      <learner-card-history
        v-else-if="mode === 'cards'"
        :dataset="dataset"
        :interpreters="lpDiagnosticsInterpreters"
        :focus="focus"
      />
      <learner-tag-elo v-else-if="mode === 'elo'" :dataset="dataset" :interpreters="lpDiagnosticsInterpreters" />
      <template v-else>
        <pipeline-overview
          v-if="dataset.strategies"
          :strategies="dataset.strategies"
          :course-id="dataset.courseId"
          :stats="pipelineStats"
          :stats-label="username"
        />
        <v-alert v-else type="info" variant="tonal">This dataset carries no strategy docs.</v-alert>
      </template>
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  downloadLearnerDump,
  LearnerCardHistory,
  LearnerSessionDetail,
  LearnerSessionList,
  LearnerTagElo,
  PipelineOverview,
} from '@vue-skuilder/common-ui/admin';
import { pipelineRunStats } from '@vue-skuilder/db/diagnostics';
import '@vue-skuilder/common-ui/admin/style';
import { lpDiagnosticsInterpreters } from '@/services/diagnosticsInterpreters';
import { useAdminLearnerDataset } from './useAdminLearnerDataset';

/**
 * The framework's learner views on LP's admin routes, for side-by-side
 * comparison with LP's own (see AdminViewSwitch). Same routes, same links.
 * `pipeline` and `elo` have no LP counterpart, so their routes mount this view directly.
 */
const props = defineProps<{ mode: 'sessions' | 'session' | 'cards' | 'pipeline' | 'elo' }>();

const route = useRoute();
const router = useRouter();
const username = computed(() => String(route.params.username ?? ''));
const sessionId = computed(() => String(route.params.sessionId ?? ''));
const focus = computed(() => (typeof route.query.focus === 'string' ? route.query.focus : undefined));

const { dump, dataset, loading, error, reload } = useAdminLearnerDataset(username);

const title = computed(
  () =>
    ({ sessions: 'Sessions', session: 'Session', cards: 'Card history', pipeline: 'Pipeline', elo: 'ELO' })[props.mode]
);
const pipelineStats = computed(() => (dataset.value ? pipelineRunStats(dataset.value) : undefined));

function openSession(id: string): void {
  void router.push({ name: 'AdminUserSessionDetail', params: { username: username.value, sessionId: id } });
}

function openCard(cardId: string): void {
  void router.push({ name: 'AdminUserCards', params: { username: username.value }, query: { focus: cardId } });
}

function save(): void {
  if (dump.value) downloadLearnerDump(dump.value);
}
</script>
