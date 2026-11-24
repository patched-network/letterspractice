import ENV from "./ENVIRONMENT_VARS";
import "@mdi/font/css/materialdesignicons.css";

import { initPwa } from "./services/pwa";
import { scheduleBootCourseSync } from "./services/courseSync";

// Set global runtime configuration BEFORE importing vue-skuilder packages
// This allows library code to access runtime config values
declare global {
  interface Window {
    __SKUILDER_CONFIG__?: {
      apiBase?: string;
      [key: string]: unknown;
    };
  }
}

window.__SKUILDER_CONFIG__ = {
  apiBase: import.meta.env.VITE_API_BASE_URL || '/express',
};

if (window.location.hostname === 'localhost') {
  document.title = '[dev] ' + document.title;
}

console.log('[main.ts] Set window.__SKUILDER_CONFIG__:', window.__SKUILDER_CONFIG__);

// Log the deployed build version on startup. Mirrors the build metadata shown
// in AdminIndexView (/buildinfo.json is emitted by the deploy workflow). This
// makes it possible to confirm which commit is live straight from the console.
// Fire-and-forget — never blocks app startup. In local dev the file usually
// 404s, which we log quietly.
void (async () => {
  try {
    const res = await fetch('/buildinfo.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const b = await res.json();
    console.log(
      `[build] commit ${String(b.commit ?? '?').slice(0, 12)} | built ${b.builtAt ?? '?'} | ${b.event ?? '?'} by ${b.actor ?? '?'}`,
      b,
    );
  } catch (err) {
    console.log('[build] no buildinfo.json available (expected in local dev):', err instanceof Error ? err.message : err);
  }
})();

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { detectAndroidAppLaunch, isAndroidApp } from "./services/androidApp";
import { recordAndroidAppUse } from "./services/userState";
import { installInlineMarkup } from "./components/landing/inlineMarkup";

// Configure anime.js v4 to use milliseconds (aligns with CSS and native JS timers)
import { engine } from "animejs";
engine.timeUnit = "ms";

// Vuetify
//
// Previously: `import * as components from "vuetify/components"` (wildcard
// namespace) loaded all ~150 Vuetify components eagerly, costing ~286 KB gzip.
// Most are unused.
//
// Now: explicit named imports of only the 61 components actually rendered by
// LP templates + transitively by the @vue-skuilder framework's pre-built code
// (common-ui's and courseware's dist, which use runtime
// `resolveComponent('v-btn')` etc. and therefore require global registration).
//
// To update this list when adding/removing Vuetify components, regenerate via:
//   { grep -rEho '<v-[a-z][a-z-]+' src --include='*.vue' | sed 's/<//';
//     grep -rhoE '(^|[^A-Za-z0-9_$.])[A-Za-z_$]{1,2}\("v-[a-z][a-z-]+"\)' \
//       node_modules/@vue-skuilder/{common-ui,courseware,db}/dist \
//       --include='*.mjs' --include='*.js' | grep -oE 'v-[a-z-]+';
//   } | sort -u
// (common-ui is one file per module since 0.2.36; each module's minified
// alias for resolveComponent differs, hence the loose call pattern.)
//
// Note: any `v-list-item-content` references in framework dist code are
// Vuetify 2 vestiges (component removed in v3); render-time warns harmlessly.
//
// Of that list, only the components the landing page renders are registered
// here, at boot (below). The rest are registered on first need, before any
// other route renders (services/vuetifyDeferred.ts; the list is
// services/vuetifyDeferredComponents.ts, whose header says which list a
// component belongs in).
//
// Vuetify directives (v-ripple, v-intersect, etc.) are not used by either LP
// or the framework, so the directives argument is omitted entirely.
import "vuetify/styles";
// The app's typefaces, self-hosted (index.html says why), in the weights the
// Google Fonts link asked for. Each file covers every subset with a
// unicode-range, so a browser fetches only what a page's text uses; the
// service worker precaches the latin ones only (vite.config.ts).
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
// Fallback faces sized like Roboto and Poppins, so text drawn before its face
// arrives doesn't move when it does (scripts/postcss-font-fallbacks.ts).
import "./theme/fontFallbacks.css";
import "./theme/tooltip.css";

// The faces the first screen uses, which the build preloads
// (scripts/vite-plugin-preload-fonts.ts; keep the two lists in step). A
// preload only fetches a font's bytes; the face itself loads when text first
// needs it, and Firefox draws no text in a face that's still loading. The app
// bar's buttons, the landing page's first Roboto 500, arrive only at mount, so
// their labels blinked there. So load the faces now (their bytes are on the
// way already; this stylesheet's @font-face rules have applied by the time a
// module script runs), and let the mount wait for them, briefly.
const FIRST_SCREEN_FACES = ["400 1em Roboto", "500 1em Roboto", "700 1em Roboto", "700 1em Poppins"];
const firstScreenFonts: Promise<unknown> =
  "fonts" in document
    ? Promise.all(FIRST_SCREEN_FACES.map((face) => document.fonts.load(face))).catch(() => undefined)
    : Promise.resolve();
import { createVuetify } from "vuetify";
import {
  VAlert, VApp, VAppBar, VAvatar, VBtn, VCard, VCardText, VCol, VContainer,
  VDivider, VForm, VIcon, VList, VListItem, VListItemTitle, VMain, VMenu, VRow,
  VSnackbar, VSpacer, VTextField, VToolbarTitle,
} from "vuetify/components";
import { bindDeferredVuetify } from "./services/vuetifyDeferred";
import { aliases, mdi } from "vuetify/iconsets/mdi";

// data layer
import { initializeDataLayer, getDataLayer } from "@vue-skuilder/db";
import { syncGuestUUIDForRoute, captureGuestUUIDAfterInit, routeNamespace, forgetPeekGuest } from "./services/peekNamespace";

// auth store
// Static, never `await import("@vue-skuilder/common-ui")`: the package is in
// the entry chunk regardless, and with a per-module build of it a dynamic
// import of its index loads the whole barrel (StudySession, CardViewer, the
// login forms, …) as a separate chunk during boot.
import { piniaPlugin, useAuthStore, useConfigStore } from "@vue-skuilder/common-ui";

// styles from component library packages
import "@vue-skuilder/courseware/style";
import "@vue-skuilder/common-ui/style";

// The course (its question types, into allCourseWare) and LP's navigators
// (letter gating, lesson gates, intro gate, skill staleness, recent
// weakness) are registered on first need, not here: services/courseware.ts.
// The router awaits them before every route but the landing page.

// theme configuration
import config from "../skuilder.config.json";

/**
 * Show a "still working" splash only if initialization is genuinely slow.
 *
 * Deliberately not markup in index.html: that renders from HTML parse onward,
 * so it spins through the bundle download and greets every first-time visitor
 * with a loading screen. Timing it from here instead means the clock starts
 * once the app is actually booting, and the normal paths — guest visitors and
 * returning users, both of whom resolve their local state without a network
 * round trip — mount well inside the delay and never see it.
 *
 * What it does cover is the case where pre-mount work really does stall: the
 * /sync-error retry reload (a device that has never pulled the account's data,
 * so hydration blocks on the network for up to 15s) and a slow /_session check.
 *
 * Vue wipes #app's contents on mount, so there is no teardown beyond cancelling
 * the pending timer.
 */
function deferredBootSplash(delayMs = 600): () => void {
  const timer = setTimeout(() => {
    const host = document.getElementById("app");
    // Already mounted. A prerendered page's hidden static copy doesn't count:
    // the splash replaces it, as the mount would.
    if (!host || Array.from(host.children).some((el) => !el.hasAttribute("data-prerendered"))) return;
    // Unless part of it is on show (the landing page's hero: see
    // [data-prerender-show] in index.html): the reader already has a page.
    if (host.querySelector("[data-prerendered] [data-prerender-show]")) return;
    host.innerHTML = `
      <div class="boot-splash" role="status" aria-live="polite">
        <div class="boot-splash__mark" aria-hidden="true"></div>
        <p class="boot-splash__label">Getting things ready…</p>
      </div>
      <style>
        .boot-splash {
          position: fixed; inset: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 1.25rem;
          background: #fffef7;
          font-family: Poppins, Roboto, system-ui, sans-serif;
          opacity: 0; animation: boot-splash-in 0.3s ease-out forwards;
        }
        .boot-splash__mark {
          width: 44px; height: 44px;
          border: 4px solid #ffe0b2; border-top-color: #f57c00;
          border-radius: 50%;
          animation: boot-splash-spin 0.9s linear infinite;
        }
        .boot-splash__label {
          margin: 0; color: #8d6e63;
          font-size: 0.95rem; letter-spacing: 0.01em;
        }
        @keyframes boot-splash-in { to { opacity: 1; } }
        @keyframes boot-splash-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .boot-splash__mark {
            animation: none;
            border-top-color: #ffe0b2;
            background: #f57c00;
          }
        }
      </style>`;
  }, delayMs);

  return () => clearTimeout(timer);
}

(async () => {
  const cancelBootSplash = deferredBootSplash();
  // Log environment configuration for debugging
  console.log('[ENV] ============ Environment Configuration ============');
  console.log('[ENV] VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL);
  console.log('[ENV] VITE_COUCH_BASE_URL:', import.meta.env.VITE_COUCH_BASE_URL);
  console.log('[ENV] VITE_COUCHDB_PROTOCOL:', import.meta.env.VITE_COUCHDB_PROTOCOL);
  console.log('[ENV] VITE_APP_NAME:', import.meta.env.VITE_APP_NAME);
  console.log('[ENV] MODE:', import.meta.env.MODE);
  console.log('[ENV] DEV:', import.meta.env.DEV);
  console.log('[ENV] PROD:', import.meta.env.PROD);
  console.log('[ENV] Parsed ENV object:', ENV);
  console.log('[ENV] ================================================');

  // For static data layer, load manifest
  let dataLayerOptions: any = {
    COUCHDB_SERVER_URL: ENV.COUCHDB_SERVER_URL,
    COUCHDB_SERVER_PROTOCOL: ENV.COUCHDB_SERVER_PROTOCOL,
    COURSE_IDS: [config.course ? config.course : "default-course"],
    // LP's course corpus is small, text-only JSON (no attachments).
    // Pull the whole thing in a single _bulk_get to minimize cold-load time.
    courseSync: {
      replication: {
        batchSize: 10000,
        batchesLimit: 1,
      },
    },
  };

  if (ENV.DATALAYER_TYPE === "static") {
    // Static mode: the course is packed JSON under public/static-courses/
    // (`yarn pack:course`). The provider resolves it from a root manifest
    // whose dependencies point at each course's skuilder.json. No accounts:
    // progress lives in the browser (local PouchDB `userdb-Me`).
    const courseId = config.course;
    if (!courseId) {
      throw new Error("Course ID required for static data layer");
    }
    dataLayerOptions = {
      rootManifest: {
        dependencies: { [courseId]: `/static-courses/${courseId}/skuilder.json` },
      },
      rootManifestUrl: new URL("/", window.location.href).href,
    };
  }

  // Dev affordance: /peek?fresh=1 forgets the peek guest identity on every
  // load, so a browser refresh yields a brand-new first-time peek (linked from
  // /dbg as "Fresh Peek"). Must run BEFORE the guest-UUID sync below, which
  // then regenerates a fresh peek DB. The ?fresh param intentionally stays in
  // the URL — refresh re-runs this. See peekNamespace.ts:forgetPeekGuest.
  if (
    routeNamespace() === 'peek' &&
    new URLSearchParams(window.location.search).has('fresh')
  ) {
    forgetPeekGuest();
    console.log('[guest-ns] fresh peek requested — forgot peek guest identity');
  }

  // Route-aware guest UUID swap: /peek visitors get an isolated guest DB
  // (userdb-sk-guest-<peek-uuid>) distinct from real guest study sessions.
  // Must run BEFORE initializeDataLayer reads sk-guest-uuid.
  syncGuestUUIDForRoute();
  console.log('[guest-ns] Guest UUID synced for route, namespace:', routeNamespace());

  // Play Store app launch marker (?src=twa): only the entry URL carries it.
  detectAndroidAppLaunch();

  try {
    const dataLayerType = ENV.DATALAYER_TYPE;
    console.log('[funnel-test] Initializing data layer with type:', dataLayerType);
    console.log('[funnel-test] Data layer options:', dataLayerOptions);

    await initializeDataLayer({
      type: dataLayerType,
      // Study sessions record which app build they ran on.
      options: { ...dataLayerOptions, appVersion: __APP_VERSION__ },
    });

    // Persist any freshly-generated UUID into the per-mode canonical slot
    // so it survives future route swaps.
    captureGuestUUIDAfterInit();

    console.log('[funnel-test] Data layer initialized');
    // Dev-only console handle for inspecting the local user DB:
    //   await __lp.docs('cardH')         // card history
    //   await __lp.docs('card_review_')  // scheduled reviews
    //   await __lp.docs()                // everything
    if (import.meta.env.DEV) {
      const user = () => getDataLayer().getUserDB() as any;
      (window as any).__lp = {
        dataLayer: getDataLayer,
        user,
        docs: async (prefix = '') =>
          (await user().localDB.allDocs({ include_docs: true, startkey: prefix, endkey: prefix + '\ufff0' }))
            .rows.map((r: any) => r.doc),
      };
    }
    const initialUser = getDataLayer().getUserDB();
    if (initialUser) {
      console.log('[funnel-test] Initial username after init:', initialUser.getUsername());
    } else {
      console.log('[funnel-test] No user logged in after init');
    }
    console.log("[DEBUG] Data layer initialized successfully");
  } catch (error) {
    console.error("[DEBUG] Data layer initialization failed:", error);
    throw error;
  }
  const pinia = createPinia();

  // Apply theme configuration from skuilder.config.json
  const themeConfig = config.theme
    ? {
        defaultTheme: config.theme.defaultMode || "light",
        themes: {
          light: config.theme.light,
          dark: config.theme.dark,
        },
      }
    : {
        defaultTheme: "light",
        themes: {
          light: {
            dark: false,
            colors: {
              primary: "#1976D2",
              secondary: "#424242",
              accent: "#82B1FF",
              error: "#F44336",
              info: "#2196F3",
              success: "#4CAF50",
              warning: "#FF9800",
              background: "#FFFFFF",
              surface: "#FFFFFF",
              "surface-bright": "#FFFFFF",
              "surface-light": "#EEEEEE",
              "surface-variant": "#E3F2FD",
              "on-surface-variant": "#1976D2",
              "primary-darken-1": "#1565C0",
              "secondary-darken-1": "#212121",
              "on-primary": "#FFFFFF",
              "on-secondary": "#FFFFFF",
              "on-background": "#212121",
              "on-surface": "#212121",
            },
          },
          dark: {
            dark: true,
            colors: {
              primary: "#2196F3",
              secondary: "#90A4AE",
              accent: "#82B1FF",
              error: "#FF5252",
              info: "#2196F3",
              success: "#4CAF50",
              warning: "#FFC107",
              background: "#121212",
              surface: "#1E1E1E",
              "surface-bright": "#2C2C2C",
              "surface-light": "#2C2C2C",
              "surface-variant": "#1A237E",
              "on-surface-variant": "#82B1FF",
              "primary-darken-1": "#1976D2",
              "secondary-darken-1": "#546E7A",
              "on-primary": "#000000",
              "on-secondary": "#000000",
              "on-background": "#FFFFFF",
              "on-surface": "#FFFFFF",
            },
          },
        },
      };

  const vuetify = createVuetify({
    // The landing page's components; the rest: services/vuetifyDeferred.ts
    components: {
      VAlert, VApp, VAppBar, VAvatar, VBtn, VCard, VCardText, VCol, VContainer,
      VDivider, VForm, VIcon, VList, VListItem, VListItemTitle, VMain, VMenu,
      VRow, VSnackbar, VSpacer, VTextField, VToolbarTitle,
    },
    theme: themeConfig,
    // Inverse, high-contrast tooltips everywhere (theme/tooltip.css).
    defaults: { VTooltip: { contentClass: 'app-tooltip' } },
    icons: {
      defaultSet: "mdi",
      aliases,
      sets: {
        mdi,
      },
    },
  });

  const app = createApp(App);
  // Before the router: its first navigation may register the deferred
  // Vuetify components (services/vuetifyDeferred.ts).
  bindDeferredVuetify(app);

  app.use(router);
  installInlineMarkup(router);
  app.use(vuetify);
  app.use(pinia);

  app.use(piniaPlugin as any, { pinia });

  await useAuthStore().init();

  // Initialize config store to load user settings (including dark mode)
  await useConfigStore().init();

  // Force light mode - this app should never use dark mode
  vuetify.theme.global.name.value = 'light';

  // Auto-register user for the course in standalone mode
  if (config.course) {
    try {
      const user = getDataLayer().getUserDB();

      // Register guests too: their registration doc lives in browser-local
      // PouchDB, and without it every ELO/tag write in a study session dies
      // (EloService looks up the course entry on the registration doc).
      if (user) {
        // Check if user is already registered for the course
        const courseRegistrations = await user.getCourseRegistrationsDoc();
        const isRegistered = courseRegistrations.courses.some(
          (c) => c.courseID === config.course,
        );

        if (!isRegistered) {
          console.log(
            `[Standalone] Auto-registering user for course: ${config.course}`,
          );
          await user.registerForCourse(config.course, false); // non-preview mode
          console.log(
            `[Standalone] Auto-registration completed for course: ${config.course}`,
          );
        } else {
          console.log(
            `[Standalone] User already registered for course: ${config.course}`,
          );
        }
      } else {
        console.log(
          `[Standalone] No user available, skipping auto-registration`,
        );
      }
    } catch (error) {
      console.warn(
        `[Standalone] Failed to auto-register for course ${config.course}:`,
        error,
      );
      // Don't block app startup on registration failure
    }
  }

  cancelBootSplash();
  // At most 300 ms: by now the faces are normally long loaded, and a slow one
  // mustn't hold the app back (font-display: swap covers it then).
  await Promise.race([firstScreenFonts, new Promise((resolve) => setTimeout(resolve, 300))]);
  app.mount("#app");
  // Vuetify registers the app bar's height a frame or two after mount; until
  // then index.html's html[data-booting] rule keeps v-main from animating its
  // padding into place (a 64 px slide of the whole page). Drop it once that's
  // done, so layout changes in the app animate as usual.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => setTimeout(() => document.documentElement.removeAttribute("data-booting"), 100)),
  );

  // Service worker: production only, and after mount so it never competes
  // with boot (registration itself waits for the window load event).
  initPwa();

  // Course replica refresh (or build, logged in), at idle after mount; never
  // for a fresh anonymous visitor. See services/courseSync.ts.
  scheduleBootCourseSync();

  // Play Store app: note it on the account, for the /admin wall alarm.
  if (isAndroidApp()) void recordAndroidAppUse();

  // Mount user debug API on window.letterspractice.user. Lazy: it imports
  // db's makeScheduledCardId, which would keep moment in the entry chunk.
  void import("./services/userDebugAPI").then((m) => m.mountUserDebugAPI());

  // Legacy debug helpers (kept for backwards compat; prefer window.letterspractice.user)
  (window as any).lpdbg = {
    clearOnboardingState: () => {
      localStorage.removeItem('letterspractice-onboarding');
      console.log('[lpdbg] Cleared onboarding state from localStorage. Reload page to see fresh onboarding.');
    },
    forceLightMode: async () => {
      const configStore = useConfigStore();
      await configStore.updateDarkMode(false);
      console.log('[lpdbg] Forced light mode and saved to config. Page will reload.');
      window.location.reload();
    },
  };
})();
