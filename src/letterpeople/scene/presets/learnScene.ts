/**
 * Learn scene preset — uppercase + lowercase together at a shared computer.
 * Conveys guided, collaborative learning.
 */

import { Stage } from "../Stage";
import { createComputerProp, type ComputerPropController } from "../../props/computer";
import { randomVibrancyColor } from "../../util/color";
import {
  runSceneLoop,
  delay,
  type BeatDef,
  type SceneContext,
} from "../choreography";

const LEARN_PHRASES = [
  "Let's try this one!",
  "Look here!",
  "Good job!",
  "What's next?",
  "You got it!",
];

function randomPhrase(): string {
  return LEARN_PHRASES[Math.floor(Math.random() * LEARN_PHRASES.length)];
}

// ─── Beats ────────────────────────────────────────────────────

const sharedGazeBeat: BeatDef = {
  name: "sharedGaze",
  weight: 4,
  async play(ctx) {
    const upper = ctx.actors.upper;
    const lower = ctx.actors.lower;
    const computer = ctx.props.computer as ComputerPropController;
    if (!upper || !lower || !computer) return;

    await computer.sharedGaze(upper, lower);
    await delay(2000 + Math.random() * 1500);
  },
};

const learnerTypesBeat: BeatDef = {
  name: "learnerTypes",
  weight: 3,
  async play(ctx) {
    const lower = ctx.actors.lower;
    const computer = ctx.props.computer as ComputerPropController;
    if (!lower || !computer) return;

    await computer.type(lower);
  },
};

const guideSpeaksBeat: BeatDef = {
  name: "guideSpeaks",
  weight: 2,
  async play(ctx) {
    const upper = ctx.actors.upper;
    const lower = ctx.actors.lower;
    if (!upper || !lower) return;

    // Lower glances at upper
    await lower.lookAt(upper);
    await delay(300);

    // Upper says something encouraging
    await upper.say(randomPhrase(), 2500);

    // Both look at each other briefly
    await upper.lookAt(lower);
    await delay(1500);
  },
};

const mutualGlanceBeat: BeatDef = {
  name: "mutualGlance",
  weight: 1,
  async play(ctx) {
    const upper = ctx.actors.upper;
    const lower = ctx.actors.lower;
    if (!upper || !lower) return;

    // Look at each other
    await Promise.all([upper.lookAt(lower), lower.lookAt(upper)]);
    await delay(1200 + Math.random() * 800);
  },
};

const LEARN_BEATS: BeatDef[] = [
  sharedGazeBeat,
  learnerTypesBeat,
  guideSpeaksBeat,
  mutualGlanceBeat,
];

// ─── Preset ───────────────────────────────────────────────────

export interface LearnSceneHandle {
  cleanup: () => void;
  ctx: SceneContext;
}

export interface LearnSceneOptions {
  /** Use stage reference-frame coordinates when available. Default: true */
  useReferenceFrame?: boolean;
}

/**
 * Mount and start a Learn scene on the given stage.
 * Returns a handle with cleanup function.
 */
export function startLearnScene(
  stage: Stage,
  letter: string,
  options: LearnSceneOptions = {}
): LearnSceneHandle {
  const useReferenceFrame = options.useReferenceFrame ?? true;

  // Create actors
  const upper = stage.addActor("upper", letter.toUpperCase(), {
    x: useReferenceFrame ? 0 : 100,
    xRef: useReferenceFrame ? 22 : undefined,
    z: 65,
    height: useReferenceFrame ? undefined : 180,
    heightRef: useReferenceFrame ? 42 : undefined,
    letterOptions: {
      color: randomVibrancyColor(),
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true,
    },
  });

  const lower = stage.addActor("lower", letter.toLowerCase(), {
    x: useReferenceFrame ? 0 : 240,
    xRef: useReferenceFrame ? 53 : undefined,
    z: 75,
    height: useReferenceFrame ? undefined : 135,
    heightRef: useReferenceFrame ? 31 : undefined,
    letterOptions: {
      color: randomVibrancyColor(),
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true,
    },
  });

  // Create computer between them
  const computer = createComputerProp(stage, {
    kind: "staged",
    x: useReferenceFrame ? 38 : 170,
    z: 70,
  });

  // Initial orientation — both look toward screen
  if (upper && lower) {
    const screenPt = computer.getStagePoint("screen");
    upper.lookAt(screenPt);
    lower.lookAt(screenPt);
    upper.instance.body.turnTo(12);
    lower.instance.body.turnTo(-12);
  }

  // Start ambient glow
  computer.idle();

  const ctx: SceneContext = {
    stage,
    actors: { upper: upper!, lower: lower! },
    props: { computer },
  };

  const stopLoop = runSceneLoop(ctx, LEARN_BEATS, {
    intervalRange: [3000, 7000],
    idleIntensity: 0.3,
  });

  const cleanup = () => {
    stopLoop();
    computer.unmount();
    stage.destroy();
  };

  return { cleanup, ctx };
}
