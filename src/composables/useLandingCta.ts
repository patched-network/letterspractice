import { ref, readonly } from 'vue';

/**
 * Shared reveal signal for the header's landing-page CTA.
 *
 * The landing page's `SessionWalkthroughSection` flips this on once the visitor
 * reaches the "Taking it off-screen" scroll beat — i.e. they've read the whole
 * pitch (a short vignette coda follows it, but doesn't gate the reveal). `CourseHeader` reads it to pop a "Try a sample lesson" CTA into
 * the app bar. A module-level singleton so the walkthrough (deep in the landing
 * tree) and the header (App.vue level) share one source of truth without prop
 * drilling or an event bus.
 *
 * The signal is sticky once set (no hide on scroll-back — a flickering header is
 * worse than a slightly-early CTA); `resetLandingCta` clears it when the visitor
 * leaves the landing route so a later cold visit re-earns the reveal.
 */
const revealed = ref(false);

export function revealLandingCta(): void {
  revealed.value = true;
}

export function resetLandingCta(): void {
  revealed.value = false;
}

export function useLandingCta() {
  return { revealed: readonly(revealed) };
}
