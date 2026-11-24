import type {
  LetterInstance,
  // No longer need AttachmentElements from here
  // AnimationOptions, // Keep for future high-level methods
  LetterOptions,
  LetterGeometry,
  MouthParameters,
  MouthAppearanceOptions,
  AnimationParams,
} from "./types";
import type { BrowsController } from "./attachments/eyebrow";
import type { Point } from "./util/geometry";
import { animate } from "animejs";

// Import the new attachment controller INTERFACES
import type {
  MouthAttachment,
  EyesAttachment,
  EyeAttachment,
  ArmAttachment,
  ArmsAttachment,
  // AttachmentAnimationOptions, // Not used directly in this file yet
  // attachmentTypes // Not used directly in this file yet
} from "./attachments/types";

// Import SVG element creators (these are still needed)
import {
  createEye,
  EyeOptions,
  createEyeController,
  createEyesGroupController,
} from "./attachments/eye";
import {
  createMorphingMouth,
  createMorphingMouthController,
  DEFAULT_MOUTH_PARAMS,
} from "./attachments/mouth";
import {
  createArm,
  createArmController,
  createArmsGroupController,
} from "./attachments/arms";
import { createBodyController } from "./attachments/body";
import { createLegsController } from "./attachments/legs";
import type { LegsAttachment } from "./attachments/legs";
import {
  createEyebrow,
  createEyebrowController,
  createBrowsController,
  calculateEyebrowPosition,
} from "./attachments/eyebrow";
import { blendColors } from "./util/color";
import { geometryToSvg } from "./letters/toSvg";
import {
  letterRenderers,
  DESCENDER_DEPTH,
  DESCENDER_LETTERS,
} from "./letters/registry";
import { VIEWBOX_HEIGHT } from "./letters/CONSTS";

export {
  getLetterGeometry,
  DESCENDER_DEPTH,
  DESCENDER_LETTERS,
} from "./letters/registry";

// Import Word utility
export { Word } from "./Word";
export type { WordOptions } from "./Word";

// Re-export LetterInstance type for consumers
export type { LetterInstance, LetterGeometry, LetterPart } from "./types";

// Color utilities
export * from "./util/color";

const EXTENDED_VIEWBOX_HEIGHT = VIEWBOX_HEIGHT + DESCENDER_DEPTH; // Should be 135
const SVG_NS = "http://www.w3.org/2000/svg";

export function createLetter(
  letter: string,
  target: Element,
  options?: LetterOptions,
): LetterInstance | null {
  // console.log(`Options: \n${JSON.stringify(options)}`);

  const renderer = letterRenderers[letter];
  if (!renderer) {
    console.warn(`Renderer for letter "${letter}" not found.`);
    return null;
  }

  try {
    // 1. Get renderer-independent geometry, and build the base SVG from it
    const geometry = renderer(options);
    const originalSvg = geometryToSvg(geometry, options);
    const attachmentCoords = geometry.attachments;

    // 2. Width of the letter's own viewBox
    const originalWidth = geometry.viewBox[2];

    // 3. Create a new SVG element with extended height for consistent vertical space
    // Add padding to prevent stroke clipping (strokes extend beyond path bounds)
    const strokePadding =
      (options?.borderWidth || 4) + (options?.lineWidth || 20) / 2;
    const paddedWidth = originalWidth + strokePadding * 2;
    const paddedHeight = EXTENDED_VIEWBOX_HEIGHT + strokePadding * 2;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute(
      "viewBox",
      `-${strokePadding} -${strokePadding} ${paddedWidth} ${paddedHeight}`,
    );
    svg.setAttribute(
      "class",
      originalSvg.getAttribute("class") || "letter-base",
    );

    // 4. Create a content group for all letter parts and attachments
    const contentGroup = document.createElementNS(SVG_NS, "g");

    // 5. For descender letters, apply a transform to shift the content down
    const isDescender = DESCENDER_LETTERS.has(letter);
    if (isDescender) {
      contentGroup.setAttribute(
        "transform",
        `translate(0, ${DESCENDER_DEPTH})`,
      );
    }

    // 6. Move all original SVG content to the content group
    while (originalSvg.firstChild) {
      contentGroup.appendChild(originalSvg.firstChild);
    }

    // 7. Add the content group to the new SVG
    svg.appendChild(contentGroup);
    svg.id = `${Math.random()}`;

    // 7b. Add the debug visualization of the descender baseline if requested
    if (options?.debug) {
      const baselineLine = document.createElementNS(SVG_NS, "line");
      baselineLine.setAttribute("x1", "0");
      baselineLine.setAttribute("y1", String(VIEWBOX_HEIGHT));
      baselineLine.setAttribute("x2", String(originalWidth));
      baselineLine.setAttribute("y2", String(VIEWBOX_HEIGHT));
      baselineLine.setAttribute("stroke", "red");
      baselineLine.setAttribute("stroke-width", "1");
      baselineLine.setAttribute("stroke-dasharray", "4");

      // Create a debug group to hold these elements
      const debugGroup = document.createElementNS(SVG_NS, "g");
      debugGroup.setAttribute("class", "letter-debug");
      debugGroup.appendChild(baselineLine);

      svg.appendChild(debugGroup);
    }

    // 8. Create Attachment SVG Elements AND their Controllers
    // Only create attachments if they are requested via visibility flags
    let mouthController: MouthAttachment;

    const initialMouthParams: MouthParameters = {
      ...DEFAULT_MOUTH_PARAMS,
      ...(options?.mouthParams || {}),
    };

    const mouthSvgElement = createMorphingMouth(
      // Creates the <g> element for the mouth
      attachmentCoords.mouth.x,
      attachmentCoords.mouth.y,
      initialMouthParams,
      options?.mouthAppearance,
    );
    contentGroup.appendChild(mouthSvgElement); // Add the mouth's SVG to the content group

    // Now, create the controller for this mouth element
    mouthController = createMorphingMouthController(
      mouthSvgElement,
      initialMouthParams,
      options?.mouthAppearance,
      attachmentCoords.mouth, // Pass the coordinate for potential re-creation logic
    );

    let leftEyeCtrl: EyeAttachment;
    const leftEyeSvgElement = createEye(
      attachmentCoords.leftEye.x,
      attachmentCoords.leftEye.y,
      { size: options?.eyeSize },
    );
    contentGroup.appendChild(leftEyeSvgElement);
    leftEyeCtrl = createEyeController(
      leftEyeSvgElement,
      {
        size: options?.eyeSize,
      },
      attachmentCoords.leftEye,
    );

    let rightEyeCtrl: EyeAttachment;

    const rightEyeSvgElement = createEye(
      attachmentCoords.rightEye.x,
      attachmentCoords.rightEye.y,
      { size: options?.eyeSize },
    );
    contentGroup.appendChild(rightEyeSvgElement);
    rightEyeCtrl = createEyeController(
      rightEyeSvgElement,
      {
        size: options?.eyeSize,
      },
      attachmentCoords.rightEye,
    );

    // Create eyebrows if requested
    const eyeSize = options?.eyeSize ?? 8; // Default eye size
    const eyebrowsWithEyes = options?.eyebrowsWithEyes ?? true;
    let browsController: BrowsController | undefined;

    // Resolve eyebrow color: use configured color or blend border + fill for better contrast
    const eyebrowColor = (() => {
      if (options?.eyebrowColor) return options.eyebrowColor;
      const borderColor = options?.borderColor ?? "black";
      const fillColor = options?.color ?? "#faf";
      // Blend 60% fill + 40% border for a color that contrasts with both
      return blendColors(fillColor, borderColor, 0.4);
    })();

    // Always create eyebrows (they start hidden)
    const leftBrowPosition = calculateEyebrowPosition(
      attachmentCoords.leftEye,
      eyeSize,
    );
    const leftBrowSvgElement = createEyebrow({
      x: leftBrowPosition.x,
      y: leftBrowPosition.y,
      side: "left",
      width: options?.eyebrowWidth,
      thickness: options?.eyebrowThickness,
      color: eyebrowColor,
      arch: options?.eyebrowArch,
    });
    contentGroup.appendChild(leftBrowSvgElement);
    const leftBrowCtrl = createEyebrowController(leftBrowSvgElement, {
      x: leftBrowPosition.x,
      y: leftBrowPosition.y,
      side: "left",
      width: options?.eyebrowWidth,
      thickness: options?.eyebrowThickness,
      color: eyebrowColor,
      arch: options?.eyebrowArch,
    });

    const rightBrowPosition = calculateEyebrowPosition(
      attachmentCoords.rightEye,
      eyeSize,
    );
    const rightBrowSvgElement = createEyebrow({
      x: rightBrowPosition.x,
      y: rightBrowPosition.y,
      side: "right",
      width: options?.eyebrowWidth,
      thickness: options?.eyebrowThickness,
      color: eyebrowColor,
      arch: options?.eyebrowArch,
    });
    contentGroup.appendChild(rightBrowSvgElement);
    const rightBrowCtrl = createEyebrowController(rightBrowSvgElement, {
      x: rightBrowPosition.x,
      y: rightBrowPosition.y,
      side: "right",
      width: options?.eyebrowWidth,
      thickness: options?.eyebrowThickness,
      color: eyebrowColor,
      arch: options?.eyebrowArch,
    });

    browsController = createBrowsController(
      leftBrowCtrl,
      rightBrowCtrl,
      eyebrowsWithEyes,
    );

    // Create the eyes group controller with brows
    const eyesController: EyesAttachment = createEyesGroupController(
      leftEyeCtrl,
      rightEyeCtrl,
      browsController,
      eyebrowsWithEyes,
    );

    // Create arm controllers
    let leftArmCtrl: ArmAttachment;
    const leftArmSvgElement = createArm({
      x: attachmentCoords.leftArm.x,
      y: attachmentCoords.leftArm.y,
      length: options?.armLength || 15,
      thickness: options?.armThickness || 3,
      fillColor: options?.armColor || "black",
      angle: 150, // Default angle pointing outward left
    });
    contentGroup.appendChild(leftArmSvgElement);
    leftArmCtrl = createArmController(
      leftArmSvgElement,
      {
        x: attachmentCoords.leftArm.x,
        y: attachmentCoords.leftArm.y,
        length: options?.armLength || 15,
        thickness: options?.armThickness || 3,
        fillColor: options?.armColor || "black",
        angle: 150,
      },
      contentGroup,
    );

    let rightArmCtrl: ArmAttachment;
    const rightArmSvgElement = createArm({
      x: attachmentCoords.rightArm.x,
      y: attachmentCoords.rightArm.y,
      length: options?.armLength || 15,
      thickness: options?.armThickness || 3,
      fillColor: options?.armColor || "black",
      angle: 30, // Default angle pointing outward right
    });
    contentGroup.appendChild(rightArmSvgElement);
    rightArmCtrl = createArmController(
      rightArmSvgElement,
      {
        x: attachmentCoords.rightArm.x,
        y: attachmentCoords.rightArm.y,
        length: options?.armLength || 15,
        thickness: options?.armThickness || 3,
        fillColor: options?.armColor || "black",
        angle: 30,
      },
      contentGroup,
    );

    // Create arms group controller
    const armsController: ArmsAttachment = createArmsGroupController(
      leftArmCtrl,
      rightArmCtrl,
    );

    // 9. Append the complete SVG to the target container
    target.appendChild(svg);

    // 10. Create and return the LetterInstance object
    const bodyController = createBodyController(svg);

    // Create legs controller (always created, starts hidden)
    const legsController: LegsAttachment = createLegsController(
      contentGroup,
      bodyController,
      svg,
      {
        leftHip: attachmentCoords.leftLeg,
        rightHip: attachmentCoords.rightLeg,
        floorY: options?.legFloorY,
        color: options?.legColor,
        thickness: options?.legThickness,
        footRadius: options?.legFootRadius,
        kneeBend: options?.legKneeBend,
      },
    );

    const instance: LetterInstance = {
      svgElement: svg,
      contentGroup,
      geometry,
      attachmentCoords: attachmentCoords, // Still useful for reference
      character: letter,
      parentElement: target,

      // Assign the created controller instances
      mouth: mouthController,
      eyes: eyesController,
      arms: armsController,
      body: bodyController,
      legs: legsController,

      updateAppearance: async (
        newOptions: Partial<LetterOptions>,
        animationParams?: AnimationParams,
      ): Promise<void> => {
        // Handle noop style parameter with warning
        if (newOptions.style !== undefined) {
          console.warn(
            `updateAppearance: 'style' parameter (${newOptions.style}) is currently a noop - no letters switch on it`,
          );
        }

        // Find all elements with letter-path class (excluding attachments)
        const letterPaths = svg.querySelectorAll(".letter-path");

        if (letterPaths.length === 0) {
          return; // No paths to animate
        }

        // Apply updates immediately if no animation requested
        if (!animationParams) {
          // Direct attribute updates without animation
          letterPaths.forEach((path) => {
            if (
              newOptions.color !== undefined &&
              path.getAttribute("fill") &&
              path.getAttribute("fill") !== "none"
            ) {
              path.setAttribute("fill", newOptions.color);
            }
            if (
              newOptions.borderColor !== undefined &&
              path.getAttribute("stroke") &&
              path.getAttribute("stroke") !== "none"
            ) {
              path.setAttribute("stroke", newOptions.borderColor);
            }
            if (
              newOptions.borderWidth !== undefined &&
              path.getAttribute("stroke-width")
            ) {
              path.setAttribute("stroke-width", String(newOptions.borderWidth));
            }
          });
          return;
        }

        // Build anime.js animation object - let anime.js handle all interpolation!
        const animationProps: any = {
          duration: animationParams.duration || 250,
          ease: animationParams.ease || "outQuad",
          delay: animationParams.delay || 0,
        };

        // Add properties that need to be animated
        if (newOptions.color !== undefined) {
          animationProps.fill = newOptions.color;
        }
        if (newOptions.borderColor !== undefined) {
          animationProps.stroke = newOptions.borderColor;
        }
        if (newOptions.borderWidth !== undefined) {
          animationProps["stroke-width"] = newOptions.borderWidth;
        }

        // Let anime.js do all the heavy lifting!
        return new Promise<void>((resolve) => {
          animate(letterPaths, {
            ...animationProps,
            onComplete: () => {
              if (animationParams.complete) {
                animationParams.complete();
              }
              resolve();
            },
          });
        });
      },

      getBoundingRect: (): DOMRect => {
        return svg.getBoundingClientRect();
      },

      getCenter: (): { x: number; y: number } => {
        const rect = svg.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      },

      destroy: (): void => {
        legsController.destroy();
        // Cursor tracking holds the eyes in a shared per-frame loop until
        // stopped; a removed letter would otherwise stay in it for good.
        eyesController.stopTracking();
        svg.remove();
        // If attachment controllers have their own destroy methods for cleanup
        // (e.g., removing event listeners they set up), call them here:
        // mouthController.destroy?.();
        // eyesController.destroy?.();
      },
    };

    if (options?.showArms) {
      instance.arms.show({ duration: 0 });
    } else {
      instance.arms.hide({ duration: 0 });
    }

    if (options?.showMouth) {
      instance.mouth.show({ duration: 0 });
    } else {
      instance.mouth.hide({ duration: 0 });
    }

    if (options?.showEyes) {
      instance.eyes.show({ duration: 0 });
    } else {
      instance.eyes.hide({ duration: 0 });
    }

    // Handle explicit showEyebrows (independent of eyebrowsWithEyes)
    if (options?.showEyebrows && !options?.showEyes) {
      // If showEyebrows is true but showEyes is false, show brows independently
      instance.eyes.brows?.show({ duration: 0 });
    }

    if (options?.showLegs) {
      instance.legs.show({ duration: 0 });
      instance.legs.startSync();
    }

    return instance;
  } catch (error) {
    console.error(`Error rendering letter "${letter}":`, error);
    return null;
  }
}
