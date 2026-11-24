<template>
    <div class="portrait-page">
        <h2 class="title">The Author Family Portrait</h2>
        <p class="subtitle">
            Adults <strong>C</strong> &amp; <strong>R</strong>, kids
            <strong>e</strong> &amp; <strong>a</strong> — a homegrown,
            bootstrapped little studio.
        </p>

        <!-- The portrait stage. Letters are bottom-aligned to a shared
             "floor" so size differences read as height differences. -->
        <div ref="stage" class="stage" :style="stageStyle">
            <div class="floor"></div>
            <div
                v-for="member in members"
                :key="member.char + member.role"
                class="member-wrapper"
                :ref="(el) => registerWrapper(member, el)"
                :style="memberWrapperStyle(liveMember(member), config)"
            ></div>
        </div>

        <div class="caption">Letterspractice</div>

        <!-- Screen-only directing controls -->
        <div class="controls">
            <button @click="wave">👋 Wave hello</button>
            <button @click="cheese">📸 Say cheese!</button>
            <button @click="resetPose">🔁 Reset pose</button>
            <button :class="{ active: tracking }" @click="toggleTracking">
                {{ tracking ? "👀 Tracking on" : "👁 Track cursor" }}
            </button>

            <div
                v-for="member in members"
                :key="member.char + member.role + '-ctl'"
                class="member-ctl"
            >
                <span class="slider-label" :style="{ color: member.color }">{{
                    member.char
                }}</span>
                <label class="slider">
                    H
                    <input
                        v-model.number="sizes[member.char]"
                        type="range"
                        min="100"
                        max="380"
                        step="5"
                    />
                    <span class="slider-value">{{ sizes[member.char] }}</span>
                </label>
                <label class="slider">
                    X
                    <input
                        v-model.number="xs[member.char]"
                        type="range"
                        min="0"
                        :max="config.stage.width"
                        step="5"
                    />
                    <span class="slider-value">{{ xs[member.char] }}</span>
                </label>
                <label class="slider">
                    L∠
                    <input
                        v-model.number="leftAngles[member.char]"
                        type="range"
                        min="0"
                        max="360"
                        step="5"
                        @input="liveRotate(member, 'left')"
                    />
                    <span class="slider-value">{{ leftAngles[member.char] }}°</span>
                </label>
                <label class="slider">
                    R∠
                    <input
                        v-model.number="rightAngles[member.char]"
                        type="range"
                        min="0"
                        max="360"
                        step="5"
                        @input="liveRotate(member, 'right')"
                    />
                    <span class="slider-value">{{ rightAngles[member.char] }}°</span>
                </label>
            </div>
        </div>

        <!-- Export: serialize the live config for reuse in another context
             (e.g. the landing-page about/mission portrait). -->
        <div class="export">
            <div class="export-bar">
                <strong>Export config</strong>
                <button @click="copyConfig">
                    {{ copied ? "✅ Copied!" : "📋 Copy" }}
                </button>
            </div>
            <textarea
                class="export-text"
                readonly
                rows="12"
                :value="exportText"
                @focus="(e) => (e.target as HTMLTextAreaElement).select()"
            ></textarea>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import type { LetterInstance } from "../letterpeople/types";
import {
    DEFAULT_FAMILY_PORTRAIT,
    memberWrapperStyle,
    buildPortraitLetter,
    applyRestPose,
    wavePortrait,
    sayCheese,
    startPortraitIdle,
    type PortraitMember,
    type FamilyPortraitConfig,
} from "../components/landing/familyPortrait";

// Identity (char/role/color/z/lineWidth) is fixed; only size/x are tweaked live.
const members = DEFAULT_FAMILY_PORTRAIT.members;

const sizes = reactive<Record<string, number>>(
    Object.fromEntries(members.map((m) => [m.char, m.size]))
);
const xs = reactive<Record<string, number>>(
    Object.fromEntries(members.map((m) => [m.char, m.x]))
);
const leftAngles = reactive<Record<string, number>>(
    Object.fromEntries(members.map((m) => [m.char, m.restLeftAngle]))
);
const rightAngles = reactive<Record<string, number>>(
    Object.fromEntries(members.map((m) => [m.char, m.restRightAngle]))
);

/** A member with its live (slider-driven) tweaks folded in. */
const liveMember = (m: PortraitMember): PortraitMember => ({
    ...m,
    size: sizes[m.char],
    x: xs[m.char],
    restLeftAngle: leftAngles[m.char],
    restRightAngle: rightAngles[m.char],
});

// The full live config — drives layout and is what we export.
const config = computed<FamilyPortraitConfig>(() => ({
    stage: DEFAULT_FAMILY_PORTRAIT.stage,
    baseline: DEFAULT_FAMILY_PORTRAIT.baseline,
    members: members.map(liveMember),
}));

const stage = ref<HTMLElement | null>(null);
const wrappers = new Map<PortraitMember, HTMLElement>();
const instances = new Map<PortraitMember, LetterInstance>();

const stageStyle = computed(() => ({
    width: config.value.stage.width + "px",
    height: config.value.stage.height + "px",
}));

const registerWrapper = (m: PortraitMember, el: unknown) => {
    if (el instanceof HTMLElement) wrappers.set(m, el);
};

/** Build every letter from scratch. Size/position changes restyle live (no
 *  rebuild) since wrapper :style reads `sizes`/`xs` reactively. */
const buildPortrait = async () => {
    await nextTick();
    for (const m of members) {
        const wrapper = wrappers.get(m);
        if (!wrapper) continue;
        instances.get(m)?.destroy();
        const letter = buildPortraitLetter(m, wrapper, config.value.baseline);
        if (letter) instances.set(m, letter);
    }
    resetPose();
};

const resetPose = () => {
    for (const m of members) {
        const letter = instances.get(m);
        if (letter) applyRestPose(liveMember(m), letter, config.value.stage);
    }
};

const wave = () => wavePortrait(instances.values());
const cheese = () => sayCheese(instances.values());

// Idle (blink loop) runs for the lifetime of the view; tracking is toggled.
let idleStop: (() => void) | undefined;
const tracking = ref(false);
const toggleTracking = () => {
    tracking.value = !tracking.value;
    for (const [m, letter] of instances) {
        if (tracking.value) {
            letter.eyes.startTracking({ intensity: 0.5 });
        } else {
            letter.eyes.stopTracking();
            applyRestPose(liveMember(m), letter, config.value.stage); // restore posed gaze
        }
    }
};

/** Live-rotate a single arm as its resting-angle slider is dragged. */
const liveRotate = (m: PortraitMember, side: "left" | "right") => {
    const letter = instances.get(m);
    const angle = side === "left" ? leftAngles[m.char] : rightAngles[m.char];
    letter?.arms[side].rotateTo(angle, { duration: 120 });
};

// --- Export ----------------------------------------------------------------
const exportText = computed(() => JSON.stringify(config.value, null, 2));

const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
const copyConfig = async () => {
    try {
        await navigator.clipboard.writeText(exportText.value);
    } catch {
        // Clipboard API may be unavailable (insecure ctx); the textarea is the
        // fallback — user can select-all and copy manually.
    }
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 1500);
};

onMounted(async () => {
    await buildPortrait();
    setTimeout(wave, 400); // greet on entry
    idleStop = startPortraitIdle(instances.values());
});

onBeforeUnmount(() => {
    idleStop?.();
    for (const letter of instances.values()) letter.destroy();
    instances.clear();
    clearTimeout(copiedTimer);
});
</script>

<style scoped>
.portrait-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    font-family: "Inter", system-ui, sans-serif;
    color: #2a2a2a;
}

.title {
    margin: 0 0 4px;
    font-weight: 800;
}

.subtitle {
    margin: 0 0 20px;
    color: #555;
    font-size: 0.95em;
    text-align: center;
    max-width: 520px;
}

.stage {
    position: relative;
    background: radial-gradient(
        ellipse at 50% 35%,
        #fffdf6 0%,
        #fbf3e2 70%,
        #f3e6cf 100%
    );
    border: 3px solid #2a2a2a;
    border-radius: 16px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
    overflow: hidden;
}

.floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 70px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.06) 100%);
    border-top: 2px solid rgba(0, 0, 0, 0.12);
}

.member-wrapper {
    position: absolute;
}

.member-wrapper :deep(svg) {
    display: block;
    width: 100%;
    height: 100%;
}

.caption {
    margin-top: 14px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: lowercase;
    color: #444;
}

.controls {
    margin-top: 18px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}

.controls button {
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 600;
    background: #fff;
    border: 2px solid #2a2a2a;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease;
}

.controls button:hover {
    background: #f3f3f3;
}

.controls button.active {
    background: #2a2a2a;
    color: #fff;
}

.member-ctl {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    max-width: 240px;
    padding: 6px 10px;
    border: 1px solid #e2e2e2;
    border-radius: 8px;
    background: #fafafa;
}

.controls .slider {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #555;
}

.controls .slider input[type="range"] {
    width: 90px;
}

.slider-label {
    display: inline-block;
    width: 1.2em;
    text-align: center;
    font-weight: 800;
    font-size: 18px;
}

.slider-value {
    width: 3em;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: #777;
}

.export {
    margin-top: 20px;
    width: 100%;
    max-width: 760px;
}

.export-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
}

.export-bar button {
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    background: #fff;
    border: 2px solid #2a2a2a;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease;
}

.export-bar button:hover {
    background: #f3f3f3;
}

.export-text {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    font-family: "SF Mono", "Fira Code", ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: #2a2a2a;
    background: #fafafa;
    border: 1px solid #e2e2e2;
    border-radius: 8px;
    resize: vertical;
    white-space: pre;
}
</style>
