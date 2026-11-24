/**
 * Shared badge colour and tooltip helpers for lesson progress badge grids.
 *
 * Used by HelloWorldReport, DigraphsReport, SplitDigraphsReport,
 * FinalOpenVowelsReport (via SkillBadge) and any future reporter that
 * renders per-item skill evidence as coloured badges.
 *
 * Colour is a function of the tag's evidence state only (skillEvidence.ts):
 *   mastered → Vuetify `success` green (skuilder.config.json, inlined here
 *              because badges are painted via `style`, not a Vuetify prop)
 *   gradient → OKLCH hue sweep amber → green by weighted accuracy
 *              (DESIGN_SYSTEM.md: perceptual adjustments happen in OKLCH)
 *   filling  → no verdict yet. 0 attempts: plain neutral grey. 1..k attempts
 *              ("emerging"): the gradient colour for the partial window's
 *              accuracy, faded toward the neutral grey by certainty (have/need,
 *              linear). Early noise stays near-grey, and an emerging tile can
 *              never reach full mastered green. The window size is never shown.
 */

import type { SkillEvidence } from '../../services/lessons/progress/skillEvidence';
import { oklchToRgb, colorToOklch } from '../../letterpeople/util/color';

/** `success` from skuilder.config.json (light theme). */
export const MASTERED_COLOR = '#4CAF50';

/** Neutral for 'filling' — no verdict yet. */
export const FILLING_COLOR = '#c9c9c9';

/** Lightness of FILLING_COLOR (achromatic), the fade target for emerging tiles. */
const FILLING_LIGHTNESS = colorToOklch(FILLING_COLOR)?.l ?? 0.84;

/** OKLCH hue endpoints for the gradient: amber (accuracy 0) → green (accuracy 1). */
const GRADIENT_HUE_LOW = 55;
const GRADIENT_HUE_HIGH = 145;
const GRADIENT_LIGHTNESS = 0.72;
const GRADIENT_CHROMA = 0.15;

/**
 * Format a grapheme tooltip with example words.
 *
 * formatBadgeTooltip('a_e', ['cake', 'made', 'lake'])
 *   → "a_e as in cake, made, or lake."
 *
 * Handles 1, 2, or 3+ examples gracefully.
 */
export function formatBadgeTooltip(grapheme: string, examples: string[]): string {
  if (examples.length === 0) return grapheme;
  if (examples.length === 1) return `${grapheme} as in ${examples[0]}.`;
  const last = examples[examples.length - 1];
  const rest = examples.slice(0, -1).join(', ');
  return `${grapheme} as in ${rest}, or ${last}.`;
}

/**
 * Gradient colour for an accuracy, faded toward the neutral grey by
 * `certainty` (0 = grey, 1 = full gradient colour).
 */
function gradientColor(accuracy: number, certainty: number = 1): string {
  const t = Math.max(0, Math.min(1, accuracy));
  const c = Math.max(0, Math.min(1, certainty));
  const hue = GRADIENT_HUE_LOW + (GRADIENT_HUE_HIGH - GRADIENT_HUE_LOW) * t;
  const lightness = FILLING_LIGHTNESS + (GRADIENT_LIGHTNESS - FILLING_LIGHTNESS) * c;
  return oklchToRgb(lightness, GRADIENT_CHROMA * c, hue);
}

/** Badge background for an evidence state. */
export function evidenceColor(evidence: SkillEvidence): string {
  const s = evidence.state;
  if (s.kind === 'mastered') return MASTERED_COLOR;
  if (s.kind === 'filling') {
    if (s.have === 0) return FILLING_COLOR;
    return gradientColor(evidence.weightedAccuracy, s.have / s.need);
  }
  return gradientColor(s.accuracy);
}

/** One-line state description for tooltips / captions. */
export function evidenceStateLabel(evidence: SkillEvidence): string {
  const s = evidence.state;
  if (s.kind === 'mastered') return 'Mastered';
  if (s.kind === 'filling') {
    if (s.have === 0) return 'Not practised yet';
    return `Still exploring · ${s.have} ${s.have === 1 ? 'try' : 'tries'}`;
  }
  return `${Math.round(s.accuracy * 100)}% recently`;
}

/** "just now" / "3 h ago" / "2 wk ago" style relative time. */
export function formatLastSeen(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day} day${day === 1 ? '' : 's'} ago`;
  const wk = Math.round(day / 7);
  if (wk < 9) return `${wk} wk ago`;
  const mo = Math.round(day / 30);
  return `${mo} mo ago`;
}
