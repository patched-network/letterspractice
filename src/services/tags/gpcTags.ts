/**
 * GPC Tag Construction & Parsing
 *
 * Compatibility façade re-exporting the shared content labelling helpers.
 */

export {
  GPC_PREFIX,
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
  type GpcId,
  type GpcShortId,
  type GpcRole,
  type GpcTag,
  type IntroTag,
  type ExerciseTag,
  type ExposeTag,
  type ParsedGpcTag,
} from '../contentLabelling';

export {
  graphemeToGpcId,
  getGpcEntry,
} from './gpcCatalogue';