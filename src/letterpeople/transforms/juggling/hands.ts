import { interpolateGap, interpPoint } from "./interpolations";
import { Point, Ball, SaniDimensions, PrepareMetadata, HandPath } from "./types";

/**
 * Get ball position at a specific time in its animation cycle
 * Pure function extracted from BallRenderer for pre-computation
 *
 * @param ball - Ball with animation sequence
 * @param time - Time in milliseconds
 * @param cycleDuration - Total cycle duration for looping
 * @param isLooping - Whether animation loops
 * @returns Position in sani.js coordinate space, or null if not visible
 */
function getBallPositionAtTime(
  ball: Ball,
  time: number,
  cycleDuration: number,
  isLooping: boolean
): Point | null {
  // Get regular animations (index >= 0)
  const animations = ball.animations.filter((_, idx) => idx >= 0);

  // Calculate total animation duration (the repeating cycle length)
  const totalAnimDuration = animations.reduce((sum, anim) => sum + anim.duration, 0);

  // Check for initial delay animation (stored at index -1)
  const delayAnimation = ball.animations[-1];
  let delay = 0;

  if (delayAnimation && delayAnimation.type === 'wait') {
    delay = delayAnimation.duration;
  }

  // When looping, calculate the phase-adjusted time
  if (isLooping) {
    // Add the delay to get this ball's phase in the animation cycle
    const phaseTime = (time + delay) % totalAnimDuration;
    // Look up the position at this phase time
    let currentTime = 0;

    for (const animation of animations) {
      const endTime = currentTime + animation.duration;

      if (phaseTime >= currentTime && phaseTime < endTime) {
        const localTime = phaseTime - currentTime;
        return animation.getPosition.call(animation, localTime);
      }

      currentTime = endTime;
    }

    return null;
  }

  // Non-looping: handle delay as a start time
  if (time < delay) {
    return null;
  }

  let currentTime = delay;

  // Process regular animations
  for (const animation of animations) {
    const endTime = currentTime + animation.duration;

    if (time >= currentTime && time < endTime) {
      const localTime = time - currentTime;
      return animation.getPosition.call(animation, localTime);
    }

    currentTime = endTime;
  }

  // Time is beyond all animations
  return null;
}

/**
 * Add smooth interpolation between catches for a single hand
 * Detects gaps in the timeline (no ball in hand) and interpolates hand motion across them
 * Also handles wrap-around interpolation from end to start of cycle
 *
 * Assumes:
 * - Adjacent entries when ball is in hand are spaced ~16ms apart
 * - Gaps larger than expected indicate periods with no ball in hand
 */
function addInterpolationBetweenCatches(
  entries: { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[],
  ballCount: number,
  hand: 'left' | 'right',
  cycleDuration: number
): { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] {
  console.log(`[${hand}] Processing ${entries.length} entries (cycle=${cycleDuration}ms)`);

  if (entries.length === 0) return [];

  const SAMPLE_INTERVAL = 16; // ms - expected spacing between samples
  const GAP_THRESHOLD = SAMPLE_INTERVAL * 2; // Detect gaps larger than 2x normal spacing

  const result: { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[] = [];

  // Process all entries and detect internal gaps
  for (let i = 0; i < entries.length; i++) {
    // Add current entry
    result.push(entries[i]);

    // Check if there's a gap to the next entry
    if (i < entries.length - 1) {
      const current = entries[i];
      const next = entries[i + 1];
      const timeDiff = next.time - current.time;

      if (timeDiff > GAP_THRESHOLD) {
        // Found a gap - need to interpolate
        console.log(`[${hand}] Gap detected: ${timeDiff.toFixed(1)}ms between t=${current.time.toFixed(1)} and t=${next.time.toFixed(1)}`);

        // Get context points for smooth interpolation
        // Need at least 2 points before and after for Catmull-Rom
        const startContext = getContextPoints(entries, i, -2, 3); // Get up to 3 points ending at i
        const endContext = getContextPoints(entries, i + 1, 0, 3); // Get up to 3 points starting at i+1

        if (startContext.length >= 2 && endContext.length >= 2) {
          const interpolated = interpolateGap(startContext, endContext, hand);
          result.push(...interpolated);
        }
      }
    }
  }

  // Handle wrap-around: check for gap from last entry back to first entry
  if (entries.length >= 4) {
    const lastEntry = entries[entries.length - 1];
    const firstEntry = entries[0];

    // Calculate wrap-around gap (accounting for cycle boundary)
    const wrapGap = (cycleDuration - lastEntry.time) + firstEntry.time;

    if (wrapGap > GAP_THRESHOLD) {
      console.log(`[${hand}] Wrap-around gap detected: ${wrapGap.toFixed(1)}ms from t=${lastEntry.time.toFixed(1)} to t=${firstEntry.time.toFixed(1)} (via cycle boundary)`);

      // Get context from end and beginning
      const endContext = getContextPoints(entries, entries.length - 1, -2, 3);
      const startContext = getContextPoints(entries, 0, 0, 3);

      if (endContext.length >= 2 && startContext.length >= 2) {
        // Adjust start context times to be "after" the cycle for interpolation
        const adjustedStartContext = startContext.map(pt => ({
          ...pt,
          t: pt.t + cycleDuration
        }));

        const interpolated = interpolateGap(endContext, adjustedStartContext, hand);

        // Adjust interpolated times back to wrap modulo cycle
        const wrappedInterpolated = interpolated.map(entry => ({
          ...entry,
          time: entry.time % cycleDuration
        }));

        result.push(...wrappedInterpolated);
      }
    }
  }

  // console.log(`[${hand}] Result: ${result.length} entries (added ${result.length - entries.length} interpolated)`);
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Get context points around an index for interpolation
 * @param entries - All timeline entries
 * @param startIdx - Index to start from
 * @param offset - Offset from start index (negative to go backwards)
 * @param count - Maximum number of points to collect
 */
function getContextPoints(
  entries: { time: number; position: Point; hand: 'left' | 'right'; ballId: number }[],
  startIdx: number,
  offset: number,
  count: number
): interpPoint[] {
  const points: interpPoint[] = [];
  const start = startIdx + offset;
  const end = offset < 0 ? startIdx + 1 : startIdx + count;

  for (let i = start; i < end && i >= 0 && i < entries.length; i++) {
    const entry = entries[i];
    points.push({
      x: entry.position.x,
      y: entry.position.y,
      t: entry.time
    });
  }

  return points;
}



/**
 * Extract hand paths from ball animations
 * During catch animations, the ball position represents the hand position
 *
 * Strategy:
 * 1. Build timeline of all ball animations
 * 2. For each catch animation, sample hand positions
 * 3. Determine left vs right hand based on x position
 * 4. Combine into sequential hand paths with timing
 * 5. Add interpolation for wrap-around (end → start of cycle)
 */
export function extractHandPaths(
  balls: Ball[],
  dimensions: SaniDimensions,
  metadata: PrepareMetadata,
  sampleRate: number = 16 // milliseconds between samples
): { left: HandPath, right: HandPath } {
  // console.log(`building hand paths`); // called (twice) w/ start juggling press
  
  // Build unified timeline of all hand positions from all balls
  interface TimelineEntry {
    time: number;
    position: Point;
    hand: 'left' | 'right';
    ballId: number;
  }

  const timeline: TimelineEntry[] = [];

  // Process each ball
  balls.forEach((ball, ballId) => {
    // Check for initial delay animation (stored at index -1)
    const delayAnimation = ball.animations[-1];
    let startTime = 0;

    if (delayAnimation && delayAnimation.type === 'wait') {
      startTime = delayAnimation.duration;
    }

    let currentTime = startTime;

    // Process regular animations (index >= 0)
    const animations = ball.animations.filter((_, idx) => idx >= 0);

    animations.forEach((animation) => {
      // Only process catch animations (ball is in hand)
      if (animation.type === 'catch') {
        // Sample positions along the catch animation
        const numSamples = Math.ceil(animation.duration / sampleRate);

        for (let i = 0; i <= numSamples; i++) {
          const t = Math.min(i * sampleRate, animation.duration);
          const position = animation.getPosition.call(animation, t);

          // Determine which hand based on x position
          // Left hand: x < innerWidth/2, Right hand: x >= innerWidth/2
          const hand: 'left' | 'right' = position.x < dimensions.innerWidth / 2 ? 'left' : 'right';

          timeline.push({
            time: currentTime + t,
            position,
            hand,
            ballId
          });
        }
      }

      currentTime += animation.duration;
    });
  });

  // Sort timeline by time
  timeline.sort((a, b) => a.time - b.time);

  // Separate into left and right hand paths
  const leftEntries = timeline.filter(e => e.hand === 'left');
  const rightEntries = timeline.filter(e => e.hand === 'right');

  // Add interpolation between catches for both hands (including wrap-around)
  const leftEntriesPlusInterpolation = addInterpolationBetweenCatches(
    leftEntries,
    balls.length,
    'left',
    metadata.cycleDuration
  );
  const rightEntriesPlusInterpolation = addInterpolationBetweenCatches(
    rightEntries,
    balls.length,
    'right',
    metadata.cycleDuration
  );
  
  // Build hand paths
  const leftPath: HandPath = {
    positions: leftEntriesPlusInterpolation.map(e => e.position),
    timings: leftEntriesPlusInterpolation.map(e => e.time)
  };

  const rightPath: HandPath = {
    positions: rightEntriesPlusInterpolation.map(e => e.position),
    timings: rightEntriesPlusInterpolation.map(e => e.time)
  };

  return {
    left: leftPath,
    right: rightPath
  };
}

/**
 * Debug: Log hand path statistics
 */
export function debugHandPaths(paths: { left: HandPath, right: HandPath }): void {
  console.group('[hand-paths] Debug');
  console.log('Left hand:', {
    points: paths.left.positions.length,
    duration: paths.left.timings.length > 0
      ? `${paths.left.timings[paths.left.timings.length - 1].toFixed(0)}ms`
      : '0ms',
    firstPos: paths.left.positions[0],
    lastPos: paths.left.positions[paths.left.positions.length - 1]
  });
  console.log('Right hand:', {
    points: paths.right.positions.length,
    duration: paths.right.timings.length > 0
      ? `${paths.right.timings[paths.right.timings.length - 1].toFixed(0)}ms`
      : '0ms',
    firstPos: paths.right.positions[0],
    lastPos: paths.right.positions[paths.right.positions.length - 1]
  });
  console.groupEnd();
}

/**
 * Extract ball trajectories by sampling positions across animation cycle
 *
 * Pre-computes ball positions at regular intervals for efficient rendering.
 * Similar to extractHandPaths but for ball trajectories.
 *
 * @param balls - Array of ball objects with animation sequences
 * @param dimensions - Sani.js space dimensions (not used for sampling, kept for consistency)
 * @param metadata - Pattern metadata including cycle duration
 * @param isLooping - Whether animation loops
 * @param sampleRate - Milliseconds between samples (default: 16ms for 60fps)
 * @returns Array of HandPath objects (one per ball) with sampled positions
 *
 * @example
 * ```typescript
 * const [balls, dimensions, metadata] = prepareSiteswap(siteswap, config);
 * const ballPaths = extractBallPaths(balls, dimensions, metadata, true);
 * console.log(`Ball 0: ${ballPaths[0].positions.length} positions`);
 * ```
 */
export function extractBallPaths(
  balls: Ball[],
  dimensions: SaniDimensions,
  metadata: PrepareMetadata,
  isLooping: boolean,
  sampleRate: number = 16
): HandPath[] {
  const cycleDuration = metadata.cycleDuration;

  return balls.map((ball, ballId) => {
    const positions: Point[] = [];
    const timings: number[] = [];

    // Sample the entire animation cycle
    for (let t = 0; t < cycleDuration; t += sampleRate) {
      const pos = getBallPositionAtTime(ball, t, cycleDuration, isLooping);
      if (pos) {
        positions.push(pos);
        timings.push(t);
      }
    }

    console.log(`[ball-paths] Ball ${ballId}: sampled ${positions.length} positions over ${cycleDuration}ms`);

    return { positions, timings };
  });
}
