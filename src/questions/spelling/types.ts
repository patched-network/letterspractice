/**
 * Spelling Question — Shared Types & Constants
 *
 * Defines the scaffold level taxonomy, per-level configuration,
 * and score ceiling constants used by the view composables and
 * the SpellingQuestion evaluate() method.
 *
 * Ref: agent/spelling-question/a.3.plan.md §6.1
 */

// ---------------------------------------------------------------------------
// Scaffold Levels
// ---------------------------------------------------------------------------

/**
 * The four scaffold levels for spelling questions, ordered from most
 * support (0) to fully unaided (3).
 *
 * - 0: Copy (See-Do) — system demos, user copies
 * - 1: Restricted — correct-letters-only keyboard, spell from memory
 * - 2: Guided — full keyboard, wrong keys rejected + phoneme hint
 * - 3: Unaided — free spelling, Enter to submit, post-submit grading
 */
export type ScaffoldLevel = 0 | 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Score Ceilings
// ---------------------------------------------------------------------------

/**
 * Maximum achievable score at each scaffold level.
 *
 * Scores below 0.5 are "defeats" in ELO terms. Level 0 (copy) is
 * ELO-neutral exposure; Level 1 is barely a win; only Level 3
 * allows full credit.
 */
export const SCORE_CEILING: Record<ScaffoldLevel, number> = {
  0: 0.50,
  1: 0.55,
  2: 0.70,
  3: 1.00,
};

// ---------------------------------------------------------------------------
// Time Scaling Constants
// ---------------------------------------------------------------------------

/** Base expectation per letter (ms). Used to compute FAST / SLOW thresholds. */
export const MS_PER_LETTER = 3000;

/** Absolute minimum "fast" threshold (ms). */
export const FAST_FLOOR_MS = 3000;

/** Absolute maximum "slow" threshold (ms). */
export const SLOW_CEILING_MS = 45000;

/** Minimum time fraction — even very slow correct answers get at least this proportion.
 *  Softened 0.6 → 0.8 (2026-09-13). Since fw #1202 a score only sizes the ELO gain
 *  (common `eloActual`), so this floor sets what speed is worth. */
export const MIN_TIME_FRACTION = 0.8;

// ---------------------------------------------------------------------------
// Per-Level Configuration
// ---------------------------------------------------------------------------

/**
 * Flags controlling view/input behaviour at each scaffold level.
 * Consumed by SpellingQuestionView and the view template.
 */
export interface SpellingConfig {
  level: ScaffoldLevel;

  /** Show letter blanks (L0–2: yes, L3: no blank count shown). */
  showBlanks: boolean;

  /** Show the word model during demo (L0 only). */
  showWordModel: boolean;

  /** Restrict keyboard to correct letters only (L0–1). */
  restrictKeyboard: boolean;

  /** Reject wrong key presses (L0–2: yes, L3: accepts all input). */
  rejectWrongKeys: boolean;

  /** Play phoneme hint on wrong key (L2: yes, L0–1: silent reject, L3: no). */
  perLetterCorrection: boolean;

  /** Require Enter to submit (L3: yes, L0–2: auto-submit on fill). */
  requireEnterToSubmit: boolean;

  /** Phoneme hints available via spacebar (L0–2: yes, L3: word replay only). */
  phonemeHintsAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Config Factory
// ---------------------------------------------------------------------------

const LEVEL_CONFIGS: Record<ScaffoldLevel, SpellingConfig> = {
  0: {
    level: 0,
    showBlanks: true,
    showWordModel: true,
    restrictKeyboard: true,
    rejectWrongKeys: true,
    perLetterCorrection: false,
    requireEnterToSubmit: false,
    phonemeHintsAvailable: true,
  },
  1: {
    level: 1,
    showBlanks: true,
    showWordModel: false,
    restrictKeyboard: true,
    rejectWrongKeys: true,
    perLetterCorrection: false,
    requireEnterToSubmit: false,
    phonemeHintsAvailable: true,
  },
  2: {
    level: 2,
    showBlanks: true,
    showWordModel: false,
    restrictKeyboard: false,
    rejectWrongKeys: true,
    perLetterCorrection: true,
    requireEnterToSubmit: false,
    phonemeHintsAvailable: true,
  },
  3: {
    level: 3,
    showBlanks: false,
    showWordModel: false,
    restrictKeyboard: false,
    rejectWrongKeys: false,
    perLetterCorrection: false,
    requireEnterToSubmit: true,
    phonemeHintsAvailable: false,
  },
};

/**
 * Return the full SpellingConfig for a given scaffold level.
 * The returned object is a fresh copy — safe to mutate if needed.
 */
export function configForLevel(level: ScaffoldLevel): SpellingConfig {
  return { ...LEVEL_CONFIGS[level] };
}