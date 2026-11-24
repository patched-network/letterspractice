<template>
  <v-container fluid style="max-width: 1500px">
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex align-center mb-4">
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-arrow-left"
            :to="{ name: 'AdminUserProgress', params: { username } }"
          >
            Back to progress
          </v-btn>
          <v-spacer />
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
            prepend-icon="mdi-refresh"
            :loading="loading"
            @click="reload"
          >
            Refresh
          </v-btn>
        </div>

        <div class="d-flex align-baseline mb-2 flex-wrap" style="gap: 8px">
          <h1 class="text-h4">Sessions</h1>
          <v-chip color="primary" variant="tonal" size="small">
            <v-icon start size="small">mdi-account</v-icon>
            <code>{{ username }}</code>
          </v-chip>
          <v-chip size="x-small" variant="tonal" color="grey">admin view</v-chip>
        </div>
        <p class="text-caption text-medium-emphasis mb-4">
          One row per sitting. This is triage — flags name a specific way the
          session failed to do its job; open one to read its interleaved
          timeline of responses and pipeline runs.
          <strong>Δ</strong> is state movement across the session (letters
          unlocked · reachable words · ELO).
        </p>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable>
          {{ error }}
        </v-alert>

        <div v-if="loading" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <template v-else>
          <!-- Summary tiles -->
          <v-row dense class="mb-2">
            <v-col v-for="tile in tiles" :key="tile.label" cols="6" sm="4" md="2">
              <v-card variant="tonal" :color="tile.color" class="pa-2 text-center">
                <div class="text-h6">{{ tile.value }}</div>
                <div class="text-caption">{{ tile.label }}</div>
              </v-card>
            </v-col>
          </v-row>

          <div class="d-flex align-center flex-wrap mb-3" style="gap: 12px">
            <v-btn-toggle
              v-model="filter"
              density="compact"
              color="primary"
              variant="outlined"
            >
              <v-btn value="all" size="small">All ({{ sessions.length }})</v-btn>
              <v-btn
                v-for="f in activeFlagFilters"
                :key="f.flag"
                :value="f.flag"
                size="small"
                :title="SESSION_FLAG_META[f.flag].help"
              >
                <v-icon
                  start
                  size="small"
                  :color="SESSION_FLAG_META[f.flag].color"
                >
                  {{ SESSION_FLAG_META[f.flag].icon }}
                </v-icon>
                {{ SESSION_FLAG_META[f.flag].label }} ({{ f.count }})
              </v-btn>
            </v-btn-toggle>
          </div>

          <v-alert v-if="sessions.length === 0" type="info" variant="tonal">
            No study sessions recorded for this user.
            <div class="text-caption mt-1">
              Session records begin at the commit that introduced them — there is
              no backfill, so accounts that last played before then show nothing
              here even if they have card history.
            </div>
          </v-alert>

          <v-table v-else density="compact" class="session-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th class="text-right">Cards</th>
                <th class="text-right">Acc.</th>
                <th class="text-right">Runs</th>
                <th>Clock</th>
                <th class="text-right" title="cards per minute: cards presented ÷ minutes in the session">cpm</th>
                <th>Δ</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in visibleSessions"
                :key="s.doc.sessionId"
                class="session-row"
                @click="open(s)"
              >
                <td class="text-no-wrap">{{ fmtTime(s.doc.startTime) }}</td>
                <td>
                  <v-chip
                    size="x-small"
                    variant="flat"
                    :color="statusColor(s.doc.status)"
                  >
                    {{ s.doc.status }}
                  </v-chip>
                </td>
                <td class="text-right">{{ s.doc.tally?.cardsPresented ?? '—' }}</td>
                <td class="text-right">
                  <span v-if="s.accuracy !== null" :class="accClass(s.accuracy)">
                    {{ Math.round(s.accuracy * 100) }}%
                  </span>
                  <span v-else class="text-disabled">—</span>
                </td>
                <td class="text-right">{{ s.doc.runs?.length ?? 0 }}</td>
                <td class="text-no-wrap text-caption">{{ clockText(s) }}</td>
                <td class="text-right">{{ fmtCpm(cpmOf(s.doc.tally?.cardsPresented, s.durationSeconds)) }}</td>
                <td class="text-no-wrap text-caption">
                  <span v-if="hasDelta(s)">
                    <span :class="deltaClass(s.delta.letters)">
                      {{ fmtDelta(s.delta.letters) }}&nbsp;ltr
                    </span>
                    ·
                    <span :class="deltaClass(s.delta.reachableWords)">
                      {{ fmtDelta(s.delta.reachableWords) }}&nbsp;wd
                    </span>
                    ·
                    <span :class="deltaClass(s.delta.elo)">
                      {{ fmtDelta(s.delta.elo, true) }}&nbsp;elo
                    </span>
                  </span>
                  <span v-else class="text-disabled">—</span>
                </td>
                <td>
                  <v-icon
                    v-for="f in s.flags"
                    :key="f"
                    size="small"
                    class="mr-1"
                    :color="SESSION_FLAG_META[f].color"
                    :title="`${SESSION_FLAG_META[f].label}: ${SESSION_FLAG_META[f].help}`"
                  >
                    {{ SESSION_FLAG_META[f].icon }}
                  </v-icon>
                </td>
                <td class="text-right">
                  <v-icon size="small" class="text-disabled">mdi-chevron-right</v-icon>
                </td>
              </tr>
            </tbody>
          </v-table>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchStudySessionsForUser,
  SESSION_FLAG_META,
  type SessionSummary,
  type SessionFlag,
} from '@/services/adminUsersService';

const route = useRoute();
const router = useRouter();
const username = ref<string>(String(route.params.username ?? ''));

const loading = ref(true);
const error = ref<string | null>(null);
const sessions = ref<SessionSummary[]>([]);
const filter = ref<'all' | SessionFlag>('all');

/** Only offer filter buttons for flags that actually occur — keeps the bar honest. */
const activeFlagFilters = computed(() => {
  const counts = new Map<SessionFlag, number>();
  for (const s of sessions.value) {
    for (const f of s.flags) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([flag, count]) => ({ flag, count }))
    .sort((a, b) => b.count - a.count);
});

// `!filter.value` covers v-btn-toggle's deselect, which clears the model
// rather than returning to 'all'. Falling back to the full list matches the
// card-history view's behaviour; filtering on `undefined` would blank the table.
const visibleSessions = computed(() =>
  !filter.value || filter.value === 'all'
    ? sessions.value
    : sessions.value.filter((s) => s.flags.includes(filter.value as SessionFlag)),
);

const tiles = computed(() => {
  const list = sessions.value;
  const closed = list.filter((s) => s.doc.status === 'closed').length;
  const responses = list.reduce((n, s) => n + (s.doc.tally?.responses ?? 0), 0);
  const correct = list.reduce((n, s) => n + (s.doc.tally?.correct ?? 0), 0);
  const totalSeconds = list.reduce((n, s) => n + (s.durationSeconds ?? 0), 0);
  // Only sessions with both a card count and a duration, so the rate isn't diluted
  const timed = list.filter((s) => s.durationSeconds && s.doc.tally?.cardsPresented !== undefined);
  const timedCards = timed.reduce((n, s) => n + (s.doc.tally?.cardsPresented ?? 0), 0);
  const timedSeconds = timed.reduce((n, s) => n + (s.durationSeconds ?? 0), 0);
  return [
    { label: 'sessions', value: list.length, color: 'primary' },
    { label: 'completed', value: closed, color: 'success' },
    { label: 'not completed', value: list.length - closed, color: 'error' },
    { label: 'responses', value: responses, color: 'primary' },
    {
      label: 'overall acc.',
      value: responses > 0 ? `${Math.round((correct / responses) * 100)}%` : '—',
      color: 'primary',
    },
    { label: 'time studied', value: fmtDuration(totalSeconds), color: 'grey' },
    { label: 'cards / min', value: fmtCpm(cpmOf(timedCards, timedSeconds)), color: 'grey' },
  ];
});

function open(s: SessionSummary): void {
  void router.push({
    name: 'AdminUserSessionDetail',
    params: { username: username.value, sessionId: s.doc.sessionId },
  });
}

function statusColor(status: string): string {
  if (status === 'closed') return 'success';
  if (status === 'abandoned') return 'warning';
  return 'error'; // 'open' — tab went away; nothing got to run
}

function accClass(acc: number): string {
  if (acc >= 0.8) return 'text-success';
  if (acc < 0.5) return 'text-error';
  return '';
}

function hasDelta(s: SessionSummary): boolean {
  return (
    s.delta.letters !== null ||
    s.delta.reachableWords !== null ||
    s.delta.elo !== null
  );
}

function fmtDelta(d: number | null, round = false): string {
  if (d === null) return '?';
  const v = round ? Math.round(d) : d;
  return v > 0 ? `+${v}` : String(v);
}

function deltaClass(d: number | null): string {
  if (d === null) return 'text-disabled';
  if (d > 0) return 'text-success';
  if (d < 0) return 'text-error';
  return 'text-disabled';
}

/** Cards per minute, or null when there's no count or no time to divide by. */
function cpmOf(cards: number | undefined, seconds: number | null): number | null {
  if (cards === undefined || !seconds || seconds <= 0) return null;
  return cards / (seconds / 60);
}

function fmtCpm(cpm: number | null): string {
  return cpm === null ? '—' : cpm.toFixed(1);
}

/** "1m40s of 2m" — how much of the configured dose was actually spent. */
function clockText(s: SessionSummary): string {
  const planned = fmtDuration(s.doc.plannedSeconds);
  if (s.durationSeconds === null) return `— of ${planned}`;
  return `${fmtDuration(s.durationSeconds)} of ${planned}`;
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m${s % 60}s` : `${m}m`;
  return `${(m / 60).toFixed(1)}h`;
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
    sessions.value = await fetchStudySessionsForUser(username.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    sessions.value = [];
  } finally {
    loading.value = false;
  }
}

function reload(): void {
  void load();
}

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

<style scoped>
.session-table :deep(td),
.session-table :deep(th) {
  font-size: 0.78rem;
}
.session-row {
  cursor: pointer;
}
.session-row:hover {
  background-color: rgba(var(--v-theme-primary), 0.05);
}
</style>
