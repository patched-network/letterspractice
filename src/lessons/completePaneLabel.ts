import type { InjectionKey } from 'vue';

/**
 * The complete pane's way-out label, for a host whose way out isn't the menu
 * (LessonView's /curriculum preview). Default: "Back to Menu".
 */
export const COMPLETE_PANE_BACK_LABEL: InjectionKey<string> = Symbol('completePaneBackLabel');
