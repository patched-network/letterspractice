/**
 * Session runner for juggling vignette choreography.
 *
 * Takes a VignetteSession, Stage + Actors, and runs each segment sequentially.
 * Maps SkillId → phrase function calls with the right parameters.
 * Handles demo vs practice vs review segment types, transition segments,
 * drop remediation loops, and in-session jitter smoothing.
 *
 * @packageDocumentation
 */

import type { Actor } from "../../letterpeople/scene/Stage";
import type { LetterInstance } from "../../letterpeople/types";
import type { JugglingController } from "../../letterpeople/transforms/juggling/types";
import type {
  VignetteSession,
  VignetteSegment,
  SkillId,
  SkillParams,
  SegmentActor,
} from "./types";

import { drop } from "../../letterpeople/transforms/juggling/phrases/drop";
import { tossToSelf } from "../../letterpeople/transforms/juggling/phrases/tossToSelf";
import { arcPass } from "../../letterpeople/transforms/juggling/phrases/arcPass";
import { handoff } from "../../letterpeople/transforms/juggling/phrases/handoff";
import { oneHandedTossAndCatch } from "../../letterpeople/transforms/juggling/phrases/oneHandedTossAndCatch";
import { tossTo2HandedCatch } from "../../letterpeople/transforms/juggling/phrases/tossTo2HandedCatch";
import { dropToFloor } from "../../letterpeople/transforms/juggling/phrases/dropToFloor";
import { pickUp } from "../../letterpeople/transforms/juggling/phrases/pickUp";
import {
  cascadePhrase,
  type CascadeController,
} from "../../letterpeople/transforms/juggling/phrases/cascadePhrase";
import { syncColumns, asyncColumns } from "../../letterpeople/transforms/juggling/phrases/syncColumns";
import { twoBallExchange } from "../../letterpeople/transforms/juggling/phrases/twoBallExchange";
import { twoBallContinuous } from "../../letterpeople/transforms/juggling/phrases/twoBallContinuous";
import {
  addBall,
  removeBall,
  createPhysicsContext,
  removeAllBalls,
  placeBallInHand,
  startPhysicsLoop,
  sleep,
  type PhysicsContext,
  type PhysicsLoop,
  type PhysicsBall,
  type Hand,
} from "../../letterpeople/transforms/juggling/phrases/physics-core";
import { characterize, startIdle } from "../../letterpeople/animations";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RunnerActors {
  /** Big J — the teacher (uppercase). */
  bigJ: Actor;
  /** Little j — the learner (lowercase). */
  littleJ: Actor;
}

export interface RunnerCallbacks {
  /** Show a caption overlay. Pass empty string to hide. */
  showCaption: (text: string) => void;
  /** Check if the animation has been aborted (component unmounted, etc). */
  isAborted: () => boolean;
}

/** Result of running a session. */
export interface SessionResult {
  /** Whether the session completed all segments. */
  completed: boolean;
  /** Whether the session was aborted early. */
  aborted: boolean;
  /** Number of segments executed (including partial). */
  segmentsRun: number;
  /** Total drops observed during practice segments. */
  totalDrops: number;
}

// ── In-session jitter smoothing ──────────────────────────────────────────────

/**
 * Compute smoothed jitter for a given rep within a practice segment.
 *
 * Formula: jitter(rep) = jitterStart * (0.6 + 0.4 * exp(-rep * 0.4))
 *
 * This means the jitter decays from jitterStart toward 60% of jitterStart
 * as reps increase. After ~4 successful reps, jitter is about 66% of start.
 */
function smoothedJitter(jitterStart: number, rep: number): number {
  return jitterStart * (0.6 + 0.4 * Math.exp(-rep * 0.4));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number, isAborted: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (isAborted()) {
      resolve();
      return;
    }
    const id = setTimeout(() => {
      resolve();
    }, ms);
    // If aborted during the delay, resolve immediately
    const check = setInterval(() => {
      if (isAborted()) {
        clearTimeout(id);
        clearInterval(check);
        resolve();
      }
    }, 50);
    // Clean up the check interval when the delay completes normally
    setTimeout(() => clearInterval(check), ms + 10);
  });
}

function resolveJitter(
  segment: VignetteSegment,
  rep: number,
): { throwJitter: number; catchJitter: number } {
  // For practice segments with jitterStart, use in-session smoothing
  if (segment.jitterStart) {
    return {
      throwJitter: smoothedJitter(segment.jitterStart.throw, rep),
      catchJitter: smoothedJitter(segment.jitterStart.catch, rep),
    };
  }

  // Otherwise use the params directly
  const p = segment.params ?? {};
  const throwJ = p.throwJitter ?? p.jitter ?? 0;
  const catchJ = p.catchJitter ?? p.jitter ?? 0;
  return { throwJitter: throwJ, catchJitter: catchJ };
}

function getActorLetter(
  actors: RunnerActors,
  segmentActor: SegmentActor,
): LetterInstance {
  // For "J", return bigJ's letter; for "j", "peer", or default, return littleJ
  if (segmentActor === "J") return actors.bigJ.instance;
  return actors.littleJ.instance;
}

// ── Skill execution ──────────────────────────────────────────────────────────

/**
 * Execute a single skill phrase on a letter instance.
 *
 * Returns the JugglingController so the caller can wait for it to finish,
 * and a boolean indicating whether a drop occurred.
 */
async function executeSkill(
  letter: LetterInstance,
  skillId: SkillId,
  params: SkillParams,
  jitterOverrides?: { throwJitter: number; catchJitter: number },
  isAborted?: () => boolean,
  persistent?: {
    context: PhysicsContext;
    loop: PhysicsLoop;
    ball: PhysicsBall;
  },
): Promise<{ controller: JugglingController | null; dropped: boolean }> {
  const p = { ...params };

  // Apply jitter overrides if provided (from smoothing or remediation)
  if (jitterOverrides) {
    p.throwJitter = jitterOverrides.throwJitter;
    p.catchJitter = jitterOverrides.catchJitter;
    // Also set the generic jitter to throw jitter as a fallback for
    // skills that only read `jitter`
    p.jitter = jitterOverrides.throwJitter;
  }

  // When a persistent context is supplied, single-ball phrases reuse its ball
  // so consecutive segments (e.g. a slow demo then a tempo demo) don't make the
  // ball vanish and reappear. Multi-ball phrases add their extra balls to the
  // same context and remove them afterwards, restoring the persistent ball.
  // (Mirrors idle-runner's executeIdleSkill.)
  const isMultiBall = [
    "syncColumns", "asyncColumns", "2ballExchange", "2ballContinuous", "cascade", "cascadeFlash",
  ].includes(skillId);

  if (persistent && !isMultiBall) {
    const targetHand = (p.hand ?? p.from ?? "left") as Hand;
    if (persistent.ball.heldBy !== targetHand) {
      placeBallInHand(persistent.context, persistent.ball, targetHand);
    }
  }

  const reuse = persistent
    ? {
        existingContext: persistent.context,
        existingLoop: persistent.loop,
        existingBall: persistent.ball,
      }
    : {};

  let controller: JugglingController | null = null;
  let extraBalls: PhysicsBall[] = [];

  try {
    switch (skillId) {
      case "handoff":
        controller = await handoff(letter, {
          from: p.from ?? p.hand ?? "left",
          count: p.count ?? 3,
          dwell: p.dwell,
          alternating: p.alternating ?? true,
          width: p.width,
          ...reuse,
        });
        break;

      case "tossToSelf":
        controller = await tossToSelf(letter, {
          hand: p.hand ?? p.from ?? "left",
          height: p.height,
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          alternating: p.alternating ?? false,
          ...reuse,
        });
        break;

      case "tossTo2HandedCatch":
        controller = await tossTo2HandedCatch(letter, {
          from: p.from ?? p.hand ?? "left",
          height: p.height,
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          alternating: p.alternating ?? true,
          ...reuse,
        });
        break;

      case "arcPass":
      case "arcPassEasy":
        // arcPassEasy uses the same phrase with lower height
        controller = await arcPass(letter, {
          from: p.from ?? p.hand ?? "left",
          height: p.height ?? (skillId === "arcPassEasy" ? 12 : 22),
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          alternating: p.alternating ?? true,
          ...reuse,
        });
        break;

      case "dropCatch":
        controller = await drop(letter, {
          from: p.from ?? p.hand ?? "left",
          height: p.height,
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          width: p.width,
          ...reuse,
        });
        break;

      case "oneHandedTossAndCatch":
        controller = await oneHandedTossAndCatch(letter, {
          hand: p.hand ?? p.from ?? "right",
          height: p.height,
          count: p.count ?? 3,
          dwell: p.dwell,
          jitter: p.jitter ?? p.throwJitter ?? 0,
          offset: p.offset ?? 0.25,
          alternating: p.alternating ?? true,
          ...reuse,
        });
        break;

      case "syncColumns":
      case "asyncColumns": {
        const opts = {
          height: p.height ?? 20,
          count: p.count ?? 3,
          dwell: p.dwell,
          throwJitter: p.throwJitter ?? p.jitter ?? 0,
          catchJitter: p.catchJitter ?? p.jitter ?? 0,
        };
        if (persistent) {
          const extraBall = addBall(persistent.context, "right", "#EF4444");
          extraBall.element.style.opacity = "1";
          extraBalls.push(extraBall);
          if (persistent.ball.heldBy !== "left") {
            placeBallInHand(persistent.context, persistent.ball, "left");
          }
          const multi = {
            ...opts,
            existingContext: persistent.context,
            existingLoop: persistent.loop,
            existingBalls: [persistent.ball, extraBall],
          };
          controller = skillId === "syncColumns"
            ? await syncColumns(letter, multi)
            : await asyncColumns(letter, { ...multi, offset: p.beatTiming ?? 0.5 });
        } else {
          controller = skillId === "syncColumns"
            ? await syncColumns(letter, opts)
            : await asyncColumns(letter, { ...opts, offset: p.beatTiming ?? 0.5 });
        }
        break;
      }

      case "2ballExchange":
      case "2ballContinuous": {
        const fromHand = (p.from ?? p.hand ?? "left") as Hand;
        const otherHand: Hand = fromHand === "left" ? "right" : "left";
        const common = {
          height: p.height ?? 28,
          beatTiming: p.beatTiming ?? 0.55,
          throwJitter: p.throwJitter ?? p.jitter ?? 0,
          catchJitter: p.catchJitter ?? p.jitter ?? 0,
          from: fromHand,
        };
        if (persistent) {
          const extraBall = addBall(persistent.context, otherHand, "#EF4444");
          extraBall.element.style.opacity = "1";
          extraBalls.push(extraBall);
          if (persistent.ball.heldBy !== fromHand) {
            placeBallInHand(persistent.context, persistent.ball, fromHand);
          }
          const multi = {
            existingContext: persistent.context,
            existingLoop: persistent.loop,
            existingBalls: [persistent.ball, extraBall],
          };
          controller = skillId === "2ballExchange"
            ? await twoBallExchange(letter, { ...common, count: p.count ?? 1, dwell: p.dwell, ...multi })
            : await twoBallContinuous(letter, { ...common, count: p.count ?? 4, ...multi });
        } else {
          controller = skillId === "2ballExchange"
            ? await twoBallExchange(letter, { ...common, count: p.count ?? 1, dwell: p.dwell })
            : await twoBallContinuous(letter, { ...common, count: p.count ?? 4 });
        }
        break;
      }

      case "cascade":
      case "cascadeFlash": {
        // Bounded so `await controller.completed` can't hang on an unbounded
        // (maxBeats 0) cascade demo. Timed showcases use executeSkillForDuration.
        const maxBeats = skillId === "cascadeFlash"
          ? (p.maxBeats ?? 6)
          : (p.maxBeats && p.maxBeats > 0 ? p.maxBeats : 16);
        if (persistent) {
          const extraBall1 = addBall(persistent.context, "right", "#EF4444");
          const extraBall2 = addBall(persistent.context, "left", "#10B981");
          extraBall1.element.style.opacity = "1";
          extraBall2.element.style.opacity = "1";
          extraBalls.push(extraBall1, extraBall2);
          if (persistent.ball.heldBy !== "left") {
            placeBallInHand(persistent.context, persistent.ball, "left");
          }
          controller = await cascadePhrase(letter, {
            height: p.height ?? 45,
            throwJitter: p.throwJitter ?? p.jitter ?? 0,
            catchJitter: p.catchJitter ?? p.jitter ?? 0,
            beatTiming: p.beatTiming ?? 0.55,
            maxBeats,
            existingContext: persistent.context,
            existingLoop: persistent.loop,
            existingBalls: [persistent.ball, extraBall1, extraBall2],
          });
        } else {
          controller = await cascadePhrase(letter, {
            height: p.height ?? 45,
            throwJitter: p.throwJitter ?? p.jitter ?? 0,
            catchJitter: p.catchJitter ?? p.jitter ?? 0,
            beatTiming: p.beatTiming ?? 0.55,
            maxBeats,
          });
        }
        break;
      }

      default: {
        const _exhaustive: never = skillId;
        console.warn(`[SessionRunner] Unknown skill: ${_exhaustive}`);
        return { controller: null, dropped: false };
      }
    }

    // Wait for the phrase to finish ON ITS OWN — do NOT call stop() here.
    // stop() requests early termination (sets the phrase's stopRequested flag),
    // which truncates a count-limited demo mid-first-rep: the owned ball is
    // removed in finish() right as it leaves the hand, so it never completes an
    // arc. `completed` resolves on natural completion without interrupting.
    if (controller) {
      await controller.completed;
    }
  } catch (e) {
    console.warn(`[SessionRunner] Skill "${skillId}" error:`, e);
  }

  // Clean up extra balls from multi-ball phrases; restore the persistent ball
  // to a held state so the next segment can reuse it.
  if (persistent && extraBalls.length > 0) {
    for (const extra of extraBalls) {
      removeBall(persistent.context, extra);
    }
    if (persistent.ball.status !== "held") {
      placeBallInHand(persistent.context, persistent.ball, "left");
    }
  }

  const dropped = (controller?.dropCount ?? 0) > 0;
  return { controller, dropped };
}

/**
 * Execute a skill for a timed duration (for showcase/cascade demos).
 * Starts the skill, waits for the specified duration, then stops it.
 */
async function executeSkillForDuration(
  letter: LetterInstance,
  skillId: SkillId,
  params: SkillParams,
  durationMs: number,
  isAborted: () => boolean,
): Promise<void> {
  const p = { ...params };

  // For cascade showcase, set count=0 (loop forever) and use maxBeats=0
  let controller: JugglingController | CascadeController | null = null;

  try {
    if (skillId === "cascade" || skillId === "cascadeFlash") {
      const cascadeCtrl = await cascadePhrase(letter, {
        height: p.height ?? 45,
        throwJitter: p.throwJitter ?? p.jitter ?? 0.03,
        catchJitter: p.catchJitter ?? p.jitter ?? 0.03,
        beatTiming: p.beatTiming ?? 0.55,
        maxBeats: 0, // loop forever
      });
      controller = cascadeCtrl;

      // Wait for the showcase duration
      await delay(durationMs, isAborted);

      if (!isAborted()) {
        // Gracefully gather and stop
        await (cascadeCtrl as CascadeController).gatherAndStop();
      } else {
        cascadeCtrl.destroy();
      }
    } else {
      // For non-cascade skills, set count=0 for infinite loop
      p.count = 0;
      const result = await executeSkill(letter, skillId, p);
      controller = result.controller;

      await delay(durationMs, isAborted);

      if (controller) {
        if (isAborted()) {
          controller.destroy();
        } else {
          await controller.stop();
        }
      }
    }
  } catch (e) {
    console.warn(`[SessionRunner] Timed skill "${skillId}" error:`, e);
    if (controller) {
      try {
        controller.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}

// ── Transition handling ──────────────────────────────────────────────────────

async function executeTransition(
  segment: VignetteSegment,
  actors: RunnerActors,
  callbacks: RunnerCallbacks,
  cascadeControllerRef: { current: CascadeController | null },
): Promise<void> {
  const { bigJ, littleJ } = actors;
  const { showCaption, isAborted } = callbacks;
  const J = bigJ.instance;
  const j = littleJ.instance;
  const durationMs = segment.durationMs ?? 1000;

  if (segment.caption) {
    showCaption(segment.caption);
  }

  switch (segment.action) {
    case "walkIn": {
      // j walks in from the right side of the stage
      littleJ.wrapper.style.opacity = "1";
      try {
        await littleJ.walkTo(
          littleJ.x, // target x (current position)
          littleJ.z, // target z
          durationMs,
        );
      } catch {
        // walkTo might not be available; fall back to a delay
        await delay(durationMs, isAborted);
      }
      break;
    }

    case "impressedReaction": {
      // j looks at J, opens mouth in awe
      await j.eyes.lookAt(J.getCenter());
      if (isAborted()) return;
      j.mouth.updateShape({ openness: 0.7, mood: 0.3 }, { duration: 300 });
      await delay(durationMs * 0.7, isAborted);
      if (isAborted()) return;
      j.mouth.updateShape({ openness: 0, mood: 0.5 }, { duration: 300 });
      await delay(durationMs * 0.3, isAborted);
      break;
    }

    case "gatherAndStop": {
      // Gather the active cascade controller if we have one
      if (cascadeControllerRef.current) {
        try {
          await cascadeControllerRef.current.gatherAndStop();
        } catch (e) {
          console.warn("[SessionRunner] gatherAndStop error:", e);
          cascadeControllerRef.current.destroy();
        }
        cascadeControllerRef.current = null;
      }
      await delay(Math.min(durationMs, 400), isAborted);
      break;
    }

    case "noticeAndSmile": {
      // J turns toward j, smiles
      await J.body.turnToward(j, { duration: 400 });
      if (isAborted()) return;
      await J.eyes.lookAt(j.getCenter());
      if (isAborted()) return;
      J.mouth.updateShape({ openness: 0.3, mood: 1.0 }, { duration: 300 });
      await delay(durationMs, isAborted);
      break;
    }

    case "dropToFloor": {
      // J drops N balls to the floor
      const count = segment.dropCount ?? 2;
      const hands = segment.dropHands ?? ["left", "right"];
      for (let i = 0; i < count && i < hands.length; i++) {
        if (isAborted()) return;
        try {
          const ctrl = await dropToFloor(J, {
            hand: hands[i],
            keepBallOnGround: false,
          });
          await ctrl.stop();
        } catch (e) {
          console.warn("[SessionRunner] dropToFloor error:", e);
        }
        await delay(300, isAborted);
      }
      break;
    }

    case "caption": {
      showCaption(segment.caption ?? "");
      await delay(durationMs, isAborted);
      break;
    }

    case "startWithBall": {
      // Interim workaround for tossToward: add a ball to j's hand
      const meta = segment.meta ?? {};
      const hand = (meta.hand as "left" | "right") ?? "left";
      const color = (meta.color as string) ?? "#3B82F6";
      try {
        await j.arms.show({ duration: 0 });
        const ctx = createPhysicsContext(j);
        const ball = addBall(ctx, hand, color, 4);
        ball.element.style.opacity = "1";
        // Start the loop briefly so the ball renders, then stop and clean up
        // (the subsequent handoff phrase will create its own context)
        const loop = startPhysicsLoop(ctx);
        await sleep(200);
        loop.stop();
        // Remove the physics context's ball — the visual element stays
        // Actually, we need to leave the ball in place.
        // The handoff phrase creates its own ball, so let's just clean up.
        removeAllBalls(ctx);
      } catch (e) {
        console.warn("[SessionRunner] startWithBall error:", e);
      }
      await delay(segment.durationMs ?? 300, isAborted);
      break;
    }

    case "celebrate":
    case "encouragement": {
      // Both characters smile
      J.mouth.updateShape({ openness: 0.3, mood: 1.0 }, { duration: 300 });
      j.mouth.updateShape({ openness: 0.3, mood: 1.0 }, { duration: 300 });
      await delay(durationMs * 0.6, isAborted);
      if (isAborted()) return;
      J.mouth.updateShape({ openness: 0, mood: 0.5 }, { duration: 300 });
      j.mouth.updateShape({ openness: 0, mood: 0.5 }, { duration: 300 });
      await delay(durationMs * 0.4, isAborted);
      break;
    }

    case "nod": {
      // J nods (small vertical bounce via wrapper)
      const wrapper = bigJ.wrapper;
      if (wrapper) {
        const origTransform = wrapper.style.transform || "";
        wrapper.style.transition = "transform 0.2s ease";
        wrapper.style.transform = origTransform + " translateY(-5px)";
        await delay(200, isAborted);
        if (isAborted()) return;
        wrapper.style.transform = origTransform;
        await delay(200, isAborted);
        wrapper.style.transition = "";
      }
      J.mouth.updateShape({ openness: 0.3, mood: 1.0 }, { duration: 300 });
      await delay(durationMs - 400, isAborted);
      break;
    }

    case "faceEachOther": {
      const mood = (segment.meta?.mood as number) ?? 0.8;
      await Promise.all([
        J.body.turnToward(j, { duration: 400 }),
        j.body.turnToward(J, { duration: 400 }),
      ]);
      if (isAborted()) return;
      await Promise.all([
        J.eyes.lookAt(j.getCenter()),
        j.eyes.lookAt(J.getCenter()),
      ]);
      if (isAborted()) return;
      J.mouth.updateShape({ openness: 0.2, mood }, { duration: 300 });
      j.mouth.updateShape({ openness: 0.2, mood }, { duration: 300 });
      await delay(durationMs, isAborted);
      break;
    }

    case "smile": {
      const actor = getActorLetter(actors, segment.actor);
      actor.mouth.updateShape({ openness: 0.2, mood: 1.0 }, { duration: 300 });
      await delay(durationMs, isAborted);
      break;
    }

    case "turnToward": {
      const target = segment.meta?.target;
      if (target === "j") {
        await J.body.turnToward(j, { duration: 400 });
        await J.eyes.lookAt(j.getCenter());
      } else if (target === "J") {
        await j.body.turnToward(J, { duration: 400 });
        await j.eyes.lookAt(J.getCenter());
      }
      await delay(durationMs, isAborted);
      break;
    }

    case "lookAt": {
      const target = segment.meta?.target;
      const actor = getActorLetter(actors, segment.actor);
      if (target === "J") {
        await actor.eyes.lookAt(J.getCenter());
      } else if (target === "j") {
        await actor.eyes.lookAt(j.getCenter());
      }
      await delay(durationMs, isAborted);
      break;
    }

    case "custom":
    default:
      // Generic delay for unrecognized transitions
      await delay(durationMs, isAborted);
      break;
  }

  // Clear caption after transition unless it's a caption-only transition
  if (segment.action !== "caption" && segment.caption) {
    // Leave caption visible — it will be overwritten by the next segment
  }
}

// ── Drop remediation ─────────────────────────────────────────────────────────

/**
 * Handle a drop event during a practice segment:
 * 1. Brief pause (j looks down at grounded ball)
 * 2. j does pickUp on the grounded ball
 * 3. j performs 1-2 reps of a prerequisite skill at reduced jitter as remediation
 * 4. Return so the caller can retry the original skill
 */
async function handleDrop(
  letter: LetterInstance,
  segment: VignetteSegment,
  callbacks: RunnerCallbacks,
): Promise<void> {
  const { isAborted } = callbacks;

  // 1. Brief pause
  await delay(400, isAborted);
  if (isAborted()) return;

  // 2. Pick up the ball
  try {
    const pickupCtrl = await pickUp(letter, {
      hand: segment.params?.hand ?? segment.params?.from ?? "left",
    });
    await pickupCtrl.stop();
  } catch (e) {
    console.warn("[SessionRunner] pickUp during remediation failed:", e);
    await delay(500, isAborted);
  }
  if (isAborted()) return;

  // 3. Perform 1-2 reps of the remediation skill
  if (segment.remediationSkill) {
    const remParams = segment.remediationParams ?? {};
    // Remediation uses lower jitter (more controlled)
    const remJitter = {
      throwJitter: (remParams.jitter ?? 0.15),
      catchJitter: (remParams.jitter ?? 0.15),
    };

    try {
      await executeSkill(
        letter,
        segment.remediationSkill,
        { ...remParams, count: remParams.count ?? 2 },
        remJitter,
        isAborted,
      );
    } catch (e) {
      console.warn("[SessionRunner] Remediation skill failed:", e);
    }
  }

  if (isAborted()) return;
  await delay(300, isAborted);
}

// ── Main runner ──────────────────────────────────────────────────────────────

/**
 * Run a vignette session — execute all segments sequentially.
 *
 * The session runner:
 * 1. Iterates through segments in order
 * 2. Maps SkillId → phrase function calls with appropriate parameters
 * 3. Handles demo vs practice vs review vs transition segment types
 * 4. For practice segments, applies in-session jitter smoothing
 * 5. Detects drops and runs remediation loops
 *
 * @param session - The session script to run
 * @param actors - The stage actors (bigJ + littleJ)
 * @param callbacks - Caption display and abort check functions
 * @returns Session result with completion stats
 */
export async function runSession(
  session: VignetteSession,
  actors: RunnerActors,
  callbacks: RunnerCallbacks,
): Promise<SessionResult> {
  const { bigJ, littleJ } = actors;
  const { showCaption, isAborted } = callbacks;
  const J = bigJ.instance;
  const j = littleJ.instance;

  let segmentsRun = 0;
  let totalDrops = 0;

  // Track the active cascade controller for gatherAndStop transitions
  const cascadeControllerRef: { current: CascadeController | null } = {
    current: null,
  };

  // Persistent physics context per actor, created lazily on first ball skill.
  // Reused across segments so a ball doesn't vanish/reappear between e.g. a slow
  // demo and the following tempo demo. Torn down in the finally block.
  type Persistent = { context: PhysicsContext; loop: PhysicsLoop; ball: PhysicsBall };
  const persistentByActor = new Map<"J" | "j", Persistent>();
  async function getPersistent(actor: "J" | "j", inst: LetterInstance): Promise<Persistent> {
    let holder = persistentByActor.get(actor);
    if (!holder) {
      await inst.arms.show({ duration: 0 });
      const context = createPhysicsContext(inst);
      const loop = startPhysicsLoop(context, () => {});
      const ball = addBall(context, "left", "#3B82F6");
      ball.element.style.opacity = "1";
      holder = { context, loop, ball };
      persistentByActor.set(actor, holder);
    }
    return holder;
  }

  // ── Characterize actors (eyes + mouth fade in) ───────────────────────
  try {
    await Promise.all([
      characterize(J, {
        duration: 400,
        showEyes: true,
        showMouth: true,
        showBrows: true,
      }),
      delay(200, isAborted).then(() =>
        characterize(j, {
          duration: 400,
          showEyes: true,
          showMouth: true,
          showBrows: true,
        }),
      ),
    ]);
  } catch {
    // characterize may not be available
  }
  if (isAborted()) return { completed: false, aborted: true, segmentsRun, totalDrops };

  // Start idle blinking
  let idleCleanupJ: (() => void) | null = null;
  let idleCleanupj: (() => void) | null = null;
  try {
    idleCleanupJ = startIdle(J, { blinkInterval: 3000 });
    idleCleanupj = startIdle(j, { blinkInterval: 3500 });
  } catch {
    // startIdle may not be available
  }

  // ── Run segments ─────────────────────────────────────────────────────
  try {
    for (const segment of session.segments) {
      if (isAborted()) break;

      // Show caption if present on any segment type
      if (segment.caption !== undefined) {
        showCaption(segment.caption);
      }

      switch (segment.type) {
        // ── DEMO / SHOWCASE: J performs, j watches ─────────────────────
        case "demo":
        case "showcase": {
          const letter = getActorLetter(actors, segment.actor);

          // j watches J during demos
          if (segment.actor === "J") {
            j.eyes.lookAt(J.getCenter()).catch(() => {});
          }

          if (segment.skill) {
            if (segment.durationMs && segment.durationMs > 0) {
              // Timed showcase (e.g. cascade for ~3 seconds)
              const skillParams = {
                ...segment.params,
                // Demos use near-zero jitter
                jitter: segment.params?.jitter ?? 0.03,
              };

              if (segment.skill === "cascade" || segment.skill === "cascadeFlash") {
                // Special handling: start cascade, store controller for gatherAndStop
                const ctrl = await cascadePhrase(letter, {
                  height: skillParams.height ?? 45,
                  throwJitter: skillParams.throwJitter ?? skillParams.jitter ?? 0.03,
                  catchJitter: skillParams.catchJitter ?? skillParams.jitter ?? 0.03,
                  beatTiming: skillParams.beatTiming ?? 0.55,
                  maxBeats: 0,
                });
                cascadeControllerRef.current = ctrl;

                // Wait for the showcase duration
                await delay(segment.durationMs, isAborted);

                // Don't stop here — a subsequent gatherAndStop transition will handle it
                // But if there's no such transition, clean up
                // We'll let the segment proceed; the cascade keeps running
              } else {
                await executeSkillForDuration(
                  letter,
                  segment.skill,
                  skillParams,
                  segment.durationMs,
                  isAborted,
                );
              }
            } else {
              // Untimed demo — runs to completion (count-limited). Reuse the
              // actor's persistent ball so consecutive demos don't blink it out.
              const persistent = await getPersistent(segment.actor === "J" ? "J" : "j", letter);
              await executeSkill(
                letter,
                segment.skill,
                { ...segment.params, jitter: segment.params?.jitter ?? 0.03 },
                undefined,
                isAborted,
                persistent,
              );
            }
          }
          break;
        }

        // ── PRACTICE: j performs with jitter smoothing + drop remediation ─
        case "practice": {
          if (!segment.skill) break;

          const letter = getActorLetter(actors, segment.actor);

          // For practice segments, we run the skill and check for drops
          // via the controller's dropCount property.
          //
          // NOTE: True per-rep jitter smoothing would require integrating
          // with the phrase's per-rep loop. For now, we apply the starting
          // jitter and rely on the phrase's count to limit reps.

          const jitter = resolveJitter(segment, 0);

          const persistent = await getPersistent(segment.actor === "J" ? "J" : "j", letter);
          const result = await executeSkill(
            letter,
            segment.skill,
            segment.params ?? {},
            jitter,
            isAborted,
            persistent,
          );

          if (isAborted()) break;

          // Detect drops via controller.dropCount
          if (result.dropped || (result.controller?.dropCount ?? 0) > 0) {
            totalDrops += result.controller?.dropCount ?? 1;

            // Run drop remediation: pickUp → prerequisite reps → retry
            await handleDrop(letter, segment, callbacks);
          }

          break;
        }

        // ── REVIEW: j performs a previously-learned skill ──────────────
        case "review": {
          if (!segment.skill) break;

          const letter = getActorLetter(actors, segment.actor);

          // Review uses the segment's jitter directly (cross-session smoothing
          // would be computed by the proficiency system, which isn't implemented yet).
          const jitter = resolveJitter(segment, 0);

          const persistent = await getPersistent(segment.actor === "J" ? "J" : "j", letter);
          await executeSkill(
            letter,
            segment.skill,
            segment.params ?? {},
            jitter,
            isAborted,
            persistent,
          );

          break;
        }

        // ── TRANSITION: narrative beats ────────────────────────────────
        case "transition": {
          await executeTransition(
            segment,
            actors,
            callbacks,
            cascadeControllerRef,
          );
          break;
        }

        // ── TOGETHER: both J and j perform simultaneously ─────────────
        case "together": {
          // Run the same skill on both actors in parallel
          if (segment.skill) {
            const promises: Promise<unknown>[] = [];

            // J performs with low jitter
            promises.push(
              executeSkill(J as unknown as LetterInstance, segment.skill, {
                ...segment.params,
                jitter: 0.03,
              }).catch(() => {}),
            );

            // j performs with specified jitter
            const jitter = resolveJitter(segment, 0);
            promises.push(
              executeSkill(
                j as unknown as LetterInstance,
                segment.skill,
                segment.params ?? {},
                jitter,
              ).catch(() => {}),
            );

            await Promise.all(promises);
          }
          break;
        }

        // ── TEACH: j demonstrates to a peer (sessions 18+) ───────────
        case "teach": {
          // Mechanically identical to demo, but j is the actor
          if (segment.skill) {
            const persistent = await getPersistent("j", j);
            await executeSkill(
              j,
              segment.skill,
              { ...segment.params, jitter: segment.params?.jitter ?? 0.04 },
              undefined,
              isAborted,
              persistent,
            );
          }
          break;
        }

        default:
          console.warn(
            `[SessionRunner] Unknown segment type: ${segment.type}`,
          );
      }

      segmentsRun++;

      // Brief pause between segments for breathing room
      await delay(200, isAborted);
    }
  } finally {
    // Clean up any active cascade
    if (cascadeControllerRef.current) {
      try {
        cascadeControllerRef.current.destroy();
      } catch {
        /* ignore */
      }
      cascadeControllerRef.current = null;
    }

    // Clean up idle animations
    if (idleCleanupJ) idleCleanupJ();
    if (idleCleanupj) idleCleanupj();

    // Tear down persistent per-actor contexts created for ball reuse.
    for (const holder of persistentByActor.values()) {
      try {
        removeAllBalls(holder.context);
        holder.loop.stop();
      } catch {
        /* ignore */
      }
    }
    persistentByActor.clear();
  }

  // Clear caption at session end
  showCaption("");

  const completed = segmentsRun === session.segments.length;
  return {
    completed,
    aborted: isAborted(),
    segmentsRun,
    totalDrops,
  };
}