import { computed, inject, type ComputedRef, type InjectionKey, type Ref } from "vue";

export interface QuestionDebugDifficultyContext {
    userElo: Ref<number>;
    cardElo: Ref<number>;
    modifyDifficulty: ComputedRef<number>;
}

export const QUESTION_DEBUG_DIFFICULTY_CONTEXT_KEY: InjectionKey<QuestionDebugDifficultyContext> =
    Symbol("QUESTION_DEBUG_DIFFICULTY_CONTEXT_KEY");

export function useQuestionDebugDifficulty(): QuestionDebugDifficultyContext | null {
    return inject(QUESTION_DEBUG_DIFFICULTY_CONTEXT_KEY, null);
}

export function createQuestionDebugDifficultyContext(
    userElo: Ref<number>,
    cardElo: Ref<number>,
): QuestionDebugDifficultyContext {
    return {
        userElo,
        cardElo,
        modifyDifficulty: computed(() => userElo.value - cardElo.value),
    };
}