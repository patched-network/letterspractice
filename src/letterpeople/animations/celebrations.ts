/**
 * Celebration Animation Sequences for LetterPeople
 *
 * Expressive positive-feedback animations. Each is a self-contained sequence
 * with squash-and-stretch physics, facial expressions, and optional arm
 * gestures.
 *
 * General-purpose (in the "random" pool): jump, spin, victory, bounce,
 * confetti, somersault, nod.
 * Explicit-only (never picked by "random"):
 *  - phew — relief after a correct answer that followed a miss
 */

import type { LetterInstance } from "../types";
import { delay } from "../util/animation";
import { colorToOklch, oklch } from "../util/color";
import type { SequenceOptions } from "./speech";
import { asPerformer, letterHeight, type Performer } from "./performer";
import type { Point } from "../util/geometry";

// ============================================================================
// Types
// ============================================================================

export type CelebrationType =
  | "jump"
  | "spin"
  | "victory"
  | "bounce"
  | "confetti"
  | "somersault"
  | "phew"
  | "nod"
  | "twirl";

/** Types eligible for `type: "random"` (letter-level and Word strategies). */
export const RANDOM_CELEBRATIONS: readonly CelebrationType[] = [
  "jump",
  "spin",
  "victory",
  "bounce",
  "confetti",
  "somersault",
  "nod",
];

/**
 * Random pool for renderers with real depth. Adds "twirl" (a spin about the
 * vertical axis), which on a flat SVG letter passes through an edge-on
 * sliver — still playable there by name, just not picked at random.
 */
export const RANDOM_CELEBRATIONS_3D: readonly CelebrationType[] = [
  ...RANDOM_CELEBRATIONS,
  "twirl",
];

export interface CelebrateOptions extends SequenceOptions {
  /** Specific celebration type, or random if not specified */
  type?: CelebrationType | "random";
}

// ============================================================================
// Celebrate (dispatcher)
// ============================================================================

/**
 * Performs a celebratory animation sequence.
 * Picks randomly from available types if `type` is omitted or "random".
 */
export async function celebrate(
  target: LetterInstance | Performer,
  options: CelebrateOptions = {}
): Promise<void> {
  const letter = asPerformer(target);
  const { speed = 1, onComplete } = options;
  let { type = "random" } = options;

  if (type === "random") {
    const pool = letter.randomPool ?? RANDOM_CELEBRATIONS;
    type = pool[Math.floor(Math.random() * pool.length)];
  }

  switch (type) {
    case "jump":
      await celebrateJump(letter, speed);
      break;
    case "spin":
      await celebrateSpin(letter, speed);
      break;
    case "victory":
      await celebrateVictory(letter, speed);
      break;
    case "bounce":
      await celebrateBounce(letter, speed);
      break;
    case "confetti":
      await celebrateConfetti(letter, speed);
      break;
    case "somersault":
      await celebrateSomersault(letter, speed);
      break;
    case "phew":
      await celebratePhew(letter, speed);
      break;
    case "nod":
      await celebrateNod(letter, speed);
      break;
    case "twirl":
      await celebrateTwirl(letter, speed);
      break;
  }

  onComplete?.();
}

// ============================================================================
// Celebration variants
// ============================================================================

/** Jump: happy expression + squash-and-stretch jump + arm wave */
async function celebrateJump(letter: Performer, speed: number): Promise<void> {
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("happy", { duration: 150 / speed });
  }
  letter.mouth.updateShape({ openness: 0.3, mood: 0.9 }, { duration: 150 / speed });

  if (letter.arms.isVisible()) {
    letter.arms.wave({ duration: 400 / speed });
  }

  const pose = (props: Record<string, any>) => letter.pose(props, "bottom");

  await pose({ scaleY: 0.85, scaleX: 1.1, duration: 100 / speed, ease: "inQuad" });
  await pose({ translateY: -50, scaleY: 1.15, scaleX: 0.92, duration: 180 / speed, ease: "outQuad" });
  await pose({ translateY: 0, scaleY: 0.85, scaleX: 1.1, duration: 150 / speed, ease: "inQuad" });
  await pose({ scaleY: 1, scaleX: 1, duration: 200 / speed, ease: "outElastic(1, 0.6)" });

  await delay(200 / speed);
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.relax({ duration: 300 / speed });
  }
  letter.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 300 / speed });
}

/** Spin: surprised → happy expression + 360° spin with scale pulse */
async function celebrateSpin(letter: Performer, speed: number): Promise<void> {
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("surprised", { duration: 100 / speed });
  }
  letter.mouth.updateShape({ openness: 0.4, mood: 0.75 }, { duration: 100 / speed });

  await letter.pose({
    rotate: [0, 360],
    scale: [1, 1.1, 1],
    duration: 500 / speed,
    ease: "inOutBack",
  }, "center");

  letter.resetPose();

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("happy", { duration: 200 / speed });
  }
  letter.mouth.updateShape({ openness: 0.25, mood: 0.85 }, { duration: 200 / speed });

  await delay(300 / speed);

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.relax({ duration: 300 / speed });
  }
  letter.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 300 / speed });
}

/** Victory: arms up + small hop + big smile */
async function celebrateVictory(letter: Performer, speed: number): Promise<void> {
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("surprised", { duration: 100 / speed });
  }
  letter.mouth.updateShape({ openness: 0.5, mood: 0.95 }, { duration: 100 / speed });

  if (letter.arms.isVisible()) {
    Promise.all([
      letter.arms.left.rotateTo(-150, { duration: 200 / speed }),
      letter.arms.right.rotateTo(-30, { duration: 200 / speed }),
    ]);
  }

  const pose = (props: Record<string, any>) => letter.pose(props, "bottom");

  await pose({ translateY: -25, scaleY: 1.05, duration: 150 / speed, ease: "outQuad" });
  await pose({ translateY: 0, scaleY: 1, duration: 150 / speed, ease: "inQuad" });

  await delay(400 / speed);

  if (letter.arms.isVisible()) {
    Promise.all([
      letter.arms.left.rotateTo(-45, { duration: 300 / speed }),
      letter.arms.right.rotateTo(-135, { duration: 300 / speed }),
    ]);
  }

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("happy", { duration: 200 / speed });
  }
  letter.mouth.updateShape({ openness: 0.2, mood: 0.8 }, { duration: 200 / speed });

  await delay(200 / speed);

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.relax({ duration: 300 / speed });
  }
  letter.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 300 / speed });
}

/** Bounce: three escalating hops with alternating eye glances */
async function celebrateBounce(letter: Performer, speed: number): Promise<void> {
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("happy", { duration: 100 / speed });
  }
  letter.mouth.updateShape({ openness: 0.35, mood: 0.9 }, { duration: 100 / speed });

  const pose = (props: Record<string, any>) => letter.pose(props, "bottom");

  for (let i = 0; i < 3; i++) {
    if (letter.eyes.isVisible()) {
      const lookDir = i % 2 === 0 ? 0.3 : -0.3;
      letter.eyes.lookAt({ x: lookDir, y: 0 }, { duration: 100 / speed });
    }

    await pose({ translateY: -20 - i * 5, scaleY: 1.08, scaleX: 0.95, duration: 120 / speed, ease: "outQuad" });
    await pose({ translateY: 0, scaleY: 0.92, scaleX: 1.05, duration: 100 / speed, ease: "inQuad" });
    await pose({ scaleY: 1, scaleX: 1, duration: 80 / speed, ease: "outQuad" });
  }

  if (letter.eyes.isVisible()) {
    letter.eyes.lookAt({ x: 0, y: 0 }, { duration: 150 / speed });
  }

  await delay(200 / speed);

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.relax({ duration: 300 / speed });
  }
  letter.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 300 / speed });
}

/**
 * Confetti: hands drop low, then toss up a burst of paper bits in hues
 * around the letter's own colour. The bits flutter down and fade.
 *
 * It's a hands trick, so an armless letter grows arms for it and puts them
 * away after — a still-life (e.g. the landing portrait) ends as it began.
 */
async function celebrateConfetti(letter: Performer, speed: number): Promise<void> {
  const armsWereOut = letter.arms.isVisible();
  // Awaited, not overlapped with the wind-up: SVG show() stops the arm's
  // running animations, which would cut the first rotateTo short.
  if (!armsWereOut) await letter.arms.show({ duration: 150 / speed });
  // Still false for a letter built without arms (3D) — burst from the head.
  const armsVisible = letter.arms.isVisible();
  const pose = (props: Record<string, any>) => letter.pose(props, "bottom");

  // Wind-up: hands drop, body crouches, face focused
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("neutral", { duration: 100 / speed });
  }
  letter.mouth.updateShape({ openness: 0.05, mood: 0.7 }, { duration: 100 / speed });
  if (armsVisible) {
    letter.arms.left.rotateTo(115, { duration: 150 / speed });
    letter.arms.right.rotateTo(65, { duration: 150 / speed });
  }
  await pose({ scaleY: 0.88, scaleX: 1.07, duration: 160 / speed, ease: "outQuad" });

  // Toss: arms fling up (left via 180°, right via 0°, so neither sweeps
  // across the body), small hop, burst leaves from the hands.
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("surprised", { duration: 100 / speed });
  }
  letter.mouth.updateShape({ openness: 0.45, mood: 0.95 }, { duration: 100 / speed });
  if (armsVisible) {
    letter.arms.left.rotateTo(240, { duration: 140 / speed, ease: "outQuad" });
    letter.arms.right.rotateTo(-60, { duration: 140 / speed, ease: "outQuad" });
  }
  await pose({ translateY: -14, scaleY: 1.06, scaleX: 0.96, duration: 140 / speed, ease: "outQuad" });

  const burst = confettiBurst(letter, confettiOrigins(letter, armsVisible), speed);

  await pose({ translateY: 0, scaleY: 0.94, scaleX: 1.04, duration: 130 / speed, ease: "inQuad" });
  await pose({ scaleY: 1, scaleX: 1, duration: 200 / speed, ease: "outElastic(1, 0.6)" });

  // Watch it fall
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("happy", { duration: 200 / speed });
    letter.eyes.lookAt({ x: 0, y: -0.4 }, { duration: 200 / speed });
  }
  letter.mouth.updateShape({ openness: 0.25, mood: 0.9 }, { duration: 200 / speed });

  await delay(250 / speed);
  if (letter.eyes.isVisible()) {
    letter.eyes.lookAt({ x: 0, y: 0.2 }, { duration: 500 / speed });
  }
  if (armsVisible) {
    letter.arms.relax({ duration: 350 / speed });
  }

  await burst;

  if (letter.eyes.isVisible()) {
    letter.eyes.lookAt({ x: 0, y: 0 }, { duration: 200 / speed });
    letter.eyes.brows?.relax({ duration: 300 / speed });
  }
  letter.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 300 / speed });
  if (!armsWereOut) await letter.arms.hide({ duration: 250 / speed });
}

/** Somersault: crouch, launch, full flip in the air, ta-da landing. */
async function celebrateSomersault(letter: Performer, speed: number): Promise<void> {
  const armsVisible = letter.arms.isVisible();
  const pose = (props: Record<string, any>) => letter.pose(props, "bottom");

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("surprised", { duration: 100 / speed });
  }
  letter.mouth.updateShape({ openness: 0.35, mood: 0.8 }, { duration: 100 / speed });

  // Crouch + launch pivot on the feet; scale returns to 1 before the origin
  // moves to the centre for the flip, so the origin swap doesn't jump.
  await pose({ scaleY: 0.8, scaleX: 1.12, duration: 110 / speed, ease: "inQuad" });
  await pose({ translateY: -30, scaleY: 1, scaleX: 1, duration: 100 / speed, ease: "outQuad" });

  // Explicit `from`s throughout: anime caches transform values per element,
  // so relying on "current" values breaks after any earlier rotate.
  await letter.pose({
    translateY: { from: -30, to: -85, ease: "outQuad" },
    rotate: { from: 0, to: 180, ease: "linear" },
    duration: 280 / speed,
  }, "center");
  await letter.pose({
    translateY: { from: -85, to: 0, ease: "inQuad" },
    rotate: { from: 180, to: 360, ease: "linear" },
    duration: 280 / speed,
  }, "center");

  // Landing: rotate is 360 (identity), so moving the origin back is seamless
  if (armsVisible) {
    letter.arms.left.rotateTo(215, { duration: 150 / speed, ease: "outQuad" });
    letter.arms.right.rotateTo(-35, { duration: 150 / speed, ease: "outQuad" });
  }
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("happy", { duration: 150 / speed });
  }
  letter.mouth.updateShape({ openness: 0.3, mood: 0.95 }, { duration: 150 / speed });
  await pose({ scaleY: 0.85, scaleX: 1.1, duration: 90 / speed, ease: "outQuad" });
  await pose({ scaleY: 1, scaleX: 1, duration: 250 / speed, ease: "outElastic(1, 0.6)" });
  letter.resetPose();

  await delay(300 / speed);

  if (armsVisible) {
    letter.arms.relax({ duration: 300 / speed });
  }
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.relax({ duration: 300 / speed });
  }
  letter.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 300 / speed });
}

/**
 * Phew: relief after a correct answer that followed a miss. Worried brows,
 * a wipe across the forehead, a deflating sigh, then a small happy hop.
 * Celebrates sticking with it rather than getting it first time.
 */
async function celebratePhew(letter: Performer, speed: number): Promise<void> {
  const armsVisible = letter.arms.isVisible();
  const pose = (props: Record<string, any>) => letter.pose(props, "bottom");

  // "That was close"
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("sad", { duration: 150 / speed });
  }
  letter.mouth.updateShape({ openness: 0.12, mood: 0.45 }, { duration: 150 / speed });

  // Wipe the brow with the right arm, from the near side of the forehead to the far side
  const arm = letter.arms.right;
  const restHand = arm.getHandPosition();
  if (armsVisible) {
    const [near, far] = foreheadWipePoints(letter, arm.getShoulderPosition().x);
    await arm.setHandPosition(near, { duration: 250 / speed, ease: "outQuad" });
    await Promise.all([
      arm.setHandPosition(far, { duration: 280 / speed, ease: "inOutQuad" }),
      letter.mouth.updateShape({ openness: 0.45, mood: 0.55 }, { duration: 200 / speed }),
      pose({ scaleY: 0.92, scaleX: 1.05, duration: 300 / speed, ease: "outQuad" }),
    ]);
  } else {
    await delay(150 / speed);
    letter.mouth.updateShape({ openness: 0.45, mood: 0.55 }, { duration: 200 / speed });
    await pose({ scaleY: 0.9, scaleX: 1.06, duration: 350 / speed, ease: "outQuad" });
  }

  await delay(120 / speed);

  // Relief → happy hop
  if (armsVisible) {
    arm.setHandPosition(restHand, { duration: 250 / speed, ease: "inOutQuad" });
  }
  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("happy", { duration: 200 / speed });
  }
  letter.mouth.updateShape({ openness: 0.25, mood: 0.9 }, { duration: 200 / speed });
  await pose({ translateY: -14, scaleY: 1.04, scaleX: 0.97, duration: 150 / speed, ease: "outQuad" });
  await pose({ translateY: 0, scaleY: 0.95, scaleX: 1.03, duration: 120 / speed, ease: "inQuad" });
  await pose({ scaleY: 1, scaleX: 1, duration: 200 / speed, ease: "outElastic(1, 0.6)" });

  await delay(250 / speed);

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.relax({ duration: 300 / speed });
  }
  letter.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 300 / speed });
}

/** Nod: understated — contented slow blink, closed smile, one small nod. */
async function celebrateNod(letter: Performer, speed: number): Promise<void> {
  const pose = (props: Record<string, any>) => letter.pose(props, "bottom");

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("happy", { duration: 150 / speed });
    letter.eyes.blink({ duration: 380 / speed });
  }
  letter.mouth.updateShape({ openness: 0.03, mood: 0.85 }, { duration: 150 / speed });

  await pose({ translateY: 3, scaleY: 0.95, rotate: -3, duration: 170 / speed, ease: "outQuad" });
  await pose({ translateY: 0, scaleY: 1, rotate: 0, duration: 280 / speed, ease: "outBack" });

  await delay(250 / speed);

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.relax({ duration: 300 / speed });
  }
  letter.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 300 / speed });
}

/**
 * Twirl: crouch, arms out wide, one full turn about the vertical axis with a
 * little lift, squash-and-settle landing. Made for 3D (see RANDOM_CELEBRATIONS_3D).
 */
async function celebrateTwirl(letter: Performer, speed: number): Promise<void> {
  const armsVisible = letter.arms.isVisible();
  const pose = (props: Record<string, any>) => letter.pose(props, "bottom");

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.express("happy", { duration: 120 / speed });
  }
  letter.mouth.updateShape({ openness: 0.3, mood: 0.9 }, { duration: 120 / speed });
  await pose({ scaleY: 0.9, scaleX: 1.06, duration: 120 / speed, ease: "outQuad" });

  if (armsVisible) {
    letter.arms.left.rotateTo(185, { duration: 160 / speed, ease: "outQuad" });
    letter.arms.right.rotateTo(-5, { duration: 160 / speed, ease: "outQuad" });
  }
  letter.mouth.updateShape({ openness: 0.45, mood: 0.95 }, { duration: 120 / speed });
  await pose({
    rotateY: { from: 0, to: 360, ease: "inOutSine" },
    translateY: [0, -12, 0],
    scaleY: 1,
    scaleX: 1,
    duration: 650 / speed,
  });

  if (armsVisible) {
    letter.arms.relax({ duration: 300 / speed });
  }
  await pose({ scaleY: 0.9, scaleX: 1.06, duration: 80 / speed, ease: "outQuad" });
  await pose({ scaleY: 1, scaleX: 1, duration: 250 / speed, ease: "outElastic(1, 0.6)" });
  letter.resetPose();

  await delay(250 / speed);

  if (letter.eyes.isVisible()) {
    letter.eyes.brows?.relax({ duration: 300 / speed });
  }
  letter.mouth.updateShape({ openness: 0.1, mood: 0.6 }, { duration: 300 / speed });
}

// ============================================================================
// Helpers
// ============================================================================

/** Each (raised) hand if arms are out, else just above the head. */
function confettiOrigins(letter: Performer, armsVisible: boolean): Point[] {
  if (armsVisible) {
    return [letter.arms.left.getHandPosition(), letter.arms.right.getHandPosition()];
  }
  const { hat } = letter.attachmentCoords;
  return [{ x: hat.x, y: hat.y - letterHeight(letter.attachmentCoords) * 0.1 }];
}

/**
 * Two points just above the eyes: the one nearer the wiping arm's shoulder
 * first, then the far one.
 */
function foreheadWipePoints(
  letter: Performer,
  shoulderX: number
): [{ x: number; y: number }, { x: number; y: number }] {
  const { leftEye, rightEye } = letter.attachmentCoords;
  const span = Math.abs(rightEye.x - leftEye.x);
  const y = Math.min(leftEye.y, rightEye.y) - Math.max(span * 0.45, letterHeight(letter.attachmentCoords) * 0.08);
  const pad = span * 0.15;
  const lo = { x: Math.min(leftEye.x, rightEye.x) - pad, y };
  const hi = { x: Math.max(leftEye.x, rightEye.x) + pad, y };
  return Math.abs(hi.x - shoulderX) <= Math.abs(lo.x - shoulderX) ? [hi, lo] : [lo, hi];
}

/**
 * Spawn a burst of spinning paper bits, split across `origins` (letter
 * content space, e.g. one per hand), and
 * run them with simple ballistics + drag so they pop up then flutter down.
 * Resolves once every bit has faded and been removed.
 */
function confettiBurst(
  letter: Performer,
  origins: Point[],
  speed: number,
  count = 16
): Promise<void> {
  const H = letterHeight(letter.attachmentCoords);
  const base = colorToOklch(letter.fillColor() ?? "") ?? { l: 0.8, c: 0.12, h: 0 };
  const hueOffsets = [0, 35, -35, 110, -110, 180];

  const bits = Array.from({ length: count }, (_, i) => {
    const w = H * (0.045 + Math.random() * 0.02);
    const bit = letter.spawnConfettiBit(
      w,
      w * 0.6,
      oklch(0.82, 0.14, base.h + hueOffsets[i % hueOffsets.length]),
    );
    const origin = origins[i % origins.length];
    // With two hands, bias each half outward from the body's centre line
    const outward = origins.length > 1 ? Math.sign(origin.x - letter.attachmentCoords.hat.x) : 0;
    return {
      bit,
      x: origin.x,
      y: origin.y,
      vx: (outward * 0.6 + (Math.random() - 0.5) * 2.4) * H,
      vy: -(3.2 + Math.random() * 1.2) * H,
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 900,
      phase: Math.random() * Math.PI * 2,
    };
  });

  const gravity = 10 * H;
  const terminal = 1.1 * H; // slow flutter once falling
  const lifeMs = 1500;
  const fadeFrom = 0.55;

  return new Promise((resolve) => {
    let last = performance.now();
    let elapsed = 0;
    const step = (now: number) => {
      const dt = (Math.min(now - last, 50) / 1000) * speed;
      last = now;
      elapsed += dt * 1000;
      const t = elapsed / lifeMs;
      const opacity = t < fadeFrom ? 1 : Math.max(0, 1 - (t - fadeFrom) / (1 - fadeFrom));

      for (const b of bits) {
        b.vy = Math.min(b.vy + gravity * dt, terminal);
        b.vx *= Math.pow(0.35, dt);
        b.x += b.vx * dt + Math.sin(elapsed / 90 + b.phase) * H * 0.004;
        b.y += b.vy * dt;
        b.rot += b.vrot * dt;
        b.bit.place(b.x, b.y, b.rot, opacity);
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        bits.forEach((b) => b.bit.remove());
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
