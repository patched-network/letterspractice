/**
 * Session Arrival
 * ===============
 *
 * A one-bit module-level flag marking that the learner reached `/progress` by
 * finishing a study session (via the session-end "See progress" action) rather
 * than navigating there cold. The course header reads it to suppress the
 * "Study Now" CTA on that first arrival — you just studied; don't nag.
 *
 * Module-scoped (not provide/inject) because the writer (SessionEndScreen, deep
 * inside the /study tree) and the reader (CourseHeader, mounted at the app shell)
 * don't share a provider ancestor. The header clears the flag whenever the route
 * leaves /progress, so a later cold visit shows the CTA again.
 */
import { ref } from 'vue';

const arrivedFromSession = ref(false);

/** Call right before navigating to /progress at the end of a study session. */
export function markArrivedFromSession(): void {
  arrivedFromSession.value = true;
}

/** Reactive flag + a clear(), for the header to read and reset. */
export function useSessionArrival() {
  return {
    arrivedFromSession,
    clearSessionArrival() {
      arrivedFromSession.value = false;
    },
  };
}
