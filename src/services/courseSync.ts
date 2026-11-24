/**
 * When this device builds or refreshes its local replica of the course DB.
 *
 * A replica makes the study loop fast (pipeline and card reads stay local),
 * but building one on a device that has none is expensive: the whole course
 * (~9,000 docs) downloaded, written to IndexedDB, and two view indexes built,
 * all on the main thread. On a phone that is minutes of work with
 * multi-second stalls (vue-skuilder agent/runtime-perf/a.1.assessment.md).
 * Refreshing an existing replica is cheap (an incremental pull).
 *
 * So:
 *   - at boot, after mount and at idle: refresh, if this device already has a
 *     replica, or build one for a logged-in user (who is here to study);
 *   - entering /study: build or refresh (as before);
 *   - /peek: refresh only. A first-time visitor's short guest session runs
 *     against the server; they don't pay for a replica they may never use.
 *
 * A fresh anonymous visitor (PageSpeed's case) never opens or replicates the
 * course DB. PouchDB itself still loads at boot for everyone (main.ts's
 * initializeDataLayer); the localStorage flag below saves opening the course
 * DB in IndexedDB just to look for the framework's sync marker.
 *
 * The data layer decides at session start whether the replica is usable
 * (CourseSyncService's `ready`); a session started before that runs against
 * the server for its whole length.
 */
import { getDataLayer } from '@vue-skuilder/db';
import ENV from '../ENVIRONMENT_VARS';

/** Set once a sync has completed on this device; never cleared by us. */
const REPLICA_KEY = 'lp.courseReplica';

let syncPromise: Promise<void> | null = null;

/** Has a course sync ever completed on this device? Cheap: no PouchDB. */
export function hasCourseReplica(): boolean {
  try {
    return localStorage.getItem(REPLICA_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Start (or join) the background course sync. `onlyIfReplica` skips it when
 * this device has no replica yet (the /peek rule). Never throws; a failure is
 * retried on the next call.
 */
export function startCourseSync(reason: string, opts: { onlyIfReplica?: boolean } = {}): void {
  if (opts.onlyIfReplica && !hasCourseReplica()) {
    console.log(`[courseSync] ${reason}: no local replica on this device, not building one`);
    return;
  }
  if (syncPromise) return;

  const courseId = ENV.STATIC_COURSE_ID;
  if (!courseId || courseId === 'not_set') return;

  const dataLayer = getDataLayer();
  if (!dataLayer.ensureCourseSynced) return;

  const start = performance.now();
  console.log(`[courseSync] ${reason}: starting course sync`);
  syncPromise = dataLayer
    .ensureCourseSynced(courseId, true)
    .then(() => {
      try {
        localStorage.setItem(REPLICA_KEY, new Date().toISOString());
      } catch {
        // Private mode etc.: we just won't refresh at boot next time.
      }
      console.log(`[courseSync] ${reason}: local course DB ready (${Math.round(performance.now() - start)} ms)`);
    })
    .catch((e) => {
      syncPromise = null;
      console.warn(`[courseSync] ${reason}: course sync failed, will retry on next start`, e);
    });
}

/** Boot: after mount, at idle. */
export function scheduleBootCourseSync(): void {
  const run = () => {
    let loggedIn = false;
    try {
      loggedIn = getDataLayer().getUserDB().isLoggedIn();
    } catch {
      // Data layer unavailable: nothing to sync against.
      return;
    }
    if (loggedIn) startCourseSync('boot (logged in)');
    else startCourseSync('boot', { onlyIfReplica: true });
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 2000);
  }
}
