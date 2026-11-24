/**
 * ball-transfer — Cross-actor ball transfer utilities.
 *
 * Transfers a PhysicsBall from one actor's PhysicsContext to another,
 * with proper coordinate space conversion. Supports both instant transfer
 * and animated arc (stage-pixel space).
 *
 * @packageDocumentation
 */

import type { Actor } from "../../../scene/Stage";
import type { Point } from "../types";
import {
  removeBall,
  addBallAt,
  placeBallInHand,
  type PhysicsContext,
  type PhysicsBall,
  type Hand,
} from "./physics-core";

export interface TransferBallOptions {
  /** Duration of the animated arc in ms. Default 600. */
  duration?: number;
  /** Arc height in stage pixels above the straight line. Default 80. */
  arcHeight?: number;
  /** Color of the transfer ball. If not set, uses source ball's color. */
  color?: string;
  /** Hand to place the ball in on arrival. If not set, ball arrives in-flight/grounded. */
  destinationHand?: Hand;
}

/**
 * Instantly transfer a ball from one actor's physics context to another.
 *
 * The source ball is removed. A new ball is created in the destination context
 * at the coordinate-space-converted position.
 */
export function transferBallInstant(
  fromCtx: PhysicsContext,
  toCtx: PhysicsContext,
  ball: PhysicsBall,
  fromActor: Actor,
  toActor: Actor,
  destinationHand?: Hand,
): PhysicsBall {
  // 1. Get ball position in source actor's SVG-local coords
  const localPos = { ...ball.position };

  // 2. Convert to stage-pixel coords
  const stagePos = fromActor.toStagePoint(localPos);

  // 3. Convert to destination actor's SVG-local coords
  const destLocalPos = toActor.toLocalPoint(stagePos);

  // 4. Get ball color from the element
  const color = ball.element.getAttribute("fill") || "#3B82F6";
  const radius = ball.radius;

  // 5. Remove from source context (removes DOM element too)
  removeBall(fromCtx, ball);

  // 6. Create new ball in destination context
  const newBall = addBallAt(toCtx, destLocalPos, "held", color, radius);
  newBall.element.style.opacity = "1";

  // 7. If destination hand specified, place in hand
  if (destinationHand) {
    placeBallInHand(toCtx, newBall, destinationHand);
  }

  return newBall;
}

/**
 * Animated ball transfer: the ball follows an arc in stage-pixel space
 * from one actor to another.
 *
 * Creates a temporary HTML div for the arc animation, then creates
 * a new ball in the destination context on arrival.
 */
export async function transferBallAnimated(
  fromCtx: PhysicsContext,
  toCtx: PhysicsContext,
  ball: PhysicsBall,
  fromActor: Actor,
  toActor: Actor,
  stageContainer: HTMLElement,
  options: TransferBallOptions = {},
): Promise<PhysicsBall> {
  const duration = options.duration ?? 600;
  const arcHeight = options.arcHeight ?? 80;
  const destinationHand = options.destinationHand;

  // 1. Get ball visual position in stage-pixel coords
  const localPos = { ...ball.position };
  const startStage = fromActor.toStagePoint(localPos);

  // 2. Determine destination position in stage-pixel coords
  let endStage: Point;
  if (destinationHand) {
    const destHandPos = toCtx.hands[destinationHand].restPosition;
    endStage = toActor.toStagePoint(destHandPos);
  } else {
    // Default: center of destination actor
    const center = toActor.instance.getCenter();
    endStage = { x: center.x, y: center.y };
  }

  // 3. Get ball visual properties
  const color =
    options.color || ball.element.getAttribute("fill") || "#3B82F6";
  const radius = ball.radius;

  // Compute visual radius: SVG radius → stage pixels
  // The SVG viewBox is mapped to the wrapper's pixel dimensions, then scaled by projection
  const svg = fromActor.instance.svgElement as SVGSVGElement;
  const vb = svg.viewBox.baseVal;
  const hPx = svg.clientHeight || parseFloat(svg.style.height) || 150;
  const svgToPixelScale = hPx / vb.height;
  const proj = fromActor.stage.project(fromActor.z);
  const visualRadius = radius * svgToPixelScale * proj.scale;

  // 4. Remove ball from source context
  removeBall(fromCtx, ball);

  // 5. Create temporary transfer element (absolutely positioned div)
  const transferEl = document.createElement("div");
  transferEl.style.cssText = `
    position: absolute;
    width: ${visualRadius * 2}px;
    height: ${visualRadius * 2}px;
    border-radius: 50%;
    background: ${color};
    pointer-events: none;
    z-index: 9999;
    transform: translate(-50%, -50%);
  `;
  stageContainer.appendChild(transferEl);

  // 6. Animate along a parabolic arc
  const startTime = performance.now();

  await new Promise<void>((resolve) => {
    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);

      // Linear interpolation for x/y
      const x = startStage.x + (endStage.x - startStage.x) * t;
      const baseY = startStage.y + (endStage.y - startStage.y) * t;

      // Parabolic arc: peaks at t=0.5
      const arcOffset = -4 * arcHeight * t * (1 - t);
      const y = baseY + arcOffset;

      transferEl.style.left = `${x}px`;
      transferEl.style.top = `${y}px`;

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });

  // 7. Remove transfer element
  transferEl.remove();

  // 8. Convert arrival position to destination actor's SVG-local coords
  const destLocalPos = toActor.toLocalPoint(endStage);

  // 9. Create new ball in destination context
  const newBall = addBallAt(
    toCtx,
    destLocalPos,
    destinationHand ? "held" : "in-flight",
    color,
    radius,
  );
  newBall.element.style.opacity = "1";

  if (destinationHand) {
    placeBallInHand(toCtx, newBall, destinationHand);
  }

  return newBall;
}