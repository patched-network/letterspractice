/**
 * sessionMonitor — the poll-driven half of the /showHN annotation feed.
 *
 * `annotationFeed.ts` covers what happens *per response* (an observer hook).
 * This covers what happens *to the session*: pipeline runs, session-hint
 * changes, and the live state strip (queues, backlog pressure, replan status).
 *
 * ## Why polling, and why that's still observation
 *
 * There is no pipeline lifecycle event to subscribe to. `captureRun()` appends
 * to a module-level ring buffer at run *end*; nothing fires at kick-off. But
 * kick-off IS observable: `SessionController.getDebugSnapshot()` exposes
 * `replanActive` / `replanLabel` while a replan is in flight. So we poll the
 * snapshot and read edges off it. Every value rendered is still a read of real
 * state — we never infer a plan from, say, "the learner missed a card, so
 * a boost probably fired". That inference would be a claim, and the
 * whole view rests on not making claims. (See SPEC.md constraint 2.)
 *
 * The framework's own `SessionOverlay` polls the same snapshot at the same
 * cadence; we're using the data layer under it, not reimplementing it.
 *
 * ## Plan lifecycle, and the race in it
 *
 * A plan resolves from `pipelineDebugAPI.runs[0]`, which is the source of truth.
 * `replanActive` only drives the in-flight indicator. Three cases:
 *
 *   - Rising edge seen, then a new runId appears  → pending entry gets patched.
 *   - Replan completes inside one poll interval   → rising edge never observed;
 *     the new runId appends a resolved entry directly. No duplicate.
 *   - Replan completes with no captured run       → pending entry is resolved
 *     with a null report after {@link ORPHAN_PLAN_MS}, and renders as such.
 *
 * ## Curriculum-leakage (SPEC.md rule 2)
 *
 * `StrategyContribution` carries `strategyName` / `strategyId` whose values are
 * things like `"Interference: b/d/p confusion"` and
 * `"NAVIGATION_STRATEGY-interference-bdp"`. Those ARE the interference matrix.
 * We surface `strategy` (the implementing class — `elo`, `interferenceMitigator`,
 * `hierarchyDefinition`), `action`, and `score`: the mechanism, not the design
 * table. `summarizeCard` drops the other two fields at the boundary so they can
 * never reach a template by accident.
 *
 * Near-misses are capped at {@link NEAR_MISS_LIMIT}: `PipelineRunReport.cards`
 * retains the top 25 non-selected candidates, which together with the selected
 * batch would exceed rule 1's "~10-15 cards visible per run".
 */
import { ref, type Ref } from 'vue';
import {
  getActiveController,
  pipelineDebugAPI,
  type FilterImpact,
  type PipelineRunReport,
  type ReplanHints,
  type SrsBacklogDebug,
} from '@vue-skuilder/db';

/** Fast enough to catch most replan rising edges; cheap (one in-memory read). */
const POLL_MS = 180;

/** A pending plan with no captured run after this long is reported as unresolved. */
const ORPHAN_PLAN_MS = 1500;

/** Rule 1: keep the visible card slice small. */
const NEAR_MISS_LIMIT = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One strategy's contribution to a card's score. Design-identifying fields removed. */
export interface CardContribution {
  /** Implementing class: 'elo' | 'hierarchyDefinition' | 'interferenceMitigator' | … */
  strategy: string;
  action: 'generated' | 'passed' | 'boosted' | 'penalized';
  score: number;
}

export interface PlanCard {
  cardId: string;
  origin: 'new' | 'review' | 'unknown';
  finalScore: number;
  cardElo?: number;
  tags: string[];
  provenance: CardContribution[];
}

export interface PlanReport {
  runId: string;
  generatedCount: number;
  finalCount: number;
  newSelected: number;
  reviewsSelected: number;
  userElo?: number;
  generators: { name: string; cardCount: number; newCount: number; reviewCount: number; topScore: number }[];
  filters: FilterImpact[];
  discardedTail?: { count: number; note: string };
  selected: PlanCard[];
  nearMisses: PlanCard[];
}

export interface PlanEvent {
  kind: 'plan';
  id: string;
  at: number;
  /** Replan label from the requester, or null for the initial plan. */
  label: string | null;
  status: 'pending' | 'resolved';
  /** Null while pending, and null if the plan produced no captured run. */
  report: PlanReport | null;
}

/** A single tag's boost factor changing. `from`/`to` null = added/removed. */
export interface HintChange {
  tag: string;
  from: number | null;
  to: number | null;
}

export interface HintsEvent {
  kind: 'hints';
  id: string;
  at: number;
  changes: HintChange[];
}

export type MonitorEvent = PlanEvent | HintsEvent;

export interface SessionState {
  secondsRemaining: number;
  replanActive: boolean;
  replanLabel: string | null;
  hints: ReplanHints | null;
  backlog: SrsBacklogDebug[];
  supplyLength: number;
  failedLength: number;
}

export interface SessionMonitor {
  events: Ref<MonitorEvent[]>;
  state: Ref<SessionState | null>;
  start: () => void;
  stop: () => void;
  /** Clear the log and re-baseline against the current run history. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function summarizeCard(card: PipelineRunReport['cards'][number]): PlanCard {
  return {
    cardId: card.cardId,
    origin: card.origin,
    finalScore: card.finalScore,
    cardElo: card.cardElo,
    tags: card.tags ?? [],
    // Design-identifying fields (`strategyName`, `strategyId`) dropped here, at
    // the boundary — see the leakage note in this file's header.
    provenance: card.provenance.map((p) => ({
      strategy: p.strategy,
      action: p.action,
      score: p.score,
    })),
  };
}

function summarizeRun(run: PipelineRunReport): PlanReport {
  const selected = run.cards.filter((c) => c.selected).map(summarizeCard);
  const nearMisses = run.cards
    .filter((c) => !c.selected)
    .slice(0, NEAR_MISS_LIMIT)
    .map(summarizeCard);

  return {
    runId: run.runId,
    generatedCount: run.generatedCount,
    finalCount: run.finalCount,
    newSelected: run.newSelected,
    reviewsSelected: run.reviewsSelected,
    userElo: run.userElo,
    generators: (run.generators ?? []).map((g) => ({
      name: g.name,
      cardCount: g.cardCount,
      newCount: g.newCount,
      reviewCount: g.reviewCount,
      topScore: g.topScore,
    })),
    filters: run.filters,
    discardedTail: run.discardedTail
      ? { count: run.discardedTail.count, note: run.discardedTail.note }
      : undefined,
    selected,
    nearMisses,
  };
}

/** Boost-tag diff between two snapshots of the session-durable hints. */
function diffBoosts(prev: ReplanHints | null, next: ReplanHints | null): HintChange[] {
  const before = prev?.boostTags ?? {};
  const after = next?.boostTags ?? {};
  const changes: HintChange[] = [];

  for (const tag of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const from = before[tag] ?? null;
    const to = after[tag] ?? null;
    if (from !== to) changes.push({ tag, from, to });
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------

export function createSessionMonitor(): SessionMonitor {
  const events = ref<MonitorEvent[]>([]);
  const state = ref<SessionState | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;
  let seq = 0;

  let lastRunId: string | null = null;
  let prevReplanActive = false;
  let prevHints: ReplanHints | null = null;
  let pendingPlanId: string | null = null;
  let pendingSince = 0;

  const push = (e: MonitorEvent) => {
    events.value = [...events.value, e];
  };

  const resolvePlan = (id: string, report: PlanReport | null) => {
    events.value = events.value.map((e) =>
      e.kind === 'plan' && e.id === id ? { ...e, status: 'resolved' as const, report } : e
    );
  };

  /** Baseline against existing history so runs from an earlier session aren't replayed. */
  const baseline = () => {
    lastRunId = pipelineDebugAPI.runs[0]?.runId ?? null;
    prevReplanActive = false;
    prevHints = null;
    pendingPlanId = null;
  };

  function tick() {
    const snapshot = getActiveController()?.getDebugSnapshot();
    if (!snapshot) return; // No live controller — session not started, or ended.

    state.value = {
      secondsRemaining: snapshot.secondsRemaining,
      replanActive: snapshot.replanActive,
      replanLabel: snapshot.replanLabel,
      hints: snapshot.sessionHints,
      backlog: snapshot.reviewBacklog,
      supplyLength: snapshot.supplyQ.length,
      failedLength: snapshot.failedQ.length,
    };

    // 1. Resolve from run history first — it is the source of truth. Doing this
    //    before the rising-edge check is what prevents a replan that completes
    //    inside one poll interval from producing a duplicate entry.
    const top = pipelineDebugAPI.runs[0];
    if (top && top.runId !== lastRunId) {
      lastRunId = top.runId;
      const report = summarizeRun(top);
      if (pendingPlanId) {
        resolvePlan(pendingPlanId, report);
        pendingPlanId = null;
      } else {
        push({
          kind: 'plan',
          id: `plan-${seq++}`,
          at: top.timestamp.getTime(),
          label: top.hints?._label ?? null,
          status: 'resolved',
          report,
        });
      }
    }

    // 2. Rising edge → an in-flight plan we can show immediately.
    if (snapshot.replanActive && !prevReplanActive && !pendingPlanId) {
      const id = `plan-${seq++}`;
      pendingPlanId = id;
      pendingSince = Date.now();
      push({ kind: 'plan', id, at: pendingSince, label: snapshot.replanLabel, status: 'pending', report: null });
    }
    prevReplanActive = snapshot.replanActive;

    // 3. A plan whose replan finished but never produced a captured run. Report
    //    it as unresolved rather than leaving a spinner running forever.
    if (pendingPlanId && !snapshot.replanActive && Date.now() - pendingSince > ORPHAN_PLAN_MS) {
      resolvePlan(pendingPlanId, null);
      pendingPlanId = null;
    }

    // 4. Session-hint changes. The first tick emits the session's opening hints
    //    (from `initHints`), which is worth seeing.
    const changes = diffBoosts(prevHints, snapshot.sessionHints);
    if (changes.length > 0) {
      push({ kind: 'hints', id: `hints-${seq++}`, at: Date.now(), changes });
    }
    prevHints = snapshot.sessionHints
      ? { ...snapshot.sessionHints, boostTags: { ...snapshot.sessionHints.boostTags } }
      : null;
  }

  return {
    events,
    state,
    start: () => {
      if (timer) return;
      baseline();
      timer = setInterval(tick, POLL_MS);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
    reset: () => {
      events.value = [];
      state.value = null;
      seq = 0;
      baseline();
    },
  };
}
