/**
 * Fridge sheet — the printable letter-sound tracker (public/print/).
 *
 * The sheet is a static PDF. The family prints it once and colours in a
 * keycap each time the app introduces that letter, so the paper carries the
 * app's "what does this child know" state into the kitchen, where any adult
 * or sibling can act on it. This module decides what, if anything, the
 * session-end screen should say about it. Pure; persistence lives in
 * userState.ts.
 */

import type { FridgeSheetState } from './userState.types';

/**
 * Served from `public/print/`. Both are exports of the same canvas (README):
 * the default has the LetterPeople faces on the keycaps, the plain one is
 * bodies only for families who find the faces noisy. Letter landscape; A4
 * printers fit-to-page at ~97% and lose half an inch each side.
 */
export const FRIDGE_SHEET_PDF_URL = '/print/fridge-sheet.pdf';
export const FRIDGE_SHEET_PLAIN_PDF_URL = '/print/fridge-sheet-plain.pdf';

/** Don't suggest printing until the sheet has something to colour. */
export const PRINT_PROMPT_MIN_LETTERS = 4;
/** After a dismissal, stay quiet for this long. */
export const PRINT_PROMPT_SNOOZE_DAYS = 7;
/** After this many dismissals, never prompt again (the /progress link remains). */
export const PRINT_PROMPT_MAX_DISMISSALS = 2;

export type UserTier = 'funnel' | 'trial' | 'paid' | 'unknown';

export interface FridgeSheetNudgeInput {
  state: FridgeSheetState | null;
  userTier: UserTier;
  /** `unlockedLetters.length` from letter progression. */
  unlockedCount: number;
  /** Graphemes introduced this session (session summary `newTopics`). */
  newGraphemes: string[];
  now?: Date;
}

export interface ColourTarget {
  grapheme: string;
  /** Single letter → keycap; `a_e` → split-team box; other multi-char → letter-team box. */
  kind: 'key' | 'split' | 'team';
}

export type FridgeSheetNudge =
  | { kind: 'none' }
  | { kind: 'print' }
  | { kind: 'colour'; targets: ColourTarget[] };

export function toColourTarget(grapheme: string): ColourTarget {
  const g = grapheme.toLowerCase();
  if (g.includes('_')) return { grapheme: g, kind: 'split' };
  if (g.length === 1) return { grapheme: g, kind: 'key' };
  return { grapheme: g, kind: 'team' };
}

export function decideFridgeSheetNudge(input: FridgeSheetNudgeInput): FridgeSheetNudge {
  const { state, userTier, unlockedCount, newGraphemes } = input;
  const now = input.now ?? new Date();

  // Guests get the account CTA; the sheet is for families who are staying.
  if (userTier === 'funnel') return { kind: 'none' };

  if (state?.openedAt) {
    const seen = new Set<string>();
    const targets: ColourTarget[] = [];
    for (const g of newGraphemes) {
      const t = toColourTarget(g);
      // Sheet 1 is keycaps only; the letter-team boxes were cut from it.
      // Asking for "the ‹sh› box" would send the
      // family looking for something that isn't on the paper. Drop this
      // filter when sheet 2 ships.
      if (t.kind !== 'key') continue;
      if (seen.has(t.grapheme)) continue;
      seen.add(t.grapheme);
      targets.push(t);
    }
    return targets.length > 0 ? { kind: 'colour', targets } : { kind: 'none' };
  }

  if (unlockedCount < PRINT_PROMPT_MIN_LETTERS) return { kind: 'none' };

  const dismissals = state?.dismissCount ?? 0;
  if (dismissals >= PRINT_PROMPT_MAX_DISMISSALS) return { kind: 'none' };
  if (state?.dismissedAt) {
    const since = now.getTime() - new Date(state.dismissedAt).getTime();
    if (since < PRINT_PROMPT_SNOOZE_DAYS * 24 * 60 * 60 * 1000) return { kind: 'none' };
  }

  return { kind: 'print' };
}

/** "m, s and the ‹sh› box" — the colour prompt's object phrase. */
export function describeColourTargets(targets: ColourTarget[]): string {
  const keys = targets.filter((t) => t.kind === 'key').map((t) => t.grapheme);
  const boxes = targets.filter((t) => t.kind !== 'key').map((t) => `the ‹${t.grapheme}› box`);
  const parts: string[] = [];
  if (keys.length > 0) parts.push(keys.join(', '));
  parts.push(...boxes);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Ask the business backend to email the sheet to the signed-in account's
 * address (link + PDF attached). Authenticated by the couch session cookie;
 * the server ignores any address the client might send. Resolves to the
 * address it went to; throws with a short user-facing message otherwise.
 */
export async function requestFridgeSheetEmail(
  variant: 'faces' | 'plain' = 'faces',
): Promise<{ email: string }> {
  const res = await fetch('/backend/mailer/fridge-sheet', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ variant }),
  });
  const data = (await res.json().catch(() => ({}))) as { email?: string; error?: string };
  if (res.status === 429 && data.email) return { email: data.email };
  if (res.status === 401) throw new Error('Sign in to email the sheet to yourself.');
  if (res.status === 400) throw new Error('No email address on this account yet.');
  if (!res.ok || !data.email) throw new Error(data.error || 'Could not send the email. Please try again.');
  return { email: data.email };
}
