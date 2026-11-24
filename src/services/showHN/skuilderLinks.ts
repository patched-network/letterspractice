/**
 * Deep links from /showHN annotations into the Skuilder framework source.
 *
 * ## Why every link is pinned
 *
 * `SKUILDER_REF` is a git tag, never `main`. The annotated view is permanent and
 * will be linked from an HN submission; a link to a moving branch rots silently,
 * and a confidently-wrong link is worse than no link at all. Any reasonably
 * recent tag is fine — exact sync with `package.json` isn't required (the ref
 * is not rendered anywhere), but the tag must exist ON GITHUB and each target
 * below must exist at it (`git cat-file -e <tag>:<path>`) when it's bumped.
 *
 * ## Why no `#L` line anchors
 *
 * Line numbers drift between releases even when the symbol doesn't. We link the
 * file and name the symbol in the label instead — rot-proof, and it reads better.
 *
 * ## Framework hooks only — never course policy
 *
 * The observers that drive the interesting behaviour (`conceptBackoff`,
 * `introBackoff`) live in THIS repo, which is closed. The hook
 * they register through (`OutcomeObserver` / `SessionControls`) lives in the OSS
 * framework. Annotations link the hook and say the policy is course-side.
 *
 * This is a feature, not an evasion: it shows an evaluator exactly where the
 * reusable platform ends and the product begins — which is the pitch to
 * would-be Skuilder users, and more honest than implying the whole stack is OSS.
 */

/** Git tag, kept in step with the pinned `@vue-skuilder/db` version. */
export const SKUILDER_REF = 'v0.2.14';

export const SKUILDER_REPO = 'https://github.com/patched-network/vue-skuilder';

const BLOB = `${SKUILDER_REPO}/blob/${SKUILDER_REF}`;

export interface SourceLink {
  /** Symbol name, not a filename — it survives refactors that move lines. */
  label: string;
  url: string;
  /** Shown on hover: what this code does, in one clause. */
  title: string;
}

const src = (path: string): string => `${BLOB}/${path}`;

const DB = 'packages/db/src';

export const SKUILDER_LINKS = {
  /** Where the user/card ELO adjustment is applied and written. */
  eloService: {
    label: 'EloService',
    url: src(`${DB}/study/services/EloService.ts`),
    title: 'Applies the ELO update and writes it to the learner DB',
  },
  /** The pure rating maths behind the delta. */
  eloMath: {
    label: 'adjustCourseScores',
    url: src('packages/common/src/elo.ts'),
    title: 'The pure ELO maths — hyperbolic K-factor, per-tag ratings',
  },
  /** Where the next-review interval is computed and scheduled. */
  srsService: {
    label: 'SrsService',
    url: src(`${DB}/study/services/SrsService.ts`),
    title: 'Computes the next review time and schedules it',
  },
  /** The interval function itself. */
  srsMath: {
    label: 'newInterval',
    url: src(`${DB}/study/SpacedRepetition.ts`),
    title: 'The spaced-repetition interval function',
  },
  /**
   * The framework hook our course-side observers register through. Deliberately
   * NOT a link to our observers (`conceptBackoff` etc.) — that's closed course policy.
   */
  outcomeObserver: {
    label: 'OutcomeObserver',
    url: src(`${DB}/study/SessionController.ts`),
    title: 'The framework hook a course registers to react to each response',
  },
  /** Card selection: generators → filters → rank. */
  pipeline: {
    label: 'Pipeline',
    url: src(`${DB}/core/navigators/Pipeline.ts`),
    title: 'Composes generators and filters into a ranked card supply',
  },
  /** Where backlog pressure is computed. */
  srsGenerator: {
    label: 'SRSNavigator',
    url: src(`${DB}/core/navigators/generators/srs.ts`),
    title: 'Surfaces due reviews and computes backlog pressure',
  },
} as const satisfies Record<string, SourceLink>;

export type SkuilderLinkKey = keyof typeof SKUILDER_LINKS;
