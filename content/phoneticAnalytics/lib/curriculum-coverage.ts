/**
 * Curriculum coverage — build-time state-of-the-world report.
 *
 * Emitted next to generated-cards.json by gen:cards (see generate-cards.ts).
 * For every GPC it records its curriculum state (active-lesson /
 * deferred-lesson / unassigned / analysis-only), effective concept tag(s),
 * releasing lesson, card counts, and audio coverage — so a re-tag PR shows its
 * blast radius directly in the committed diff, and parked/unreleased content is
 * first-class visible rather than silently absent.
 *
 * Pure: the builder takes the catalogue + generated cards + per-GPC audio
 * tallies and returns rows; the formatter renders deterministic markdown (no
 * timestamps — the diff is the signal).
 *
 * See: agent/devlog/2026-06-16-curriculum-sot-closeout.md (curriculum-sot docs removed; full log in git history) (P4.2).
 */

import { GPC_CATALOGUE, type GPCEntry } from './catalogue';
import { gpcShortId } from './content-labelling';
import {
  UNASSIGNED,
  assignmentFor,
  effectiveConceptTags,
  getLessonEntry,
  type LessonStatus,
} from './curriculum';

export type CoverageState =
  | 'active-lesson'
  | 'deferred-lesson'
  | 'planned'
  | 'unassigned'
  | 'analysis-only';

export interface AudioTally {
  withAudio: number;
  total: number;
}

export interface CoverageRow {
  gpcId: string;
  grapheme: string;
  phoneme: string;
  category: string;
  state: CoverageState;
  conceptTags: string[];
  /** Lesson id, `unassigned`, or `—` (analysis-only). */
  unlockedBy: string;
  lessonStatus?: LessonStatus;
  postLessonFact: boolean;
  exerciseCards: number;
  introCards: number;
  audio?: AudioTally;
  examples?: string[];
}

export interface BuildCoverageInput {
  /** GPC universe (default: full catalogue). */
  catalogue?: readonly GPCEntry[];
  /** Generated cards — only their `tags` are read (for gpc:* card tallies). */
  cards: readonly { tags: readonly string[] }[];
  /** Per-GPC audio tally (GPC id → {withAudio,total}); optional. */
  audioByGpc?: ReadonlyMap<string, AudioTally>;
}

const STATE_ORDER: CoverageState[] = [
  'active-lesson',
  'deferred-lesson',
  'unassigned',
  'planned',
  'analysis-only',
];

const STATE_LABEL: Record<CoverageState, string> = {
  'active-lesson': 'Active lessons',
  'deferred-lesson': 'Deferred lessons',
  unassigned: 'Unassigned (parked)',
  planned: 'Planned lessons',
  'analysis-only': 'Analysis-only (not carded)',
};

/**
 * Tally gpc:exercise:* and gpc:intro:* card tags by GPC short-id.
 */
function tallyCardsByGpc(cards: readonly { tags: readonly string[] }[]): {
  exercise: Map<string, number>;
  intro: Map<string, number>;
} {
  const exercise = new Map<string, number>();
  const intro = new Map<string, number>();
  for (const card of cards) {
    for (const tag of card.tags) {
      const m = tag.match(/^gpc:(exercise|intro):(.+)$/);
      if (!m) continue;
      const map = m[1] === 'exercise' ? exercise : intro;
      map.set(m[2], (map.get(m[2]) ?? 0) + 1);
    }
  }
  return { exercise, intro };
}

/**
 * Build one coverage row per GPC in the catalogue. Pure.
 */
export function buildCoverageRows(input: BuildCoverageInput): CoverageRow[] {
  const catalogue = input.catalogue ?? GPC_CATALOGUE;
  const { exercise, intro } = tallyCardsByGpc(input.cards);

  const rows: CoverageRow[] = [];
  for (const entry of catalogue) {
    const short = gpcShortId(entry.id);
    const a = assignmentFor(entry);

    let state: CoverageState;
    let unlockedBy: string;
    let lessonStatus: LessonStatus | undefined;
    if (!a) {
      state = 'analysis-only';
      unlockedBy = '—';
    } else if (a.unlockedBy === UNASSIGNED) {
      state = 'unassigned';
      unlockedBy = UNASSIGNED;
    } else {
      const lesson = getLessonEntry(a.unlockedBy);
      lessonStatus = lesson?.status;
      unlockedBy = a.unlockedBy;
      state =
        lessonStatus === 'active'
          ? 'active-lesson'
          : lessonStatus === 'deferred'
            ? 'deferred-lesson'
            : 'planned';
    }

    rows.push({
      gpcId: entry.id,
      grapheme: entry.grapheme,
      phoneme: entry.phoneme || '∅',
      category: entry.category,
      state,
      conceptTags: a?.conceptTags ?? effectiveConceptTags(entry),
      unlockedBy,
      lessonStatus,
      postLessonFact: a?.postLessonFact === true,
      exerciseCards: exercise.get(short) ?? 0,
      introCards: intro.get(short) ?? 0,
      audio: input.audioByGpc?.get(entry.id),
      examples: a?.examples,
    });
  }

  // Deterministic order: state, then lesson, then gpc id.
  rows.sort((x, y) => {
    const s = STATE_ORDER.indexOf(x.state) - STATE_ORDER.indexOf(y.state);
    if (s !== 0) return s;
    const l = x.unlockedBy.localeCompare(y.unlockedBy);
    if (l !== 0) return l;
    return x.gpcId.localeCompare(y.gpcId);
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Markdown formatter (deterministic — no timestamps)
// ---------------------------------------------------------------------------

const fmtAudio = (a: AudioTally | undefined): string =>
  a && a.total > 0 ? `${a.withAudio}/${a.total}` : '—';

function rowTable(rows: CoverageRow[]): string[] {
  const out: string[] = [];
  out.push('| GPC | g→p | concept tag(s) | lesson (status) | ex | intro | audio |');
  out.push('|---|---|---|---|--:|--:|--:|');
  for (const r of rows) {
    const lesson =
      r.state === 'analysis-only'
        ? '—'
        : r.unlockedBy === 'unassigned'
          ? 'unassigned'
          : `${r.unlockedBy}${r.lessonStatus ? ` (${r.lessonStatus})` : ''}`;
    const fact = r.postLessonFact ? ' ·fact' : '';
    out.push(
      `| \`${r.gpcId}\`${fact} | ${r.grapheme}→${r.phoneme} | ${r.conceptTags.join(', ')} | ${lesson} | ${r.exerciseCards} | ${r.introCards} | ${fmtAudio(r.audio)} |`,
    );
  }
  return out;
}

/**
 * Render the coverage rows as deterministic markdown.
 */
export function formatCoverageMarkdown(rows: CoverageRow[]): string {
  const byState = new Map<CoverageState, CoverageRow[]>();
  for (const r of rows) {
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state)!.push(r);
  }

  const out: string[] = [];
  out.push('# Curriculum Coverage');
  out.push('');
  out.push(
    '> Generated by `gen:cards` (lib/curriculum-coverage.ts) — do not edit by hand.',
  );
  out.push(
    '> Versioned & deterministic: a re-tag PR shows its blast radius in this diff.',
  );
  out.push(
    '> State derives from `lib/curriculum.ts` (`assignmentFor`); card counts from',
  );
  out.push('> `generated-cards.json`. `·fact` = post-lesson fact (D5).');
  out.push('');

  // ---- Summary ----
  out.push('## Summary');
  out.push('');
  out.push('| State | GPCs | exercise cards | intro cards |');
  out.push('|---|--:|--:|--:|');
  for (const state of STATE_ORDER) {
    const group = byState.get(state) ?? [];
    if (group.length === 0) continue;
    const ex = group.reduce((s, r) => s + r.exerciseCards, 0);
    const intro = group.reduce((s, r) => s + r.introCards, 0);
    out.push(`| ${STATE_LABEL[state]} | ${group.length} | ${ex} | ${intro} |`);
  }
  out.push(`| **Total** | **${rows.length}** | — | — |`);
  out.push('');

  // ---- Parked / unreleased callout ----
  const parked = [
    ...(byState.get('unassigned') ?? []),
    ...(byState.get('deferred-lesson') ?? []),
  ];
  if (parked.length) {
    out.push('## Parked / unreleased');
    out.push('');
    out.push(
      'Suppressed by default-deny until their lesson ships (deferred) or is',
    );
    out.push(
      'authored (unassigned). Words exercising these leave the spelling rotation',
    );
    out.push('until released — pedagogically correct (D3/D4/D7).');
    out.push('');
    out.push('| GPC | state | lesson | examples |');
    out.push('|---|---|---|---|');
    for (const r of parked) {
      const lesson = r.unlockedBy === 'unassigned' ? 'unassigned' : r.unlockedBy;
      out.push(
        `| \`${r.gpcId}\` | ${r.state} | ${lesson} | ${(r.examples ?? []).join(', ') || '—'} |`,
      );
    }
    out.push('');
  }

  // ---- Per-state tables ----
  for (const state of STATE_ORDER) {
    const group = byState.get(state) ?? [];
    if (group.length === 0) continue;
    out.push(`## ${STATE_LABEL[state]}`);
    out.push('');
    if (state === 'analysis-only') {
      // Compact: not carded, no curriculum role — list ids only.
      out.push(group.map((r) => `\`${r.gpcId}\``).join(', '));
      out.push('');
      continue;
    }
    out.push(...rowTable(group));
    out.push('');
  }

  return out.join('\n');
}
