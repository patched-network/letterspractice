<!--
  GraderTry: "type a misspelling, see how we read it", on /exercises under
  Spell the Word. Runs the app's own spelling grader (questions/spelling/
  grade.ts, pure) on what the visitor types, and shows the word's facts as
  chips, each hit or missed, with the grader's reason. Nothing is recorded.

  The word picker is limited to the demo words with phonetics; the starting
  answers (copy.tries) each show one rule: sounds-right, a dropped letter,
  a swap, an uncharged extra letter.
-->
<template>
    <div class="grader">
        <h4 class="grader__title">{{ copy.title }}</h4>
        <p class="grader__lede">{{ copy.lede }}</p>

        <div class="grader__tries">
            <button
                v-for="t in copy.tries"
                :key="t.word + t.answer"
                type="button"
                class="grader__try"
                :class="{ 'grader__try--on': t.word === word && t.answer === answer }"
                @click="pick(t.word, t.answer)"
            >
                <span class="grader__try-answer">{{ t.answer }}</span>
                <span class="grader__try-word">for {{ t.word }}</span>
            </button>
        </div>

        <div class="grader__row">
            <label class="grader__field">
                <span class="grader__label">Word</span>
                <select v-model="word" class="grader__input">
                    <option v-for="w in words" :key="w" :value="w">{{ w }}</option>
                </select>
            </label>
            <label class="grader__field grader__field--grow">
                <span class="grader__label">{{ copy.answerLabel }}</span>
                <input
                    v-model="answer"
                    class="grader__input mono"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    maxlength="20"
                />
            </label>
        </div>

        <div class="grader__result" aria-live="polite">
            <template v-if="grade">
                <p v-if="grade.correct" class="grader__verdict grader__verdict--ok">{{ copy.correct }}</p>
                <p v-else-if="grade.unjudged" class="grader__verdict">{{ copy.unjudged[grade.unjudged] }}</p>
                <ul v-if="!grade.correct && !grade.unjudged" class="grader__chunks">
                    <li
                        v-for="(c, i) in grade.chunks"
                        :key="i"
                        class="grader__chunk"
                        :class="chunkClass(c.verdict)"
                    >
                        <code>{{ c.label }}</code>
                        <span class="grader__chunk-verdict">{{ c.verdict === "miss" ? copy.miss : copy.hit }}</span>
                        <span v-if="c.why.length" class="grader__chunk-why">{{ c.why.join("; ") }}</span>
                    </li>
                </ul>
                <p v-if="!grade.correct && grade.phonetic" class="grader__note">
                    Reads back as the word: in the app, the child types the fix, and the card counts as right.
                </p>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { getPhonetics } from "@/services/phonetics";
import { gradeSpelling, type Verdict } from "@/questions/spelling/grade";
import { exercisesCopy } from "@/content/exercisesCopy";

const copy = exercisesCopy.grader;

const WORDS = ["cat", "hot", "bed", "ship", "fish", "next", "phone", "shop", "chip", "fox"];
const words = WORDS.filter((w) => getPhonetics(w));

const word = ref<string>(copy.tries[0].word);
const answer = ref<string>(copy.tries[0].answer);

function pick(w: string, a: string): void {
    word.value = w;
    answer.value = a;
}

const grade = computed(() => gradeSpelling(word.value, getPhonetics(word.value), answer.value));

// A grade that reads back as the word charges only rule 0's misses (chunks
// spelled with other letters for the same sound), so every miss in it is a
// sound one: amber, not red.
function chunkClass(verdict: Verdict): string {
    if (verdict === "hit") return "grader__chunk--hit";
    return grade.value.phonetic ? "grader__chunk--sound" : "grader__chunk--miss";
}
</script>

<style scoped>
.grader {
    margin-top: 20px;
    padding: 20px;
    border-radius: 16px;
    background: rgba(var(--v-theme-primary), 0.05);
    border: 1px solid rgba(var(--v-theme-primary), 0.15);
}
.grader__title {
    margin: 0 0 4px;
    font-size: 1.1rem;
    font-weight: 700;
}
.grader__lede {
    margin: 0 0 12px;
    line-height: 1.55;
    color: rgba(var(--v-theme-on-surface), 0.7);
}
.grader__tries {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
}
.grader__try {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    background: rgb(var(--v-theme-surface));
    font-size: 0.9rem;
}
.grader__try--on {
    border-color: rgb(var(--v-theme-primary));
}
.grader__try-answer {
    font-family: monospace;
    font-weight: 700;
}
.grader__try-word {
    color: rgba(var(--v-theme-on-surface), 0.6);
}
.grader__row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}
.grader__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.grader__field--grow {
    flex: 1;
    min-width: 160px;
}
.grader__label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), 0.6);
}
.grader__input {
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    background: rgb(var(--v-theme-surface));
    font-size: 1.05rem;
    color: rgb(var(--v-theme-on-surface));
}
.grader__input:focus {
    outline: 2px solid rgba(var(--v-theme-primary), 0.5);
    outline-offset: 1px;
}
.mono {
    font-family: monospace;
}
.grader__result {
    margin-top: 14px;
    min-height: 2.5em;
}
.grader__verdict {
    margin: 0;
    color: rgba(var(--v-theme-on-surface), 0.75);
}
.grader__verdict--ok {
    color: rgb(var(--v-theme-success));
    font-weight: 600;
}
.grader__chunks {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.grader__chunk {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 12px;
    border: 1px solid;
    background: rgb(var(--v-theme-surface));
}
.grader__chunk--hit {
    border-color: rgba(var(--v-theme-success), 0.5);
}
.grader__chunk--miss {
    border-color: rgba(var(--v-theme-error), 0.6);
}
.grader__chunk--sound {
    border-color: rgba(var(--v-theme-warning), 0.7);
}
.grader__chunk code {
    font-weight: 700;
    font-size: 1.05rem;
}
.grader__chunk-verdict {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.grader__chunk--hit .grader__chunk-verdict {
    color: rgb(var(--v-theme-success));
}
.grader__chunk--miss .grader__chunk-verdict {
    color: rgb(var(--v-theme-error));
}
.grader__chunk--sound .grader__chunk-verdict {
    color: rgb(var(--v-theme-warning));
}
.grader__chunk-why {
    font-size: 0.85rem;
    color: rgba(var(--v-theme-on-surface), 0.65);
}
.grader__note {
    margin: 10px 0 0;
    font-size: 0.9rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
}
</style>
