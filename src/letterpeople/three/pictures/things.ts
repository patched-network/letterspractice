// letterpeople/src/three/pictures/things.ts
//
// SPIKE: word pictures: toys, food and things around the house.

import * as THREE from "three";
import {
  PAL,
  Pic,
  circle,
  circleHole,
  col,
  ellipse,
  poly,
  roundPoly,
  roundRect,
  rotate,
  starPoints,
  withHoles,
  type P,
} from "./kit";

/** An arched top: a rectangle `w` wide from y0 up to `yArch`, then a semicircle. */
function arch(w: number, y0: number, yArch: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, y0);
  s.lineTo(w / 2, y0);
  s.lineTo(w / 2, yArch);
  s.absarc(0, yArch, w / 2, 0, Math.PI, false);
  s.closePath();
  return s;
}

/**
 * A beach-ball gore: the band between two meridians, which cross the ball's
 * middle at x = xa and xb (±r: the ball's own edge). Tilted by `rot`.
 */
function gore(r: number, xa: number, xb: number, rot: number): THREE.Shape {
  const at = (x: number, y: number) => rotate([[x, y]], rot)[0];
  const top = at(0, r);
  const bottom = at(0, -r);
  const s = new THREE.Shape();
  s.moveTo(...top);
  if (xa <= -r) s.absarc(0, 0, r, Math.PI / 2 + rot, (3 * Math.PI) / 2 + rot, false);
  else {
    const c = at(2 * xa, 0); // a quadratic through (xa, 0)
    s.quadraticCurveTo(c[0], c[1], bottom[0], bottom[1]);
  }
  if (xb >= r) s.absarc(0, 0, r, -Math.PI / 2 + rot, Math.PI / 2 + rot, false);
  else {
    const c = at(2 * xb, 0);
    s.quadraticCurveTo(c[0], c[1], top[0], top[1]);
  }
  s.closePath();
  return s;
}

/** A beach ball: coloured gores read "ball" where a plain disc reads "dot". */
export function ball(): THREE.Object3D {
  const p = new Pic();
  const r = 42;
  const tilt = -0.45;
  p.cut(circle(0, 0, r), PAL.cream, 0, "ball");
  p.print(gore(r, -r, -21, tilt), PAL.red, 0.1, "gores");
  p.print(gore(r, 0, 21, tilt), PAL.blue, 0.1);
  p.print(gore(r, 21, r, tilt), PAL.yellow, 0.1);
  return p.root;
}

/** Frosting: flat across the top (rounded corners), dripping along the bottom. */
function frosting(x0: number, x1: number, yTop: number, yLow: number, n: number, depth: number): THREE.Shape {
  const s = new THREE.Shape();
  const c = 4;
  const w = (x1 - x0) / n;
  s.moveTo(x0, yLow);
  s.lineTo(x0, yTop - c);
  s.quadraticCurveTo(x0, yTop, x0 + c, yTop);
  s.lineTo(x1 - c, yTop);
  s.quadraticCurveTo(x1, yTop, x1, yTop - c);
  s.lineTo(x1, yLow);
  for (let i = n - 1; i >= 0; i--) {
    const xa = x0 + i * w;
    const xb = xa + w;
    const d = depth * (i % 2 ? 0.55 : 1);
    s.bezierCurveTo(xb - w * 0.05, yLow - d * 1.35, xa + w * 0.05, yLow - d * 1.35, xa, yLow);
  }
  s.closePath();
  return s;
}

/** A birthday cake: chocolate tiers, pink icing, one candle. */
export function cake(): THREE.Object3D {
  const p = new Pic();
  const sponge = col(0.55, 0.08, 50);
  const icing = col(0.83, 0.085, 355);
  p.cut(roundRect(0, 87, 7, 28, 2), PAL.blue, 0.5, "candle", 2);
  p.cut(
    roundPoly(
      [
        [-5, 104],
        [0, 120],
        [5, 104],
        [0, 99],
      ],
      [5, 1, 5, 4],
    ),
    PAL.amber,
    0.5,
    "flame",
    0,
  );
  p.print(
    roundPoly(
      [
        [-2.5, 104],
        [0, 112],
        [2.5, 104],
        [0, 101.5],
      ],
      [2.5, 0.5, 2.5, 2],
    ),
    PAL.yellow,
    0.6,
  );
  p.cut(roundRect(0, 26, 92, 40, 6), sponge, 1, "cake");
  p.cut(roundRect(0, 60, 62, 28, 6), sponge, 1);
  p.cut(frosting(-47, 47, 47, 39, 6, 7), icing, 2, "icing", 2);
  p.cut(frosting(-32, 32, 75, 68, 4, 6), icing, 2, undefined, 2);
  const sprinkles = [PAL.yellow, PAL.teal, PAL.cream, PAL.green, PAL.yellow];
  sprinkles.forEach((c, i) => p.print(circle(-30 + i * 15, 20 + (i % 2) * 5, 2.6), c, 1.1));
  p.cut(roundRect(0, 5, 116, 8, 4), col(0.76, 0.03, 240), 3, "plate", 1.5);
  return p.root;
}

export function cup(): THREE.Object3D {
  const p = new Pic();
  const glaze = PAL.teal;
  p.cut(withHoles(circle(31, 36, 17), circleHole(31, 36, 9)), glaze, 0, "handle");
  p.cut(
    roundPoly(
      [
        [-26, 0],
        [26, 0],
        [31, 64],
        [-31, 64],
      ],
      [9, 9, 4, 4],
    ),
    glaze,
    1,
    "cup",
  );
  p.print(
    roundPoly(
      [
        [-29, 40],
        [29, 40],
        [29.8, 50],
        [-29.8, 50],
      ],
      1,
    ),
    col(0.85, 0.06, 200),
    1.1,
  );
  return p.root;
}

/** An old-fashioned key, tilted. */
export function key(): THREE.Object3D {
  const p = new Pic();
  const tilt = 0.45;
  const R = (pts: P[]) => rotate(pts, tilt);
  const [bx, by] = R([[-38, 0]])[0];
  p.cut(withHoles(circle(bx, by, 22), circleHole(bx, by, 9)), PAL.gold, 1, "bow");
  p.cut(
    roundPoly(
      R([
        [-20, -5],
        [46, -5],
        [46, 5],
        [-20, 5],
      ]),
      4,
    ),
    PAL.gold,
    1,
    "shaft",
  );
  p.cut(
    roundPoly(
      R([
        [26, -3],
        [34, -3],
        [34, -18],
        [26, -18],
      ]),
      2,
    ),
    PAL.gold,
    1,
    "teeth",
  );
  p.cut(
    roundPoly(
      R([
        [38, -3],
        [46, -3],
        [46, -14],
        [38, -14],
      ]),
      2,
    ),
    PAL.gold,
    1,
  );
  p.print(withHoles(circle(bx, by, 16.5), circleHole(bx, by, 13)), PAL.darkGold, 1.1);
  return p.root;
}

export function bell(): THREE.Object3D {
  const p = new Pic();
  p.cut(withHoles(circle(0, 93, 9), circleHole(0, 93, 4.5)), PAL.darkGold, 0, "loop", 2);
  p.cut(circle(0, 8, 8), PAL.darkGold, 0, "clapper", 2);
  const body = new THREE.Shape();
  body.moveTo(-46, 14);
  body.bezierCurveTo(-36, 17, -30, 30, -28, 50);
  body.bezierCurveTo(-26, 72, -16, 86, 0, 86);
  body.bezierCurveTo(16, 86, 26, 72, 28, 50);
  body.bezierCurveTo(30, 30, 36, 17, 46, 14);
  body.quadraticCurveTo(0, 6, -46, 14);
  p.cut(body, PAL.gold, 1, "bell");
  const band = new THREE.Shape();
  band.moveTo(-45, 14);
  band.quadraticCurveTo(0, 7, 45, 14);
  band.lineTo(35.5, 22);
  band.quadraticCurveTo(0, 16, -35.5, 22);
  band.closePath();
  p.print(band, PAL.darkGold, 1.1);
  // A highlight down the left side
  p.print(
    roundPoly(
      [
        [-21, 30],
        [-15, 30],
        [-11, 68],
        [-15, 70],
      ],
      3,
    ),
    col(0.9, 0.1, 92),
    1.1,
  );
  return p.root;
}

/** An open book, pages spread. */
export function book(): THREE.Object3D {
  const p = new Pic();
  p.cut(
    roundPoly(
      [
        [-68, 4],
        [0, -2],
        [68, 4],
        [68, 81],
        [0, 76],
        [-68, 81],
      ],
      [4, 3, 4, 4, 3, 4],
    ),
    PAL.red,
    0,
    "cover",
  );
  const lineColor = col(0.8, 0.02, 250);
  for (const s of [-1, 1]) {
    const page = new THREE.Shape();
    page.moveTo(s * 2, 4);
    page.quadraticCurveTo(s * 30, 12, s * 62, 8);
    page.lineTo(s * 62, 74);
    page.quadraticCurveTo(s * 30, 78, s * 2, 70);
    page.closePath();
    p.cut(page, PAL.cream, 1, "pages", 2);
    for (const y of [60, 51, 42, 33, 24]) p.line([[s * 12, y], [s * 52, y]], 2.4, lineColor, 1.1);
  }
  return p.root;
}

/** A bed, side on, head to the left. */
export function bed(): THREE.Object3D {
  const p = new Pic();
  const wood = PAL.brown;
  p.cut(roundRect(0, 18, 112, 8, 3), PAL.darkBrown, 0, "frame", 2);
  p.cut(roundRect(0, 30, 108, 16, 5), PAL.cream, 1, "mattress", 2);
  p.cut(roundRect(-36, 45, 30, 16, 7), col(0.93, 0.03, 240), 2, "pillow", 2);
  p.cut(
    roundPoly(
      [
        [-20, 20],
        [53, 20],
        [53, 43],
        [-20, 43],
      ],
      [3, 6, 6, 3],
    ),
    PAL.blue,
    2,
    "blanket",
    2,
  );
  p.print(roundRect(-14.5, 31.5, 11, 23, 3), col(0.76, 0.1, 252), 2.1);
  p.cut(roundRect(-58, 36, 10, 72, 4), wood, 2, "headboard", 2);
  p.cut(roundRect(58, 26, 10, 52, 4), wood, 2, "footboard", 2);
  return p.root;
}

export function hat(): THREE.Object3D {
  const p = new Pic();
  p.cut(
    roundPoly(
      [
        [-34, 12],
        [34, 12],
        [30, 64],
        [0, 57],
        [-30, 64],
      ],
      [2, 2, 10, 6, 10],
    ),
    PAL.blue,
    1,
    "crown",
  );
  p.print(
    roundPoly(
      [
        [-33.4, 14],
        [33.4, 14],
        [32.4, 27],
        [-32.4, 27],
      ],
      1,
    ),
    PAL.red,
    1.1,
    "band",
  );
  p.cut(ellipse(0, 12, 62, 9), PAL.blue, 2, "brim");
  return p.root;
}

export function house(): THREE.Object3D {
  const p = new Pic();
  p.cut(roundRect(28, 90, 12, 28, 2), col(0.5, 0.1, 35), 0, "chimney", 2);
  p.cut(roundRect(0, 32, 84, 64, 3), col(0.82, 0.07, 230), 1, "walls");
  p.cut(
    roundPoly(
      [
        [-54, 58],
        [54, 58],
        [0, 104],
      ],
      [4, 4, 6],
    ),
    PAL.red,
    2,
    "roof",
  );
  p.print(arch(20, 0, 24), PAL.brown, 1.1, "door");
  p.ink(circle(5, 13, 1.8), PAL.gold, 1.2);
  for (const x of [-24, 24]) {
    p.print(roundRect(x, 36, 17, 17, 2), PAL.glass, 1.1, "windows");
    p.line([[x, 28], [x, 44]], 2, PAL.cream, 1.2, { roundCaps: false });
    p.line([[x - 8, 36], [x + 8, 36]], 2, PAL.cream, 1.2, { roundCaps: false });
  }
  return p.root;
}

/** A taped cardboard box, three-quarter view. */
export function box(): THREE.Object3D {
  const p = new Pic();
  p.cut(
    roundPoly(
      [
        [22, 0],
        [44, 14],
        [44, 64],
        [22, 50],
      ],
      2,
    ),
    col(0.62, 0.08, 62),
    1,
    "box",
  );
  p.cut(
    roundPoly(
      [
        [-42, 50],
        [22, 50],
        [44, 64],
        [-20, 64],
      ],
      2,
    ),
    col(0.8, 0.07, 72),
    1,
  );
  p.cut(
    roundPoly(
      [
        [-42, 0],
        [22, 0],
        [22, 50],
        [-42, 50],
      ],
      2,
    ),
    PAL.card,
    1,
  );
  const tape = col(0.88, 0.05, 85);
  p.print(
    roundPoly(
      [
        [-14, 50],
        [-6, 50],
        [16, 64],
        [8, 64],
      ],
      1,
    ),
    tape,
    1.1,
    "tape",
  );
  p.print(
    roundPoly(
      [
        [-14, 50.5],
        [-6, 50.5],
        [-6, 34],
        [-14, 34],
      ],
      1,
    ),
    tape,
    1.1,
  );
  return p.root;
}

/**
 * A dog bone: a shaft of half-height `h` between knobs of radius `kr` at
 * (±len, ±kdy), as one outline. Tilted by `rot`.
 */
function boneShape(len: number, h: number, kr: number, kdy: number, rot: number): THREE.Shape {
  const at = (x: number, y: number) => rotate([[x, y]], rot)[0];
  const dx = Math.sqrt(kr * kr - (h - kdy) ** 2); // knob meets shaft
  const nx = Math.sqrt(kr * kr - kdy * kdy); // the two knobs meet (the notch)
  const s = new THREE.Shape();
  const knob = (cx: number, cy: number, from: [number, number], to: [number, number]) => {
    const [x, y] = at(cx, cy);
    s.absarc(x, y, kr, Math.atan2(from[1], from[0]) + rot, Math.atan2(to[1], to[0]) + rot, false);
  };
  knob(-len, kdy, [dx, h - kdy], [-nx, -kdy]);
  knob(-len, -kdy, [-nx, kdy], [dx, kdy - h]);
  knob(len, -kdy, [-dx, kdy - h], [nx, kdy]);
  knob(len, kdy, [nx, -kdy], [-dx, h - kdy]);
  s.closePath();
  return s;
}

export function bone(): THREE.Object3D {
  const p = new Pic();
  const shape = boneShape(36, 8, 13, 11, 0.3);
  p.cut(shape, col(0.93, 0.03, 85), 0, "bone");
  p.outline(shape, 2.6, col(0.66, 0.04, 70), 0.1);
  return p.root;
}

/** A traffic cone. */
export function cone(): THREE.Object3D {
  const p = new Pic();
  const orange = col(0.7, 0.17, 45);
  p.cut(
    roundPoly(
      [
        [-32, 6],
        [32, 6],
        [9, 90],
        [-9, 90],
      ],
      [2, 2, 6, 6],
    ),
    orange,
    1,
    "cone",
  );
  // White bands, following the cone's taper
  const half = (y: number) => 32 - (23 * (y - 6)) / 84;
  for (const [y0, y1] of [
    [28, 40],
    [56, 66],
  ]) {
    p.print(
      roundPoly(
        [
          [-half(y0), y0],
          [half(y0), y0],
          [half(y1), y1],
          [-half(y1), y1],
        ],
        1,
      ),
      PAL.cream,
      1.1,
      "stripes",
    );
  }
  p.cut(roundRect(0, 4, 88, 8, 3), orange, 2, "base", 2);
  return p.root;
}

/** A padlock. */
export function lock(): THREE.Object3D {
  const p = new Pic();
  const u = new THREE.Shape();
  u.moveTo(-24, 44);
  u.lineTo(-24, 64);
  u.absarc(0, 64, 24, Math.PI, 0, true);
  u.lineTo(24, 44);
  u.lineTo(15, 44);
  u.lineTo(15, 64);
  u.absarc(0, 64, 15, 0, Math.PI, false);
  u.lineTo(-15, 44);
  u.closePath();
  p.cut(u, PAL.grey, 0, "shackle");
  p.cut(roundRect(0, 27, 72, 54, 9), PAL.gold, 1, "body");
  p.ink(circle(0, 32, 6.5), PAL.ink, 1.1, "keyhole");
  p.ink(
    roundPoly(
      [
        [-3, 31],
        [3, 31],
        [5.5, 15],
        [-5.5, 15],
      ],
      1.5,
    ),
    PAL.ink,
    1.1,
  );
  return p.root;
}

export function ring(): THREE.Object3D {
  const p = new Pic();
  p.cut(withHoles(circle(0, 0, 32), circleHole(0, 0, 23)), PAL.gold, 1, "band");
  p.cut(
    roundPoly(
      [
        [-11, 27],
        [11, 27],
        [8, 37],
        [-8, 37],
      ],
      2,
    ),
    PAL.gold,
    1,
  );
  p.cut(
    roundPoly(
      [
        [-15, 45],
        [-9, 54],
        [9, 54],
        [15, 45],
        [0, 30],
      ],
      2,
    ),
    col(0.72, 0.13, 350),
    2,
    "gem",
    2,
  );
  p.print(
    roundPoly(
      [
        [-9, 54],
        [9, 54],
        [5, 47],
        [-5, 47],
      ],
      1,
    ),
    col(0.85, 0.08, 350),
    2.1,
  );
  return p.root;
}

export function door(): THREE.Object3D {
  const p = new Pic();
  p.cut(arch(72, 0, 68), col(0.78, 0.03, 70), 0, "frame");
  p.cut(arch(58, 0, 68), col(0.56, 0.12, 35), 1, "door");
  const panel = col(0.49, 0.11, 35);
  p.print(roundRect(0, 22, 38, 28, 3), panel, 1.1, "panels");
  p.print(roundRect(0, 60, 38, 30, 3), panel, 1.1);
  p.cut(circle(20, 44, 3.6), PAL.gold, 1.5, "knob", 1);
  p.cut(roundRect(0, -2, 86, 6, 2), PAL.grey, 2, "step", 1.5);
  return p.root;
}

/** A phone (the kind toddlers know: a screen of apps). */
export function phone(): THREE.Object3D {
  const p = new Pic();
  p.cut(roundRect(0, 44, 46, 88, 9), col(0.34, 0.02, 260), 1, "phone");
  p.print(roundRect(0, 45, 38, 72, 4), PAL.glass, 1.1, "screen");
  const apps = [PAL.red, PAL.amber, PAL.green, PAL.blue, PAL.purple, PAL.orange, PAL.teal, PAL.rose, PAL.yellow];
  apps.forEach((c, i) => {
    p.print(roundRect(-10 + (i % 3) * 10, 67 - Math.floor(i / 3) * 11, 7.5, 7.5, 2), c, 1.2, i ? undefined : "apps");
  });
  p.line([[-5, 85], [5, 85]], 1.8, PAL.grey, 1.1);
  p.line([[-7, 4.5], [7, 4.5]], 1.8, PAL.grey, 1.1);
  return p.root;
}

export function wheel(): THREE.Object3D {
  const p = new Pic();
  p.cut(roundPoly(starPoints(0, 0, 42, 38.5, 20), 2.5), PAL.darkGrey, 0, "tyre");
  p.cut(circle(0, 0, 25), PAL.grey, 1, "rim", 2);
  const spoke = col(0.6, 0.012, 250);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 5;
    p.line([[0, 0], [21 * Math.cos(a), 21 * Math.sin(a)]], 4.5, spoke, 1.1, { lit: true });
  }
  p.ink(circle(0, 0, 7), PAL.darkGrey, 1.2, "hub");
  return p.root;
}

/** A baseball cap, side on, peak to the right (the hat has a brim all round). */
export function cap(): THREE.Object3D {
  const p = new Pic();
  const cloth = PAL.red;
  const dark = col(0.52, 0.15, 27);
  const crown = new THREE.Shape();
  crown.moveTo(31, 0);
  crown.absellipse(-5, 0, 36, 42, 0, Math.PI, false, 0);
  crown.closePath();
  p.cut(crown, cloth, 1, "crown");
  p.line(
    [
      [-5, 41],
      [-14, 34],
      [-20, 20],
      [-22, 3],
    ],
    1.8,
    dark,
    1.1,
    { lit: true },
  );
  p.line(
    [
      [-5, 41],
      [4, 34],
      [9, 20],
      [11, 3],
    ],
    1.8,
    dark,
    1.1,
    { lit: true },
  );
  p.cut(circle(-5, 43, 4), dark, 1.2, "button", 1);
  const peak = new THREE.Shape();
  peak.moveTo(16, 5);
  peak.quadraticCurveTo(52, 11, 76, 1);
  peak.quadraticCurveTo(74, -8, 50, -7);
  peak.lineTo(16, -4);
  peak.closePath();
  p.cut(peak, dark, 2, "peak", 2);
  return p.root;
}

/** A hero's cape, flaring from its collar (iffy on its own, without a wearer). */
export function cape(): THREE.Object3D {
  const p = new Pic();
  const cloth = PAL.red;
  const dark = col(0.52, 0.15, 27);
  const s = new THREE.Shape();
  s.moveTo(-16, 100);
  s.lineTo(16, 100);
  s.quadraticCurveTo(30, 60, 54, 8);
  // Scalloped hem, right to left
  s.quadraticCurveTo(38, 16, 22, 4);
  s.quadraticCurveTo(6, 14, -10, 2);
  s.quadraticCurveTo(-26, 12, -46, 6);
  s.quadraticCurveTo(-30, 60, -16, 100);
  s.closePath();
  p.cut(s, cloth, 1, "cape");
  // Folds
  p.line([[-6, 94], [-14, 50], [-18, 8]], 2.5, dark, 1.1, { lit: true });
  p.line([[6, 94], [14, 50], [22, 8]], 2.5, dark, 1.1, { lit: true });
  p.cut(
    roundPoly(
      [
        [-22, 97],
        [22, 97],
        [18, 110],
        [-18, 110],
      ],
      3,
    ),
    dark,
    2,
    "collar",
    2,
  );
  p.line([[-8, 100], [8, 100]], 2, PAL.darkGold, 2.1, { lit: true });
  p.cut(circle(-8, 100, 4), PAL.gold, 2.2, "clasp", 1);
  p.cut(circle(8, 100, 4), PAL.gold, 2.2, undefined, 1);
  return p.root;
}

/** A frying pan, from a little above. */
export function pan(): THREE.Object3D {
  const p = new Pic();
  p.cut(
    roundPoly(
      [
        [34, -2],
        [92, 6],
        [94, 14],
        [34, 10],
      ],
      [2, 5, 5, 2],
    ),
    col(0.32, 0.02, 40),
    0,
    "handle",
    2,
  );
  p.cut(ellipse(0, 4, 42, 27), col(0.38, 0.012, 250), 1, "pan");
  p.print(ellipse(0, 6, 35, 20), col(0.56, 0.01, 250), 1.1);
  return p.root;
}

/** A bowl of soup, steaming. */
export function soup(): THREE.Object3D {
  const p = new Pic();
  const bowl = PAL.blue;
  // The rim's far half and the soup show above the bowl's front
  p.cut(ellipse(0, 40, 47, 9), col(0.54, 0.12, 252), 0, "rim", 0);
  p.print(ellipse(0, 40, 42, 6.5), PAL.orange, 0.1, "soup");
  const front = new THREE.Shape();
  front.moveTo(-47, 40);
  front.lineTo(47, 40);
  front.quadraticCurveTo(45, 4, 0, 2);
  front.quadraticCurveTo(-45, 4, -47, 40);
  front.closePath();
  p.cut(front, bowl, 1, "bowl");
  p.cut(roundRect(0, 3, 30, 7, 2), col(0.54, 0.12, 252), 0.5, "foot", 1.5);
  const steam = col(0.76, 0.02, 250);
  for (const x of [-15, 0, 15]) {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 12; k++) pts.push([x + 4 * Math.sin((k / 12) * Math.PI * 2), 54 + k * 2.6]);
    p.line(pts, 3.2, steam, 0.2, { name: x ? undefined : "steam" });
  }
  return p.root;
}

/** A folded treasure map: land, a dotted path, X marks the spot. */
export function map(): THREE.Object3D {
  const p = new Pic();
  const light = col(0.87, 0.07, 82);
  const shade = col(0.79, 0.07, 76);
  p.cut(
    roundPoly(
      [
        [-60, 8],
        [-20, 0],
        [-20, 70],
        [-60, 78],
      ],
      2,
    ),
    light,
    1,
    "map",
    2,
  );
  p.cut(
    roundPoly(
      [
        [-20, 0],
        [20, 8],
        [20, 78],
        [-20, 70],
      ],
      2,
    ),
    shade,
    1,
    undefined,
    2,
  );
  p.cut(
    roundPoly(
      [
        [20, 8],
        [60, 0],
        [60, 70],
        [20, 78],
      ],
      2,
    ),
    light,
    1,
    undefined,
    2,
  );
  p.print(
    roundPoly(
      [
        [-46, 26],
        [-10, 18],
        [30, 26],
        [48, 48],
        [22, 62],
        [-20, 58],
        [-48, 46],
      ],
      9,
    ),
    col(0.74, 0.12, 140),
    1.1,
    "land",
  );
  // Dashed path along a curve, ending at the X
  const red = PAL.red;
  const at = (t: number): [number, number] => {
    const a: [number, number] = [-36, 32];
    const c: [number, number] = [-2, 64];
    const b: [number, number] = [26, 42];
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  };
  for (let i = 0; i < 7; i++) p.line([at(i / 7), at(i / 7 + 0.07)], 2.6, red, 1.2, { name: i ? undefined : "path" });
  p.line([[27, 40], [37, 50]], 3.2, red, 1.2, { name: "x" });
  p.line([[27, 50], [37, 40]], 3.2, red, 1.2);
  return p.root;
}

/** A light bulb, lit. */
export function light(): THREE.Object3D {
  const p = new Pic();
  const glass = col(0.9, 0.13, 95);
  const glow = PAL.amber;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 6;
    p.line(
      [
        [40 * Math.cos(a), 70 + 40 * Math.sin(a)],
        [50 * Math.cos(a), 70 + 50 * Math.sin(a)],
      ],
      3.5,
      glow,
      0,
      { lit: true, name: i ? undefined : "glow" },
    );
  }
  p.cut(circle(0, 70, 32), glass, 1, "bulb");
  p.cut(
    roundPoly(
      [
        [-14, 24],
        [14, 24],
        [22, 52],
        [-22, 52],
      ],
      3,
    ),
    glass,
    1,
  );
  p.line(
    [
      [-8, 40],
      [-8, 58],
      [-4, 64],
      [0, 58],
      [4, 64],
      [8, 58],
      [8, 40],
    ],
    2.2,
    glow,
    1.1,
    { lit: true, name: "filament" },
  );
  const thread = [PAL.grey, col(0.6, 0.012, 250), PAL.grey];
  thread.forEach((c, i) => p.cut(roundRect(0, 22 - i * 7, 30 - i * 4, 7.5, 3), c, 2, i ? undefined : "base", 1.5));
  p.cut(roundRect(0, 3, 10, 5, 2), PAL.darkGrey, 1.9, undefined, 1);
  return p.root;
}

/** A wooden chair, three-quarter view. */
export function chair(): THREE.Object3D {
  const p = new Pic();
  const wood = PAL.brown;
  const seatTop = col(0.66, 0.08, 62);
  const edge = col(0.48, 0.07, 55);
  // Back legs and backrest behind the seat
  for (const x of [-22, 22]) {
    p.cut(roundRect(x, 70, 8, 84, 3), wood, 0, x < 0 ? "backrest" : undefined, 2);
  }
  p.cut(roundRect(0, 104, 58, 12, 5), wood, 0.3, undefined, 2);
  p.cut(roundRect(0, 82, 48, 8, 3), wood, 0.3, undefined, 2);
  for (const x of [-30, 30]) p.cut(roundRect(x, 15, 8, 30, 2), wood, 0.6, x < 0 ? "legs" : undefined, 2);
  p.cut(
    roundPoly(
      [
        [-35, 34],
        [35, 34],
        [28, 48],
        [-28, 48],
      ],
      3,
    ),
    seatTop,
    1,
    "seat",
  );
  p.cut(roundRect(0, 31, 72, 7, 2), edge, 1.5, undefined, 2);
  return p.root;
}

/** Red: a splash of red paint (a colour word; see the catalog note). */
export function red(): THREE.Object3D {
  const p = new Pic();
  const pts: P[] = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 38 + 7 * Math.sin(5 * a) + 3.5 * Math.sin(3 * a + 1);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  p.cut(roundPoly(pts, 3), PAL.red, 0, "splash");
  for (const [x, y, r] of [
    [56, 30, 5],
    [-56, -24, 4],
    [26, -54, 4.5],
    [-30, 50, 3],
  ] as const) {
    p.cut(circle(x, y, r), PAL.red, 0, undefined, 2);
  }
  return p.root;
}

/** A hand saw: toothed blade, wooden grip. */
export function saw(): THREE.Object3D {
  const p = new Pic();
  const blade: P[] = [
    [-32, 32],
    [62, 20],
  ];
  // Teeth along the bottom edge, tip back to the handle
  for (let x = 62, k = 0; x >= -32; x -= 5, k++) blade.push([x, k % 2 ? 1 : 7]);
  p.cut(poly(blade), col(0.78, 0.012, 250), 0, "blade", 2);
  const grip = roundPoly(
    [
      [-28, 38],
      [-28, 0],
      [-50, -8],
      [-68, 2],
      [-66, 42],
      [-44, 46],
    ],
    [3, 3, 8, 8, 8, 6],
  );
  grip.holes.push(new THREE.Path().absellipse(-48, 20, 7, 12, 0, Math.PI * 2, true, 0));
  p.cut(grip, col(0.62, 0.1, 55), 1, "handle");
  return p.root;
}

/** A roll of tape with its end pulled out. */
export function tape(): THREE.Object3D {
  const p = new Pic();
  const tapeColor = col(0.74, 0.12, 250);
  p.cut(
    roundPoly(
      [
        [18, -24],
        [52, -42],
        [56, -34],
        [26, -14],
      ],
      [2, 1, 1, 2],
    ),
    tapeColor,
    0,
    "strip",
    2,
  );
  p.cut(withHoles(circle(0, 0, 32), circleHole(0, 0, 17)), tapeColor, 1, "roll");
  p.print(withHoles(circle(0, 0, 17), circleHole(0, 0, 12.5)), PAL.card, 1.1, "core");
  p.line(
    Array.from({ length: 13 }, (_, i) => {
      const a = Math.PI * 0.6 + (i / 12) * Math.PI * 0.5;
      return [26 * Math.cos(a), 26 * Math.sin(a)] as P;
    }),
    2.2,
    col(0.84, 0.08, 245),
    1.1,
    { lit: true },
  );
  return p.root;
}

/** A necktie with polka dots. */
export function tie(): THREE.Object3D {
  const p = new Pic();
  const silk = PAL.red;
  p.cut(
    roundPoly(
      [
        [-7, 84],
        [7, 84],
        [15, 24],
        [0, 6],
        [-15, 24],
      ],
      [2, 2, 5, 5, 5],
    ),
    silk,
    1,
    "tie",
  );
  p.cut(
    roundPoly(
      [
        [-11, 98],
        [11, 98],
        [7, 84],
        [-7, 84],
      ],
      2,
    ),
    col(0.55, 0.16, 27),
    2,
    "knot",
    2,
  );
  for (const [x, y] of [
    [0, 72],
    [-5, 56],
    [6, 46],
    [-6, 34],
    [5, 24],
  ])
    p.print(circle(x, y, 2.8), PAL.yellow, 1.1);
  return p.root;
}

/** A paper shopping bag. */
export function bag(): THREE.Object3D {
  const p = new Pic();
  const paper = PAL.purple;
  const handle: P[] = Array.from({ length: 13 }, (_, i) => {
    const a = (i / 12) * Math.PI;
    return [17 * Math.cos(a), 58 + 26 * Math.sin(a)] as P;
  });
  p.line(handle, 4.5, col(0.5, 0.12, 305), 0, { lit: true, name: "handle" });
  p.cut(
    roundPoly(
      [
        [-34, 0],
        [34, 0],
        [30, 64],
        [-30, 64],
      ],
      [4, 4, 2, 2],
    ),
    paper,
    1,
    "bag",
  );
  p.print(
    roundPoly(
      [
        [-30.8, 54],
        [30.8, 54],
        [30, 64],
        [-30, 64],
      ],
      [1, 1, 2, 2],
    ),
    col(0.56, 0.13, 305),
    1.1,
  );
  return p.root;
}

/** An acorn: the nut toddlers pick up. */
export function nut(): THREE.Object3D {
  const p = new Pic();
  p.cut(
    roundPoly(
      [
        [-22, 42],
        [22, 42],
        [18, 14],
        [0, -4],
        [-18, 14],
      ],
      [4, 4, 14, 4, 14],
    ),
    col(0.66, 0.1, 62),
    1,
    "nut",
  );
  p.cut(roundRect(3, 66, 5, 12, 2), PAL.darkBrown, 1.5, "stem", 1.5);
  p.cut(
    roundPoly(
      [
        [-28, 38],
        [28, 38],
        [24, 56],
        [0, 64],
        [-24, 56],
      ],
      [5, 5, 10, 10, 10],
    ),
    PAL.brown,
    2,
    "cap",
  );
  const dot = col(0.46, 0.07, 55);
  for (const [x, y] of [
    [-16, 46],
    [-6, 50],
    [5, 50],
    [15, 46],
    [-10, 57],
    [0, 59],
    [10, 57],
  ])
    p.print(circle(x, y, 2), dot, 2.1);
  return p.root;
}

/** A spinning top. */
export function top(): THREE.Object3D {
  const p = new Pic();
  p.cut(roundRect(0, 66, 6, 22, 2), PAL.brown, 0, "stem", 2);
  p.cut(
    roundPoly(
      [
        [-42, 42],
        [42, 42],
        [6, 4],
        [0, 0],
        [-6, 4],
      ],
      [6, 6, 3, 1, 3],
    ),
    PAL.red,
    1,
    "top",
  );
  p.cut(ellipse(0, 44, 42, 13), PAL.blue, 1.5, undefined, 2);
  p.print(
    roundPoly(
      [
        [-34, 34],
        [34, 34],
        [26, 26],
        [-26, 26],
      ],
      1,
    ),
    PAL.yellow,
    1.1,
    "band",
  );
  return p.root;
}
