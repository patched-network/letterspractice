import { animate, type JSAnimation } from "animejs";
import type { LetterInstance } from "../../../types";
import type { JugglingController, Point } from "../types";
import {
  createControllerLifecycle,
  resetEphemeralControllerState,
  resolveStoppedOnce,
} from "../controller";
import type { PhysicsContext, PhysicsBall, PhysicsLoop } from "./physics-core";

export { tossToSelf } from "./tossToSelf";
export { syncColumns, type SyncColumnsOptions } from "./syncColumns";
export { arcPass } from "./arcPass";
export { handoff } from "./handoff";
export { drop } from "./drop";
export type Hand = "left" | "right";

export interface PhraseControllerContext {
  letter: LetterInstance;
  ballElements: SVGCircleElement[];
  cleanupAnimations: Set<JSAnimation>;
  postFinish?: () => Promise<void> | void;
}

export interface TossToSelfOptions {
  hand: Hand;
  height?: number;
  count?: number; // 0 = loop until stopped
  dwell?: number; // proportion of cycle spent with ball in hand
  jitter?: number;
  /**
   * When true, alternate the tossing hand between reps, carrying the ball
   * across (a brief handoff) between tosses. Reads as "both hands take turns".
   * Default false (single-hand toss-to-self).
   */
  alternating?: boolean;
  /**
   * Only meaningful with `alternating`. Probability (0–1) of switching hands
   * after a catch; otherwise the same hand re-throws. < 1 gives a more organic,
   * less metronomic cadence. Default 0.6.
   */
  switchChance?: number;
  ballColor?: string;
  existingContext?: PhysicsContext;
  existingLoop?: PhysicsLoop;
  existingBall?: PhysicsBall;
}

export interface ArcPassOptions {
  from?: Hand;
  height?: number;
  count?: number; // 0 = loop until stopped
  dwell?: number; // proportion of cycle spent in hand/carry phases
  jitter?: number;
  alternating?: boolean;
  ballColor?: string;
  existingContext?: PhysicsContext;
  existingLoop?: PhysicsLoop;
  existingBall?: PhysicsBall;
}

export interface HandoffOptions {
  from?: Hand;
  count?: number; // 0 = loop until stopped
  dwell?: number; // proportion of cycle spent carrying in/out of the transfer
  alternating?: boolean;
  ballColor?: string;
  width?: number; // 0-1. 0 = hands meet at center (quick). 1 = wide sweep. Default 0.5.
  existingContext?: PhysicsContext;
  existingLoop?: PhysicsLoop;
  existingBall?: PhysicsBall;
}

export interface DropOptions {
  from?: Hand;
  height?: number;
  count?: number; // 0 = loop until stopped
  dwell?: number; // proportion of cycle spent carrying/settling in hand
  jitter?: number;
  ballColor?: string;
  width?: number; // 0-1. 0 = vertical drop. 1 = full lateral separation. Default 0.3.
  existingContext?: PhysicsContext;
  existingLoop?: PhysicsLoop;
  existingBall?: PhysicsBall;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function jitterOffset(magnitude: number, jitter: number): number {
  return (Math.random() - 0.5) * 2 * magnitude * clamp(jitter, 0, 1);
}

export function withJitter(base: number, magnitude: number, jitter: number): number {
  return base + jitterOffset(magnitude, jitter);
}

export function oppositeHand(hand: Hand): Hand {
  return hand === "left" ? "right" : "left";
}

export function getHandRestPosition(letter: LetterInstance, hand: Hand): Point {
  const shoulder = letter.arms[hand].getShoulderPosition();
  const arm = letter.arms[hand];
  const defaultLength = arm.getCurrentLength() || 17;
  const xOffset = hand === "left" ? -defaultLength * 0.55 : defaultLength * 0.55;
  const yOffset = defaultLength * 0.7;

  return {
    x: shoulder.x + xOffset,
    y: shoulder.y + yOffset,
  };
}

export function moveBall(
  ball: SVGCircleElement,
  x: number,
  y: number,
  visible = true,
): void {
  ball.setAttribute("cx", String(x));
  ball.setAttribute("cy", String(y));
  ball.style.opacity = visible ? "1" : "0";
}

export function hideBall(ball: SVGCircleElement): void {
  ball.style.opacity = "0";
}

export function registerAnimation(
  ctx: PhraseControllerContext,
  anim: JSAnimation,
): JSAnimation {
  ctx.cleanupAnimations.add(anim);

  const release = () => {
    ctx.cleanupAnimations.delete(anim);
  };

  if ("then" in anim && typeof anim.then === "function") {
    void anim.then(release).catch(release);
  }

  return anim;
}

export function animateValue<T extends object>(
  ctx: PhraseControllerContext,
  target: T,
  params: Record<string, any>,
): Promise<void> {
  return new Promise((resolve) => {
    const anim = animate(target, {
      ...params,
      onComplete: () => {
        ctx.cleanupAnimations.delete(anim);
        params.onComplete?.();
        resolve();
      },
    });
    ctx.cleanupAnimations.add(anim);
  });
}

export async function animateHandTo(
  ctx: PhraseControllerContext,
  hand: Hand,
  target: Point,
  duration: number,
  ease: string = "inOutSine",
): Promise<void> {
  const arm = ctx.letter.arms[hand];
  const start = arm.getHandPosition();
  const proxy = { x: start.x, y: start.y };

  await animateValue(ctx, proxy, {
    x: target.x,
    y: target.y,
    duration,
    ease,
    onUpdate: () => {
      void arm.setHandPosition({ x: proxy.x, y: proxy.y }, { duration: 0 });
    },
  });
}

export async function animateHandsTo(
  ctx: PhraseControllerContext,
  targets: Partial<Record<Hand, Point>>,
  duration: number,
  ease: string = "inOutSine",
): Promise<void> {
  await Promise.all(
    (Object.entries(targets) as [Hand, Point | undefined][])
      .filter(([, point]) => !!point)
      .map(([hand, point]) => animateHandTo(ctx, hand, point!, duration, ease)),
  );
}

export async function animateHandWithBallTo(
  ctx: PhraseControllerContext,
  hand: Hand,
  ball: SVGCircleElement,
  from: Point,
  to: Point,
  duration: number,
  lifecycle: ReturnType<typeof createControllerLifecycle>,
  ease: string = "inOutSine",
): Promise<void> {
  const proxy = { x: from.x, y: from.y };

  moveBall(ball, from.x, from.y, true);
  setControllerGaze(lifecycle, from);

  await animateValue(ctx, proxy, {
    x: to.x,
    y: to.y,
    duration,
    ease,
    onUpdate: () => {
      const pos = { x: proxy.x, y: proxy.y };
      moveBall(ball, pos.x, pos.y, true);
      setControllerGaze(lifecycle, pos);
      void ctx.letter.arms[hand].setHandPosition(pos, { duration: 0 });
    },
  });
}

export function setControllerGaze(
  lifecycle: ReturnType<typeof createControllerLifecycle>,
  target: Point | null,
): void {
  lifecycle.setGazeTarget(target);
}

export function destroyPhraseContext(ctx: PhraseControllerContext): void {
  ctx.cleanupAnimations.forEach((anim) => {
    try {
      anim.revert();
    } catch {
      // ignore
    }
  });
  ctx.cleanupAnimations.clear();

  ctx.ballElements.forEach((ball) => {
    try {
      ball.remove();
    } catch {
      // ignore
    }
  });

  ctx.letter.arms.stopAnimations();
}

export function buildPhraseController(
  lifecycle: ReturnType<typeof createControllerLifecycle>,
  ctx: PhraseControllerContext,
  stopImpl: () => Promise<void>,
): JugglingController {
  return {
    async stop() {
      return stopImpl();
    },

    completed: lifecycle.state.stopped,

    destroy() {
      lifecycle.markDestroyed();
      resetEphemeralControllerState(lifecycle.state);
      destroyPhraseContext(ctx);
      resolveStoppedOnce(lifecycle.state);
    },

    get gazeTarget() {
      return lifecycle.state.gazeTarget;
    },

    get active() {
      return lifecycle.state.active;
    },

    get dropCount() {
      return 0;
    },
  };
}