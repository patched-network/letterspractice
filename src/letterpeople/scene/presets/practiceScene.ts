/**
 * Practice scene preset — lowercase at computer, uppercase nearby with
 * a secondary activity (book or kitchen). Conveys supervised independence.
 */

import { Stage } from "../Stage";
import { createComputerProp, type ComputerPropController } from "../../props/computer";
import { createBookProp, type BookPropController } from "../../props/book";
import { createKitchenProp, type KitchenPropController } from "../../props/kitchen";
import { randomVibrancyColor } from "../../util/color";
import {
  runSceneLoop,
  delay,
  type BeatDef,
  type SceneContext,
} from "../choreography";

type SecondaryProp = "book" | "kitchen";

const ENCOURAGE_PHRASES = [
  "You're doing great!",
  "Keep going!",
  "Nice work!",
  "Almost there!",
];

function randomPhrase(): string {
  return ENCOURAGE_PHRASES[Math.floor(Math.random() * ENCOURAGE_PHRASES.length)];
}

// ─── Beats ────────────────────────────────────────────────────

const childWorksBeat: BeatDef = {
  name: "childWorks",
  weight: 4,
  async play(ctx) {
    const lower = ctx.actors.lower;
    const computer = ctx.props.computer as ComputerPropController;
    if (!lower || !computer) return;

    await computer.type(lower);
  },
};

const childFocusBeat: BeatDef = {
  name: "childFocus",
  weight: 3,
  async play(ctx) {
    const lower = ctx.actors.lower;
    const computer = ctx.props.computer as ComputerPropController;
    if (!lower || !computer) return;

    // Just look at screen for a while
    const screenPt = computer.getStagePoint("screen");
    await lower.lookAt(screenPt);
    await delay(2500 + Math.random() * 1500);
  },
};

const adultReadsBeat: BeatDef = {
  name: "adultReads",
  weight: 3,
  async play(ctx) {
    const upper = ctx.actors.upper;
    const book = ctx.props.secondary as BookPropController | undefined;
    if (!upper || !book || !("read" in book)) return;

    await book.read(upper);
  },
};

const adultChopsBeat: BeatDef = {
  name: "adultChops",
  weight: 3,
  async play(ctx) {
    const upper = ctx.actors.upper;
    const kitchen = ctx.props.secondary as KitchenPropController | undefined;
    if (!upper || !kitchen || !("chop" in kitchen)) return;

    await kitchen.chop(upper);
  },
};

const checkInGlanceBeat: BeatDef = {
  name: "checkInGlance",
  weight: 2,
  async play(ctx) {
    const upper = ctx.actors.upper;
    const lower = ctx.actors.lower;
    if (!upper || !lower) return;

    // Adult glances toward child
    await upper.lookAt(lower);
    await delay(1200 + Math.random() * 800);
  },
};

const childGlancesBackBeat: BeatDef = {
  name: "childGlancesBack",
  weight: 1,
  async play(ctx) {
    const upper = ctx.actors.upper;
    const lower = ctx.actors.lower;
    if (!upper || !lower) return;

    // Child looks over at adult briefly
    await lower.lookAt(upper);
    await delay(800 + Math.random() * 600);
  },
};

const encouragementBeat: BeatDef = {
  name: "encouragement",
  weight: 1,
  async play(ctx) {
    const upper = ctx.actors.upper;
    const lower = ctx.actors.lower;
    if (!upper || !lower) return;

    await upper.lookAt(lower);
    await delay(200);
    await upper.say(randomPhrase(), 2500);
    await delay(1000);
  },
};

function buildBeats(secondaryType: SecondaryProp): BeatDef[] {
  const beats: BeatDef[] = [
    childWorksBeat,
    childFocusBeat,
    checkInGlanceBeat,
    childGlancesBackBeat,
    encouragementBeat,
  ];

  if (secondaryType === "book") {
    beats.push(adultReadsBeat);
  } else {
    beats.push(adultChopsBeat);
  }

  return beats;
}

// ─── Preset ───────────────────────────────────────────────────

export interface PracticeSceneHandle {
  cleanup: () => void;
  ctx: SceneContext;
}

export interface PracticeSceneOptions {
  /** Which secondary prop the adult uses. Default: random. */
  secondaryProp?: SecondaryProp;
}

/**
 * Mount and start a Practice scene on the given stage.
 * Returns a handle with cleanup function.
 */
export function startPracticeScene(
  stage: Stage,
  letter: string,
  options: PracticeSceneOptions = {}
): PracticeSceneHandle {
  const secondaryType =
    options.secondaryProp ??
    (Math.random() < 0.5 ? "book" : "kitchen");

  // Child at computer (front, center-left)
  const lower = stage.addActor("lower", letter.toLowerCase(), {
    x: 120,
    xRef: 27,
    z: 80,
    heightRef: 31,
    letterOptions: {
      color: randomVibrancyColor(),
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true,
    },
  });

  // Adult nearby (back-right)
  const upper = stage.addActor("upper", letter.toUpperCase(), {
    x: 320,
    xRef: 71,
    z: 55,
    heightRef: 38,
    letterOptions: {
      color: randomVibrancyColor(),
      showEyes: true,
      showMouth: true,
      showArms: true,
      showEyebrows: true,
    },
  });

  // Computer for the child
  const computer = createComputerProp(stage, {
    kind: "staged",
    x: 100,
    xRef: 22,
    z: 78,
  });

  // Secondary prop for the adult
  let secondary: BookPropController | KitchenPropController;
  if (secondaryType === "book") {
    secondary = createBookProp(stage, {
      kind: "held",
      actor: upper!,
      hand: "left",
    });
  } else {
    secondary = createKitchenProp(stage, {
      kind: "held",
      actor: upper!,
      hand: "right",
    });
  }

  // Initial orientation
  if (lower) {
    const screenPt = computer.getStagePoint("screen");
    lower.lookAt(screenPt);
    lower.instance.body.turnTo(-10);
  }
  if (upper) {
    upper.instance.body.turnTo(-15);
  }

  // Start ambient glow on computer
  computer.idle();

  const ctx: SceneContext = {
    stage,
    actors: { upper: upper!, lower: lower! },
    props: { computer, secondary },
  };

  const stopLoop = runSceneLoop(ctx, buildBeats(secondaryType), {
    intervalRange: [3500, 8000],
    idleIntensity: 0.3,
  });

  const cleanup = () => {
    stopLoop();
    computer.unmount();
    secondary.unmount();
    stage.destroy();
  };

  return { cleanup, ctx };
}
