/**
 * gatherAndStop — Bridge from siteswap renderer to physics-core.
 *
 * Takes exported ball SVG elements from a BallRenderer, adopts them into a
 * PhysicsContext with estimated velocities, classifies balls as held-in-hand
 * or in-flight, then schedules sequential catches for all airborne balls.
 *
 * Balls that are near a hand with low velocity at transition time are adopted
 * directly as "held" (no re-catch needed). Remaining in-flight balls are
 * sorted by catch urgency and assigned to hands as they become free.
 *
 * This allows a visually seamless transition from the siteswap sampled-path
 * animation to physics-based individual ball control.
 */

import type { LetterInstance } from "../../../types";
import type { Point, HandPath } from "../types";
import {
  createPhysicsContext,
  adoptBall,
  catchBall,
  removeAllBalls,
  startPhysicsLoop,
  waitForSettled,
  waitForHandIdle,
  predictIntercept,
  type PhysicsContext,
  type PhysicsBall,
  type PhysicsLoop,
} from "./physics-core";
import type { Hand } from "./shared";

export interface GatherResult {
  /** Balls held in hands after gathering */
  heldBalls: PhysicsBall[];
  /** Balls that grounded (couldn't catch — more balls than hands) */
  groundedBalls: PhysicsBall[];
  /** Live physics context — caller can use for follow-on actions */
  physicsContext: PhysicsContext;
  /** Running physics loop — caller must stop() when done */
  physicsLoop: PhysicsLoop;
  /** Clean up everything: stop loop, remove balls, relax arms */
  destroy(): void;
}

export interface ExportedBall {
  element: SVGCircleElement;
  position: Point;
  color: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Classification thresholds
// ═══════════════════════════════════════════════════════════════════════════

/** Max distance (px) from a hand for a ball to be classified as "held" */
const HELD_DISTANCE_THRESHOLD = 20;

/** Max speed (px/s) for a ball to be classified as "held" (dwell = low speed) */
const HELD_SPEED_THRESHOLD = 80;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function pointDist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function vecSpeed(v: Point): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * Estimate ball velocity from sampled path data.
 *
 * Looks at the two samples bracketing `currentTime` and computes
 * (delta position / delta time). Falls back to zero if data is insufficient.
 */
function estimateVelocity(
  ballPath: HandPath,
  currentTime: number,
): Point {
  const { timings, positions } = ballPath;
  if (timings.length < 2) return { x: 0, y: 0 };

  // Find the sample index at or just before currentTime
  let idx = -1;
  for (let i = timings.length - 1; i >= 0; i--) {
    if (timings[i] <= currentTime) {
      idx = i;
      break;
    }
  }

  if (idx < 0) idx = 0;

  // Use idx and idx-1 (backward difference) if possible,
  // otherwise idx and idx+1 (forward difference)
  let i0: number, i1: number;
  if (idx > 0) {
    i0 = idx - 1;
    i1 = idx;
  } else if (idx < timings.length - 1) {
    i0 = idx;
    i1 = idx + 1;
  } else {
    return { x: 0, y: 0 };
  }

  const dt = (timings[i1] - timings[i0]) / 1000; // convert ms → seconds
  if (dt <= 0) return { x: 0, y: 0 };

  return {
    x: (positions[i1].x - positions[i0].x) / dt,
    y: (positions[i1].y - positions[i0].y) / dt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Ball classification
// ═══════════════════════════════════════════════════════════════════════════

interface ClassifiedBalls {
  /** Balls that are in-hand at transition time (one per hand max) */
  held: Array<{ exported: ExportedBall; hand: Hand; index: number }>;
  /** Balls that are airborne at transition time */
  inFlight: Array<{ exported: ExportedBall; velocity: Point; index: number }>;
}

/**
 * Classify exported balls as held-in-hand or in-flight.
 *
 * For each hand, finds the nearest ball that qualifies as "held" based on
 * proximity + low velocity. At most one ball per hand. All other balls
 * are classified as in-flight with their estimated velocity.
 */
function classifyBalls(
  exportedBalls: ExportedBall[],
  ballPaths: HandPath[],
  currentTime: number,
  handPositions: { left: Point; right: Point },
): ClassifiedBalls {
  // Compute velocity + speed for each ball
  const ballInfo = exportedBalls.map((exported, i) => {
    const velocity =
      i < ballPaths.length
        ? estimateVelocity(ballPaths[i], currentTime)
        : { x: 0, y: 0 };
    const speed = vecSpeed(velocity);
    return { exported, velocity, speed, index: i };
  });

  // For each hand, find the nearest ball that qualifies as "held"
  const handCandidates: Record<Hand, { index: number; dist: number } | null> = {
    left: null,
    right: null,
  };

  for (const side of ["left", "right"] as Hand[]) {
    const handPos = handPositions[side];
    let bestIdx = -1;
    let bestDist = HELD_DISTANCE_THRESHOLD;

    for (let i = 0; i < ballInfo.length; i++) {
      if (ballInfo[i].speed >= HELD_SPEED_THRESHOLD) continue;
      const d = pointDist(ballInfo[i].exported.position, handPos);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      handCandidates[side] = { index: bestIdx, dist: bestDist };
    }
  }

  // Resolve conflicts: both hands claim the same ball → closer hand wins
  if (
    handCandidates.left &&
    handCandidates.right &&
    handCandidates.left.index === handCandidates.right.index
  ) {
    if (handCandidates.left.dist <= handCandidates.right.dist) {
      handCandidates.right = null;
    } else {
      handCandidates.left = null;
    }
  }

  // Build result
  const heldIndices = new Set<number>();
  const held: ClassifiedBalls["held"] = [];

  for (const side of ["left", "right"] as Hand[]) {
    const candidate = handCandidates[side];
    if (candidate) {
      heldIndices.add(candidate.index);
      held.push({
        exported: ballInfo[candidate.index].exported,
        hand: side,
        index: candidate.index,
      });
    }
  }

  const inFlight: ClassifiedBalls["inFlight"] = ballInfo
    .filter((_, i) => !heldIndices.has(i))
    .map((bi) => ({
      exported: bi.exported,
      velocity: bi.velocity,
      index: bi.index,
    }));

  return { held, inFlight };
}

// ═══════════════════════════════════════════════════════════════════════════
// Catch scheduler
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pick the best free hand to catch a ball, based on proximity of the hand's
 * current position to the ball's predicted intercept.
 */
function pickHandForBall(
  ball: PhysicsBall,
  physCtx: PhysicsContext,
  handBusy: Record<Hand, boolean>,
): Hand | null {
  const catchY =
    (physCtx.hands.left.restPosition.y + physCtx.hands.right.restPosition.y) /
    2;
  const intercept = predictIntercept(ball, catchY, physCtx.gravity);
  const targetX = intercept?.position.x ?? ball.position.x;

  const freeHands = (["left", "right"] as Hand[]).filter(
    (s) => !handBusy[s],
  );

  if (freeHands.length === 0) return null;
  if (freeHands.length === 1) return freeHands[0];

  // Pick the hand whose current position is closer to the intercept x
  const dL = Math.abs(targetX - physCtx.hands.left.position.x);
  const dR = Math.abs(targetX - physCtx.hands.right.position.x);
  return dL <= dR ? "left" : "right";
}

/**
 * Kick off sequential catch scheduling.
 *
 * Assigns one ball per free hand from the queue. When a hand finishes
 * (catches or gives up), it re-enters the pool and the next queued ball
 * is assigned. Continues until the queue is drained.
 */
function scheduleNextCatches(
  physCtx: PhysicsContext,
  catchQueue: PhysicsBall[],
  handBusy: Record<Hand, boolean>,
): void {
  // Drain any balls that are no longer in-flight (grounded or already caught)
  while (catchQueue.length > 0 && catchQueue[0].status !== "in-flight") {
    catchQueue.shift();
  }

  if (catchQueue.length === 0) return;

  // Try to assign a ball to each free hand
  // We iterate a copy of the queue indices so we can splice safely
  const toAssign: Array<{ hand: Hand; ball: PhysicsBall }> = [];

  for (let qi = 0; qi < catchQueue.length; qi++) {
    const ball = catchQueue[qi];
    if (ball.status !== "in-flight") continue;

    const hand = pickHandForBall(ball, physCtx, handBusy);
    if (!hand) break; // no free hands left

    toAssign.push({ hand, ball });
    handBusy[hand] = true;

    // Check if both hands are now busy
    if (handBusy.left && handBusy.right) break;
  }

  // Remove assigned balls from queue and issue catch intents
  for (const { hand, ball } of toAssign) {
    const idx = catchQueue.indexOf(ball);
    if (idx >= 0) catchQueue.splice(idx, 1);

    console.log(
      `[gatherAndStop] Scheduling catch: ball ${ball.id} → ${hand} hand`,
    );
    catchBall(physCtx, hand, ball, { jitter: 0 });

    // When this hand becomes idle again, free it and try to schedule more
    waitForHandIdle(physCtx, hand, 8000)
      .then(() => {
        handBusy[hand] = false;
        scheduleNextCatches(physCtx, catchQueue, handBusy);
      })
      .catch(() => {
        // Timeout or error — free the hand and keep going
        handBusy[hand] = false;
        scheduleNextCatches(physCtx, catchQueue, handBusy);
      });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gather all exported siteswap balls into a physics simulation,
 * catch them in the letter's hands, and return the settled state.
 *
 * @param letter         The LetterInstance (arms must be visible)
 * @param exportedBalls  Ball elements + positions from BallRenderer.exportBalls()
 * @param ballPaths      The letterBallPaths used by the siteswap renderer (for velocity estimation)
 * @param currentTime    The siteswap animation time at which we stopped (ms, cycle-relative)
 * @param handPositions  Actual hand positions at transition time (from siteswap animation state)
 */
export async function gatherAndStop(
  letter: LetterInstance,
  exportedBalls: ExportedBall[],
  ballPaths: HandPath[],
  currentTime: number,
  handPositions?: { left: Point; right: Point },
): Promise<GatherResult> {
  const physCtx = createPhysicsContext(letter);

  // Override initial hand positions from siteswap animation state
  // (createPhysicsContext initializes to rest positions, but hands may be
  // mid-motion when the siteswap stops)
  if (handPositions) {
    physCtx.hands.left.position = { ...handPositions.left };
    physCtx.hands.right.position = { ...handPositions.right };
  }

  const currentHandPos = {
    left: { ...physCtx.hands.left.position },
    right: { ...physCtx.hands.right.position },
  };

  // ── 1. Classify balls as held or in-flight ──────────────────────────

  const classified = classifyBalls(
    exportedBalls,
    ballPaths,
    currentTime,
    currentHandPos,
  );

  console.log(
    `[gatherAndStop] Classification: ${classified.held.length} held, ` +
      `${classified.inFlight.length} in-flight`,
  );

  // ── 2. Adopt balls into physics context ─────────────────────────────

  const physicsBalls: PhysicsBall[] = [];
  const inFlightBalls: PhysicsBall[] = [];

  // Adopt held balls — position at hand, zero velocity, status=held
  for (const { exported, hand } of classified.held) {
    const handPos = physCtx.hands[hand].position;
    const ball = adoptBall(
      physCtx,
      exported.element,
      handPos,
      { x: 0, y: 0 },
      "held",
    );
    ball.heldBy = hand;
    physicsBalls.push(ball);

    console.log(
      `[gatherAndStop] Ball ${ball.id} adopted as HELD by ${hand} ` +
        `at (${handPos.x.toFixed(1)}, ${handPos.y.toFixed(1)})`,
    );
  }

  // Adopt in-flight balls — position + velocity from sampled state
  for (const { exported, velocity } of classified.inFlight) {
    const ball = adoptBall(
      physCtx,
      exported.element,
      exported.position,
      velocity,
      "in-flight",
    );
    physicsBalls.push(ball);
    inFlightBalls.push(ball);

    console.log(
      `[gatherAndStop] Ball ${ball.id} adopted as IN-FLIGHT ` +
        `at (${exported.position.x.toFixed(1)}, ${exported.position.y.toFixed(1)}) ` +
        `vel=(${velocity.x.toFixed(1)}, ${velocity.y.toFixed(1)}) ` +
        `speed=${vecSpeed(velocity).toFixed(1)}`,
    );
  }

  // ── 3. Start physics loop ───────────────────────────────────────────

  const loop = startPhysicsLoop(physCtx);

  // ── 4. Sort in-flight balls by catch urgency ────────────────────────
  //
  // Priority: lowest predicted intercept time first (most urgent).
  // Balls already descending toward catch height are more urgent than
  // balls still rising.

  const catchY =
    (physCtx.hands.left.restPosition.y + physCtx.hands.right.restPosition.y) /
    2;

  inFlightBalls.sort((a, b) => {
    const intA = predictIntercept(a, catchY, physCtx.gravity);
    const intB = predictIntercept(b, catchY, physCtx.gravity);
    const tA = intA?.time ?? Infinity;
    const tB = intB?.time ?? Infinity;
    return tA - tB;
  });

  console.log(
    `[gatherAndStop] Catch queue (by urgency): ` +
      inFlightBalls.map((b) => `ball${b.id}`).join(", "),
  );

  // ── 5. Sequential catch scheduler ──────────────────────────────────
  //
  // Each hand can only pursue one catch at a time. When it finishes
  // (caught → cushion → idle, or miss → return → idle), the scheduler
  // assigns the next queued ball.

  const catchQueue = [...inFlightBalls];
  const handBusy: Record<Hand, boolean> = { left: false, right: false };

  scheduleNextCatches(physCtx, catchQueue, handBusy);

  // ── 6. Wait for settlement ─────────────────────────────────────────

  try {
    await waitForSettled(physCtx, 10000);
  } catch {
    console.warn("[gatherAndStop] Timed out waiting for settlement");
  }

  const heldBalls = physicsBalls.filter((b) => b.status === "held");
  const groundedBalls = physicsBalls.filter((b) => b.status === "grounded");

  console.log(
    `[gatherAndStop] Complete: ${heldBalls.length} held, ` +
      `${groundedBalls.length} grounded`,
  );

  return {
    heldBalls,
    groundedBalls,
    physicsContext: physCtx,
    physicsLoop: loop,
    destroy() {
      loop.stop();
      removeAllBalls(physCtx);
      letter.arms.relax({ duration: 150 });
    },
  };
}