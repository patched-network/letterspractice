/**
 * Dev-only date offset utility.
 * Monkey-patches globalThis.Date so that Date.now() and new Date() reflect
 * a shifted time — useful for playtesting SRS scheduling without waiting real days.
 *
 * Only active on localhost. Safe to import anywhere; all functions no-op in prod.
 */

import { ref } from 'vue';
import { getDataLayer } from '@vue-skuilder/db';

const STORAGE_KEY_PREFIX = '__dev_date_offset_days';

function currentUsername(): string {
  try {
    return getDataLayer().getUserDB().getUsername();
  } catch {
    return 'unknown';
  }
}

function storageKey(): string {
  return `${STORAGE_KEY_PREFIX}__${currentUsername()}`;
}

export const devDayOffset = ref(0);

export function isDevMode(): boolean {
  return window.location.hostname === 'localhost';
}

export function applyDevDateOffset(days: number): void {
  if (!isDevMode() || days === 0) return;

  const ms = days * 86_400_000;
  const Orig: typeof Date = (globalThis as any).__origDate ?? globalThis.Date;
  (globalThis as any).__origDate = Orig;

  class DevDate extends Orig {
    constructor();
    constructor(value: number | string | Date);
    constructor(
      year: number, month: number, date?: number,
      hours?: number, minutes?: number, seconds?: number, ms?: number,
    );
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(Orig.now() + ms);
      } else {
        super(...(args as []));
      }
    }
    static now(): number { return Orig.now() + ms; }
    static parse(s: string): number { return Orig.parse(s); }
    static UTC(...args: Parameters<typeof Date.UTC>): number { return Orig.UTC(...args); }
  }

  (globalThis as any).Date = DevDate;
}

/** Call once on app mount — restores any persisted offset from a previous session. */
export function initDevDateOffset(): void {
  if (!isDevMode()) return;
  const stored = parseInt(localStorage.getItem(storageKey()) ?? '0', 10);
  if (stored > 0) {
    devDayOffset.value = stored;
    applyDevDateOffset(stored);
  }
}

/** Called at session-end: advances offset by one day, persists, and re-patches Date. */
export function incrementDevDayOffset(): void {
  if (!isDevMode()) return;
  const next = devDayOffset.value + 1;
  devDayOffset.value = next;
  localStorage.setItem(storageKey(), String(next));
  applyDevDateOffset(next);
}

/** Resets the offset to zero for the current user. Called by clearUserProgress(). */
export function resetDevDateOffset(): void {
  if (!isDevMode()) return;
  localStorage.removeItem(storageKey());
  devDayOffset.value = 0;
  // Restore the original Date if we patched it
  if ((globalThis as any).__origDate) {
    globalThis.Date = (globalThis as any).__origDate;
    delete (globalThis as any).__origDate;
  }
}
