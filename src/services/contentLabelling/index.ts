/**
 * Content labelling — app-side façade.
 *
 * The canonical implementation lives in the content pipeline's lib
 * (`content/phoneticAnalytics/lib/content-labelling.ts`) so that pipeline
 * scripts and the app share one definition of GPC tags, branded id types,
 * and deterministic card-id construction/parsing.
 */

export * from '../../../content/phoneticAnalytics/lib/content-labelling';
