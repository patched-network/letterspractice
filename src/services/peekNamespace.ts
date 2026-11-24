/**
 * Guest-namespace isolation: route-aware guest UUID swapping.
 *
 * The framework reads `localStorage['sk-guest-uuid']` to identify the guest
 * user, then creates a local PouchDB at `userdb-sk-guest-<uuid>`. Three route
 * families each want their own guest DB:
 *
 *   - `peek`   — adults previewing the product. Kept separate so signup-time
 *                data carries the child's real learning progress, not the
 *                parent's poking around.
 *   - `showhn` — the ungated annotated-internals demo (`/tech-demo`, `/showHN`). Evaluator
 *                traffic must not contaminate a real learner's ELO/SRS state,
 *                and the demo must never inherit a learner's progress either.
 *   - `study`  — everything else, including real guest study sessions.
 *
 * Approach: keep one canonical UUID per namespace in localStorage and copy the
 * appropriate one into `sk-guest-uuid` at app init based on the current route.
 * Boundary crossings between namespaces trigger a full page reload (see router
 * guard) so the framework's singleton user re-resolves cleanly.
 *
 * The visible username at the framework layer stays `sk-guest-<uuid>` so all
 * `username.startsWith('sk-guest-')` checks across the framework continue to
 * work. Only the UUID differs.
 */

const GUEST_KEY = 'sk-guest-uuid';
const PEEK_KEY = 'sk-peek-uuid';
const SHOWHN_KEY = 'sk-showhn-uuid';
const STUDY_KEY = 'sk-study-uuid';

export type GuestNamespace = 'peek' | 'showhn' | 'study';

const CANONICAL_KEY: Record<GuestNamespace, string> = {
  peek: PEEK_KEY,
  showhn: SHOWHN_KEY,
  study: STUDY_KEY,
};

/**
 * Which guest namespace a path belongs to.
 *
 * Matched case-insensitively: the demo lives at `/tech-demo` and its aliases
 * `/showHN` / `/showhn` (router), and all of them must resolve to the same DB
 * rather than silently falling through to the `study` namespace. The
 * namespace keeps its `showhn` name so existing guest UUIDs carry over.
 */
export function routeNamespace(pathname: string = window.location.pathname): GuestNamespace {
  const p = pathname.toLowerCase();
  if (p.startsWith('/tech-demo') || p.startsWith('/showhn')) return 'showhn';
  if (p.startsWith('/peek')) return 'peek';
  return 'study';
}

export function isPeekRoute(pathname?: string): boolean {
  return routeNamespace(pathname) === 'peek';
}

export function isShowHNRoute(pathname?: string): boolean {
  return routeNamespace(pathname) === 'showhn';
}

function canonicalKeyForRoute(pathname?: string): string {
  return CANONICAL_KEY[routeNamespace(pathname)];
}

/**
 * Run BEFORE `initializeDataLayer`. Ensures the framework's `sk-guest-uuid`
 * slot holds the right UUID for the current route.
 */
export function syncGuestUUIDForRoute(): void {
  if (typeof localStorage === 'undefined') return;

  // One-time migration: any pre-existing sk-guest-uuid (from before this
  // change) is treated as the study UUID. Peek starts fresh.
  if (!localStorage.getItem(PEEK_KEY) && !localStorage.getItem(STUDY_KEY)) {
    const existing = localStorage.getItem(GUEST_KEY);
    if (existing) {
      localStorage.setItem(STUDY_KEY, existing);
    }
  }

  const canonicalKey = canonicalKeyForRoute();
  const canonicalValue = localStorage.getItem(canonicalKey);

  if (canonicalValue) {
    localStorage.setItem(GUEST_KEY, canonicalValue);
  } else {
    // No UUID yet for this mode — clear sk-guest-uuid so the framework
    // generates a fresh one. We'll capture it post-init.
    localStorage.removeItem(GUEST_KEY);
  }
}

/**
 * Run AFTER `initializeDataLayer`. If the framework generated a new UUID,
 * persist it into the appropriate canonical slot so it survives future
 * route swaps.
 */
export function captureGuestUUIDAfterInit(): void {
  if (typeof localStorage === 'undefined') return;
  const canonicalKey = canonicalKeyForRoute();
  const generated = localStorage.getItem(GUEST_KEY);
  if (generated && !localStorage.getItem(canonicalKey)) {
    localStorage.setItem(canonicalKey, generated);
  }
}

/**
 * Dev affordance: forget the peek guest identity so the next `/peek` load
 * behaves like a brand-new first-time visit — the hello-world lesson runs
 * again, `peekSessionCount` resets to 0, and the peek→study transition prompt
 * disappears.
 *
 * Synchronous by design: the caller is `main.ts`, which must run this BEFORE
 * `syncGuestUUIDForRoute()` (which reads `sk-peek-uuid`). Dropping the key is
 * all that's needed — sync then hits its "No UUID yet for this mode" branch and
 * regenerates a fresh UUID + empty DB. We deliberately do NOT clear
 * `sk-guest-uuid` here: at this point in boot it still holds the *previous*
 * route's UUID, and `syncGuestUUIDForRoute` is what clears/repopulates it.
 *
 * Reached via `/peek?fresh=1` (see main.ts). Because that param stays in the
 * URL, a browser refresh re-runs this on every load — so the abandoned peek DBs
 * would otherwise pile up. The best-effort sweep below (fire-and-forget, filters
 * by the *stale* UUID so it can't touch the fresh DB) keeps that bounded.
 * `indexedDB.databases()` is unsupported on Firefox; there the old DBs are left
 * in place (harmless).
 *
 * NOT referenced by any production path.
 */
export function forgetPeekGuest(): void {
  if (typeof localStorage === 'undefined') return;

  const staleUUID = localStorage.getItem(PEEK_KEY);
  localStorage.removeItem(PEEK_KEY);

  // Guest session counts (incl. peekSessionCount) live in localStorage under
  // `sk-session-tracking-*`, NOT in the rotated peek DB (see
  // stores/sessionTracker.ts). Without clearing them, peekSessionCount survives
  // the reset and, once it reaches 3, pins the peek→study transition prompt so
  // a "fresh" peek skips straight past the lesson + practice. Iterate backwards
  // since removeItem reindexes.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sk-session-tracking')) localStorage.removeItem(k);
    }
  } catch {
    /* non-fatal */
  }

  if (
    staleUUID &&
    typeof indexedDB !== 'undefined' &&
    typeof indexedDB.databases === 'function'
  ) {
    // Fire-and-forget: never block boot on orphan cleanup.
    void (async () => {
      try {
        const dbs = await indexedDB.databases();
        for (const { name } of dbs) {
          if (name && name.includes(staleUUID)) indexedDB.deleteDatabase(name);
        }
      } catch {
        /* non-fatal: the fresh UUID already guarantees a clean peek */
      }
    })();
  }
}
