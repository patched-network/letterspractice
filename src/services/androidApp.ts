/**
 * Are we inside the Play Store app?
 *
 * The Play app is a Trusted Web Activity (TWA): a thin Android shell that
 * opens letterspractice.com full-screen in the user's own Chrome. The
 * wrapper project lives with the deployment, not in this repo.
 *
 * Play's payments policy: a Play app may not sell digital content except
 * through Play Billing, and (outside Google's programs) may not point users
 * to web checkout either. Until we add Play Billing, the app sells nothing:
 * purchase prompts check isAndroidApp() and stay hidden, and the checkout and
 * gift pages redirect away (router/index.ts). Web buyers who sign in still get
 * everything they paid for; that much is allowed.
 *
 * Free-tier users who reach the 1,000-word wall in the app therefore have no
 * way to buy from it. The app records its use per account
 * (userState.recordAndroidAppUse), and /admin raises an alarm for any such
 * user: that's the signal for when Play Billing is worth building.
 *
 * Detection: the Android shell launches `/study?src=twa` (its start URL in the
 * Bubblewrap config). The flag is kept in sessionStorage, NOT localStorage: a
 * TWA shares storage with Chrome, so a sticky flag would leak into ordinary
 * browser visits and hide purchasing on the web too. Every app launch sets it
 * again.
 *
 * To try it on desktop: open /study?src=twa. Close the tab to reset.
 */

const LAUNCH_PARAM = "src";
const LAUNCH_VALUE = "twa";
const SESSION_KEY = "lp-android-app";

let androidApp: boolean | undefined;

/**
 * Read the launch marker. Call once at boot, before the first navigation away
 * from the entry URL (which is the only one that carries it).
 */
export function detectAndroidAppLaunch(): void {
  if (new URLSearchParams(window.location.search).get(LAUNCH_PARAM) !== LAUNCH_VALUE) return;
  androidApp = true;
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Storage blocked: the flag still holds for this page load.
  }
}

/** True inside the Play Store app; false on the web and in installed PWAs. */
export function isAndroidApp(): boolean {
  if (androidApp === undefined) {
    try {
      androidApp = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      androidApp = false;
    }
  }
  return androidApp;
}
