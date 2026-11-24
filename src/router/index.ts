import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import { deployment } from "../deployment";
import LandingPage from "../views/LandingPage.vue";
// Every other view is its own chunk, fetched when it's navigated to: most
// first visits are the landing page, which shouldn't have to download the
// rest of the app before it can show anything. The views'
// styles are all scoped, so splitting moves no global CSS. A chunk that went
// missing in a redeploy is handled by recoverFromStaleBuild (router.onError).
const StudyHubView = () => import("../views/StudyHubView.vue");
const LessonsView = () => import("../views/LessonsView.vue");
const StudyPracticeView = () => import("../views/StudyPracticeView.vue");
const LessonView = () => import("../views/LessonView.vue");
const PeekView = () => import("../views/PeekView.vue");
const ShowHNView = () => import("../views/ShowHNView.vue");
const RoadmapView = () => import("../views/RoadmapView.vue");
const ChangelogIndexView = () => import("../views/ChangelogIndexView.vue");
const ChangelogEntryView = () => import("../views/ChangelogEntryView.vue");
const CurriculumView = () => import("../views/CurriculumView.vue");
const PedagogyView = () => import("../views/PedagogyView.vue");
const ExercisesView = () => import("../views/ExercisesView.vue");
const ProgressView = () => import("../views/ProgressView.vue");
const FridgeSheetView = () => import("../views/FridgeSheetView.vue");
const BrowseView = () => import("../views/BrowseView.vue");
const UserSettingsView = () => import("../views/UserSettingsView.vue");
const LogoExporter = () => import("../views/LogoExporter.vue");
const VerifyAccountView = () => import("../views/VerifyAccountView.vue");
const RequestResetView = () => import("../views/RequestResetView.vue");
const ResetPasswordView = () => import("../views/ResetPasswordView.vue");
const AccountView = () => import("../views/AccountView.vue");
const LoginView = () => import("../views/LoginView.vue");
const SignUpView = () => import("../views/SignUpView.vue");
const GoonupView = () => import("../views/GoonupView.vue");
const NewsletterView = () => import("../views/NewsletterView.vue");
const JoinView = () => import("../views/JoinView.vue");
const PEIView = () => import("../views/PEIView.vue");
const MilestoneView = () => import("../views/MilestoneView.vue");
// Admin routes are lazy-loaded — admin pages are visited by ~1 user (admin
// login required) so eager-importing them taxes every other visitor's TTFR.
// Each becomes its own chunk, fetched only when an admin navigates to it.
const AdminLayout = () => import("../views/admin/AdminLayout.vue");
const AdminRegisterQuestionsView = () => import("../views/AdminRegisterQuestionsView.vue");
const AdminContentView = () => import("../views/admin/AdminContentView.vue");
const AdminIndexView = () => import("../views/admin/AdminIndexView.vue");
const AdminUserProgressView = () => import("../views/admin/AdminUserProgressView.vue");
const AdminUserCardHistoryView = () => import("../views/admin/AdminUserCardHistoryView.vue");
const AdminUserSessionsView = () => import("../views/admin/AdminUserSessionsView.vue");
const AdminUserSpellingView = () => import("../views/admin/AdminUserSpellingView.vue");
const AdminUserPipelineRunView = () => import("../views/admin/AdminUserPipelineRunView.vue");
const AdminUserSessionDetailView = () => import("../views/admin/AdminUserSessionDetailView.vue");
// LP vs framework learner views, side by side while the framework versions are proved out.
const AdminViewSwitch = () => import("../views/admin/fw/AdminViewSwitch.vue");
const FwLearnerView = () => import("../views/admin/fw/FwLearnerView.vue");
const AudioListenerDbg = () => import("../dbg/AudioListenerDbg.vue");
// Lazy for the same reason as the admin views: this is a rare failure path
// (first sync of an account onto a device couldn't complete), so it should not
// sit in the bundle every visitor downloads.
const HydrationErrorView = () => import("../views/HydrationErrorView.vue");
import { debugRoutes } from "./debug";
import { routeNamespace } from "../services/peekNamespace";
import {
  applyUpdateOnNavigation,
  clearStaleBuildRecovery,
  isStaleChunkError,
  recoverFromStaleBuild,
} from "../services/pwa";
import { isAndroidApp } from "../services/androidApp";
import { applyPageMeta, resolvePageMeta } from "../services/pageMeta";
import { resolveLessonShortKey } from "../services/lessonShortLinks";
import { ensureCourseware } from "../services/courseware";
// Static, not `await import(...)` in the guards below: see main.ts.
import { useAuthStore } from "@vue-skuilder/common-ui";
import { ensureDeferredVuetify } from "../services/vuetifyDeferred";

// Onboarding views
const OnboardingAge = () => import("../views/onboarding/OnboardingAge.vue");
const OnboardingPreferences = () => import("../views/onboarding/OnboardingPreferences.vue");
const OnboardingNames = () => import("../views/onboarding/OnboardingNames.vue");
const OnboardingSensitive = () => import("../views/onboarding/OnboardingSensitive.vue");
const OnboardingDecorations = () => import("../views/onboarding/OnboardingDecorations.vue");

declare module "vue-router" {
  interface RouteMeta {
    /** No course header (App.vue); the view gets the whole screen. */
    bare?: boolean;
    /**
     * A page for reading (marketing, legal, explainers, cohort landings) or an
     * account door (login, signup, reset): the header wordmark links back to
     * the landing page. Opt-in, so anything a learner is in the
     * middle of (/study*, /peek, /progress, onboarding, the tech demo) gets no
     * exit link.
     */
    copy?: boolean;
  }
}

// Adding a route? Decide what it shows when someone shares a link to it, and
// check that at /dbg/og (src/dbg/OgCardsDbg.vue), which lists every route's
// preview image (og:image). A public page goes in src/content/pages.ts
// (otherwise it's noindex and shows the home copy); give it `image` there for
// its own card, or it falls back to the site-wide /og-image.png. A new card:
// an entry in PAGE_OG_CARDS (components/curriculum/ogCard.ts), a component
// drawn in og/OgCardFrame.vue, registered in OgCardsDbg's PAGE_CARD_COMPONENTS;
// then export it (scripts/export-og-cards.ts <id>) and commit the PNG.
const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "home",
    component: LandingPage,
  },
  {
    path: "/roadmap",
    name: "roadmap",
    component: RoadmapView,
    meta: { copy: true },
  },
  {
    // Every update; /roadmap shows only the latest few.
    path: "/changelog",
    name: "changelog",
    component: ChangelogIndexView,
  },
  {
    // One update's permalink: src/content/roadmap/updates/<date>.md.
    path: "/changelog/:date",
    name: "changelog-entry",
    component: ChangelogEntryView,
    props: true,
  },
  {
    path: "/curriculum",
    name: "curriculum",
    component: CurriculumView,
    meta: { copy: true },
  },
  {
    // A live lesson for a reader: LessonView's preview mode records nothing.
    // `bare`: no course header (App.vue) — the lesson gets the whole screen,
    // and LessonView floats its own way back.
    path: "/curriculum/lesson/:lessonId",
    name: "curriculum-lesson",
    component: LessonView,
    props: (route) => ({ lessonId: String(route.params.lessonId), preview: true }),
    meta: { bare: true },
  },
  {
    // Short links for character-limited posts: /c/l/bed or /c/l/1a → that
    // lesson's preview; unknown keys → /curriculum. Ids are durable, display
    // numbers aren't (see services/lessonShortLinks.ts).
    path: "/c/l/:key",
    redirect: (to) => {
      const lessonId = resolveLessonShortKey(String(to.params.key));
      return lessonId
        ? { name: "curriculum-lesson", params: { lessonId } }
        : { name: "curriculum" };
    },
  },
  {
    // The Learning Engine (was How It Works, renamed 2026-10-06 beside
    // /curriculum). The old paths stay as aliases: shared links and the
    // landing chips' #anchors keep working.
    path: "/learning-engine",
    alias: ["/how-it-works", "/pedagogy"],
    name: "learning-engine",
    component: PedagogyView,
    meta: { copy: true },
  },
  {
    // The exercises, live (2026-11-12): the third page beside /curriculum
    // and /learning-engine. Landing chips deep-link by #id (/exercises#wst).
    path: "/exercises",
    alias: ["/questions"],
    name: "exercises",
    component: ExercisesView,
    meta: { copy: true },
  },
  {
    path: "/study",
    name: "study",
    component: StudyHubView,
  },
  {
    path: "/study/practice",
    name: "study-practice",
    component: StudyPracticeView,
  },
  {
    path: "/study/lesson/:lessonId",
    name: "study-lesson",
    component: LessonView,
    props: true,
  },
  {
    path: "/lessons",
    name: "lessons",
    component: LessonsView,
  },
  {
    path: "/peek",
    name: "peek",
    component: PeekView,
  },
  {
    // The annotated-internals demo. Canonical `/tech-demo` (2026-10-09; site
    // links point here). `/showHN` was the original (it reads better as an HN
    // submission link) and stays as an alias, as does `/showhn` for hand-typed
    // URLs. Every path here must also be in peekNamespace.routeNamespace, or it
    // lands in the wrong guest DB. Deliberately absent from
    // `authRequiredRoutes` — ungated is the whole point.
    path: "/tech-demo",
    alias: ["/showHN", "/showhn"],
    name: "showHN",
    component: ShowHNView,
  },
  {
    path: "/progress",
    name: "progress",
    component: ProgressView,
  },
  {
    path: "/browse",
    name: "browse",
    component: BrowseView,
  },
  {
    // The printable (services/fridgeSheet.ts). `/fridge` is the short form
    // printed on the sheet itself. Public: the landing page links here.
    path: "/fridge-sheet",
    alias: "/fridge",
    name: "fridge-sheet",
    component: FridgeSheetView,
    meta: { copy: true },
  },
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { copy: true },
  },
  {
    path: "/register",
    alias: "/signup",
    name: "Register",
    component: SignUpView,
    meta: { copy: true },
  },
  {
    path: "/goonup",
    name: "goonup",
    component: GoonupView,
    meta: { copy: true },
  },
  {
    // Linkable mailing-list page, for referrers outside the SPA (blog post
    // footers, HN, etc.). `/subscribe` aliased because it's the more guessable
    // of the two. NOT a waitlist — signups are open; this is just the list.
    path: "/newsletter",
    alias: "/subscribe",
    name: "newsletter",
    component: NewsletterView,
    meta: { copy: true },
  },
  {
    // Generic cohort invite: /join/<token>. The token is validated against
    // the backend allowlist before the signup form renders; on redemption it
    // comps the new account to paid instead of starting the normal trial. Use
    // a bespoke view like GoonupView instead when a cohort needs custom copy.
    path: "/join/:token",
    name: "join",
    component: JoinView,
    meta: { copy: true },
  },
  {
    path: "/pei",
    name: "pei",
    component: PEIView,
    meta: { copy: true },
  },
  {
    path: "/verify",
    name: "verify",
    component: VerifyAccountView,
    meta: { copy: true },
  },
  {
    path: "/request-reset",
    name: "request-reset",
    component: RequestResetView,
    meta: { copy: true },
  },
  {
    path: "/reset-password",
    name: "reset-password",
    component: ResetPasswordView,
    meta: { copy: true },
  },
  {
    path: "/account",
    name: "account",
    component: AccountView,
  },
  {
    // The free tier's ceiling, reported as an arrival. Nothing redirects here
    // — it is linked from the hub banner and the session-end nudge. `/keep-building`
    // is kept as an alias so the trial era's links (lifecycle emails already
    // sent, bookmarks) land somewhere coherent rather than 404ing.
    path: "/milestone",
    alias: "/keep-building",
    name: "milestone",
    component: MilestoneView,
  },
  {
    path: "/sync-error",
    name: "sync-error",
    component: HydrationErrorView,
  },
  {
    path: "/u/:username",
    name: "UserSettings",
    component: UserSettingsView,
  },
  // The deployment's own routes, e.g. checkout, payment return and gifting
  // (src/deployment/).
  ...(deployment.routes ?? []),
  {
    path: "/logo-export",
    name: "logo-export",
    component: LogoExporter,
  },
  // Dev-only render harnesses consumed by scripts/export-letterpeople and
  // scripts/export-email-cta. Lazy-loaded + gated to import.meta.env.DEV so
  // they're tree-shaken from prod.
  ...(import.meta.env.DEV
    ? [
        {
          path: "/__letter-export",
          name: "letter-export",
          component: () => import("../views/__LetterExport.vue"),
        } as RouteRecordRaw,
        {
          path: "/__cta-export",
          name: "cta-export",
          component: () => import("../views/__CtaExport.vue"),
        } as RouteRecordRaw,
      ]
    : []),
  // Debug routes — DEV-only. Vite replaces `import.meta.env.DEV` with `false`
  // in prod builds, which lets Rollup tree-shake `debugRoutes` and all 51
  // statically-imported dbg components out of the bundle (~130 KB gzip).
  // Admin-surfaced dbg views (e.g. /admin/audio-listener) import their
  // components directly, so they're unaffected by this gate.
  ...(import.meta.env.DEV ? debugRoutes : []),
  // Onboarding routes
  {
    path: "/onboarding",
    name: "onboarding",
    alias: "/welcome",
    redirect: "/onboarding/age",
  },
  {
    path: "/onboarding/age",
    alias: "/welcome/age",
    name: "onboarding-age",
    component: OnboardingAge,
  },
  {
    path: "/onboarding/preferences",
    alias: "/welcome/preferences",
    name: "onboarding-preferences",
    component: OnboardingPreferences,
  },
  {
    path: "/onboarding/names",
    alias: "/welcome/names",
    name: "onboarding-names",
    component: OnboardingNames,
  },
  {
    path: "/onboarding/sensitive",
    alias: "/welcome/sensitive",
    name: "onboarding-sensitive",
    component: OnboardingSensitive,
  },
  {
    path: "/onboarding/decorations",
    alias: "/welcome/decorations",
    name: "onboarding-decorations",
    component: OnboardingDecorations,
  },
  {
    path: "/admin",
    component: AdminLayout,
    children: [
      {
        path: "",
        name: "AdminIndex",
        component: AdminIndexView,
      },
      {
        path: "register-questions",
        name: "AdminRegisterQuestions",
        component: AdminRegisterQuestionsView,
      },
      {
        path: "content",
        name: "AdminContent",
        component: AdminContentView,
      },
      {
        path: "users/:username/progress",
        name: "AdminUserProgress",
        component: AdminUserProgressView,
        props: true,
      },
      {
        path: "users/:username/cards",
        name: "AdminUserCards",
        component: AdminViewSwitch,
        props: true,
        meta: { lpView: AdminUserCardHistoryView, fwMode: "cards" },
      },
      {
        path: "users/:username/spelling",
        name: "AdminUserSpelling",
        component: AdminUserSpellingView,
        props: true,
      },
      {
        path: "users/:username/sessions",
        name: "AdminUserSessions",
        component: AdminViewSwitch,
        props: true,
        meta: { lpView: AdminUserSessionsView, fwMode: "sessions" },
      },
      {
        path: "users/:username/sessions/:sessionId",
        name: "AdminUserSessionDetail",
        component: AdminViewSwitch,
        props: true,
        meta: { lpView: AdminUserSessionDetailView, fwMode: "session" },
      },
      {
        // Framework only: the course pipeline with this learner's run stats.
        path: "users/:username/pipeline",
        name: "AdminUserPipeline",
        component: FwLearnerView,
        props: { mode: "pipeline" },
      },
      {
        // A read-only pipeline run for this learner, as their next session would start.
        path: "users/:username/pipeline-run",
        name: "AdminUserPipelineRun",
        component: AdminUserPipelineRunView,
      },
      {
        // Framework only: the learner's per-tag ELO.
        path: "users/:username/elo",
        name: "AdminUserElo",
        component: FwLearnerView,
        props: { mode: "elo" },
      },
      {
        path: "audio-listener",
        name: "AdminAudioListener",
        component: AudioListenerDbg,
      },
      // The deployment's admin views (src/deployment/).
      ...(deployment.adminRoutes ?? []),
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    // Same page, new query (e.g. /curriculum's ?age): the page keeps its place
    if (to.path === from.path && to.hash === from.hash) return false;
    // Anchor links (e.g. /learning-engine#srs). scrollBehavior runs after the
    // route component renders, so the target exists if it ever will; `top`
    // clears the app bar, or the target's own scroll-margin-top if larger
    // (/curriculum's lesson sections also clear its sticky legend bar).
    // Unknown hash → same as no hash (top of page).
    const target = to.hash ? document.querySelector(to.hash) : null;
    if (target) {
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      return { el: to.hash, top: Math.max(80, margin) };
    }
    return { top: 0 };
  },
});

// Routes that read the user's own saved state (progress, lesson history, ELO).
// If the local mirror of that state was never populated, these render an
// existing learner as a brand-new one — see the hydration guard below.
const userStateRoutes = [
  "study",
  "study-practice",
  "study-lesson",
  "progress",
  "browse",
  "account",
];

// Routes that require a signed-in (non-guest) user; redirect to /login otherwise.
// NOTE: /progress is deliberately NOT here — guests who have done work must see
// their progress (sale point + the session-summary link to it). /progress
// instead redirects only when there's no data to show; see ProgressView.
const authRequiredRoutes = ["account"];

// Checkout and gift purchase — never inside the Play Store app. (Gift *claims*
// stay open: redeeming isn't buying.)
const androidAppBlockedRoutes = ["checkout", "gift", "gift-return"];

// Navigation guards
router.beforeEach(async (to, from, next) => {
  // App update guard: a newly deployed build is waiting (services/pwa.ts).
  // Moving to a different page is the safe moment to switch, so this
  // navigation finishes as a full page load on the new build. Query-only
  // changes (e.g. /curriculum's ?age) don't count as leaving the page.
  if (from.name !== undefined && to.path !== from.path && applyUpdateOnNavigation(to.fullPath)) {
    console.log('[pwa] Update ready, loading new build at', to.fullPath);
    return; // do not call next() — page is reloading
  }

  // Guest-namespace boundary guard: crossing between /peek, /showHN and the
  // rest of the app means swapping the singleton guest user. Cheapest reliable
  // way to swap is a full reload; see services/peekNamespace.ts.
  //
  // Skip on initial navigation (from.name === undefined): the data layer was
  // already initialized with the correct UUID for the entry route via
  // main.ts:syncGuestUUIDForRoute().
  if (from.name !== undefined && routeNamespace(to.path) !== routeNamespace(from.path)) {
    console.log('[guest-ns] Boundary crossing, hard-reloading to', to.fullPath);
    window.location.assign(to.fullPath);
    return; // do not call next() — page is reloading
  }

  // The Play Store app sells nothing (services/androidApp.ts): its purchase
  // prompts are hidden, and this catches any other way into the buy pages.
  if (to.name && androidAppBlockedRoutes.includes(to.name as string) && isAndroidApp()) {
    return next({ path: "/study" });
  }

  // Hydration guard: this device has never pulled the signed-in account's data
  // and couldn't do so at startup, so every local read answers "nothing here".
  //
  // Rendering the study hub off that would show a returning learner the
  // new-user state (Practice disabled, intro lesson queued) — and anything they
  // did from there would be computed against empty state and lost when sync
  // resumed. Send them somewhere honest and retryable instead.
  //
  // Guests are unaffected: they have no remote, so hydration reports
  // 'not-required'.
  //
  // awaitHydration() rather than hydrationStatus(): navigating here while a
  // login is still pulling would otherwise sample 'hydrating' and fall
  // through to exactly the render this guard exists to prevent. Waiting costs
  // nothing on the normal paths, where init() has already settled before any
  // navigation can occur.
  if (to.name && userStateRoutes.includes(to.name as string)) {
    try {
      const { getDataLayer } = await import("@vue-skuilder/db");
      const status = await getDataLayer().getUserDB().awaitHydration();

      if (status.state === "failed") {
        console.warn("[Router] User data unavailable on this device:", status.error);
        return next({ path: "/sync-error", query: { redirect: to.fullPath } });
      }
    } catch (e) {
      // Never let the guard itself become the thing that blocks navigation.
      console.warn("[Router] Could not read hydration status:", e);
    }
  }

  // All /admin/* routes require admin user (username === 'admin', thin client-side check)
  if (to.path.startsWith('/admin')) {
    const authStore = useAuthStore();
    const user = await authStore.currentUser;

    if (!user || user.getUsername() !== 'admin') {
      return next({
        path: '/login',
        query: { redirect: to.fullPath },
      });
    }
  }

  // Routes that require a real (non-guest) login. Deep links here — e.g. a
  // lifecycle-email link opened on a parent's device that isn't signed in —
  // must land on /login with a loopback + username prefill, not render blank.
  if (to.name && authRequiredRoutes.includes(to.name as string)) {
    const authStore = useAuthStore();
    const user = await authStore.currentUser;
    const username = user?.getUsername();
    const loggedIn = !!username && !username.startsWith("sk-guest-");

    if (!loggedIn) {
      const query: Record<string, string> = { redirect: to.fullPath };
      // Forward a ?username= hint (if present) so /login can prefill it.
      const hint = to.query.username;
      if (typeof hint === "string" && hint) query.username = hint;
      return next({ path: "/login", query });
    }
  }

  // NO entitlement check here, deliberately.
  //
  // Under the reachable-words model
  // study is never blocked: an unpaid account that has passed the free-tier
  // word ceiling keeps practising everything already introduced, forever.
  // Only the supply of NEW content is withheld, and that happens where the
  // supply is chosen — IntroGateFilter (new GPC intros) and StudyHubView
  // (new lessons) — not at the door.
  //
  // The former trial guard redirected expired accounts to /keep-building from
  // here. Reinstating any route-level paywall would break the promise the
  // model is built on, so it is gone rather than adapted.
  next();
});

// What the landing page goes without, and every other route may need: the
// course's question types and LP's navigators (services/courseware.ts), and
// the Vuetify components the landing page doesn't render
// (services/vuetifyDeferred.ts). The landing page starts loading both on the
// visitor's first interaction (LandingPage.vue). A failed chunk load here
// reaches router.onError below like any other.
router.beforeEach(async (to) => {
  if (to.name !== "home") await Promise.all([ensureCourseware(), ensureDeferredVuetify()]);
});

// A page's code failed to load — almost always because a deploy removed the
// build this tab is running. Finish the navigation as a full load on the new
// build instead of leaving a dead tap. See services/pwa.ts.
router.onError((error, to) => {
  if (!isStaleChunkError(error)) return;
  if (recoverFromStaleBuild(to.fullPath)) {
    console.warn('[pwa] Chunk load failed (stale build?), reloading at', to.fullPath, error);
  }
});

// Per-route <head>: title, description, preview tags, canonical, noindex for
// non-public routes. See services/pageMeta.ts.
router.afterEach((to, _from, failure) => {
  if (!failure) applyPageMeta(resolvePageMeta(to));
});

// GoatCounter SPA tracking - track client-side navigations
router.afterEach((to, _from, failure) => {
  if (!failure) clearStaleBuildRecovery();

  // Skip tracking for debug and admin routes
  if (to.path.startsWith('/dbg') || to.path.startsWith('/admin')) return;

  // GoatCounter exposes window.goatcounter when loaded
  const gc = (window as unknown as { goatcounter?: { count: (vars: { path: string }) => void } }).goatcounter;
  if (gc?.count) {
    // Redact one-time tokens embedded in the path (e.g. /join/<token>,
    // /gift/claim/<token>) so they never reach GoatCounter's dashboard. A gift
    // token is a bearer credential — leaking it into analytics would hand the
    // gift to anyone with dashboard access. Keep in sync with the
    // window.goatcounter.path redaction in index.html.
    const path = to.path
      .replace(/^\/join\/.+/, '/join/[redacted]')
      .replace(/^\/gift\/claim\/.+/, '/gift/claim/[redacted]');
    gc.count({ path });
  }
});

export default router;