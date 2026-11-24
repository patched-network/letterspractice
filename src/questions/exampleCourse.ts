import { CourseWare } from "@vue-skuilder/courseware";
import { SpellingQuestion } from "./SpellingQuestion";
import { WhoSaidThat } from "./WhoSaidThat";
import { WordSelection } from "./WordSelection";
import { MissingLetters } from "./MissingLetters";
import { GpcIntro } from "./GpcIntro";
import { DigraphGpcIntro } from "./DigraphGpcIntro";
import { SplitDigraphIntro } from "./SplitDigraphIntro";
import { SightWordIntro } from "./SightWordIntro";

export const exampleCourse = new CourseWare("ExampleCourse", [
  SpellingQuestion,
  WhoSaidThat,
  WordSelection,
  MissingLetters,
  DigraphGpcIntro,    // before GpcIntro — framework's fuzzy getQuestion() matches "GpcIntro".includes in "DigraphGpcIntro"
  SplitDigraphIntro,
  SightWordIntro,
  GpcIntro,
]);