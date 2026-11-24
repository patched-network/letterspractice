<template>
  <v-card variant="outlined" class="mb-4">
    <v-card-title class="d-flex align-center text-subtitle-1">
      <v-icon start size="small">mdi-database-check-outline</v-icon>
      Account database
      <code class="ml-2 text-caption">{{ dbName }}</code>
      <v-spacer />
      <v-btn
        v-if="health || activity"
        variant="text"
        size="x-small"
        :icon="copiedKey === 'db' ? 'mdi-check' : 'mdi-content-copy'"
        title="Copy"
        @click="copyText(asText(), 'db')"
      />
      <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="loading" @click="load">
        Check
      </v-btn>
    </v-card-title>
    <v-card-text>
      <div v-if="health" class="d-flex flex-wrap align-center mb-2" style="gap: 6px">
        <v-chip
          v-for="c in checks"
          :key="c.label"
          size="small"
          variant="tonal"
          :color="c.ok ? 'success' : 'error'"
        >
          <v-icon start size="small">{{ c.ok ? 'mdi-check' : 'mdi-close' }}</v-icon>
          {{ c.label }}
        </v-chip>
        <v-btn
          v-if="!health.healthy"
          size="small"
          color="warning"
          variant="tonal"
          prepend-icon="mdi-wrench"
          :loading="repairing"
          @click="repair"
        >
          Repair _design/reviewCards
        </v-btn>
      </div>
      <div v-if="health?.error" class="text-caption text-error mb-2">{{ health.error }}</div>
      <div v-if="repairResult" class="text-caption mb-2">
        Repair: {{ repairResult.ok ? (repairResult.changed ? 'installed' : 'already correct') : `failed: ${repairResult.error}` }}
      </div>
      <div v-if="activity && !activity.error" class="text-body-2">
        {{ activity.cardsSeen }} cards seen · {{ activity.totalReviews }} reviews ·
        last active {{ activity.lastActive ? formatDate(activity.lastActive) : 'never' }}
        <span v-if="activity.daysSinceActive !== null">({{ activity.daysSinceActive }}d ago)</span>
      </div>
      <div v-else-if="activity?.error" class="text-caption text-error">Activity: {{ activity.error }}</div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
/**
 * One learner's CouchDB database: the health probe (exists, security,
 * `_design/reviewCards` present and queryable), the repair for a missing or
 * stale reviewCards design doc, and activity totals. Operator tooling for
 * any deployment; a deployment's account list may run the same probes in
 * bulk.
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  fetchUserActivityOne,
  fetchUserDbHealthOne,
  repairReviewCards,
  usernameToDbName,
  type RepairResult,
  type UserActivity,
  type UserDbHealth,
} from '@/services/adminUsersService';
import { useClickToCopy } from '@/views/admin/useClickToCopy';

const props = defineProps<{ username: string }>();

const { copiedKey, copyText } = useClickToCopy('learner-db');
const health = ref<UserDbHealth | null>(null);
const activity = ref<UserActivity | null>(null);
const repairResult = ref<RepairResult | null>(null);
const loading = ref(false);
const repairing = ref(false);

const dbName = computed(() => usernameToDbName(props.username));
const checks = computed(() =>
  health.value
    ? [
        { label: 'DB exists', ok: health.value.dbExists },
        { label: 'security', ok: health.value.securityOk },
        { label: 'reviewCards doc', ok: health.value.hasReviewCards },
        { label: 'reviewCards query', ok: health.value.reviewCardsQueryOk },
      ]
    : [],
);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function asText(): string {
  const lines = [`Account database for ${props.username} (${dbName.value})`];
  if (health.value) {
    lines.push(`Health: ${checks.value.map((c) => `${c.label} ${c.ok ? 'ok' : 'FAIL'}`).join(', ')}`);
    if (health.value.error) lines.push(`Error: ${health.value.error}`);
  }
  if (activity.value && !activity.value.error) {
    const a = activity.value;
    lines.push(`Activity: ${a.cardsSeen} cards seen, ${a.totalReviews} reviews, last active ${a.lastActive ?? 'never'}`);
  }
  return lines.join('\n');
}

async function load(): Promise<void> {
  if (!props.username) return;
  loading.value = true;
  try {
    [health.value, activity.value] = await Promise.all([
      fetchUserDbHealthOne(props.username),
      fetchUserActivityOne(props.username),
    ]);
  } finally {
    loading.value = false;
  }
}

async function repair(): Promise<void> {
  repairing.value = true;
  try {
    repairResult.value = await repairReviewCards(props.username);
    health.value = await fetchUserDbHealthOne(props.username);
  } finally {
    repairing.value = false;
  }
}

onMounted(load);
watch(() => props.username, () => {
  repairResult.value = null;
  void load();
});
</script>
