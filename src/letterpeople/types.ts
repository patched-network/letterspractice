// Import attachment controller interfaces and their specific options/params
import type {
  MouthAttachment,
  EyesAttachment, // Assuming this will be the group controller for eyes
  ArmsAttachment, // Group controller for arms
  // EyeAttachment, // Individual eye controller, might be used by EyesAttachment internally
} from "./attachments/types"; // Import the new attachment controller types

import type { BodyController } from "./attachments/body";
import type { LegsAttachment } from "./attachments/legs";

import type {
  MouthParameters,
  MouthAppearanceOptions,
} from "./attachments/mouth"; // Keep these for LetterOptions

import type { Point } from "./util/geometry";

// Re-export for convenience if needed by consumers of the library for options
export type { MouthParameters, MouthAppearanceOptions };

// Import options for individual attachments if they are directly configurable via LetterOptions
// For example, if EyeOptions were still used directly in LetterOptions:
// import type { EyeOptions } from "./attachments/eye";

// Options for creating the base letter shape AND its attachments
export interface LetterOptions {
  // Base letter appearance
  color?: string;
  lineWidth?: number;
  // Renamed strokeColor and strokeWidth for consistency with other parts of the project
  borderColor?: string;
  borderWidth?: number;
  style?: "sans-serif" | "serif";

  // Debug options
  debug?: boolean; // When true, shows visual indicators like the descender baseline

  // --- Attachment Visibility Controls ---
  // Control which attachments are initially visible
  showEyes?: boolean; // Default: false for clean text mode
  showMouth?: boolean; // Default: false for clean text mode
  showArms?: boolean; // Default: false for clean text mode
  showEyebrows?: boolean; // Default: false
  eyebrowsWithEyes?: boolean; // Default: true (auto-show brows when eyes shown)
  showLegs?: boolean; // Default: false

  // --- Attachment Options ---
  // These options are for the *initial creation* of attachments.
  // The attachment controller instances will handle their own state and updates later.

  // Eye options (only used if showEyes is true)
  eyeSize?: number; // Simple override, could be part of a more complex EyeOptions

  // Mouth options (only used if showMouth is true)
  mouthParams?: Partial<MouthParameters>;
  mouthAppearance?: Partial<MouthAppearanceOptions>;

  // Arm options (only used if showArms is true)
  armLength?: number;
  armThickness?: number;
  armColor?: string;

  // Eyebrow options (only used if showEyebrows is true or eyebrowsWithEyes is true)
  eyebrowWidth?: number;
  eyebrowThickness?: number;
  eyebrowColor?: string;
  eyebrowArch?: number; // 0-1, default 0.25

  // Leg options (only used if showLegs is true)
  legColor?: string;
  legThickness?: number;
  legFootRadius?: number;
  legKneeBend?: number;
  legFloorY?: number;

  // Add other attachment-specific initial options here as new attachments are developed
  // e.g., eyebrowOptions?: Partial<EyebrowAppearanceOptions>;
}

// General animation options, can be used by high-level LetterInstance methods
export interface AnimationOptions {
  duration?: number;
  easing?: string;
  delay?: number;
  // Add other animation parameters as needed
}

// Animation parameters for anime.js integration with updateAppearance()
// Simplified API wrapper around anime.js AnimationParams
export interface AnimationParams {
  duration?: number;
  ease?: string;
  delay?: number;
  complete?: () => void;
  // Allow anime.js compatibility while keeping our documented API clean
  [key: string]: any;
}

// Transform function type for geometric letter transformations
export type TransformFunction = (word: Word) => (() => void) | void;

// Import Word type for transform function - we'll need to forward declare this
import type { Word } from "./Word";

// The main return type - Represents a fully constructed and controllable letter character
export interface LetterInstance {
  /** The root <svg> element of the letter */
  readonly svgElement: SVGElement;

  /**
   * Map of logical attachment point names to their coordinates relative to the SVG origin.
   * Still useful for initial placement and debugging.
   */
  readonly attachmentCoords: AttachmentList;

  /**
   * Renderer-independent body geometry this letter was built from (same
   * coordinate space as attachmentCoords; see LetterGeometry).
   */
  readonly geometry: LetterGeometry;

  /** The letter character this instance represents (e.g., 'L') */
  readonly character: string;

  /** The content group <g> element (may have a descender translate transform). Balls and other dynamic elements should be appended here, not to svgElement, to share the same coordinate space as arms. */
  readonly contentGroup: SVGGElement;

  /** Reference to the container element this letter was added to */
  readonly parentElement: Element;

  // --- Direct Accessors to Attachment Controllers ---
  readonly mouth: MouthAttachment;
  readonly eyes: EyesAttachment;
  readonly arms: ArmsAttachment;
  readonly body: BodyController;
  readonly legs: LegsAttachment;
  // readonly leftEyebrow?: EyebrowAttachment; // Example for future
  // readonly rightEyebrow?: EyebrowAttachment; // Example for future
  // ... other attachments

  /**
   * Updates the letter's appearance with new options, maintaining animations.
   * Simple properties (color, borders) are updated in-place.
   * Complex properties may require regeneration.
   * @param options Partial letter options to update
   * @param animationParams Optional animation parameters for the transition
   * @returns Promise that resolves when update completes
   */
  updateAppearance(
    options: Partial<LetterOptions>,
    animationParams?: AnimationParams,
  ): Promise<void>;

  /**
   * Get the bounding rectangle of this letter's SVG element
   * @returns DOMRect with position and dimensions
   */
  getBoundingRect(): DOMRect;

  /**
   * Get the center point of this letter relative to the page
   * @returns Coordinates of the letter's center point
   */
  getCenter(): { x: number; y: number };

  /**
   * Removes the letter's SVG element from the DOM and performs any necessary cleanup.
   */
  destroy(): void;

  // --- High-Level Expression/Action Methods (Examples - to be implemented later) ---
  /**
   * Makes the letter express a specific emotion.
   * This method will coordinate animations across multiple attachments.
   * @param emotion The emotion to express (e.g., 'happy', 'sad', 'shocked', 'neutral').
   * @param options Optional animation parameters for the transition.
   * @returns A Promise that resolves when the expression animation completes.
   */
  // express(emotion: string, options?: AnimationOptions): Promise<void>;

  /**
   * Triggers a brief "speak" animation, typically a quick mouth movement.
   * @param options Optional animation parameters.
   * @returns A Promise that resolves when the speak animation completes.
   */
  // speakPulse(options?: AnimationOptions): Promise<void>;

  // --- Potential Future General Methods ---
  // updateBaseAppearance(newOptions: Partial<Pick<LetterOptions, 'color' | 'lineWidth' | ...>>): void;
  // setPosition(x: number, y: number): void; // If managing position outside CSS
  // wiggle(options?: AnimationOptions): void;
}

/**
 * One filled + outlined shape of a letter body, as SVG path data.
 *
 * Coordinates are letter-local viewBox units: origin top-left, y-down,
 * VIEWBOX_HEIGHT (100) tall, baseline at y = VIEWBOX_HEIGHT.
 * Holes are expressed via winding / fillRule within a single `d`.
 */
export interface LetterPart {
  d: string;
  /** Omitted → SVG default ('nonzero'). */
  fillRule?: "nonzero" | "evenodd";
  /** Omitted → SVG default ('miter'). */
  strokeLinejoin?: "round";
  /** Omitted → SVG default ('butt'). */
  strokeLinecap?: "butt";
}

/**
 * @internal
 * Renderer-independent output of a letter shape function (e.g., L-uppercase.ts).
 * Pure data — no DOM. `geometryToSvg()` (letters/toSvg.ts) turns it into the
 * base SVG; other renderers (e.g. three.js via SVGLoader) can consume `parts`.
 */
export interface LetterGeometry {
  /** [minX, minY, width, height] in letter-local units. */
  viewBox: [number, number, number, number];
  /** Class for the root <svg>, e.g. "letter-base letter-A-uppercase". */
  className: string;
  /** Body shapes in paint order (later parts draw on top). */
  parts: LetterPart[];
  attachments: AttachmentList;
}

export interface AttachmentList {
  mouth: Point;
  leftEye: Point;
  rightEye: Point;
  leftLeg: Point;
  rightLeg: Point;
  leftArm: Point;
  rightArm: Point;
  hat: Point;
}
