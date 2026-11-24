/**
 * useUIAnimations.ts
 *
 * Centralized UI animation utilities using anime.js v4
 * Provides consistent timing, easing, and animation patterns across the application
 *
 * Note: App uses engine.timeUnit = "ms" so all durations are in milliseconds
 *
 * IMPORTANT: anime.js v4 animations DO NOT return a .finished promise.
 * Use onComplete callbacks for sequencing. For Vue transitions, call animate()
 * directly with the done callback as onComplete.
 *
 * Example Vue transition usage:
 * ```typescript
 * function onEnter(el: Element, done: () => void): void {
 *   animate(el as HTMLElement, {
 *     opacity: [0, 1],
 *     translateY: [-8, 0],
 *     duration: 300,
 *     ease: 'outCubic',
 *     onComplete: done
 *   });
 * }
 * ```
 */

import { animate, type JSAnimation } from 'animejs';

// Helper type to avoid repetition and ensure type safety when constructing params
// We use any for the params object construction to avoid fighting strict index signatures
// before passing to the strictly typed animate function
type AnimationCallback = () => void;

export function useUIAnimations() {
    return {
        /**
         * Submit button entrance animation
         * For Vue transitions, use onComplete callback with done()
         */
        submitEnter(target: HTMLElement, onComplete?: AnimationCallback): JSAnimation {
            const params: any = {
                opacity: [0, 1],
                translateY: [-8, 0],
                scale: [0.95, 1],
                duration: 300,
                ease: 'outCubic'
            };
            if (onComplete) params.onComplete = onComplete;
            return animate(target, params);
        },

        /**
         * Submit button exit animation
         * For Vue transitions, use onComplete callback with done()
         */
        submitExit(target: HTMLElement, onComplete?: AnimationCallback): JSAnimation {
            const params: any = {
                opacity: [1, 0],
                translateY: [0, -4],
                scale: [1, 0.95],
                duration: 200,
                ease: 'inCubic'
            };
            if (onComplete) params.onComplete = onComplete;
            return animate(target, params);
        },

        /**
         * Generic fade-in entrance
         */
        fadeIn(target: HTMLElement, duration = 300, onComplete?: AnimationCallback): JSAnimation {
            const params: any = {
                opacity: [0, 1],
                duration,
                ease: 'outCubic'
            };
            if (onComplete) params.onComplete = onComplete;
            return animate(target, params);
        },

        /**
         * Generic fade-out exit
         */
        fadeOut(target: HTMLElement, duration = 200, onComplete?: AnimationCallback): JSAnimation {
            const params: any = {
                opacity: [1, 0],
                duration,
                ease: 'inCubic'
            };
            if (onComplete) params.onComplete = onComplete;
            return animate(target, params);
        },

        /**
         * Slide up entrance (for modals, panels, etc)
         */
        slideUpEnter(target: HTMLElement, distance = 20, onComplete?: AnimationCallback): JSAnimation {
            const params: any = {
                opacity: [0, 1],
                translateY: [distance, 0],
                duration: 350,
                ease: 'outCubic'
            };
            if (onComplete) params.onComplete = onComplete;
            return animate(target, params);
        },

        /**
         * Slide down exit (for modals, panels, etc)
         */
        slideDownExit(target: HTMLElement, distance = 20, onComplete?: AnimationCallback): JSAnimation {
            const params: any = {
                opacity: [1, 0],
                translateY: [0, distance],
                duration: 250,
                ease: 'inCubic'
            };
            if (onComplete) params.onComplete = onComplete;
            return animate(target, params);
        }
    };
}
