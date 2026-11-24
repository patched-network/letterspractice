<!--
  ContextualPhonemeDbg — explorer for the contextual phoneme feedback mechanism.

  For any recorded word and letter position, shows what every possible typed
  letter would SOUND like in that orthographic context (via analyzeAttempt /
  the decode engine), versus the letter's canonical LETTER_TO_ARPABET sound.

  Surfaces:
  - contextual vs canonical divergence (soft c, split-digraph vowels, digraph
    merges, r-controlled teams) — the rows that motivated the mechanism
  - matchesTarget (Category A): typed letter is wrong but voices the exact
    target sound (k for c in "cape") — flagged for future distinct feedback
  - silent / fallback outcomes
  - full decode segmentation of the attempted string

  Doubles as a standing audit tool for decode-engine deficiencies.
-->

<template>
    <div class="cp-dbg">
        <h1>Contextual Phoneme Explorer</h1>
        <p class="cp-blurb">
            What would each typed letter <em>sound like</em> at a given position of a word?
            Drives wrong-answer feedback in MissingLetters. Rows where the contextual sound
            diverges from the letter's canonical sound are highlighted.
        </p>

        <!-- Word picker -->
        <div class="cp-controls">
            <label>
                Word:
                <select v-model="selectedWord">
                    <option v-for="w in words" :key="w" :value="w">{{ w }}</option>
                </select>
            </label>
            <button class="cp-play" @click="playUrls([wordAudioUrl])" :disabled="!wordAudioUrl">
                🔊 word
            </button>
        </div>

        <!-- Position picker: the word as letter tiles -->
        <div class="cp-word-row">
            <button
                v-for="(letter, i) in selectedWord.split('')"
                :key="i"
                class="cp-tile"
                :class="{ 'cp-tile--active': i === selectedPos }"
                @click="selectedPos = i"
            >
                <span class="cp-tile-letter">{{ letter }}</span>
                <span class="cp-tile-chunk">{{ chunkLabelAt(i) }}</span>
            </button>
        </div>
        <p class="cp-hint">
            Substituting at position {{ selectedPos }}
            (target sound: <code>{{ targetPhonemeAtPos || '—' }}</code>)
        </p>

        <!-- The a–z grid -->
        <table class="cp-grid">
            <thead>
                <tr>
                    <th>typed</th>
                    <th>string</th>
                    <th>contextual sound</th>
                    <th>canonical (old)</th>
                    <th>grapheme</th>
                    <th>GPC</th>
                    <th>kind</th>
                    <th>flags</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="cell in grid"
                    :key="cell.letter"
                    :class="{
                        'cp-row--correct': cell.isCorrectLetter,
                        'cp-row--divergent': cell.divergesFromCanonical && !cell.isCorrectLetter,
                        'cp-row--selected': selectedLetter === cell.letter,
                    }"
                    @click="selectedLetter = cell.letter"
                >
                    <td class="cp-cell-letter">{{ cell.letter }}</td>
                    <td class="cp-cell-word">{{ cell.attemptedDisplay }}</td>
                    <td class="cp-cell-sound">
                        {{ cell.sound.audioKeys.join(' + ') || '(silent)' }}
                    </td>
                    <td class="cp-cell-canonical">{{ cell.canonical }}</td>
                    <td>{{ cell.sound.grapheme }}<span v-if="cell.spansMultiple" class="cp-span-note"> [{{ cell.sound.span.start }}–{{ cell.sound.span.end }})</span></td>
                    <td class="cp-cell-gpc">{{ cell.sound.gpcId ?? '—' }}</td>
                    <td>
                        <span class="cp-kind" :class="'cp-kind--' + cell.sound.kind">{{ cell.sound.kind }}</span>
                    </td>
                    <td class="cp-cell-flags">
                        <span v-if="cell.isCorrectLetter" title="the correct letter">✅</span>
                        <span
                            v-else-if="cell.sound.matchesTarget"
                            class="cp-flag-catA"
                            title="Category A: wrong letter, but voices the exact target sound"
                            >🎯 sound match</span
                        >
                        <span v-if="cell.sound.ambiguous" :title="'alternatives: ' + cell.sound.alternativePhonemes.join(', ')">⚠️</span>
                    </td>
                    <td>
                        <button
                            class="cp-play"
                            :disabled="cell.sound.audioUrls.length === 0"
                            @click.stop="playUrls(cell.sound.audioUrls)"
                        >
                            🔊
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- Segmentation detail for the selected substitution -->
        <div v-if="selectedAnalysis" class="cp-detail">
            <h2>
                Decode segmentation: <code>{{ selectedAnalysis.attempted }}</code>
            </h2>
            <div class="cp-segments">
                <div
                    v-for="(seg, i) in selectedSegments"
                    :key="i"
                    class="cp-segment"
                    :class="{ 'cp-segment--hit': selectedPos >= seg.span.start && selectedPos < seg.span.end }"
                >
                    <div class="cp-seg-grapheme">{{ seg.grapheme }}</div>
                    <div class="cp-seg-phoneme">{{ seg.audioKeys.join(' + ') || '∅' }}</div>
                    <div class="cp-seg-gpc">{{ seg.gpcId ?? '?' }}</div>
                    <div class="cp-seg-conf">{{ (seg.confidence * 100).toFixed(0) }}%</div>
                </div>
            </div>
            <button class="cp-play" @click="playUrls(selectedSegments.flatMap((s) => s.audioUrls))">
                🔊 sound out
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ContextualPhonemeDbg' });

import { ref, computed, watch } from 'vue';
import { getAvailableWords, getPhonetics } from '../services/phonetics';
import {
    analyzeAttempt,
    type AttemptAnalysis,
    type ContextualLetterSound,
} from '../services/phonetics/contextualPhoneme';
import { getArpabetForLetter } from '../audio/letterToArpabet';
import { getWordAudio } from '../audio';
import type { WordKey } from '../audio/word-list';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

const words = getAvailableWords().sort();
const selectedWord = ref(words.includes('cake') ? 'cake' : words[0]);
const selectedPos = ref(0);
const selectedLetter = ref<string | null>(null);

watch(selectedWord, () => {
    selectedPos.value = 0;
    selectedLetter.value = null;
});
watch(selectedPos, () => {
    selectedLetter.value = null;
});

const target = computed(() => getPhonetics(selectedWord.value));
const wordAudioUrl = computed(() =>
    // getAvailableWords() only yields recorded words, so the cast is safe
    getWordAudio(selectedWord.value as WordKey),
);

/** Grapheme label of the target chunk covering a position (e.g. "a_e") */
function chunkLabelAt(pos: number): string {
    const chunk = target.value?.chunks.find((c) =>
        Object.keys(c.letters).map(Number).includes(pos),
    );
    return chunk?.label ?? '';
}

const targetPhonemeAtPos = computed(() => {
    const chunk = target.value?.chunks.find((c) =>
        Object.keys(c.letters).map(Number).includes(selectedPos.value),
    );
    return chunk ? String(chunk.phoneme) : null;
});

function replaceAt(word: string, pos: number, letter: string): string {
    return word.slice(0, pos) + letter + word.slice(pos + 1);
}

interface GridCell {
    letter: string;
    attempted: string;
    attemptedDisplay: string;
    sound: ContextualLetterSound;
    canonical: string;
    isCorrectLetter: boolean;
    divergesFromCanonical: boolean;
    spansMultiple: boolean;
}

const grid = computed<GridCell[]>(() =>
    ALPHABET.map((letter) => {
        const attempted = replaceAt(selectedWord.value, selectedPos.value, letter);
        const analysis = analyzeAttempt(attempted, target.value);
        const sound = analysis.positions[selectedPos.value];
        const canonical = getArpabetForLetter(letter) ?? '—';
        const contextual = sound.audioKeys.join(' + ');
        return {
            letter,
            attempted,
            attemptedDisplay:
                attempted.slice(0, selectedPos.value) +
                letter.toUpperCase() +
                attempted.slice(selectedPos.value + 1),
            sound,
            canonical,
            isCorrectLetter: letter === selectedWord.value[selectedPos.value],
            divergesFromCanonical: contextual !== canonical,
            spansMultiple: sound.span.end - sound.span.start > 1,
        };
    }),
);

// --- Segmentation detail for selected letter ---

const selectedAnalysis = computed<AttemptAnalysis | null>(() => {
    if (!selectedLetter.value) return null;
    return analyzeAttempt(
        replaceAt(selectedWord.value, selectedPos.value, selectedLetter.value),
        target.value,
    );
});

/** Unique segments (positions deduped by span start) in order */
const selectedSegments = computed<ContextualLetterSound[]>(() => {
    const a = selectedAnalysis.value;
    if (!a) return [];
    const seen = new Set<number>();
    const out: ContextualLetterSound[] = [];
    for (const p of a.positions) {
        if (!seen.has(p.span.start)) {
            seen.add(p.span.start);
            out.push(p);
        }
    }
    return out;
});

// --- Audio playback (sequential) ---

const audioEl = new Audio();
let playQueue: string[] = [];

audioEl.addEventListener('ended', () => {
    const next = playQueue.shift();
    if (next) {
        audioEl.src = next;
        void audioEl.play();
    }
});

function playUrls(urls: (string | null)[]): void {
    const clean = urls.filter((u): u is string => !!u);
    if (clean.length === 0) return;
    playQueue = clean.slice(1);
    audioEl.src = clean[0];
    void audioEl.play().catch(() => {
        playQueue = [];
    });
}
</script>

<style scoped>
.cp-dbg {
    max-width: 1000px;
    margin: 0 auto;
    padding: 24px 16px 64px;
    font-family: monospace;
}

.cp-blurb {
    color: #555;
    max-width: 640px;
}

.cp-controls {
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 16px 0;
}

.cp-controls select {
    font-family: monospace;
    font-size: 1.1rem;
    padding: 4px 8px;
    border: 1px solid #bbb;
    border-radius: 6px;
}

/* Word tiles */
.cp-word-row {
    display: flex;
    gap: 8px;
    margin: 12px 0 4px;
}

.cp-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 52px;
    padding: 8px 10px;
    border: 2px dashed #bbb;
    border-radius: 8px;
    background: #fafafa;
    cursor: pointer;
    font-family: monospace;
}

.cp-tile--active {
    border-style: solid;
    border-color: #2196f3;
    background: #e3f2fd;
}

.cp-tile-letter {
    font-size: 1.6rem;
    font-weight: 700;
}

.cp-tile-chunk {
    font-size: 0.7rem;
    color: #888;
}

.cp-hint {
    color: #666;
    font-size: 0.85rem;
}

/* Grid */
.cp-grid {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.85rem;
}

.cp-grid th {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 2px solid #ccc;
    background: #f5f5f5;
}

.cp-grid td {
    padding: 4px 10px;
    border-bottom: 1px solid #eee;
}

.cp-grid tbody tr {
    cursor: pointer;
}

.cp-grid tbody tr:hover {
    background: #f0f7ff;
}

.cp-row--correct {
    background: #e8f5e9;
}

.cp-row--divergent {
    background: #fff8e1;
}

.cp-row--selected {
    outline: 2px solid #2196f3;
    outline-offset: -2px;
}

.cp-cell-letter {
    font-size: 1.1rem;
    font-weight: 700;
}

.cp-cell-sound {
    font-weight: 700;
    color: #1565c0;
}

.cp-cell-canonical {
    color: #999;
}

.cp-cell-gpc {
    font-size: 0.75rem;
    color: #777;
}

.cp-flag-catA {
    color: #e65100;
    font-weight: 700;
    font-size: 0.75rem;
}

.cp-kind {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 8px;
    background: #e3f2fd;
    color: #1565c0;
}

.cp-kind--silent {
    background: #eee;
    color: #777;
}

.cp-kind--fallback {
    background: #fce4ec;
    color: #ad1457;
}

.cp-span-note {
    color: #999;
    font-size: 0.75rem;
}

.cp-play {
    font-size: 0.9rem;
    padding: 4px 10px;
    border: 1px solid #90caf9;
    border-radius: 6px;
    background: #e3f2fd;
    cursor: pointer;
}

.cp-play:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* Segmentation detail */
.cp-detail {
    margin-top: 28px;
    padding: 16px;
    border: 1px solid #ddd;
    border-radius: 10px;
    background: #fafafa;
}

.cp-segments {
    display: flex;
    gap: 10px;
    margin: 12px 0;
}

.cp-segment {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 14px;
    border: 2px solid #ccc;
    border-radius: 8px;
    background: white;
}

.cp-segment--hit {
    border-color: #2196f3;
    background: #e3f2fd;
}

.cp-seg-grapheme {
    font-size: 1.4rem;
    font-weight: 700;
}

.cp-seg-phoneme {
    color: #1565c0;
    font-weight: 700;
}

.cp-seg-gpc,
.cp-seg-conf {
    font-size: 0.7rem;
    color: #888;
}
</style>
