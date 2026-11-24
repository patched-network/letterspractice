/**
 * Keyboard Layout Data
 *
 * Defines the QWERTY keyboard layout with normalized positions
 * for progressive keyboard rendering.
 *
 * Coordinate system:
 * - x: 0 (leftmost key 'Q') to 1 (rightmost key 'P' on top row)
 * - y: 0 (top row) to 1 (bottom row)
 * - Keys are positioned relative to a standard QWERTY layout
 *
 * Row structure (simplified - numbers and letters don't coexist):
 * - Row 1: QWERTY row (Q W E R T Y U I O P) OR Numbers (1 2 3 4 5 6 7 8 9 0)
 * - Row 2: Home row (A S D F G H J K L) + Enter top portion
 * - Row 3: Bottom row (Z X C V B N M) + Enter bottom portion
 * - Row 4: Space row (spacebar + arrows)
 */

import { getPhonemeUrlForLetter } from "@/audio/letterToArpabet";

export interface KeyDefinition {
  /** The lowercase letter (or 'space' for spacebar, 'enter' for enter key) */
  letter: string;

  /** Normalized x position (0-1) within the full keyboard */
  x: number;

  /** Normalized y position (0-1) within the full keyboard */
  y: number;

  /** Row index (1 = top QWERTY/number row, 2 = home row, 3 = bottom row, 4 = space row) */
  row: 1 | 2 | 3 | 4;

  /** Column index within the row */
  col: number;

  /** Which hand typically types this key */
  hand: "left" | "right" | "both";

  /** Typical finger used (1 = pinky, 2 = ring, 3 = middle, 4 = index, 0 = thumb) */
  finger: 0 | 1 | 2 | 3 | 4;

  /** Audio URL for the phoneme (primary sound) */
  phonemeAudio?: string;

  /** Alternative phoneme audio URLs (for letters with multiple sounds) */
  altPhonemeAudio?: string[];

  /** Letter name audio (e.g., "the letter S") */
  letterNameAudio?: string;

  /** Width multiplier for wide keys (default 1, spacebar is ~6) */
  widthMultiplier?: number;

  /** Whether this is a special key (not a letter) */
  isSpecial?: boolean;

  /** For L-shaped keys like Enter, defines the shape geometry */
  shape?: {
    type: "L-shape";
    /** Top portion spans from this row */
    topRow: 2;
    /** Bottom portion spans to this row */
    bottomRow: 3;
    /** Width of top portion in key units */
    topWidth: number;
    /** Width of bottom portion in key units */
    bottomWidth: number;
    /** Right edge column position (aligned with P's right edge) */
    rightEdgeCol: number;
  };
}

export interface KeyboardRow {
  keys: KeyDefinition[];
  /** Horizontal offset for this row (QWERTY stagger) */
  offset: number;
}

// Standard QWERTY layout with normalized positions
// The stagger values match a typical keyboard
// Row 1 = QWERTY/numbers, Row 2 = home, Row 3 = bottom, Row 4 = space
export const ROW_OFFSETS: Record<number, number> = {
  1: 0, // Top row (QWERTY or Numbers) - no offset
  2: 0.25, // Home row (ASDF) - right offset
  3: 0.75, // Bottom row (ZXCV) - more right offset
  4: 0, // Space row - centered
};

// Key width as fraction of total row width
const KEY_WIDTH = 0.1;

/**
 * Build a key definition from basic parameters
 */
function buildKey(
  letter: string,
  row: 1 | 2 | 3 | 4,
  col: number,
  hand: "left" | "right" | "both",
  finger: 0 | 1 | 2 | 3 | 4,
  options?: {
    widthMultiplier?: number;
    isSpecial?: boolean;
    shape?: KeyDefinition["shape"];
  },
): KeyDefinition {
  const offset = ROW_OFFSETS[row as keyof typeof ROW_OFFSETS] || 0;

  return {
    letter: letter.toLowerCase(),
    x: (col + offset) * KEY_WIDTH + KEY_WIDTH / 2,
    y: (row - 1) / 3, // Normalize to 0-1 range (4 rows: 1-4 maps to 0-1)
    row,
    col,
    hand,
    finger,
    // Letter → ARPAbet → audio URL (handles vowel mappings correctly)
    phonemeAudio: options?.isSpecial
      ? undefined
      : getPhonemeUrlForLetter(letter),
    widthMultiplier: options?.widthMultiplier,
    isSpecial: options?.isSpecial,
    shape: options?.shape,
  };
}

// Number row: 1234567890 (now at row 1, same position as QWERTY)
const NUMBER_ROW: KeyDefinition[] = [
  buildKey("1", 1, 0, "left", 1),
  buildKey("2", 1, 1, "left", 2),
  buildKey("3", 1, 2, "left", 3),
  buildKey("4", 1, 3, "left", 4),
  buildKey("5", 1, 4, "left", 4),
  buildKey("6", 1, 5, "right", 4),
  buildKey("7", 1, 6, "right", 4),
  buildKey("8", 1, 7, "right", 3),
  buildKey("9", 1, 8, "right", 2),
  buildKey("0", 1, 9, "right", 1),
];

// Top row: QWERTYUIOP (row 1)
const TOP_ROW: KeyDefinition[] = [
  buildKey("q", 1, 0, "left", 1),
  buildKey("w", 1, 1, "left", 2),
  buildKey("e", 1, 2, "left", 3),
  buildKey("r", 1, 3, "left", 4),
  buildKey("t", 1, 4, "left", 4),
  buildKey("y", 1, 5, "right", 4),
  buildKey("u", 1, 6, "right", 4),
  buildKey("i", 1, 7, "right", 3),
  buildKey("o", 1, 8, "right", 2),
  buildKey("p", 1, 9, "right", 1),
];

// Home row: ASDFGHJKL (row 2)
const HOME_ROW: KeyDefinition[] = [
  buildKey("a", 2, 0, "left", 1),
  buildKey("s", 2, 1, "left", 2),
  buildKey("d", 2, 2, "left", 3),
  buildKey("f", 2, 3, "left", 4),
  buildKey("g", 2, 4, "left", 4),
  buildKey("h", 2, 5, "right", 4),
  buildKey("j", 2, 6, "right", 4),
  buildKey("k", 2, 7, "right", 3),
  buildKey("l", 2, 8, "right", 2),
];

// Bottom row: ZXCVBNM (row 3)
const BOTTOM_ROW: KeyDefinition[] = [
  buildKey("z", 3, 0, "left", 1),
  buildKey("x", 3, 1, "left", 2),
  buildKey("c", 3, 2, "left", 3),
  buildKey("v", 3, 3, "left", 4),
  buildKey("b", 3, 4, "left", 4),
  buildKey("n", 3, 5, "right", 4),
  buildKey("m", 3, 6, "right", 4),
];

// Space bar (row 4)
const SPACE_KEY: KeyDefinition = buildKey("space", 4, 2, "both", 0, {
  widthMultiplier: 6,
  isSpecial: true,
});

// Arrow keys (positioned to the right of spacebar when active)
const LEFT_ARROW_KEY: KeyDefinition = buildKey("arrowleft", 4, 7, "right", 4, {
  widthMultiplier: 1,
  isSpecial: true,
});

const RIGHT_ARROW_KEY: KeyDefinition = buildKey(
  "arrowright",
  4,
  8,
  "right",
  4,
  {
    widthMultiplier: 1,
    isSpecial: true,
  },
);

// Shift key (positioned to the left of spacebar when active)
const SHIFT_KEY: KeyDefinition = buildKey("shift", 4, 0, "left", 0, {
  widthMultiplier: 1.5,
  isSpecial: true,
});

/**
 * Backspace key. Its home slot is the top row just right of P (col 10); that
 * slot sits in the keyboard's right margin and is only used when the margin
 * has room for it. When the layout is width-constrained (phones), the
 * component moves it onto the space row instead, right-aligned with P's right
 * edge. See ProgressiveKeyboard's renderedKeys.
 */
const BACKSPACE_KEY: KeyDefinition = buildKey("backspace", 1, 10, "right", 1, {
  widthMultiplier: 1.5,
  isSpecial: true,
});

/**
 * Enter key - Standard rectangular key on row 3
 * Positioned to align right edge with P (row 1, col 9)
 * P right edge = col 10 equivalent
 * Row 3 offset = 0.75 columns
 * Target: (col + 0.75) + 2.0 width = 10.0
 * So: col + 0.75 = 8.0 → col = 7.25
 */
const ENTER_KEY: KeyDefinition = buildKey("enter", 3, 7.25, "right", 1, {
  widthMultiplier: 2.0,
  isSpecial: true,
});

/**
 * Complete keyboard layout
 * Note: Numbers are now at row 1 (same visual position as QWERTY)
 * When using numbers, don't include letters and vice versa
 */
export const KEYBOARD_LAYOUT: KeyboardRow[] = [
  { keys: TOP_ROW, offset: ROW_OFFSETS[1] },
  { keys: HOME_ROW, offset: ROW_OFFSETS[2] },
  { keys: BOTTOM_ROW, offset: ROW_OFFSETS[3] },
  { keys: [SPACE_KEY], offset: ROW_OFFSETS[4] },
];

/**
 * Flat array of all number keys for easy lookup
 */
export const ALL_NUMBER_KEYS: KeyDefinition[] = NUMBER_ROW;

/**
 * Flat array of all letter keys for easy lookup (excludes space, numbers, and enter)
 */
export const ALL_LETTER_KEYS: KeyDefinition[] = KEYBOARD_LAYOUT.slice(
  0,
  3,
).flatMap((row) => row.keys);

/**
 * Flat array of all keys including space, arrows, numbers, and enter
 */
export const ALL_KEYS: KeyDefinition[] = [
  ...ALL_NUMBER_KEYS,
  ...ALL_LETTER_KEYS,
  SPACE_KEY,
  LEFT_ARROW_KEY,
  RIGHT_ARROW_KEY,
  ENTER_KEY,
  SHIFT_KEY,
  BACKSPACE_KEY,
];

/**
 * The space key definition (for direct access)
 */
export { SPACE_KEY };

/**
 * The arrow key definitions (for direct access)
 */
export { LEFT_ARROW_KEY, RIGHT_ARROW_KEY };

/**
 * The shift key definition (for direct access)
 */
export { SHIFT_KEY };

/**
 * The backspace key definition (for direct access)
 */
export { BACKSPACE_KEY };

/**
 * The enter key definition (for direct access)
 */
export { ENTER_KEY };

/**
 * The number row keys (for direct access)
 */
export { NUMBER_ROW };

/**
 * Map from letter to key definition for O(1) lookups
 */
export const KEY_MAP: Map<string, KeyDefinition> = new Map(
  ALL_KEYS.map((key) => [key.letter, key]),
);

/**
 * Get the key definition for a letter
 */
export function getKeyDefinition(letter: string): KeyDefinition | undefined {
  return KEY_MAP.get(letter.toLowerCase());
}

/**
 * Get all keys for a specific hand
 */
export function getKeysByHand(hand: "left" | "right"): KeyDefinition[] {
  return ALL_KEYS.filter((key) => key.hand === hand);
}

/**
 * Get keys by row index
 */
export function getKeysByRow(row: number): KeyDefinition[] {
  if (row === 1) return TOP_ROW;
  if (row === 2) return HOME_ROW;
  if (row === 3) return BOTTOM_ROW;
  if (row === 4) return [SPACE_KEY];
  return [];
}

/**
 * Calculate the bounding box for a subset of keys
 * Returns normalized coordinates that can be used for layout
 */
export function getKeysBoundingBox(letters: string[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
} {
  const keys = letters
    .map((l) => getKeyDefinition(l))
    .filter((k): k is KeyDefinition => k !== undefined);

  if (keys.length === 0) {
    return {
      minX: 0.5,
      maxX: 0.5,
      minY: 0.5,
      maxY: 0.5,
      centerX: 0.5,
      centerY: 0.5,
      width: 0,
      height: 0,
    };
  }

  const xs = keys.map((k) => k.x);
  const ys = keys.map((k) => k.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Letters ordered by typical phonics teaching progression
 * (common consonants and short vowels first)
 */
export const PHONICS_PROGRESSION = [
  // Initial consonants and short vowels
  "s",
  "a",
  "t",
  "p",
  "i",
  "n",
  // More consonants
  "c",
  "k",
  "e",
  "h",
  "r",
  "m",
  "d",
  // Additional common letters
  "g",
  "o",
  "u",
  "l",
  "f",
  "b",
  // Less common consonants
  "j",
  "z",
  "w",
  "v",
  "y",
  "x",
  "q",
];

/**
 * Get the first N letters from the phonics progression
 */
export function getProgressionLetters(count: number): string[] {
  return PHONICS_PROGRESSION.slice(
    0,
    Math.min(count, PHONICS_PROGRESSION.length),
  );
}

/**
 * Get a comparator function for sorting letters by their true left-to-right keyboard position.
 * Uses actual x-coordinates from key definitions for spatial ordering.
 * Unknown letters are sorted to the end.
 */
export function getKeyboardOrderComparator(): (a: string, b: string) => number {
  return (a: string, b: string) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    const aKey = getKeyDefinition(aLower);
    const bKey = getKeyDefinition(bLower);

    // Unknown keys go to the end
    if (!aKey && !bKey) return 0;
    if (!aKey) return 1;
    if (!bKey) return -1;

    // Sort by x-coordinate (left to right)
    // x already includes the row offset, so this gives true left-to-right ordering
    return aKey.x - bKey.x;
  };
}

/**
 * Sort an array of letters by their keyboard position (left-to-right, top-to-bottom).
 * Returns a new sorted array.
 */
export function sortByKeyboardOrder<T extends { letter: string }>(
  items: T[],
): T[] {
  const comparator = getKeyboardOrderComparator();
  return [...items].sort((a, b) => comparator(a.letter, b.letter));
}

/**
 * Maximum layout bounds for stable container sizing
 * This represents the full extent of the keyboard regardless of which keys are active
 */
export const MAX_LAYOUT_BOUNDS = {
  /** Minimum row (QWERTY row) */
  minRow: 1,
  /** Maximum row (space row) */
  maxRow: 4,
  /** Minimum effective column (leftmost key with offset) */
  minCol: 0,
  /** Maximum effective column (P at col 9 with no offset) */
  maxCol: 9,
  /** Total number of rows when showing letters */
  letterRowCount: 4, // QWERTY, home, bottom, space
  /** Total number of rows when showing numbers only */
  numberRowCount: 2, // numbers (at row 1), space (at row 4) - but visually 2 rows apart
  /** QWERTY row width in columns (widest row) */
  maxColSpan: 10,
};

/**
 * Common letter groupings for early phonics exercises and number/multiple choice
 */
export const LETTER_GROUPS = {
  spaceOnly: ["space"],
  /** Numbers 1-4 (for 4-choice questions) */
  numbers1to4: ["1", "2", "3", "4"],
  /** Numbers 1-4 with space (for 4-choice with submit) */
  numbers1to4WithSpace: ["1", "2", "3", "4", "space"],
  /** Numbers 1-6 (for 6-choice questions) */
  numbers1to6: ["1", "2", "3", "4", "5", "6"],
  /** Numbers 1-6 with space (for 6-choice with submit) */
  numbers1to6WithSpace: ["1", "2", "3", "4", "5", "6", "space"],
  /** All number keys */
  allNumbers: ALL_NUMBER_KEYS.map((k) => k.letter),
  /** All numbers with space */
  allNumbersWithSpace: [...ALL_NUMBER_KEYS.map((k) => k.letter), "space"],
  /** Short vowels */
  shortVowels: ["a", "e", "i", "o", "u"],
  /** CVC-capable set (can form consonant-vowel-consonant words) */
  cvcBasic: ["s", "a", "t", "p", "i", "n"],
  /** CVC with spacebar */
  cvcBasicWithSpace: ["s", "a", "t", "p", "i", "n", "space"],
  /** CVC with spacebar and enter */
  cvcBasicWithSpaceAndEnter: ["s", "a", "t", "p", "i", "n", "space", "enter"],
  /** Extended CVC set */
  cvcExtended: [
    "s",
    "a",
    "t",
    "p",
    "i",
    "n",
    "c",
    "k",
    "e",
    "h",
    "r",
    "m",
    "d",
  ],
  /** Home row keys (good for typing practice) */
  homeRow: ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  /** Home row with enter */
  homeRowWithEnter: ["a", "s", "d", "f", "g", "h", "j", "k", "l", "enter"],
  /** Left hand only */
  leftHand: ALL_LETTER_KEYS.filter((k) => k.hand === "left").map(
    (k) => k.letter,
  ),
  /** Right hand only */
  rightHand: ALL_LETTER_KEYS.filter((k) => k.hand === "right").map(
    (k) => k.letter,
  ),
  /** All letters (no space) */
  allLetters: ALL_LETTER_KEYS.map((k) => k.letter),
  /** All letters with space */
  allLettersWithSpace: [...ALL_LETTER_KEYS.map((k) => k.letter), "space"],
  /** All letters with space and enter */
  allLettersWithSpaceAndEnter: [
    ...ALL_LETTER_KEYS.map((k) => k.letter),
    "space",
    "enter",
  ],
  /** All keys (numbers, letters, space, enter) - note: numbers and letters share row 1 */
  all: ALL_KEYS.map((k) => k.letter),
};
