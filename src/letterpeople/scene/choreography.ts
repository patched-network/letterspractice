/**
 * Scene choreography — scheduling ambient interaction beats over time.
 *
 * The model is simple:
 *   - startIdle() runs on each actor as a baseline (blink + eye tracking)
 *   - A loop picks a random beat from a weighted pool every few seconds
 *   - Each beat is awaited before the next is scheduled (no overlap)
 *   - A single cleanup function tears everything down
 */

import type { Actor, Stage } from "./Stage";
import type { PropController } from "../props/types";
import { startIdle } from "../animations/presence";

// ─── Types ────────────────────────────────────────────────────

export interface SceneContext {
  stage: Stage;
  actors: Record<string, Actor>;
  props: Record<string, PropController>;
}

export interface BeatDef {
  name: string;
  /** Relative weight for random selection (higher = more frequent) */
  weight: number;
  /** Play the beat. Resolves when the beat is done. */
  play: (ctx: SceneContext) => Promise<void>;
}

export interface SceneLoopOptions {
  /** [minMs, maxMs] pause between beats */
  intervalRange: [number, number];
  /** Idle intensity for actors (default 0.3) */
  idleIntensity?: number;
}

// ─── Utilities ────────────────────────────────────────────────

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pick a random beat from weighted pool. Avoids repeating the last pick. */
function pickBeat(beats: BeatDef[], lastIndex: number): number {
  if (beats.length <= 1) return 0;

  const totalWeight = beats.reduce((sum, b, i) => {
    return i === lastIndex ? sum : sum + b.weight;
  }, 0);

  let roll = Math.random() * totalWeight;
  for (let i = 0; i < beats.length; i++) {
    if (i === lastIndex) continue;
    roll -= beats[i].weight;
    if (roll <= 0) return i;
  }
  // Fallback (shouldn't happen)
  return beats.length - 1 === lastIndex ? 0 : beats.length - 1;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ─── Core loop ────────────────────────────────────────────────

/**
 * Start a scene loop: idle on all actors + periodic random beats.
 * Returns a cleanup function that stops everything.
 */
export function runSceneLoop(
  ctx: SceneContext,
  beats: BeatDef[],
  options: SceneLoopOptions
): () => void {
  let running = true;
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  const idleCleanups: (() => void)[] = [];

  const intensity = options.idleIntensity ?? 0.3;

  // Start idle on all actors
  for (const actor of Object.values(ctx.actors)) {
    const cleanup = startIdle(actor.instance, {
      intensity,
      enableTracking: true,
    });
    idleCleanups.push(cleanup);
  }

  // Beat scheduling loop
  let lastBeatIndex = -1;

  async function loop() {
    while (running && beats.length > 0) {
      // Wait before next beat
      const pause = randomInRange(
        options.intervalRange[0],
        options.intervalRange[1]
      );
      await new Promise<void>((resolve) => {
        pendingTimeout = setTimeout(resolve, pause);
      });

      if (!running) break;

      // Pick and play a beat
      const idx = pickBeat(beats, lastBeatIndex);
      lastBeatIndex = idx;

      try {
        await beats[idx].play(ctx);
      } catch (e) {
        console.warn(`Beat "${beats[idx].name}" failed:`, e);
      }
    }
  }

  loop();

  // Cleanup
  return () => {
    running = false;
    if (pendingTimeout !== null) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
    for (const cleanup of idleCleanups) {
      cleanup();
    }
  };
}
