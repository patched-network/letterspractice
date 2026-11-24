<!--
  SpellingGraderDbg — the spelling grader (questions/spelling/grade.ts) and its
  regression table (questions/spelling/gradeCases.ts).

  Try an answer against a word to see the alignment, each chunk's verdict and
  why, and what would be recorded; "copy as case" turns it into a table row.
  Below, every row of the table, pass/fail against the current grader. Click a
  row to load it above. Prefill with ?word=fix&answer=thix.
-->

<template>
    <div class="sg-dbg">
        <h1>Spelling Grader</h1>
        <p class="sg-blurb">
            Which of a word's GPCs a typed answer got right. Wrong answers are aligned letter by letter:
            a chunk with a wrong or missing letter is missed; an extra vowel letter charges the nearest vowel
            chunk; a wrong answer that blames no GPC is <em>unjudged</em> and records <code>_global</code> only.
            A wrong answer that reads back as the word (<em>fone</em> for phone) is <em>phonetic</em>: its sounds
            are paired instead, and only the chunks spelled with other letters miss. Never for sight words.
            Rules in <code>questions/spelling/grade.ts</code>.
        </p>

        <!-- Try it -->
        <section class="sg-section">
            <h2>Try it</h2>
            <div class="sg-controls">
                <label>
                    word
                    <input v-model="word" list="sg-words" class="sg-input" spellcheck="false" />
                </label>
                <label>
                    answer
                    <input v-model="answer" class="sg-input" spellcheck="false" />
                </label>
                <datalist id="sg-words">
                    <option v-for="w in words" :key="w" :value="w" />
                </datalist>
            </div>

            <p v-if="!phonetics" class="sg-warn">No phonetics for "{{ word }}": every answer is unjudged.</p>

            <template v-if="grade">
                <p class="sg-status">
                    <span v-if="grade.correct" class="sg-pill sg-pill--hit">correct</span>
                    <span v-else class="sg-pill sg-pill--miss">wrong</span>
                    <span v-if="grade.unjudged" class="sg-pill sg-pill--unjudged">unjudged: {{ grade.unjudged }}</span>
                    <span v-else class="sg-pill">judged</span>
                    <span v-if="grade.phonetic" class="sg-pill sg-pill--phonetic">
                        phonetic: {{ grade.phonetic.replacements.join(', ') }}
                        <template v-if="grade.phonetic.letterNames.length">
                            (letter name: {{ grade.phonetic.letterNames.join(', ') }})
                        </template>
                    </span>
                </p>

                <div v-if="grade.alignment.length" class="sg-align">
                    <div class="sg-align-row">
                        <span class="sg-align-label">word</span>
                        <span v-for="(op, i) in grade.alignment" :key="'t' + i" class="sg-cell" :class="'sg-cell--' + op.op">
                            {{ op.op === 'ins' ? '·' : grade.word[op.t] }}
                        </span>
                    </div>
                    <div class="sg-align-row">
                        <span class="sg-align-label">answer</span>
                        <span v-for="(op, i) in grade.alignment" :key="'a' + i" class="sg-cell" :class="'sg-cell--' + op.op">
                            {{ op.op === 'del' ? '·' : grade.answer[op.a] }}
                        </span>
                    </div>
                </div>

                <div v-if="grade.phonetic" class="sg-align">
                    <div class="sg-align-row">
                        <span class="sg-align-label">sounds</span>
                        <span v-for="(g, i) in grade.phonetic.groups" :key="'p' + i" class="sg-group sg-dim">
                            {{ g.phonemes.join(' ') || 'silent' }}
                        </span>
                    </div>
                    <div class="sg-align-row">
                        <span class="sg-align-label">word</span>
                        <span v-for="(g, i) in grade.phonetic.groups" :key="'w' + i" class="sg-group" :class="groupClass(g)">
                            {{ g.word.text || '·' }}
                        </span>
                    </div>
                    <div class="sg-align-row">
                        <span class="sg-align-label">answer</span>
                        <span v-for="(g, i) in grade.phonetic.groups" :key="'a' + i" class="sg-group" :class="groupClass(g)">
                            {{ g.answer.text || '·' }}
                        </span>
                    </div>
                </div>

                <table v-if="grade.chunks.length" class="sg-table">
                    <thead>
                        <tr>
                            <th>chunk</th>
                            <th>letters</th>
                            <th>phoneme</th>
                            <th>GPC</th>
                            <th>verdict</th>
                            <th>why</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(c, i) in grade.chunks" :key="i">
                            <td class="sg-strong">{{ c.label || '—' }}</td>
                            <td>{{ c.letters.join(',') }}</td>
                            <td>{{ c.phoneme }}</td>
                            <td>{{ c.tag ? shortId(c.tag) : '(none: not graded)' }}</td>
                            <td>
                                <span v-if="grade.unjudged" class="sg-dim">—</span>
                                <span v-else :class="'sg-verdict--' + c.verdict">{{ mark(c.verdict) }} {{ c.verdict }}</span>
                            </td>
                            <td class="sg-why">{{ c.why.join('; ') }}</td>
                        </tr>
                    </tbody>
                </table>

                <ul v-if="grade.notes.length" class="sg-notes">
                    <li v-for="(n, i) in grade.notes" :key="i">{{ n }}</li>
                </ul>

                <p class="sg-recorded">
                    recorded:
                    <code>_global</code>
                    <template v-for="(v, tag) in grade.verdicts" :key="tag">
                        · <code :class="'sg-verdict--' + v">{{ shortId(String(tag)) }} {{ mark(v) }}</code>
                    </template>
                </p>

                <div class="sg-copy">
                    <label>
                        source
                        <input v-model="source" class="sg-input sg-input--wide" spellcheck="false" />
                    </label>
                    <button class="sg-button" @click="copyCase">{{ copied ? 'copied ✓' : 'copy as case' }}</button>
                </div>
                <pre class="sg-pre">{{ caseText }}</pre>
            </template>
        </section>

        <!-- Regression table -->
        <section class="sg-section">
            <h2>
                Regression table
                <span class="sg-pill" :class="failing ? 'sg-pill--miss' : 'sg-pill--hit'">
                    {{ checks.length - failing }} / {{ checks.length }} pass
                </span>
            </h2>
            <table class="sg-table sg-table--cases">
                <thead>
                    <tr>
                        <th></th>
                        <th>word</th>
                        <th>answer</th>
                        <th>expected</th>
                        <th>grader says</th>
                        <th>source</th>
                        <th>note</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="(row, i) in checks"
                        :key="i"
                        :class="{ 'sg-row--fail': row.check.failures.length }"
                        @click="load(row.c)"
                    >
                        <td>{{ row.check.failures.length ? '✗' : '✓' }}</td>
                        <td class="sg-strong">{{ row.c.word }}</td>
                        <td class="sg-strong">"{{ row.c.answer }}"</td>
                        <td>
                            {{ describe(row.c.expect) }}
                            <div v-if="row.c.phonetic !== undefined" class="sg-dim">phonetic: {{ describePhonetic(row.c.phonetic) }}</div>
                        </td>
                        <td>
                            {{ describe(row.check.actual) }}
                            <div v-if="row.c.phonetic !== undefined" class="sg-dim">
                                phonetic: {{ describePhonetic(row.check.grade.phonetic?.replacements ?? false) }}
                            </div>
                            <div v-for="(f, j) in row.check.failures" :key="j" class="sg-failure">{{ f }}</div>
                        </td>
                        <td class="sg-dim">{{ row.c.source }}</td>
                        <td class="sg-dim">{{ row.c.note }}</td>
                    </tr>
                </tbody>
            </table>
        </section>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SpellingGraderDbg' });

import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getAvailableWords, getPhonetics } from '../services/phonetics';
import { parseGpcTag } from '../services/tags';
import { gradeSpelling, type Verdict } from '../questions/spelling/grade';
import type { SoundGroup } from '../questions/spelling/phoneticMatch';
import { GRADE_CASES, type GradeCase } from '../questions/spelling/gradeCases';
import { checkCase, caseSource } from '../questions/spelling/gradeCheck';

const route = useRoute();
const words = getAvailableWords().sort();

const word = ref(typeof route.query.word === 'string' ? route.query.word : 'fix');
const answer = ref(typeof route.query.answer === 'string' ? route.query.answer : 'thix');
const source = ref('synthetic');
const copied = ref(false);

const phonetics = computed(() => getPhonetics(word.value.trim().toLowerCase()));
const grade = computed(() => (word.value.trim() ? gradeSpelling(word.value.trim(), phonetics.value, answer.value) : null));

const shortId = (tag: string) => parseGpcTag(tag)?.gpcShortId ?? tag;
const mark = (v: Verdict) => (v === 'hit' ? '✓' : '✗');

function describe(e: GradeCase['expect']): string {
    if (e === 'unjudged') return 'unjudged';
    return Object.entries(e)
        .map(([gpc, v]) => `${gpc} ${mark(v)}`)
        .join(' · ');
}

const describePhonetic = (p: false | string[]) => (p ? p.join(', ') : 'no');
const groupClass = (g: SoundGroup) => (g.same ? 'sg-cell--match' : 'sg-cell--sub');

const currentCase = computed<GradeCase | null>(() => {
    const g = grade.value;
    if (!g) return null;
    return {
        word: g.word,
        answer: g.answer,
        expect: g.unjudged
            ? 'unjudged'
            : Object.fromEntries(Object.entries(g.verdicts).map(([tag, v]) => [shortId(tag), v])),
        ...(g.correct ? {} : { phonetic: g.phonetic?.replacements ?? false }),
        source: source.value,
    };
});
const caseText = computed(() => (currentCase.value ? caseSource(currentCase.value) : ''));

watch([word, answer, source], () => (copied.value = false));

async function copyCase() {
    try {
        await navigator.clipboard.writeText(caseText.value);
        copied.value = true;
    } catch {
        // Clipboard blocked (insecure context): the text is selectable below.
    }
}

const checks = computed(() => GRADE_CASES.map((c) => ({ c, check: checkCase(c) })));
const failing = computed(() => checks.value.filter((r) => r.check.failures.length).length);

function load(c: GradeCase) {
    word.value = c.word;
    answer.value = c.answer;
    source.value = c.source;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
</script>

<style scoped>
.sg-dbg {
    max-width: 1100px;
    margin: 0 auto;
    padding: 24px 16px 64px;
    font-family: monospace;
}

.sg-blurb {
    color: #555;
    max-width: 720px;
}

.sg-section {
    margin-top: 28px;
}

.sg-controls,
.sg-copy {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    margin: 12px 0;
}

.sg-input {
    font-family: monospace;
    font-size: 1.1rem;
    padding: 4px 8px;
    margin-left: 6px;
    width: 9em;
    border: 1px solid #bbb;
    border-radius: 6px;
}

.sg-input--wide {
    width: 16em;
    font-size: 0.9rem;
}

.sg-button {
    font-family: monospace;
    padding: 4px 12px;
    border: 1px solid #2196f3;
    border-radius: 6px;
    background: #e3f2fd;
    cursor: pointer;
}

.sg-warn {
    color: #b26a00;
}

.sg-status {
    display: flex;
    gap: 8px;
}

.sg-pill {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 10px;
    background: #eee;
    font-size: 0.8rem;
    font-weight: normal;
}

.sg-pill--hit {
    background: #e8f5e9;
    color: #2e7d32;
}

.sg-pill--miss {
    background: #ffebee;
    color: #c62828;
}

.sg-pill--unjudged {
    background: #fff3e0;
    color: #b26a00;
}

/* Alignment */
.sg-align {
    margin: 12px 0;
}

.sg-align-row {
    display: flex;
    gap: 4px;
    margin-bottom: 4px;
}

.sg-align-label {
    width: 5em;
    color: #888;
    font-size: 0.8rem;
    align-self: center;
}

.sg-cell {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: 1.2rem;
    font-weight: 700;
    background: #f5f5f5;
}

.sg-group {
    min-width: 32px;
    height: 32px;
    padding: 0 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
}

.sg-pill--phonetic {
    background: #e3f2fd;
    color: #1565c0;
}

.sg-cell--match {
    background: #e8f5e9;
}

.sg-cell--sub,
.sg-cell--del {
    background: #ffebee;
    color: #c62828;
}

.sg-cell--ins {
    background: #fff3e0;
    color: #b26a00;
}

/* Tables */
.sg-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.85rem;
    margin: 8px 0;
}

.sg-table th {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 2px solid #ccc;
}

.sg-table td {
    padding: 5px 10px;
    border-bottom: 1px solid #eee;
    vertical-align: top;
}

.sg-table--cases tbody tr {
    cursor: pointer;
}

.sg-table--cases tbody tr:hover {
    background: #f5f9ff;
}

.sg-row--fail {
    background: #fff5f5;
}

.sg-failure {
    color: #c62828;
    font-size: 0.8rem;
}

.sg-strong {
    font-weight: 700;
}

.sg-dim {
    color: #888;
}

.sg-why {
    color: #555;
}

.sg-verdict--hit {
    color: #2e7d32;
}

.sg-verdict--miss {
    color: #c62828;
}

.sg-notes {
    color: #555;
    font-size: 0.85rem;
}

.sg-recorded {
    font-size: 0.85rem;
}

.sg-pre {
    background: #f5f5f5;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    overflow-x: auto;
}
</style>
