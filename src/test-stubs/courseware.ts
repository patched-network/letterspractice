/**
 * Test stub for @vue-skuilder/courseware
 *
 * Re-exports only what letterspractice tests need, avoiding the courseware
 * barrel which pulls in all course types (math → paper.js → navigator crash).
 */
export { Question } from '@vue-skuilder/common-ui';
export type { ViewData, Answer } from '@vue-skuilder/common';
