import type { DiagnosticsInterpreters } from '@vue-skuilder/db/diagnostics';

/**
 * LettersPractice's meaning for the framework's generic learner-diagnostics
 * views (`@vue-skuilder/common-ui/admin`). The snapshot paths are the ones
 * `sessionSnapshot.ts` writes.
 */

const SNAPSHOT_METRICS: Array<{ label: string; path: [string, string] }> = [
  { label: 'letters unlocked', path: ['progression', 'unlockedCount'] },
  { label: 'reachable words', path: ['progression', 'reachableWordCount'] },
  { label: 'WST letters', path: ['progression', 'wstProgressCount'] },
  { label: 'ELO', path: ['elo', 'score'] },
  { label: 'reviews due', path: ['reviews', 'dueCount'] },
  { label: 'reviews overdue', path: ['reviews', 'overdueCount'] },
  { label: 'max overdue (days)', path: ['reviews', 'maxOverdueDays'] },
  { label: 'lessons completed', path: ['lessons', 'completedCount'] },
];

export const lpDiagnosticsInterpreters: DiagnosticsInterpreters = {
  isSkillTag: (tag) => tag.startsWith('gpc:'),
  shortTag: (tag) => tag.replace(/^gpc:(exercise|expose|intro):/, ''),
  snapshotMetrics: (snapshot) => {
    const out: Record<string, number> = {};
    for (const { label, path } of SNAPSHOT_METRICS) {
      const outer = snapshot[path[0]];
      const v = outer && typeof outer === 'object' ? (outer as Record<string, unknown>)[path[1]] : undefined;
      if (typeof v === 'number') out[label] = v;
    }
    return out;
  },
  progressMetrics: ['letters unlocked', 'reachable words'],
  // Splits the graded GPC tags; the ELO view also offers each namespace × role group.
  tagBatches: [
    {
      id: 'letter-sounds',
      label: 'letter sounds',
      namespaces: ['gpc'],
      roles: ['exercise'],
      excludePrefixes: ['gpc:exercise:WORD-'],
    },
    { id: 'sight-words', label: 'sight words', prefixes: ['gpc:exercise:WORD-'] },
  ],
  // Security and need are read over letter-sounds only: sight words are learned
  // whole and get their own practice, so they don't count as skills here.
  // Framework thresholds (agent/mastery-gating/a.2.replay.md).
  tagEloOptions: {
    security: { selector: { include: ['gpc:exercise:'], exclude: ['gpc:exercise:WORD-'] } },
    need: { include: ['gpc:exercise:'], exclude: ['gpc:exercise:WORD-'] },
  },
};
