<template>
  <v-container>
    <h1 class="text-h5 mb-2">📈 Words Within Reach — mock</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Drives <code>ReachableWordsCard</code> from a fabricated
      <code>ProgressSummary</code> — no logged-in user or seeded ELO needed.
      Dial the curriculum step to sweep a learner's GPC knowledge over time.
    </p>

    <v-card class="pa-4 mb-4" variant="tonal">
      <div class="d-flex align-center mb-2" style="gap: 12px;">
        <span class="text-subtitle-2" style="min-width: 130px;">Curriculum step</span>
        <v-slider
          v-model="step"
          :min="0"
          :max="maxStep"
          :step="1"
          thumb-label
          hide-details
          density="compact"
        />
        <span class="text-mono" style="min-width: 48px; text-align: right;">{{ step }}/{{ maxStep }}</span>
      </div>

      <v-switch
        v-model="includeSeen"
        density="compact"
        hide-details
        color="primary"
        :label="`Expose next ${SEEN_AHEAD} GPCs as 'seen but not mastered' (drives stretch + coming-up)`"
      />

      <div class="text-caption text-medium-emphasis mt-2">
        {{ masteredIds.length }} mastered · {{ seenIds.length }} just-seen ·
        latest: <code>{{ latestLabel }}</code>
      </div>
    </v-card>

    <ReachableWordsCard :summary="mockSummary" />

    <v-expansion-panels class="mt-4">
      <v-expansion-panel title="Active GPC profile (raw)">
        <v-expansion-panel-text>
          <div class="text-mono text-caption">
            <strong>mastered:</strong> {{ masteredIds.join(', ') }}
          </div>
          <div class="text-mono text-caption mt-2">
            <strong>seen-only:</strong> {{ seenIds.join(', ') || '(none)' }}
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- ====================================================================
         Raw data inspection: the structures the card is actually built from.
         ==================================================================== -->
    <h2 class="text-h6 mt-8 mb-1">Raw data feeding the card</h2>
    <p class="text-body-2 text-medium-emphasis mb-3">
      Everything <code>getReachableWords()</code> returns for the mock profile
      above — recomputed here independently of the card. This is the ground
      truth the UI renders from; the card only ever shows a styled slice of it.
    </p>

    <template v-if="result">
      <div class="d-flex flex-wrap mb-4" style="gap: 8px;">
        <v-chip size="small" variant="tonal">knownGpc: {{ result.knownGpcCount }}</v-chip>
        <v-chip size="small" variant="tonal" color="success">mastered: {{ result.masteredGpcCount }}</v-chip>
        <v-chip size="small" variant="tonal" color="success">solid: {{ result.solid.length }}</v-chip>
        <v-chip size="small" variant="tonal" color="warning">stretch: {{ result.stretch.length }}</v-chip>
        <v-chip size="small" variant="tonal" color="primary">oneAway: {{ result.oneAway.length }}</v-chip>
        <v-chip size="small" variant="tonal">showcase: {{ showcase.length }}</v-chip>
      </div>

      <v-expansion-panels multiple>
        <!-- Showcase reel ------------------------------------------------- -->
        <v-expansion-panel>
          <v-expansion-panel-title>
            <strong>Showcase reel</strong>
            <span class="text-caption text-medium-emphasis ml-2">— the carousel slides ({{ showcase.length }})</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <p class="text-caption text-medium-emphasis mb-2">
              What the hero carousel cycles. <code>buildShowcase()</code> takes
              <em>solid</em> words first, then <em>stretch</em>, round-robining across
              feature “sorts” so consecutive slides feel varied rather than a run of CVCs.
            </p>
            <v-table density="compact" class="text-caption">
              <thead>
                <tr><th>#</th><th>word</th><th>tier</th><th>sort</th><th class="text-right">freq</th></tr>
              </thead>
              <tbody>
                <tr v-for="(item, i) in showcase" :key="item.word">
                  <td>{{ i + 1 }}</td>
                  <td class="text-mono">{{ item.word }}</td>
                  <td>{{ item.tier }}</td>
                  <td>{{ item.sortLabel }} <span class="text-disabled">({{ item.sortKey }})</span></td>
                  <td class="text-right">{{ item.freq.toLocaleString() }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- Solid --------------------------------------------------------- -->
        <v-expansion-panel>
          <v-expansion-panel-title>
            <strong>Solid</strong>
            <span class="text-caption text-medium-emphasis ml-2">— decode-solo, every GPC mastered ({{ result.solid.length }})</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <p class="text-caption text-medium-emphasis mb-2">
              Words where <em>every</em> required GPC clears the mastery thresholds.
              Frequency-sorted. <code>limiting</code> = the shakiest required GPC,
              <code>weakest</code> = its 0–1 mastery level (here all ≈ mastered).
            </p>
            <v-table density="compact" class="text-caption">
              <thead>
                <tr><th>word</th><th class="text-right">freq</th><th>pattern</th><th>limiting</th><th class="text-right">weakest</th><th>gpcs</th></tr>
              </thead>
              <tbody>
                <tr v-for="w in topN(result.solid)" :key="w.word">
                  <td class="text-mono">{{ w.word }}</td>
                  <td class="text-right">{{ w.freq.toLocaleString() }}</td>
                  <td class="text-mono">{{ w.pattern }}</td>
                  <td class="text-mono">{{ w.limiting.join(', ') }}</td>
                  <td class="text-right">{{ w.weakestLevel.toFixed(2) }}</td>
                  <td class="text-mono text-disabled">{{ w.gpcs.join(' · ') }}</td>
                </tr>
              </tbody>
            </v-table>
            <p v-if="result.solid.length > PREVIEW_N" class="text-caption text-disabled mt-1">
              showing {{ PREVIEW_N }} of {{ result.solid.length }}
            </p>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- Stretch ------------------------------------------------------- -->
        <v-expansion-panel>
          <v-expansion-panel-title>
            <strong>Stretch</strong>
            <span class="text-caption text-medium-emphasis ml-2">— read-together, all GPCs seen but not all mastered ({{ result.stretch.length }})</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <p class="text-caption text-medium-emphasis mb-2">
              Every required GPC has been <em>seen</em>, but at least one isn't solid yet —
              so <code>weakest</code> &lt; 1 flags the wobbly letter.
            </p>
            <v-table density="compact" class="text-caption">
              <thead>
                <tr><th>word</th><th class="text-right">freq</th><th>pattern</th><th>limiting</th><th class="text-right">weakest</th><th>gpcs</th></tr>
              </thead>
              <tbody>
                <tr v-for="w in topN(result.stretch)" :key="w.word">
                  <td class="text-mono">{{ w.word }}</td>
                  <td class="text-right">{{ w.freq.toLocaleString() }}</td>
                  <td class="text-mono">{{ w.pattern }}</td>
                  <td class="text-mono">{{ w.limiting.join(', ') }}</td>
                  <td class="text-right">{{ w.weakestLevel.toFixed(2) }}</td>
                  <td class="text-mono text-disabled">{{ w.gpcs.join(' · ') }}</td>
                </tr>
              </tbody>
            </v-table>
            <p v-if="result.stretch.length > PREVIEW_N" class="text-caption text-disabled mt-1">
              showing {{ PREVIEW_N }} of {{ result.stretch.length }}
            </p>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- Feature groups ------------------------------------------------ -->
        <v-expansion-panel>
          <v-expansion-panel-title>
            <strong>Feature groups</strong>
            <span class="text-caption text-medium-emphasis ml-2">— solid + stretch bucketed by “sort” ({{ result.groups.length }})</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <p class="text-caption text-medium-emphasis mb-2">
              The “sorts of words” taxonomy (sight / magic-e / digraph / longer / sound-it-out).
              The new carousel uses these labels per-slide; the grouping itself feeds
              <code>buildShowcase()</code>'s variety pass.
            </p>
            <v-table density="compact" class="text-caption">
              <thead>
                <tr><th>key</th><th>label</th><th class="text-right">count</th><th>example</th></tr>
              </thead>
              <tbody>
                <tr v-for="g in result.groups" :key="g.key">
                  <td class="text-mono">{{ g.key }}</td>
                  <td>{{ g.label }}</td>
                  <td class="text-right">{{ g.words.length }}</td>
                  <td class="text-mono">{{ g.example }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- One away ------------------------------------------------------ -->
        <v-expansion-panel>
          <v-expansion-panel-title>
            <strong>Coming up (one GPC away)</strong>
            <span class="text-caption text-medium-emphasis ml-2">— unlock batches ({{ result.oneAway.length }})</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <p class="text-caption text-medium-emphasis mb-2">
              Words blocked by <em>exactly one</em> not-yet-seen GPC. Learning that single
              GPC unlocks the whole batch — ranked by <code>totalFreq</code>. The card's
              “Coming up” teaser shows the top {{ 2 }}.
            </p>
            <v-table density="compact" class="text-caption">
              <thead>
                <tr><th>gpc</th><th>label</th><th class="text-right">words</th><th class="text-right">totalFreq</th><th>sample</th></tr>
              </thead>
              <tbody>
                <tr v-for="grp in result.oneAway" :key="grp.gpcId">
                  <td class="text-mono">{{ grp.gpcId }}</td>
                  <td>{{ grp.label }}</td>
                  <td class="text-right">{{ grp.words.length }}</td>
                  <td class="text-right">{{ grp.totalFreq.toLocaleString() }}</td>
                  <td class="text-mono">{{ grp.words.slice(0, 6).map((w) => w.word).join(', ') }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>
    <p v-else class="text-body-2 text-medium-emphasis">Computing…</p>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ReachableWordsCard from '@/components/progress/ReachableWordsCard.vue';
import type { ProgressSummary } from '@/services/userDebugAPI';
import {
  getReachableWords,
  buildShowcase,
  type ReachableResult,
  type ShowcaseItem,
} from '@/services/reachableWords';
// DEV-only view: pulling the optimal teaching order straight from the
// analytics output gives a realistic "knowledge after N steps" sweep.
import sequenceData from '../../content/phoneticAnalytics/outputs-v2/gpc-sequence.json';

/** Base knowledge every learner starts with (mirrors useProgression). */
const INITIAL_GPCS = ['GPC-s-S', 'GPC-n-N', 'GPC-i-IH', 'GPC-t-T'];

/** How many not-yet-learned GPCs to mark as "seen" for the stretch tier. */
const SEEN_AHEAD = 3;

interface SeqEntry {
  step: number;
  gpcId: string;
}
const sequence = (sequenceData as { sequence: SeqEntry[] }).sequence;

/** Real catalogue GPC ids in teaching order (skips the "(initial: …)" rows). */
const orderedGpcIds = computed(() =>
  sequence.map((s) => s.gpcId).filter((id) => id.startsWith('GPC-')),
);

const maxStep = computed(() => orderedGpcIds.value.length);
const step = ref(Math.min(14, maxStep.value));
const includeSeen = ref(true);

const masteredIds = computed(() => {
  const ids = new Set(INITIAL_GPCS);
  for (let i = 0; i < step.value && i < orderedGpcIds.value.length; i++) {
    ids.add(orderedGpcIds.value[i]);
  }
  return [...ids];
});

const seenIds = computed(() => {
  if (!includeSeen.value) return [];
  const mastered = new Set(masteredIds.value);
  const out: string[] = [];
  for (let i = step.value; i < orderedGpcIds.value.length && out.length < SEEN_AHEAD; i++) {
    const id = orderedGpcIds.value[i];
    if (!mastered.has(id)) out.push(id);
  }
  return out;
});

const latestLabel = computed(() => {
  if (step.value === 0) return `initial (${INITIAL_GPCS.join(', ')})`;
  return orderedGpcIds.value[step.value - 1] ?? '—';
});

const mockSummary = computed<ProgressSummary>(() => {
  const tagScores: Record<string, { score: number; count: number }> = {};
  const tagFor = (gpcId: string) => `gpc:exercise:${gpcId.slice('GPC-'.length)}`;
  for (const id of masteredIds.value) tagScores[tagFor(id)] = { score: 1150, count: 8 };
  for (const id of seenIds.value) tagScores[tagFor(id)] = { score: 1005, count: 1 };

  return {
    username: 'mock-reader',
    isLoggedIn: true,
    isGuest: false,
    courseId: 'mock',
    letterProgression: null,
    elo: { globalScore: 1100, globalCount: 50, tagScores },
    lessonProgress: null,
    prescribedProgress: null,
    reviews: { pendingCount: 0, nextReviewTime: null },
    activity: { seenCardCount: 0, sessionCount: 0, firstSession: null, lastSession: null },
    profile: null,
  };
});

// ---------------------------------------------------------------------------
// Raw data inspection — recompute the same ReachableResult the card consumes,
// so we can dump the intermediate structures the UI is built from.
// ---------------------------------------------------------------------------

const result = ref<ReachableResult | null>(null);

watch(
  () => mockSummary.value.elo?.tagScores,
  async (tagScores) => {
    result.value = tagScores ? await getReachableWords(tagScores) : null;
  },
  { immediate: true },
);

/** The hero reel the carousel cycles (solid-first, round-robin'd across sorts). */
const showcase = computed<ShowcaseItem[]>(() =>
  result.value ? buildShowcase(result.value) : [],
);

/** Show only the top N of the long lists to keep the panel readable. */
const PREVIEW_N = 25;
function topN<T>(arr: T[]): T[] {
  return arr.slice(0, PREVIEW_N);
}
</script>

<style scoped>
.text-mono {
  font-family: 'Courier New', monospace;
}
</style>
