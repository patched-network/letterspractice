/**
 * Coordinate space mapping between sani.js and letterPeople
 *
 * Coordinate Systems:
 * - sani.js: y-up, origin at bottom-left, abstract units (innerWidth × innerHeight)
 * - letterPeople: y-down, origin at top-left, SVG pixels
 */

import type { Point, SaniDimensions, StageDimensions } from './types';
import type { LetterInstance } from '../../types';

/**
 * Normalize a sani.js position to [0,1] range
 *
 * In sani.js:
 * - y=0 is the catch baseline (where hands are at rest)
 * - Negative y = hands dip down during catch motion
 * - Positive y = balls thrown upward
 * - Total range: [-catchHeight, innerHeight - catchHeight]
 *
 * @param saniPos - Position in sani.js coordinate space
 * @param dimensions - Sani.js space dimensions
 * @returns Normalized position where both x and y are in [0,1]
 */
export function normalizeSaniPosition(
  saniPos: Point,
  dimensions: SaniDimensions
): Point {
  // X: simple normalization
  const normalizedX = saniPos.x / dimensions.innerWidth;

  // Y: The full vertical range is from -catchHeight (hand dips) to +(innerHeight - catchHeight) (peak throws)
  // Shift everything up by catchHeight to get range [0, innerHeight]
  // Then normalize to [0,1]
  const normalizedY = (saniPos.y + dimensions.catchHeight) / dimensions.innerHeight;

  return {
    x: normalizedX,
    y: normalizedY
  };
}

/**
 * Calculate the "juggling stage" dimensions in letter coordinate space
 *
 * The stage dimensions are calculated from the sani.js physics dimensions,
 * scaled to fit the letter's size. This preserves the aspect ratio and
 * throw height relationships calculated by the physics simulation.
 *
 * @param letter - LetterInstance to calculate stage for
 * @param dimensions - Sani.js physics dimensions from prepareSiteswap()
 * @returns Stage dimensions in letter coordinate space
 */
export function calculateStage(
  letter: LetterInstance,
  dimensions: SaniDimensions
): StageDimensions {
  const leftShoulder = letter.arms.left.getShoulderPosition();
  const rightShoulder = letter.arms.right.getShoulderPosition();

  // Stage is centered between shoulders
  const centerX = (leftShoulder.x + rightShoulder.x) / 2;
  // Shoulder level is the baseline (y = 0 in sani space)
  const centerY = (leftShoulder.y + rightShoulder.y) / 2;

  // Calculate scale factor to convert sani units to letter pixels
  // Use shoulder width as the base scale for the letter's size
  // We want the stage width to be roughly 1.5× shoulder width (gives room for tosses)

  // Scale sani dimensions to letter space, preserving aspect ratio
  // This ensures throw heights scale correctly across different patterns
  
  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
  const targetStageWidth = shoulderWidth * 1.5;
  const wScaleFactor = targetStageWidth / dimensions.innerWidth;
  
  const stageWidth = dimensions.innerWidth * wScaleFactor;
  const stageHeight = dimensions.innerHeight * 0.1; // may need adjustment based on letter svg bounding box

  console.log(
    `[coordinate-mapping] Stage calc: sani(${dimensions.innerWidth.toFixed(0)}×${dimensions.innerHeight.toFixed(0)}) ` +
    `× scale(${wScaleFactor.toFixed(3)}) = letter(${stageWidth.toFixed(0)}×${stageHeight.toFixed(0)})`
  );

  return {
    width: stageWidth,
    height: stageHeight,
    centerX,
    centerY
  };
}

/**
 * Map a sani.js position to letter coordinate space
 *
 * In sani.js:
 * - y=0 is the baseline (shoulder level where hands rest)
 * - Positive y = upward (throws)
 * - Negative y = downward (hand dips during catches)
 *
 * We map directly without normalization:
 * - sani y=0 → letter centerY (shoulder level / blue baseline)
 * - sani y>0 → letter y<centerY (upward on screen)
 * - sani y<0 → letter y>centerY (downward on screen)
 *
 * @param saniPos - Position in sani.js coordinate space
 * @param dimensions - Sani.js space dimensions
 * @param letter - LetterInstance for coordinate system
 * @returns Position in letter coordinate space (SVG pixels)
 */
export function mapSaniToLetter(
  saniPos: Point,
  dimensions: SaniDimensions,
  letter: LetterInstance
): Point {
  const stage = calculateStage(letter, dimensions);

  // X: Simple linear mapping
  // sani x: [0, innerWidth] → letter x: [centerX - width/2, centerX + width/2]
  const xScale = stage.width / dimensions.innerWidth;
  const letterX = stage.centerX - (stage.width / 2) + (saniPos.x * xScale);

  // Y: Map with centerY as the baseline (sani y=0)
  // Scale factor: how many letter pixels per sani pixel
  const yScale = stage.height / dimensions.innerHeight;
  // Flip y-axis: sani y-up becomes SVG y-down
  const letterY = stage.centerY - (saniPos.y * yScale);

  return {
    x: letterX,
    y: letterY
  };
}

/**
 * Map an array of sani.js positions to letter coordinate space
 *
 * @param saniPositions - Array of positions in sani.js coordinate space
 * @param dimensions - Sani.js space dimensions
 * @param letter - LetterInstance for coordinate system
 * @returns Array of positions in letter coordinate space
 */
export function mapSaniPathToLetter(
  saniPositions: Point[],
  dimensions: SaniDimensions,
  letter: LetterInstance
): Point[] {
  return saniPositions.map(pos => mapSaniToLetter(pos, dimensions, letter));
}

/**
 * Debug: Visualize stage boundaries
 * Creates SVG rectangle showing the calculated stage area
 * Also draws y=0 baseline (shoulder/resting hand height)
 *
 * @param letter - LetterInstance to visualize stage for
 * @param dimensions - Sani.js physics dimensions
 * @returns SVG rect element
 */
export function visualizeStage(
  letter: LetterInstance,
  dimensions: SaniDimensions
): SVGRectElement {
  const stage = calculateStage(letter, dimensions);
  

  // Stage rectangle
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(stage.centerX - stage.width / 2));
  rect.setAttribute('y', String(stage.centerY - stage.height / 2));
  rect.setAttribute('width', String(stage.width));
  rect.setAttribute('height', String(stage.height));
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', 'red');
  rect.setAttribute('stroke-width', '3');
  rect.setAttribute('stroke-dasharray', '10,5');
  rect.setAttribute('opacity', '0.8');
  rect.setAttribute('class', 'juggling-stage-debug');

  // Y=0 baseline (shoulder level / resting hand height)
  // In sani.js: y=0 is the catch baseline
  // This maps to centerY in letter space
  const baseline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  baseline.setAttribute('x1', String(stage.centerX - stage.width / 2));
  baseline.setAttribute('y1', String(stage.centerY));
  baseline.setAttribute('x2', String(stage.centerX + stage.width / 2));
  baseline.setAttribute('y2', String(stage.centerY));
  baseline.setAttribute('stroke', 'blue');
  baseline.setAttribute('stroke-width', '2');
  baseline.setAttribute('stroke-dasharray', '5,3');
  baseline.setAttribute('opacity', '0.8');
  baseline.setAttribute('class', 'juggling-stage-debug');

  // Add both to letter's SVG element
  letter.svgElement.appendChild(rect);
  letter.svgElement.appendChild(baseline);

  return rect;
}

/**
 * Debug: Log coordinate mapping details
 *
 * @param saniPos - Position in sani.js space
 * @param dimensions - Sani.js dimensions
 * @param letter - LetterInstance
 */
export function debugCoordinateMapping(
  saniPos: Point,
  dimensions: SaniDimensions,
  letter: LetterInstance
): void {
  const normalized = normalizeSaniPosition(saniPos, dimensions);
  const stage = calculateStage(letter, dimensions);
  const letterPos = mapSaniToLetter(saniPos, dimensions, letter);

  console.group('[coordinate-mapping] Debug');
  console.log('Sani position:', saniPos);
  console.log('Sani dimensions:', dimensions);
  console.log('Normalized [0,1]:', normalized);
  console.log('Stage:', stage);
  console.log('Letter position:', letterPos);
  console.groupEnd();
}
