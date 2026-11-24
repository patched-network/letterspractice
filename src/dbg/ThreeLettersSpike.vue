<template>
    <v-container fluid class="three-spike">
        <v-row>
            <v-col cols="12" md="9">
                <v-card>
                    <v-card-title>🧊 LetterPeople → three.js (spike)</v-card-title>
                    <v-card-text>
                        <div class="svg-ref">
                            <div class="row-label">SVG (reference)</div>
                            <WordDisplay
                                :key="svgKey"
                                :text="text"
                                :height="90"
                                :options="svgWordOptions"
                                :letter-options="svgLetterOptions"
                            />
                        </div>
                        <div ref="canvasHost" class="canvas-host">
                            <div class="row-labels">
                                <div
                                    v-for="(label, i) in rowLabels"
                                    :key="label"
                                    class="row-label overlay"
                                    :style="{ top: rowLabelTop(i) }"
                                >
                                    {{ label }}
                                </div>
                            </div>
                        </div>
                        <div class="stats">
                            {{ stats.fps }} fps{{ stats.fps === 0 ? " (idle: nothing moving)" : "" }} ·
                            {{ stats.triangles.toLocaleString() }} tris ·
                            {{ stats.calls }} draw calls · {{ stats.letters }} letters · build
                            {{ stats.buildMs }} ms · cpu {{ stats.frameMs.toFixed(2) }} ms/frame
                            (budget 16.7)
                        </div>
                    </v-card-text>
                </v-card>
            </v-col>

            <v-col cols="12" md="3">
                <v-card>
                    <v-card-text>
                        <v-text-field v-model="text" label="Text" density="compact" />
                        <v-select
                            v-model="layout"
                            :items="layoutItems"
                            label="Layout"
                            density="compact"
                        />
                        <v-select
                            v-if="layout !== 'compare'"
                            v-model="outline"
                            :items="outlineItems"
                            label="Outline"
                            density="compact"
                        />
                        <template v-if="layout === 'stage'">
                            <v-select
                                v-model="gait"
                                :items="gaitItems"
                                label="Gait"
                                density="compact"
                                hide-details
                            />
                            <div class="slider-label">Walk speed: {{ walkSpeed }}×</div>
                            <v-slider v-model="walkSpeed" :min="0.25" :max="2" :step="0.25" density="compact" hide-details />
                            <div class="btn-row mb-3">
                                <v-btn size="small" @click="walkBy(0, 160)">Come here</v-btn>
                                <v-btn size="small" @click="walkBy(0, -160)">Go back</v-btn>
                                <v-btn size="small" @click="walkBy(-220, 0)">← Left</v-btn>
                                <v-btn size="small" @click="walkBy(220, 0)">Right →</v-btn>
                                <v-btn size="small" @click="walkBy(160, 120)">Diagonal</v-btn>
                                <v-btn size="small" @click="walkHome">Home</v-btn>
                                <v-btn size="small" @click="faceCamera">Face me</v-btn>
                                <v-btn size="small" @click="stopWalking">Stop</v-btn>
                            </div>
                        </template>
                        <v-select
                            v-model="shading"
                            :items="['standard', 'toon']"
                            label="Shading"
                            density="compact"
                        />
                        <v-select
                            v-model="motion"
                            :items="motionItems"
                            label="Motion"
                            density="compact"
                        />
                        <div class="slider-label">Depth: {{ depth }}</div>
                        <v-slider v-model="depth" :min="2" :max="60" :step="1" density="compact" hide-details />
                        <div class="slider-label">Bevel: {{ bevel }}</div>
                        <v-slider v-model="bevel" :min="0" :max="6" :step="0.5" density="compact" hide-details />
                        <div class="slider-label">Outline width: {{ outlineWidth }}</div>
                        <v-slider v-model="outlineWidth" :min="1" :max="10" :step="0.5" density="compact" hide-details />
                        <div class="slider-label">Edge px (edges style): {{ edgePx }}</div>
                        <v-slider v-model="edgePx" :min="1" :max="8" :step="0.5" density="compact" hide-details />
                        <v-switch v-model="showEyes" label="Eyes" density="compact" hide-details />
                        <v-switch v-model="showBrows" label="Brows" density="compact" hide-details />
                        <div v-if="showBrows" class="btn-row">
                            <v-btn
                                v-for="e in emotions"
                                :key="e"
                                size="small"
                                @click="expressAll(e)"
                            >
                                {{ e }}
                            </v-btn>
                        </div>
                        <v-switch v-model="showMouth" label="Mouth" density="compact" hide-details />
                        <template v-if="showMouth">
                            <div class="slider-label">Mood: {{ mood }}</div>
                            <v-slider v-model="mood" :min="0" :max="1" :step="0.05" density="compact" hide-details />
                            <div class="slider-label">Openness: {{ openness }}</div>
                            <v-slider v-model="openness" :min="0" :max="1" :step="0.05" density="compact" hide-details />
                            <v-switch v-model="chatter" label="Chatter" density="compact" hide-details />
                            <v-btn size="small" class="mt-1" @click="speakAll">Speak (wave)</v-btn>
                        </template>
                        <v-switch v-model="showArms" label="Arms" density="compact" hide-details />
                        <template v-if="showArms">
                            <div class="slider-label">
                                Shoulder depth: {{ shoulderDepth }} (0 back · 1 front)
                            </div>
                            <v-slider v-model="shoulderDepth" :min="0" :max="1" :step="0.05" density="compact" hide-details />
                            <div class="btn-row">
                                <v-btn size="small" @click="armsDo('wave')">Wave</v-btn>
                                <v-btn size="small" @click="armsDo('waveBoth')">Wave both</v-btn>
                                <v-btn size="small" @click="armsDo('victory')">Arms up</v-btn>
                                <v-btn size="small" @click="armsDo('relax')">Relax</v-btn>
                                <v-btn size="small" @click="armsDo('depthSweep')">Depth sweep</v-btn>
                                <v-btn size="small" @click="armsDo('fists')">Fists</v-btn>
                                <v-btn size="small" @click="armsDo('bedHands')">Bed hands</v-btn>
                            </div>
                            <div class="slider-label">Fist size: {{ fistSize }}</div>
                            <v-slider v-model="fistSize" :min="6" :max="28" :step="1" density="compact" hide-details />
                        </template>
                        <div class="celebrate-row">
                            <v-select
                                v-model="celebration"
                                :items="celebrationItems"
                                label="Celebration"
                                density="compact"
                                hide-details
                            />
                            <v-btn size="small" color="primary" @click="celebrateAll">Go</v-btn>
                        </div>
                        <div class="btn-row">
                            <v-btn size="small" @click="sayNoAll">Say no</v-btn>
                            <v-btn size="small" @click="headShakeAll">Head shake</v-btn>
                        </div>
                        <v-switch v-model="orbit" label="Orbit camera (drag)" density="compact" hide-details />
                        <v-btn size="small" class="mt-2" @click="resetCamera">Reset camera</v-btn>
                        <p class="hint mt-3">
                            Eyes track the pointer. "Compare" stacks every outline treatment
                            in one scene / one WebGL context. On "Stage", click the floor to
                            send the word walking there.
                        </p>
                    </v-card-text>
                </v-card>
            </v-col>
        </v-row>
    </v-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import WordDisplay from "../letterpeople/vue/WordDisplay.vue";
import { generateVibrancyRainbow } from "../letterpeople/util/color";
import {
    createLetter3D,
    type Letter3D,
    type OutlineStyle,
    type Shading,
} from "../letterpeople/three/letterMesh";
import { performer3D } from "../letterpeople/three/performer";
import { bedHands, releaseBedHands } from "../letterpeople/three/fist";
import { createWalker, type Gait, type Walker } from "../letterpeople/three/locomotion";
import type { EmotionPreset } from "../letterpeople/attachments/eyebrow";
import {
    celebrate,
    RANDOM_CELEBRATIONS_3D,
    type CelebrationType,
} from "../letterpeople/animations/celebrations";
import { headShakeNo, sayNo } from "../letterpeople/animations/speech";

const text = ref("Hi, jump!");
const layout = ref<"compare" | "single" | "stage">("compare");
const gait = ref<Gait>("waddle");
const gaitItems: Gait[] = ["waddle", "hop"];
const walkSpeed = ref(1);
const outline = ref<OutlineStyle>("cookie");
const shading = ref<Shading>("standard");
const motion = ref<"still" | "sway" | "spin" | "hop">("sway");
const depth = ref(14);
const bevel = ref(1.5);
const outlineWidth = ref(4);
const edgePx = ref(3);
const showEyes = ref(true);
const showBrows = ref(true);
const showMouth = ref(true);
const mood = ref(0.7);
const openness = ref(0.2);
const chatter = ref(false);
const showArms = ref(true);
const shoulderDepth = ref(1);
/** Fist size for the Fists / Bed hands buttons (the bed lesson's i uses 16). */
const fistSize = ref(16);
const orbit = ref(true);

const layoutItems = [
    { title: "Compare all outlines", value: "compare" },
    { title: "Single", value: "single" },
    { title: "Stage (walking)", value: "stage" },
];
const outlineItems: OutlineStyle[] = ["none", "cookie", "hull", "edges"];
const motionItems = ["still", "sway", "spin", "hop"];

const LETTER_SPACING = 12;
const ROW_PITCH = 175;

const rows = computed<OutlineStyle[]>(() =>
    layout.value === "compare" ? outlineItems : [outline.value],
);
const rowLabels = computed(() =>
    layout.value === "stage"
        ? ["3D · stage · click the floor"]
        : rows.value.map((r) => `3D · ${r}`),
);

const colors = computed(() =>
    generateVibrancyRainbow(Math.max(1, text.value.length), 0.72, 0.15, 20),
);

// --- SVG reference ---
const svgKey = computed(() =>
    [text.value, outlineWidth.value, showEyes.value, showBrows.value, showMouth.value, showArms.value, mood.value, openness.value].join("|"),
);
const svgWordOptions = computed(() => ({
    spacing: 4,
    letterOptions: {
        borderWidth: outlineWidth.value,
        showEyes: showEyes.value,
        showEyebrows: showBrows.value,
        showMouth: showMouth.value,
        mouthParams: { mood: mood.value, openness: openness.value },
        showArms: showArms.value,
    },
}));
const svgLetterOptions = computed(() =>
    Object.fromEntries([...text.value].map((_, i) => [i, { color: colors.value[i] }])),
);

// --- three.js ---
const canvasHost = ref<HTMLDivElement | null>(null);
const stats = ref({ fps: 0, triangles: 0, calls: 0, letters: 0, buildMs: 0, frameMs: 0 });

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls | null = null;
let wordGroup = new THREE.Group();
let letters: { l: Letter3D; index: number; walker?: Walker }[] = [];
let floor: THREE.Mesh | null = null;
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0
/** Each walker's place in the word, relative to the word's centre. */
const homeOffset = new Map<Walker, { x: number; z: number }>();
/** Where the word's centre stood when built. */
let homeCentre = { x: 0, z: 0 };
let raf = 0;
let resizeObs: ResizeObserver | null = null;
const pointer = new THREE.Vector2(0, 0);
const pointerTarget = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -120); // z = 120, in front of letters
let sceneBounds = new THREE.Box3();

function rowLabelTop(i: number): string {
    // Rough overlay placement; rows are evenly spaced in screen space when camera is reset.
    const n = rows.value.length;
    return `${(i / n) * 100 + 1}%`;
}

function disposeWord() {
    clearPendingWalks();
    homeOffset.clear();
    letters.forEach(({ l, walker }) => {
        walker?.dispose();
        l.dispose();
    });
    letters = [];
    scene.remove(wordGroup);
    wordGroup = new THREE.Group();
}

function buildWord() {
    if (!renderer) return;
    const t0 = performance.now();
    disposeWord();

    const chars = [...text.value];
    rows.value.forEach((style, row) => {
        const rowGroup = new THREE.Group();
        let x = 0;
        chars.forEach((ch, i) => {
            if (ch === " ") {
                x += 40;
                return;
            }
            const l = createLetter3D(ch, {
                color: colors.value[i],
                depth: depth.value,
                bevel: bevel.value,
                outline: style,
                shading: shading.value,
                outlineWidth: outlineWidth.value,
                edgePx: edgePx.value,
                showEyes: showEyes.value,
                showBrows: showBrows.value,
                showMouth: showMouth.value,
                mouthParams: { mood: mood.value, openness: openness.value },
                showArms: showArms.value,
                shoulderDepth: shoulderDepth.value,
                onChange: invalidate,
            });
            if (!l) return;
            if (layout.value === "stage") {
                const walker = createWalker(l);
                walker.setPosition(x + l.width / 2, 0);
                rowGroup.add(walker.object);
                letters.push({ l, index: i, walker });
            } else {
                l.root.position.x = x + l.width / 2;
                rowGroup.add(l.root);
                letters.push({ l, index: i });
            }
            x += l.width + LETTER_SPACING;
        });
        rowGroup.position.x = -(x - LETTER_SPACING) / 2;
        rowGroup.position.y = -row * ROW_PITCH;
        wordGroup.add(rowGroup);
    });
    scene.add(wordGroup);

    if (floor) floor.visible = layout.value === "stage";
    const ws = walkers();
    if (ws.length) {
        const c = centroid(ws);
        homeCentre = c;
        ws.forEach(({ w }) => {
            const p = w.getPosition();
            homeOffset.set(w, { x: p.x - c.x, z: p.z - c.z });
        });
    }

    const size = renderer.getSize(new THREE.Vector2());
    letters.forEach(({ l }) => l.setResolution(size.x, size.y));

    sceneBounds = new THREE.Box3().setFromObject(wordGroup);
    stats.value.letters = letters.length;
    stats.value.buildMs = Math.round(performance.now() - t0);
    invalidate();
}

function resetCamera() {
    if (!renderer) return;
    const center = sceneBounds.getCenter(new THREE.Vector3());
    const size = sceneBounds.getSize(new THREE.Vector3());
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const distH = size.y / 2 / Math.tan(fovRad / 2);
    const distW = size.x / 2 / (Math.tan(fovRad / 2) * camera.aspect);
    const dist = Math.max(distH, distW) * 1.15 + size.z;
    if (layout.value === "stage") {
        // Raised and further back, looking down at the floor, with room to walk
        const d = dist * 2.1;
        camera.position.set(center.x, center.y + d * 0.42, center.z + d);
    } else {
        camera.position.set(center.x, center.y, center.z + dist);
    }
    camera.lookAt(center);
    controls?.target.copy(center);
    controls?.update();
    invalidate();
}

// --- walking (stage layout) ---
function walkers() {
    return letters.flatMap(({ walker, index }) => (walker ? [{ w: walker, index }] : []));
}
function centroid(ws: { w: Walker }[]) {
    const ps = ws.map(({ w }) => w.getPosition());
    return {
        x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
        z: ps.reduce((a, p) => a + p.z, 0) / ps.length,
    };
}
let pendingWalks: number[] = [];
function clearPendingWalks() {
    pendingWalks.forEach((t) => clearTimeout(t));
    pendingWalks = [];
}
/** Walk the word, in formation, so its centre ends at (x, z). */
function walkWordTo(x: number, z: number) {
    clearPendingWalks();
    walkers().forEach(({ w }, k) => {
        const off = homeOffset.get(w) ?? { x: 0, z: 0 };
        pendingWalks.push(
            window.setTimeout(
                () =>
                    w.walkTo(
                        { x: x + off.x, z: z + off.z },
                        { gait: gait.value, speed: walkSpeed.value },
                    ),
                k * 70,
            ),
        );
    });
}
function walkBy(dx: number, dz: number) {
    const ws = walkers();
    if (!ws.length) return;
    const c = centroid(ws);
    walkWordTo(c.x + dx, c.z + dz);
}
function walkHome() {
    walkWordTo(homeCentre.x, homeCentre.z);
}
function faceCamera() {
    clearPendingWalks();
    walkers().forEach(({ w }) => w.turnTo(0, { gait: gait.value, speed: walkSpeed.value }));
}
function stopWalking() {
    clearPendingWalks();
    walkers().forEach(({ w }) => w.stop());
}

let downAt: { x: number; y: number } | null = null;
function onPointerDown(e: PointerEvent) {
    downAt = { x: e.clientX, y: e.clientY };
}
function onPointerUp(e: PointerEvent) {
    const start = downAt;
    downAt = null;
    // A click, not an orbit drag
    if (layout.value !== "stage" || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) {
        return;
    }
    const rect = renderer!.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3());
    const rowGroup = wordGroup.children[0];
    if (!hit || !rowGroup) return;
    rowGroup.worldToLocal(hit);
    walkWordTo(hit.x, hit.z);
}

function onPointerMove(e: PointerEvent) {
    const rect = renderer!.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    invalidate(); // eyes follow the pointer
}

function resize() {
    if (!renderer || !canvasHost.value) return;
    const w = canvasHost.value.clientWidth;
    const h = Math.round(Math.min(720, Math.max(320, w * 0.62)));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    letters.forEach(({ l }) => l.setResolution(w, h));
    invalidate();
}

// Blink / chatter scheduling: per-letter next-event time
const nextBlink = new Map<Letter3D, number>();
const nextChatter = new Map<Letter3D, number>();

const emotions: EmotionPreset[] = ["neutral", "happy", "sad", "angry", "surprised"];
// Mouth to pair with each brow preset, taken from the values the SVG
// sequences already use alongside it (celebrations.ts, speech.ts). "angry"
// has no precedent there; it's a closed, flat-to-frowning guess.
const EMOTION_MOUTH: Record<EmotionPreset, { openness: number; mood: number }> = {
    neutral: { openness: 0.05, mood: 0.7 }, // confetti wind-up
    happy: { openness: 0.25, mood: 0.9 }, // celebration peak
    sad: { openness: 0.05, mood: 0.25 }, // headShakeNo
    angry: { openness: 0.05, mood: 0.2 },
    surprised: { openness: 0.4, mood: 0.75 }, // spin
};

function expressAll(e: EmotionPreset) {
    letters.forEach(({ l }) => l.brows?.express(e, { duration: 250 }));
    // Via the sliders, so they stay truthful and the SVG row follows
    openness.value = EMOTION_MOUTH[e].openness;
    mood.value = EMOTION_MOUTH[e].mood;
}

// --- celebrations: the production sequences, driven through performer3D ---
const celebration = ref<CelebrationType | "random">("random");
const celebrationItems: (CelebrationType | "random")[] = ["random", ...RANDOM_CELEBRATIONS_3D, "phew"];
const performing = new Set<Letter3D>();

function celebrateAll() {
    letters.forEach(({ l, index }) => {
        if (performing.has(l)) return;
        setTimeout(() => {
            performing.add(l);
            celebrate(performer3D(l), { type: celebration.value }).finally(() =>
                performing.delete(l),
            );
        }, index * 80);
    });
}

/** Run a production sequence on each letter (staggered), face suspended meanwhile. */
function performAll(run: (l: Letter3D) => Promise<void>) {
    letters.forEach(({ l, index }) => {
        if (performing.has(l)) return;
        setTimeout(() => {
            performing.add(l);
            run(l).finally(() => performing.delete(l));
        }, index * 80);
    });
}
// No audio here: a word's worth of simultaneous phonemes is just noise
const sayNoAll = () => performAll((l) => sayNo(performer3D(l)));
const headShakeAll = () => performAll((l) => headShakeNo(performer3D(l)));

type ArmsAction = "wave" | "waveBoth" | "victory" | "relax" | "depthSweep" | "fists" | "bedHands";

function armsDo(action: ArmsAction) {
    letters.forEach(({ l, index }) => {
        const arms = l.arms;
        if (!arms) return;
        const delay = index * 70;
        if (action === "wave") arms.wave({ delay });
        else if (action === "waveBoth") arms.wave({ arm: "both", delay });
        else if (action === "relax") arms.relax({ duration: 300, delay });
        else if (action === "victory") {
            // As in celebrations.ts "victory"
            arms.left.rotateTo(210, { duration: 200, delay });
            arms.right.rotateTo(330, { duration: 200, delay });
        } else if (action === "fists") {
            // Toggle the hands between balls and fists, the arms where they are
            const shape = arms.left.getHand() === "fist" ? "ball" : "fist";
            const opts = { duration: 300, delay, size: fistSize.value };
            arms.left.setHand(shape, opts);
            arms.right.setHand(shape, opts);
        } else if (action === "bedHands") {
            // Into the bed hands (knuckles together, thumbs up), or back out
            if (arms.left.getHand() === "fist") void releaseBedHands(l);
            else void bedHands(l, { size: fistSize.value });
        } else if (action === "depthSweep") {
            // Shoulders ride the side wall front → back → front
            const start = shoulderDepth.value;
            arms.setShoulderDepth(0, { duration: 700, delay }).then(() =>
                arms.setShoulderDepth(start, { duration: 700 }),
            );
        }
    });
}

function speakAll() {
    const byIndex = [...letters].sort((a, b) => a.index - b.index);
    byIndex.forEach(({ l, index }) => {
        setTimeout(() => l.mouth?.animateSpeak({ duration: 160 }), index * 90);
    });
}

// --- render on demand ---
// A frame is drawn only when something changed: letters report every visual
// change through onChange (pose, face, attachments, walkers, confetti), and
// pointer / camera / resize / rebuild invalidate directly. Continuous work
// (idle motion presets, camera damping, a blink in progress) keeps frames
// coming; otherwise the loop sleeps until the next scheduled blink/chatter.
let frameQueued = false;
let inFrame = false;
let wakeTimer = 0;

function invalidate() {
    // Changes made while a frame runs are drawn by that frame
    if (inFrame || frameQueued || !renderer) return;
    frameQueued = true;
    raf = requestAnimationFrame(frame);
}

function wakeAt(tSec: number) {
    clearTimeout(wakeTimer);
    wakeTimer = window.setTimeout(invalidate, Math.max(0, tSec * 1000 - performance.now()));
}

function frame(now: number) {
    frameQueued = false;
    inFrame = true;
    const t = now / 1000;
    const cpuStart = performance.now();
    let keepGoing = motion.value !== "still";
    let nextEvent = Infinity;

    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(lookPlane, pointerTarget);

    const walkerOf = new Map(letters.map(({ l, walker }) => [l, walker]));
    for (const { l, index } of letters) {
        const phase = index * 0.45;
        const r = l.root;
        r.rotation.set(0, 0, 0);
        r.position.y = 0;
        r.scale.set(1, 1, 1);
        if (motion.value === "sway") {
            r.rotation.y = Math.sin(t * 1.3 + phase) * 0.45;
            r.rotation.z = Math.sin(t * 1.9 + phase) * 0.05;
        } else if (motion.value === "spin") {
            const cycle = (t * 0.35 + index * 0.08) % 1; // spin during first 35% of cycle
            const p = Math.min(1, cycle / 0.35);
            const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            r.rotation.y = eased * Math.PI * 2;
        } else if (motion.value === "hop") {
            const s = Math.max(0, Math.sin(t * 4 - phase));
            r.position.y = s * 18;
            const squash = 1 - Math.max(0, -Math.sin(t * 4 - phase)) * 0.12;
            r.scale.set(2 - squash, squash, 1);
        }

        walkerOf.get(l)?.update();

        // A celebration owns the face while it runs
        if (performing.has(l)) continue;

        l.lookAt(pointerTarget);

        let nb = nextBlink.get(l);
        if (nb === undefined) {
            nb = t + 1 + Math.random() * 4;
            nextBlink.set(l, nb);
        }
        const dt = t - nb;
        if (dt > 0.16) {
            nb = t + 2 + Math.random() * 4;
            nextBlink.set(l, nb);
            l.setBlink(0);
        } else if (dt > 0) {
            l.setBlink(1 - Math.abs(dt - 0.08) / 0.08);
            keepGoing = true; // mid-blink
        }
        nextEvent = Math.min(nextEvent, nb);

        if (chatter.value && l.mouth) {
            let nc = nextChatter.get(l);
            if (nc === undefined || t > nc) {
                if (nc !== undefined) l.mouth.animateSpeak({ duration: 110 + Math.random() * 90 });
                nc = t + 0.35 + Math.random() * 0.9;
                nextChatter.set(l, nc);
            }
            nextEvent = Math.min(nextEvent, nc);
        }
    }

    if (controls?.update()) keepGoing = true; // damping still settling
    renderer!.render(scene, camera);
    // CPU side only (scene update + draw submission); GPU work runs async.
    frameMsSum += performance.now() - cpuStart;
    frameCount++;
    inFrame = false;

    if (keepGoing) invalidate();
    else if (nextEvent < Infinity) wakeAt(nextEvent);
}

// Stats on a timer, so an idle page reads 0 fps rather than a stale number
let frameCount = 0;
let frameMsSum = 0;
let lastStatsAt = performance.now();
let statsTimer = 0;
function updateStats() {
    const now = performance.now();
    stats.value.fps = Math.round((frameCount * 1000) / (now - lastStatsAt));
    if (frameCount && renderer) {
        stats.value.triangles = renderer.info.render.triangles;
        stats.value.calls = renderer.info.render.calls;
        stats.value.frameMs = frameMsSum / frameCount;
    }
    frameMsSum = 0;
    frameCount = 0;
    lastStatsAt = now;
}

onMounted(() => {
    const host = canvasHost.value!;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.prepend(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7f3ea");
    camera = new THREE.PerspectiveCamera(30, 1, 1, 10000);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a98f, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-300, 500, 700);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(400, 200, -500);
    scene.add(rim);

    // Drawn first and never written to the depth buffer: a backdrop, not a
    // solid. Descender tails that sink below the baseline stay visible
    // through it instead of being clipped off.
    floor = new THREE.Mesh(
        new THREE.PlaneGeometry(6000, 6000),
        new THREE.MeshStandardMaterial({ color: "#e8e0cf", roughness: 1, depthWrite: false }),
    );
    floor.renderOrder = -10;
    floor.rotation.x = -Math.PI / 2;
    floor.visible = false;
    scene.add(floor);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enabled = orbit.value;
    controls.addEventListener("change", invalidate);

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    resizeObs = new ResizeObserver(resize);
    resizeObs.observe(host);
    resize();
    buildWord();
    resetCamera();
    statsTimer = window.setInterval(updateStats, 500);
    invalidate();
});

onBeforeUnmount(() => {
    cancelAnimationFrame(raf);
    clearTimeout(wakeTimer);
    clearInterval(statsTimer);
    resizeObs?.disconnect();
    disposeWord();
    controls?.dispose();
    renderer?.domElement.removeEventListener("pointermove", onPointerMove);
    renderer?.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer?.domElement.removeEventListener("pointerup", onPointerUp);
    floor?.geometry.dispose();
    (floor?.material as THREE.Material | undefined)?.dispose();
    renderer?.dispose();
    renderer = null;
});

watch([mood, openness], () => {
    letters.forEach(({ l }) =>
        l.mouth?.updateShape({ mood: mood.value, openness: openness.value }, { duration: 150 }),
    );
});
watch(chatter, () => {
    nextChatter.clear();
    invalidate();
});
watch(motion, invalidate); // continuous presets restart the loop
watch(shoulderDepth, (t) => letters.forEach(({ l }) => l.arms?.setShoulderDepth(t)));
watch([text, layout, outline, shading, depth, bevel, outlineWidth, edgePx, showEyes, showBrows, showMouth, showArms], () => {
    buildWord();
    resetCamera();
});
// Walking composes with the idle motions, but sway-while-waddling is noise
watch(layout, (v) => {
    if (v === "stage") motion.value = "still";
});
watch(orbit, (v) => {
    if (controls) controls.enabled = v;
});
</script>

<style scoped>
.canvas-host {
    position: relative;
    width: 100%;
}
.canvas-host :deep(canvas) {
    display: block;
    width: 100%;
    border-radius: 8px;
}
.row-labels {
    position: absolute;
    inset: 0;
    pointer-events: none;
}
.row-label {
    font: 600 12px/1.2 system-ui, sans-serif;
    color: #555;
}
.row-label.overlay {
    position: absolute;
    left: 8px;
    background: rgba(255, 255, 255, 0.75);
    padding: 2px 6px;
    border-radius: 4px;
}
.svg-ref {
    margin-bottom: 8px;
}
.stats {
    margin-top: 6px;
    font: 12px/1.4 ui-monospace, monospace;
    color: #666;
}
.slider-label {
    font-size: 12px;
    color: #666;
    margin-top: 6px;
}
.celebrate-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
}
.btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
}
.hint {
    font-size: 12px;
    color: #777;
}
</style>
