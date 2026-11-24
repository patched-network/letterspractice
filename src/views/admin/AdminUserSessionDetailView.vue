<template>
  <v-container fluid style="max-width: 1400px">
    <v-row>
      <v-col cols="12" md="10" offset-md="1">
        <div class="d-flex align-center mb-4">
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-arrow-left"
            :to="{ name: 'AdminUserSessions', params: { username } }"
          >
            Back to sessions
          </v-btn>
          <v-spacer />
          <v-btn
            variant="text"
            size="small"
            :disabled="!detail"
            :prepend-icon="copiedKey === 'dump' ? 'mdi-check' : 'mdi-clipboard-text-outline'"
            :color="copiedKey === 'dump' ? 'success' : undefined"
            @click="copyText(buildSessionDump(), 'dump')"
          >
            {{ copiedKey === 'dump' ? 'Copied' : 'Copy for LLM' }}
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
          <h1 class="text-h4">Session</h1>
          <v-chip color="primary" variant="tonal" size="small">
            <v-icon start size="small">mdi-account</v-icon>
            <code>{{ username }}</code>
          </v-chip>
          <code class="text-caption text-medium-emphasis">{{ sessionId }}</code>
        </div>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable>
          {{ error }}
        </v-alert>

        <div v-if="loading" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <v-alert v-else-if="!detail" type="info" variant="tonal">
          No session record found for this id.
        </v-alert>

        <template v-else>
          <!-- Headline -->
          <div class="d-flex align-center flex-wrap mb-4" style="gap: 8px">
            <v-chip size="small" variant="flat" :color="statusColor(doc.status)">
              {{ doc.status }}
            </v-chip>
            <v-chip size="small" variant="tonal">
              {{ fmtTime(doc.startTime) }}
            </v-chip>
            <v-chip size="small" variant="tonal" color="grey">
              {{ clockText }}
            </v-chip>
            <v-chip
              v-for="f in detail.summary.flags"
              :key="f"
              size="small"
              variant="tonal"
              :color="SESSION_FLAG_META[f].color"
              :title="SESSION_FLAG_META[f].help"
            >
              <v-icon start size="small">{{ SESSION_FLAG_META[f].icon }}</v-icon>
              {{ SESSION_FLAG_META[f].label }}
            </v-chip>
          </div>

          <v-alert
            v-if="detail.responsesMissing"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            The session records {{ doc.tally?.responses }} responses but only
            {{ responseCount }} stamped card records were found. The timeline
            below is incomplete — records written without a
            <code>sessionId</code> can't be recovered.
          </v-alert>

          <v-row class="mb-2">
            <!-- State diff -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-3 h-100">
                <div class="text-subtitle-2 mb-1">Learner state</div>
                <div class="text-caption text-medium-emphasis mb-3">
                  What the navigator was choosing against, and what moved.
                </div>
                <v-table v-if="stateRows.length" density="compact" class="mini-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th class="text-right">Start</th>
                      <th class="text-right">End</th>
                      <th class="text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in stateRows" :key="row.label">
                      <td>{{ row.label }}</td>
                      <td class="text-right">{{ row.from ?? '—' }}</td>
                      <td class="text-right">{{ row.to ?? '—' }}</td>
                      <td class="text-right" :class="deltaClass(row.delta)">
                        {{ fmtDelta(row.delta) }}
                      </td>
                    </tr>
                  </tbody>
                </v-table>
                <div v-else class="text-caption text-disabled">
                  No state snapshot recorded.
                </div>
              </v-card>
            </v-col>

            <!-- Hints -->
            <v-col cols="12" md="6">
              <v-card variant="outlined" class="pa-3 h-100">
                <div class="text-subtitle-2 mb-1">Session hints</div>
                <div class="text-caption text-medium-emphasis mb-3">
                  The only visible record of what the outcome observers
                  (<code>conceptBackoff</code>, <code>introBackoff</code>;
                  <code>difficultyBooster</code> before 2026-10-29) actually
                  did — they act solely through these.
                </div>
                <div class="d-flex align-center">
                  <span class="text-caption font-weight-medium">at open</span>
                  <v-btn
                    :icon="copiedKey === 'hints-open' ? 'mdi-check' : 'mdi-content-copy'"
                    size="x-small"
                    variant="text"
                    :color="copiedKey === 'hints-open' ? 'success' : undefined"
                    class="ml-1"
                    title="Copy opening hints"
                    @click="copyText(fmtHints(doc.config?.initHints), 'hints-open')"
                  />
                </div>
                <pre class="hint-block">{{ fmtHints(doc.config?.initHints) }}</pre>
                <div class="d-flex align-center mt-2">
                  <span class="text-caption font-weight-medium">at close</span>
                  <v-btn
                    :icon="copiedKey === 'hints-close' ? 'mdi-check' : 'mdi-content-copy'"
                    size="x-small"
                    variant="text"
                    :color="copiedKey === 'hints-close' ? 'success' : undefined"
                    class="ml-1"
                    title="Copy closing hints"
                    @click="copyText(fmtHints(doc.finalHints), 'hints-close')"
                  />
                </div>
                <pre class="hint-block">{{ fmtHints(doc.finalHints) }}</pre>
              </v-card>
            </v-col>
          </v-row>

          <!-- Config strip -->
          <div class="text-caption text-medium-emphasis mb-4">
            batch limit {{ doc.config?.defaultBatchLimit ?? '?' }} ·
            {{ doc.config?.sourceCount ?? '?' }} source(s) · opening queues
            supply {{ doc.initialQueues?.supplyQ ?? '?' }} / failed
            {{ doc.initialQueues?.failedQ ?? '?' }}
            <template v-if="doc.tally">
              · ended with {{ doc.tally.failedQRemaining }} still in the failed
              queue
            </template>
          </div>

          <!-- Served tags -->
          <v-card v-if="servedTags.length" variant="outlined" class="pa-3 mb-4">
            <div class="text-subtitle-2 mb-1">Served tags</div>
            <div class="text-caption text-medium-emphasis mb-2">
              What this sitting actually put in front of the learner, rolled up by
              content tag. A response with several tags counts toward each.
            </div>
            <v-table density="compact" class="mini-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th class="text-right">Resp.</th>
                  <th class="text-right">Cards</th>
                  <th class="text-right">Accuracy</th>
                  <th class="text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in servedTags" :key="t.tag">
                  <td>
                    <code :class="t.tag.startsWith('gpc:') ? 'text-primary' : ''">{{ t.tag }}</code>
                  </td>
                  <td class="text-right">{{ t.responses }}</td>
                  <td class="text-right">{{ t.cards }}</td>
                  <td class="text-right" :class="accuracyClass(t.accuracy)">
                    <template v-if="t.accuracy === null">—</template>
                    <template v-else>
                      {{ Math.round(t.accuracy * 100) }}%
                      <span class="text-disabled">({{ t.correct }}/{{ t.correct + t.incorrect }})</span>
                    </template>
                  </td>
                  <td class="text-right">{{ (t.totalTimeMs / 1000).toFixed(1) }}s</td>
                </tr>
              </tbody>
            </v-table>
          </v-card>

          <!-- ELO ledger -->
          <v-card v-if="eloLedger" variant="outlined" class="pa-3 mb-4">
            <div class="text-subtitle-2 mb-1">ELO ledger</div>
            <div class="text-caption text-medium-emphasis mb-3">
              The per-response learner global-ELO exchanges that net to the
              session Δ above. Wins above the learner's level pay little; losses
              below it cost a lot — a high hit-rate can still net negative.
            </div>
            <div class="d-flex flex-wrap" style="gap: 20px">
              <div>
                <div class="text-caption text-medium-emphasis">net</div>
                <div class="text-h6" :class="deltaClass(eloLedger.net)">
                  {{ fmtDelta(eloLedger.net) }}
                </div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">
                  gained · {{ eloLedger.wins }} win(s)
                </div>
                <div class="text-h6 text-success">{{ fmtDelta(eloLedger.gained) }}</div>
                <div class="text-caption text-disabled">
                  avg {{ eloLedger.wins ? fmtDelta(eloLedger.gained / eloLedger.wins) : '—' }}/win
                </div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">
                  lost · {{ eloLedger.losses }} loss(es)
                </div>
                <div class="text-h6 text-error">{{ fmtDelta(eloLedger.lost) }}</div>
                <div class="text-caption text-disabled">
                  avg
                  {{ eloLedger.losses ? fmtDelta(eloLedger.lost / eloLedger.losses) : '—' }}/loss
                </div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">exchanges</div>
                <div class="text-h6">{{ eloLedger.count }}</div>
                <div class="text-caption text-disabled">
                  of {{ responseCount }} response(s)
                </div>
              </div>
            </div>
          </v-card>

          <!-- Timeline -->
          <div class="d-flex align-center flex-wrap mb-2" style="gap: 12px">
            <h2 class="text-h6">Timeline</h2>
            <v-btn-toggle
              v-model="show"
              density="compact"
              color="primary"
              variant="outlined"
            >
              <v-btn value="all" size="small">All ({{ detail.timeline.length }})</v-btn>
              <v-btn value="response" size="small">Responses ({{ responseCount }})</v-btn>
              <v-btn value="run" size="small">Runs ({{ runCount }})</v-btn>
            </v-btn-toggle>
          </div>

          <v-alert v-if="detail.timeline.length === 0" type="info" variant="tonal">
            Nothing recorded for this session.
          </v-alert>

          <div v-else class="timeline">
            <div
              v-for="(e, i) in visibleTimeline"
              :key="i"
              class="tl-row"
              :class="rowClass(e)"
            >
              <div class="tl-time text-caption text-disabled">{{ fmtClock(e.at) }}</div>
              <div class="tl-gutter">
                <v-icon size="small" :color="entryColor(e)">
                  {{ entryIcon(e) }}
                </v-icon>
              </div>

              <!-- Pipeline run -->
              <div v-if="e.kind === 'run'" class="tl-body">
                <div class="d-flex align-center flex-wrap" style="gap: 2px">
                  <span class="font-weight-medium">{{ e.label }}</span>
                  <v-chip v-if="e.mode" size="x-small" variant="tonal" class="ml-1">
                    {{ e.mode }}
                  </v-chip>
                  <span class="text-caption text-medium-emphasis ml-2">
                    generated {{ e.generatedCount }} → selected {{ e.finalCount }}
                    ({{ e.newSelected }} new, {{ e.reviewsSelected }} review)
                  </span>
                  <span
                    v-if="e.generatedCount > 0 && e.finalCount === 0"
                    class="text-caption text-error ml-2"
                  >
                    nothing survived
                  </span>
                  <v-chip
                    v-if="typeof e.userElo === 'number'"
                    size="x-small"
                    variant="tonal"
                    color="grey"
                    class="ml-2"
                  >
                    ELO {{ Math.round(e.userElo) }}
                  </v-chip>
                  <v-spacer />
                  <v-btn
                    v-if="runHasDetail(e)"
                    :icon="expandedRuns.has(e.runId) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                    size="x-small"
                    variant="text"
                    :title="expandedRuns.has(e.runId) ? 'Hide run detail' : 'Show run detail'"
                    @click="toggleRun(e.runId)"
                  />
                  <v-btn
                    :icon="copiedKey === 'run-' + e.runId ? 'mdi-check' : 'mdi-content-copy'"
                    size="x-small"
                    variant="text"
                    :color="copiedKey === 'run-' + e.runId ? 'success' : undefined"
                    title="Copy run detail"
                    @click="copyText(runDetailText(e), 'run-' + e.runId)"
                  />
                </div>

                <!-- Expanded run detail -->
                <div v-if="expandedRuns.has(e.runId)" class="run-detail mt-1">
                  <div v-if="e.generators?.length" class="mb-2">
                    <div class="text-caption font-weight-medium">generators</div>
                    <v-table density="compact" class="mini-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th class="text-right">cards</th>
                          <th class="text-right">new</th>
                          <th class="text-right">review</th>
                          <th class="text-right">top</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="g in e.generators" :key="g.name">
                          <td>{{ g.name }}</td>
                          <td class="text-right">{{ g.cardCount }}</td>
                          <td class="text-right">{{ g.newCount }}</td>
                          <td class="text-right">{{ g.reviewCount }}</td>
                          <td class="text-right">{{ g.topScore.toFixed(2) }}</td>
                        </tr>
                      </tbody>
                    </v-table>
                  </div>

                  <div v-if="e.filters?.length" class="mb-2">
                    <div class="text-caption font-weight-medium">filters</div>
                    <v-table density="compact" class="mini-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th class="text-right">boosted</th>
                          <th class="text-right">penalized</th>
                          <th class="text-right">passed</th>
                          <th class="text-right">removed</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="f in e.filters" :key="f.name">
                          <td>{{ f.name }}</td>
                          <td class="text-right">{{ f.boosted }}</td>
                          <td class="text-right">{{ f.penalized }}</td>
                          <td class="text-right">{{ f.passed }}</td>
                          <td class="text-right" :class="f.removed > 0 ? 'text-error' : ''">
                            {{ f.removed }}
                          </td>
                        </tr>
                      </tbody>
                    </v-table>
                  </div>

                  <div v-if="e.hints" class="mb-2">
                    <div class="text-caption font-weight-medium">hints</div>
                    <pre class="hint-block">{{ fmtHints(e.hints) }}</pre>
                  </div>

                  <div v-if="e.discardedTail" class="text-caption text-medium-emphasis">
                    discarded tail: {{ e.discardedTail.count }} cards
                    <template v-if="e.discardedTail.scoreRange">
                      · score [{{ e.discardedTail.scoreRange[0].toFixed(2) }},
                      {{ e.discardedTail.scoreRange[1].toFixed(2) }}]
                    </template>
                    <template v-if="e.discardedTail.eloRange">
                      · ELO [{{ Math.round(e.discardedTail.eloRange[0]) }},
                      {{ Math.round(e.discardedTail.eloRange[1]) }}]
                    </template>
                    <div v-if="e.discardedTail.note">{{ e.discardedTail.note }}</div>
                  </div>
                </div>
              </div>

              <!-- Card response -->
              <div v-else class="tl-body">
                <router-link
                  class="tl-card"
                  :to="{ name: 'AdminUserCards', params: { username }, query: { focus: e.cardId } }"
                  :title="`Open ${e.cardId} in card history`"
                >
                  {{ e.questionType ?? 'card' }}
                  <code class="text-caption">{{ shortId(e.cardId) }}</code>
                </router-link>
                <v-btn
                  :icon="copiedKey === 'card-' + e.cardId ? 'mdi-check' : 'mdi-content-copy'"
                  size="x-small"
                  variant="text"
                  :color="copiedKey === 'card-' + e.cardId ? 'success' : undefined"
                  class="ml-1"
                  title="Copy cardId"
                  @click="copyText(e.cardId, 'card-' + e.cardId)"
                />
                <v-chip
                  v-for="t in exerciseTags(e.tags)"
                  :key="t"
                  size="x-small"
                  variant="outlined"
                  color="primary"
                  class="ml-1"
                >
                  {{ t }}
                </v-chip>
                <span class="text-caption text-medium-emphasis ml-2">
                  {{ (e.timeSpentMs / 1000).toFixed(1) }}s
                  <template v-if="e.priorAttempts">
                    · attempt {{ e.priorAttempts + 1 }}
                  </template>
                </span>
                <span v-if="e.userAnswer != null" class="text-caption text-disabled ml-2">
                  “{{ fmtAnswer(e.userAnswer) }}”
                </span>

                <!-- ELO exchange for this response -->
                <template v-if="e.elo">
                  <v-chip
                    size="x-small"
                    variant="tonal"
                    :color="eloDeltaColor(e.elo.global.delta)"
                    class="ml-2"
                    :title="
                      `learner global ELO ${e.elo.global.before} → ${e.elo.global.after} ` +
                      `· userScore ${e.elo.userScore.toFixed(2)}`
                    "
                  >
                    ELO {{ fmtDelta(e.elo.global.delta) }}
                  </v-chip>
                  <v-chip
                    v-for="t in scoredTagDeltas(e.elo)"
                    :key="t.tag"
                    size="x-small"
                    variant="text"
                    :color="eloDeltaColor(t.delta)"
                    class="elo-tag-chip"
                    :title="`${t.tag}: ${t.before} → ${t.after} (score ${t.score?.toFixed(2)})`"
                  >
                    {{ shortTag(t.tag) }} {{ fmtDelta(t.delta) }}
                  </v-chip>
                </template>
              </div>
            </div>
          </div>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  fetchSessionDetail,
  summarizeServedTags,
  SESSION_FLAG_META,
  type SessionDetail,
  type SessionTimelineEntry,
  type ServedTagStat,
  type ResponseEloDelta,
} from '@/services/adminUsersService';
import { useClickToCopy } from './useClickToCopy';

const route = useRoute();
const username = ref<string>(String(route.params.username ?? ''));
const sessionId = ref<string>(String(route.params.sessionId ?? ''));

const loading = ref(true);
const error = ref<string | null>(null);
const detail = ref<SessionDetail | null>(null);
const show = ref<'all' | 'response' | 'run'>('all');

const doc = computed(() => detail.value!.summary.doc);

// --- Served-tag summary ----------------------------------------------------
const servedTags = computed<ServedTagStat[]>(() =>
  summarizeServedTags(detail.value?.timeline ?? []),
);

// --- ELO ledger ------------------------------------------------------------
// Decompose the session's net global-ELO move into wins/losses so an
// accuracy/ELO mismatch (many small wins, few big losses) is legible.
const eloLedger = computed(() => {
  const deltas = (detail.value?.timeline ?? [])
    .filter((e): e is Extract<SessionTimelineEntry, { kind: 'response' }> => e.kind === 'response')
    .map((e) => e.elo)
    .filter((d): d is ResponseEloDelta => !!d);
  if (deltas.length === 0) return null;
  let net = 0;
  let gained = 0;
  let lost = 0;
  let wins = 0;
  let losses = 0;
  for (const d of deltas) {
    const g = d.global.delta;
    net += g;
    if (g > 0) {
      gained += g;
      wins += 1;
    } else if (g < 0) {
      lost += g;
      losses += 1;
    }
  }
  return { count: deltas.length, net, gained, lost, wins, losses };
});

/** Vuetify color for an ELO delta chip. */
function eloDeltaColor(d: number): string | undefined {
  if (d > 0) return 'success';
  if (d < 0) return 'error';
  return 'grey';
}

/** Per-tag deltas worth showing inline: real (scored) exchanges only, capped. */
function scoredTagDeltas(
  elo: ResponseEloDelta,
): ResponseEloDelta['tags'] {
  return elo.tags.filter((t) => t.score !== null && t.delta !== 0).slice(0, 4);
}

/** Trim the `gpc:exercise:` noise so a tag delta chip stays compact. */
function shortTag(tag: string): string {
  return tag.replace(/^gpc:(exercise|expose|intro):/, '');
}

// --- Click-to-copy ---------------------------------------------------------
const { copiedKey, copyText } = useClickToCopy('sessionDetail');

/** Does this run carry any of the projected detail worth expanding/copying? */
function runHasDetail(e: Extract<SessionTimelineEntry, { kind: 'run' }>): boolean {
  return !!(
    typeof e.userElo === 'number' ||
    e.generators?.length ||
    e.filters?.length ||
    e.hints ||
    e.discardedTail
  );
}

// Which run rows are expanded (by runId).
const expandedRuns = ref<Set<string>>(new Set());
function toggleRun(runId: string): void {
  const next = new Set(expandedRuns.value);
  if (next.has(runId)) next.delete(runId);
  else next.add(runId);
  expandedRuns.value = next;
}

/** Compact one-run text block for per-run copy (and reused by the full dump). */
function runDetailText(e: Extract<SessionTimelineEntry, { kind: 'run' }>): string {
  const lines: string[] = [];
  lines.push(
    `RUN ${e.label}${e.mode ? ` [${e.mode}]` : ''} @ ${e.at}` +
      ` — generated ${e.generatedCount} → selected ${e.finalCount}` +
      ` (${e.newSelected} new, ${e.reviewsSelected} review)` +
      (e.generatedCount > 0 && e.finalCount === 0 ? '  ⚠ nothing survived' : ''),
  );
  if (typeof e.userElo === 'number') lines.push(`  userElo: ${Math.round(e.userElo)}`);
  if (e.generators?.length) {
    lines.push('  generators:');
    for (const g of e.generators) {
      lines.push(
        `    - ${g.name}: ${g.cardCount} cards (${g.newCount} new, ${g.reviewCount} review), topScore ${g.topScore.toFixed(2)}`,
      );
    }
  }
  if (e.filters?.length) {
    lines.push('  filters:');
    for (const f of e.filters) {
      lines.push(
        `    - ${f.name}: +${f.boosted} boosted, -${f.penalized} penalized, ${f.passed} passed, ${f.removed} removed`,
      );
    }
  }
  if (e.hints) lines.push(`  hints: ${JSON.stringify(e.hints)}`);
  if (e.discardedTail) {
    const t = e.discardedTail;
    lines.push(
      `  discardedTail: ${t.count} cards` +
        (t.scoreRange ? ` · score [${t.scoreRange[0].toFixed(2)}, ${t.scoreRange[1].toFixed(2)}]` : '') +
        (t.eloRange ? ` · elo [${Math.round(t.eloRange[0])}, ${Math.round(t.eloRange[1])}]` : ''),
    );
    if (t.note) lines.push(`    ${t.note}`);
  }
  return lines.join('\n');
}

/**
 * Full session as LLM-pasteable plain text, led by a legend so a run's
 * numbers are interpretable without this UI. Rebuilt on demand (copy click).
 */
function buildSessionDump(): string {
  const d = detail.value;
  if (!d) return '';
  const s = d.summary;
  const doc = s.doc;
  const L: string[] = [];

  L.push(`# Study session ${sessionId.value} — user ${username.value}`);
  L.push('');
  L.push('## Legend');
  L.push('- The TIMELINE is one time-ordered stream: RUN lines are pipeline (re)plans;');
  L.push('  the lines between them are card responses in the order presented.');
  L.push('- RUN "generated N → selected M (a new, b review)": the pipeline produced N');
  L.push('  candidates and chose M for the queue. "nothing survived" = generated>0 but');
  L.push('  0 selected (filters removed everything). Bootstrap runs fire before card #1,');
  L.push('  so they legitimately sit at the top; replans are interleaved by timestamp.');
  L.push('- generators: each source\'s contribution. filters: how each filter reshaped');
  L.push('  scores (boosted/penalized/passed/removed). hints: the ReplanHints the');
  L.push('  navigator was told (_label = replan reason). userElo: learner global ELO then.');
  L.push('- RESP "✓/✗ type <cardId> [tags] Ts (attempt k) \'answer\'": one presentation +');
  L.push('  outcome. ✓ correct, ✗ incorrect, · ungraded. attempt k = kth try on that card.');
  L.push('  A trailing "ELO g:before→after (Δ) | tag:Δ …" is the learner global + per-tag');
  L.push('  exchange that response produced. Only first attempts move ELO; retries show none.');
  L.push('- Flags/state-diff match the on-screen chips and Learner-state table.');
  L.push('');

  L.push('## Headline');
  L.push(`- status: ${doc.status}`);
  L.push(`- start: ${doc.startTime}${doc.endTime ? ` · end: ${doc.endTime}` : ''}`);
  L.push(
    `- clock: ${s.durationSeconds ?? '—'}s of ${doc.plannedSeconds}s planned` +
      (doc.tally ? ` · ${doc.tally.secondsRemaining}s remaining` : ''),
  );
  if (doc.tally) {
    L.push(
      `- tally: ${doc.tally.cardsPresented} cards, ${doc.tally.responses} responses` +
        ` (${doc.tally.correct} correct / ${doc.tally.incorrect} incorrect)` +
        ` · failedQ remaining ${doc.tally.failedQRemaining}`,
    );
  }
  L.push(`- flags: ${s.flags.length ? s.flags.join(', ') : 'none'}`);
  L.push(
    `- config: batchLimit ${doc.config?.defaultBatchLimit ?? '?'}, ${doc.config?.sourceCount ?? '?'} source(s)` +
      `, opening queues supply ${doc.initialQueues?.supplyQ ?? '?'} / failed ${doc.initialQueues?.failedQ ?? '?'}`,
  );
  if (d.responsesMissing) {
    L.push(
      `- ⚠ responsesMissing: tally claims ${doc.tally?.responses} responses but only` +
        ` ${responseCount.value} stamped records were recovered.`,
    );
  }
  L.push('');

  // Learner state diff
  if (stateRows.value.length) {
    L.push('## Learner state (start → end, Δ)');
    for (const r of stateRows.value) {
      L.push(`- ${r.label}: ${r.from ?? '—'} → ${r.to ?? '—'} (${fmtDelta(r.delta)})`);
    }
    L.push('');
  }

  // Hints
  L.push('## Session hints');
  L.push(`- at open: ${fmtHints(doc.config?.initHints)}`);
  L.push(`- at close: ${fmtHints(doc.finalHints)}`);
  L.push('');

  // Served tags
  if (servedTags.value.length) {
    L.push('## Served tags');
    for (const t of servedTags.value) {
      L.push(
        `- ${t.tag}: ${t.responses} resp / ${t.cards} card(s)` +
          `, acc ${t.accuracy === null ? 'n/a' : `${Math.round(t.accuracy * 100)}%`}` +
          ` (${t.correct}✓/${t.incorrect}✗), ${(t.totalTimeMs / 1000).toFixed(1)}s`,
      );
    }
    L.push('');
  }

  // ELO ledger
  if (eloLedger.value) {
    const led = eloLedger.value;
    L.push('## ELO ledger (learner global)');
    L.push(
      `- net ${fmtDelta(led.net)} across ${led.count} exchange(s)` +
        ` · gained ${fmtDelta(led.gained)} over ${led.wins} win(s)` +
        `${led.wins ? ` (avg ${fmtDelta(led.gained / led.wins)})` : ''}` +
        ` · lost ${fmtDelta(led.lost)} over ${led.losses} loss(es)` +
        `${led.losses ? ` (avg ${fmtDelta(led.lost / led.losses)})` : ''}`,
    );
    L.push('');
  }

  // Timeline
  L.push(`## Timeline (${d.timeline.length} entries)`);
  for (const e of d.timeline) {
    if (e.kind === 'run') {
      L.push(runDetailText(e));
    } else {
      const mark = e.isCorrect === true ? '✓' : e.isCorrect === false ? '✗' : '·';
      const tags = e.tags.length ? ` [${e.tags.join(', ')}]` : '';
      const attempt = e.priorAttempts ? ` (attempt ${e.priorAttempts + 1})` : '';
      const ans = e.userAnswer != null ? ` '${fmtAnswer(e.userAnswer)}'` : '';
      L.push(
        `RESP ${fmtClock(e.at)} ${mark} ${e.questionType ?? 'card'} ${e.cardId}${tags}` +
          ` — ${(e.timeSpentMs / 1000).toFixed(1)}s${attempt}${ans}${fmtEloForDump(e.elo)}`,
      );
    }
  }
  return L.join('\n');
}

const responseCount = computed(
  () => detail.value?.timeline.filter((e) => e.kind === 'response').length ?? 0,
);
const runCount = computed(
  () => detail.value?.timeline.filter((e) => e.kind === 'run').length ?? 0,
);

const visibleTimeline = computed(() => {
  const t = detail.value?.timeline ?? [];
  // `!show.value` covers v-btn-toggle's deselect (it clears the model).
  if (!show.value || show.value === 'all') return t;
  return t.filter((e) => e.kind === show.value);
});

/**
 * The state-diff table. Reads the LP-shaped snapshot (see
 * services/sessionSnapshot.ts) defensively — the framework stores it as an
 * open record, and a snapshot may be partial or absent entirely.
 */
const stateRows = computed(() => {
  const d = detail.value;
  if (!d) return [];
  const a = d.summary.doc.stateAtStart as Record<string, unknown> | undefined;
  const b = d.summary.doc.stateAtEnd as Record<string, unknown> | undefined;
  if (!a && !b) return [];

  const spec: Array<{ label: string; path: [string, string] }> = [
    { label: 'letters unlocked', path: ['progression', 'unlockedCount'] },
    { label: 'reachable words', path: ['progression', 'reachableWordCount'] },
    { label: 'WST letters', path: ['progression', 'wstProgressCount'] },
    { label: 'ELO', path: ['elo', 'score'] },
    { label: 'reviews due', path: ['reviews', 'dueCount'] },
    { label: 'reviews overdue', path: ['reviews', 'overdueCount'] },
    { label: 'max overdue (days)', path: ['reviews', 'maxOverdueDays'] },
    { label: 'lessons completed', path: ['lessons', 'completedCount'] },
  ];

  return spec
    .map(({ label, path }) => {
      const from = pick(a, path);
      const to = pick(b, path);
      return {
        label,
        from: fmtNum(from),
        to: fmtNum(to),
        delta: from !== null && to !== null ? to - from : null,
      };
    })
    .filter((r) => r.from !== null || r.to !== null);
});

function pick(
  snap: Record<string, unknown> | undefined,
  path: [string, string],
): number | null {
  if (!snap) return null;
  const outer = snap[path[0]];
  if (!outer || typeof outer !== 'object') return null;
  const v = (outer as Record<string, unknown>)[path[1]];
  return typeof v === 'number' ? v : null;
}

function fmtNum(n: number | null): string | null {
  if (n === null) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const clockText = computed(() => {
  const d = detail.value;
  if (!d) return '';
  const planned = fmtDuration(d.summary.doc.plannedSeconds);
  if (d.summary.durationSeconds === null) return `— of ${planned}`;
  return `${fmtDuration(d.summary.durationSeconds)} of ${planned}`;
});

// The three helpers below narrow the timeline union in script rather than in
// the template. Discriminating a union inside a `:class`/`:color` expression
// is exactly the shape vue-tsc handles least reliably across linked packages.
function entryIcon(e: SessionTimelineEntry): string {
  if (e.kind === 'run') return 'mdi-cog-refresh-outline';
  if (e.isCorrect === true) return 'mdi-check-circle-outline';
  if (e.isCorrect === false) return 'mdi-close-circle-outline';
  return 'mdi-circle-small';
}

function entryColor(e: SessionTimelineEntry): string {
  if (e.kind === 'run') return 'primary';
  if (e.isCorrect === true) return 'success';
  if (e.isCorrect === false) return 'error';
  return 'grey';
}

function rowClass(e: SessionTimelineEntry): string {
  if (e.kind === 'run') return 'tl-run';
  return e.isCorrect === false ? 'tl-fail' : '';
}

function statusColor(status: string): string {
  if (status === 'closed') return 'success';
  if (status === 'abandoned') return 'warning';
  return 'error';
}

function deltaClass(d: number | null): string {
  if (d === null || d === 0) return 'text-disabled';
  return d > 0 ? 'text-success' : 'text-error';
}

function accuracyClass(a: number | null): string {
  if (a === null) return 'text-disabled';
  if (a >= 0.8) return 'text-success';
  if (a < 0.5) return 'text-error';
  return '';
}

function fmtDelta(d: number | null): string {
  if (d === null) return '—';
  if (d === 0) return '0';
  const v = Number.isInteger(d) ? d : Number(d.toFixed(1));
  return v > 0 ? `+${v}` : String(v);
}

/** Content tags are noisy; the exercise/intro ones carry the pedagogic meaning. */
function exerciseTags(tags: string[]): string[] {
  return tags.filter((t) => t.startsWith('gpc:')).slice(0, 3);
}

/** Compact ELO suffix for a RESP dump line; '' when no exchange fired. */
function fmtEloForDump(elo: ResponseEloDelta | undefined): string {
  if (!elo) return '';
  const g = `ELO g:${elo.global.before}→${elo.global.after} (${fmtDelta(elo.global.delta)})`;
  const tagParts = scoredTagDeltas(elo).map((t) => `${shortTag(t.tag)}:${fmtDelta(t.delta)}`);
  const tail = tagParts.length ? ` | ${tagParts.join(' ')}` : '';
  return `  ${g}${tail}`;
}

function fmtHints(h: unknown): string {
  if (h === null || h === undefined) return 'none';
  try {
    return JSON.stringify(h, null, 2);
  } catch {
    return String(h);
  }
}

function shortId(id: string): string {
  return id.length > 28 ? `…${id.slice(-26)}` : id;
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Time-of-day only — the timeline is read as a within-sitting sequence. */
function fmtClock(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString(undefined, { hour12: false });
}

function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m${s % 60}s` : `${m}m`;
  return `${(m / 60).toFixed(1)}h`;
}

function fmtAnswer(a: unknown): string {
  if (a == null) return '';
  if (typeof a === 'string' || typeof a === 'number') return String(a);
  try {
    const s = JSON.stringify(a);
    return s.length > 40 ? `${s.slice(0, 40)}…` : s;
  } catch {
    return String(a);
  }
}

async function load(): Promise<void> {
  if (!username.value || !sessionId.value) {
    error.value = 'Missing username or session id in route.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    detail.value = await fetchSessionDetail(username.value, sessionId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    detail.value = null;
  } finally {
    loading.value = false;
  }
}

function reload(): void {
  void load();
}

watch(
  () => [route.params.username, route.params.sessionId],
  ([u, s]) => {
    username.value = String(u ?? '');
    sessionId.value = String(s ?? '');
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<style scoped>
.mini-table :deep(td),
.mini-table :deep(th) {
  font-size: 0.78rem;
}
.hint-block {
  font-size: 0.72rem;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 4px;
  padding: 6px 8px;
  margin: 0;
  max-height: 140px;
  overflow: auto;
  white-space: pre-wrap;
}
.timeline {
  border-left: 2px solid rgba(var(--v-theme-on-surface), 0.12);
  margin-left: 62px;
}
.tl-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 8px 3px 0;
  position: relative;
}
.tl-time {
  position: absolute;
  left: -62px;
  width: 56px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.tl-gutter {
  margin-left: -11px;
  background: rgb(var(--v-theme-surface));
  line-height: 1;
}
.tl-body {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
}
/* Runs are the navigator speaking; tint them so the learner's responses read
   as the foreground stream and replans as punctuation between them. */
.tl-run {
  background-color: rgba(var(--v-theme-primary), 0.05);
}
.tl-fail {
  background-color: rgba(var(--v-theme-error), 0.06);
}
.tl-card {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dotted rgba(var(--v-theme-on-surface), 0.3);
}
.tl-card:hover {
  color: rgb(var(--v-theme-primary));
}
.run-detail {
  border-left: 2px solid rgba(var(--v-theme-primary), 0.25);
  padding-left: 10px;
  margin-left: 2px;
}
.run-detail :deep(.mini-table td),
.run-detail :deep(.mini-table th) {
  font-size: 0.72rem;
}
/* Per-tag ELO deltas ride alongside the global chip; keep them light so the
   global move stays the emphasis. */
.elo-tag-chip {
  font-size: 0.68rem !important;
  padding-inline: 4px !important;
}
</style>
