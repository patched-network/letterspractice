/**
 * Idle loop runner for the v2 vignette architecture.
 *
 * After the scripted intro sequence, this runs an open-ended practice loop:
 * - j attempts skills from a weighted pool (with in-session jitter smoothing)
 * - J independently cascades at expert jitter (with occasional variety)
 * - Drops trigger remediation sequences
 *
 * Both loops run concurrently and check isAborted() each iteration.
 *
 * @packageDocumentation
 */

import type { LetterInstance } from "../../letterpeople/types";
import type { JugglingController } from "../../letterpeople/transforms/juggling/types";
import type {
  VignetteStageConfig,
  SkillPoolEntry,
  SkillId,
  SkillParams,
} from "./types";
import type { RunnerActors, RunnerCallbacks } from "./runner";

import { drop } from "../../letterpeople/transforms/juggling/phrases/drop";
import { tossToSelf } from "../../letterpeople/transforms/juggling/phrases/tossToSelf";
import { arcPass } from "../../letterpeople/transforms/juggling/phrases/arcPass";
import { handoff } from "../../letterpeople/transforms/juggling/phrases/handoff";
import { oneHandedTossAndCatch } from "../../letterpeople/transforms/juggling/phrases/oneHandedTossAndCatch";
import { tossTo2HandedCatch } from "../../letterpeople/transforms/juggling/phrases/tossTo2HandedCatch";
import { pickUp } from "../../letterpeople/transforms/juggling/phrases/pickUp";
import { syncColumns, asyncColumns } from "../../letterpeople/transforms/juggling/phrases/syncColumns";
import { twoBallExchange } from "../../letterpeople/transforms/juggling/phrases/twoBallExchange";
import { twoBallContinuous } from "../../letterpeople/transforms/juggling/phrases/twoBallContinuous";
import {
  cascadePhrase,
  type CascadeController,
} from "../../letterpeople/transforms/juggling/phrases/cascadePhrase";
import {
  createPhysicsContext,
  addBall,
  removeAllBalls,
  startPhysicsLoop,
  placeBallInHand,
  getGazeTarget,
  sleep,
  type PhysicsContext,
  type PhysicsBall,
  type PhysicsLoop,
} from "../../letterpeople/transforms/juggling/phrases/physics-core";

// ── Abort-aware sleep ────────────────────────────────────────────────────

/**
 * Sleep up to `ms` milliseconds, polling `isAborted` so unmount-driven
 * cleanup isn't blocked behind a long timer. Without this, the J cascade
 * keeps ticking its physics RAF for up to ~12s after the vignette unmounts
 * (until the next isAborted check fires post-sleep), which produces stray
 * throwBall/catchBall log spam and stacks concurrent RAF loops when sessions
 * are completed in rapid succession.
 */
async function abortableSleep(ms: number, isAborted: () => boolean): Promise<void> {
  const endAt = Date.now() + ms;
  while (!isAborted()) {
    const remaining = endAt - Date.now();
    if (remaining <= 0) return;
    await sleep(Math.min(100, remaining));
  }
}

// ── Jitter smoothing ─────────────────────────────────────────────────────

/**
 * In-session jitter smoothing, attempt-based:
 *   effectiveReps = successes + 0.5 * (failures + remediations)
 *   jitter(rep) = jitterStart * (0.6 + 0.4 * exp(-effectiveReps * 0.4))
 *
 * Failures earn half credit so improvement slows but never freezes —
 * success-only counting could trap j in a drop-remediation loop where
 * jitter never decays. After ~4 effective reps, jitter is ~66% of start.
 */
function smoothedJitter(jitterStart: number, effectiveReps: number): number {
  return jitterStart * (0.6 + 0.4 * Math.exp(-effectiveReps * 0.4));
}

// ── Weighted random selection ────────────────────────────────────────────

function weightedPick(pool: SkillPoolEntry[]): SkillPoolEntry {
  const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return pool[pool.length - 1];
}

// ── Random variation helpers ─────────────────────────────────────────────

function randomHand(): "left" | "right" {
  return Math.random() < 0.5 ? "left" : "right";
}

function driftHeight(baseHeight: number): number {
  // ±10-15% random variation
  const drift = 1 + (Math.random() - 0.5) * 0.25;
  return Math.round(baseHeight * drift);
}

function randomPause(): number {
  // 300-800ms between attempts
  return 300 + Math.random() * 500;
}

// ── Guidance coordination ────────────────────────────────────────────────

/**
 * Shared state between j's practice loop and J's idle loop. When j drops the
 * same skill twice in a row, the practice loop posts a request; J's loop
 * pauses its own practice (gathering a cascade if needed), re-demos the skill
 * slowly, then clears the request and j retries.
 */
interface GuidanceState {
  request: { skill: SkillId; params: SkillParams } | null;
}

/** Consecutive drops before J steps in with a re-demo. */
const GUIDANCE_DROP_THRESHOLD = 2;

/**
 * Params for J's guidance/teaching demo: short, slow, near-perfect.
 * Guards against unbounded skills (cascade maxBeats 0 would never finish).
 */
function guidanceDemoParams(skill: SkillId, params: SkillParams): SkillParams {
  const p: SkillParams = { ...params };
  if ((skill === "cascade" || skill === "cascadeFlash") && !p.maxBeats) {
    p.maxBeats = 6;
  }
  if (p.count) p.count = Math.min(p.count, 2);
  return p;
}

// ── Persistent ball-set management ─────────────────────────────────────────

/** How many balls each skill juggles. */
const SKILL_BALL_COUNT: Partial<Record<SkillId, number>> = {
  handoff: 1,
  tossToSelf: 1,
  tossTo2HandedCatch: 1,
  arcPass: 1,
  arcPassEasy: 1,
  dropCatch: 1,
  oneHandedTossAndCatch: 1,
  syncColumns: 2,
  asyncColumns: 2,
  "2ballExchange": 2,
  "2ballContinuous": 2,
  cascade: 3,
  cascadeFlash: 3,
};

/**
 * 1-ball skills that can be performed with a SINGLE hand, leaving the other
 * free to hold a spare ball. The remaining 1-ball skills (handoff, arcPass,
 * dropCatch, tossTo2HandedCatch) inherently use both hands.
 */
const ONE_HANDED_CAPABLE = new Set<SkillId>([
  "tossToSelf",
  "oneHandedTossAndCatch",
]);

/** Ball colors for j's persistent set (primary, then spares). */
const PERSISTENT_BALL_COLORS = ["#3B82F6", "#EF4444", "#10B981"];

function skillBallCount(skill: SkillId): number {
  return SKILL_BALL_COUNT[skill] ?? 1;
}

function oppositeHandOf(h: "left" | "right"): "left" | "right" {
  return h === "left" ? "right" : "left";
}

/**
 * Whether a skill can run while j is holding `heldCount` balls. A skill uses
 * K balls; the remaining (heldCount − K) are spares that must be parked in a
 * hand the skill isn't using. A skill uses 2 hands unless it's a one-handed-
 * capable 1-ball skill. So: runnable iff it has enough balls AND spares ≤ free
 * hands. (At a 2-ball stage this keeps 2-ball tricks + one-handed 1-ball
 * callbacks, and drops both-hand 1-ball callbacks like handoff/arcPass.)
 */
function skillRunnable(skill: SkillId, heldCount: number): boolean {
  const k = skillBallCount(skill);
  if (k > heldCount) return false;
  const spares = heldCount - k;
  const handsUsed = k === 1 && ONE_HANDED_CAPABLE.has(skill) ? 1 : 2;
  return spares <= 2 - handsUsed;
}

// ── Skill execution ──────────────────────────────────────────────────────

async function executeIdleSkill(
  letter: LetterInstance,
  skillId: SkillId,
  params: SkillParams,
  jitter: { throwJitter: number; catchJitter: number },
  persistent?: {
    context: PhysicsContext;
    loop: PhysicsLoop;
    /** j's full persistent ball set (primary first, then spares). */
    balls: PhysicsBall[];
  },
): Promise<{ controller: JugglingController | null; dropped: boolean }> {
  const ballCount = skillBallCount(skillId);
  const primary = persistent?.balls[0];

  // Continue from the hand the primary ball is held in (avoids a teleport);
  // else random. (See the earlier "jumping hands" fix.)
  const heldHand =
    primary && primary.status === "held" ? primary.heldBy : null;
  const startHand = params.hand ?? params.from ?? heldHand ?? randomHand();
  const p = {
    ...params,
    throwJitter: jitter.throwJitter,
    catchJitter: jitter.catchJitter,
    jitter: jitter.throwJitter,
    hand: params.hand ?? startHand,
    from: params.from ?? startHand,
    height: params.height ? driftHeight(params.height) : undefined,
  };

  // Organic count variation (finite counts >= 2 only).
  if (typeof p.count === "number" && p.count >= 2) {
    p.count = Math.max(2, p.count + Math.floor(Math.random() * 4) - 1);
  }

  // Spares = persistent balls this skill doesn't use. For a 1-ball skill with
  // spares we force single-hand mode and park the spare in the off-hand
  // (skillRunnable() guarantees there's room). Multi-ball skills that run have
  // no spares, so they use the whole held set.
  const spareCount = persistent ? persistent.balls.length - ballCount : 0;
  const forceSingleHand = ballCount === 1 && spareCount > 0;

  // For single-ball skills: place the active ball in its hand and park any
  // spares in the off-hand so they're held clear of the working hand.
  if (persistent && ballCount === 1) {
    const activeHand = (p.hand ?? p.from ?? "left") as "left" | "right";
    if (persistent.balls[0].heldBy !== activeHand) {
      placeBallInHand(persistent.context, persistent.balls[0], activeHand);
    }
    const freeHand = oppositeHandOf(activeHand);
    for (let i = 1; i < persistent.balls.length; i++) {
      if (persistent.balls[i].heldBy !== freeHand) {
        placeBallInHand(persistent.context, persistent.balls[i], freeHand);
      }
    }
  }

  const reuseSingle = persistent
    ? {
        existingContext: persistent.context,
        existingLoop: persistent.loop,
        existingBall: persistent.balls[0],
      }
    : {};

  let controller: JugglingController | null = null;

  try {
    switch (skillId) {
      case "handoff":
        controller = await handoff(letter, {
          from: p.from ?? "left",
          count: p.count ?? 3,
          dwell: p.dwell,
          alternating: p.alternating ?? true,
          width: p.width,
          ...reuseSingle,
        });
        break;

      case "tossToSelf":
        controller = await tossToSelf(letter, {
          hand: p.hand ?? "left",
          height: p.height,
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          alternating: forceSingleHand ? false : (p.alternating ?? false),
          ...reuseSingle,
        });
        break;

      case "tossTo2HandedCatch":
        controller = await tossTo2HandedCatch(letter, {
          from: p.from ?? "left",
          height: p.height,
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          alternating: p.alternating ?? true,
          ...reuseSingle,
        });
        break;

      case "arcPass":
      case "arcPassEasy":
        controller = await arcPass(letter, {
          from: p.from ?? "left",
          height: p.height ?? (skillId === "arcPassEasy" ? 12 : 22),
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          alternating: p.alternating ?? true,
          ...reuseSingle,
        });
        break;

      case "dropCatch":
        controller = await drop(letter, {
          from: p.from ?? "left",
          height: p.height,
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          width: p.width,
          ...reuseSingle,
        });
        break;

      case "oneHandedTossAndCatch":
        controller = await oneHandedTossAndCatch(letter, {
          hand: p.hand ?? "right",
          height: p.height,
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          offset: p.offset ?? 0.25,
          alternating: forceSingleHand ? false : (p.alternating ?? true),
          ...reuseSingle,
        });
        break;

      case "syncColumns":
      case "asyncColumns": {
        const opts = {
          height: p.height ?? 20,
          count: p.count ?? 3,
          dwell: p.dwell,
          throwJitter: p.throwJitter ?? 0,
          catchJitter: p.catchJitter ?? 0,
        };
        if (persistent) {
          const [b0, b1] = persistent.balls;
          if (b0.heldBy !== "left") placeBallInHand(persistent.context, b0, "left");
          if (b1.heldBy !== "right") placeBallInHand(persistent.context, b1, "right");
          const multi = {
            ...opts,
            existingContext: persistent.context,
            existingLoop: persistent.loop,
            existingBalls: [b0, b1],
          };
          controller =
            skillId === "syncColumns"
              ? await syncColumns(letter, multi)
              : await asyncColumns(letter, { ...multi, offset: p.beatTiming ?? 0.5 });
        } else {
          controller =
            skillId === "syncColumns"
              ? await syncColumns(letter, opts)
              : await asyncColumns(letter, { ...opts, offset: p.beatTiming ?? 0.5 });
        }
        break;
      }

      case "2ballExchange":
      case "2ballContinuous": {
        const fromHand = (p.from ?? "left") as "left" | "right";
        const otherHand = oppositeHandOf(fromHand);
        const common = {
          height: p.height ?? 28,
          beatTiming: p.beatTiming ?? 0.55,
          throwJitter: p.throwJitter ?? 0,
          catchJitter: p.catchJitter ?? 0,
          from: fromHand,
        };
        if (persistent) {
          const [b0, b1] = persistent.balls;
          if (b0.heldBy !== fromHand) placeBallInHand(persistent.context, b0, fromHand);
          if (b1.heldBy !== otherHand) placeBallInHand(persistent.context, b1, otherHand);
          const multi = {
            existingContext: persistent.context,
            existingLoop: persistent.loop,
            existingBalls: [b0, b1],
          };
          controller =
            skillId === "2ballExchange"
              ? await twoBallExchange(letter, { ...common, count: p.count ?? 1, dwell: p.dwell, ...multi })
              : await twoBallContinuous(letter, { ...common, count: p.count ?? 4, ...multi });
        } else {
          controller =
            skillId === "2ballExchange"
              ? await twoBallExchange(letter, { ...common, count: p.count ?? 1, dwell: p.dwell })
              : await twoBallContinuous(letter, { ...common, count: p.count ?? 4 });
        }
        break;
      }

      case "cascade":
      case "cascadeFlash": {
        const maxBeats =
          skillId === "cascadeFlash"
            ? (p.maxBeats ?? 6)
            : (p.maxBeats && p.maxBeats > 0 ? p.maxBeats : 16);
        const cascadeOpts = {
          height: p.height ?? 42,
          throwJitter: p.throwJitter ?? 0,
          catchJitter: p.catchJitter ?? 0,
          beatTiming: p.beatTiming ?? 0.55,
          maxBeats,
        };
        if (persistent) {
          const [b0, b1, b2] = persistent.balls;
          if (b0.heldBy !== "left") placeBallInHand(persistent.context, b0, "left");
          if (b1.heldBy !== "right") placeBallInHand(persistent.context, b1, "right");
          if (b2 && b2.heldBy !== "left") placeBallInHand(persistent.context, b2, "left");
          controller = await cascadePhrase(letter, {
            ...cascadeOpts,
            existingContext: persistent.context,
            existingLoop: persistent.loop,
            existingBalls: [b0, b1, b2].filter(Boolean) as PhysicsBall[],
          });
        } else {
          controller = await cascadePhrase(letter, cascadeOpts);
        }
        break;
      }

      default:
        console.warn(`[IdleRunner] Unknown skill: ${skillId}`);
        return { controller: null, dropped: false };
    }

    // Wait for the phrase to finish ON ITS OWN — `completed`, not stop().
    if (controller) {
      await controller.completed;
    }
  } catch (e) {
    console.warn(`[IdleRunner] Skill "${skillId}" error:`, e);
  }

  // Balls are NEVER removed here — j's persistent set lives across the whole
  // idle loop. Grounded balls are recovered by the practice loop via pickUp.
  const dropped = (controller?.dropCount ?? 0) > 0;
  return { controller, dropped };
}

// ── Drop remediation ─────────────────────────────────────────────────────

/**
 * Recover any grounded balls in j's persistent set off the floor with an
 * animated pickUp. Reuses the persistent context/loop so the recovered ball
 * stays part of the set (never re-created). Each ball is fetched by the
 * nearer hand.
 */
async function recoverDrops(
  letter: LetterInstance,
  persistent: { context: PhysicsContext; loop: PhysicsLoop; balls: PhysicsBall[] },
  grounded: PhysicsBall[],
  isAborted: () => boolean,
): Promise<void> {
  const ctx = persistent.context;
  const midX =
    (ctx.hands.left.restPosition.x + ctx.hands.right.restPosition.x) / 2;
  for (const ball of grounded) {
    if (isAborted()) return;
    await sleep(300); // beat: j notices the dropped ball
    if (isAborted()) return;
    try {
      const ctrl = await pickUp(letter, {
        existingBall: ball,
        existingContext: ctx,
        existingLoop: persistent.loop,
        ballPosition: { x: ball.position.x, y: ball.position.y },
        hand: ball.position.x < midX ? "left" : "right",
      });
      await ctrl.completed;
    } catch (e) {
      console.warn("[IdleRunner] drop pickUp failed:", e);
    }
  }
}

// ── J's idle behavior ────────────────────────────────────────────────────

/**
 * Run J's guidance re-demo: slow, near-perfect demonstration of the skill
 * j is struggling with. Clears the request when done.
 */
async function runGuidanceDemo(
  J: LetterInstance,
  guidance: GuidanceState,
): Promise<void> {
  const req = guidance.request;
  if (!req) return;
  try {
    await executeIdleSkill(
      J,
      req.skill,
      guidanceDemoParams(req.skill, req.params),
      { throwJitter: 0.03, catchJitter: 0.03 },
    );
  } catch (e) {
    console.warn("[IdleRunner] Guidance demo error:", e);
  }
  guidance.request = null;
}

async function runJIdleLoop(
  J: LetterInstance,
  j: LetterInstance,
  config: VignetteStageConfig,
  isAborted: () => boolean,
  guidance: GuidanceState,
): Promise<void> {
  const behavior = config.jBehavior;

  if (behavior.mode === "watch") {
    // J watches j, stepping in with guidance demos when requested
    let gazeTick = 0;
    while (!isAborted()) {
      if (guidance.request) {
        await runGuidanceDemo(J, guidance);
        if (isAborted()) return;
        continue;
      }
      if (gazeTick % 8 === 0) {
        try {
          await J.eyes.lookAt(j.getCenter());
        } catch { /* ignore */ }
      }
      gazeTick++;
      await sleep(250);
      if (isAborted()) return;
    }
    return;
  }

  if (behavior.mode === "cascade") {
    const params = behavior.cascadeParams ?? { height: 45, jitter: 0.03 };
    let cascadeCtrl: CascadeController | null = null;

    while (!isAborted()) {
      try {
        // Start cascade
        cascadeCtrl = await cascadePhrase(J, {
          height: params.height ?? 45,
          throwJitter: params.throwJitter ?? params.jitter ?? 0.03,
          catchJitter: params.catchJitter ?? params.jitter ?? 0.03,
          beatTiming: params.beatTiming ?? 0.55,
          maxBeats: 0,
        });

        // Run for 5-12 seconds (abort-aware so unmount tears down the
        // cascade's physics loop promptly instead of after up to 12s).
        // Also interruptible by a guidance request from j's practice loop.
        const duration = 5000 + Math.random() * 7000;
        await abortableSleep(
          duration,
          () => isAborted() || guidance.request !== null,
        );

        if (isAborted()) {
          cascadeCtrl.destroy();
          return;
        }

        // Gather and stop — either for natural variety, or to free J's hands
        // for a guidance demo. Race against abort so a mid-gather unmount
        // doesn't keep the physics loop ticking while balls are caught.
        try {
          await Promise.race([
            cascadeCtrl.gatherAndStop(),
            abortableSleep(Number.POSITIVE_INFINITY, isAborted),
          ]);
        } catch {
          cascadeCtrl.destroy();
        }
        if (isAborted()) {
          cascadeCtrl.destroy();
          return;
        }
        cascadeCtrl = null;

        // j is struggling — J re-demos the skill before resuming his cascade
        if (guidance.request) {
          await runGuidanceDemo(J, guidance);
          if (isAborted()) return;
        }

        // Brief pause before restarting (abort-aware for the same reason)
        await abortableSleep(800 + Math.random() * 1200, isAborted);
      } catch (e) {
        console.warn("[IdleRunner] J cascade error:", e);
        if (cascadeCtrl) {
          try { cascadeCtrl.destroy(); } catch { /* ignore */ }
          cascadeCtrl = null;
        }
        await sleep(1000);
      }
    }

    // Cleanup on exit (cast needed: TS narrows to `never` after the while loop)
    const finalCtrl = cascadeCtrl as unknown as CascadeController | null;
    if (finalCtrl) {
      try { finalCtrl.destroy(); } catch { /* ignore */ }
    }
    return;
  }
}

// ── Main idle loop ───────────────────────────────────────────────────────

/**
 * Run the idle practice loop.
 *
 * j attempts skills from a weighted pool with jitter that smooths over
 * successful reps. J independently cascades (or watches). Both loops
 * run concurrently until the component unmounts (isAborted returns true).
 */
export async function runIdleLoop(
  config: VignetteStageConfig,
  actors: RunnerActors,
  callbacks: RunnerCallbacks,
  persistentJContext?: {
    context: PhysicsContext;
    loop: PhysicsLoop;
    ball: PhysicsBall;
  },
): Promise<void> {
  const { isAborted } = callbacks;
  const j = actors.littleJ.instance;
  const J = actors.bigJ.instance;

  // Persistent physics context for j — ball lives across all skill iterations
  const ownsJContext = !persistentJContext;
  const jCtx = persistentJContext?.context ?? createPhysicsContext(j);
  const jLoop = persistentJContext?.loop ?? startPhysicsLoop(jCtx, () => {});
  const jBall = persistentJContext?.ball ?? addBall(jCtx, "left" as const, "#3B82F6");

  if (ownsJContext) {
    jBall.element.style.opacity = "1";
  }

  // Size j's persistent ball set to what this stage juggles (the frontier ball
  // count). Created once and carried across the whole idle loop — no
  // create/destroy churn between multi-ball tricks. Spare balls start held in
  // alternating hands.
  const heldCount = config.skillPool.reduce(
    (max, e) => Math.max(max, skillBallCount(e.skill)),
    1,
  );
  const jBalls: PhysicsBall[] = [jBall];
  while (jBalls.length < heldCount) {
    const idx = jBalls.length;
    const extra = addBall(
      jCtx,
      idx % 2 === 0 ? "left" : "right",
      PERSISTENT_BALL_COLORS[idx % PERSISTENT_BALL_COLORS.length],
    );
    extra.element.style.opacity = "1";
    jBalls.push(extra);
  }

  const jPersistent = { context: jCtx, loop: jLoop, balls: jBalls };

  // Skills runnable given how many balls j holds. Others are filtered out — at
  // a 2-ball stage this keeps 2-ball tricks + one-handed 1-ball callbacks (the
  // spare parks in the off-hand) and drops both-hand 1-ball callbacks like
  // handoff/arcPass that have nowhere to park the spare.
  const runnablePool = config.skillPool.filter((e) =>
    skillRunnable(e.skill, heldCount),
  );
  const activePool = runnablePool.length ? runnablePool : config.skillPool;

  // Track effective reps per skill for jitter smoothing
  // (success = 1.0, failure = 0.5, completed remediation = 0.5)
  const repCounts: Partial<Record<SkillId, number>> = {};

  // Consecutive drops per skill — triggers J's guidance re-demo at threshold
  const consecutiveDrops: Partial<Record<SkillId, number>> = {};
  const guidance: GuidanceState = { request: null };

  // j watches its own ball. The phrases update getGazeTarget(jCtx) but never
  // move the eyes themselves — JugglingDebug.vue applies the gaze via a poll,
  // and the vignette has to do the same or j just stares blankly.
  //
  // getGazeTarget tracks the highest in-flight ball, falling back to a held
  // ball when none are airborne — so this also follows a HELD ball being
  // carried hand-to-hand (e.g. the handoff at stage 0). The only time we
  // suppress it is during a guidance re-demo, when j should watch J instead
  // (that gaze is driven by the practice loop's watch interval).
  const jGazePoll = setInterval(() => {
    if (isAborted() || guidance.request) return;
    const target = getGazeTarget(jCtx);
    if (target) {
      try {
        void j.eyes.lookAtPoint(target, { duration: 100 });
      } catch {
        /* ignore */
      }
    }
  }, 80);

  // J's idle loop (runs concurrently)
  const jIdlePromise = runJIdleLoop(J, j, config, isAborted, guidance);

  // j's practice loop
  const jPracticePromise = (async () => {
    // Lead with imitation: j's FIRST attempt is the frontier (newest) skill —
    // the one J just demonstrated in the intro — so j tries the new thing
    // promptly instead of waiting for the weighted-random pool to surface it.
    // The frontier is the pool entry at full weight (1.0); see derive.ts.
    const frontier =
      activePool.find((e) => e.weight >= 1) ??
      (activePool.length
        ? activePool.reduce((a, b) => (b.weight > a.weight ? b : a))
        : undefined);
    let leadWithFrontier = true;

    while (!isAborted()) {
      // 1. Skill selection — frontier first (imitation), then weighted-random,
      //    restricted to skills runnable with j's current ball count.
      const entry =
        leadWithFrontier && frontier ? frontier : weightedPick(activePool);
      leadWithFrontier = false;
      const repsForSkill = repCounts[entry.skill] ?? 0;

      // 2. Compute smoothed jitter
      const throwJ = smoothedJitter(entry.jitterStart.throw, repsForSkill);
      const catchJ = smoothedJitter(entry.jitterStart.catch, repsForSkill);

      // 3. Execute the skill
      const result = await executeIdleSkill(
        j,
        entry.skill,
        entry.params,
        { throwJitter: throwJ, catchJitter: catchJ },
        jPersistent,
      );

      if (isAborted()) break;

      // 4. Authoritative drop detection: phrases don't wire onBallGrounded on a
      //    borrowed context, so inspect j's persistent set directly.
      const grounded = jCtx.balls.filter(
        (b) => (b.status as string) === "grounded",
      );
      const dropped = grounded.length > 0 || result.dropped;

      if (dropped) {
        // Half credit — failed attempts still teach (see smoothedJitter)
        repCounts[entry.skill] = repsForSkill + 0.5;
        consecutiveDrops[entry.skill] = (consecutiveDrops[entry.skill] ?? 0) + 1;

        // J reacts to drop (supportive expression)
        if (config.jBehavior.reactions) {
          try {
            J.mouth.updateShape({ openness: 0.1, mood: 0.4 }, { duration: 300 });
          } catch { /* ignore */ }
        }

        // Recover the dropped ball(s) off the floor with an animated pickup.
        if (grounded.length > 0) {
          await recoverDrops(j, jPersistent, grounded, isAborted);
        }

        if (isAborted()) break;

        // J returns to neutral after the recovery
        if (config.jBehavior.reactions) {
          try {
            J.mouth.updateShape({ openness: 0, mood: 0.5 }, { duration: 300 });
          } catch { /* ignore */ }
        }

        // Guidance: repeated drops → J re-demos, j watches, then retries
        if (
          config.jBehavior.guidance !== false &&
          (consecutiveDrops[entry.skill] ?? 0) >= GUIDANCE_DROP_THRESHOLD &&
          guidance.request === null
        ) {
          guidance.request = { skill: entry.skill, params: entry.params };
          consecutiveDrops[entry.skill] = 0;

          // j's gaze tracks J during the demo
          const watchInterval = setInterval(() => {
            if (!isAborted()) {
              try { j.eyes.lookAt(J.getCenter()); } catch { /* ignore */ }
            }
          }, 150);

          // Wait for J's loop to pick up and finish the demo (bounded —
          // if J's loop is wedged, j just resumes practicing)
          const deadline = Date.now() + 20000;
          while (!isAborted() && guidance.request !== null && Date.now() < deadline) {
            await sleep(100);
          }
          clearInterval(watchInterval);
          guidance.request = null;
        }
      } else {
        // Success! Full credit, streak reset
        consecutiveDrops[entry.skill] = 0;
        repCounts[entry.skill] = repsForSkill + 1;

        // J reacts to success (smile)
        if (config.jBehavior.reactions) {
          try {
            J.mouth.updateShape({ openness: 0.3, mood: 1.0 }, { duration: 300 });
            // Brief smile, then reset
            sleep(600).then(() => {
              if (!isAborted()) {
                try {
                  J.mouth.updateShape({ openness: 0, mood: 0.5 }, { duration: 300 });
                } catch { /* ignore */ }
              }
            });
          } catch { /* ignore */ }
        }
      }

      if (isAborted()) break;

      // 5. Random pause between attempts (breathing room)
      await sleep(randomPause());
    }
  })();

  // Wait for both loops (they'll both exit when isAborted() returns true)
  await Promise.allSettled([jIdlePromise, jPracticePromise]);

  clearInterval(jGazePoll);

  // Clean up persistent context if we own it
  if (ownsJContext) {
    removeAllBalls(jCtx);
    jLoop.stop();
  }
}