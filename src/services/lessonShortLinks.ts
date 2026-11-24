/**
 * Short links to a lesson's reader preview, for character-limited posts:
 *
 *   /c/l/bed  → /curriculum/lesson/bed   (lesson id)
 *   /c/l/1a   → /curriculum/lesson/bed   (display number, as shown on /curriculum)
 *
 * Case-insensitive. Only active lessons resolve (deferred ones have no
 * preview); anything else redirects to /curriculum. The route lives in
 * src/router/index.ts and is a redirect, so the address bar ends on the
 * canonical path. A redirect in the browser is invisible to link-preview bots,
 * so each short path also gets a prerendered copy of its lesson's page
 * (lessonShortPaths; scripts/prerender-public.ts). Those copies are lowercase
 * only: /c/l/1A still works in a browser but previews as the site.
 *
 * Durability: ids are stable (progress records key on them). Display numbers
 * are positional: a top-level lesson inserted or reordered ahead of others
 * renumbers them, and a posted number link then opens a different lesson.
 * lessonShortLinks.test.ts pins the current number → id map so that can't
 * happen unnoticed. Prefer id links in anything meant to last.
 */
import { LESSON_CATALOG, lessonNumber } from './lessons';

/**
 * A lesson's short-link paths, lowercase: by id, then by display number. The
 * prerender writes a copy of the lesson's page at each, so link-preview bots
 * (which don't run the router's redirect) still get the lesson's card.
 */
export function lessonShortPaths(lessonId: string): string[] {
  const number = lessonNumber(lessonId);
  return [`/c/l/${lessonId}`, ...(number ? [`/c/l/${number}`] : [])];
}

/** The active lesson id a short-link key names (by id, then by display number), or null. */
export function resolveLessonShortKey(key: string): string | null {
  const k = key.trim().toLowerCase();
  if (!k) return null;
  const byId = LESSON_CATALOG.find((l) => l.id === k);
  if (byId) return byId.id;
  return LESSON_CATALOG.find((l) => lessonNumber(l.id) === k)?.id ?? null;
}
