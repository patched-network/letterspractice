<!--
  SightWordIntroDbg.vue - Debug view for the SightWordIntro question type

  Uses QuestionTypeLayout for two-column display with ProgressiveKeyboard.
  Left column: word (every recorded sight word), its plan, logs
  Right column: Question display + keyboard
-->

<template>
    <QuestionTypeLayout title="Sight Word Introduction" :initial-base-letters="[]">
        <template #config>
            <div class="sw-config">
                <div class="config-section">
                    <div class="config-label">Renderer</div>
                    <v-switch
                        v-model="letters3d"
                        label="3D letters (off: the SVG stepper fallback)"
                        density="compact"
                        hide-details
                        color="primary"
                    />
                    <div class="config-label mt-3">What the word stands on (3D)</div>
                    <v-btn-toggle
                        v-model="staging"
                        mandatory
                        density="compact"
                        color="primary"
                        variant="outlined"
                        divided
                    >
                        <v-btn v-for="s in stagings" :key="s" :value="s" size="small">{{ s }}</v-btn>
                    </v-btn-toggle>
                </div>

                <div class="config-section">
                    <div class="config-label">Recorded sight words</div>
                    <div class="preset-chips">
                        <v-chip
                            v-for="w in sightWords"
                            :key="w"
                            size="small"
                            :color="w === word ? 'primary' : undefined"
                            :variant="w === word ? 'flat' : 'outlined'"
                            @click="applyWord(w)"
                        >
                            {{ w }}
                            <span v-if="planFor(w).minders.length === 0" class="ml-1 text-caption">👀</span>
                        </v-chip>
                    </div>
                    <div class="text-caption mt-2">👀 = nobody in the word behaves; an onlooker reacts</div>
                </div>

                <div class="config-section">
                    <div class="config-label">Steps (* misbehaves)</div>
                    <div class="plan-steps">
                        <span
                            v-for="(step, i) in currentPlan.steps"
                            :key="i"
                            class="plan-step"
                            :class="{ 'plan-step--bad': currentPlan.culprits[i].length > 0 }"
                        >
                            {{ stepLabel(step) }} {{ step.phoneme ? `/${step.phoneme}/` : 'hush' }}<template v-if="currentPlan.culprits[i].length">*</template>
                        </span>
                    </div>
                    <div class="text-caption mt-2">
                        Minders: {{ currentPlan.minders.map((i) => word[i]).join(' ') || '(none: onlooker)' }}
                    </div>
                </div>

                <div class="config-section">
                    <div class="config-label">Typed → plays (* reaction, (x) hush: silent)</div>
                    <div class="plan-keys">
                        <div v-for="k in keypresses" :key="k.index" class="plan-key">
                            <span class="plan-key-letter">{{ k.letter }}</span>
                            <span v-if="k.steps.length === 0" class="plan-key-none">—</span>
                            <span
                                v-for="(s, j) in k.steps"
                                :key="j"
                                class="plan-step"
                                :class="{ 'plan-step--bad': s.bad }"
                            >
                                {{ s.label }} {{ s.phoneme ? `/${s.phoneme}/` : 'hush' }}<template v-if="s.bad">*</template>
                            </span>
                        </div>
                        <div class="plan-key">
                            <span class="plan-key-letter">␣</span>
                            <span class="plan-key-none">{{ wholeWordTimings }}</span>
                        </div>
                    </div>
                </div>

                <div class="config-section">
                    <div class="config-label">Follow-up card ids (space-separated)</div>
                    <v-text-field
                        v-model="followUp"
                        variant="outlined"
                        density="compact"
                        hide-details
                        placeholder="c-ml-was-0"
                    />
                    <v-btn color="primary" variant="elevated" size="small" class="mt-2" block @click="resetQuestion">
                        Apply & Reset
                    </v-btn>
                </div>

                <div class="config-section">
                    <div class="config-label">Response Log</div>
                    <div class="response-log">
                        <div v-if="responses.length === 0" class="no-responses">No responses yet</div>
                        <div v-for="(r, i) in responses" :key="i" class="response-item">
                            <v-chip color="success" size="x-small" class="mr-2">✓</v-chip>
                            <span class="response-text">Intro complete for {{ r.word }} ({{ r.timeSpent }}ms)</span>
                        </div>
                    </div>
                </div>

                <div class="config-section">
                    <div class="config-label">Replan</div>
                    <div class="response-log">
                        <div v-if="replans.length === 0" class="no-responses">No replan emitted yet</div>
                        <div v-for="(r, i) in replans" :key="i" class="replan-item">
                            <div class="replan-label">{{ r.label }}</div>
                            <div class="replan-row">
                                <span class="replan-key">boost:</span>
                                <span v-for="(val, tag) in r.boostTags" :key="tag" class="replan-tag replan-tag--boost">{{ tag }} ×{{ val }}</span>
                            </div>
                            <div class="replan-row">
                                <span class="replan-key">require:</span>
                                <span v-for="id in r.requireCards" :key="id" class="replan-tag replan-tag--boost">{{ id }}</span>
                            </div>
                            <div class="replan-row">
                                <span class="replan-key">exclude (session):</span>
                                <span v-for="tag in r.sessionExcludeTags" :key="tag" class="replan-tag replan-tag--exclude">{{ tag }}</span>
                            </div>
                            <div class="replan-row">
                                <span class="replan-key">exclude (burst):</span>
                                <span v-for="tag in r.excludeTags" :key="tag" class="replan-tag replan-tag--exclude">{{ tag }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- Slides in as a study session's card does (StudySession's card-slide enter) -->
        <Transition name="session-card" appear>
            <SightWordIntroView
                v-if="questionKey > 0"
                :key="questionKey"
                :data="questionData"
                :letters3d="letters3d"
                :staging="staging"
                @emit-response="handleResponse"
                @request-replan="handleReplan"
            />
        </Transition>
    </QuestionTypeLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import QuestionTypeLayout from "./QuestionTypeLayout.vue";
import SightWordIntroView from "../../questions/SightWordIntroView.vue";
import {
    planSightWordIntro,
    type SightWordStaging,
    type SightWordStep,
} from "../../questions/sightWordIntroPlan";
import { getAvailableWords, getPhonetics, computeSpeakerTimingsForWord } from "../../services/phonetics";
import { sightWordGpcId } from "../../services/tags/gpcCatalogue";
import { use3DLetters } from "../../services/letters3d";

/** Every recorded word with a sight-word catalogue entry. */
const sightWords = getAvailableWords()
    .filter((w) => w.length > 1 && sightWordGpcId(w))
    .sort();

function planFor(w: string) {
    return planSightWordIntro(w, getPhonetics(w)?.chunks ?? []);
}

const word = ref(sightWords.includes("was") ? "was" : sightWords[0] ?? "was");
const followUp = ref("");
const letters3d = ref(use3DLetters());
const stagings: SightWordStaging[] = ["floor", "platform", "mat", "float", "card"];
const staging = ref<SightWordStaging>("floor");
const questionKey = ref(1);
watch([letters3d, staging], () => resetQuestion());

const currentPlan = computed(() => planFor(word.value));

/** Per typed letter, the steps it sets off (plan.soundedAfter). */
const keypresses = computed(() => {
    const p = currentPlan.value;
    return [...word.value].map((letter, index) => {
        const from = p.soundedAfter[index - 1] ?? 0;
        const steps = p.steps.slice(from, p.soundedAfter[index]).map((step, j) => ({
            label: stepLabel(step),
            phoneme: step.phoneme,
            bad: p.culprits[from + j].length > 0,
        }));
        return { index, letter, steps };
    });
});

/** The whole word's letter triggers, ms into the recording. */
const wholeWordTimings = computed(() => {
    const p = getPhonetics(word.value);
    const timings = p ? computeSpeakerTimingsForWord(p) : null;
    if (!p || !timings) return "(no timings: plain playback)";
    const t = p.audioTimingMs;
    const triggers = timings.map((x) => `${word.value[x.index]}@${x.time}`).join(" ");
    return t ? `${triggers}  (speech ${t.speechStart}–${t.speechEnd} of ${t.fileDuration}ms)` : triggers;
});

function stepLabel(step: SightWordStep): string {
    return Object.keys(step.letters)
        .map(Number)
        .sort((a, b) => a - b)
        .map((i) => (step.letters[i] === "silent-e" ? `(${word.value[i]})` : word.value[i]))
        .join("");
}

const questionData = computed(() => [
    {
        gpcId: sightWordGpcId(word.value) ?? `GPC-WORD-${word.value}`,
        word: word.value,
        followUp: followUp.value,
    },
]);

function applyWord(w: string): void {
    word.value = w;
    resetQuestion();
}

function resetQuestion(): void {
    questionKey.value++;
}

interface ReplanEntry {
    label: string;
    boostTags: Record<string, number>;
    requireCards: string[];
    sessionExcludeTags: string[];
    excludeTags: string[];
}
const responses = ref<{ word: string; timeSpent: number }[]>([]);
const replans = ref<ReplanEntry[]>([]);

function handleResponse(response: any): void {
    responses.value.unshift({ word: word.value, timeSpent: response.timeSpent || 0 });
    if (responses.value.length > 10) responses.value.pop();
}

function handleReplan(options: any): void {
    const merged = options.mergeSessionHints ?? {};
    replans.value.unshift({
        label: options.label ?? "(no label)",
        boostTags: merged.boostTags ?? {},
        requireCards: merged.requireCards ?? [],
        sessionExcludeTags: merged.excludeTags ?? [],
        excludeTags: options.hints?.excludeTags ?? [],
    });
    if (replans.value.length > 5) replans.value.pop();
}
</script>

<style scoped>
.sw-config {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.config-section {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 8px;
}

.config-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin-bottom: 8px;
}

.preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.plan-steps {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-family: monospace;
    font-size: 0.85rem;
}
.plan-step {
    padding: 2px 6px;
    border-radius: 4px;
    background: #e8f5e9;
}
.plan-step--bad {
    background: #fce4ec;
}

.plan-keys {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: monospace;
    font-size: 0.85rem;
}
.plan-key {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}
.plan-key-letter {
    min-width: 1.2em;
    font-weight: 700;
}
.plan-key-none {
    color: #999;
}

.response-log {
    max-height: 150px;
    overflow-y: auto;
    font-size: 0.875rem;
}
.no-responses {
    color: #999;
    font-style: italic;
}
.response-item {
    display: flex;
    align-items: center;
    padding: 4px 0;
}
.response-text {
    font-family: monospace;
    font-size: 0.8rem;
}

.replan-item {
    padding: 6px 0;
    border-bottom: 1px solid #eee;
    font-family: monospace;
    font-size: 0.75rem;
}
.replan-item:last-child { border-bottom: none; }
.replan-label { font-weight: 600; color: #333; margin-bottom: 3px; }
.replan-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 2px; }
.replan-key { color: #888; font-size: 0.7rem; min-width: 48px; }
.replan-tag { padding: 1px 5px; border-radius: 4px; font-size: 0.7rem; }
.replan-tag--boost { background: #e3f2fd; color: #1565c0; }
.replan-tag--exclude { background: #fce4ec; color: #b71c1c; }

/* A copy of StudySession's card-slide enter (vue-skuilder common-ui) */
.session-card-enter-active {
    animation: sessionCardIn 250ms ease-out 100ms both;
}
@keyframes sessionCardIn {
    0% {
        transform: translateX(60%);
        opacity: 0;
    }
    100% {
        transform: translateX(0);
        opacity: 1;
    }
}
</style>
