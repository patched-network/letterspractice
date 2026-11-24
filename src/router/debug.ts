import { RouteRecordRaw } from "vue-router";

// Lazy, every one: router/index.ts adds these routes only in dev, but it
// imports this file in every build, and a static import here kept whatever
// those debug views import that has top-level side effects (the lessons
// registry, question views, progress reports) in production's entry chunk. As dynamic imports they're separate chunks
// that a production build never fetches.
const DebugIndex = () => import("../dbg/DebugIndex.vue");
const DebugLayout = () => import("../dbg/DebugLayout.vue");
const ThemeView = () => import("../views/ThemeView.vue");
const LetterPeopleDebug = () => import("../dbg/LetterPeopleDebug.vue");
const WordsDebug = () => import("../dbg/WordsDebug.vue");
const WordPlayground = () => import("../dbg/WordPlayground.vue");
const WordDisplayTest = () => import("../dbg/WordDisplayTest.vue");
const TransformTest = () => import("../dbg/TransformTest.vue");
const TransformPlayground = () => import("../dbg/TransformPlayground.vue");
const PhoneticWordDebug = () => import("../dbg/PhoneticWordDebug.vue");
const AnimationsDebug = () => import("../dbg/AnimationsDebug.vue");
const JugglingDebug = () => import("../dbg/JugglingDebug.vue");
const JugglingPersistentDebug = () => import("../dbg/JugglingPersistentDebug.vue");
const CrossActorTransferDebug = () => import("../dbg/CrossActorTransferDebug.vue");
const PhysicsDebug = () => import("../dbg/PhysicsDebug.vue");
const SiteswapPhysicsDebug = () => import("../dbg/SiteswapPhysicsDebug.vue");
const ArmsDebug = () => import("../dbg/ArmsDebug.vue");
const ExpressionsDebug = () => import("../dbg/expressions/ExpressionsDebug.vue");
const LocomotionDebug = () => import("../dbg/locomotion/LocomotionDebug.vue");
const CheckoutDebug = () => import("../dbg/CheckoutDebug.vue");
const DebugAuthView = () => import("../dbg/DebugAuthView.vue");
const ProgressiveKeyboardDebug = () => import("../dbg/ProgressiveKeyboardDebug.vue");
const KeyboardContextDebug = () => import("../dbg/KeyboardContextDebug.vue");
const DeviceDetectionDebug = () => import("../dbg/DeviceDetectionDebug.vue");
const SceneStagingDebug = () => import("../dbg/SceneStagingDebug.vue");
const ColorUtilsDebug = () => import("../dbg/ColorUtilsDebug.vue");
const AnimationSequencesDebug = () => import("../dbg/animations/AnimationSequencesDebug.vue");
const PracticeVignettesDbg = () => import("../dbg/practicing/PracticeVignettesDbg.vue");
const FlossDebug = () => import("../dbg/FlossDebug.vue");
const LegsDebug = () => import("../dbg/LegsDebug.vue");
const AudioListenerDbg = () => import("../dbg/AudioListenerDbg.vue");

const KeyboardContainerLayout = () => import("../dbg/KeyboardContainerLayout.vue");
const Poster = () => import("../dbg/poster/Poster.vue");
const FamilyPortraitDbg = () => import("../dbg/FamilyPortraitDbg.vue");
const EchoChild = () => import("../dbg/kbc/EchoChild.vue");
const PhoneticWordChild = () => import("../dbg/kbc/PhoneticWordChild.vue");

// Question type debug views
const SpellingQuestionDbg = () => import("../dbg/questions/SpellingQuestionDbg.vue");
const WhoSaidThatDbg = () => import("../dbg/questions/WhoSaidThatDbg.vue");
const WordSelectionDbg = () => import("../dbg/questions/WordSelectionDbg.vue");
const MissingLettersDbg = () => import("../dbg/questions/MissingLettersDbg.vue");
const GpcIntroQuestionDbg = () => import("../dbg/questions/GpcIntroDbg.vue");
const DigraphGpcIntroDbg = () => import("../dbg/questions/DigraphGpcIntroDbg.vue");
const SplitDigraphIntroDbg = () => import("../dbg/questions/SplitDigraphIntroDbg.vue");
const SightWordIntroDbg = () => import("../dbg/questions/SightWordIntroDbg.vue");
const LessonDebug = () => import("../dbg/LessonDebug.vue");
const LessonReportDebug = () => import("../dbg/LessonReportDebug.vue");
const ProgressView = () => import("../views/ProgressView.vue");
const ReachableWordsDbg = () => import("../dbg/ReachableWordsDbg.vue");
const ContextualPhonemeDbg = () => import("../dbg/ContextualPhonemeDbg.vue");
const SpellingGraderDbg = () => import("../dbg/SpellingGraderDbg.vue");

// Session end debug views
const SessionSummaryDebug = () => import("../dbg/SessionSummaryDebug.vue");
const SessionEndScreenDebug = () => import("../dbg/SessionEndScreenDebug.vue");

// App screen debug views
const StudyHubDbg = () => import("../dbg/StudyHubDbg.vue");
const MilestoneDbg = () => import("../dbg/MilestoneDbg.vue");
const ThinkingDotsDbg = () => import("../dbg/ThinkingDotsDbg.vue");
const HubScenesDbg = () => import("../dbg/HubScenesDbg.vue");
const PropSceneDbg = () => import("../dbg/PropSceneDbg.vue");
const ChessboardSceneDbg = () => import("../dbg/ChessboardSceneDbg.vue");

/**
 * Debug routes for component testing and development
 *
 * These routes provide interactive playgrounds for all major components.
 * Should be disabled or removed in production builds.
 */
export const debugRoutes: RouteRecordRaw[] = [
  {
    path: "/dbg",
    name: "debug-index",
    component: DebugIndex,
  },
  {
    path: "/dbg",
    component: DebugLayout,
    children: [
      {
        path: "theme",
        name: "theme",
        component: ThemeView,
      },
      {
        path: "poster",
        name: "poster-default",
        component: Poster,
        props: { variant: "default" },
      },
      {
        path: "poster/pei",
        name: "poster-pei",
        component: Poster,
        props: { variant: "pei" },
      },
      {
        path: "lp",
        name: "letterpeople",
        component: LetterPeopleDebug,
      },
      {
        path: "family",
        name: "family-portrait",
        component: FamilyPortraitDbg,
      },
      {
        path: "words",
        name: "words-debug",
        component: WordsDebug,
      },
      {
        path: "playground",
        name: "word-playground",
        component: WordPlayground,
      },
      {
        path: "wordcomponent",
        name: "word-component",
        component: WordDisplayTest,
      },
      {
        path: "transforms",
        name: "transform-test",
        component: TransformTest,
      },
      {
        path: "transform-playground",
        name: "transform-playground",
        component: TransformPlayground,
      },
      {
        path: "phonetic-word",
        name: "phonetic-word-debug",
        component: PhoneticWordDebug,
      },
      {
        path: "animations",
        name: "animations-debug",
        component: AnimationsDebug,
      },
      {
        path: "animation-sequences",
        name: "animation-sequences-debug",
        component: AnimationSequencesDebug,
      },
      {
        path: "juggling",
        name: "juggling-debug",
        component: JugglingDebug,
      },
      {
        path: "juggling-persistent",
        name: "juggling-persistent-debug",
        component: JugglingPersistentDebug,
      },
      {
        path: "ball-transfer",
        name: "ball-transfer-debug",
        component: CrossActorTransferDebug,
      },
      {
        path: "physics",
        name: "physics-debug",
        component: PhysicsDebug,
      },
      {
        path: "siteswap-physics",
        name: "siteswap-physics-debug",
        component: SiteswapPhysicsDebug,
      },
      {
        path: "arms",
        name: "arms-debug",
        component: ArmsDebug,
      },
      {
        path: "expressions",
        name: "expressions-debug",
        component: ExpressionsDebug,
      },
      {
        path: "locomotion",
        name: "locomotion-debug",
        component: LocomotionDebug,
      },
      {
        path: "checkout",
        name: "checkout-debug",
        component: CheckoutDebug,
      },
      {
        path: "auth",
        name: "debug-auth",
        component: DebugAuthView,
      },
      {
        path: "keyboard",
        name: "keyboard-debug",
        component: ProgressiveKeyboardDebug,
      },
      {
        path: "keyboard-context",
        name: "keyboard-context-debug",
        component: KeyboardContextDebug,
      },
      {
        path: "device-detection",
        name: "device-detection-debug",
        component: DeviceDetectionDebug,
      },
      {
        path: "scene",
        name: "scene-staging-debug",
        component: SceneStagingDebug,
      },
      {
        path: "color-utils",
        name: "color-utils-debug",
        component: ColorUtilsDebug,
      },
      {
        path: "practicing",
        name: "practice-vignettes-debug",
        component: PracticeVignettesDbg,
      },
      {
        path: "floss",
        name: "floss-debug",
        component: FlossDebug,
      },
      {
        path: "legs",
        name: "legs-debug",
        component: LegsDebug,
      },
      {
        // Lazy: keeps three.js in its own chunk
        path: "three",
        name: "three-letters-spike",
        component: () => import("../dbg/ThreeLettersSpike.vue"),
      },
      {
        path: "audio-listener",
        name: "audio-listener-debug",
        component: AudioListenerDbg,
      },
      {
        path: "session-summary",
        name: "session-summary-debug",
        component: SessionSummaryDebug,
      },
      {
        path: "session-end",
        name: "session-end-debug",
        component: SessionEndScreenDebug,
      },
      {
        path: "study-hub",
        name: "study-hub-debug",
        component: StudyHubDbg,
      },
      {
        // Entitlement wall: the hub banner + /milestone at any point on the
        // reachable-words curve. Both states are otherwise hours of study away.
        path: "milestone",
        name: "milestone-debug",
        component: MilestoneDbg,
      },
      {
        path: "thinking-dots",
        name: "thinking-dots-debug",
        component: ThinkingDotsDbg,
      },
      {
        path: "hub-scenes",
        name: "hub-scenes-debug",
        component: HubScenesDbg,
      },
      {
        path: "prop-scene",
        name: "prop-scene-debug",
        component: PropSceneDbg,
      },
      {
        path: "chessboard",
        name: "chessboard-scene-debug",
        component: ChessboardSceneDbg,
      },
      {
        path: "progress",
        name: "progress-debug",
        component: ProgressView,
      },
      {
        path: "reachable-words",
        name: "reachable-words-debug",
        component: ReachableWordsDbg,
      },
      {
        path: "contextual-phoneme",
        name: "contextual-phoneme-debug",
        component: ContextualPhonemeDbg,
      },
      {
        path: "grader",
        name: "spelling-grader-debug",
        component: SpellingGraderDbg,
      },
    ],
  },
  // Question type debug routes - these have their own layout with keyboard context
  {
    path: "/dbg/questions/spelling",
    name: "questions-spelling-debug",
    component: SpellingQuestionDbg,
  },
  {
    path: "/dbg/questions/who-said-that",
    name: "questions-who-said-that-debug",
    component: WhoSaidThatDbg,
  },
  {
    path: "/dbg/questions/word-selection",
    name: "questions-word-selection-debug",
    component: WordSelectionDbg,
  },
  {
    path: "/dbg/questions/missing-letters",
    name: "questions-missing-letters-debug",
    component: MissingLettersDbg,
  },
  {
    path: "/dbg/questions/gpc-intro",
    name: "questions-gpc-intro-debug",
    component: GpcIntroQuestionDbg,
  },
  {
    path: "/dbg/questions/digraph-gpc-intro",
    name: "questions-digraph-gpc-intro-debug",
    component: DigraphGpcIntroDbg,
  },
  {
    path: "/dbg/questions/split-digraph-intro",
    name: "questions-split-digraph-intro-debug",
    component: SplitDigraphIntroDbg,
  },
  {
    path: "/dbg/questions/sight-word-intro",
    name: "questions-sight-word-intro-debug",
    component: SightWordIntroDbg,
  },
  // Lesson debug - has its own keyboard context setup
  {
    path: "/dbg/lesson",
    name: "lesson-debug",
    component: LessonDebug,
  },
  {
    // Lazy: keeps three.js in its own chunk
    path: "/dbg/family/three",
    name: "family-three-debug",
    component: () => import("../dbg/FamilyPortrait3DDbg.vue"),
  },
  {
    // Lazy: keeps three.js in its own chunk
    path: "/dbg/lesson/three",
    name: "lesson-three-debug",
    component: () => import("../dbg/LessonThreeDbg.vue"),
  },
  {
    // Lazy: keeps three.js in its own chunk
    path: "/dbg/word-pictures",
    name: "word-pictures-debug",
    component: () => import("../dbg/wordPictures/WordPicturesDbg.vue"),
  },
  {
    // Lazy: keeps three.js in its own chunk
    path: "/dbg/word-pictures/styles",
    name: "word-picture-styles-debug",
    component: () => import("../dbg/wordPictures/PictureStylesDbg.vue"),
  },
  {
    // Tune touch replay's gesture reading (lessons/touchGesture.ts)
    path: "/dbg/lesson/gesture",
    name: "lesson-gesture-debug",
    component: () => import("../dbg/GestureDbg.vue"),
  },
  {
    path: "/dbg/lesson-reports",
    name: "lesson-report-debug",
    component: LessonReportDebug,
  },
  // Link-preview cards (og:image): the index of all of them, or one lesson's
  // or page's card alone, which scripts/export-og-cards.ts screenshots. Outside
  // DebugLayout and `bare` (no app header), so the page is just the card.
  {
    path: "/dbg/og",
    name: "og-cards",
    component: () => import("../dbg/OgCardsDbg.vue"),
    meta: { bare: true },
  },
  {
    path: "/dbg/og/lesson/:lessonId?",
    name: "og-lesson-cards",
    component: () => import("../dbg/OgCardsDbg.vue"),
    meta: { bare: true },
  },
  {
    // A page card (PAGE_OG_CARDS in components/curriculum/ogCard.ts): site,
    // fridge-sheet, exercises, curriculum, learning-engine
    path: "/dbg/og/page/:cardId",
    name: "og-page-card",
    component: () => import("../dbg/OgCardsDbg.vue"),
    meta: { bare: true },
  },
  // Keyboard Container Layout - provides keyboard context to child routes
  {
    path: "/dbg/kbc",
    component: KeyboardContainerLayout,
    children: [
      {
        path: "",
        redirect: "/dbg/kbc/echo",
      },
      {
        path: "echo",
        name: "kbc-echo",
        component: EchoChild,
      },
      {
        path: "phonetic",
        name: "kbc-phonetic",
        component: PhoneticWordChild,
      },
    ],
  },
];
