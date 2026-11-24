/**
 * Prop system type definitions.
 *
 * Props are interactive scene objects that letter-characters interact with.
 * A prop is NOT just an SVG — it's a "decorator" that owns both the visual
 * element AND interaction verbs that orchestrate the prop's animations
 * alongside the actor's body (arms, eyes, mouth).
 *
 * Two placement modes:
 *
 *   Staged — fixed position on the stage (e.g. desktop computer).
 *            Actors reach toward it; it doesn't move with them.
 *
 *   Held   — attached to an actor's hand (e.g. book, knife).
 *            Moves with the arm. Verbs control the holding arm's
 *            pose and animate interaction with the other hand/eyes.
 */

import type { Point } from "../util/geometry";
import type { Actor, Stage } from "../scene/Stage";

// ─── Anchors ──────────────────────────────────────────────────
//
// Named spatial points on a prop's geometry, declared per-prop
// as a string-literal union:
//
//   type ComputerAnchor = 'screen' | 'keyboardLeft' | 'keyboardRight';
//
// Coordinates are in the prop's local SVG coordinate space.

export type PropAnchors<K extends string = string> = Record<K, Point>;

// ─── Static visual output ─────────────────────────────────────

/**
 * The geometry produced by a prop factory — no behavior, no actor coupling.
 * Anchor coordinates are in the prop's local SVG space.
 */
export interface PropElements<K extends string = string> {
  readonly svg: SVGGElement;
  readonly anchors: PropAnchors<K>;
  readonly width: number;
  readonly height: number;
}

// ─── Placement ────────────────────────────────────────────────

export interface StagePlacement {
  kind: "staged";
  /** Horizontal position in stage pixels */
  x: number;
  /** Horizontal position in stage reference-frame units */
  xRef?: number;
  /** Depth 0 (horizon) – 100 (front) */
  z: number;
}

export interface HeldPlacement {
  kind: "held";
  actor: Actor;
  hand: "left" | "right";
}

export type PropPlacement = StagePlacement | HeldPlacement;

// ─── Controller ───────────────────────────────────────────────

/**
 * Base interface for a mounted prop instance.
 *
 * Concrete controllers (ComputerPropController, BookPropController, …)
 * extend this with their own verb methods. Verbs accept Actor arguments
 * so they can orchestrate both prop animation and actor body parts.
 */
export interface PropController<K extends string = string> {
  readonly elements: PropElements<K>;
  readonly placement: PropPlacement;

  /**
   * Get an anchor transformed to stage-relative pixel coordinates.
   *
   * For staged props: prop's stage position + anchor offset (scaled).
   * For held props: derived from the holding actor's current hand position.
   *
   * Use cases:
   *   - Direction vector for eyes.lookAt()  (approximate — lookAt
   *     normalises magnitude and just uses the angle)
   *   - Input to a future actor.toLocalPoint() for precise hand targeting
   */
  getStagePoint(anchor: K): Point;

  /** Remove prop elements from the DOM and clean up running animations. */
  unmount(): void;
}

// ─── Factories ────────────────────────────────────────────────

/** Creates a prop placed at a fixed stage position. */
export type StagedPropFactory<C extends PropController> = (
  stage: Stage,
  placement: StagePlacement,
) => C;

/** Creates a prop held in an actor's hand. */
export type HeldPropFactory<C extends PropController> = (
  stage: Stage,
  placement: HeldPlacement,
) => C;
