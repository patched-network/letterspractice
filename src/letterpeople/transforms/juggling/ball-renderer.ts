/**
 * Ball rendering for juggling animation
 */

import type { Ball, Point, HandPath } from './types';
import type { LetterInstance } from '../../types';

const svgNS = 'http://www.w3.org/2000/svg';

/**
 * Create a simple ball SVG element for phrase-based routines that do not use
 * the siteswap `Ball[]` preparation pipeline.
 */
export function createBallElement(
  letter: LetterInstance,
  color: string,
  radius: number = 4
): SVGCircleElement {
  const circle = document.createElementNS(svgNS, 'circle');
  circle.setAttribute('r', String(radius));
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'rgba(0, 0, 0, 0.3)');
  circle.setAttribute('stroke-width', '1');
  circle.setAttribute('class', 'juggling-ball');
  circle.style.opacity = '0';

  letter.contentGroup.appendChild(circle);
  return circle;
}

/**
 * Ball renderer class
 * Manages SVG circle elements for juggling balls
 * Uses pre-computed paths for efficient rendering
 *
 * @deprecated Use physics-core phrases (e.g. cascadePhrase) instead.
 */
export class BallRenderer {
  private container: SVGElement;
  private ballElements: Map<number, SVGCircleElement>;
  private balls: Ball[];

  constructor(
    letter: LetterInstance,
    balls: Ball[],
    letterBallPaths: HandPath[]
  ) {
    this.balls = balls;
    this.ballElements = new Map();

    // Use letter's content group so balls share coordinate space with arms
    this.container = letter.contentGroup;

    // Create SVG circles for each ball
    this.createBallElements();
  }

  /**
   * Create SVG circle elements for all balls
   */
  private createBallElements(): void {
    this.balls.forEach((ball, index) => {
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('r', '4'); // Ball radius in pixels (smaller for debugging)
      circle.setAttribute('fill', ball.color);
      circle.setAttribute('stroke', 'rgba(0, 0, 0, 0.3)');
      circle.setAttribute('stroke-width', '1');
      circle.setAttribute('class', 'juggling-ball');
      circle.setAttribute('data-ball-id', String(index));

      // Initially hidden (will show when animation starts)
      circle.style.opacity = '0';

      this.container.appendChild(circle);
      this.ballElements.set(index, circle);
    });
  }

  /**
   * Update ball positions from pre-computed paths
   * @param currentTime - Time in milliseconds from animation start
   * @param letterBallPaths - Pre-computed ball paths in letter coordinate space
   */
  updateFromPaths(currentTime: number, letterBallPaths: HandPath[]): void {
    letterBallPaths.forEach((ballPath, ballId) => {
      const circle = this.ballElements.get(ballId);
      if (!circle) return;

      // Find position at current time (same logic as hands)
      const nextIndex = ballPath.timings.findIndex(t => t > currentTime);
      const index = nextIndex === -1
        ? ballPath.timings.length - 1
        : Math.max(0, nextIndex - 1);

      if (index >= 0 && index < ballPath.positions.length) {
        const pos = ballPath.positions[index];
        circle.setAttribute('cx', String(pos.x));
        circle.setAttribute('cy', String(pos.y));
        circle.style.opacity = '1';
      } else {
        // Ball not visible at this time
        circle.style.opacity = '0';
      }
    });
  }

  /**
   * Clean up - remove all ball elements
   */
  destroy(): void {
    this.ballElements.forEach(circle => {
      circle.remove();
    });
    this.ballElements.clear();
  }

  /**
   * Show/hide all balls
   */
  setVisible(visible: boolean): void {
    this.ballElements.forEach(circle => {
      circle.style.display = visible ? 'block' : 'none';
    });
  }

  /**
   * Get balls array (for debugging)
   */
  getBalls(): Ball[] {
    return this.balls;
  }

  /**
   * Export ball SVG elements with their current positions, then release
   * ownership so destroy() won't remove them. Used by gatherAndStop to
   * hand ball elements to the physics-core without any visual gap.
   */
  exportBalls(): { element: SVGCircleElement; position: Point; color: string }[] {
    const result: { element: SVGCircleElement; position: Point; color: string }[] = [];

    this.ballElements.forEach((circle, index) => {
      const cx = parseFloat(circle.getAttribute('cx') || '0');
      const cy = parseFloat(circle.getAttribute('cy') || '0');
      const color = circle.getAttribute('fill') || '#3B82F6';
      result.push({ element: circle, position: { x: cx, y: cy }, color });
    });

    // Release ownership — these elements now belong to the caller
    this.ballElements.clear();

    return result;
  }
}
