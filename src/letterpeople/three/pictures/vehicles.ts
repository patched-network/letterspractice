// letterpeople/src/three/pictures/vehicles.ts
//
// SPIKE: word pictures: vehicles, side on, facing right (bus, car, truck,
// van, boat). The ship is the harbor's (harborProps.ts).

import * as THREE from "three";
import { PAL, Pic, circle, col, roundPoly, roundRect } from "./kit";

/** A yellow school bus. */
export function bus(): THREE.Object3D {
  const p = new Pic();
  const yellow = col(0.84, 0.15, 86);
  p.cut(roundRect(0, 44, 150, 60, 11), yellow, 1, "body");
  // Rub rails along the side
  p.line([[-74, 28], [74, 28]], 2.5, PAL.ink, 1.1);
  p.line([[-74, 34], [74, 34]], 2.5, PAL.ink, 1.1);
  for (const x of [-56, -32, -8, 16]) p.print(roundRect(x, 58, 19, 17, 3), PAL.glass, 1.2, "windows");
  // Door, and the windscreen at the front
  p.print(roundRect(42, 43, 17, 40, 3), PAL.glass, 1.2, "door");
  p.line([[42, 25], [42, 61]], 1.6, PAL.darkGrey, 1.3);
  p.print(roundRect(65, 55, 12, 22, 3), PAL.glass, 1.2);
  p.print(circle(71, 24, 3.2), PAL.cream, 1.2);
  p.cut(roundRect(0, 15, 156, 7, 3), PAL.darkGrey, 1.5, "bumper", 1.5);
  p.wheel(-44, 14, 15, 2);
  p.wheel(44, 14, 15, 2);
  return p.root;
}

export function car(): THREE.Object3D {
  const p = new Pic();
  const paint = PAL.red;
  p.cut(
    roundPoly(
      [
        [-40, 38],
        [36, 38],
        [20, 68],
        [-28, 68],
      ],
      [4, 4, 10, 10],
    ),
    paint,
    1,
    "cabin",
  );
  p.cut(
    roundPoly(
      [
        [-62, 14],
        [62, 14],
        [64, 34],
        [50, 42],
        [-56, 42],
        [-64, 30],
      ],
      [8, 8, 6, 6, 6, 8],
    ),
    paint,
    1,
    "body",
  );
  p.print(
    roundPoly(
      [
        [-33, 44],
        [-6, 44],
        [-6, 62],
        [-24, 62],
      ],
      3,
    ),
    PAL.glass,
    1.1,
    "windows",
  );
  p.print(
    roundPoly(
      [
        [0, 44],
        [28, 44],
        [16, 62],
        [0, 62],
      ],
      3,
    ),
    PAL.glass,
    1.1,
  );
  p.print(circle(58, 32, 4), PAL.yellow, 1.1);
  p.print(roundRect(-60, 32, 5, 7, 2), PAL.orange, 1.1);
  p.wheel(-36, 14, 14, 2);
  p.wheel(36, 14, 14, 2);
  return p.root;
}

/** A dump truck: the truck toddlers love. */
export function truck(): THREE.Object3D {
  const p = new Pic();
  p.cut(roundRect(-2, 20, 132, 10, 3), PAL.darkGrey, 0, "chassis", 2);
  p.cut(
    roundPoly(
      [
        [-66, 24],
        [16, 24],
        [22, 70],
        [-72, 70],
      ],
      4,
    ),
    PAL.orange,
    1,
    "bed",
  );
  const rib = col(0.64, 0.15, 48);
  for (const x of [-48, -24, 0]) p.line([[x, 30], [x + 1, 64]], 3, rib, 1.1, { lit: true });
  p.cut(
    roundPoly(
      [
        [24, 18],
        [66, 18],
        [66, 50],
        [54, 72],
        [24, 72],
      ],
      [3, 4, 4, 8, 4],
    ),
    PAL.blue,
    1,
    "cab",
  );
  p.print(
    roundPoly(
      [
        [31, 46],
        [56, 46],
        [48, 64],
        [31, 64],
      ],
      3,
    ),
    PAL.glass,
    1.1,
    "window",
  );
  p.print(circle(64, 30, 3.2), PAL.yellow, 1.1);
  p.wheel(-40, 16, 16, 2);
  p.wheel(44, 16, 16, 2);
  return p.root;
}

/** A little sailing boat on a strip of water (the ship is the big two-master). */
export function boat(): THREE.Object3D {
  const p = new Pic();
  p.cut(roundRect(0, 72, 4, 82, 2), PAL.brown, 0, "mast", 2);
  p.cut(
    roundPoly(
      [
        [-4, 38],
        [-4, 110],
        [-50, 40],
      ],
      [2, 3, 4],
    ),
    PAL.yellow,
    1,
    "sail",
    2,
  );
  p.cut(
    roundPoly(
      [
        [4, 46],
        [4, 100],
        [40, 46],
      ],
      [2, 3, 4],
    ),
    col(0.78, 0.1, 30),
    1,
    "jib",
    2,
  );
  p.cut(
    roundPoly(
      [
        [0, 113],
        [17, 108],
        [0, 103],
      ],
      1.5,
    ),
    PAL.blue,
    1,
    "flag",
    1.5,
  );
  p.cut(
    roundPoly(
      [
        [-58, 34],
        [60, 34],
        [42, 6],
        [-42, 6],
      ],
      [4, 6, 6, 6],
    ),
    PAL.red,
    2,
    "hull",
  );
  p.line([[-49, 26], [50, 26]], 3, PAL.cream, 2.1);
  // Water: a wavy strip across the bottom of the hull
  const w = new THREE.Shape();
  w.moveTo(-72, 0);
  w.lineTo(72, 0);
  w.lineTo(72, 12);
  for (let i = 0; i < 6; i++) {
    const x0 = 72 - i * 24;
    w.quadraticCurveTo(x0 - 6, 18, x0 - 12, 12);
    w.quadraticCurveTo(x0 - 18, 6, x0 - 24, 12);
  }
  w.closePath();
  p.cut(w, col(0.7, 0.1, 235), 3, "water", 2);
  return p.root;
}

/** A minivan: taller than the car, shorter than the bus. */
export function van(): THREE.Object3D {
  const p = new Pic();
  const paint = PAL.teal;
  p.cut(
    roundPoly(
      [
        [-62, 14],
        [62, 14],
        [64, 40],
        [40, 70],
        [-60, 70],
        [-64, 40],
      ],
      [8, 8, 8, 12, 10, 8],
    ),
    paint,
    1,
    "body",
  );
  p.print(roundRect(-44, 52, 26, 18, 3), PAL.glass, 1.1, "windows");
  p.print(roundRect(-11, 52, 28, 18, 3), PAL.glass, 1.1);
  p.print(
    roundPoly(
      [
        [8, 43],
        [36, 43],
        [30, 61],
        [8, 61],
      ],
      3,
    ),
    PAL.glass,
    1.1,
  );
  // Sliding door seam
  p.line([[4, 18], [4, 62]], 1.8, col(0.58, 0.09, 200), 1.1);
  p.print(circle(60, 30, 3.5), PAL.yellow, 1.1);
  p.print(roundRect(-60, 32, 5, 8, 2), PAL.orange, 1.1);
  p.wheel(-36, 14, 14, 2);
  p.wheel(38, 14, 14, 2);
  return p.root;
}
