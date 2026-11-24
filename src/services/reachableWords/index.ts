/**
 * Reachable Words
 * ===============
 *
 * Turns a child's phonics knowledge (their ELO `gpc:*` tag scores) into a
 * prediction of the *sorts of words they can now decode* — the data behind
 * the experimental /progress "Words within reach" card.
 *
 * The heavy lifting is already baked into the static word table shipped at
 * `reachable-words.generated.json`: every candidate word carries the catalogue
 * GPC ids it requires (`g`), its SUBTLEX frequency (`f`) and a phonics pattern
 * (`p`). See `content/phoneticAnalytics/scripts/generate-reachable-words.ts`.
 *
 * Reachability is then a pure set test, done live in the browser:
 *   a word is decodable ⇔ every GPC it requires is "known" by this child.
 *
 * Two confidence tiers are produced:
 *   • solid   — every required GPC is *mastered*  → "can likely sound out"
 *   • stretch — every required GPC has been *seen* → "ready to try together"
 *
 * NOTE: these are estimates, not guarantees. Copy in the UI says so. The
 * interactive checker (`checkWord`) lets a parent test any word and see the
 * per-grapheme reasoning, which is the trust-calibration path.
 */

import { decodeWord } from '../../../content/phoneticAnalytics/lib/decode';
import { getGpcEntry } from '../tags/gpcCatalogue';
import { LESSON_CATALOG } from '../lessons';
import { getReporter } from '../lessons/progress/registry';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** ELO baseline assigned to an unseen / fresh tag (matches defaultMastery). */
const ELO_BASELINE = 1000;

/**
 * Fallback mastery bar for GPCs that no *active* lesson evaluates (e.g. sight
 * words, or GPCs taught only by deferred lessons). GPCs owned by an active
 * lesson use that lesson's reporter thresholds instead — see
 * `getGpcMasteryThresholds()` — so PTT's "mastered" verdict matches the
 * mature/learning coloring in "The Pieces" (the CurriculumCard).
 */
export const GPC_DEFAULT_MIN_COUNT = 3;
export const GPC_DEFAULT_MIN_ELO = 1050;

/** ELO at which the graded mastery `level` saturates to 1.0. */
const ELO_FULL = 1200;

/**
 * Synthetic catalogue GPCs that are never taught in isolation — they ride
 * along with another GPC (e.g. the silent final-e of a split digraph is
 * gated by the split vowel). Treated as always-known so they never block.
 */
const ALWAYS_KNOWN = new Set(['GPC-e-silent-split']);

/**
 * Voicing fudge: a known GPC vouches for its voiced/voiceless twin, but only as
 * a *stretch* — never full mastery (see `masteryOf`). The corpus tags words by
 * their true pronunciation, so "is"/"as"/"his" and every regular plural require
 * `GPC-s-Z` (the /z/ reading of s) — ~16% of the corpus, incl. the very highest-
 * frequency words. A child who can sound the /s/ in "sit" (GPC-s-S) can take a
 * nudge at the /z/ in "is", so we let s-S satisfy s-Z. This also re-aligns the
 * carousel with the live `decodeWord` checker, which reads a bare "is" as s-S.
 *
 * Keyed required-GPC → donor GPC. Scoped to s↔z for now; deliberately narrow.
 */
const FUDGE_DONORS: Record<string, string> = {
  'GPC-s-Z': 'GPC-s-S',
};

/** Level handed to a fudged GPC — capped low so it always reads as "shaky". */
const FUDGE_LEVEL = 0.5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WordRow {
  /** word */
  w: string;
  /** frequency */
  f: number;
  /** required catalogue GPC ids */
  g: string[];
  /** phonics pattern */
  p: string;
}

export interface GpcMastery {
  gpcId: string;
  score: number;
  count: number;
  /** Exercised at all. Exposure (pre-warming) deliberately does NOT count. */
  seen: boolean;
  /** Cleared the solid thresholds. */
  mastered: boolean;
  /** Graded 0..1 confidence, for visualisation. */
  level: number;
}

export type WordTier = 'solid' | 'stretch';

export interface ScoredWord {
  word: string;
  freq: number;
  gpcs: string[];
  pattern: string;
  /** GPC ids that are the limiting factor (lowest mastery) for this word. */
  limiting: string[];
  /** Weakest required-GPC level (0..1) — how shaky the shakiest letter is. */
  weakestLevel: number;
  /**
   * Recency proxy: the lowest `exercise:*` count among the word's required GPCs
   * (synthetic always-known GPCs excluded). Low ⇒ the skill that brought this
   * word into reach is freshly acquired ⇒ a "newer" decodable. The only recency
   * signal we have — `EloRank` carries no timestamp. Degrades gracefully: once
   * every GPC is well-trodden, counts flatten and frequency dominates instead.
   */
  unlockCount: number;
  /** The freshest required GPC (argmin of the count above) — the "unlocker". */
  unlockGpc: string;
}

export interface FeatureGroup {
  key: string;
  label: string;
  description: string;
  /** A representative word for the group. */
  example: string;
  words: ScoredWord[];
}

export interface OneAwayGroup {
  gpcId: string;
  label: string;
  /** Words that would unlock if this single GPC were learned. */
  words: ScoredWord[];
  /** Aggregate frequency of those words (for ranking). */
  totalFreq: number;
}

export interface ReachableResult {
  /** Number of distinct GPCs the child has at least seen. */
  knownGpcCount: number;
  masteredGpcCount: number;
  /** Words confidently decodable (all GPCs mastered), freq-desc. */
  solid: ScoredWord[];
  /** Words within reach but stretchy (all GPCs seen, not all mastered). */
  stretch: ScoredWord[];
  /** Feature-based grouping over the solid+stretch set ("sorts of words"). */
  groups: FeatureGroup[];
  /** Momentum: words gated by exactly one not-yet-seen GPC. */
  oneAway: OneAwayGroup[];
}

export type CheckState = 'solid' | 'shaky' | 'new' | 'unknown';

export interface CheckSegment {
  text: string;
  gpcId: string | null;
  phoneme: string;
  state: CheckState;
  level: number;
}

export interface CheckResult {
  word: string;
  segments: CheckSegment[];
  /** Overall read: confident / stretch / not-yet-decodable / learned-by-heart. */
  verdict: 'confident' | 'stretch' | 'not-yet' | 'sight';
  /** Graphemes that are the blockers, for the explanatory copy. */
  blockers: string[];
  /** True when the word resists regular decoding (a corpus sight word). */
  isSightWord: boolean;
}

// ---------------------------------------------------------------------------
// Mastery profile
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function levelFor(score: number, count: number, seen: boolean, minCount: number): number {
  if (!seen) return 0;
  const eloPart = clamp01((score - ELO_BASELINE) / (ELO_FULL - ELO_BASELINE));
  const countPart = clamp01(count / minCount);
  return clamp01(0.35 * countPart + 0.65 * eloPart);
}

// ---------------------------------------------------------------------------
// Mastery thresholds — borrowed from the lesson reporters
// ---------------------------------------------------------------------------

export interface GpcThreshold {
  minCount: number;
  minElo: number;
}

let _gpcThresholds: Map<string, GpcThreshold> | null = null;

/**
 * Per-GPC mastery bar, sourced from the *same* lesson-reporter thresholds that
 * decide mature/learning in "The Pieces" (CurriculumCard). We walk the active
 * catalogue, ask each lesson's reporter for its mastery thresholds (this picks
 * up custom reporters like digraphs @ 5/1030, not just the generic defaults),
 * and index the `gpc:exercise:*` ones by catalogue GPC id.
 *
 * If a GPC is evaluated by more than one lesson, the strictest bar wins so PTT
 * never claims "mastered" ahead of the curriculum.
 */
export function getGpcMasteryThresholds(): Map<string, GpcThreshold> {
  if (_gpcThresholds) return _gpcThresholds;
  const map = new Map<string, GpcThreshold>();
  for (const lesson of LESSON_CATALOG) {
    const thresholds = getReporter(lesson.id).getMasteryThresholds(lesson);
    for (const t of thresholds) {
      if (!t.tag.startsWith('gpc:exercise:')) continue;
      const gpcId = `GPC-${t.tag.slice('gpc:exercise:'.length)}`;
      const minCount = t.minCount ?? GPC_DEFAULT_MIN_COUNT;
      const minElo = t.minElo ?? GPC_DEFAULT_MIN_ELO;
      const prev = map.get(gpcId);
      map.set(
        gpcId,
        prev
          ? { minCount: Math.max(prev.minCount, minCount), minElo: Math.max(prev.minElo, minElo) }
          : { minCount, minElo },
      );
    }
  }
  _gpcThresholds = map;
  return map;
}

function thresholdFor(gpcId: string): GpcThreshold {
  return (
    getGpcMasteryThresholds().get(gpcId) ?? {
      minCount: GPC_DEFAULT_MIN_COUNT,
      minElo: GPC_DEFAULT_MIN_ELO,
    }
  );
}

/**
 * Map a child's ELO tag scores onto a per-GPC mastery profile.
 *
 * PTT keys on `gpc:exercise:<suffix>` ONLY, where `<suffix>` is exactly the
 * catalogue id minus its `GPC-` prefix (e.g. `gpc:exercise:th-DH` ⇄ `GPC-th-DH`).
 *
 * `gpc:expose:*` tags are deliberately ignored. Exposure is internal
 * pre-warming bookkeeping — a consonant drill incidentally exposes the vowels
 * around it (the s-S discrimination "sit | hit fit" hands an exposure credit to
 * i-IH and t-T) — and no amount of exposure is evidence of working knowledge.
 * Counting it marked never-taught vowels "seen" and surfaced nonsense reachable
 * words (sense, five, found…) for a child who had only met consonants.
 */
export function buildGpcProfile(
  tagScores: Record<string, { score: number; count: number }>,
): Map<string, GpcMastery> {
  const profile = new Map<string, GpcMastery>();

  const ingest = (gpcId: string, score: number, count: number) => {
    const prev = profile.get(gpcId);
    const mergedScore = prev ? Math.max(prev.score, score) : score;
    const mergedCount = prev ? Math.max(prev.count, count) : count;
    const seen = mergedCount > 0;
    // Same per-tag test evaluateMastery() uses to color "The Pieces".
    const { minCount, minElo } = thresholdFor(gpcId);
    const mastered = mergedCount >= minCount && mergedScore >= minElo;
    profile.set(gpcId, {
      gpcId,
      score: mergedScore,
      count: mergedCount,
      seen,
      mastered,
      level: levelFor(mergedScore, mergedCount, seen, minCount),
    });
  };

  for (const [tag, info] of Object.entries(tagScores)) {
    // Exercise only — exposure is pre-warming, not working knowledge (see above).
    if (!tag.startsWith('gpc:exercise:')) continue;
    const suffix = tag.slice('gpc:exercise:'.length);
    ingest(`GPC-${suffix}`, info.score, info.count);
  }

  return profile;
}

function masteryOf(gpcId: string, profile: Map<string, GpcMastery>): GpcMastery {
  if (ALWAYS_KNOWN.has(gpcId)) {
    return { gpcId, score: ELO_FULL, count: GPC_DEFAULT_MIN_COUNT, seen: true, mastered: true, level: 1 };
  }
  const direct = profile.get(gpcId);
  if (direct?.seen) return direct;

  // Not directly known — let a voicing twin vouch for it, but only as a stretch
  // (seen, never mastered) so it can never reach the solo "solid" tier.
  const donorKey = FUDGE_DONORS[gpcId];
  const donor = donorKey ? profile.get(donorKey) : undefined;
  if (donor?.seen) {
    return {
      gpcId,
      score: donor.score,
      count: donor.count,
      seen: true,
      mastered: false,
      level: Math.min(donor.level, FUDGE_LEVEL),
    };
  }

  return (
    direct ?? {
      gpcId,
      score: ELO_BASELINE,
      count: 0,
      seen: false,
      mastered: false,
      level: 0,
    }
  );
}

// ---------------------------------------------------------------------------
// Word table loading (lazy — only on the /progress route)
// ---------------------------------------------------------------------------

let _table: WordRow[] | null = null;
let _sightWords: Set<string> | null = null;

export async function loadWordTable(): Promise<WordRow[]> {
  if (_table) return _table;
  const mod = await import('./reachable-words.generated.json');
  const data = (mod.default ?? mod) as { words: WordRow[] };
  _table = data.words;
  return _table;
}

/**
 * Set of words the corpus treats as *sight words* — tagged with a whole-word
 * `GPC-WORD-*` id because they resist regular grapheme→phoneme decoding
 * (the, you, said…). Built lazily from the loaded table; empty until then.
 */
function sightWordSet(): Set<string> {
  if (_sightWords) return _sightWords;
  if (!_table) return new Set();
  const set = new Set<string>();
  for (const row of _table) {
    if (row.g.some((g) => g.startsWith('GPC-WORD-'))) set.add(row.w);
  }
  _sightWords = set;
  return set;
}

/** Is this word in the corpus as a sight word? (Table must be loaded.) */
export function isSightWord(word: string): boolean {
  return sightWordSet().has(word.trim().toLowerCase());
}

/**
 * True when a catalogue GPC produces a vowel sound (any `vowels_*` category).
 * Used by the card to recognise the "consonants only, no vowel yet" cold-start:
 * every decodable word needs a vowel, so that state is *deliberately* empty.
 */
export function isVowelGpc(gpcId: string): boolean {
  return getGpcEntry(gpcId)?.category.startsWith('vowels_') ?? false;
}

// ---------------------------------------------------------------------------
// Feature grouping ("sorts of words")
// ---------------------------------------------------------------------------

interface FeatureDef {
  key: string;
  label: string;
  /** Compact tag for the showcase reel, e.g. "magic-e". */
  short: string;
  description: string;
}

const FEATURE_DEFS: Record<string, FeatureDef> = {
  sight: {
    key: 'sight',
    label: 'Tricky sight words',
    short: 'sight word',
    description: "Memorised whole — they don't fully follow the rules.",
  },
  magicE: {
    key: 'magicE',
    label: 'Magic-e words',
    short: 'magic-e',
    description: "A silent 'e' makes the vowel say its name (make, time).",
  },
  digraph: {
    key: 'digraph',
    label: 'Two-letter sound words',
    short: 'letter team',
    description: 'Letter teams like sh, ch, th, ck make a single sound.',
  },
  multi: {
    key: 'multi',
    label: 'Longer words',
    short: 'longer word',
    description: 'Two-beat words built from sounds they already know.',
  },
  simple: {
    key: 'simple',
    label: 'Sound-it-out words',
    short: 'sound-it-out',
    description: 'Each letter makes its own sound — blend straight through.',
  },
};

function featureKeyFor(word: ScoredWord): string {
  let hasDigraph = false;
  for (const gpcId of word.gpcs) {
    if (gpcId.startsWith('GPC-WORD-')) return 'sight';
    // True magic-e is signalled by a split-digraph vowel (a_e, i_e…), not by a
    // lone silent final-e (else, sense) which alignment also tags silent-split.
    const entry = getGpcEntry(gpcId);
    if (entry) {
      if (entry.matchType === 'split_digraph') return 'magicE';
      if (entry.matchType === 'digraph' || entry.matchType === 'trigraph') hasDigraph = true;
    }
  }
  if (hasDigraph) return 'digraph';
  // Multisyllabic-ish: phoneme patterns with two vowel slots (CVCV, CVCVC…).
  const vowelRuns = (word.pattern.match(/V/g) ?? []).length;
  if (vowelRuns >= 2) return 'multi';
  return 'simple';
}

function buildGroups(words: ScoredWord[]): FeatureGroup[] {
  const buckets = new Map<string, ScoredWord[]>();
  for (const w of words) {
    const key = featureKeyFor(w);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(w);
  }
  const groups: FeatureGroup[] = [];
  for (const def of Object.values(FEATURE_DEFS)) {
    const list = buckets.get(def.key);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => b.freq - a.freq);
    groups.push({ ...def, example: list[0].word, words: list });
  }
  // Largest, most useful groups first.
  groups.sort((a, b) => b.words.length - a.words.length);
  return groups;
}

// ---------------------------------------------------------------------------
// Showcase reel ("hero words")
// ---------------------------------------------------------------------------

export interface ShowcaseItem {
  word: string;
  freq: number;
  /** solid → can sound out solo; stretch → good to read together. */
  tier: WordTier;
  /** Feature key (FEATURE_DEFS). */
  sortKey: string;
  /** Compact label for the slide, e.g. "magic-e". */
  sortLabel: string;
  /** Catalogue GPC ids that combine to decode this word (for skill highlight). */
  gpcs: string[];
}

/**
 * Pick an ordered reel of hero words for the /progress showcase, biased toward
 * the reader's *most recent* gains.
 *
 * The whole reel is implicitly "what's newly within reach", so there's no
 * per-slide NEW badge — ordering carries the recency story on its own. We merge
 * solid + stretch and sort by `unlockCount` ascending (freshest unlocking skill
 * first), with frequency as the tiebreak so we never surface a rare word purely
 * for being new. Tier (green solo / yellow together) still rides on each slide.
 *
 * Trade-off vs. the old feature round-robin: the freshest words often share the
 * just-learned GPC, so the reel can cluster by sound (all the new -sh words at
 * once). That reads as a coherent "this just opened up" story, but it is less
 * varied than before — revisit if it feels repetitive.
 */
export function buildShowcase(result: ReachableResult, limit = 12): ShowcaseItem[] {
  const toItem = (w: ScoredWord, tier: WordTier): ShowcaseItem => {
    const key = featureKeyFor(w);
    return { word: w.word, freq: w.freq, tier, sortKey: key, sortLabel: FEATURE_DEFS[key].short, gpcs: w.gpcs };
  };

  const tagged: { w: ScoredWord; tier: WordTier }[] = [
    ...result.solid.map((w) => ({ w, tier: 'solid' as const })),
    ...result.stretch.map((w) => ({ w, tier: 'stretch' as const })),
  ];
  tagged.sort((a, b) => a.w.unlockCount - b.w.unlockCount || b.w.freq - a.w.freq);

  return tagged.slice(0, limit).map(({ w, tier }) => toItem(w, tier));
}

// ---------------------------------------------------------------------------
// GPC display labels
// ---------------------------------------------------------------------------

/** Human label for a catalogue GPC id, e.g. "sh → /SH/" or "sight word 'the'". */
export function gpcLabel(gpcId: string): string {
  if (gpcId.startsWith('GPC-WORD-')) {
    return `sight word "${gpcId.slice('GPC-WORD-'.length)}"`;
  }
  const entry = getGpcEntry(gpcId);
  if (entry) {
    const grapheme = entry.grapheme.replace('_', '–');
    return `${grapheme} → /${entry.phoneme}/`;
  }
  return gpcId.replace(/^GPC-/, '');
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function scoreWord(row: WordRow, states: GpcMastery[]): ScoredWord {
  let weakest = 1;
  let weakestId = '';
  let unlockCount = Infinity;
  let unlockGpc = '';
  for (const s of states) {
    if (s.level < weakest) {
      weakest = s.level;
      weakestId = s.gpcId;
    }
    // Recency is about *taught* skills, so ignore synthetic always-known GPCs
    // (the silent split-e) — otherwise their fixed count would peg every
    // magic-e word as perpetually "new".
    if (ALWAYS_KNOWN.has(s.gpcId)) continue;
    if (s.count < unlockCount) {
      unlockCount = s.count;
      unlockGpc = s.gpcId;
    }
  }
  if (unlockCount === Infinity) unlockCount = GPC_DEFAULT_MIN_COUNT; // all synthetic
  return {
    word: row.w,
    freq: row.f,
    gpcs: row.g,
    pattern: row.p,
    limiting: weakestId ? [weakestId] : [],
    weakestLevel: weakest,
    unlockCount,
    unlockGpc,
  };
}

export function classifyReachable(
  table: WordRow[],
  profile: Map<string, GpcMastery>,
): ReachableResult {
  const solid: ScoredWord[] = [];
  const stretch: ScoredWord[] = [];
  const oneAwayMap = new Map<string, ScoredWord[]>();

  for (const row of table) {
    const states = row.g.map((id) => masteryOf(id, profile));

    const allMastered = states.every((s) => s.mastered);
    const allSeen = states.every((s) => s.seen);

    if (allMastered) {
      solid.push(scoreWord(row, states));
    } else if (allSeen) {
      stretch.push(scoreWord(row, states));
    } else {
      const unseen = states.filter((s) => !s.seen);
      if (unseen.length === 1) {
        const id = unseen[0].gpcId;
        if (!oneAwayMap.has(id)) oneAwayMap.set(id, []);
        oneAwayMap.get(id)!.push(scoreWord(row, states));
      }
    }
  }

  solid.sort((a, b) => b.freq - a.freq);
  stretch.sort((a, b) => b.freq - a.freq);

  const oneAway: OneAwayGroup[] = [];
  for (const [gpcId, words] of oneAwayMap) {
    words.sort((a, b) => b.freq - a.freq);
    oneAway.push({
      gpcId,
      label: gpcLabel(gpcId),
      words,
      totalFreq: words.reduce((sum, w) => sum + w.freq, 0),
    });
  }
  oneAway.sort((a, b) => b.totalFreq - a.totalFreq);

  let masteredGpcCount = 0;
  for (const m of profile.values()) if (m.mastered) masteredGpcCount++;

  return {
    knownGpcCount: profile.size,
    masteredGpcCount,
    solid,
    stretch,
    groups: buildGroups([...solid, ...stretch]),
    oneAway,
  };
}

/**
 * Convenience: load + classify in one call.
 */
export async function getReachableWords(
  tagScores: Record<string, { score: number; count: number }>,
): Promise<ReachableResult> {
  const [table] = await Promise.all([loadWordTable()]);
  return classifyReachable(table, buildGpcProfile(tagScores));
}

// ---------------------------------------------------------------------------
// Interactive word checker
// ---------------------------------------------------------------------------

function stateFor(m: GpcMastery): CheckState {
  if (!m.seen) return 'new';
  if (m.mastered) return 'solid';
  return 'shaky';
}

/**
 * Decode an arbitrary typed word and grade each grapheme against this child's
 * mastery. The estimate the /progress predictions are built on, made
 * inspectable: the parent sees exactly which letters are solid vs shaky.
 */
export function checkWord(
  text: string,
  profile: Map<string, GpcMastery>,
): CheckResult {
  const clean = text.trim().toLowerCase();
  const sight = sightWordSet().has(clean);
  const decoded = decodeWord(clean);
  const segments: CheckSegment[] = [];
  const blockers: string[] = [];
  let anyUnknown = false;
  let anyUnseen = false;
  let anyShaky = false;

  for (const seg of decoded.segments) {
    if (!seg.gpcId) {
      anyUnknown = true;
      segments.push({ text: seg.grapheme, gpcId: null, phoneme: seg.phoneme, state: 'unknown', level: 0 });
      blockers.push(seg.grapheme);
      continue;
    }
    const m = masteryOf(seg.gpcId, profile);
    const state = stateFor(m);
    if (state === 'new') {
      anyUnseen = true;
      blockers.push(seg.grapheme);
    } else if (state === 'shaky') {
      anyShaky = true;
    }
    segments.push({
      text: seg.grapheme,
      gpcId: seg.gpcId,
      phoneme: seg.phoneme,
      state,
      level: m.level,
    });
  }

  let verdict: CheckResult['verdict'];
  if (sight) verdict = 'sight';
  else if (anyUnknown || anyUnseen) verdict = 'not-yet';
  else if (anyShaky) verdict = 'stretch';
  else verdict = 'confident';

  return { word: decoded.word, segments, verdict, blockers, isSightWord: sight };
}
