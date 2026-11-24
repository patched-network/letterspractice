/**
 * Ball animation preparation from siteswap patterns
 * Adapted from sani.js/src/prepare.js
 */

import { Spline } from './spline';
import { motion, gravity } from './physics';
import type {
  Ball,
  Point,
  JugglingConfig,
  SaniDimensions,
  PrepareMetadata
} from './types';

/**
 * Calculate least common multiple
 */
function lcm(a: number, b: number): number {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  let result = max;
  while (0 !== result % min) {
    result += max;
  }
  return result;
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Adjust throw sequence for async patterns
 * Converts async patterns to have both hands represented
 */
function strictifyThrows(siteswap: any): any[][] {
  if (siteswap.degree === 2) {
    return siteswap.throws;
  }

  const throws: any[][] = [];
  const n = lcm(siteswap.throws.length, 2);
  for (let i = 0; i < n; i++) {
    const action = [[], []];
    const release = siteswap.throws[i % siteswap.throws.length][0].map((toss: any) => ({
      value: toss.value,
      from: i % 2,
      to: (i + toss.value) % 2
    }));
    action[i % 2] = release;
    throws.push(action);
  }

  return throws;
}

/**
 * Pre-defined catch spline curve
 * Defines the hand motion path during a catch
 */
const catchSplinePoints = [
  { x: 0, y: 0 },
  { x: 5, y: 30 },
  { x: 30, y: 100 },
  { x: 95, y: 30 },
  { x: 100, y: 0 }
];
const catchSpline = new Spline(catchSplinePoints);

/**
 * Position getters for different animation types
 */
const getPosition = {
  catch: function(this: any, time: number): Point {
    const percent = time / this.duration;
    const position = {
      x: this.position.x + (percent * this.width),
      y: this.position.y - (catchSpline.at(percent * 100) * this.yModifier)
    };
    return position;
  },

  throw: function(this: any, time: number): Point {
    const position = {
      x: this.position.x + motion.s(this.velocity.x, this.acceleration.x, time),
      y: this.position.y + motion.s(this.velocity.y, this.acceleration.y, time)
    };
    return position;
  },

  wait: function(this: any): Point {
    return this.position;
  }
};

/**
 * Create Ball object
 */
function createBall(color: string): Ball {
  return {
    position: { x: NaN, y: NaN },
    color,
    animations: [],
    animationAt: -1,
    elapsed: 0
  };
}

/**
 * Prepare siteswap pattern for animation
 *
 * Converts a parsed siteswap pattern into ball animation sequences using physics simulation.
 * Each ball gets a series of catch/throw/wait animations with timing and trajectory data.
 *
 * This is a low-level utility function - most users should use `animateJuggling()` instead.
 *
 * @param siteswap - Parsed siteswap object from siteswap.js library
 * @param config - Configuration for physics simulation
 * @param config.beatDuration - Duration of one beat in milliseconds
 * @param config.dwell - Dwell time ratio (0-1), time ball spends in hand
 * @param config.ballRadius - Radius of balls for collision detection
 * @param config.ballColor - Color string for ball rendering
 * @param config.reversed - If true, reverse throw style (over-top vs inside)
 * @returns Tuple of [balls, dimensions, metadata]
 *   - balls: Array of Ball objects with animation sequences
 *   - dimensions: Stage dimensions (innerWidth, innerHeight, catchHeight)
 *   - metadata: Pattern metadata including cycle duration
 *
 * @example
 * ```typescript
 * import Siteswap from 'siteswap.js';
 * import { prepareSiteswap } from '@/letterpeople/transforms/juggling';
 *
 * const siteswap = new Siteswap("531");
 * const [balls, dimensions, metadata] = prepareSiteswap(siteswap, {
 *   beatDuration: 300,
 *   dwell: 0.4,
 *   ballRadius: 10,
 *   ballColor: '#FF6B6B',
 *   reversed: false
 * });
 *
 * console.log(`Prepared ${balls.length} balls`);
 * console.log(`Stage: ${dimensions.innerWidth}×${dimensions.innerHeight}`);
 * console.log(`Cycle duration: ${metadata.cycleDuration}ms`);
 * ```
 *
 * @deprecated Use physics-core phrases (e.g. cascadePhrase) instead.
 */
export function prepareSiteswap(
  siteswap: any,
  config: JugglingConfig
): [Ball[], SaniDimensions, PrepareMetadata] {
  // Create balls with different colors for easy tracking
  const ballColors = ['#00FF00', '#FF6B6B', '#4169E1', '#FF9534'];  // Green, Red, Blue, Orange
  const balls = Array(siteswap.props).fill(null).map((_, idx) =>
    createBall(ballColors[idx % ballColors.length])
  );

  const beatDuration = config.beatDuration * siteswap.degree;

  // Track throw and catch heights for scaling
  let maxThrowHeight = 0;
  let maxCatchHeight = 0;
  const maxCatchWidth = 250;

  // Calculate hand gap and stage width
  const handsGap = 350 - (Math.abs(0.5 - config.dwell) * 200) + ((siteswap.greatestValue - 3) * 15);
  const innerWidth = (maxCatchWidth * 2) + handsGap;

  const dwellMultiplier = 3 - siteswap.degree;
  const minDwell = 0.1 * dwellMultiplier;
  const maxDwell = 0.9 * dwellMultiplier;
  const computedDwell = Math.max(minDwell, Math.min(maxDwell, config.dwell * dwellMultiplier));

  const throws = strictifyThrows(siteswap);
  const n = lcm(throws.length, siteswap.strictStates.length);

  for (let i = 0; i < n; i++) {
    const action = throws[i % throws.length];
    const schedule = siteswap.strictStates[i % siteswap.strictStates.length];

    // Determine greatest multiplex count
    const multiplexes = action.map((release: any[]) => {
      return release.reduce((result: any, toss: any) => {
        const key = `${toss.value}-${toss.to}`;
        result[key] = (result[key] || 0) + 1;
        return result;
      }, {});
    });
    const greatestTwinCount = Math.max(...multiplexes.map((group: any) =>
      Math.max(...Object.keys(group).map((key) => group[key]))
    ));

    // Calculate dwell time
    let dwell = computedDwell;
    if (computedDwell >= 1) {
      const ones = multiplexes.reduce((sum: number, map: any) =>
        Math.max(sum, map["1-0"] || 0, map["1-1"] || 0), 0
      );
      if (ones > 0) {
        dwell = 1 - minDwell;
      }
    }

    for (let h = 0; h < 2; h++) {
      const release = action[h];

      // "Hand motion" follows the lowest toss
      const lowestValue = Math.min(...release.map(({ value }: any) => value));
      const lowestThrowHeight = motion.s(0, -gravity.y, (lowestValue - dwell) * 0.5 * beatDuration);

      for (let j = 0; j < release.length; j++) {
        const toss = release[j];
        if (toss.value === 0) continue;

        const ballIndex = schedule[h % siteswap.degree][0][j] - 1;
        const ball = balls[ballIndex];

        // Multiplex step
        const dwellStep = greatestTwinCount === 1 ? 0 : Math.min(minDwell, (dwell - minDwell) / (greatestTwinCount - 1));
        const at = --multiplexes[h][`${toss.value}-${toss.to}`];

        // Calculate timing
        let launchTime = dwell - ((greatestTwinCount - 1) * dwellStep);
        let waitTime = dwellStep * at;
        let airTime = toss.value - (waitTime + launchTime);

        launchTime *= beatDuration;
        waitTime *= beatDuration;
        airTime *= beatDuration;

        let x1: number;
        let x2: number;

        /* CATCH ANIMATION */
        const catchWidth = clamp(
          maxCatchWidth - (Math.abs(0.5 - config.dwell) * 100),
          150,
          maxCatchWidth
        ) - (lowestValue === 2 ? 50 : 0);

        const min = config.ballRadius * 0.5;
        const max = Math.min(1000, 500 + (siteswap.greatestValue * 30));
        const base = clamp((launchTime * 0.5) + (siteswap.greatestValue * 20), min, max);
        let catchHeight = (base * 0.3) + (base * 0.7 * lowestValue / siteswap.greatestValue);

        catchHeight = Math.min(launchTime * 3, catchHeight);
        catchHeight = Math.min(lowestValue === 2 ? 100 : lowestThrowHeight * 0.5, catchHeight);

        x1 = toss.from === 0 ? 0 : innerWidth;
        x2 = toss.from === 0 ? catchWidth : innerWidth - catchWidth;

        if (config.reversed) {
          [x1, x2] = [x2, x1];
        }

        ball.animations.push({
          type: 'catch',
          duration: launchTime,
          width: x2 - x1,
          yModifier: catchHeight / catchSpline.maximum().y,
          position: {
            x: x1,
            y: 0
          },
          getPosition: getPosition.catch
        });

        /* THROW ANIMATION */
        const throwHeight = motion.s(0, -gravity.y, airTime / 2);

        // Debug: Log throw height for low values
        if (toss.value <= 2) {
          console.log(`[prepare] Throw ${toss.value}: airTime=${airTime.toFixed(1)}ms, throwHeight=${throwHeight.toFixed(1)}mm`);
        }

        x1 = toss.from === 0 ? catchWidth : innerWidth - catchWidth;
        x2 = toss.to === 0 ? 0 : innerWidth;

        if (config.reversed) {
          if (toss.from === toss.to) {
            // Same hand throw: swap both
            [x1, x2] = [x2, x1];
          } else {
            // Cross-hand throw: adjust starting position
            x1 += toss.from === 0 ? -catchWidth : catchWidth;
            x2 += toss.from === 0 ? -catchWidth : catchWidth;
          }
        }

        ball.animations.push({
          type: 'throw',
          duration: airTime,
          position: {
            x: x1,
            y: 0
          },
          velocity: {
            x: (x2 - x1) / airTime,
            y: motion.v(0, -gravity.y, throwHeight)
          },
          acceleration: gravity,
          getPosition: getPosition.throw
        });

        /* WAIT ANIMATION */
        if (waitTime > 0) {
          ball.animations.push({
            type: 'wait',
            duration: waitTime,
            position: {
              x: x2,
              y: 0
            },
            getPosition: getPosition.wait
          });
        }

        if (throwHeight > maxThrowHeight) {
          maxThrowHeight = throwHeight;
        }
        if (catchHeight > maxCatchHeight) {
          maxCatchHeight = catchHeight;
        }
      }
    }
  }

  // Delay initial animations
  const [schedule] = siteswap.strictStates;
  for (const state of schedule) {
    for (let beat = 0; beat < state.length; beat++) {
      for (const id of state[beat]) {
        balls[id - 1].animations[-1] = {
          type: 'wait',
          duration: beat * beatDuration,
          position: {
            x: 0,
            y: 0
          },
          getPosition: getPosition.wait
        };
      }
    }
  }

  // Log ball delays (simplified)
  console.log('[prepare] Ball delays:', balls.map((ball, idx) => {
    const delay = ball.animations[-1];
    return `Ball${idx}=${delay?.duration || 0}ms`;
  }).join(', '));

  const innerHeight = maxThrowHeight + maxCatchHeight;

  // Calculate cycle duration from pattern structure
  const cycleDuration = n * beatDuration;
  console.log(`[prepare] Cycle duration: ${cycleDuration}ms (n=${n} × beatDuration=${beatDuration}ms)`);

  return [
    balls,
    { innerWidth, innerHeight, catchHeight: maxCatchHeight },
    { cycleDuration }
  ];
}
