// letterpeople/src/three/pictures/styles.ts
//
// SPIKE: style studies for word pictures (/dbg/word-pictures/styles): the
// same subjects (pig, car) in several looks, each with a motion loop.
//
//   paper  today's cut paper; a gentle sway
//   popup  the same paper parts spread out in depth, like a pop-up book; a rock
//   wood   the paper outlines cut from thick board, painted, like wooden
//          puzzle toys; a hop
//   clay   sculpted from rounded solids, soft and matte; a bounce and a blink
//          (pig), a roll back and forth (car)
//   toon   the clay sculpts in two-tone cartoon shading with an ink outline;
//          a slow turn
//
// popup and wood convert any kit-built picture (see pictures/index.ts), so
// they'd cover the whole set; clay and toon are sculpted per subject.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pig } from "./animals";
import { LAYER, PAL, col, isDetail } from "./kit";
import { car } from "./vehicles";

export type PictureStyle = "paper" | "popup" | "wood" | "clay" | "toon";
export type StyleSubject = "pig" | "car";

export const PICTURE_STYLES: { id: PictureStyle; label: string }[] = [
  { id: "paper", label: "Cut paper (now)" },
  { id: "popup", label: "Pop-up" },
  { id: "wood", label: "Wooden toy" },
  { id: "clay", label: "Clay" },
  { id: "toon", label: "Cartoon + outline" },
];

export interface StyledPicture {
  object: THREE.Object3D;
  /**
   * The motion loop at `t` seconds: poses `pivot` (a group whose origin is
   * the picture's bottom centre) and any moving parts.
   */
  motion(t: number, pivot: THREE.Object3D): void;
  /** Back to the still pose. */
  rest(pivot: THREE.Object3D): void;
}

export function buildStyled(subject: StyleSubject, style: PictureStyle): StyledPicture {
  const flat = subject === "pig" ? pig : car;
  switch (style) {
    case "paper":
      return paper(flat);
    case "popup":
      return popUp(flat);
    case "wood":
      return wooden(flat);
    case "clay":
      return subject === "pig" ? clayPig(clayMat) : clayCar(clayMat);
    case "toon":
      return toon(subject === "pig" ? clayPig(toonMat) : clayCar(toonMat));
  }
}

const resetPivot = (pivot: THREE.Object3D) => {
  pivot.position.set(0, 0, 0);
  pivot.rotation.set(0, 0, 0);
  pivot.scale.set(1, 1, 1);
};

function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
  });
}

// --- paper, pop-up ---

function paper(build: () => THREE.Object3D): StyledPicture {
  return {
    object: build(),
    motion: (t, pivot) => {
      pivot.rotation.z = 0.05 * Math.sin(t * 1.3);
    },
    rest: resetPivot,
  };
}

/** Pop-up: layer spacing × this (4 → 14 units), so a rock shows the depth between them. */
const POPUP_SPREAD = 3.5;

function popUp(build: () => THREE.Object3D): StyledPicture {
  const object = build();
  for (const c of object.children) c.position.z *= POPUP_SPREAD;
  return {
    object,
    motion: (t, pivot) => {
      pivot.rotation.y = 0.26 * Math.sin(t * 0.8);
    },
    rest: resetPivot,
  };
}

// --- wooden toy ---

const WOOD_T = 9;
const WOOD_BEVEL = 1.4;

/** A kit part's paper face (a cut-out's face, or a shadowless cut); null for printed details. */
function cutFace(o: THREE.Object3D): THREE.Mesh | null {
  if (isDetail(o)) return null;
  const face = o instanceof THREE.Mesh ? o : o.children[1];
  return face instanceof THREE.Mesh && face.geometry instanceof THREE.ShapeGeometry ? face : null;
}

/**
 * Each paper face becomes a board WOOD_T thick with rounded edges, one layer
 * per board; printed details sit painted on the front of their layer's board.
 */
function wooden(build: () => THREE.Object3D): StyledPicture {
  const src = build();
  const object = new THREE.Group();
  for (const c of [...src.children]) {
    const layer = c.position.z / LAYER;
    const face = cutFace(c);
    if (face) {
      const geo = new THREE.ExtrudeGeometry((face.geometry as THREE.ShapeGeometry).parameters.shapes, {
        depth: WOOD_T - 2 * WOOD_BEVEL,
        bevelEnabled: true,
        bevelThickness: WOOD_BEVEL,
        bevelSize: WOOD_BEVEL * 0.8,
        bevelSegments: 3,
        curveSegments: 10,
      });
      const color = (face.material as THREE.MeshLambertMaterial).color;
      const board = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.75 }));
      board.position.z = layer * WOOD_T;
      board.name = c.name;
      object.add(board);
    } else {
      const base = Math.floor(layer + 1e-6);
      c.position.z = base * WOOD_T + WOOD_T - WOOD_BEVEL + 0.3 + (layer - base) * 1.5;
      object.add(c); // moved across from src
    }
  }
  disposeTree(src);
  return {
    object,
    motion: (t, pivot) => {
      const u = (t % 2.4) / 2.4;
      const hop = u < 0.3 ? Math.sin((Math.PI * u) / 0.3) : 0;
      pivot.position.y = 14 * hop;
      pivot.rotation.z = u < 0.3 ? 0.07 * Math.sin((2 * Math.PI * u) / 0.3) : 0;
    },
    rest: resetPivot,
  };
}

// --- clay and toon: sculpted from solids ---

type MatFn = (color: THREE.Color, gloss?: boolean) => THREE.Material;

const clayMat: MatFn = (color, gloss) => new THREE.MeshStandardMaterial({ color, roughness: gloss ? 0.3 : 0.85 });

let ramp: THREE.DataTexture | null = null;
/** Three flat tones: shadow, mid, lit. */
function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([120, 195, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}
const toonMat: MatFn = (color) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() });

/** A glint: unlit, so it stays bright in every style. */
const glintMat = () => new THREE.MeshBasicMaterial({ color: PAL.cream });

interface Sculpt {
  object: THREE.Object3D;
  motion(t: number, pivot: THREE.Object3D): void;
  rest(pivot: THREE.Object3D): void;
}

function place(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  pos: [number, number, number],
  opts: { scale?: [number, number, number]; rot?: [number, number, number] } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (opts.scale) m.scale.set(...opts.scale);
  if (opts.rot) m.rotation.set(...opts.rot);
  parent.add(m);
  return m;
}

/** A standing pig, facing right and turned toward the viewer. */
function clayPig(mat: MatFn): Sculpt {
  const pink = PAL.pink;
  const rose = PAL.rose;
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.y = -0.65;
  root.add(model);
  place(model, new THREE.SphereGeometry(34, 32, 20), mat(pink), [0, 44, 0], { scale: [1.3, 1, 1.05] });
  for (const x of [-24, 24]) for (const z of [-16, 16]) place(model, new THREE.CapsuleGeometry(7, 10, 6, 14), mat(pink), [x, 12, z]);
  const head = new THREE.Vector3(44, 62, 0);
  const headR = 27;
  place(model, new THREE.SphereGeometry(headR, 32, 20), mat(pink), [head.x, head.y, head.z]);
  // Snout: a short, slightly tapered cylinder pointing forward (+x)
  place(model, new THREE.CylinderGeometry(11, 12.5, 10, 28), mat(rose), [69, 56, 0], { rot: [0, 0, -Math.PI / 2] });
  for (const z of [-4.5, 4.5]) {
    place(model, new THREE.SphereGeometry(2.4, 12, 8), mat(col(0.35, 0.05, 5)), [74.2, 56, z], { scale: [0.5, 1.2, 1] });
  }
  // Ears: flattened cones on top, tipped forward and out
  for (const s of [-1, 1]) {
    place(model, new THREE.ConeGeometry(9, 18, 20), mat(rose), [40, 86, s * 13], {
      scale: [1, 1, 0.5],
      rot: [s * 0.35, 0, -0.5],
    });
  }
  const eyes: THREE.Mesh[] = [];
  const glints: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const dir = new THREE.Vector3(0.73, 0.43, s * 0.53).normalize();
    const at = head.clone().addScaledVector(dir, headR - 1.5);
    eyes.push(place(model, new THREE.SphereGeometry(3.8, 16, 12), mat(PAL.ink, true), at.toArray() as [number, number, number]));
    const g = at.clone().addScaledVector(dir, 3.2).add(new THREE.Vector3(0, 1.4, 0));
    glints.push(place(model, new THREE.SphereGeometry(1.2, 8, 6), glintMat(), g.toArray() as [number, number, number]));
  }
  // Curly tail
  const curl = Array.from({ length: 9 }, (_, k) => new THREE.Vector3(-44 - 1.3 * k, 56 + 5 * Math.cos(k * 0.9), 5 * Math.sin(k * 0.9)));
  place(model, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curl), 40, 2.2, 8, false), mat(pink), [0, 0, 0]);

  const blink = (closed: boolean) => {
    for (const e of eyes) e.scale.y = closed ? 0.12 : 1;
    for (const g of glints) g.visible = !closed;
  };
  return {
    object: root,
    motion: (t, pivot) => {
      // Hop with squash and stretch, then a blink while it rests
      const u = (t % 2) / 2;
      resetPivot(pivot);
      if (u < 0.45) {
        const h = Math.sin((Math.PI * u) / 0.45);
        pivot.position.y = 12 * h;
        pivot.scale.set(1 - 0.03 * h, 1 + 0.06 * h, 1 - 0.03 * h);
      } else if (u < 0.6) {
        const s = Math.sin((Math.PI * (u - 0.45)) / 0.15);
        pivot.scale.set(1 + 0.05 * s, 1 - 0.1 * s, 1 + 0.05 * s);
      }
      blink(u > 0.8 && u < 0.86);
    },
    rest: (pivot) => {
      resetPivot(pivot);
      blink(false);
    },
  };
}

/** A toy car, facing right and turned toward the viewer; wheels with hubcaps that show them turning. */
function clayCar(mat: MatFn): Sculpt {
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.y = -0.55;
  root.add(model);
  const chassis = new THREE.Group();
  model.add(chassis);
  const body = new THREE.Group();
  chassis.add(body);
  const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 3, r);
  place(body, rbox(112, 30, 58, 9), mat(PAL.red), [0, 30, 0]);
  place(body, rbox(64, 30, 52, 10), mat(PAL.red), [-8, 56, 0]);
  const glass = mat(PAL.glass, true);
  for (const s of [-1, 1]) {
    place(body, rbox(20, 15, 2, 1), glass, [-18, 57, s * 26.2]);
    place(body, rbox(18, 15, 2, 1), glass, [4, 57, s * 26.2]);
    place(body, new THREE.SphereGeometry(4.5, 16, 10), mat(PAL.yellow, true), [56, 33, s * 18], { scale: [0.45, 1, 1] });
    place(body, rbox(2, 6, 10, 1), mat(PAL.orange), [-56.2, 33, s * 18]);
  }
  place(body, rbox(2, 14, 30, 1), glass, [24.3, 57, 0]);
  place(body, rbox(2, 14, 30, 1), glass, [-40.3, 57, 0]);
  const WHEEL_R = 14;
  const wheels: THREE.Group[] = [];
  for (const x of [-34, 34]) {
    for (const s of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, WHEEL_R, s * 27);
      const axis: [number, number, number] = [Math.PI / 2, 0, 0];
      place(wheel, new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 10, 28), mat(PAL.darkGrey), [0, 0, 0], { rot: axis });
      place(wheel, new THREE.CylinderGeometry(6.5, 6.5, 2.4, 20), mat(PAL.grey, true), [0, 0, s * 5.6], { rot: axis });
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * Math.PI) / 3;
        place(wheel, new THREE.SphereGeometry(1.4, 8, 6), mat(PAL.darkGrey), [3.6 * Math.cos(a), 3.6 * Math.sin(a), s * 6.9]);
      }
      chassis.add(wheel);
      wheels.push(wheel);
    }
  }
  return {
    object: root,
    motion: (t) => {
      // Roll a little forward and back; the body pitches with the pull
      const x = 10 * Math.sin(t * 1.3);
      chassis.position.x = x;
      for (const w of wheels) w.rotation.z = -x / WHEEL_R;
      body.rotation.z = -0.02 * Math.sin(t * 1.3);
    },
    rest: (pivot) => {
      resetPivot(pivot);
      chassis.position.x = 0;
      body.rotation.z = 0;
      for (const w of wheels) w.rotation.z = 0;
    },
  };
}

const OUTLINE_WIDTH = 1.4;
let outlineMaterial: THREE.MeshBasicMaterial | null = null;
/** Inverted hull: back faces, pushed out along the normals, in ink. */
function outlineMat(): THREE.MeshBasicMaterial {
  if (!outlineMaterial) {
    outlineMaterial = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide });
    outlineMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\ntransformed += normalize(normal) * ${OUTLINE_WIDTH.toFixed(2)};`,
      );
    };
  }
  return outlineMaterial;
}

/** Cartoon: the sculpt (already in toon materials) gets an ink outline, and turns slowly. */
function toon(s: Sculpt): StyledPicture {
  const meshes: THREE.Mesh[] = [];
  s.object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  for (const m of meshes) {
    m.geometry.computeBoundingSphere();
    if ((m.geometry.boundingSphere?.radius ?? 0) < 4) continue; // eyes, nostrils, glints, bolts
    // Welded normals, so the hull doesn't split open at hard edges
    const g = m.geometry.clone();
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    const welded = mergeVertices(g);
    welded.computeVertexNormals();
    g.dispose();
    m.add(new THREE.Mesh(welded, outlineMat()));
  }
  return {
    object: s.object,
    motion: (t, pivot) => {
      pivot.rotation.y = t * 0.5;
    },
    rest: s.rest,
  };
}
