<template>
  <div class="ss-debug">
    <h2>SessionSummary Debug</h2>

    <div class="scenario-picker">
      <button
        v-for="s in scenarios"
        :key="s.label"
        :class="['scenario-btn', { active: activeLabel === s.label }]"
        @click="activeLabel = s.label"
      >
        {{ s.label }}
      </button>
    </div>

    <div class="summary-wrapper">
      <SessionSummary
        :new-topics="summary.newTopics"
        :reviewed-topics="summary.reviewedTopics"
        :trouble-spots="summary.troubleSpots"
        :coming-soon="summary.comingSoon"
        :total-cards="summary.totalCards"
      />
    </div>

    <h3>Session records</h3>
    <p class="hint">
      Each card and each response to it. A GPC scored 0 on a wrong response is
      <span class="gpc gpc--miss">red</span>, if it is starred above;
      <span class="gpc gpc--off">struck</span> if scored 0 but not one of the card's GPCs.
    </p>
    <table v-if="activeRecords.length" class="records">
      <thead>
        <tr><th>card</th><th>answer</th><th>per-GPC</th></tr>
      </thead>
      <tbody>
        <template v-for="(r, i) in activeRecords" :key="i">
          <tr v-if="!r.records?.length">
            <td><code>{{ r.card.card_id }}</code></td>
            <td class="dim">—</td>
            <td class="dim">{{ (r.card.tags ?? []).join(' ') }}</td>
          </tr>
          <tr v-for="(resp, j) in r.records ?? []" :key="`${i}-${j}`" :class="{ 'first-row': j === 0 }">
            <td><code v-if="j === 0">{{ r.card.card_id }}</code></td>
            <td>
              <span :class="resp.isCorrect ? 'ok' : 'bad'">{{ resp.isCorrect ? '✓' : '✗' }}</span>
              {{ resp.userAnswer ?? '' }}
            </td>
            <td>
              <span
                v-for="g in gpcScores(r, resp)"
                :key="g.id"
                class="gpc"
                :class="{ 'gpc--miss': g.charged, 'gpc--off': g.offCard }"
              >{{ g.id }} {{ g.score }}</span>
              <span v-if="!gpcScores(r, resp).length" class="dim">_global only</span>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <h3>Trouble spots</h3>
    <ul class="dim">
      <li v-for="t in summary.troubleSpots" :key="t.gpcShortId">
        {{ t.gpcShortId }}: {{ t.failCount }} of {{ t.totalAttempts }} ({{ t.exerciseTypes.join(', ') }})
        <template v-if="t.misses.length">
          — {{ t.misses.map((m) => (m.kind === 'spelled' ? `${m.answer} for ${m.word}` : `picked ${m.answer} for ${m.target}`)).join('; ') }}
        </template>
      </li>
      <li v-if="!summary.troubleSpots.length">none</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import SessionSummary from '../components/session-end/SessionSummary.vue';
import { useSessionSummary, type SessionRecordEntry } from '../composables/useSessionSummary';
import { sessionScenarios as scenarios } from './sessionScenarios';

const activeLabel = ref(scenarios[0].label);
const activeRecords = ref<SessionRecordEntry[]>(scenarios[0].records);

watch(activeLabel, (label) => {
  activeRecords.value = scenarios.find(s => s.label === label)!.records;
});

const { summary } = useSessionSummary(activeRecords);

type Resp = NonNullable<SessionRecordEntry['records']>[number];
const EX = 'gpc:exercise:';

/** A response's per-GPC exercise scores; `charged` mirrors missedShortIds. */
function gpcScores(r: SessionRecordEntry, resp: Resp) {
  const perf = resp.performance;
  if (!perf || typeof perf !== 'object') return [];
  const own = new Set((r.card.tags ?? []).filter((t) => t.startsWith(EX)));
  return Object.entries(perf as Record<string, unknown>)
    .filter(([k]) => k.startsWith(EX))
    .map(([k, v]) => ({
      id: k.slice(EX.length),
      score: typeof v === 'number' ? +v.toFixed(2) : String(v),
      charged: resp.isCorrect === false && v === 0 && own.has(k),
      offCard: !own.has(k),
    }));
}
</script>

<style scoped>
.ss-debug {
  padding: 16px;
  max-width: 760px;
}

.summary-wrapper {
  max-width: 520px;
}

h3 {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 20px 0 6px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.hint,
.dim {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.records {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.records th {
  text-align: left;
  font-weight: 600;
  padding: 4px 6px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.records td {
  padding: 2px 6px;
  vertical-align: top;
}

.records tr.first-row td {
  border-top: 1px solid rgba(var(--v-border-color), 0.08);
}

.ok {
  color: rgb(var(--v-theme-success));
}

.bad {
  color: rgb(var(--v-theme-error));
}

.gpc {
  display: inline-block;
  margin: 1px 4px 1px 0;
  padding: 0 4px;
  border-radius: 3px;
  font-family: 'Roboto Mono', monospace;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.gpc--miss {
  background: rgba(var(--v-theme-error), 0.18);
}

.gpc--off {
  text-decoration: line-through;
  opacity: 0.6;
}

h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 12px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.scenario-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.scenario-btn {
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: transparent;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.7);
  transition: background 0.15s, color 0.15s;
}

.scenario-btn:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.scenario-btn.active {
  background: rgba(var(--v-theme-primary), 0.15);
  border-color: rgba(var(--v-theme-primary), 0.4);
  color: rgba(var(--v-theme-primary), 1);
  font-weight: 600;
}

.summary-wrapper {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  overflow: hidden;
  background: rgba(var(--v-theme-surface), 1);
  min-height: 300px;
}
</style>
