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
            prepend-icon="mdi-refresh"
            :loading="loading"
            @click="reload"
          >
            Refresh
          </v-btn>
        </div>

        <div class="d-flex align-baseline mb-2 flex-wrap" style="gap: 8px">
          <h1 class="text-h4">Card history</h1>
          <v-chip color="primary" variant="tonal" size="small">
            <v-icon start size="small">mdi-account</v-icon>
            <code>{{ username }}</code>
          </v-chip>
          <v-chip size="x-small" variant="tonal" color="grey">admin view</v-chip>
        </div>
        <p class="text-caption text-medium-emphasis mb-4">
          Per-card interaction timeline, joined with pending-review status and the
          card's current course-DB ELO. Rows flagged
          <v-icon size="x-small" color="error">mdi-sync-alert</v-icon> are a failed
          card still holding an overdue review;
          <v-icon size="x-small" color="warning">mdi-snowflake</v-icon> is a
          repeatedly-failed card whose ELO never moved (see
          <code>agent/scheduler-teacher-audit/perceived-bug.md</code>).
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
            <v-btn-toggle v-model="filter" density="compact" color="primary" variant="outlined">
              <v-btn value="all" size="small">All ({{ cards.length }})</v-btn>
              <v-btn value="stuck" size="small">
                <v-icon start size="small" color="error">mdi-sync-alert</v-icon>
                Stuck ({{ stuckCount }})
              </v-btn>
              <v-btn value="failed" size="small">Ever failed ({{ failedCount }})</v-btn>
              <v-btn value="frozen" size="small">
                <v-icon start size="small" color="warning">mdi-snowflake</v-icon>
                Frozen ELO ({{ frozenCount }})
              </v-btn>
            </v-btn-toggle>
            <v-text-field
              v-model="search"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              placeholder="filter by cardId / tag / type"
              prepend-inner-icon="mdi-magnify"
              style="max-width: 320px"
            />
          </div>

          <v-alert
            v-if="cards.length === 0"
            type="info"
            variant="tonal"
          >
            No card-interaction history found for this user.
          </v-alert>

          <v-expansion-panels v-else v-model="openPanels" multiple variant="accordion">
            <v-expansion-panel
              v-for="card in visibleCards"
              :key="card.cardId"
              :value="card.cardId"
              :data-card="card.cardId"
              :class="card.cardId === flashCardId ? 'card-flash' : ''"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center flex-wrap" style="gap: 8px; width: 100%">
                  <v-icon v-if="isStuck(card)" color="error" size="small" title="failed + overdue review">
                    mdi-sync-alert
                  </v-icon>
                  <v-icon v-if="isFrozen(card)" color="warning" size="small" title="repeatedly failed, ELO unchanged">
                    mdi-snowflake
                  </v-icon>
                  <span class="text-body-2 font-weight-medium">{{ card.questionType ?? 'card' }}</span>
                  <code class="text-caption text-medium-emphasis">{{ shortId(card.cardId) }}</code>
                  <v-spacer />
                  <v-chip v-if="card.failCount > 0" size="x-small" color="error" variant="tonal">
                    {{ card.failCount }} fail{{ card.failCount === 1 ? '' : 's' }}
                  </v-chip>
                  <v-chip size="x-small" variant="tonal">
                    {{ card.attemptCount }} view{{ card.attemptCount === 1 ? '' : 's' }}
                  </v-chip>
                  <v-chip size="x-small" variant="tonal" color="grey">
                    {{ fmtDuration(card.totalTimeMs) }}
                  </v-chip>
                  <v-chip
                    v-if="card.pendingReview"
                    size="x-small"
                    :color="card.pendingReview.overdue ? 'error' : 'success'"
                    variant="flat"
                  >
                    review {{ card.pendingReview.overdue ? 'overdue' : 'scheduled' }}
                  </v-chip>
                  <v-chip size="x-small" variant="tonal" :color="eloColor(card)">
                    ELO {{ card.cardElo != null ? Math.round(card.cardElo) : '?' }}
                    <span v-if="card.cardEloCount != null" class="ml-1 text-disabled">
                      /{{ card.cardEloCount }}
                    </span>
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="d-flex flex-wrap mb-2" style="gap: 6px">
                  <v-chip
                    v-for="t in card.tags"
                    :key="t"
                    size="x-small"
                    variant="outlined"
                    :color="t.startsWith('gpc:exercise:') ? 'primary' : undefined"
                  >
                    {{ t }}
                  </v-chip>
                  <span v-if="card.tags.length === 0" class="text-caption text-disabled">
                    no tags
                  </span>
                </div>
                <div class="text-caption text-medium-emphasis mb-2">
                  lapses {{ card.lapses }} · streak {{ card.streak }} · best interval
                  {{ fmtSeconds(card.bestIntervalSeconds) }} ·
                  <template v-if="card.pendingReview">
                    next review {{ fmtTime(card.pendingReview.reviewTime) }}
                  </template>
                  <template v-else>no review scheduled</template>
                </div>

                <v-table density="compact" class="record-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>When</th>
                      <th>Result</th>
                      <th>Perf</th>
                      <th>Prior att.</th>
                      <th>Time</th>
                      <th>Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(rec, i) in card.records"
                      :key="i"
                      :class="rec.isCorrect === false ? 'fail-row' : ''"
                    >
                      <td>{{ i + 1 }}</td>
                      <td class="text-no-wrap">{{ fmtTime(rec.timeStamp) }}</td>
                      <td>
                        <v-icon
                          v-if="rec.isCorrect === true"
                          size="small"
                          color="success"
                          >mdi-check</v-icon
                        >
                        <v-icon
                          v-else-if="rec.isCorrect === false"
                          size="small"
                          color="error"
                          >mdi-close</v-icon
                        >
                        <span v-else class="text-disabled">—</span>
                      </td>
                      <td>{{ rec.performance != null ? rec.performance.toFixed(2) : '—' }}</td>
                      <td>{{ rec.priorAttempts ?? '—' }}</td>
                      <td>{{ (rec.timeSpentMs / 1000).toFixed(1) }}s</td>
                      <td class="text-truncate" style="max-width: 200px">
                        {{ fmtAnswer(rec.userAnswer) }}
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import {
  fetchCardHistoriesForUser,
  type CardHistoryDetail,
} from '@/services/adminUsersService';

const route = useRoute();
const username = ref<string>(String(route.params.username ?? ''));

const loading = ref(true);
const error = ref<string | null>(null);
const cards = ref<CardHistoryDetail[]>([]);
const filter = ref<'all' | 'stuck' | 'failed' | 'frozen'>('all');
const search = ref('');

// Which panels are open (by cardId). Driven by the ?focus= deep-link and by
// the user clicking panels thereafter.
const openPanels = ref<string[]>([]);
// The card to visually flash after a ?focus= landing; cleared on a timer.
const flashCardId = ref<string | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Deep-link support: `?focus=<cardId>` (set by the session timeline's card
 * links). Pre-fill the search filter with the id, open that panel, then scroll
 * it into view and flash it. No-op when the card isn't in this user's history.
 */
async function applyFocus(): Promise<void> {
  const focus = typeof route.query.focus === 'string' ? route.query.focus : '';
  if (!focus) return;
  if (!cards.value.some((c) => c.cardId === focus)) return;

  search.value = focus;
  openPanels.value = [focus];
  await nextTick();
  const el = document.querySelector(`[data-card="${CSS.escape(focus)}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flashCardId.value = focus;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashCardId.value = null;
  }, 2200);
}

// A card is "frozen" when it's been failed repeatedly but its ELO has barely
// accumulated count — the signature of denied course-DB card-ELO writes.
const FROZEN_FAIL_THRESHOLD = 3;

function isStuck(c: CardHistoryDetail): boolean {
  return c.failCount > 0 && !!c.pendingReview?.overdue;
}
function isFrozen(c: CardHistoryDetail): boolean {
  return (
    c.failCount >= FROZEN_FAIL_THRESHOLD &&
    c.cardEloCount != null &&
    c.cardEloCount < c.failCount
  );
}

const stuckCount = computed(() => cards.value.filter(isStuck).length);
const failedCount = computed(() => cards.value.filter((c) => c.failCount > 0).length);
const frozenCount = computed(() => cards.value.filter(isFrozen).length);

const tiles = computed(() => [
  { label: 'cards seen', value: cards.value.length, color: 'primary' },
  {
    label: 'total attempts',
    value: cards.value.reduce((s, c) => s + c.attemptCount, 0),
    color: 'primary',
  },
  {
    label: 'total fails',
    value: cards.value.reduce((s, c) => s + c.failCount, 0),
    color: 'error',
  },
  {
    label: 'time on cards',
    value: fmtDuration(cards.value.reduce((s, c) => s + c.totalTimeMs, 0)),
    color: 'grey',
  },
  { label: 'stuck reviews', value: stuckCount.value, color: 'error' },
  { label: 'frozen ELO', value: frozenCount.value, color: 'warning' },
]);

const visibleCards = computed(() => {
  let list = cards.value;
  if (filter.value === 'stuck') list = list.filter(isStuck);
  else if (filter.value === 'failed') list = list.filter((c) => c.failCount > 0);
  else if (filter.value === 'frozen') list = list.filter(isFrozen);
  const q = search.value?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (c) =>
        c.cardId.toLowerCase().includes(q) ||
        (c.questionType ?? '').toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  return list;
});

function eloColor(c: CardHistoryDetail): string | undefined {
  if (isFrozen(c)) return 'warning';
  return undefined;
}

function shortId(id: string): string {
  return id.length > 24 ? `…${id.slice(-22)}` : id;
}
function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${(m / 60).toFixed(1)}h`;
}
function fmtSeconds(s: number): string {
  if (!s) return 'none';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
function fmtAnswer(a: unknown): string {
  if (a == null) return '';
  if (typeof a === 'string' || typeof a === 'number') return String(a);
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
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
    cards.value = await fetchCardHistoriesForUser(username.value);
    await applyFocus();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    cards.value = [];
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

// Re-focus when only the ?focus= query changes (same user, e.g. following a
// second timeline link) — the data is already loaded, so just re-apply.
watch(
  () => route.query.focus,
  () => {
    if (!loading.value) void applyFocus();
  },
);

onMounted(() => {
  void load();
});
</script>

<style scoped>
.record-table :deep(td),
.record-table :deep(th) {
  font-size: 0.78rem;
}
.fail-row {
  background-color: rgba(var(--v-theme-error), 0.06);
}
/* Brief highlight when arrived-at via a ?focus= deep link. */
.card-flash {
  animation: card-flash 2.2s ease-out;
}
@keyframes card-flash {
  0%,
  30% {
    background-color: rgba(var(--v-theme-primary), 0.18);
  }
  100% {
    background-color: transparent;
  }
}
</style>
