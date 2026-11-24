/**
 * LessonActor — the surface useLessonRunner drives, independent of renderer.
 *
 * The runner needs very little from an actor: speech balloons, a mouth pulse,
 * letter effects on sound steps, a blink idle loop, on-screen bounds (to park
 * the audio button) and an "active" highlight. SVG `Actor`s are adapted by
 * `svgLessonActor` with exactly the calls the runner used to make directly;
 * other stages (e.g. the three.js Stage3D) implement this interface natively.
 */

import type { LetterEffect } from '../composables/useTimedWordPlayback';
import type { AnimationParams } from '../letterpeople/types';
import { applyLetterEffect } from '../letterpeople/animations';
import { startIdle } from '../letterpeople/animations/presence';
import { Actor } from '../letterpeople/scene/Stage';

export interface ActorBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface LessonActor {
  say(text: string): Promise<void>;
  silence(): Promise<void>;
  /** Whether the actor has a mouth to pulse. */
  canSpeak(): boolean;
  /** One open→close mouth pulse. */
  speakPulse(params?: AnimationParams): Promise<void>;
  /** Timed letter effect on sound / word steps ('speak', 'bounce', ...). */
  applyEffect(effect: LetterEffect | LetterEffect[], params?: AnimationParams): Promise<void>;
  eyesVisible(): boolean;
  /** Start a blink-only idle loop; returns its stop function. */
  startIdle(): () => void;
  /** On-screen bounds, in px relative to `container`'s top-left. */
  boundsIn(container: HTMLElement): ActorBounds | null;
  /** Highlight as the focus of the current sound step. */
  setActive(active: boolean): void;
  /** The letter's body colour now (a CSS colour), if the renderer can say: the sound rail's milestones wear it. */
  fillColor?(): string | null;
}

const ACTIVE_CLASS = 'lesson-actor--active';

export function svgLessonActor(actor: Actor): LessonActor {
  const letter = actor.instance;
  return {
    say: (text) => actor.say(text),
    silence: () => actor.silence(),
    canSpeak: () => !!letter.mouth,
    speakPulse: (params) => letter.mouth.animateSpeak(params),
    applyEffect: (effect, params) => applyLetterEffect(letter, effect, params),
    eyesVisible: () => letter.eyes.isVisible(),
    startIdle: () => startIdle(letter, { enableTracking: false }),
    boundsIn: (container) => {
      const aRect = letter.svgElement.getBoundingClientRect();
      const sRect = container.getBoundingClientRect();
      return {
        left: aRect.left - sRect.left,
        right: aRect.right - sRect.left,
        top: aRect.top - sRect.top,
        bottom: aRect.bottom - sRect.top,
      };
    },
    setActive: (active) => {
      if (active) actor.wrapper.classList.add(ACTIVE_CLASS);
      else actor.wrapper.classList.remove(ACTIVE_CLASS);
    },
  };
}

const adapted = new WeakMap<Actor, LessonActor>();

/** Normalise: SVG Actors get the (cached) SVG adapter. */
export function asLessonActor(actor: Actor | LessonActor): LessonActor {
  if (!(actor instanceof Actor)) return actor;
  let a = adapted.get(actor);
  if (!a) {
    a = svgLessonActor(actor);
    adapted.set(actor, a);
  }
  return a;
}
