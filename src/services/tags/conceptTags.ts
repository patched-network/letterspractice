/**
 * Concept tag derivation — app-side façade.
 *
 * The canonical implementation lives in the content pipeline's lib
 * (`content/phoneticAnalytics/lib/concept-tags.ts`) so that pipeline
 * scripts and the app share one category/matchType → concept mapping.
 */

export {
  CATEGORY_TO_CONCEPT,
  MATCH_TYPE_CONCEPTS,
  CONCEPT_TAGS,
  CONCEPT_TAG_SET,
  conceptTagsForGpc,
  conceptTagsForFields,
  type ConceptTag,
} from '../../../content/phoneticAnalytics/lib/concept-tags';
