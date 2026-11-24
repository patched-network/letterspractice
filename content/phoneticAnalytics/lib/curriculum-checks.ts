/**
 * Curriculum consistency checks — shared, pure check definitions.
 *
 * These functions answer "does the *deployed* (or about-to-deploy) content
 * still agree with curriculum truth?" — distinct from test-cards.ts, which
 * asserts the same agreement on freshly *generated* content. They are pure:
 * callers normalize their CouchDB / file reads into the shapes below, run the
 * checks, and render the findings.
 *
 * Consumers:
 *  - pipeline: scripts/audit-prod-content.ts (against the live course DB)
 *  - app: admin Curriculum view (P4.3, against the live DB) — via the
 *    src/services/curriculum.ts façade.
 *
 * Design (P0.2 forcing constraint): this lives in lib/ so both the pipeline
 * scripts and the app can import it; it performs no I/O.
 *
 * See: agent/devlog/2026-06-16-curriculum-sot-closeout.md (curriculum-sot docs removed; full log in git history) (P4.1).
 */

import { GPC_CATALOGUE, type GPCEntry } from './catalogue';
import { gpcShortId } from './content-labelling';
import {
  CONCEPT_POLICIES,
  LESSON_REGISTRY,
  CONCEPT_UNASSIGNED,
  effectiveConceptTags,
  isLessonGatingExempt,
  lessonGatedConceptTags,
  type LessonStatus,
  type MasteryThreshold,
  cardGateTags,
} from './curriculum';

// ---------------------------------------------------------------------------
// Expected topology (derived from curriculum — pure, no I/O)
// ---------------------------------------------------------------------------

/**
 * NAVIGATION_STRATEGY ids the pipeline is expected to deploy. Mirror of
 * deploy-content.ts; kept here so audit + admin share one list (check 4).
 */
export const EXPECTED_STRATEGY_IDS = [
  'NAVIGATION_STRATEGY-hierarchy-gpc',
  'NAVIGATION_STRATEGY-hierarchy-concept',
  'NAVIGATION_STRATEGY-hierarchy-ui',
  'NAVIGATION_STRATEGY-interference-gpc',
  'NAVIGATION_STRATEGY-priority-gpc',
  'NAVIGATION_STRATEGY-prescribed-bootstrap',
  'NAVIGATION_STRATEGY-letter-gating',
  'NAVIGATION_STRATEGY-lesson-gate',
  'NAVIGATION_STRATEGY-intro-gate',
] as const;

export interface ExpectedTopology {
  /** Concept tags subject to lesson gating (registry concepts + unassigned). */
  gatedConceptTags: ReadonlySet<string>;
  /** concept tag → owning lesson (id + status). */
  conceptToLesson: ReadonlyMap<string, { id: string; status: LessonStatus }>;
  /** Expected navigation-strategy doc ids. */
  expectedStrategyIds: readonly string[];
  /** gpc short-id → that GPC's effective (curriculum) concept tags. */
  effectiveTagsByShortId: ReadonlyMap<string, readonly string[]>;
}

/**
 * Build the expected topology from the curriculum SoT. Pure.
 */
export function buildExpectedTopology(
  catalogue: readonly GPCEntry[] = GPC_CATALOGUE,
): ExpectedTopology {
  const conceptToLesson = new Map<string, { id: string; status: LessonStatus }>();
  for (const lesson of LESSON_REGISTRY) {
    for (const tag of lesson.gatesConcepts) {
      conceptToLesson.set(tag, { id: lesson.id, status: lesson.status });
    }
  }

  const effectiveTagsByShortId = new Map<string, readonly string[]>();
  for (const entry of catalogue) {
    effectiveTagsByShortId.set(gpcShortId(entry.id), effectiveConceptTags(entry));
  }

  return {
    gatedConceptTags: lessonGatedConceptTags(),
    conceptToLesson,
    expectedStrategyIds: EXPECTED_STRATEGY_IDS,
    effectiveTagsByShortId,
  };
}

// ---------------------------------------------------------------------------
// Observed content (what callers normalize their DB / file reads into)
// ---------------------------------------------------------------------------

/**
 * A deployed (or generated) card, normalized. `tags` is required; the rest is
 * supplied when available — WordSelection traceability (check 6) needs
 * `questionType` + `words` to honour the deliberate distractor-gate allowance,
 * and degrades to "skipped" when absent.
 */
export interface CardRecord {
  id: string;
  tags: ReadonlySet<string>;
  questionType?: string;
  /** Target + distractor words, for WordSelection trace expansion. */
  words?: readonly string[];
}

export interface ObservedContent {
  /** All cards under audit (deployed or generated). */
  cards: readonly CardRecord[];
  /** Deployed `concept:*` TAG doc names (may include zero-card tags). */
  conceptTagNames: readonly string[];
  /** Deployed navigation strategies. */
  strategies: readonly { id: string; implementingClass?: string }[];
  /** word → its GPC ids, for WordSelection trace expansion (check 6). */
  wordToGpcs?: ReadonlyMap<string, readonly string[]>;
  /** Optional expected implementingClass per strategy id (check 4). */
  expectedStrategyClasses?: ReadonlyMap<string, string>;
  /** Staleness inputs (check 5). */
  meta?: { latestUploadedAt?: string; appBuildAt?: string };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  check: string;
  severity: Severity;
  message: string;
  /** Sample offending ids / details (callers may truncate when rendering). */
  items?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Invert `TAG-*` docs into a card id → tag set map. `name` is the tag without
 * the `TAG-` prefix (matches enumerate-blast-radius / adminContentService).
 */
export function invertTagDocs(
  tagDocs: readonly { name: string; taggedCards?: readonly string[] }[],
): Map<string, Set<string>> {
  const byCard = new Map<string, Set<string>>();
  for (const tag of tagDocs) {
    for (const cardId of tag.taggedCards ?? []) {
      let set = byCard.get(cardId);
      if (!set) byCard.set(cardId, (set = new Set()));
      set.add(tag.name);
    }
  }
  return byCard;
}

const thresholdKey = (ts: readonly MasteryThreshold[] | undefined): string =>
  JSON.stringify(
    (ts ?? [])
      .map((t) => [t.tag, t.minCount ?? null, t.minElo ?? null])
      .sort(),
  );

// ---------------------------------------------------------------------------
// Checks (TODO P4.1 (1)–(6))
// ---------------------------------------------------------------------------

/** (1) Every deployed `concept:*` TAG maps to a curriculum lesson. */
export function checkConceptTagsMapped(
  expected: ExpectedTopology,
  observed: ObservedContent,
): Finding[] {
  const orphans = observed.conceptTagNames
    .filter((t) => t.startsWith('concept:'))
    .filter(
      (t) =>
        t !== CONCEPT_UNASSIGNED &&
        !isLessonGatingExempt(t) &&
        !expected.conceptToLesson.has(t),
    )
    .sort();
  if (orphans.length === 0) {
    return [
      {
        check: 'concept-tags-mapped',
        severity: 'info',
        message: 'All deployed concept tags map to a curriculum lesson.',
      },
    ];
  }
  return [
    {
      check: 'concept-tags-mapped',
      severity: 'error',
      message: `${orphans.length} deployed concept tag(s) map to no curriculum lesson (and are not unassigned / exempt).`,
      items: orphans,
    },
  ];
}

/** (2) Every gated concept tag has >0 deployed cards. */
export function checkGatedTagsHaveCards(
  expected: ExpectedTopology,
  observed: ObservedContent,
): Finding[] {
  const tagsWithCards = new Set<string>();
  for (const card of observed.cards) {
    for (const tag of card.tags) {
      if (tag.startsWith('concept:')) tagsWithCards.add(tag);
    }
  }
  const empty = [...expected.gatedConceptTags]
    .filter((t) => !tagsWithCards.has(t))
    .sort();
  if (empty.length === 0) {
    return [
      {
        check: 'gated-tags-have-cards',
        severity: 'info',
        message: 'Every gated concept tag has at least one deployed card.',
      },
    ];
  }
  return [
    {
      check: 'gated-tags-have-cards',
      severity: 'warn',
      message: `${empty.length} gated concept tag(s) have zero deployed cards (lesson would release nothing).`,
      items: empty,
    },
  ];
}

/** (3) `mustMatch` concepts: lessonAvailability mirrors pipelinePrereqs. */
export function checkMustMatch(): Finding[] {
  const violations: string[] = [];
  for (const [concept, policy] of Object.entries(CONCEPT_POLICIES)) {
    if (!policy.mustMatch) continue;
    if (
      thresholdKey(policy.pipelinePrereqs) !==
      thresholdKey(policy.lessonAvailability?.masteryPrereqs)
    ) {
      violations.push(concept);
    }
  }
  if (violations.length === 0) {
    return [
      {
        check: 'mustmatch-thresholds',
        severity: 'info',
        message: 'All mustMatch concepts agree (pipeline ↔ lesson availability).',
      },
    ];
  }
  return [
    {
      check: 'mustmatch-thresholds',
      severity: 'error',
      message: `${violations.length} mustMatch concept(s) disagree between pipelinePrereqs and lessonAvailability.masteryPrereqs.`,
      items: violations,
    },
  ];
}

/** (4) Expected navigation-strategy docs present (+ optional class match). */
export function checkStrategies(
  expected: ExpectedTopology,
  observed: ObservedContent,
): Finding[] {
  const present = new Set(observed.strategies.map((s) => s.id));
  const missing = expected.expectedStrategyIds.filter((id) => !present.has(id));
  const extra = [...present]
    .filter((id) => !expected.expectedStrategyIds.includes(id as never))
    .sort();

  const findings: Finding[] = [];
  if (missing.length) {
    findings.push({
      check: 'strategies-present',
      severity: 'error',
      message: `${missing.length} expected navigation strategy doc(s) missing.`,
      items: missing,
    });
  }
  if (extra.length) {
    findings.push({
      check: 'strategies-present',
      severity: 'warn',
      message: `${extra.length} unexpected navigation strategy doc(s) present.`,
      items: extra,
    });
  }
  if (observed.expectedStrategyClasses) {
    const mismatched: string[] = [];
    for (const s of observed.strategies) {
      const want = observed.expectedStrategyClasses.get(s.id);
      if (want && s.implementingClass && s.implementingClass !== want) {
        mismatched.push(`${s.id}: ${s.implementingClass} ≠ ${want}`);
      }
    }
    if (mismatched.length) {
      findings.push({
        check: 'strategies-class',
        severity: 'error',
        message: `${mismatched.length} strategy implementingClass mismatch(es).`,
        items: mismatched,
      });
    }
  }
  if (findings.length === 0) {
    findings.push({
      check: 'strategies-present',
      severity: 'info',
      message: 'All expected navigation strategies present.',
    });
  }
  return findings;
}

/** (5) Deployed content vs app build staleness. */
export function checkStaleness(observed: ObservedContent): Finding[] {
  const m = observed.meta;
  if (!m?.latestUploadedAt || !m?.appBuildAt) {
    return [
      {
        check: 'staleness',
        severity: 'info',
        message: 'Staleness check skipped (need both latestUploadedAt and appBuildAt).',
      },
    ];
  }
  const uploaded = Date.parse(m.latestUploadedAt);
  const built = Date.parse(m.appBuildAt);
  if (Number.isFinite(uploaded) && Number.isFinite(built) && uploaded > built) {
    return [
      {
        check: 'staleness',
        severity: 'warn',
        message: `Content (uploaded ${m.latestUploadedAt}) is newer than the app build (${m.appBuildAt}) — app may not gate the latest content correctly.`,
      },
    ];
  }
  return [
    {
      check: 'staleness',
      severity: 'info',
      message: 'App build is at least as new as the latest content upload.',
    },
  ];
}

/**
 * (6) Cards carrying a gated concept tag not traceable to an exercised /
 * introduced GPC's effective tags. Mirrors test-cards' `concept-tags-traceable`
 * (WordSelection additionally traces via every GPC of the card's words).
 * Quantifies the P2.1 over-application; should trend to zero. WordSelection
 * cards lacking `words` data are skipped (reported separately) to avoid false
 * positives from the deliberate distractor-gate allowance.
 */
export function checkConceptTraceability(
  expected: ExpectedTopology,
  observed: ObservedContent,
): Finding[] {
  const allowFor = (allowed: Set<string>, gpcShort: string) => {
    const tags = expected.effectiveTagsByShortId.get(gpcShort);
    if (!tags) return; // synthetic (e-silent-split) or unknown
    for (const t of tags) allowed.add(t);
  };

  const untraceable: string[] = [];
  let skippedWs = 0;
  for (const card of observed.cards) {
    // A lesson's gate stamp traces to the curriculum naming the card
    // (LESSON_GATED_CARDS), not to a GPC
    const allowed = new Set<string>(cardGateTags(card.id));
    for (const tag of card.tags) {
      const m = tag.match(/^gpc:(?:exercise|intro):(.+)$/);
      if (m) allowFor(allowed, m[1]);
      // A card exposing a sight word traces to it too: the word's concept
      // (concept:match:whole_word) is its gate stamp, holding a fair-letter
      // blank (`_as` in "was") back until the sight-words lesson. Mirrors
      // test-cards' MissingLetters allowance.
      const sight = tag.match(/^gpc:expose:(WORD-.+)$/);
      if (sight) allowFor(allowed, sight[1]);
    }

    const isWordSelection =
      card.questionType === 'WordSelection' || card.id.startsWith('c-ws-');
    if (isWordSelection) {
      if (!card.words || !observed.wordToGpcs) {
        skippedWs++;
        continue;
      }
      for (const w of card.words) {
        for (const g of observed.wordToGpcs.get(w) ?? []) {
          allowFor(allowed, gpcShortId(g));
        }
      }
    }

    for (const tag of card.tags) {
      if (!tag.startsWith('concept:')) continue;
      if (isLessonGatingExempt(tag)) continue;
      if (allowed.has(tag)) continue;
      untraceable.push(`${card.id}: ${tag}`);
    }
  }

  const findings: Finding[] = [];
  findings.push(
    untraceable.length === 0
      ? {
          check: 'concept-traceable',
          severity: 'info',
          message: 'All deployed gated concept tags trace to an exercised/introduced GPC.',
        }
      : {
          check: 'concept-traceable',
          severity: 'error',
          message: `${untraceable.length} deployed concept tag(s) do not trace to an exercised/introduced GPC (over-applied).`,
          items: untraceable,
        },
  );
  if (skippedWs > 0) {
    findings.push({
      check: 'concept-traceable',
      severity: 'info',
      message: `${skippedWs} WordSelection card(s) skipped (no word data supplied for distractor-gate trace).`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/**
 * Run all curriculum consistency checks. Returns findings across all severities
 * (callers filter / render). Order matches TODO P4.1 (1)–(6).
 */
export function runCurriculumChecks(
  expected: ExpectedTopology,
  observed: ObservedContent,
): Finding[] {
  return [
    ...checkConceptTagsMapped(expected, observed),
    ...checkGatedTagsHaveCards(expected, observed),
    ...checkMustMatch(),
    ...checkStrategies(expected, observed),
    ...checkStaleness(observed),
    ...checkConceptTraceability(expected, observed),
  ];
}
