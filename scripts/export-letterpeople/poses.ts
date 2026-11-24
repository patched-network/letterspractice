import type { LetterInstance } from "../../src/letterpeople/types";

export type PoseName =
  | "resting"
  | "talking"
  | "waving"
  | "arms-out"
  | "happy"
  | "grin"
  | "beam";

export const POSE_NAMES: PoseName[] = [
  "resting",
  "talking",
  "waving",
  "arms-out",
  "happy",
  "grin",
  "beam",
];

export interface PoseRecipe {
  mouth: { openness: number; mood: number };
  brows: "neutral" | "happy" | "sad" | "angry" | "surprised";
  showArms: boolean;
  // Optional arm angles when showArms is true (degrees, anime/SVG convention).
  // Omit to leave arms at their default rest angles.
  armAngles?: { left?: number; right?: number };
}

// Mouth shape values mirror the emotion table in
// src/dbg/expressions/ExpressionsDebug.vue (lines 225-231).
// Arm angles for "arms-out" mirror celebrateVictory in
// src/letterpeople/animations/celebrations.ts (lines 138-140).
export const POSES: Record<PoseName, PoseRecipe> = {
  resting: {
    mouth: { openness: 0.1, mood: 0.5 },
    brows: "neutral",
    showArms: false,
  },
  talking: {
    mouth: { openness: 0.4, mood: 0.55 },
    brows: "neutral",
    showArms: false,
  },
  waving: {
    mouth: { openness: 0.2, mood: 0.85 },
    brows: "happy",
    showArms: true,
    armAngles: { right: -90 }, // right arm raised; left at default rest
  },
  "arms-out": {
    mouth: { openness: 0.1, mood: 0.6 },
    brows: "neutral",
    showArms: true,
    armAngles: { left: -150, right: -30 },
  },
  // Three smiles of increasing openness, no arms. Used by printables to
  // give a set of letters some spread while keeping every face cheerful.
  happy: {
    mouth: { openness: 0.12, mood: 0.8 },
    brows: "happy",
    showArms: false,
  },
  grin: {
    mouth: { openness: 0.3, mood: 0.9 },
    brows: "happy",
    showArms: false,
  },
  beam: {
    mouth: { openness: 0.5, mood: 0.95 },
    brows: "happy",
    showArms: false,
  },
};

// Apply a pose recipe to a letter, with all controller calls at duration: 0
// so the letter lands at the target frame in one tick.
export async function applyPose(letter: LetterInstance, pose: PoseName): Promise<void> {
  const recipe = POSES[pose];

  const promises: Promise<unknown>[] = [];

  // Mouth shape
  promises.push(letter.mouth.updateShape(recipe.mouth, { duration: 0 }));

  // Brow expression
  if (letter.eyes.brows) {
    promises.push(letter.eyes.brows.express(recipe.brows, { duration: 0 }));
  }

  // Arm posing — only if pose says showArms (otherwise arms weren't created)
  if (recipe.showArms && recipe.armAngles && letter.arms) {
    if (recipe.armAngles.left !== undefined && letter.arms.left) {
      promises.push(letter.arms.left.rotateTo(recipe.armAngles.left, { duration: 0 }));
    }
    if (recipe.armAngles.right !== undefined && letter.arms.right) {
      promises.push(letter.arms.right.rotateTo(recipe.armAngles.right, { duration: 0 }));
    }
  }

  await Promise.all(promises);
}
