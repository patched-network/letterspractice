/**
 * Session Summary Composable
 *
 * Derives structured session summary data from StudySessionRecord arrays.
 * Parses card IDs and tags to determine:
 *   - New topics introduced (GPC intros seen this session)
 *   - Topics reviewed (exercises practiced, excluding intros)
 *   - Trouble spots (GPCs where the learner failed exercise cards)
 *   - Coming soon (next letters in the progression)
 *
 * Card ID conventions (from generate-cards.ts):
 *   - `c-intro-{gpcShortId}`     → GPC introduction
 *   - `c-sight-intro-{word}`     → sight-word introduction (gpcShortId `WORD-{word}`)
 *   - `c-spelling-{word}`        → Spelling exercise
 *   - `c-wst-{gpcShortId}`       → Who Said That exercise
 *   - `c-wst-fg-{group}-{letter}`→ WST focus group exercise
 *   - `c-ws-{word}-{hash}`       → Word Selection exercise
 *   - `c-ml-{word}-{blanks}`     → Missing Letters exercise
 */

import { computed, type Ref, ref } from 'vue';
import {
  parseGpcIntroCardId,
  parseDigraphGpcIntroCardId,
  parseSplitDigraphIntroCardId,
  parseSightWordIntroCardId,
  parseWhoSaidThatCardId,
} from '../services/tags';
import { computeAndCacheIntroForecast } from '../services/introForecast';
import { assignmentFor, GPC_CATALOGUE, UNASSIGNED } from '../services/curriculum';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single card presentation record, as emitted by StudySession's
 * `session-finished` event. Card tags provide the primary semantic input
 * for reviewed/trouble-topic derivation.
 */
export interface SessionRecordEntry {
  card: {
    course_id: string;
    card_id: string;
    card_elo: number;
    tags?: string[];
  };
  item?: unknown;
  /** Card records — each entry is a response. `isCorrect` finds the misses;
   *  `performance` (per-GPC scores, where the card grades them) says which
   *  GPCs each miss was on. */
  records?: Array<{ isCorrect?: boolean; performance?: unknown; [key: string]: unknown }>;
}

/** A topic that was newly introduced this session */
export interface IntroTopic {
  /** Human-readable letter/grapheme label, e.g. "s", "sh", "a_e" */
  grapheme: string;
  /** The GPC short ID, e.g. "s-S", "sh-SH" */
  gpcShortId: string;
  /** The card ID that introduced it */
  cardId: string;
  /** The lesson that unlocks this GPC (curriculum assignment); null if unassigned or uncatalogued */
  lessonId: string | null;
}

/** A topic that was exercised/reviewed this session */
export interface ReviewedTopic {
  /** Human-readable label */
  grapheme: string;
  /** GPC short ID */
  gpcShortId: string;
  /** How many exercise cards involved this GPC */
  exerciseCount: number;
  /** The distinct exercise types seen (spelling, wst, ws, ml) */
  exerciseTypes: string[];
  /** The lesson that unlocks this GPC (curriculum assignment); null if unassigned or uncatalogued */
  lessonId: string | null;
}

/** A topic coming soon in the progression */
export interface ComingSoonTopic {
  /** The letter character */
  letter: string;
}

/** A topic where the learner struggled this session */
export interface TroubleSpot {
  /** Human-readable label */
  grapheme: string;
  /** GPC short ID (or letter proxy) */
  gpcShortId: string;
  /** Failed attempts charged to this GPC (see `missedShortIds`) */
  failCount: number;
  /** Number of total attempts (to give a ratio sense) */
  totalAttempts: number;
  /** The exercise types where failures occurred */
  exerciseTypes: string[];
  /** What was answered, in session order, where the card type says it
   *  plainly (spelling, who-said-that); empty otherwise. */
  misses: MissDetail[];
}

/** One wrong answer charged to a GPC. */
export type MissDetail =
  /** Spelling: typed `answer` for `word`. */
  | { kind: 'spelled'; word: string; answer: string }
  /** Who said that: picked `answer` when the sound was `target`'s. */
  | { kind: 'picked'; target: string; answer: string };

export interface SessionSummary {
  /** New GPC introductions seen this session */
  newTopics: IntroTopic[];
  /** GPCs exercised (reviewed) this session, excluding intros */
  reviewedTopics: ReviewedTopic[];
  /** GPCs where the learner stumbled (failed exercise cards) */
  troubleSpots: TroubleSpot[];
  /** Next letters likely to be introduced */
  comingSoon: ComingSoonTopic[];
  /** Total cards presented this session */
  totalCards: number;
}

// ---------------------------------------------------------------------------
// Card ID Parsing
// ---------------------------------------------------------------------------

/** Prefix constants still used for non-shared parsing paths */
const PREFIX_SPELLING = 'c-spelling-';
const PREFIX_WST_FG = 'c-wst-fg-';
const PREFIX_WS = 'c-ws-';
const PREFIX_ML = 'c-ml-';

export interface ParsedCard {
  cardId: string;
  type: 'intro' | 'spelling' | 'wst' | 'wst-fg' | 'ws' | 'ml' | 'unknown';
  /** For intro: the GPC short ID. For exercises: derived info. */
  gpcShortId?: string;
  /** For exercise cards: the target word */
  word?: string;
  /** For WST focus-group: the group name */
  group?: string;
  /** For WST focus-group: the target letter */
  letter?: string;
}

function parseCardId(cardId: string): ParsedCard {
  // Order matters — wst-fg before shared wst parsing (prefix overlap)
  if (cardId.startsWith(PREFIX_WST_FG)) {
    // c-wst-fg-{group}-{letter}
    const rest = cardId.slice(PREFIX_WST_FG.length);
    const lastDash = rest.lastIndexOf('-');
    if (lastDash > 0) {
      return {
        cardId,
        type: 'wst-fg',
        group: rest.slice(0, lastDash),
        letter: rest.slice(lastDash + 1),
      };
    }
    return { cardId, type: 'wst-fg' };
  }

  const parsedIntro = parseGpcIntroCardId(cardId);
  if (parsedIntro) {
    return {
      cardId,
      type: 'intro',
      gpcShortId: parsedIntro.gpcShortId,
    };
  }

  const parsedDigraphIntro = parseDigraphGpcIntroCardId(cardId);
  if (parsedDigraphIntro) {
    return {
      cardId,
      type: 'intro',
      gpcShortId: parsedDigraphIntro.gpcShortId,
    };
  }

  const parsedSplitIntro = parseSplitDigraphIntroCardId(cardId);
  if (parsedSplitIntro) {
    return {
      cardId,
      type: 'intro',
      gpcShortId: parsedSplitIntro.gpcShortId,
    };
  }

  const parsedSightIntro = parseSightWordIntroCardId(cardId);
  if (parsedSightIntro) {
    return {
      cardId,
      type: 'intro',
      gpcShortId: parsedSightIntro.gpcShortId,
    };
  }

  if (cardId.startsWith(PREFIX_SPELLING)) {
    // c-spelling-{word}
    const word = cardId.slice(PREFIX_SPELLING.length);
    return { cardId, type: 'spelling', word };
  }

  const parsedWst = parseWhoSaidThatCardId(cardId);
  if (parsedWst) {
    return {
      cardId,
      type: 'wst',
      gpcShortId: parsedWst.gpcShortId,
    };
  }

  if (cardId.startsWith(PREFIX_WS)) {
    // c-ws-{word}-{hash}
    const rest = cardId.slice(PREFIX_WS.length);
    const lastDash = rest.lastIndexOf('-');
    const word = lastDash > 0 ? rest.slice(0, lastDash) : rest;
    return { cardId, type: 'ws', word };
  }

  if (cardId.startsWith(PREFIX_ML)) {
    // c-ml-{word}-{blanks}
    const rest = cardId.slice(PREFIX_ML.length);
    const lastDash = rest.lastIndexOf('-');
    const word = lastDash > 0 ? rest.slice(0, lastDash) : rest;
    return { cardId, type: 'ml', word };
  }

  return { cardId, type: 'unknown' };
}

/**
 * Extract the primary grapheme from a GPC short ID.
 * e.g. "s-S" → "s", "sh-SH" → "sh", "a_e-EY" → "a_e"; a sight word's is the
 * word ("WORD-said" → "said")
 */
function graphemeFromShortId(shortId: string): string {
  if (shortId.startsWith('WORD-')) return shortId.slice('WORD-'.length);
  const dashIndex = shortId.indexOf('-');
  return dashIndex > 0 ? shortId.slice(0, dashIndex) : shortId;
}

let lessonByShortId: Map<string, string> | null = null;

/** The lesson that unlocks a GPC, by short ID (catalogue id minus `GPC-`) */
function lessonForShortId(shortId: string): string | null {
  if (!lessonByShortId) {
    lessonByShortId = new Map();
    for (const entry of GPC_CATALOGUE) {
      const lesson = assignmentFor(entry)?.unlockedBy;
      if (lesson && lesson !== UNASSIGNED) lessonByShortId.set(entry.id.replace(/^GPC-/, ''), lesson);
    }
  }
  return lessonByShortId.get(shortId) ?? null;
}

function shortIdFromTag(tag: string, prefix: string): string | null {
  return tag.startsWith(prefix) ? tag.slice(prefix.length) : null;
}

function exercisedShortIdsFromTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return tags
    .map(tag => shortIdFromTag(tag, 'gpc:exercise:'))
    .filter((shortId): shortId is string => Boolean(shortId));
}

/**
 * Which of a card's GPCs a wrong response was on. Where the card graded GPCs
 * (spelling, missing letters, who-said-that), only those scored 0: "fis" for
 * "fix" is a miss on x, not on f or i. Otherwise the whole card's GPCs:
 * nothing finer was recorded. A spelling the grader left unjudged ("cats" for
 * "cat": nothing to blame) charges none.
 */
/** The wrong answer as a MissDetail, for card types where it reads plainly. */
function missDetail(card: ParsedCard, userAnswer: unknown): MissDetail | null {
  if (typeof userAnswer !== 'string' || !userAnswer.trim()) return null;
  const answer = userAnswer.trim().toLowerCase();
  if (card.type === 'spelling' && card.word) return { kind: 'spelled', word: card.word, answer };
  const target =
    card.type === 'wst' && card.gpcShortId ? graphemeFromShortId(card.gpcShortId)
    : card.type === 'wst-fg' ? card.letter
    : undefined;
  return target ? { kind: 'picked', target: target.toLowerCase(), answer } : null;
}

export function missedShortIds(
  cardType: ParsedCard['type'],
  exercised: string[],
  performance: unknown,
): string[] {
  const perGpc =
    performance && typeof performance === 'object'
      ? Object.entries(performance as Record<string, unknown>).filter(([k]) => k.startsWith('gpc:exercise:'))
      : [];
  if (perGpc.length === 0) return cardType === 'spelling' ? [] : exercised;
  const zeroed = new Set(
    perGpc.filter(([, v]) => v === 0).map(([k]) => shortIdFromTag(k, 'gpc:exercise:')),
  );
  return exercised.filter((id) => zeroed.has(id));
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useSessionSummary(sessionRecords: Ref<SessionRecordEntry[]>) {
  const comingSoonTopics = ref<ComingSoonTopic[]>([]);

  const summary = computed<SessionSummary>(() => {
    const records = sessionRecords.value;
    if (!records || records.length === 0) {
      return {
        newTopics: [],
        reviewedTopics: [],
        troubleSpots: [],
        comingSoon: comingSoonTopics.value,
        totalCards: 0,
      };
    }

    const parsed = records.map(r => parseCardId(r.card.card_id));

    // --- New Topics (intros) ---
    const introCards = parsed.filter(p => p.type === 'intro' && p.gpcShortId);
    const seenIntroIds = new Set<string>();
    const newTopics: IntroTopic[] = [];

    for (const card of introCards) {
      if (!card.gpcShortId || seenIntroIds.has(card.gpcShortId)) continue;
      seenIntroIds.add(card.gpcShortId);
      newTopics.push({
        grapheme: graphemeFromShortId(card.gpcShortId),
        gpcShortId: card.gpcShortId,
        cardId: card.cardId,
        lessonId: lessonForShortId(card.gpcShortId),
      });
    }

    // --- Reviewed Topics (exercises derived from gpc:exercise:* tags) ---
    const exerciseMap = new Map<string, { count: number; types: Set<string> }>();

    records.forEach((record, index) => {
      const card = parsed[index];
      if (card.type === 'intro' || card.type === 'unknown') return;

      const exercisedShortIds = exercisedShortIdsFromTags(record.card.tags);
      for (const shortId of exercisedShortIds) {
        const existing = exerciseMap.get(shortId);
        if (existing) {
          existing.count++;
          existing.types.add(card.type);
        } else {
          exerciseMap.set(shortId, { count: 1, types: new Set([card.type]) });
        }
      }
    });

    const reviewedTopics: ReviewedTopic[] = [...exerciseMap.entries()]
      .map(([gpcShortId, data]) => ({
        grapheme: graphemeFromShortId(gpcShortId),
        gpcShortId,
        exerciseCount: data.count,
        exerciseTypes: [...data.types],
        lessonId: lessonForShortId(gpcShortId),
      }))
      .sort((a, b) => b.exerciseCount - a.exerciseCount);

    // --- Trouble Spots (failed exercise cards) ---
    // Walk the records looking for cards with at least one incorrect response.
    // Accumulate per-GPC fail/total counts (per GPC, not grapheme: the
    // summary marks each GPC's chip).
    const troubleMap = new Map<string, {
      grapheme: string;
      gpcShortId: string;
      failCount: number;
      totalAttempts: number;
      types: Set<string>;
      misses: MissDetail[];
    }>();

    for (const record of records) {
      const card = parseCardId(record.card.card_id);
      if (card.type === 'intro' || card.type === 'unknown') continue;

      const responses = record.records ?? [];
      if (responses.length === 0) continue;

      const total = responses.length;
      const exercised = exercisedShortIdsFromTags(record.card.tags);

      // Per GPC: this card's wrong responses on it, and what they were.
      const fails = new Map<string, { count: number; misses: MissDetail[] }>();
      for (const r of responses) {
        if (r.isCorrect !== false) continue;
        const detail = missDetail(card, r.userAnswer);
        for (const id of missedShortIds(card.type, exercised, r.performance)) {
          const f = fails.get(id) ?? { count: 0, misses: [] };
          f.count++;
          if (detail) f.misses.push(detail);
          fails.set(id, f);
        }
      }

      for (const [gpcShortId, f] of fails) {
        const existing = troubleMap.get(gpcShortId);
        if (existing) {
          existing.failCount += f.count;
          existing.totalAttempts += total;
          existing.types.add(card.type);
          existing.misses.push(...f.misses);
        } else {
          troubleMap.set(gpcShortId, {
            grapheme: graphemeFromShortId(gpcShortId),
            gpcShortId,
            failCount: f.count,
            totalAttempts: total,
            types: new Set([card.type]),
            misses: f.misses,
          });
        }
      }
    }

    const troubleSpots: TroubleSpot[] = [...troubleMap.values()]
      .map(t => ({
        grapheme: t.grapheme,
        gpcShortId: t.gpcShortId,
        failCount: t.failCount,
        totalAttempts: t.totalAttempts,
        exerciseTypes: [...t.types],
        misses: t.misses,
      }))
      .sort((a, b) => b.failCount - a.failCount);

    return {
      newTopics,
      reviewedTopics,
      troubleSpots,
      comingSoon: comingSoonTopics.value,
      totalCards: records.length,
    };
  });

  /**
   * Load "coming soon" topics from the real navigation pipeline.
   *
   * `computeAndCacheIntroForecast` runs the live pipeline's commit-free
   * `forecast()` over the unseen near frontier (gated intros included, ranked by
   * nearness-to-unlock — NOT just the already-reachable set, which the session
   * itself drains; see introForecast.ts), keeps the active-lesson `gpc:intro:*`
   * ones, and persists the snapshot to the userdb — so this both populates the
   * display AND refreshes the cache the nudge email reads out-of-band. Replaces
   * the old hardcoded `TEACHING_ORDER` guess; intros are now whatever the
   * curriculum + the learner's progress put next in line.
   */
  async function loadComingSoon() {
    try {
      const snapshot = await computeAndCacheIntroForecast();
      comingSoonTopics.value = (snapshot?.intros ?? [])
        .slice(0, 3)
        .map((entry) => ({ letter: graphemeFromShortId(entry.gpcShortId) }));
    } catch (e) {
      console.warn('[useSessionSummary] Failed to load coming-soon topics:', e);
      comingSoonTopics.value = [];
    }
  }

  return {
    summary,
    loadComingSoon,
  };
}
