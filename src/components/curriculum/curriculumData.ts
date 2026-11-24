/**
 * Data for the public /curriculum page: the live lessons (from the catalog)
 * joined to simulated learners' timelines, one profile per age
 * (src/content/curriculumSim.generated.json — regenerate with
 * `npx tsx scripts/simulate-curriculum.ts` after a content regen).
 *
 * Only live lessons appear. Facts are the ones the simulated learners actually
 * meet, so dormant content (an intro no group prescribes) stays off the page.
 *
 * Keep this free of the phonetic index (services/phonetics, ~180 KB): the
 * router's page metadata (content/pages.ts) imports it, so whatever it
 * imports is in every first load. What needs the index lives beside it
 * (keysWhenReady.ts).
 */

import sim from '../../content/curriculumSim.generated.json';
import { LESSON_CATALOG, lessonNumber, lessonPaletteIndex } from '../../services/lessons';
import { CATEGORICAL } from '../../theme/categoricalPalette';

/** A fact (GPC) as the page shows it */
export interface FactInfo {
  /** Short GPC id, e.g. "sh-SH", "WORD-was" */
  gpc: string;
  grapheme: string;
  /** ARPAbet, space-separated for compounds; absent for whole words */
  phoneme?: string;
  examples: string[];
  lesson: string;
  /** intro: met through its intro card; released: arrives with its lesson (no intro card) */
  kind: 'intro' | 'released';
}

/** A fact on one age's timeline */
export interface SimFact extends FactInfo {
  /** Median session over the simulated runs */
  session: number;
  order: number;
}

export interface CurriculumLesson {
  id: string;
  /** Display number: "1", "2", …; a sub-lesson "1a" (services/lessons lessonNumber) */
  number: string;
  /** The parent lesson's id, for a sub-lesson (LessonDefinition.subOf) */
  subOf: string | null;
  title: string;
  description: string;
  /** Median session the lesson opens; null if the simulation never reached it */
  session: number | null;
  color: string;
  facts: SimFact[];
}

interface AgeProfile {
  age: number;
  /** Session minutes / cards at the first session and once ramped (session 21) */
  sessionMinutes: number[];
  sessionCards: number[];
  lessons: { id: string; session: number | null }[];
  facts: { gpc: string; session: number; order: number }[];
  /** Words they could sound out by the end of each session (index 0 = session 1) */
  readable?: number[];
}

/**
 * Lesson colours, assigned by catalog position (fixed order, never cycled):
 * the site's categorical palette, base tier (src/theme/categoricalPalette.ts).
 * The first five are validated on the page surface (#fffef7) for adjacent
 * pairs, which is how they meet in the strip. Three sit below 3:1 on the
 * surface, so every mark carries a text label. A sixth lesson takes slot 6 —
 * revalidate then.
 */
export const LESSON_COLORS: readonly string[] = CATEGORICAL;

export const simParams = sim.params;
const profiles = sim.profiles as AgeProfile[];
const factInfo = new Map((sim.facts as FactInfo[]).map((f) => [f.gpc, f]));

export const AGES = profiles.map((p) => p.age);

/** A fact's display data, if the sim met it */
export function findFact(gpc: string): FactInfo | undefined {
  return factInfo.get(gpc);
}

/** A lesson's colour (by position among the top-level lessons; a sub-lesson takes its parent's), if it's live */
export function lessonColor(lessonId: string): string | undefined {
  const i = lessonPaletteIndex(lessonId);
  return i < 0 ? undefined : LESSON_COLORS[i % LESSON_COLORS.length];
}
export const DEFAULT_AGE = 3;

export function profileFor(age: number): AgeProfile {
  return profiles.find((p) => p.age === age) ?? profiles[0];
}

/** One age's facts, in arrival order */
export function factsForAge(age: number): SimFact[] {
  return profileFor(age).facts.flatMap((f) => {
    const info = factInfo.get(f.gpc);
    return info ? [{ ...info, session: f.session, order: f.order }] : [];
  });
}

/**
 * The keys a fact unlocks, as the app's keycaps work: an introduced fact's
 * letters. Facts that ride in with a lesson, and whole words, unlock none.
 */
export function keysOf(f: SimFact): string[] {
  return f.kind === 'intro' && !f.gpc.startsWith('WORD-') ? [...f.grapheme.replace(/_/g, '')] : [];
}

export interface KeyArrival {
  key: string;
  /** Median session of the fact that brought it */
  session: number;
}

/** Keyboard keys in the order a learner of this age gets them */
export function keyArrivals(age: number): KeyArrival[] {
  const out: KeyArrival[] = [];
  for (const f of factsForAge(age)) {
    for (const key of keysOf(f)) if (!out.some((a) => a.key === key)) out.push({ key, session: f.session });
  }
  return out;
}

/**
 * Words a learner of this age could sound out by the end of a session: every
 * GPC the word needs has been met (the sim's count, over the full
 * reachable-words table). Null if the sim JSON predates the count.
 */
export function readableAt(age: number, session: number): number | null {
  const counts = profileFor(age).readable;
  if (!counts?.length) return null;
  return counts[Math.min(Math.max(1, session), counts.length) - 1];
}

/** The session a learner of this age opens a lesson; null if never reached */
export function lessonSession(age: number, lessonId: string): number | null {
  return profileFor(age).lessons.find((l) => l.id === lessonId)?.session ?? null;
}

/** A top-level lesson with its sub-lessons (1 with 1a), as /curriculum groups them */
export interface CurriculumLessonGroup {
  lesson: CurriculumLesson;
  subs: CurriculumLesson[];
}

/**
 * Lessons grouped under their parents, in catalog order. A sub-lesson whose
 * parent isn't in the list stands as its own group rather than vanishing.
 */
export function groupLessons(lessons: CurriculumLesson[]): CurriculumLessonGroup[] {
  const ids = new Set(lessons.map((l) => l.id));
  return lessons
    .filter((l) => !l.subOf || !ids.has(l.subOf))
    .map((lesson) => ({ lesson, subs: lessons.filter((s) => s.subOf === lesson.id) }));
}

export function lessonsForAge(age: number): CurriculumLesson[] {
  const facts = factsForAge(age);
  return LESSON_CATALOG.map((lesson, i) => ({
    id: lesson.id,
    number: lessonNumber(lesson.id) ?? String(i + 1),
    subOf: lesson.subOf ?? null,
    title: lesson.title,
    description: lesson.description,
    session: lessonSession(age, lesson.id),
    color: lessonColor(lesson.id) ?? LESSON_COLORS[0],
    facts: facts.filter((f) => f.lesson === lesson.id),
  }));
}
