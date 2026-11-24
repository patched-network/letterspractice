// letterpeople/src/three/pictures/nature.ts
//
// SPIKE: word pictures: sky and outdoors (sun, moon, star, tree, rock).

import type * as THREE from "three";
import { PAL, Pic, circle, col, crescent, roundPoly, starPoints } from "./kit";

export function sun(): THREE.Object3D {
  const p = new Pic();
  // Rays: one sunburst behind the disc, its tips showing round the edge
  p.cut(roundPoly(starPoints(0, 0, 60, 36, 12), [5, 2]), PAL.amber, 0, "rays", 2);
  p.cut(circle(0, 0, 40), PAL.yellow, 1, "disc");
  return p.root;
}

export function moon(): THREE.Object3D {
  const p = new Pic();
  p.cut(crescent(46, 22, 12, 40), col(0.87, 0.11, 98), 0, "moon");
  // A few soft craters on the crescent's body
  const crater = col(0.8, 0.1, 92);
  p.print(circle(-30, -8, 5.5), crater, 0.1, "crater");
  p.print(circle(-18, -28, 4), crater, 0.1);
  p.print(circle(-30, 16, 3.5), crater, 0.1);
  return p.root;
}

export function star(): THREE.Object3D {
  const p = new Pic();
  p.cut(roundPoly(starPoints(0, 0, 52, 23), [6, 3]), col(0.85, 0.15, 88), 0, "star");
  return p.root;
}

export function tree(): THREE.Object3D {
  const p = new Pic();
  p.cut(
    roundPoly(
      [
        [-11, 0],
        [11, 0],
        [7, 60],
        [-7, 60],
      ],
      3,
    ),
    PAL.brown,
    0,
    "trunk",
  );
  // A round, cloud-like crown: overlapping discs on one layer read as one shape
  for (const [x, y, r] of [
    [0, 100, 34],
    [-28, 78, 27],
    [28, 78, 27],
    [0, 70, 26],
  ] as const) {
    p.cut(circle(x, y, r), PAL.green, 1, "crown");
  }
  return p.root;
}

export function rock(): THREE.Object3D {
  const p = new Pic();
  p.cut(
    roundPoly(
      [
        [-52, 0],
        [50, 0],
        [56, 20],
        [36, 46],
        [4, 56],
        [-30, 46],
        [-54, 22],
      ],
      12,
    ),
    col(0.64, 0.015, 250),
    0,
    "rock",
  );
  // Lighter facet catching the light, upper left
  p.print(
    roundPoly(
      [
        [-32, 38],
        [2, 49],
        [20, 38],
        [-8, 28],
      ],
      7,
    ),
    col(0.76, 0.012, 250),
    0.1,
  );
  return p.root;
}
