<template>
  <v-container fluid :style="{ maxWidth: hasPair ? '2200px' : '1400px' }">
    <div class="d-flex align-center flex-wrap mb-4" style="gap: 8px">
      <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" :to="{ name: 'AdminUserProgress', params: { username } }">
        Progress
      </v-btn>
      <h1 class="text-h5">Pipeline run (read-only)</h1>
      <v-chip color="primary" variant="tonal" size="small">
        <v-icon start size="small">mdi-account</v-icon>
        <code>{{ username }}</code>
      </v-chip>
      <v-spacer />
      <v-btn variant="text" size="small" prepend-icon="mdi-pipe" :to="{ name: 'AdminUserPipeline', params: { username } }">
        Pipeline
      </v-btn>
      <v-btn variant="text" size="small" prepend-icon="mdi-timeline-clock-outline" :to="{ name: 'AdminUserSessions', params: { username } }">
        Sessions
      </v-btn>
      <v-btn variant="text" size="small" prepend-icon="mdi-chart-scatter-plot" :to="{ name: 'AdminUserElo', params: { username } }">
        ELO
      </v-btn>
      <v-btn
        variant="text"
        size="small"
        :disabled="!runs.length"
        :prepend-icon="copiedKey === 'dump' ? 'mdi-check' : 'mdi-clipboard-text-outline'"
        :color="copiedKey === 'dump' ? 'success' : undefined"
        @click="copyText(allRunsText(), 'dump')"
      >
        {{ copiedKey === 'dump' ? 'Copied' : 'Copy for LLM' }}
      </v-btn>
    </div>

    <p class="text-body-2 text-medium-emphasis mb-4">
      Runs the course pipeline for this learner as their next session would start it, from the learner data loaded
      below. Nothing is written: writes the pipeline attempts are listed per run instead. Card data and strategy docs
      are read live from the course DB.
    </p>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
    <v-alert v-if="runError" type="error" variant="tonal" class="mb-4" closable @click:close="runError = ''">
      {{ runError }}
    </v-alert>

    <div v-if="loading && !dataset" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="dataset && dump && runup">
      <!-- Controls -->
      <v-card variant="outlined" class="mb-4">
        <v-card-text>
          <div class="d-flex align-center flex-wrap" style="gap: 16px">
            <v-btn-toggle v-model="mode" mandatory density="compact" variant="outlined" color="primary" divided>
              <v-btn value="global" size="small">Global ELO</v-btn>
              <v-btn value="tag" size="small">Tag-aware ELO</v-btn>
              <v-btn value="both" size="small">Both</v-btn>
            </v-btn-toggle>
            <v-text-field
              v-model.number="limit"
              type="number"
              label="Batch limit"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 130px"
              min="1"
            />
            <v-checkbox
              v-model="applyHints"
              :disabled="!runup.hints"
              density="compact"
              hide-details
              :label="runup.hints ? `Post-lesson hints (${runup.postLessonFlag})` : 'No post-lesson hints pending'"
            />
            <v-spacer />
            <v-btn color="primary" variant="flat" prepend-icon="mdi-play" :loading="running" @click="run">Run</v-btn>
            <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="loading" @click="reload">
              Reload learner data
            </v-btn>
          </div>
          <div class="text-caption text-medium-emphasis mt-3">
            Learner data as of {{ fmtTime(dump.fetchedAt) }} ·
            {{ runup.sessionCount }} completed session(s) → batch limit {{ runup.batchLimit }} ·
            {{ dataset.scheduled.length }} scheduled review(s) ·
            {{ dataset.cardHistories.length }} card(s) seen
          </div>
        </v-card-text>
      </v-card>

      <v-alert v-if="browserOverride" type="warning" variant="tonal" density="compact" class="mb-4">
        <code>window.skuilder.multiDimElo</code> is on in this browser, so every run is tag-aware whatever the toggle
        says. Set it to <code>false</code> in the console to compare.
      </v-alert>
      <v-alert v-if="dripWords !== null" type="warning" variant="tonal" density="compact" class="mb-4">
        This learner is at the free-tier ceiling ({{ dripWords }} words). The intro gate's paid check reads
        <em>your</em> account, not theirs, so new-intro gating in these runs follows your entitlement.
      </v-alert>

      <p v-if="!entries.length" class="text-body-2 text-medium-emphasis">
        No runs yet. "Both" runs global then tag-aware ELO distance on the same learner data and shows them side by
        side.
      </p>
      <p v-else-if="hasPair" class="text-caption text-medium-emphasis mb-2">
        Hover a card to highlight it in every run; click to pin (click again to unpin).
        <template v-if="pinnedCard">
          Pinned: <code>{{ cardLabel(pinnedCard) }}</code>
          <v-btn size="x-small" variant="text" icon="mdi-close" @click="pinnedCard = null" />
        </template>
      </p>

      <!-- Entries (a single run, or a global/tag-aware pair), newest first -->
      <v-card v-for="e in entries" :key="e.id" variant="outlined" class="mb-6">
        <v-card-title class="d-flex align-center flex-wrap text-subtitle-1" style="gap: 8px">
          <template v-if="e.cmp">Comparison {{ e.id }}: global vs tag-aware</template>
          <template v-else>Run {{ e.runs[0].id }}</template>
          <v-chip size="small" variant="tonal">limit {{ e.runs[0].limit }}</v-chip>
          <v-chip v-if="e.runs[0].hints" size="small" variant="tonal" color="primary">hints</v-chip>
          <span class="text-caption text-medium-emphasis">
            learner ELO {{ Math.round(e.runs[0].learnerElo) }} · {{ fmtTime(e.runs[0].ranAt) }}
          </span>
          <v-spacer />
          <v-btn
            :icon="copiedKey === 'entry-' + e.id ? 'mdi-check' : 'mdi-content-copy'"
            size="x-small"
            variant="text"
            :color="copiedKey === 'entry-' + e.id ? 'success' : undefined"
            title="Copy"
            @click="copyText(entryText(e), 'entry-' + e.id)"
          />
          <v-btn icon="mdi-close" size="x-small" variant="text" title="Remove" @click="removeEntry(e.id)" />
        </v-card-title>

        <!-- Comparison strip -->
        <v-card-text v-if="e.cmp" class="pb-0">
          <div class="text-body-2 mb-1">
            <strong>Selection overlap</strong> {{ Math.round(e.cmp.overlap * 100) }}% ·
            {{ e.cmp.kept.length }} in both · {{ e.cmp.entered.length }} tag-aware only ·
            {{ e.cmp.left.length }} global only
          </div>
          <div v-if="e.cmp.entered.length" class="chip-line">
            <span class="text-caption mr-1">tag-aware only:</span>
            <v-chip
              v-for="id in e.cmp.entered"
              :key="id"
              size="x-small"
              color="success"
              variant="tonal"
              :class="linkClass(id)"
              @mouseenter="hoverCard = id"
              @mouseleave="hoverCard = null"
              @click="togglePin(id)"
            >
              {{ cardLabel(id) }} {{ rankPair(e.cmp, id) }}
            </v-chip>
          </div>
          <div v-if="e.cmp.left.length" class="chip-line">
            <span class="text-caption mr-1">global only:</span>
            <v-chip
              v-for="id in e.cmp.left"
              :key="id"
              size="x-small"
              color="warning"
              variant="tonal"
              :class="linkClass(id)"
              @mouseenter="hoverCard = id"
              @mouseleave="hoverCard = null"
              @click="togglePin(id)"
            >
              {{ cardLabel(id) }} {{ rankPair(e.cmp, id) }}
            </v-chip>
          </div>
          <div v-if="e.cmp.movers.length" class="chip-line">
            <span class="text-caption mr-1">biggest ELO× moves:</span>
            <v-chip
              v-for="id in e.cmp.movers.slice(0, 8)"
              :key="id"
              size="x-small"
              variant="tonal"
              :class="linkClass(id)"
              @mouseenter="hoverCard = id"
              @mouseleave="hoverCard = null"
              @click="togglePin(id)"
            >
              {{ cardLabel(id) }} ×{{ fmtMult(e.cmp.cards.get(id)?.multA) }}→×{{ fmtMult(e.cmp.cards.get(id)?.multB) }}
            </v-chip>
          </div>
        </v-card-text>

        <v-card-text v-if="e.cmp" class="pb-0">
          <v-row dense>
            <!-- Filter impact, global vs tag-aware -->
            <v-col cols="12" lg="5">
              <div class="text-caption font-weight-medium">filter impact (global → tag-aware)</div>
              <v-table density="compact" class="diff-table">
                <thead>
                  <tr>
                    <th>filter</th>
                    <th>global</th>
                    <th>tag-aware</th>
                    <th class="text-right" title="Cards retained in both runs whose action from this filter differs">
                      cards changed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="f in e.cmp.filters"
                    :key="f.name"
                    :class="{ 'text-medium-emphasis': !f.changedActions && sameImpact(f) }"
                  >
                    <td>{{ f.name }}</td>
                    <td class="num">{{ fmtImpact(f.a) }}</td>
                    <td class="num">{{ fmtImpact(f.b) }}</td>
                    <td class="text-right num">{{ f.changedActions || '' }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-col>

            <!-- Per-skill rollup -->
            <v-col cols="12" lg="7">
              <div class="text-caption font-weight-medium">
                skills (global → tag-aware) · hover a skill to highlight its cards
              </div>
              <v-table density="compact" class="diff-table">
                <thead>
                  <tr>
                    <th>skill</th>
                    <th class="text-right">selected</th>
                    <th class="text-right" title="Mean ELO-distance multiplier over cards retained in both runs">
                      mean ELO×
                    </th>
                    <th class="text-right" title="Cards with this skill retained in both runs">n</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="t in shownTags(e)"
                    :key="t.tag"
                    :class="{ 'link-hover': hoverTag === t.tag }"
                    @mouseenter="hoverTag = t.tag"
                    @mouseleave="hoverTag = null"
                  >
                    <td class="text-caption">{{ shortTag(t.tag) }}</td>
                    <td class="text-right num">
                      {{ t.selectedA }} → {{ t.selectedB }}
                      <span v-if="t.selectedB !== t.selectedA" :class="t.selectedB > t.selectedA ? 'text-success' : 'text-error'">
                        ({{ t.selectedB > t.selectedA ? '+' : '' }}{{ t.selectedB - t.selectedA }})
                      </span>
                    </td>
                    <td class="text-right num">
                      <template v-if="t.meanMultA !== undefined">
                        ×{{ fmtMult(t.meanMultA) }} → ×{{ fmtMult(t.meanMultB) }}
                        <span
                          v-if="Math.abs(t.meanMultB! - t.meanMultA) >= 0.005"
                          :class="t.meanMultB! > t.meanMultA ? 'text-success' : 'text-error'"
                        >
                          ({{ t.meanMultB! > t.meanMultA ? '+' : '' }}{{ (t.meanMultB! - t.meanMultA).toFixed(2) }})
                        </span>
                      </template>
                    </td>
                    <td class="text-right num text-caption">{{ t.shared }}</td>
                  </tr>
                </tbody>
              </v-table>
              <v-btn
                v-if="e.cmp.tags.length > TAG_ROWS"
                size="x-small"
                variant="text"
                @click="toggleAllTags(e.id)"
              >
                {{ allTags.has(e.id) ? 'fewer' : `all ${e.cmp.tags.length} skills` }}
              </v-btn>
            </v-col>
          </v-row>
        </v-card-text>

        <v-row no-gutters>
          <v-col v-for="(r, side) in e.runs" :key="r.id" cols="12" :lg="e.cmp ? 6 : 12" class="pa-2">
            <div class="d-flex align-center flex-wrap px-2" style="gap: 8px">
              <v-chip size="small" :color="r.tagAwareElo ? 'secondary' : undefined" variant="tonal">
                {{ r.tagAwareElo ? 'tag-aware ELO' : 'global ELO' }}
              </v-chip>
              <span class="text-caption text-medium-emphasis">run {{ r.id }} · {{ r.elapsedMs }} ms</span>
            </div>

            <div v-if="!r.report" class="pa-2">
              <v-alert type="warning" variant="tonal" density="compact">
                The pipeline ran but captured no report (the course may have fallen back to its default pipeline).
              </v-alert>
            </div>

            <div v-else class="pa-2">
              <div class="text-body-2 mb-2">
                {{ r.report.generatedCount }} generated → {{ r.report.finalCount }} selected
                ({{ r.report.newSelected }} new, {{ r.report.reviewsSelected }} review)
                <template v-if="r.report.discardedTail"> · {{ r.report.discardedTail.count }} more dropped</template>
              </div>

              <div class="text-body-2 mb-3">
                <strong>ELO distance</strong> over {{ eloSummary(r).cards }} retained card(s):
                mean ×{{ eloSummary(r).mean }}, selected ×{{ eloSummary(r).meanSelected }}
                <template v-if="r.tagAwareElo">
                  · read on shared tags for {{ eloSummary(r).tagRead }} card(s), global fallback for
                  {{ eloSummary(r).cards - eloSummary(r).tagRead }}
                </template>
              </div>

              <div v-if="r.hints && side === 0" class="text-caption mb-3">
                hints: <code>{{ JSON.stringify(r.hints) }}</code>
              </div>

              <v-table density="compact" class="run-table mb-3">
                <thead>
                  <tr>
                    <th></th>
                    <th class="text-right">#</th>
                    <th>card</th>
                    <th v-if="!e.cmp">skills</th>
                    <th>origin</th>
                    <th v-if="!e.cmp">source</th>
                    <th class="text-right">score</th>
                    <th class="text-right">ELO dist ×</th>
                    <th v-if="e.cmp" :title="`This card in the ${side === 0 ? 'tag-aware' : 'global'} run`">
                      vs {{ side === 0 ? 'tag-aware' : 'global' }}
                    </th>
                    <th v-if="!e.cmp">ELO distance reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="{ c, rank, vs } in rowsFor(e, side)"
                    :key="c.cardId"
                    :class="[
                      { 'text-medium-emphasis': !c.selected },
                      linkClass(c.cardId),
                      { 'link-hover': !!hoverTag && !!c.tags?.includes(hoverTag) },
                      e.cmp ? selectionDiffClass(e.cmp, c.cardId, side) : '',
                    ]"
                    @mouseenter="hoverCard = c.cardId"
                    @mouseleave="hoverCard = null"
                    @click="togglePin(c.cardId)"
                  >
                    <td>
                      <v-icon v-if="c.selected" size="small" color="success">mdi-check</v-icon>
                    </td>
                    <td class="text-right num text-caption">{{ rank }}</td>
                    <td :title="c.required ? `required: ${c.required}` : (c.generator ?? '')">
                      <span class="card-id" :title="c.cardId">{{ cardLabel(c.cardId) }}</span>
                      <v-btn
                        :icon="copiedKey === `card-${r.id}-${c.cardId}` ? 'mdi-check' : 'mdi-content-copy'"
                        size="x-small"
                        variant="text"
                        density="compact"
                        :color="copiedKey === `card-${r.id}-${c.cardId}` ? 'success' : undefined"
                        title="Copy cardId"
                        @click.stop="copyText(c.cardId, `card-${r.id}-${c.cardId}`)"
                      />
                      <div v-if="e.cmp" class="text-caption text-medium-emphasis">
                        {{ skillTags(c.tags).join(' ') }}
                      </div>
                    </td>
                    <td v-if="!e.cmp" class="text-caption">{{ skillTags(c.tags).join(' ') }}</td>
                    <td>{{ c.origin }}</td>
                    <td v-if="!e.cmp" class="text-caption">
                      {{ c.required ? `required: ${c.required}` : (c.generator ?? '') }}
                    </td>
                    <td class="text-right num">{{ c.finalScore.toFixed(3) }}</td>
                    <td class="text-right num" :title="eloDistanceOf(c.provenance)?.reason">
                      {{ fmtMult(eloDistanceOf(c.provenance)?.multiplier) }}
                    </td>
                    <td v-if="e.cmp" class="text-caption num vs">
                      <span v-if="!vs || vs.rank === undefined" class="text-medium-emphasis">not retained</span>
                      <template v-else>
                        <v-icon v-if="vs.selected" size="x-small" color="success">mdi-check</v-icon>
                        #{{ vs.rank }}
                        <span v-if="vs.rankMove" :class="vs.rankMove > 0 ? 'text-success' : 'text-error'">
                          {{ vs.rankMove > 0 ? '↑' : '↓' }}{{ Math.abs(vs.rankMove) }}
                        </span>
                        <span v-if="vs.multDelta !== undefined && Math.abs(vs.multDelta) >= 0.005" class="ml-1">
                          ×{{ fmtMult(vs.mult) }} ({{ vs.multDelta > 0 ? '+' : '' }}{{ vs.multDelta.toFixed(2) }})
                        </span>
                      </template>
                    </td>
                    <td v-if="!e.cmp" class="text-caption reason" :title="eloDistanceOf(c.provenance)?.reason">
                      {{ shortReason(eloDistanceOf(c.provenance)?.reason) }}
                    </td>
                  </tr>
                </tbody>
              </v-table>

              <div class="text-caption font-weight-medium">filters</div>
              <div class="text-caption mb-2">
                <span v-for="f in r.report.filters" :key="f.name" class="mr-3">
                  {{ f.name }}: +{{ f.boosted }} −{{ f.penalized }} ✕{{ f.removed }}
                </span>
              </div>

              <div class="text-caption">
                <span class="font-weight-medium">suppressed writes:</span>
                <template v-if="r.writes.length">
                  <code v-for="(w, i) in r.writes" :key="i" class="mr-2">{{ w.method }}({{ w.detail }})</code>
                </template>
                <span v-else> none</span>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-card>
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  browserTagAwareOverride,
  compareRuns,
  dripGateCaveat,
  eloDistanceOf,
  runReadonlyPipeline,
  sessionRunupFor,
  type ReadonlyRunResult,
  type FilterDiff,
  type RunComparison,
} from '@/services/adminPipelineRun';
import type { FilterImpact } from '@vue-skuilder/db';
import { lpDiagnosticsInterpreters } from '@/services/diagnosticsInterpreters';
import { useAdminLearnerDataset } from './fw/useAdminLearnerDataset';
import { useClickToCopy } from './useClickToCopy';

const route = useRoute();
const username = computed(() => String(route.params.username ?? ''));
const { dump, dataset, loading, error, reload } = useAdminLearnerDataset(username);
const { copiedKey, copyText } = useClickToCopy('pipelineRun');

const runup = computed(() => (dump.value && dataset.value ? sessionRunupFor(dump.value, dataset.value) : null));
const dripWords = computed(() => (dataset.value ? dripGateCaveat(dataset.value) : null));
const browserOverride = ref(browserTagAwareOverride());

type RunMode = 'global' | 'tag' | 'both';
const mode = ref<RunMode>('both');
const limit = ref(12);
const applyHints = ref(true);

/** One run, or a pair (global first, tag-aware second) with their comparison. */
interface RunEntry {
  id: number;
  runs: ReadonlyRunResult[];
  cmp: RunComparison | null;
}

const entries = ref<RunEntry[]>([]);
const runs = computed(() => entries.value.flatMap((e) => e.runs));
const hasPair = computed(() => entries.value.some((e) => e.cmp));
const running = ref(false);
const runError = ref('');
let nextEntryId = 1;

// Linked highlighting: a hovered or pinned card lights up in every run.
const hoverCard = ref<string | null>(null);
const pinnedCard = ref<string | null>(null);
const hoverTag = ref<string | null>(null);

const TAG_ROWS = 12;
const allTags = ref(new Set<number>());

function toggleAllTags(id: number): void {
  const next = new Set(allTags.value);
  if (!next.delete(id)) next.add(id);
  allTags.value = next;
}

function shownTags(e: RunEntry) {
  const tags = e.cmp?.tags ?? [];
  return allTags.value.has(e.id) ? tags : tags.slice(0, TAG_ROWS);
}

const fmtImpact = (f?: FilterImpact) => (f ? `+${f.boosted} −${f.penalized} ✕${f.removed}` : '–');
const sameImpact = (f: FilterDiff) => fmtImpact(f.a) === fmtImpact(f.b);

// Defaults follow the learner's runup; a different learner starts clean.
watch(
  runup,
  (r) => {
    if (r) limit.value = r.batchLimit;
  },
  { immediate: true },
);
watch(username, () => {
  entries.value = [];
  pinnedCard.value = null;
});

async function run(): Promise<void> {
  if (!dump.value || !dataset.value || !runup.value) return;
  running.value = true;
  runError.value = '';
  browserOverride.value = browserTagAwareOverride();
  const base = {
    limit: Math.max(1, Math.round(limit.value || 1)),
    hints: applyHints.value ? runup.value.hints : null,
  };
  const modes = mode.value === 'both' ? [false, true] : [mode.value === 'tag'];
  try {
    // Sequential: each run drains a shared capture buffer.
    const results: ReadonlyRunResult[] = [];
    for (const tagAwareElo of modes) {
      results.push(await runReadonlyPipeline(dump.value, dataset.value, { ...base, tagAwareElo }));
    }
    const cmp = results.length === 2 ? compareRuns(results[0].report, results[1].report, isSkillTag) : null;
    entries.value = [{ id: nextEntryId++, runs: results, cmp }, ...entries.value];
  } catch (e) {
    runError.value = e instanceof Error ? e.message : String(e);
  } finally {
    running.value = false;
  }
}

function removeEntry(id: number): void {
  entries.value = entries.value.filter((e) => e.id !== id);
}

function togglePin(cardId: string): void {
  pinnedCard.value = pinnedCard.value === cardId ? null : cardId;
}

function linkClass(cardId: string): Record<string, boolean> {
  return {
    'link-hover': hoverCard.value === cardId,
    'link-pinned': pinnedCard.value === cardId,
  };
}

/** Rows in rank order, each with where the card stands in the paired run. */
function rowsFor(e: RunEntry, side: number) {
  const cards = [...(e.runs[side].report?.cards ?? [])].sort((x, y) => y.finalScore - x.finalScore);
  return cards.map((c, i) => ({ c, rank: i + 1, vs: e.cmp ? otherSide(e.cmp, c.cardId, side) : null }));
}

/** The card in the other run of the pair. rankMove > 0: this run ranks it higher. */
function otherSide(cmp: RunComparison, cardId: string, side: number) {
  const x = cmp.cards.get(cardId);
  const [here, there] = side === 0 ? ['A', 'B'] as const : ['B', 'A'] as const;
  const rank = x?.[`rank${there}`];
  const rankHere = x?.[`rank${here}`];
  const mult = x?.[`mult${there}`];
  const multHere = x?.[`mult${here}`];
  return {
    rank,
    selected: x?.[`selected${there}`] ?? false,
    rankMove: rank !== undefined && rankHere !== undefined ? rank - rankHere : 0,
    mult,
    multDelta: mult !== undefined && multHere !== undefined ? mult - multHere : undefined,
  };
}

/** Rows selected in only one run of the pair get an edge marker. */
function selectionDiffClass(cmp: RunComparison, cardId: string, side: number): string {
  const x = cmp.cards.get(cardId);
  if (!x || x.selectedA === x.selectedB) return '';
  const selectedHere = side === 0 ? x.selectedA : x.selectedB;
  return selectedHere ? 'only-here' : 'only-there';
}

function rankPair(cmp: RunComparison, cardId: string): string {
  const x = cmp.cards.get(cardId);
  return `(#${x?.rankA ?? '–'} → #${x?.rankB ?? '–'})`;
}

// --- Display helpers -------------------------------------------------------

function cardLabel(cardId: string): string {
  const summary = dataset.value?.cards?.get(cardId);
  const word = summary && Object.values(summary.data).find((v) => typeof v === 'string' && v.length < 24);
  return word ? `${cardId} (${word})` : cardId;
}

const { isSkillTag = () => true, shortTag = (t: string) => t } = lpDiagnosticsInterpreters;

function skillTags(tags?: string[]): string[] {
  return (tags ?? []).filter((t) => isSkillTag(t)).map((t) => shortTag(t));
}

const fmtMult = (m?: number) => (m === undefined || Number.isNaN(m) ? '' : m.toFixed(2));
const fmtTime = (iso: string) => new Date(iso).toLocaleString();

/** The reason minus its "ELO distance N (card: …, user: …)" lead, which the columns already show. */
function shortReason(reason?: string): string {
  if (!reason) return '';
  return reason.replace(/^ELO distance \d+ \(card: -?\d+, user: -?\d+\),?\s*/, '').replace(/\s*→ [\d.]+x$/, '') || 'global';
}

function eloSummary(r: ReadonlyRunResult) {
  const readings = (r.report?.cards ?? []).map((c) => ({ c, e: eloDistanceOf(c.provenance) }));
  const withElo = readings.filter((x) => x.e && !Number.isNaN(x.e.multiplier));
  const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '–');
  return {
    cards: withElo.length,
    mean: mean(withElo.map((x) => x.e!.multiplier)),
    meanSelected: mean(withElo.filter((x) => x.c.selected).map((x) => x.e!.multiplier)),
    tagRead: withElo.filter((x) => x.e!.sharedTags > 0).length,
  };
}

// --- Click-to-copy text ----------------------------------------------------

function runText(r: ReadonlyRunResult): string {
  const lines = [
    `Read-only pipeline run ${r.id} for ${r.username}: ${r.tagAwareElo ? 'tag-aware' : 'global'} ELO distance, ` +
      `limit ${r.limit}, learner ELO ${Math.round(r.learnerElo)}, data as of ${r.dataAsOf}, ran ${r.ranAt}`,
  ];
  if (r.hints) lines.push(`hints: ${JSON.stringify(r.hints)}`);
  const rep = r.report;
  if (!rep) {
    lines.push('(no run report captured)');
    return lines.join('\n');
  }
  const s = eloSummary(r);
  lines.push(
    `${rep.generatedCount} generated → ${rep.finalCount} selected (${rep.newSelected} new, ${rep.reviewsSelected} review)` +
      (rep.discardedTail ? `; ${rep.discardedTail.count} more dropped` : ''),
    `ELO distance over ${s.cards} retained cards: mean x${s.mean}, selected x${s.meanSelected}` +
      (r.tagAwareElo ? `; tag-read ${s.tagRead}, global fallback ${s.cards - s.tagRead}` : ''),
    `filters: ${rep.filters.map((f) => `${f.name} +${f.boosted} -${f.penalized} x${f.removed}`).join('; ')}`,
    `suppressed writes: ${r.writes.map((w) => `${w.method}(${w.detail})`).join(', ') || 'none'}`,
    '',
    'sel | card | skills | origin | source | score | eloDist x | eloDist reason',
  );
  for (const c of rep.cards) {
    const e = eloDistanceOf(c.provenance);
    lines.push(
      [
        c.selected ? '*' : ' ',
        cardLabel(c.cardId),
        skillTags(c.tags).join(' '),
        c.origin,
        c.required ? `required: ${c.required}` : (c.generator ?? ''),
        c.finalScore.toFixed(3),
        fmtMult(e?.multiplier),
        e?.reason ?? '',
      ].join(' | '),
    );
  }
  return lines.join('\n');
}

function comparisonText(cmp: RunComparison): string {
  const label = (id: string) => `${cardLabel(id)} ${rankPair(cmp, id)}`;
  const mv = (id: string) => {
    const x = cmp.cards.get(id)!;
    return `${cardLabel(id)} x${fmtMult(x.multA)} -> x${fmtMult(x.multB)}`;
  };
  return [
    `Comparison, A = global ELO distance, B = tag-aware (ranks by final score among retained cards, A -> B):`,
    `selection overlap ${Math.round(cmp.overlap * 100)}%: ${cmp.kept.length} in both, ` +
      `${cmp.entered.length} tag-aware only, ${cmp.left.length} global only`,
    `tag-aware only: ${cmp.entered.map(label).join(', ') || 'none'}`,
    `global only: ${cmp.left.map(label).join(', ') || 'none'}`,
    `biggest ELO-distance multiplier moves: ${cmp.movers.slice(0, 8).map(mv).join(', ') || 'none'}`,
    `filter impact (global -> tag-aware; cards changed = retained-in-both cards whose action differs):`,
    ...cmp.filters.map((f) => `  ${f.name}: ${fmtImpact(f.a)} -> ${fmtImpact(f.b)}; cards changed ${f.changedActions}`),
    `skills (selected global -> tag-aware; mean ELO multiplier over n cards retained in both):`,
    ...cmp.tags.map(
      (t) =>
        `  ${shortTag(t.tag)}: selected ${t.selectedA} -> ${t.selectedB}; ` +
        `x${fmtMult(t.meanMultA)} -> x${fmtMult(t.meanMultB)} (n=${t.shared})`,
    ),
  ].join('\n');
}

function entryText(e: RunEntry): string {
  const parts = e.runs.map(runText);
  if (e.cmp) parts.unshift(comparisonText(e.cmp));
  return parts.join('\n\n');
}

function allRunsText(): string {
  return entries.value.map(entryText).join('\n\n---\n\n');
}
</script>

<style scoped>
.run-table :deep(td) {
  vertical-align: top;
}
.card-id {
  font-family: monospace;
  font-size: 0.8rem;
}
.num {
  font-variant-numeric: tabular-nums;
}
.reason {
  max-width: 420px;
}
.run-table tbody tr {
  cursor: pointer;
}
.run-table tbody tr.link-hover :deep(td),
.chip-line .link-hover {
  background: rgba(var(--v-theme-primary), 0.12);
}
.run-table tbody tr.link-pinned :deep(td),
.chip-line .link-pinned {
  background: rgba(var(--v-theme-primary), 0.22);
}
.run-table tbody tr.only-here > td:first-child {
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-success));
}
.run-table tbody tr.only-there > td:first-child {
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-warning));
}
.chip-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}
.chip-line .v-chip {
  cursor: pointer;
}
.vs {
  white-space: nowrap;
}
.diff-table {
  max-height: 360px;
  overflow-y: auto;
}
</style>
