<template>
    <!-- The author-family group shot: adults C & R, kids e & a. A clean,
         armless "still life" whose eyes follow the cursor and who greet
         (everyone waves) the first time they reach the center of the viewport.
         Shared model/choreography lives in familyPortrait.ts; this component is
         the presentational, landing-page consumer (the live tuning UI lives in
         /dbg/family). -->
    <div ref="container" class="portrait-container">
        <div class="portrait-frame" :style="frameStyle" @click="celebrateRandom">
            <div ref="stage" class="stage" :style="stageStyle">
                <div
                    v-for="member in members"
                    :key="member.char + member.role"
                    class="member-wrapper"
                    :ref="(el) => registerWrapper(member, el)"
                    :style="memberWrapperStyle(member, config)"
                ></div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import type { LetterInstance } from "../../letterpeople/types";
import { celebrate } from "../../letterpeople/animations";
import {
    DEFAULT_FAMILY_PORTRAIT,
    REST_MOUTH,
    framePortrait,
    memberWrapperStyle,
    buildPortraitLetter,
    applyRestPose,
    wavePortrait,
    startPortraitIdle,
    type PortraitMember,
} from "./familyPortrait";

// Tightly framed: group centered, headroom trimmed (see framePortrait). Kept
// reactive so tightenFraming() can refine the horizontal frame post-build (once
// the letters' true rendered widths are known) without rebuilding the SVGs.
const config = reactive(framePortrait(DEFAULT_FAMILY_PORTRAIT));
const members = config.members;

const container = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const wrappers = new Map<PortraitMember, HTMLElement>();
const instances = new Map<PortraitMember, LetterInstance>();

// The portrait is a fixed-size px stage; we scale it down (never up) to fit the
// available column width, keeping its aspect ratio. The frame element takes the
// scaled box size so surrounding layout reflows correctly (transforms alone
// don't affect layout). transform-origin top-left makes the scaled stage fill
// the frame from its corner.
const scale = ref(1);
const stageStyle = computed(() => ({
    width: config.stage.width + "px",
    height: config.stage.height + "px",
    transform: `scale(${scale.value})`,
    transformOrigin: "top left",
}));
const frameStyle = computed(() => ({
    width: config.stage.width * scale.value + "px",
    height: config.stage.height * scale.value + "px",
}));

const registerWrapper = (m: PortraitMember, el: unknown) => {
    if (el instanceof HTMLElement) wrappers.set(m, el);
};

const updateScale = () => {
    const w = container.value?.clientWidth ?? config.stage.width;
    scale.value = Math.min(1, w / config.stage.width);
};

const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const buildPortrait = async () => {
    await nextTick();
    for (const m of members) {
        const wrapper = wrappers.get(m);
        if (!wrapper) continue;
        instances.get(m)?.destroy();
        const letter = buildPortraitLetter(m, wrapper, config.baseline);
        if (letter) instances.set(m, letter);
    }
    for (const m of members) {
        const letter = instances.get(m);
        if (letter) applyRestPose(m, letter, config.stage);
    }
};

// The square wrappers leave ~40% side air around the tall, narrow glyphs, which
// makes the family read small once the stage is normalized to the column width.
// Reframe to the letters' actual rendered widths (read from each SVG's viewBox)
// so they fill the frame, and re-center on those true bounds. Mutates the
// reactive config in place — wrappers reposition, SVGs stay put.
const SIDE_PAD = 18;
const tightenFraming = () => {
    let left = Infinity;
    let right = -Infinity;
    for (const m of members) {
        const vb = instances.get(m)?.svgElement.getAttribute("viewBox");
        if (!vb) continue;
        const [, , w, h] = vb.split(/\s+/).map(Number);
        const glyphWidth = m.size * Math.min(1, w / h); // square wrapper, "meet"
        left = Math.min(left, m.x - glyphWidth / 2);
        right = Math.max(right, m.x + glyphWidth / 2);
    }
    if (!Number.isFinite(left)) return;
    const shift = SIDE_PAD - left;
    for (const m of members) m.x += shift;
    config.stage.width = right - left + SIDE_PAD * 2;
};

// Clicking the portrait makes a random (not-already-celebrating) member do a
// random celebration. celebrate() skips arm gestures while arms are hidden (and
// confetti, which grows a pair for the toss, puts them away after), so the
// still-life stays clean.
const celebrating = new Set<LetterInstance>();
const celebrateRandom = () => {
    if (reducedMotion) return;
    const idle = [...instances.values()].filter((l) => !celebrating.has(l));
    if (!idle.length) return;
    const letter = idle[Math.floor(Math.random() * idle.length)];
    celebrating.add(letter);
    // celebrate() ends on a slightly different expression and may nudge the
    // gaze; settle back to the portrait face and re-assert cursor tracking.
    celebrate(letter).finally(() => {
        celebrating.delete(letter);
        letter.mouth.updateShape({ ...REST_MOUTH }, { duration: 320 });
        letter.eyes.brows?.express("happy", { duration: 320 });
        if (!letter.eyes.isTracking()) letter.eyes.startTracking({ intensity: 0.35 });
    });
};

let idleStop: (() => void) | undefined;
let viewObserver: IntersectionObserver | undefined;
let resizeObserver: ResizeObserver | undefined;

onMounted(async () => {
    updateScale();
    resizeObserver = new ResizeObserver(updateScale);
    if (container.value) resizeObserver.observe(container.value);

    await buildPortrait();
    tightenFraming();
    updateScale();

    if (reducedMotion) return; // leave the static, posed still-life

    // Eyes follow the cursor immediately; the blink loop keeps them alive.
    idleStop = startPortraitIdle(instances.values(), { enableTracking: true });

    // Wave hello once the family reaches the vertical middle of the viewport.
    // The negative top/bottom rootMargin shrinks the root to a central band, so
    // the greeting holds until they're well into view rather than firing on
    // first peek at the edge.
    viewObserver = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                wavePortrait(instances.values());
                viewObserver?.disconnect();
            }
        },
        { rootMargin: "-35% 0px -35% 0px", threshold: 0 }
    );
    if (stage.value) viewObserver.observe(stage.value);
});

onBeforeUnmount(() => {
    viewObserver?.disconnect();
    resizeObserver?.disconnect();
    idleStop?.();
    for (const letter of instances.values()) letter.destroy();
    instances.clear();
});
</script>

<style scoped>
.portrait-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.portrait-frame {
    position: relative;
    cursor: pointer;
}

/* No frame/background: the family floats directly on the section. Only sizing
   and the responsive transform live here now — the visuals are the letters. */
.stage {
    position: absolute;
    top: 0;
    left: 0;
}

.member-wrapper {
    position: absolute;
}

.member-wrapper :deep(svg) {
    display: block;
    width: 100%;
    height: 100%;
}
</style>
