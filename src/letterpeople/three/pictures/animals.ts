// letterpeople/src/three/pictures/animals.ts
//
// SPIKE: word pictures: animals. The mammals are faces (like their emoji):
// the ears, snout and markings carry each one's identity, which a small
// full-body silhouette doesn't (cat, dog and fox bodies blur together).
// Eyes are calm dots with a glint; no open mouths.

import type * as THREE from "three";
import { PAL, Pic, circle, col, ellipse, mirror, roundPoly, type P } from "./kit";

export function cat(): THREE.Object3D {
  const p = new Pic();
  const fur = col(0.7, 0.035, 250);
  const earL: P[] = [
    [-42, 12],
    [-38, 60],
    [-8, 32],
  ];
  const innerL: P[] = [
    [-34, 22],
    [-33, 48],
    [-17, 32],
  ];
  for (const pts of [earL, mirror(earL)]) p.cut(roundPoly(pts, [4, 6, 4]), fur, 0, "ears");
  for (const pts of [innerL, mirror(innerL)]) p.print(roundPoly(pts, 3), PAL.pink, 0.1);
  p.cut(ellipse(0, 0, 45, 37), fur, 1, "head");
  // Tabby stripes on the brow
  const stripe = col(0.56, 0.04, 250);
  p.line([[-11, 31], [-8, 22]], 4, stripe, 1.1);
  p.line([[0, 34], [0, 24]], 4, stripe, 1.1);
  p.line([[11, 31], [8, 22]], 4, stripe, 1.1);
  p.eye(-17, 6, 5.5, 1.1);
  p.eye(17, 6, 5.5, 1.1);
  p.ink(
    roundPoly(
      [
        [-6, -4],
        [6, -4],
        [0, -11],
      ],
      2,
    ),
    PAL.rose,
    1.1,
    "nose",
  );
  p.line([[0, -11], [0, -16]], 2, PAL.ink, 1.1);
  p.line(
    [
      [-9, -17],
      [-4.5, -21],
      [0, -16],
      [4.5, -21],
      [9, -17],
    ],
    2,
    PAL.ink,
    1.1,
  );
  // Whiskers: reaching past the face, the strongest "cat" cue
  for (const s of [-1, 1]) {
    p.line([[s * 22, -6], [s * 56, 0]], 1.8, PAL.darkGrey, 1.1, { name: "whiskers" });
    p.line([[s * 22, -11], [s * 58, -11]], 1.8, PAL.darkGrey, 1.1);
    p.line([[s * 22, -16], [s * 55, -23]], 1.8, PAL.darkGrey, 1.1);
  }
  return p.root;
}

export function dog(): THREE.Object3D {
  const p = new Pic();
  const fur = col(0.74, 0.08, 68);
  const earColor = col(0.5, 0.07, 50);
  p.cut(ellipse(0, 4, 38, 40), fur, 1, "head");
  // A patch round one eye
  p.print(ellipse(15, 13, 12, 11, 0.3), earColor, 1.1, "patch");
  // Floppy ears hanging over the sides of the head
  const earL: P[] = [
    [-26, 40],
    [-46, 30],
    [-54, -12],
    [-42, -26],
    [-30, -10],
    [-24, 18],
  ];
  for (const pts of [earL, mirror(earL)]) p.cut(roundPoly(pts, 9), earColor, 3, "ears");
  p.cut(ellipse(0, -16, 22, 16), col(0.9, 0.04, 80), 2, "muzzle", 2);
  p.eye(-14, 12, 5, 2.1);
  p.eye(15, 12, 5, 2.1);
  p.ink(ellipse(0, -8, 8, 5.5), PAL.ink, 2.1, "nose");
  p.line([[0, -13], [0, -20]], 2, PAL.ink, 2.1);
  p.line(
    [
      [-10, -19],
      [-5, -23],
      [0, -20],
      [5, -23],
      [10, -19],
    ],
    2,
    PAL.ink,
    2.1,
  );
  return p.root;
}

export function pig(): THREE.Object3D {
  const p = new Pic();
  const earL: P[] = [
    [-38, 18],
    [-46, 54],
    [-12, 34],
  ];
  for (const pts of [earL, mirror(earL)]) p.cut(roundPoly(pts, [4, 7, 4]), PAL.rose, 0, "ears");
  p.cut(ellipse(0, 0, 43, 38), PAL.pink, 1, "head");
  p.eye(-17, 12, 4.5, 1.1);
  p.eye(17, 12, 4.5, 1.1);
  p.cut(ellipse(0, -11, 19, 13), PAL.rose, 2, "snout", 2);
  const nostril = col(0.52, 0.1, 5);
  p.ink(ellipse(-6.5, -11, 3, 4.5), nostril, 2.1, "nostrils");
  p.ink(ellipse(6.5, -11, 3, 4.5), nostril, 2.1);
  return p.root;
}

export function cow(): THREE.Object3D {
  const p = new Pic();
  const hide = PAL.cream;
  const spot = col(0.32, 0.01, 260);
  // Horns and ears behind the head
  const hornL: P[] = [
    [-24, 34],
    [-36, 56],
    [-28, 58],
    [-14, 40],
  ];
  for (const pts of [hornL, mirror(hornL)]) p.cut(roundPoly(pts, [3, 5, 5, 3]), PAL.tan, 0, "horns", 2);
  p.cut(ellipse(-40, 20, 17, 8, 0.35), spot, 0, "ears", 2);
  p.cut(ellipse(40, 20, 17, 8, -0.35), spot, 0);
  const head = roundPoly(
    [
      [-30, -24],
      [30, -24],
      [34, 40],
      [-34, 40],
    ],
    [16, 16, 18, 18],
  );
  p.cut(head, hide, 1, "head");
  // The black-and-white is what makes it a cow
  p.print(
    roundPoly(
      [
        [-34, 16],
        [-12, 38],
        [-2, 30],
        [-12, 14],
        [-32, 8],
      ],
      6,
    ),
    spot,
    1.1,
    "spots",
  );
  p.print(ellipse(17, 26, 8, 6, 0.4), spot, 1.1);
  p.outline(head, 2.5, col(0.62, 0.02, 70), 1.15);
  p.eye(-13, 0, 5, 1.2);
  p.eye(13, 0, 5, 1.2);
  p.cut(ellipse(0, -22, 30, 16), col(0.82, 0.07, 10), 2, "muzzle", 2);
  const nostril = col(0.55, 0.08, 10);
  p.ink(ellipse(-10, -21, 3.5, 5), nostril, 2.1, "nostrils");
  p.ink(ellipse(10, -21, 3.5, 5), nostril, 2.1);
  return p.root;
}

export function fox(): THREE.Object3D {
  const p = new Pic();
  const fur = PAL.orange;
  const earL: P[] = [
    [-44, 20],
    [-38, 66],
    [-12, 34],
  ];
  const innerL: P[] = [
    [-37, 28],
    [-35, 56],
    [-20, 36],
  ];
  for (const pts of [earL, mirror(earL)]) p.cut(roundPoly(pts, [4, 5, 4]), fur, 0, "ears");
  for (const pts of [innerL, mirror(innerL)]) p.print(roundPoly(pts, 3), col(0.42, 0.06, 45), 0.1);
  // Broad brow, pointed chin: a rounded inverted triangle under a dome
  p.cut(
    roundPoly(
      [
        [-48, 22],
        [48, 22],
        [0, -40],
      ],
      [14, 14, 6],
    ),
    fur,
    1,
    "head",
  );
  p.cut(ellipse(0, 16, 41, 22), fur, 1);
  // White cheeks meeting at the chin
  p.print(
    roundPoly(
      [
        [-43, 17],
        [-9, 0],
        [0, -5],
        [9, 0],
        [43, 17],
        [4, -33],
        [-4, -33],
      ],
      [6, 5, 4, 5, 6, 3, 3],
    ),
    PAL.cream,
    1.1,
    "cheeks",
  );
  p.eye(-15, 9, 4.5, 1.2);
  p.eye(15, 9, 4.5, 1.2);
  p.ink(ellipse(0, -33, 6.5, 4.5), PAL.ink, 1.2, "nose");
  return p.root;
}

export function bear(): THREE.Object3D {
  const p = new Pic();
  const fur = PAL.brown;
  const inner = PAL.tan;
  for (const s of [-1, 1]) {
    p.cut(circle(s * 30, 30, 14), fur, 0, "ears");
    p.print(circle(s * 30, 30, 7.5), inner, 0.1);
  }
  p.cut(ellipse(0, 0, 42, 38), fur, 1, "head");
  p.eye(-15, 9, 4.5, 1.1);
  p.eye(15, 9, 4.5, 1.1);
  p.cut(ellipse(0, -14, 20, 15), inner, 2, "muzzle", 2);
  p.ink(
    roundPoly(
      [
        [-7.5, -6],
        [7.5, -6],
        [0, -13],
      ],
      3,
    ),
    PAL.ink,
    2.1,
    "nose",
  );
  p.line([[0, -12], [0, -18]], 2, PAL.ink, 2.1);
  p.line(
    [
      [-7, -19],
      [-3.5, -22],
      [0, -18],
      [3.5, -22],
      [7, -19],
    ],
    2,
    PAL.ink,
    2.1,
  );
  return p.root;
}

/** A chick, side on, facing right. */
export function chick(): THREE.Object3D {
  const p = new Pic();
  const down = PAL.yellow;
  const legs = PAL.orange;
  // Legs and feet behind the body
  for (const x of [-9, 9]) {
    p.line([[x, 10], [x, -2]], 3, legs, 0, { lit: true, name: "feet" });
    p.line([[x - 6, -3], [x + 7, -3]], 3, legs, 0, { lit: true });
  }
  // Head tuft
  p.cut(ellipse(12, 95, 3.5, 8, 0.45), down, 0, undefined, 1.5);
  p.cut(ellipse(19, 96, 3.5, 8, -0.2), down, 0, undefined, 1.5);
  p.cut(ellipse(0, 36, 36, 32), down, 1, "body");
  p.cut(circle(16, 70, 22), down, 1, "head");
  p.cut(
    roundPoly(
      [
        [-24, 44],
        [8, 42],
        [-4, 20],
        [-26, 26],
      ],
      8,
    ),
    col(0.8, 0.14, 85),
    2,
    "wing",
    2,
  );
  p.cut(
    roundPoly(
      [
        [32, 76],
        [50, 69],
        [32, 62],
      ],
      2,
    ),
    legs,
    2,
    "beak",
    1.5,
  );
  p.eye(24, 76, 4, 1.1);
  return p.root;
}

/** A ladybug from above: the friendliest "bug". */
export function bug(): THREE.Object3D {
  const p = new Pic();
  const shell = PAL.red;
  const black = col(0.27, 0.01, 260);
  // Legs and antennae under the head and shell
  for (const s of [-1, 1]) {
    p.line([[s * 28, 16], [s * 46, 24]], 3.2, black, 0, { name: "legs" });
    p.line([[s * 32, 0], [s * 50, 0]], 3.2, black, 0);
    p.line([[s * 28, -16], [s * 45, -26]], 3.2, black, 0);
    p.line([[s * 5, 46], [s * 13, 62]], 2.2, black, 0, { name: "antennae" });
    p.ink(circle(s * 13, 62, 3), black, 0);
  }
  p.cut(circle(0, 34, 16), black, 0.5, "head", 2);
  p.ink(circle(-6, 41, 2.6), PAL.cream, 0.6);
  p.ink(circle(6, 41, 2.6), PAL.cream, 0.6);
  p.cut(circle(0, 0, 36), shell, 1, "shell");
  p.line([[0, 35], [0, -35]], 2.5, black, 1.1);
  for (const [x, y, r] of [
    [-16, 15, 6],
    [16, 15, 6],
    [-21, -9, 5.5],
    [21, -9, 5.5],
    [-9, -24, 4.5],
    [9, -24, 4.5],
  ] as const) {
    p.ink(circle(x, y, r), black, 1.1, "spots");
  }
  return p.root;
}

/** A friendly bat, wings spread. */
export function bat(): THREE.Object3D {
  const p = new Pic();
  const wing = col(0.5, 0.08, 300);
  const fur = col(0.4, 0.07, 300);
  const wingL: P[] = [
    [-8, 20],
    [-40, 36],
    [-74, 24],
    [-62, 4],
    [-52, 12],
    [-42, -6],
    [-31, 5],
    [-19, -10],
    [-8, -6],
  ];
  for (const pts of [wingL, mirror(wingL)]) p.cut(roundPoly(pts, [4, 6, 4, 3, 3, 3, 3, 3, 4]), wing, 0, "wings");
  const earL: P[] = [
    [-13, 28],
    [-13, 48],
    [-2, 34],
  ];
  for (const pts of [earL, mirror(earL)]) p.cut(roundPoly(pts, [2, 3, 2]), fur, 1, "ears");
  p.cut(ellipse(0, 0, 16, 22), fur, 1, "body");
  p.cut(circle(0, 23, 15), fur, 1, "head");
  // Eyes need whites on dark fur
  for (const x of [-6, 6]) {
    p.print(circle(x, 25, 5), PAL.cream, 1.1);
    p.eye(x, 24.5, 2.8, 1.2);
  }
  return p.root;
}

/** A hen, side on, facing right (bigger and browner than the chick, with a comb). */
export function hen(): THREE.Object3D {
  const p = new Pic();
  const feathers = col(0.64, 0.1, 52);
  const dark = col(0.5, 0.09, 45);
  const comb = PAL.red;
  for (const x of [-8, 10]) {
    p.line([[x, 16], [x, -2]], 3, PAL.orange, 0, { lit: true, name: x < 0 ? "feet" : undefined });
    p.line([[x - 7, -3], [x + 8, -3]], 3, PAL.orange, 0, { lit: true });
  }
  // Tail feathers, up at the back
  for (const [pts, c] of [
    [
      [
        [-30, 40],
        [-58, 76],
        [-40, 38],
      ],
      dark,
    ],
    [
      [
        [-28, 36],
        [-64, 60],
        [-36, 30],
      ],
      feathers,
    ],
  ] as [P[], THREE.Color][]) {
    p.cut(roundPoly(pts, [4, 6, 4]), c, 0, "tail", 2);
  }
  for (const [x, y] of [
    [24, 91],
    [31, 94],
    [38, 90],
  ])
    p.cut(circle(x, y, 5.5), comb, 0.5, "comb", 1.5);
  p.cut(ellipse(-2, 40, 40, 30), feathers, 1, "body");
  p.cut(circle(30, 74, 17), feathers, 1, "head");
  p.cut(ellipse(-6, 36, 20, 13, -0.25), dark, 2, "wing", 2);
  p.cut(
    roundPoly(
      [
        [44, 79],
        [57, 73],
        [44, 67],
      ],
      2,
    ),
    PAL.amber,
    2,
    "beak",
    1.5,
  );
  p.cut(ellipse(44, 62, 4, 6.5), comb, 1.5, "wattle", 1.5);
  p.eye(34, 78, 3.8, 1.1);
  return p.root;
}
