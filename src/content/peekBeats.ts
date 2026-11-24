/**
 * Peek explainer "beats" — the parent-facing note banners shown over the peek
 * lesson and practice phases (PeekView.vue).
 *
 * Copy lives here (not inline in the template) so it's editable in one place and
 * so the set can grow: the practice phase is expected to gain further beats
 * (runtime "be the guide" tips, an explicit timer callout) with dismiss-to-
 * advance queue logic. For now each phase renders its first beat.
 *
 * `md` carries inline emphasis via the landing copy's `renderInline`
 * vocabulary — **bold**, *italic*, _underline_, `code` — and splits into
 * paragraphs on blank lines. PeekView renders it (escaped, then emphasized)
 * through `renderInline`, so no HTML is authored here.
 */
export interface PeekBeat {
  /** Stable key — used for :key and (later) per-beat dismissal tracking. */
  id: string;
  phase: 'lesson' | 'session';
  /** Inline-markup copy; blank lines separate paragraphs. */
  md: string;
  /** Reserve the floating-timer gutter (session phase only). */
  withTimer?: boolean;
  /**
   * OKLCH hue (0–360°) for the banner's accent (border + faint tint), generated
   * via letterpeople/util/color's `oklch()` — the Tier-2 content-color system
   * (see DESIGN_SYSTEM.md), so we get distinct pastel hues per beat without
   * touching the reserved action/feedback semantics. Omit to fall back to the
   * base info blue. Tune these by eye.
   */
  accentHue?: number;
}

export const LESSON_BEATS: PeekBeat[] = [
  {
    id: 'lesson-intro',
    phase: 'lesson',
    accentHue: 195,
    md: `**Lessons** are parent-led. You read aloud as a new *idea* is introduced.

This is the first lesson. A new one comes up every few weeks or so depending on progress.`,
  },
];

// Ordered queue: PeekView advances one beat per card load during the practice
// session (see onCardLoaded). Roughly aligned to the opening card sequence —
// intro-gpc, who-said-that, word-select, … — but driven by position, not card
// type, so it degrades gracefully if the planner reorders. Each beat re-shows
// the banner if it was dismissed, or replaces the prior beat in place if not.
export const SESSION_BEATS: PeekBeat[] = [
  {
    id: 'practice-main-course',
    phase: 'session',
    withTimer: true,
    md: `**Practice** sessions are the main course.

They manage the release of new **facts** and the steady ramp-up of **skills**.`,
  },
  {
    id: 'practice-timer',
    phase: 'session',
    withTimer: true,
    accentHue: 40,
    md: `Practice **sessions** run against a ticking timer. We recommend two minutes at age two, three minutes at age three, and so on — respecting and stretching young attention spans.`,
  },
  {
    id: 'practice-spacebar',
    phase: 'session',
    withTimer: true,
    accentHue: 155,
    md: `During exercises, the spacebar will replay target audio or focus in on target sounds.`,
  },
  {
    id: 'practice-wrong-is-ok',
    phase: 'session',
    withTimer: true,
    accentHue: 250,
    md: `Be sure that learners know that getting questions wrong is A-OK — this is how the LetterPeople find out how to help.`,
  },
  {
    id: 'practice-your-judgement',
    phase: 'session',
    withTimer: true,
    accentHue: 320,
    md: `But exercise your own judgement! If you can help out with a tiny hint, then do so. Give them a model of how to use their knowledge to complete the exercises.`,
  },
];
