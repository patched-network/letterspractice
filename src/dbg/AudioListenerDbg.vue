<template>
    <div class="audio-listener">
        <h1>🎧 Audio Listener</h1>
        <p class="subtitle">
            Click any link to play. Tip: in Firefox, press
            <kbd>'</kbd> (quick-find link) and type the label to jump.
        </p>

        <section class="section">
            <h2>🔤 Phonemes</h2>

            <div class="phoneme-group">
                <h3>Vowels — Monophthongs</h3>
                <div class="btn-row">
                    <a
                        v-for="p in monophthongs"
                        :key="p"
                        href="#"
                        class="ph-btn vowel"
                        @click.prevent="playPhoneme(p)"
                        >{{ p }}</a
                    >
                </div>
            </div>

            <div class="phoneme-group">
                <h3>Vowels — Diphthongs</h3>
                <div class="btn-row">
                    <a
                        v-for="p in diphthongs"
                        :key="p"
                        href="#"
                        class="ph-btn vowel"
                        @click.prevent="playPhoneme(p)"
                        >{{ p }}</a
                    >
                </div>
            </div>

            <div class="phoneme-group">
                <h3>Consonants — Stops</h3>
                <div class="btn-row">
                    <a
                        v-for="p in stops"
                        :key="p"
                        href="#"
                        class="ph-btn consonant"
                        @click.prevent="playPhoneme(p)"
                        >{{ p }}</a
                    >
                </div>
            </div>

            <div class="phoneme-group">
                <h3>Consonants — Fricatives</h3>
                <div class="btn-row">
                    <a
                        v-for="p in fricatives"
                        :key="p"
                        href="#"
                        class="ph-btn consonant"
                        @click.prevent="playPhoneme(p)"
                        >{{ p }}</a
                    >
                </div>
            </div>

            <div class="phoneme-group">
                <h3>Consonants — Affricates</h3>
                <div class="btn-row">
                    <a
                        v-for="p in affricates"
                        :key="p"
                        href="#"
                        class="ph-btn consonant"
                        @click.prevent="playPhoneme(p)"
                        >{{ p }}</a
                    >
                </div>
            </div>

            <div class="phoneme-group">
                <h3>Consonants — Nasals</h3>
                <div class="btn-row">
                    <a
                        v-for="p in nasals"
                        :key="p"
                        href="#"
                        class="ph-btn consonant"
                        @click.prevent="playPhoneme(p)"
                        >{{ p }}</a
                    >
                </div>
            </div>

            <div class="phoneme-group">
                <h3>Consonants — Liquids</h3>
                <div class="btn-row">
                    <a
                        v-for="p in liquids"
                        :key="p"
                        href="#"
                        class="ph-btn consonant"
                        @click.prevent="playPhoneme(p)"
                        >{{ p }}</a
                    >
                </div>
            </div>

            <div class="phoneme-group">
                <h3>Consonants — Glides</h3>
                <div class="btn-row">
                    <a
                        v-for="p in glides"
                        :key="p"
                        href="#"
                        class="ph-btn consonant"
                        @click.prevent="playPhoneme(p)"
                        >{{ p }}</a
                    >
                </div>
            </div>

            <div class="phoneme-group">
                <h3>Compound Pseudo-Phonemes</h3>
                <div class="btn-row">
                    <a
                        v-for="p in compounds"
                        :key="p"
                        href="#"
                        class="ph-btn compound"
                        @click.prevent="playPhoneme(p)"
                        >{{ p }}</a
                    >
                </div>
            </div>
        </section>

        <section class="section">
            <h2>📖 Words</h2>
            <input
                v-model="wordQuery"
                type="text"
                class="word-search"
                placeholder="Fuzzy search words…"
                autocomplete="off"
            />
            <p class="meta">
                {{ filteredWords.length }} / {{ WORD_LIST.length }} words
            </p>
            <div class="btn-row word-row">
                <a
                    v-for="w in filteredWords"
                    :key="w"
                    href="#"
                    class="word-btn"
                    @click.prevent="playWord(w)"
                    >{{ w }}</a
                >
            </div>
        </section>

        <div v-if="nowPlaying" class="now-playing">
            ▶ Playing: <strong>{{ nowPlaying }}</strong>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
    MONOPHTHONGS,
    DIPHTHONGS,
    STOPS,
    FRICATIVES,
    AFFRICATES,
    NASALS,
    LIQUIDS,
    GLIDES,
} from "@/services/phonetics/arpabet";
import {
    COMPOUND_PHONEMES,
    getPhonemeAudioUrl,
    type PhonemeAudioKey,
} from "@/services/phonetics/phonemeCache";
import { WORD_LIST, type WordKey } from "@/audio/word-list";
import { getWordAudio } from "@/audio/words";

const monophthongs = MONOPHTHONGS;
const diphthongs = DIPHTHONGS;
const stops = STOPS;
const fricatives = FRICATIVES;
const affricates = AFFRICATES;
const nasals = NASALS;
const liquids = LIQUIDS;
const glides = GLIDES;
const compounds = COMPOUND_PHONEMES;

const wordQuery = ref("");
const nowPlaying = ref<string | null>(null);

/**
 * Simple subsequence fuzzy match: every char of `query` appears in `target`
 * in order (not necessarily contiguous). Empty query matches everything.
 */
function fuzzyMatch(target: string, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) qi++;
    }
    return qi === q.length;
}

const filteredWords = computed(() =>
    WORD_LIST.filter((w) => fuzzyMatch(w, wordQuery.value))
);

let currentAudio: HTMLAudioElement | null = null;

function playUrl(url: string, label: string) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }
    const audio = new Audio(url);
    currentAudio = audio;
    nowPlaying.value = label;
    audio.play().catch((err) => {
        console.warn(`Failed to play ${label} (${url}):`, err);
    });
    audio.addEventListener("ended", () => {
        if (nowPlaying.value === label) nowPlaying.value = null;
    });
}

function playPhoneme(p: PhonemeAudioKey) {
    playUrl(getPhonemeAudioUrl(p), p);
}

function playWord(w: WordKey) {
    playUrl(getWordAudio(w), w);
}
</script>

<style scoped>
.audio-listener {
    padding: 12px 16px;
    max-width: 1100px;
    margin: 0 auto;
    font-family: "Segoe UI", system-ui, sans-serif;
    color: #2c3e50;
}

h1 {
    margin: 0 0 4px;
    font-size: 1.4em;
}

.subtitle {
    margin: 0 0 16px;
    color: #607080;
    font-size: 0.85em;
}

kbd {
    background: #eef;
    border: 1px solid #ccd;
    border-radius: 3px;
    padding: 0 4px;
    font-family: monospace;
    font-size: 0.85em;
}

.section {
    margin-bottom: 20px;
    padding: 12px;
    background: #fafbfc;
    border: 1px solid #e1e6eb;
    border-radius: 6px;
}

.section h2 {
    margin: 0 0 8px;
    font-size: 1.05em;
    border-bottom: 1px solid #3498db;
    padding-bottom: 3px;
}

.phoneme-group {
    margin-bottom: 10px;
}

.phoneme-group h3 {
    margin: 6px 0 4px;
    font-size: 0.8em;
    color: #607080;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.ph-btn,
.word-btn {
    display: inline-block;
    padding: 6px 10px;
    border-radius: 4px;
    text-decoration: none;
    font-family: monospace;
    font-size: 0.95em;
    font-weight: 600;
    border: 1px solid transparent;
    cursor: pointer;
    user-select: none;
    transition: transform 0.08s ease, background-color 0.15s ease;
}

.ph-btn:hover,
.word-btn:hover {
    transform: translateY(-1px);
}

.ph-btn:active,
.word-btn:active {
    transform: translateY(0);
}

.ph-btn.vowel {
    background: #fff4e6;
    border-color: #f0c987;
    color: #8a5a00;
}
.ph-btn.vowel:hover {
    background: #ffe7c2;
}

.ph-btn.consonant {
    background: #e6f0ff;
    border-color: #88b3f0;
    color: #1a4a99;
}
.ph-btn.consonant:hover {
    background: #cce0ff;
}

.ph-btn.compound {
    background: #f0e6ff;
    border-color: #b388f0;
    color: #4a1a99;
}
.ph-btn.compound:hover {
    background: #e0ccff;
}

.word-btn {
    background: #ffffff;
    border-color: #d0d6dc;
    color: #2c3e50;
    font-family: "Segoe UI", system-ui, sans-serif;
    font-weight: 500;
}
.word-btn:hover {
    background: #f0f8ff;
    border-color: #3498db;
    color: #2980b9;
}

.word-search {
    width: 100%;
    max-width: 400px;
    padding: 8px 10px;
    font-size: 1em;
    border: 1px solid #cfd6dc;
    border-radius: 4px;
    outline: none;
}
.word-search:focus {
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.meta {
    margin: 6px 0;
    font-size: 0.75em;
    color: #607080;
}

.word-row {
    height: 50vh;
    overflow-y: auto;
    align-content: flex-start;
    padding: 4px;
    background: #fff;
    border: 1px solid #e1e6eb;
    border-radius: 4px;
}

.now-playing {
    position: fixed;
    bottom: 12px;
    right: 12px;
    background: #2c3e50;
    color: #fff;
    padding: 8px 14px;
    border-radius: 20px;
    font-size: 0.9em;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    pointer-events: none;
}
</style>
