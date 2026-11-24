/**
 * Tag Utility Module
 *
 * Provides tag construction, parsing, per-question-type tag computation,
 * and shared deterministic content-labelling helpers for the navigation
 * pipeline's filter/generator system.
 */

// GPC/content labelling construction & parsing
export {
  GPC_PREFIX,
  CARD_PREFIX_INTRO,
  CARD_PREFIX_DIGRAPH_INTRO,
  CARD_PREFIX_SPLIT_INTRO,
  CARD_PREFIX_SIGHT_INTRO,
  CARD_PREFIX_WST,
  CARD_PREFIX_WST_FG,
  CARD_PREFIX_ML,
  CARD_PREFIX_SPELLING,
  GPC_TAG_PREFIX,
  gpcTag,
  gpcShortId,
  gpcIntroTag,
  gpcExerciseTag,
  gpcExposeTag,
  tagToGpcId,
  tagRole,
  isGpcTag,
  parseGpcTag,
  gpcIdFromShortId,
  asGpcId,
  asGpcShortId,
  gpcIntroCardId,
  digraphGpcIntroCardId,
  splitDigraphIntroCardId,
  sightWordIntroCardId,
  whoSaidThatCardId,
  whoSaidThatFocusGroupCardId,
  missingLettersCardId,
  spellingCardId,
  isGpcIntroCardId,
  isSplitDigraphIntroCardId,
  isDigraphGpcIntroCardId,
  isSightWordIntroCardId,
  isWhoSaidThatCardId,
  isWhoSaidThatFocusGroupCardId,
  parseGpcIntroCardId,
  parseDigraphGpcIntroCardId,
  parseSplitDigraphIntroCardId,
  parseSightWordIntroCardId,
  parseWhoSaidThatCardId,
  parseDeterministicGpcCardId,
  type GpcId,
  type GpcShortId,
  type GpcRole,
  type GpcTag,
  type IntroTag,
  type ExerciseTag,
  type ExposeTag,
  type GpcIntroCardId,
  type DigraphGpcIntroCardId,
  type SplitDigraphIntroCardId,
  type SightWordIntroCardId,
  type WhoSaidThatCardId,
  type WhoSaidThatFocusGroupCardId,
  type MissingLettersCardId,
  type SpellingCardId,
  type DeterministicGpcCardId,
  type ParsedGpcTag,
  type ParsedGpcIntroCardId,
  type ParsedDigraphGpcIntroCardId,
  type ParsedWhoSaidThatCardId,
  type ParsedDeterministicGpcCardId,
} from '../contentLabelling';

// Catalogue-backed lookup helpers
export {
  graphemeToGpcId,
  exactGraphemeToGpcId,
  getGpcEntry,
  sightWordGpcId,
} from './gpcCatalogue';

// Concept tag derivation
export {
  conceptTagsForGpc,
  conceptTagsForFields,
  CONCEPT_TAGS,
  CONCEPT_TAG_SET,
  type ConceptTag,
} from './conceptTags';

// Per-question-type tag computation
export {
  tagSpellingQuestion,
  tagWhoSaidThat,
  tagWordSelection,
  tagVignette,
  UI_TAG_SPELLING,
  UI_TAG_WHO_SAID_THAT,
  UI_TAG_WORD_SELECTION,
  UI_TAG_VIGNETTE,
} from './questionTags';