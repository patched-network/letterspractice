/**
 * Intro forecast — "what's next" peek-ahead + cache
 * ==================================================
 *
 * Answers "which new concepts will this learner meet next?" using the real
 * navigation pipeline rather than a hardcoded order.
 *
 * ## Why the obvious reading ("reachable + unseen intros") is wrong
 *
 * The pipeline's filters PENALIZE rather than zero (LessonGateFilter ×0.01,
 * hierarchy ×0.02, …) — gated cards keep a small-but-positive score. The
 * tempting definition of "coming soon" is "intros that survive `forecast()`
 * above the default reachability threshold", i.e. the intros that are unlocked
 * RIGHT NOW. But the study session is explicitly engineered to drain exactly
 * that set: the `prescribed` generator chases down every reachable intro and
 * surfaces it. So by session-end — when we compute this — the reachable-and-
 * unseen intro set has just been emptied, and "Coming Soon" comes up blank for
 * any steady learner. (The nudge email reading a stale snapshot masked this;
 * the in-session recompute did not.)
 *
 * ## What we actually want: the near frontier, ranked sensibly
 *
 * "Coming soon" is the stuff JUST BEYOND what the learner has reached — mostly
 * still gated. So we forecast with the threshold dropped to ~0 (keep the gated
 * frontier). `unseenOnly` excludes already-introduced concepts; we restrict to
 * ACTIVE-lesson concepts so we never dangle a concept whose lesson isn't offered
 * (see ACTIVE_LESSON_CONCEPT_TAGS); and we rank by `comingSoonRank`:
 *   - PRIMARY: pipeline score desc — a genuinely-imminent intro (its expose
 *     prereq met → hierarchy target-boost fired → score ~0.8) leads.
 *   - TIEBREAK: teaching-sequence position — the gated remainder all scores
 *     identically (~0.0165), so without this the order is arbitrary
 *     (≈ alphabetical); the sequence makes it read in curriculum order.
 * Finally dedupe by grapheme (so alternate pronunciations don't repeat a
 * letter) and take the top N. Degrades gracefully: a reachable-unseen intro
 * still ranks top; once everything active is introduced the set is honestly
 * empty.
 *
 * Why a cached snapshot (vs. computing on demand):
 *   - The forecast scans the whole card space through the filters — too heavy
 *     for an out-of-band caller (e.g. the nudge email, which runs server-side
 *     against someone else's userdb and has no live pipeline).
 *   - So we compute-and-cache it *in-session* (where the pipeline is live and
 *     the cost is amortised against a session the user already paid for) and
 *     persist a small snapshot to the userdb. The two consumers are:
 *       - SessionSummary "Coming Soon" — calls `computeAndCacheIntroForecast()`
 *         at session-end (it is the writer; it both recomputes and displays).
 *       - the nudge email — out-of-band direct read (`fetchIntroForecast` in
 *         adminUsersService) of the same `STRATEGY_STATE` doc.
 *
 * Framework boundary: the generic `getActivePipeline().forecast()` returns
 * scored, tag-hydrated cards and knows nothing about intros — the
 * `gpc:intro:*` interpretation lives entirely here (LP-side).
 *
 * Unlike the SRS review queue, "what's next" is stable between sessions (it only
 * advances as the learner progresses), so caching it is sound — it's refreshed
 * every session-end.
 */

import { getActivePipeline, getDataLayer } from '@vue-skuilder/db';
import config from '../../skuilder.config.json';
import {
  parseGpcIntroCardId,
  parseDigraphGpcIntroCardId,
  parseSplitDigraphIntroCardId,
} from './tags';
import { USER_STATE_KEYS } from './userState.types';
import { getLetterProgression } from './userState';
import { LESSON_REGISTRY } from './curriculum';
// Generated artifact (pipeline `gen:sequence`): the frequency-driven GPC
// teaching order. Imported to break ties WITHIN the flat gated tier of the
// forecast (see RANK below) — the pipeline scores every not-yet-reachable intro
// identically, so without a curriculum order the tiebreak is arbitrary
// (≈ alphabetical). App→outputs coupling is deliberate and narrow.
import gpcSequence from '../../content/phoneticAnalytics/outputs-v2/gpc-sequence.json';

const COURSE_ID: string = config.course;

/** Max intros to keep in the snapshot. */
const MAX_INTROS = 5;

/**
 * GPC short id → teaching-sequence position (lower = taught earlier). Built once
 * from the generated sequence: `GPC-s-Z` → `s-Z`. `WORD-*` sight-word steps and
 * the synthetic "initial" seed step are skipped (not GPC intros).
 */
const SEQ_INDEX: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  let i = 0;
  for (const step of gpcSequence.sequence) {
    const id = step.gpcId;
    if (typeof id !== 'string' || !id.startsWith('GPC-')) continue;
    const shortId = id.slice('GPC-'.length);
    if (shortId.startsWith('WORD-')) continue;
    if (!m.has(shortId)) m.set(shortId, i++);
  }
  return m;
})();

/**
 * Coming-soon ordering. Primary key is the pipeline score descending, so a
 * genuinely-imminent intro (its `gpc:expose:*` prereq met → hierarchy target-
 * boost fired → score ~0.8) leads. The tiebreak — which decides the otherwise-
 * flat gated tier (all ~0.0165) — is teaching-sequence position, so "what's
 * next" reads in curriculum order rather than alphabetically. Unsequenced ids
 * sort last.
 */
function comingSoonRank(
  a: { score: number; gpcShortId: string },
  b: { score: number; gpcShortId: string },
): number {
  if (b.score !== a.score) return b.score - a.score;
  const ai = SEQ_INDEX.get(a.gpcShortId) ?? Number.MAX_SAFE_INTEGER;
  const bi = SEQ_INDEX.get(b.gpcShortId) ?? Number.MAX_SAFE_INTEGER;
  return ai - bi;
}

/** Primary grapheme of a GPC short id: "sh-SH" → "sh", "a_e-EY" → "a_e". */
function graphemeOf(shortId: string): string {
  const dash = shortId.indexOf('-');
  return dash > 0 ? shortId.slice(0, dash) : shortId;
}

/**
 * Forecast threshold for the coming-soon query. Dropped near-zero (vs. the
 * pipeline default of 0.10) so that GATED intros — the near frontier we want —
 * survive the filter chain's multiplicative penalties. A tiny positive epsilon
 * still drops any hard-zeroed (truly unreachable) card. Ranking is left to
 * `forecast()`'s score-sort; see the module header.
 */
const COMING_SOON_THRESHOLD = 1e-9;

/**
 * Concept tags released by *active* lessons. "Coming Soon" is restricted to
 * these so we never surface an intro whose lesson isn't actually offered yet:
 * deferred lessons gate content but are never presented, so dangling their
 * intros (e.g. `ck-K` → doubled-consonants, `wh-W` → silent-letters) would be a
 * dishonest carrot. Built once at module load from the curriculum registry.
 */
const ACTIVE_LESSON_CONCEPT_TAGS: ReadonlySet<string> = new Set(
  LESSON_REGISTRY.filter((l) => l.status === 'active').flatMap((l) => l.gatesConcepts),
);

export interface IntroForecastEntry {
  /** GPC short id, e.g. "sh-SH" — phrase via conceptPhrasing for display. */
  gpcShortId: string;
  /** Pipeline suitability score at snapshot time (higher = nearer to unlock). */
  score: number;
}

export interface IntroForecastSnapshot {
  /** ISO timestamp the forecast was computed. */
  updatedAt: string;
  /** Next intros on the frontier, nearest-to-unlock first. */
  intros: IntroForecastEntry[];
}

/** GPC short id for an intro card, or null if the id isn't an intro card. */
function introShortId(cardId: string): string | null {
  // Sight-word intros (c-sight-intro-*) are left out on purpose: Coming Soon
  // and the nudge email present upcoming letters and sounds
  const parsed =
    parseGpcIntroCardId(cardId) ??
    parseDigraphGpcIntroCardId(cardId) ??
    parseSplitDigraphIntroCardId(cardId);
  return parsed?.gpcShortId ?? null;
}

/**
 * Compute the intro forecast from the live pipeline and persist it to the
 * userdb. Best-effort: a missing pipeline or any failure is swallowed (the
 * cached snapshot just goes stale / stays absent — consumers degrade).
 *
 * Call at session-end, where `getActivePipeline()` is populated.
 */
export async function computeAndCacheIntroForecast(): Promise<IntroForecastSnapshot | null> {
  const pipeline = getActivePipeline();
  if (!pipeline) return null;

  try {
    // The near frontier: not-yet-seen cards, GATED ONES INCLUDED (low
    // threshold), score-ranked so the nearest-to-unlock lead. (No limit: we
    // filter to intros ourselves, which are few; capping pre-filter could cut
    // them off.) See the module header for why "reachable + unseen" is wrong.
    const cards = await pipeline.forecast({
      unseenOnly: true,
      threshold: COMING_SOON_THRESHOLD,
    });

    // Collect ALL eligible intro candidates first (don't break early): the
    // teaching-sequence tiebreak needs the full set before we can rank it.
    const seenShortIds = new Set<string>();
    const candidates: IntroForecastEntry[] = [];
    for (const card of cards) {
      const shortId = introShortId(card.cardId);
      if (!shortId || seenShortIds.has(shortId)) continue;
      // Honesty guard: only intros for concepts an active lesson actually
      // releases. Deferred-lesson intros are gated-but-positive and would
      // otherwise leak in via the low threshold.
      const tags = card.tags ?? [];
      if (!tags.some((t) => ACTIVE_LESSON_CONCEPT_TAGS.has(t))) continue;
      seenShortIds.add(shortId);
      candidates.push({ gpcShortId: shortId, score: card.score });
    }
    candidates.sort(comingSoonRank);

    // Letters the child already knows. We drop candidates whose grapheme is one
    // of these so "Coming Soon" doesn't re-headline a known letter for an
    // alternate pronunciation (e.g. s→/z/ after the child has met `s`). It's a
    // new SOUND, but the letter-grid display is keyed on the letter, so showing
    // it again reads as a repeat. Best-effort: no progression ⇒ no exclusion.
    const knownLetters = new Set(
      ((await getLetterProgression())?.unlockedLetters ?? []).map((l) => l.toLowerCase()),
    );

    // Dedupe by grapheme so alternate pronunciations (o-AA, o-AH, o-AO) don't
    // surface the same letter twice; the highest-ranked representative wins.
    const seenGraphemes = new Set<string>();
    const intros: IntroForecastEntry[] = [];
    for (const c of candidates) {
      const g = graphemeOf(c.gpcShortId);
      if (seenGraphemes.has(g) || knownLetters.has(g.toLowerCase())) continue;
      seenGraphemes.add(g);
      intros.push(c);
      if (intros.length >= MAX_INTROS) break;
    }

    const snapshot: IntroForecastSnapshot = {
      updatedAt: new Date().toISOString(),
      intros,
    };

    const courseDb = await getDataLayer().getUserDB().getCourseInterface(COURSE_ID);
    await courseDb.putStrategyState<IntroForecastSnapshot>(USER_STATE_KEYS.INTRO_FORECAST, snapshot);

    return snapshot;
  } catch (err) {
    console.warn('[introForecast] compute/cache failed:', err);
    return null;
  }
}

/**
 * TEMPORARY diagnostic — call from the dev console to see exactly where the
 * coming-soon computation drops to empty:
 *
 *   const m = await import('/src/services/introForecast.ts');
 *   const d = await m.debugComingSoon();
 *   console.log(d); console.table(d.introCards);
 *
 * Remove once "Coming Soon" is confirmed working.
 */
export async function debugComingSoon(): Promise<unknown> {
  const pipeline = getActivePipeline();
  if (!pipeline) return { error: 'getActivePipeline() returned null — run a session first' };

  const all = await pipeline.forecast({ unseenOnly: true, threshold: COMING_SOON_THRESHOLD });
  const introCards = all.filter((c) => (c.tags ?? []).some((t) => t.startsWith('gpc:intro')));
  const introCardDetail = introCards.map((c) => ({
    cardId: c.cardId,
    score: c.score,
    shortId: introShortId(c.cardId), // null ⇒ card-id parser doesn't recognise it
    concepts: (c.tags ?? []).filter((t) => t.startsWith('concept:')).join(', '),
    passesActiveGuard: (c.tags ?? []).some((t) => ACTIVE_LESSON_CONCEPT_TAGS.has(t)),
  }));

  return {
    activeConceptTags: [...ACTIVE_LESSON_CONCEPT_TAGS],
    forecastTotalCards: all.length,
    introCardsInForecast: introCards.length,
    introCards: introCardDetail,
    // Also runs the real path (writes the snapshot) so we see the final output.
    snapshot: await computeAndCacheIntroForecast(),
  };
}

/** Read the cached forecast for the current (in-session) user, or null. */
export async function getIntroForecast(): Promise<IntroForecastSnapshot | null> {
  try {
    const courseDb = await getDataLayer().getUserDB().getCourseInterface(COURSE_ID);
    return await courseDb.getStrategyState<IntroForecastSnapshot>(USER_STATE_KEYS.INTRO_FORECAST);
  } catch {
    return null;
  }
}
