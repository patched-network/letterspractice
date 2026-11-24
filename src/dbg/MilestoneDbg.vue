<template>
  <div class="milestone-dbg">
    <div class="milestone-dbg__controls">
      <div class="control-row">
        <button
          v-for="s in scenarios"
          :key="s.label"
          :class="['scenario-btn', { active: activeLabel === s.label }]"
          @click="applyScenario(s)"
        >
          {{ s.label }}
        </button>
      </div>

      <div v-if="table" class="control-row control-row--slider">
        <label>
          Graphemes introduced: <strong>{{ introducedCount }}</strong> / {{ table.graphemes.length }}
        </label>
        <input
          type="range"
          min="0"
          :max="table.graphemes.length"
          v-model.number="introducedCount"
        />
      </div>

      <p v-if="table" class="readout">
        <strong>{{ count.toLocaleString() }}</strong> reachable words
        <span :class="['pill', frozen ? 'pill--frozen' : 'pill--open']">
          {{ frozen ? 'WALL UP' : 'drip open' }}
        </span>
        <span class="readout__dim">
          threshold {{ FREE_TIER_WORD_THRESHOLD.toLocaleString() }} · ceiling
          {{ table.meta.wordCount.toLocaleString() }}
        </span>
      </p>
      <p class="readout__dim">
        Introduced: <code>{{ introduced.join(' ') || '(none)' }}</code>
      </p>
    </div>

    <div v-if="loadError" class="milestone-dbg__error">
      Failed to load the free-slate mask table: {{ loadError }}
    </div>

    <template v-else-if="table">
      <!-- The hub banner, in situ above the real choices component. -->
      <section class="milestone-dbg__panel">
        <h4>Study Hub — free-tier banner</h4>
        <p class="readout__dim">
          Rendered only when the wall is up. Below it, the hub's choices as a
          frozen account sees them: no lesson on offer, practice unaffected.
        </p>
        <div class="milestone-dbg__frame">
          <FreeTierBanner
            v-if="frozen"
            :count="count"
            class="mb-4"
            @see-more="logEvent('see-more → /milestone')"
          />
          <HubChoices
            :next-lesson="frozen ? null : pendingLesson"
            :practice-blocked="false"
            @learn="logEvent('learn')"
            @practice="logEvent('practice')"
          />
        </div>
      </section>

      <!-- The milestone screen itself. -->
      <section class="milestone-dbg__panel">
        <h4>/milestone</h4>
        <p class="readout__dim">
          Word chips and the "still ahead" list are computed from the real mask
          table, so they are the words a child in this state could actually read.
        </p>
        <div class="milestone-dbg__frame milestone-dbg__frame--wide">
          <MilestoneReport
            :count="count"
            :grapheme-count="introduced.length"
            :sample="sample"
            :pending="pending"
            :ceiling="table.meta.wordCount"
            @checkout="logEvent('checkout → /checkout')"
            @back="logEvent('back → /study')"
          />
        </div>
      </section>
    </template>

    <div v-if="eventLog.length" class="milestone-dbg__events">
      <h4>Emitted events</h4>
      <ul>
        <li v-for="(ev, i) in eventLog" :key="i">{{ ev }}</li>
      </ul>
      <button class="scenario-btn" @click="eventLog = []">Clear</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * MilestoneDbg — the entitlement wall's two surfaces, at any point on the curve.
 *
 * Both screens are otherwise unreachable in development: getting an account to
 * the free-tier ceiling honestly means introducing ~22 graphemes, which is
 * hours of study. This drives them from a slider instead.
 *
 * The slider walks graphemes in the pipeline's teaching order rather than
 * alphabetically, so intermediate positions are states a real learner passes
 * through — and the convex shape of the metric is visible while dragging
 * (long flat stretch, then a few hundred words per grapheme near the end).
 * Word chips and the "still ahead" list come from the real mask table, so
 * everything on screen is a claim the product would actually make.
 */

import { ref, computed, onMounted, watch } from 'vue';
import HubChoices from '../components/hub/HubChoices.vue';
import FreeTierBanner from '../components/hub/FreeTierBanner.vue';
import MilestoneReport from '../components/milestone/MilestoneReport.vue';
import {
  loadFreeSlateTable,
  countReachable,
  reachableSample,
  FREE_TIER_WORD_THRESHOLD,
  type FreeSlateTable,
} from '../services/reachableWords/freeSlateCount';
import { LESSON_CATALOG } from '../services/lessons';

// ---------------------------------------------------------------------------
// Table + unlock order
// ---------------------------------------------------------------------------

const table = ref<FreeSlateTable | null>(null);
const loadError = ref<string | null>(null);

/**
 * A plausible traversal of the free slate, for the slider to walk.
 *
 * Not the pipeline's exact order — that is ELO- and frequency-driven and
 * differs per child. What matters for a harness is that intermediate positions
 * are states a learner could actually be in, so this reproduces the two
 * structural facts that shape them: the seed set the sequence starts from, and
 * the digraphs lesson opening at `minUnlockedLetters: 13`, after which digraph
 * intros interleave with the remaining letters rather than queueing behind
 * them all.
 *
 * The alphabetical order the artifact ships in would put every digraph last,
 * which is a state no learner passes through.
 */
const SEED = ['s', 'n', 'i', 't'];
const DIGRAPHS_UNLOCK_AT = 13;

const unlockOrder = computed<string[]>(() => {
  const all = table.value?.graphemes ?? [];
  const letters = [
    ...SEED.filter((g) => all.includes(g)),
    ...all.filter((g) => g.length === 1 && !SEED.includes(g)),
  ];
  const digraphs = all.filter((g) => g.length > 1);

  const out: string[] = [];
  let li = 0;
  let di = 0;
  while (li < letters.length || di < digraphs.length) {
    const digraphsOpen = li >= DIGRAPHS_UNLOCK_AT && di < digraphs.length;
    // Roughly one digraph per two letters once the lesson has opened.
    const takeDigraph = digraphsOpen && (out.length % 3 === 2 || li >= letters.length);
    if (takeDigraph) out.push(digraphs[di++]);
    else if (li < letters.length) out.push(letters[li++]);
    else out.push(digraphs[di++]);
  }
  return out;
});

const introducedCount = ref(0);
const introduced = computed(() => unlockOrder.value.slice(0, introducedCount.value));

const count = computed(() =>
  table.value ? countReachable(table.value, introduced.value) : 0,
);
const frozen = computed(() => count.value >= FREE_TIER_WORD_THRESHOLD);
const sample = computed(() =>
  table.value ? reachableSample(table.value, introduced.value, 14) : [],
);
const pending = computed(() => {
  const have = new Set(introduced.value);
  return (table.value?.graphemes ?? []).filter((g) => !have.has(g));
});

/** A plausible pending lesson, for the not-yet-frozen hub state. */
const pendingLesson = computed(
  () => LESSON_CATALOG.find((l) => l.id === 'digraphs') ?? null,
);

// ---------------------------------------------------------------------------
// Scenarios — the positions worth eyeballing
// ---------------------------------------------------------------------------

interface Scenario {
  label: string;
  /** Target word count; the slider snaps to the first position that reaches it. */
  target: number;
}

const scenarios: Scenario[] = [
  { label: 'Early (~100 words)', target: 100 },
  { label: 'Mid (~500 words)', target: 500 },
  { label: 'Just under the wall', target: FREE_TIER_WORD_THRESHOLD - 1 },
  { label: 'At the wall', target: FREE_TIER_WORD_THRESHOLD },
  { label: 'Full free slate', target: Number.MAX_SAFE_INTEGER },
];

const activeLabel = ref<string | null>(null);

/**
 * Snap to the first unlock position reaching the target. "Just under the wall"
 * is the interesting one — the metric is conjunctive, so the last grapheme
 * before the wall can be worth a few hundred words on its own.
 */
/** Set by applyScenario so the watch below can tell a jump from a drag. */
let snapping = false;

function applyScenario(s: Scenario) {
  const t = table.value;
  if (!t) return;

  const order = unlockOrder.value;
  const position = (() => {
    if (s.target === Number.MAX_SAFE_INTEGER) return order.length;
    for (let i = 0; i <= order.length; i++) {
      const n = countReachable(t, order.slice(0, i));
      // "Just under the wall" wants the last position still BELOW threshold —
      // the metric is conjunctive, so that gap can be a few hundred words.
      if (s.target === FREE_TIER_WORD_THRESHOLD - 1) {
        if (n >= FREE_TIER_WORD_THRESHOLD) return Math.max(0, i - 1);
      } else if (n >= s.target) {
        return i;
      }
    }
    return order.length;
  })();

  snapping = true;
  introducedCount.value = position;
  activeLabel.value = s.label;
}

// Dragging the slider means the position is no longer a named scenario.
watch(introducedCount, () => {
  if (snapping) {
    snapping = false;
    return;
  }
  activeLabel.value = null;
});

// ---------------------------------------------------------------------------
// Event log — proves the surfaces emit, without navigating away from the harness
// ---------------------------------------------------------------------------

const eventLog = ref<string[]>([]);
function logEvent(name: string) {
  eventLog.value.unshift(`[${new Date().toLocaleTimeString()}] ${name}`);
  if (eventLog.value.length > 10) eventLog.value.length = 10;
}

onMounted(async () => {
  try {
    table.value = await loadFreeSlateTable();
    applyScenario(scenarios[3]); // open at the wall — the state worth reviewing
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  }
});
</script>

<style scoped>
.milestone-dbg {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 16px;
  max-width: 900px;
  margin: 0 auto;
}

.milestone-dbg__controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 10px;
}

.control-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.control-row--slider {
  gap: 12px;
}

.control-row--slider input[type='range'] {
  flex: 1;
  min-width: 220px;
}

.scenario-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s ease;
}

.scenario-btn.active {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  border-color: rgb(var(--v-theme-primary));
}

.readout {
  margin: 0;
  font-size: 0.9rem;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.readout__dim {
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.7;
}

.pill {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 10px;
}

.pill--frozen {
  background: rgba(var(--v-theme-warning), 0.18);
  color: rgb(var(--v-theme-warning));
}

.pill--open {
  background: rgba(var(--v-theme-success), 0.18);
  color: rgb(var(--v-theme-success));
}

.milestone-dbg__panel h4 {
  margin: 0 0 4px;
  font-size: 0.9rem;
  font-weight: 700;
}

.milestone-dbg__frame {
  margin-top: 10px;
  max-width: 460px;
}

.milestone-dbg__frame--wide {
  max-width: 760px;
}

.milestone-dbg__error {
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(var(--v-theme-error), 0.12);
  color: rgb(var(--v-theme-error));
  font-size: 0.85rem;
}

.milestone-dbg__events {
  font-size: 0.8rem;
  padding: 12px 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 8px;
}

.milestone-dbg__events h4 {
  margin: 0 0 6px;
  font-size: 0.85rem;
  font-weight: 600;
}

.milestone-dbg__events ul {
  margin: 0 0 8px;
  padding-left: 18px;
}
</style>
