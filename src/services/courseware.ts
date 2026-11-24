/**
 * The course's question types and LP's pipeline filters, registered when first
 * needed instead of at boot.
 *
 * Study sessions, card browsing and the admin need the course in the
 * framework's `allCourseWare` (its question types, with their views) and LP's
 * navigators in the framework's registry. The landing page needs neither, and
 * registering them at boot put all eight question types, their views and the
 * filters' dependencies in the bundle every first visit downloads and runs
 * before anything shows.
 *
 * - The router awaits this before every route but the landing page
 *   (router/index.ts), so nothing that reads the registrations runs first.
 * - The landing page starts it on the visitor's first interaction
 *   (LandingPage.vue), so it's usually ready by the time they navigate.
 *
 * The navigator registry is a plain map, never reset, so registering after
 * initializeDataLayer is fine: it's read when a study session assembles its
 * pipeline.
 */
import { registerNavigator, NavigatorRole } from "@vue-skuilder/db";

let ready: Promise<void> | null = null;

export function ensureCourseware(): Promise<void> {
  ready ??= load().catch((err) => {
    ready = null; // a later navigation tries again
    throw err;
  });
  return ready;
}

async function load(): Promise<void> {
  const [
    { allCourseWare },
    { exampleCourse },
    { LetterGatingFilter },
    { LessonGateFilter },
    { IntroGateFilter },
    { SkillStalenessFilter },
    { RecentWeaknessFilter },
  ] = await Promise.all([
    // Imported here, not at the top: the router imports this file, so a
    // static import would put the framework's courseware package (and the
    // common-ui question components it pulls in) in every first load.
    // Destructured in its own .then, which Rollup can tree-shake; a bare
    // import() inside Promise.all hides which exports are used, and kept
    // the whole package (~1 MB).
    import("@vue-skuilder/courseware").then(({ allCourseWare }) => ({ allCourseWare })),
    // The barrel, not ./questions/exampleCourse: importing it runs the
    // late-binding view assignments (Question.views) in questions/index.ts,
    // without which card rendering fails in production builds.
    import("../questions"),
    // letter gating: which letters a learner has met
    import("./LetterGatingFilter"),
    // concept cards gated behind lesson completion/dismissal
    import("./LessonGateFilter"),
    // freezes NEW grapheme intros at the entitlement wall
    import("./IntroGateFilter"),
    // boosts practiced skills that haven't been seen lately
    import("./SkillStalenessFilter"),
    // gently boosts skills missed lately, across sessions
    import("./RecentWeaknessFilter"),
  ]);

  if (!allCourseWare.courses.includes(exampleCourse)) allCourseWare.courses.push(exampleCourse);

  // Consumer-defined navigators, so PipelineAssembler can classify them
  registerNavigator("letterGatingFilter", LetterGatingFilter, NavigatorRole.FILTER);
  registerNavigator("lessonGateFilter", LessonGateFilter, NavigatorRole.FILTER);
  registerNavigator("introGateFilter", IntroGateFilter, NavigatorRole.FILTER);
  registerNavigator("skillStalenessFilter", SkillStalenessFilter, NavigatorRole.FILTER);
  registerNavigator("recentWeaknessFilter", RecentWeaknessFilter, NavigatorRole.FILTER);
}
