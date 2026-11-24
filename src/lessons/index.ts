/**
 * Lesson registry — maps active lesson IDs to their Vue components.
 *
 * Each lesson is a hand-rolled Vue component (similar to question views
 * in src/questions/). There is no DSL or schema — each lesson controls
 * its own keyboard configuration, PhoneticWord interactions, animations,
 * and advancement logic.
 *
 * Lessons are 3D-first (see ./CLAUDE.md): the SVG components below are
 * legacy, kept running but not extended. To add a new lesson:
 *   1. Write its step script and its 3D staging in src/lessons/three/
 *   2. Add its loader to LESSON_3D_LOADERS and its id to THREE_D_ONLY
 *   3. Ensure the corresponding LessonDefinition exists in src/services/lessons.ts
 *
 * Roadmap / deferred lessons (not yet implemented):
 *   - vowel-teams        (ea, ai, oa, ...)
 *   - r-controlled       (ar, er, ir, or, ur)
 *   - l-controlled       (al, el, ...)
 *   - soft-consonants    (c→S before e/i/y; g→JH before e/i/y)
 *   - doubled-consonants (ll, ss, ff, ... → single sound)
 *   - silent-letters     (kn, wr, mb, ...)
 */

import { defineAsyncComponent, markRaw, type Component } from 'vue';
import { loadGpcLetter3D, loadSightWord3D, mark3DFailed, use3DLetters } from '../services/letters3d';
import HelloWorldLesson from './01.HelloWorldLesson.vue';
import DigraphLesson from './02.DigraphLesson.vue';
import SplitDigraphLesson from './03.SplitDigraphLesson.vue';
import FinalOpenVowelsLesson from './04.FinalOpenVowelsLesson.vue';
import Lesson3DUnavailable from './Lesson3DUnavailable.vue';

// ---------------------------------------------------------------------------
// Component Registry
// ---------------------------------------------------------------------------

/**
 * Registry of active lesson ID → Vue component.
 *
 * Components are wrapped in `markRaw` to prevent Vue from making them
 * reactive (same pattern as question view registration in src/questions/index.ts).
 */
export const LESSON_COMPONENTS: Record<string, Component> = {
  'hello-world': markRaw(HelloWorldLesson),
  'digraphs': markRaw(DigraphLesson),
  'split-digraphs': markRaw(SplitDigraphLesson),
  // Promoted to the active launch-facing slate (b.1 W8, 2026-07-15).
  'final-open-vowels': markRaw(FinalOpenVowelsLesson),
};

/**
 * The lessons' three.js stagings (same steps, runner and shell as the SVG
 * ones). Lazy: three.js stays out of the entry chunk. Used when
 * `use3DLetters()` (services/letters3d.ts).
 */
const LESSON_3D_LOADERS: Record<string, () => Promise<{ default: Component }>> = {
  'hello-world': () => import('./three/HelloWorldLesson3D.vue'),
  'bed': () => import('./three/BedLesson3D.vue'),
  'digraphs': () => import('./three/DigraphLesson3D.vue'),
  'split-digraphs': () => import('./three/SplitDigraphLesson3D.vue'),
  'final-open-vowels': () => import('./three/FinalOpenVowelsLesson3D.vue'),
  'sight-words': () => import('./three/SightWordsLesson3D.vue'),
};

/**
 * Lessons with no SVG version (2026-09-29: 3D runs well enough on old
 * devices that an SVG twin isn't worth building). Where 3D can't run, they
 * fall back to a stub that marks the lesson passed, so the learner isn't
 * locked out of what it gates.
 */
const THREE_D_ONLY = new Set(['sight-words', 'bed']);
const NO_3D_FALLBACK: Component = markRaw(Lesson3DUnavailable);

/** A 3D-only lesson that can't run here: the registry would hand back the stub that passes it */
export function lessonNeeds3DHere(lessonId: string): boolean {
  return THREE_D_ONLY.has(lessonId) && !use3DLetters();
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Look up the Vue component for a lesson by ID: its 3D staging when 3D is on
 * and it has one, else the SVG lesson. A 3D chunk that fails to load gives
 * the SVG lesson instead. A 3D-only lesson's stand-in for SVG is the stub
 * that passes it.
 *
 * @returns The component, or null if no component is registered for this lesson.
 */
export function getLessonComponent(lessonId: string): Component | null {
  const svg = LESSON_COMPONENTS[lessonId] ?? (THREE_D_ONLY.has(lessonId) ? NO_3D_FALLBACK : undefined);
  if (!svg) return null;
  const load3D = LESSON_3D_LOADERS[lessonId];
  if (!load3D || !use3DLetters()) return svg;
  return markRaw(
    defineAsyncComponent(() =>
      load3D().then(
        (m) => m.default,
        (err) => {
          mark3DFailed(err);
          return svg;
        },
      ),
    ),
  );
}

/**
 * Fetch the 3D chunks (three.js, the 3D lessons, the intros' 3D letter) ahead
 * of need, so a lesson or intro doesn't wait on the network. No-op when 3D is
 * off. Failures are left for the real load to handle.
 */
export function preload3D(): void {
  if (!use3DLetters()) return;
  for (const load of [...Object.values(LESSON_3D_LOADERS), loadGpcLetter3D, loadSightWord3D]) {
    load().catch(() => {});
  }
}
