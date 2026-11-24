<!--
  DovetailWidget — /learning-engine's Team of Rivals panel. Seven candidate
  exercises, a switch per rival. Every card starts at 1.0; each switched-on
  rival multiplies it, up (a boost) or down (an objection; ×0.01 a rejection), so
  bars stretch past or fall short of the 1.0 tick and the list re-sorts
  (TransitionGroup's move transition is the FLIP). With all on, the winner is
  the card nobody objects to much, not any one rival's favourite.

  Each rival wears its colour and icon (rivals.ts, RivalDisc): on the chips,
  on the factor pills under each bar, and on the line naming the card's
  strongest voice. Colour never carries identity alone: every coloured mark
  sits with the rival's icon or name.

  Scenario (synthetic, hand-tuned): dovetailScenario.ts. Cards are stylized
  stubs, not real question renders: the point is the ranking, and a stub
  needs no DB, audio or keyboard context.

  "One at a time" clears the rivals and adds them in order, so a reader can
  watch the favourite change hands and the dovetail emerge.
-->
<template>
    <div class="dovetail">
        <p class="dovetail-instructions" v-html="renderInline(copy.instructions)"></p>

        <div class="dovetail-controls">
            <div class="dovetail-rivals" role="group" aria-label="Techniques">
                <button
                    v-for="r in RIVALS"
                    :key="r.id"
                    type="button"
                    class="rival-chip"
                    :class="{ 'rival-chip--on': active.has(r.id) }"
                    :style="{ '--rival-color': RIVAL_STYLE[r.id].color }"
                    :aria-pressed="active.has(r.id)"
                    @click="toggle(r.id)"
                >
                    <RivalDisc :rival="r.id" :size="24" :outline="!active.has(r.id)" />
                    {{ r.label }}
                </button>
            </div>
            <button type="button" class="dovetail-step" @click="stepThrough">
                <v-icon size="16">{{ stepping ? "mdi-timer-sand" : "mdi-play" }}</v-icon>
                One at a time
            </button>
        </div>

        <p class="dovetail-status" aria-live="polite">{{ status }}</p>

        <TransitionGroup tag="ol" name="rank" class="dovetail-list">
            <li
                v-for="(row, i) in rows"
                :key="row.c.id"
                class="cand"
                :class="{ 'cand--wins': i === 0 && !row.rejected && active.size > 0, 'cand--rejected': row.rejected }"
            >
                <div class="cand-stub">
                    <v-icon size="18" class="cand-stub__icon">{{ KIND_ICON[row.c.kind] }}</v-icon>
                    <div>
                        <div class="cand-stub__kind">{{ KIND_LABEL[row.c.kind] }}</div>
                        <div class="cand-stub__word">
                            <template v-for="(part, j) in splitFocus(row.c.word, row.c.focus)" :key="j">
                                <mark v-if="part.focus">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
                            </template>
                        </div>
                    </div>
                </div>
                <div class="cand-score">
                    <div class="cand-bar" aria-hidden="true">
                        <div class="cand-bar__fill" :style="{ width: `${barPct(row.score)}%` }"></div>
                        <div class="cand-bar__one" :style="{ left: `${barPct(1)}%` }"></div>
                    </div>
                    <div class="cand-meta">
                        <span class="cand-num">{{ row.score.toFixed(2) }}</span>
                        <span v-if="i === 0 && !row.rejected && active.size > 0" class="cand-next">Next up</span>
                        <span class="cand-pills">
                            <span
                                v-for="p in row.pills"
                                :key="p.id"
                                class="cand-pill"
                                :style="{ '--rival-color': RIVAL_STYLE[p.id].color }"
                                :title="pillTitle(p.id, p.factor)"
                            >
                                <RivalDisc :rival="p.id" :size="14" />×{{ p.factor }}
                            </span>
                        </span>
                    </div>
                    <p class="cand-why">
                        <template v-if="row.voice">
                            <RivalDisc :rival="row.voice.id" :size="14" class="cand-why__disc" />
                            <span v-html="renderInline(row.voice.text)"></span>
                        </template>
                        <template v-else-if="active.size > 0">No strong feelings either way</template>
                    </p>
                </div>
            </li>
        </TransitionGroup>

        <p class="dovetail-note" v-html="renderInline(copy.note)"></p>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { renderInline } from "../landing/inlineMarkup";
import { pedagogyCopy } from "../../content/pedagogyCopy";
import RivalDisc from "./RivalDisc.vue";
import { RIVAL_STYLE } from "./rivals";
import {
    CANDIDATES,
    KIND_ICON,
    KIND_LABEL,
    RIVALS,
    type Candidate,
    type RivalId,
} from "./dovetailScenario";

/** The bar scale's top: a card twice as wanted as neutral fills it. */
const SCALE_MAX = 2;
/** At or below this, a factor is a rejection, not an objection (the gates' ×0.01–0.05). */
const REJECT_AT = 0.05;
/** A factor this far from 1 (either way) counts as a strong voice worth naming. */
const STRONG_BELOW = 0.6;
const STRONG_ABOVE = 1.2;
const STEP_MS = 1300;

const copy = pedagogyCopy.teamOfRivals.widget;

const active = reactive(new Set<RivalId>(RIVALS.map((r) => r.id)));
const stepping = ref(false);
let timers: number[] = [];

function labelOf(id: RivalId): string {
    return RIVALS.find((r) => r.id === id)?.label ?? id;
}

/** Says which way a factor pushes, so ×1.4 / ×0.5 read as boost / penalty. */
function pillTitle(id: RivalId, factor: number): string {
    const kind = factor <= REJECT_AT ? "rejects" : factor > 1 ? "boost" : "penalty";
    return `${labelOf(id)}: ${kind} ×${factor}`;
}

function stopStepping(): void {
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
    stepping.value = false;
}

function toggle(id: RivalId): void {
    stopStepping();
    if (active.has(id)) active.delete(id);
    else active.add(id);
}

function stepThrough(): void {
    stopStepping();
    active.clear();
    stepping.value = true;
    RIVALS.forEach((r, i) => {
        timers.push(window.setTimeout(() => active.add(r.id), STEP_MS * (i + 1)));
    });
    timers.push(window.setTimeout(() => (stepping.value = false), STEP_MS * RIVALS.length));
}

onBeforeUnmount(stopStepping);

function barPct(score: number): number {
    return Math.min(score / SCALE_MAX, 1) * 100;
}

/**
 * The card's strongest voice among the switched-on rivals: a rejection first, then
 * the deepest objection, then the biggest boost, if it's strong enough and has
 * a note.
 */
function voice(c: Candidate): { id: RivalId; text: string } | null {
    const on = RIVALS.map((r) => r.id).filter((id) => active.has(id));
    const reject = on.find((id) => c.rivals[id] <= REJECT_AT);
    if (reject) return { id: reject, text: `**Rejected**: ${c.notes[reject] ?? "not ready"}` };
    const low = on.filter((id) => c.rivals[id] < STRONG_BELOW && c.notes[id]);
    if (low.length) {
        const id = low.reduce((a, b) => (c.rivals[b] < c.rivals[a] ? b : a));
        return { id, text: c.notes[id]! };
    }
    const high = on.filter((id) => c.rivals[id] >= STRONG_ABOVE && c.notes[id]);
    if (high.length) {
        const id = high.reduce((a, b) => (c.rivals[b] > c.rivals[a] ? b : a));
        return { id, text: c.notes[id]! };
    }
    return null;
}

const rows = computed(() =>
    CANDIDATES.map((c, order) => {
        const on = RIVALS.map((r) => r.id).filter((id) => active.has(id));
        const score = on.reduce((p, id) => p * c.rivals[id], 1);
        const pills = on.filter((id) => c.rivals[id] !== 1).map((id) => ({ id, factor: c.rivals[id] }));
        const rejected = on.some((id) => c.rivals[id] <= REJECT_AT);
        return { c, order, score, pills, rejected, voice: voice(c) };
    }).sort((a, b) => b.score - a.score || a.order - b.order),
);

const status = computed(() => {
    if (active.size === 0) return "No techniques switched on: every card starts level, at 1.0.";
    const top = rows.value[0];
    const who = active.size === 1 ? `${labelOf([...active][0])} alone picks` : "Next up";
    return `${who}: ${KIND_LABEL[top.c.kind]}, “${top.c.word}”.`;
});

/** The word with its focus grapheme marked (every occurrence). */
function splitFocus(word: string, focus: string): { text: string; focus: boolean }[] {
    return word
        .split(new RegExp(`(${focus})`))
        .filter(Boolean)
        .map((text) => ({ text, focus: text === focus }));
}
</script>

<style scoped>
.dovetail {
    margin: 24px 0;
}

/* ---- controls ---- */
.dovetail-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.dovetail-rivals {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.rival-chip,
.dovetail-step {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    border-radius: 999px;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
}
/* Text stays ink; the disc carries the colour (on: filled, off: outlined) */
.rival-chip {
    padding: 4px 12px 4px 6px;
    border: 2px solid rgba(33, 33, 33, 0.12);
    background: rgba(255, 255, 255, 0.7);
    color: rgba(33, 33, 33, 0.55);
    transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease;
}
.rival-chip--on {
    border-color: var(--rival-color);
    background: color-mix(in srgb, var(--rival-color) 10%, white);
    color: #212121;
}
.rival-chip:focus-visible,
.dovetail-step:focus-visible {
    outline: 2px solid rgb(var(--v-theme-secondary));
    outline-offset: 2px;
}
.dovetail-step {
    padding: 4px 12px;
    border: 0;
    background: transparent;
    color: rgb(var(--v-theme-secondary));
}
.dovetail-step:hover {
    background: rgba(var(--v-theme-secondary), 0.1);
}
.dovetail-instructions {
    margin: 0 0 12px;
    line-height: 1.6;
    color: rgba(33, 33, 33, 0.75);
}
.dovetail-note {
    margin: 8px 0 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: rgba(33, 33, 33, 0.6);
}
.dovetail-status {
    min-height: 1.6em;
    margin: 12px 0 8px;
    font-size: 0.9rem;
    font-weight: 600;
}

/* ---- the ranked list ---- */
.dovetail-list {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
}
.cand {
    display: grid;
    grid-template-columns: 9.5rem minmax(0, 1fr);
    gap: 16px;
    align-items: center;
    margin-bottom: 8px;
    padding: 10px 14px;
    border: 2px solid transparent;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.75);
    transition: opacity 300ms ease, border-color 300ms ease;
}
.cand--wins {
    border-color: rgba(var(--v-theme-secondary), 0.6);
}
.cand--rejected {
    opacity: 0.5;
}
.rank-move {
    transition: transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.cand-stub {
    display: flex;
    align-items: center;
    gap: 10px;
}
.cand-stub__icon {
    color: rgba(33, 33, 33, 0.45);
}
.cand-stub__kind {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(33, 33, 33, 0.5);
}
.cand-stub__word {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.2;
}
.cand-stub__word mark {
    background: none;
    color: rgb(var(--v-theme-primary));
}

/* The bar: 0 to SCALE_MAX, a tick at 1.0 (where every card starts) */
.cand-bar {
    position: relative;
    height: 10px;
    border-radius: 999px;
    background: rgba(33, 33, 33, 0.08);
}
.cand-bar__fill {
    height: 100%;
    border-radius: 999px;
    background: rgba(33, 33, 33, 0.35);
    transition: width 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.cand--wins .cand-bar__fill {
    background: rgb(var(--v-theme-secondary));
}
.cand-bar__one {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: rgba(33, 33, 33, 0.55);
}
.cand-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin-top: 6px;
}
.cand-num {
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgba(33, 33, 33, 0.7);
}
.cand-next {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-secondary));
}
.cand-pills {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
}
.cand-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px 1px 2px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--rival-color) 10%, white);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    color: rgba(33, 33, 33, 0.75);
}
.cand-why {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 1.4em;
    margin: 4px 0 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: rgba(33, 33, 33, 0.65);
}
/* :deep() — chips in the voice lines are injected via v-html */
.cand-why :deep(code) {
    background: rgba(var(--v-theme-primary), 0.1);
    padding: 0 0.3rem;
    border-radius: 4px;
    font-family: monospace;
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
}

@media (max-width: 600px) {
    .cand {
        grid-template-columns: 1fr;
        gap: 6px;
    }
    .dovetail-controls {
        flex-direction: column;
        align-items: flex-start;
    }
}

@media (prefers-reduced-motion: reduce) {
    .rank-move,
    .cand-bar__fill,
    .cand,
    .rival-chip {
        transition: none;
    }
}
</style>
