// Shared model + layout + choreography for the "author family portrait" — the
// LetterPeople group shot used on the landing page about/mission section and
// tuned live in the /dbg/family debug view. Both consumers import from here so
// the baseline-anchoring math and the family-photo pose live in exactly one
// place. The debug view's "Export config" emits a FamilyPortraitConfig object;
// drop it straight back in here (or pass it to a consumer) to reproduce a pose.

import { animate } from "animejs";
import { createLetter } from "../../letterpeople";
import type { LetterInstance } from "../../letterpeople/types";
import type { ArmAttachment } from "../../letterpeople/attachments/types";
import { startIdle, type IdleOptions } from "../../letterpeople/animations/presence";

export type PortraitRole = "adult" | "kid";

export interface PortraitMember {
    char: string;
    role: PortraitRole;
    /** OKLCH-ish warm hue; perceptually spaced from the others. */
    color: string;
    /** stacking order — kids sit in front of the adults. */
    z: number;
    /** glyph stroke weight. */
    lineWidth: number;
    /** rendered height in px (size differences read as height differences). */
    size: number;
    /** horizontal center in px within the stage. */
    x: number;
    /** resting rotation of the left arm (deg; 0 = right, 90 = down). */
    restLeftAngle: number;
    /** resting rotation of the right arm (deg; 0 = right, 90 = down). */
    restRightAngle: number;
}

export interface PortraitStage {
    width: number;
    height: number;
    /** baselines rest this many px above the stage bottom. */
    floorFromBottom: number;
}

export interface PortraitBaseline {
    /** glyph body height in viewBox units. */
    viewboxBody: number;
    /** empty descender space below the baseline (matches index.ts). */
    descenderDepth: number;
    borderWidth: number;
}

export interface FamilyPortraitConfig {
    stage: PortraitStage;
    baseline: PortraitBaseline;
    members: PortraitMember[];
}

// --- Defaults ---------------------------------------------------------------
// The current author family: adults C & R, kids e & a. Sizes/positions are the
// hand-tuned starting point; override via an exported config from /dbg/family.
export const DEFAULT_FAMILY_PORTRAIT: FamilyPortraitConfig = {
    stage: { width: 760, height: 560, floorFromBottom: 72 },
    baseline: { viewboxBody: 100, descenderDepth: 35, borderWidth: 4 },
    // Resting arm angles encode the "family photo" pose: adults drape an inner
    // arm down toward the kids (C reaches right, R reaches left); kids raise both.
    members: [
        { char: "C", role: "adult", color: "#3a7ca5", z: 1, lineWidth: 24, size: 300, x: 265, restLeftAngle: 170, restRightAngle: 310 },
        { char: "R", role: "adult", color: "#c1666b", z: 1, lineWidth: 24, size: 285, x: 380, restLeftAngle: 230, restRightAngle: 10 },
        { char: "e", role: "kid", color: "#e8a13a", z: 3, lineWidth: 22, size: 200, x: 440, restLeftAngle: 135, restRightAngle: 45 },
        { char: "a", role: "kid", color: "#5a9367", z: 3, lineWidth: 22, size: 170, x: 210, restLeftAngle: 135, restRightAngle: 45 },
    ],
};

// --- Baseline-aware vertical anchoring --------------------------------------
// Each letter renders into an extended viewBox: a `viewboxBody`-unit body plus
// `descenderDepth` of empty descender space below the baseline, plus `pad` of
// stroke padding on every side (pad = borderWidth + lineWidth/2). Bottom-
// aligning the wrapper would rest that *descender floor* on the ground, not the
// baseline — and since the empty gap scales with size, bigger letters would
// float higher. So we anchor by the baseline: the fraction of wrapper height
// sitting below the baseline, used to offset `bottom`.
export function belowBaselineFrac(member: PortraitMember, baseline: PortraitBaseline): number {
    const pad = baseline.borderWidth + member.lineWidth / 2;
    const extViewbox = baseline.viewboxBody + baseline.descenderDepth;
    const totalH = extViewbox + 2 * pad;
    return (baseline.descenderDepth + pad) / totalH; // descender gap + bottom padding
}

/** Absolute-position style for a member's wrapper element within the stage. */
export function memberWrapperStyle(
    member: PortraitMember,
    config: FamilyPortraitConfig
): Record<string, string> {
    const size = member.size;
    return {
        position: "absolute",
        width: size + "px",
        height: size + "px",
        left: member.x - size / 2 + "px",
        bottom:
            config.stage.floorFromBottom -
            belowBaselineFrac(member, config.baseline) * size +
            "px",
        zIndex: String(member.z),
    };
}

export interface FrameOptions {
    /** px of margin on each side of the group (default 24). */
    sidePad?: number;
    /** px of headroom above the tallest letter — room for waving arms (default 52). */
    topPad?: number;
}

/**
 * Derive a tightly-framed copy of a portrait config: horizontally centers the
 * group within the stage and trims the stage height to hug the tallest letter
 * (leaving `topPad` headroom for waving arms). The source config (e.g. the
 * hand-tuned DEFAULT) defines the group's shape and spacing; this reframes it
 * for presentation without re-tuning coordinates by hand. Letters stay anchored
 * to the floor, so trimming height only removes empty headroom.
 */
export function framePortrait(
    config: FamilyPortraitConfig,
    options: FrameOptions = {}
): FamilyPortraitConfig {
    const { sidePad = 24, topPad = 52 } = options;
    const { members, baseline, stage } = config;

    // Horizontal: center the group's (square) wrapper boxes. Glyphs are centered
    // within their wrapper, so centering the boxes centers the glyphs.
    const groupLeft = Math.min(...members.map((m) => m.x - m.size / 2));
    const groupRight = Math.max(...members.map((m) => m.x + m.size / 2));
    const width = groupRight - groupLeft + sidePad * 2;
    const shift = sidePad - groupLeft;

    // Vertical: a glyph's top sits `floorFromBottom + size·(body/totalH)` above
    // the stage bottom — i.e. the wrapper top minus its empty top stroke-pad
    // (see belowBaselineFrac for the totalH breakdown). The tallest governs how
    // much height we need; everything above that is just headroom to waste.
    const padOf = (m: PortraitMember) => baseline.borderWidth + m.lineWidth / 2;
    const totalHOf = (m: PortraitMember) =>
        baseline.viewboxBody + baseline.descenderDepth + 2 * padOf(m);
    const glyphTop = (m: PortraitMember) =>
        stage.floorFromBottom + m.size * (baseline.viewboxBody / totalHOf(m));
    const height = Math.max(...members.map(glyphTop)) + topPad;

    return {
        stage: { ...stage, width, height },
        baseline,
        members: members.map((m) => ({ ...m, x: m.x + shift })),
    };
}

// --- Rendering --------------------------------------------------------------
const ADULT_ARM_LENGTH = 17;
const KID_ARM_LENGTH = 14;
const BORDER_COLOR = "#2a2a2a";
/** The settled "family photo" mouth: a soft, mostly-closed smile. */
export const REST_MOUTH = { openness: 0.12, mood: 0.9 };

// Each arm's natural (built) length, remembered per arm. The wave gesture
// collapses arms to length 0 between greetings (see wavePortrait), so we can't
// read the natural length back off the arm — we stash it here at build time.
const armNaturalLength = new WeakMap<ArmAttachment, number>();

/**
 * Build a single LetterPerson into `wrapper` (clears any prior content).
 *
 * Arms are built but kept hidden: in "still life" the solid black arms clutter
 * the glyph outlines, so the portrait stays armless at rest. Arms only appear
 * for the duration of a wave (see wavePortrait), growing out from the shoulder
 * and retracting when done.
 */
export function buildPortraitLetter(
    member: PortraitMember,
    wrapper: HTMLElement,
    baseline: PortraitBaseline
): LetterInstance | null {
    wrapper.innerHTML = "";
    const armLength = member.role === "adult" ? ADULT_ARM_LENGTH : KID_ARM_LENGTH;
    const letter = createLetter(member.char, wrapper, {
        color: member.color,
        borderColor: BORDER_COLOR,
        lineWidth: member.lineWidth,
        borderWidth: baseline.borderWidth,
        showEyes: true,
        showMouth: true,
        showArms: false, // armless still life — arms only show during a wave
        showEyebrows: true,
        armColor: BORDER_COLOR,
        armLength,
        mouthParams: { ...REST_MOUTH },
    });
    if (!letter) return null;
    letter.svgElement.setAttribute("width", "100%");
    letter.svgElement.setAttribute("height", "100%");
    armNaturalLength.set(letter.arms.left, armLength);
    armNaturalLength.set(letter.arms.right, armLength);
    return letter;
}

// --- Choreography -----------------------------------------------------------
/**
 * The warm "family photo" pose: arms settle to each member's resting angles
 * (see DEFAULT_FAMILY_PORTRAIT), adults gaze down-and-inward toward stage
 * center, kids grin up at the camera. Arm angles are data so they can be tuned
 * live in /dbg/family and round-tripped through an exported config.
 */
export function applyRestPose(
    member: PortraitMember,
    letter: LetterInstance,
    stage: PortraitStage
): void {
    letter.eyes.brows?.express("happy", { duration: 250 });
    letter.mouth.updateShape({ ...REST_MOUTH });

    if (member.role === "adult") {
        const inward = member.x < stage.width / 2 ? 1 : -1;
        letter.eyes.lookAt({ x: inward * 1.6, y: 1.6 }, { duration: 300 });
    } else {
        letter.eyes.lookAt({ x: 0, y: -1.2 }, { duration: 300 });
    }

    letter.arms.left.rotateTo(member.restLeftAngle, { duration: 350 });
    letter.arms.right.rotateTo(member.restRightAngle, { duration: 350 });
}

export interface WaveOptions {
    /** base wave duration in ms (default 650). */
    duration?: number;
    /** +/- random spread applied to each member's duration (default 180). */
    durationJitter?: number;
    /** max random onset delay per member, in ms (default 320). */
    onsetJitter?: number;
    /** time to grow the arm out from the shoulder, in ms (default 240). */
    growDuration?: number;
    /** time to retract + fade the arm away after waving, in ms (default 300). */
    retractDuration?: number;
}

// Drive an arm's length from `from` to `to` over `duration`, optionally fading
// opacity in lockstep. We tween a scalar and rebuild the arm geometry each
// frame via setLength(_, {duration: 0}) — setLength's own scale-based animation
// can't grow from length 0 (it divides by the old length), and the per-frame
// rebuild keeps the arm correctly oriented along its current angle as it grows.
function animateArmLength(
    arm: ArmAttachment,
    from: number,
    to: number,
    duration: number,
    ease: string,
    fade?: { from: number; to: number }
): Promise<void> {
    const state = { t: 0 };
    const el = arm.element;
    return animate(state, {
        t: 1,
        duration,
        ease,
        onUpdate: () => {
            arm.setLength(from + (to - from) * state.t, { duration: 0 });
            if (fade) el.style.opacity = String(fade.from + (fade.to - fade.from) * state.t);
        },
    }).then(() => {});
}

/**
 * One member's greeting: grow the chosen arm out from the shoulder, wave, then
 * retract + fade it back to nothing — leaving the clean armless still life.
 */
async function waveArmFromHidden(
    arm: ArmAttachment,
    duration: number,
    delay: number,
    growDuration: number,
    retractDuration: number
): Promise<void> {
    const natural = armNaturalLength.get(arm) ?? arm.getCurrentLength();
    if (delay) await new Promise((r) => setTimeout(r, delay));

    // Start collapsed and invisible, then grow + fade in from the shoulder.
    arm.setLength(0, { duration: 0 });
    arm.element.style.opacity = "0";
    await animateArmLength(arm, 0, natural, growDuration, "outQuad", { from: 0, to: 1 });

    // Wave (raises from, and returns to, the arm's resting angle).
    await arm.wave({ duration });

    // Retract + fade back out.
    await animateArmLength(arm, natural, 0, retractDuration, "inQuad", { from: 1, to: 0 });
    arm.element.style.opacity = "0";
}

/**
 * Everyone waves — a lively, un-synchronized greeting. Each member grows one
 * randomly chosen arm out from the shoulder, waves with jittered duration and
 * onset (so the group reads as individuals rather than a chorus line), then
 * retracts the arm — restoring the clean armless still life.
 */
export function wavePortrait(
    letters: Iterable<LetterInstance>,
    options: WaveOptions = {}
): void {
    const {
        duration = 650,
        durationJitter = 180,
        onsetJitter = 320,
        growDuration = 240,
        retractDuration = 300,
    } = options;
    for (const letter of letters) {
        const side = Math.random() < 0.5 ? "left" : "right";
        const dur = duration + (Math.random() * 2 - 1) * durationJitter;
        const delay = Math.random() * onsetJitter;
        void waveArmFromHidden(
            letter.arms[side],
            dur,
            delay,
            growDuration,
            retractDuration
        );
    }
}

/**
 * Keep the portrait alive: a per-member blink loop (and optional cursor
 * tracking). Blinks are desynchronized because each member schedules its own
 * randomized interval. Tracking is OFF by default so the posed family-photo
 * gaze (see applyRestPose) is preserved — flip it on for a livelier, eyes-
 * follow-the-cursor feel. Returns a cleanup fn that stops every member's loop.
 */
export function startPortraitIdle(
    letters: Iterable<LetterInstance>,
    options: IdleOptions = {}
): () => void {
    const stops = [...letters].map((l) =>
        startIdle(l, { enableTracking: false, ...options })
    );
    return () => stops.forEach((stop) => stop());
}

/** "Say cheese!" — big open smiles + a synchronized blink, then settle back. */
export async function sayCheese(letters: Iterable<LetterInstance>): Promise<void> {
    const all = [...letters];
    await Promise.all(
        all.map((l) => l.mouth.updateShape({ openness: 0.5, mood: 1 }, { duration: 200 }))
    );
    for (const letter of all) letter.eyes.blink({ duration: 180 });
    setTimeout(() => {
        for (const letter of all) {
            letter.mouth.updateShape({ ...REST_MOUTH }, { duration: 400 });
        }
    }, 700);
}
