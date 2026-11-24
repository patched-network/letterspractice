/**
 * When the hub's account-recovery note ("we emailed a link to …") shows.
 *
 * Signup sends the verification email, so for the first days the note would
 * only ask for what's already in the inbox: it waits GRACE_DAYS after
 * registration. Hiding it lasts SNOOZE_DAYS on this device. Verification is
 * for account recovery only; it never gates study.
 */

export const GRACE_DAYS = 3;
export const SNOOZE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const snoozeKey = (username: string) => `lp.emailNote.hiddenAt.${username}`;

/** Earliest registration date across the user's entitlements, or null. */
export function registeredAt(entitlements: Record<string, { registrationDate?: string }> | undefined): Date | null {
  const times = Object.values(entitlements ?? {})
    .map((e) => (e.registrationDate ? Date.parse(e.registrationDate) : NaN))
    .filter((t) => Number.isFinite(t));
  return times.length ? new Date(Math.min(...times)) : null;
}

/** Past the grace period and not hidden recently. Unknown registration: no grace. */
export function emailNoteDue(registered: Date | null, hiddenAt: Date | null, now: Date = new Date()): boolean {
  if (registered && now.getTime() - registered.getTime() < GRACE_DAYS * DAY_MS) return false;
  if (hiddenAt && now.getTime() - hiddenAt.getTime() < SNOOZE_DAYS * DAY_MS) return false;
  return true;
}

export function readHiddenAt(username: string): Date | null {
  try {
    const raw = localStorage.getItem(snoozeKey(username));
    const t = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(t) ? new Date(t) : null;
  } catch {
    return null;
  }
}

export function hideEmailNote(username: string, now: Date = new Date()): void {
  try {
    localStorage.setItem(snoozeKey(username), now.toISOString());
  } catch {
    // Storage blocked: the note just comes back next visit.
  }
}
