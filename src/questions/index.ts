// Library entry point for custom questions in standalone-ui
// This file exports question types and components for consumption by studio-ui

import { CourseWare, Question } from "@vue-skuilder/courseware";
import { DataShape } from "@vue-skuilder/common";
import { ViewComponent } from "@vue-skuilder/common-ui";
import { markRaw } from "vue";

// Export example course
export { exampleCourse } from "./exampleCourse";

// Export custom question classes
export { SpellingQuestion } from "./SpellingQuestion";
export { WhoSaidThat } from "./WhoSaidThat";
export { WordSelection } from "./WordSelection";
export { MissingLetters } from "./MissingLetters";
export { GpcIntro } from "./GpcIntro";
export { DigraphGpcIntro } from "./DigraphGpcIntro";
export { SplitDigraphIntro } from "./SplitDigraphIntro";
export { SightWordIntro } from "./SightWordIntro";

// Export shared utilities
export * from "./shared";

// Import classes for analysis
import { exampleCourse } from "./exampleCourse";

// Import custom question classes
import { SpellingQuestion } from "./SpellingQuestion";
import { WhoSaidThat } from "./WhoSaidThat";
import { WordSelection } from "./WordSelection";
import { MissingLetters } from "./MissingLetters";
import { GpcIntro } from "./GpcIntro";
import { DigraphGpcIntro } from "./DigraphGpcIntro";
import { SplitDigraphIntro } from "./SplitDigraphIntro";
import { SightWordIntro } from "./SightWordIntro";

// Import view components
import SpellingQuestionView from "./SpellingQuestionView.vue";
import WhoSaidThatView from "./WhoSaidThatView.vue";
import WordSelectionView from "./WordSelectionView.vue";
import MissingLettersView from "./MissingLettersView.vue";
import GpcIntroView from "./GpcIntroView.vue";
import DigraphGpcIntroView from "./DigraphGpcIntroView.vue";
import SplitDigraphIntroView from "./SplitDigraphIntroView.vue";
import SightWordIntroView from "./SightWordIntroView.vue";

// Set up views to avoid circular dependency
// Views should be the Vue components directly - they have a .name property
SpellingQuestion.views = [markRaw(SpellingQuestionView)];

WhoSaidThat.views = [markRaw(WhoSaidThatView)];

WordSelection.views = [markRaw(WordSelectionView)];

MissingLetters.views = [markRaw(MissingLettersView)];

GpcIntro.views = [markRaw(GpcIntroView)];

DigraphGpcIntro.views = [markRaw(DigraphGpcIntroView)];

SplitDigraphIntro.views = [markRaw(SplitDigraphIntroView)];

SightWordIntro.views = [markRaw(SightWordIntroView)];

/**
 * Main function to export all custom questions for studio-ui consumption
 * This provides a standardized interface for the CLI to discover and integrate
 * custom question types into studio-ui builds
 */
export function allCustomQuestions() {
  // Collect all question classes
  const questionClasses: (typeof Question)[] = [
    SpellingQuestion,
    WhoSaidThat,
    WordSelection,
    MissingLetters,
    GpcIntro,
    DigraphGpcIntro,
    SplitDigraphIntro,
    SightWordIntro,
  ];

  // Collect all data shapes from questions
  const dataShapes: DataShape[] = [];
  questionClasses.forEach((questionClass) => {
    if (questionClass.dataShapes) {
      questionClass.dataShapes.forEach((shape) => {
        // Avoid duplicates
        if (!dataShapes.find((existing) => existing.name === shape.name)) {
          dataShapes.push(shape);
        }
      });
    }
  });

  // Collect all view components from questions
  const views: ViewComponent[] = [];
  questionClasses.forEach((questionClass) => {
    if (questionClass.views) {
      questionClass.views.forEach((view) => {
        // Avoid duplicates by name
        if (!views.find((existing) => existing.name === view.name)) {
          views.push(view);
        }
      });
    }
  });

  const courses = [exampleCourse];

  // Return structured data for studio-ui integration
  return {
    // CourseWare instances with question instances
    courses,

    // Question class constructors for registration
    questionClasses,

    // Available data shapes for studio-ui CreateCardView
    dataShapes,

    // Vue components for runtime registration
    views,

    // Metadata for debugging and analysis
    meta: {
      questionCount: questionClasses.length,
      dataShapeCount: dataShapes.length,
      viewCount: views.length,
      courseCount: courses.length,
      packageName: "@vue-skuilder/standalone-ui",
      sourceDirectory: "src/questions",
    },
  };
}

/**
 * Type definitions for the custom questions export structure
 * This provides TypeScript support for CLI and studio-ui integration
 */
export interface CustomQuestionsExport {
  courses: CourseWare[];
  questionClasses: Array<// typeof SimpleTextQuestion | typeof MultipleChoiceQuestion | typeof NumberRangeQuestion
  Question>;
  dataShapes: DataShape[];
  views: ViewComponent[];
  meta: {
    questionCount: number;
    dataShapeCount: number;
    viewCount: number;
    courseCount: number;
    packageName: string;
    sourceDirectory: string;
  };
}

// Default export for convenience
export default allCustomQuestions;

/**

TODO:

this branch is following vue-skuilder work in https://github.com/patched-network/vue-skuilder/pull/1029

2024-12-30 UPDATE:
Debug logging confirmed allCustomQuestions() and processCustomQuestionsData() are working correctly:
- questionClasses: 3 (SpellingQuestion, WhoSaidThat, WordSelection)
- dataShapes: 3 (SpellingQuestion, WhoSaidThat, WordSelection shapes)
- views: 3 (SpellingQuestionView, WhoSaidThatView, WordSelectionView)

REMAINING:
- permission: route renders without login, should require `admin` username
- verify in production that registration actually works with CouchDB

*/
