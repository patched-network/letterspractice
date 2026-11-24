/**
 * LetterGatingFilter — gates spelling cards behind letter progression state.
 *
 * Cards are only eligible when every letter in the target word has been
 * unlocked (via GPC Intro completion). This filter reads the
 * `LetterProgressionState` document written by `recordGpcIntroComplete()`,
 * ensuring a single source of truth.
 *
 * ## Pipeline role
 *
 * Registered as a FILTER via `registerNavigator`. Receives candidate cards
 * from the generator(s) and zeros out scores for ineligible cards.
 *
 * ## Word extraction
 *
 * Card IDs follow deterministic conventions set by `generate-cards.ts`:
 *   - Spelling:       `c-spelling-{word}`
 *
 * The `ui:spelling` tag confirms card type; the word is parsed from the ID.
 * Word-selection cards (`c-ws-*`) are intentionally not gated here.
 *
 * ## Cold-start behaviour
 *
 * When no `LetterProgressionState` exists (brand-new user), the unlocked
 * set is empty. All spelling/word-selection cards are gated, which is
 * correct — the user must first unlock letters via WST questions.
 */

import type { CourseDBInterface, UserDBInterface } from '@vue-skuilder/db';
import { ContentNavigator } from '@vue-skuilder/db';
import type { WeightedCard, GeneratorResult } from '@vue-skuilder/db';
import type { ContentNavigationStrategyData } from '@vue-skuilder/db';
import type { CardFilter, FilterContext } from '@vue-skuilder/db';
import type { LetterProgressionState } from './userState.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tags applied during card generation that identify card type */
const TAG_SPELLING = 'ui:spelling';
const TAG_MISSING_LETTERS = 'ui:missing-letters';
/** Card-ID prefixes set by generate-cards.ts */
const PREFIX_SPELLING = 'c-spelling-';
const PREFIX_ML = 'c-ml-';

/**
 * Minimum number of unlocked keycaps before spelling (full-word production)
 * is encouraged. Below this surface, reachable spelling cards are still
 * completable but soft-penalized rather than surfaced at full priority.
 */
const MIN_KEYCAPS_FOR_SPELLING = 5;

/**
 * Soft-penalty divisor applied to reachable-but-discouraged spelling cards.
 * Keeps the card eligible (score > 0, so it survives the pipeline's
 * zero-score filter) but deprioritized far below unlocked content.
 */
const SPELLING_SOFT_PENALTY_DIVISOR = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracted gating target from a card ID.
 *
 * - Spelling cards: the full word (every letter must be unlocked).
 * - MissingLetters cards: only the blanked letters (those are what the
 *   learner must produce; the visible letters are shown, not typed).
 * - Other card types: `null` (not gated).
 */
interface GatingTarget {
  /** The letters that must be unlocked for this card to be reachable */
  letters: string;
  /** The full word (for logging / provenance) */
  word: string;
}

function extractGatingTarget(cardId: string, tags: string[]): GatingTarget | null {
  // Spelling cards: c-spelling-{word} — gate on full word
  if (tags.includes(TAG_SPELLING) || cardId.startsWith(PREFIX_SPELLING)) {
    if (cardId.startsWith(PREFIX_SPELLING)) {
      const word = cardId.slice(PREFIX_SPELLING.length);
      return { letters: word, word };
    }
  }

  // MissingLetters cards: c-ml-{word}-{blanks}
  // Gate only on the blanked positions — those are the letters the learner types.
  if (tags.includes(TAG_MISSING_LETTERS) || cardId.startsWith(PREFIX_ML)) {
    if (cardId.startsWith(PREFIX_ML)) {
      const rest = cardId.slice(PREFIX_ML.length);
      const lastDash = rest.lastIndexOf('-');
      if (lastDash > 0) {
        const word = rest.slice(0, lastDash);
        const blanksStr = rest.slice(lastDash + 1);
        const blankIndices = blanksStr.split(',').map(Number).filter(Number.isFinite);
        const blankedLetters = blankIndices
          .map((i) => word[i])
          .filter((ch): ch is string => ch !== undefined)
          .join('');
        return { letters: blankedLetters || word, word };
      }
      return { letters: rest, word: rest };
    }
  }

  // Word-selection cards are intentionally NOT gated — they don't require
  // the user to produce individual letters, so letter progression doesn't apply.

  return null;
}

/**
 * Check whether every letter in `word` appears in the `unlocked` set.
 *
 * Only unique alphabetic characters are checked (punctuation, digits, etc.
 * are ignored).
 */
function wordIsReachable(word: string, unlocked: Set<string>): boolean {
  for (const ch of word.toLowerCase()) {
    if (ch >= 'a' && ch <= 'z' && !unlocked.has(ch)) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/**
 * Navigation filter that zeros out cards whose target words contain letters
 * the user hasn't yet unlocked.
 *
 * Extends `ContentNavigator` (required by `registerNavigator`) and implements
 * `CardFilter` (required by `PipelineAssembler`).
 */
export class LetterGatingFilter extends ContentNavigator implements CardFilter {
  /** Human-readable name surfaced in pipeline logs / provenance */
  name: string;

  /**
   * Its penalties mean not ready (a card needs letters the learner hasn't
   * unlocked): regulators won't lift them.
   */
  static readonly kind = 'gate' as const;
  readonly kind = LetterGatingFilter.kind;

  constructor(
    user: UserDBInterface,
    course: CourseDBInterface,
    strategyData: ContentNavigationStrategyData,
  ) {
    super(user, course, strategyData);
    this.name = strategyData.name || 'Letter Gating Filter';
  }

  // ---------------------------------------------------------------------------
  // Strategy state — reads the LetterProgression doc
  // ---------------------------------------------------------------------------

  /**
   * Override the default strategy key so that `getStrategyState()` reads the
   * `LetterProgression` document written by `recordGpcIntroComplete()`.
   */
  protected override get strategyKey(): string {
    return 'LetterProgression';
  }

  // ---------------------------------------------------------------------------
  // CardFilter implementation
  // ---------------------------------------------------------------------------

  async transform(cards: WeightedCard[], _context: FilterContext): Promise<WeightedCard[]> {
    // Load current letter progression
    const state = await this.getStrategyState<LetterProgressionState>();
    const unlocked = new Set<string>(
      (state?.unlockedLetters ?? []).map((l) => l.toLowerCase()),
    );

    const strategyId = this.strategyId || 'NAVIGATION_STRATEGY-letter-gating';

    return cards.map((card) => {
      const tags = card.tags ?? [];
      const isSpelling = tags.includes(TAG_SPELLING) || card.cardId.startsWith(PREFIX_SPELLING);

      const target = extractGatingTarget(card.cardId, tags);

      // Not a gated card type — pass through unchanged
      if (target === null) {
        return {
          ...card,
          provenance: [
            ...card.provenance,
            {
              strategy: 'letterGatingFilter',
              strategyName: this.name,
              strategyId,
              action: 'passed' as const,
              score: card.score,
              reason: 'Not a gated card type',
            },
          ],
        };
      }

      // --- Reachability gate (HARD) ---
      // If any required letter is still locked, its keycap is absent from the
      // keyboard and the card is literally uncompletable. Hard-zero (removed
      // by the pipeline's zero-score filter). This applies to spelling and to
      // MissingLetters (gated on the blanked positions only).
      const reachable = wordIsReachable(target.letters, unlocked);
      if (!reachable) {
        const missingLetters = [...new Set(
          target.letters
            .toLowerCase()
            .split('')
            .filter((ch) => ch >= 'a' && ch <= 'z' && !unlocked.has(ch)),
        )];
        return {
          ...card,
          score: 0,
          provenance: [
            ...card.provenance,
            {
              strategy: 'letterGatingFilter',
              strategyName: this.name,
              strategyId,
              action: 'penalized' as const,
              score: 0,
              reason: `"${target.word}" blocked — missing letters: ${missingLetters.join(', ')}`,
            },
          ],
        };
      }

      // --- Spelling readiness policy (SOFT) ---
      // Full-word production is the hardest task; discourage it until the
      // learner has a minimum keycap surface. A reachable-but-early spelling
      // card is still completable, so penalize softly (÷divisor) rather than
      // removing it — it stays available as a low-priority fallback.
      if (isSpelling && unlocked.size < MIN_KEYCAPS_FOR_SPELLING) {
        const softScore = card.score / SPELLING_SOFT_PENALTY_DIVISOR;
        return {
          ...card,
          score: softScore,
          provenance: [
            ...card.provenance,
            {
              strategy: 'letterGatingFilter',
              strategyName: this.name,
              strategyId,
              action: 'penalized' as const,
              score: softScore,
              reason: `Spelling soft-penalized — only ${unlocked.size} keycap(s) unlocked (< ${MIN_KEYCAPS_FOR_SPELLING})`,
            },
          ],
        };
      }

      // Reachable, and (for spelling) enough keycaps unlocked — full score.
      return {
        ...card,
        score: card.score,
        provenance: [
          ...card.provenance,
          {
            strategy: 'letterGatingFilter',
            strategyName: this.name,
            strategyId,
            action: 'passed' as const,
            score: card.score,
            reason: `"${target.word}" is reachable (required letters unlocked)`,
          },
        ],
      };
    });
  }

  // ---------------------------------------------------------------------------
  // ContentNavigator — filters must not be used as generators
  // ---------------------------------------------------------------------------

  override async getWeightedCards(_limit: number): Promise<GeneratorResult> {
    throw new Error(
      'LetterGatingFilter is a filter and should not be used as a generator. ' +
        'Use Pipeline with a generator and this filter via transform().',
    );
  }
}
