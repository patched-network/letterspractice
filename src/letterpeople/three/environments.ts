// letterpeople/src/three/environments.ts
//
// SPIKE: procedural stage environments for vibes inspection. Low-poly /
// cut-paper aesthetic, no assets. Everything is generated from a fixed seed
// so each option looks the same on every visit.
//
// Rules every environment follows:
//  - Muted, low-chroma palette: letters get random hues; the set mustn't
//    clash with (or out-shout) them.
//  - Nothing below y = 0. The stage floor never writes depth (so sunk
//    descenders stay visible), which means anything under the floor line
//    would show through it. (Exception: sets that replace the floor with
//    their own ground, `showFloor: false` — the harbor.)
//  - The stage area (|x| ≲ 300, -150 ≲ z ≲ 100) stays clear.
//  - Cheap to draw: each environment is baked to one mesh per material kind
//    (colours carried per vertex), so a shelf of 200 books is one draw call.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { oklch } from "../util/color";
import { buildSlide } from "./slideProp";

export type EnvironmentName =
  | "plain"
  | "horizon"
  | "ruled-paper"
  | "cut-paper"
  | "meadow"
  | "bookshelf"
  | "harbor-cutaway"
  | "harbor-waves"
  | "playground"
  | "bedroom";

export const ENVIRONMENTS: { value: EnvironmentName; title: string }[] = [
  { value: "plain", title: "Plain" },
  { value: "horizon", title: "Soft horizon" },
  { value: "ruled-paper", title: "Ruled paper" },
  { value: "cut-paper", title: "Cut-paper hills" },
  { value: "meadow", title: "Low-poly meadow" },
  { value: "bookshelf", title: "Bookshelf (abstract)" },
  { value: "harbor-cutaway", title: "Harbor: cutaway (digraph)" },
  { value: "harbor-waves", title: "Harbor: wave flats (digraph)" },
  { value: "playground", title: "Playground: sandbox + slide (sight words)" },
  { value: "bedroom", title: "Bedroom at night (bed lesson)" },
];

export interface Environment {
  readonly group: THREE.Group;
  /** Scene background (colour or screen-space texture). */
  readonly background: THREE.Color | THREE.Texture;
  readonly fog: THREE.Fog | null;
  /** Colour for the stage floor (the depth-less backdrop plane). */
  readonly floorColor: THREE.Color;
  /** Optional texture for the stage floor. */
  readonly floorMap: THREE.Texture | null;
  /** False: the set brings its own ground and the stage floor is hidden. */
  readonly showFloor?: boolean;
  /**
   * Time of day, for sets that have one: 0 night … 1 day (the bedroom's
   * window). Absent: the set looks the same at any hour.
   */
  setDaylight?(t: number): void;
  dispose(): void;
}

export const col = (l: number, c: number, h: number) => new THREE.Color(oklch(l, c, h));

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vertical gradient for scene.background (drawn screen-space). */
function gradient(top: THREE.Color, bottom: THREE.Color) {
  return canvasTexture(2, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(1, `#${bottom.getHexString()}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
  });
}

export const lambert = (color: THREE.Color, flat = true) =>
  new THREE.MeshLambertMaterial({ color, flatShading: flat });

/**
 * Straight snips per curve in a paper cut-out. (Was 1, which cut every curve
 * as a single chord: circles and the two-curve fish body collapsed to lines
 * and never drew; sails and weeds lost their curves.)
 */
const CURVE_SEGMENTS = 8;

/**
 * A flat paper cut-out with a darker offset shadow behind it. `drop` moves
 * the shadow down as well as right — off for shapes standing on the floor,
 * whose shadow would otherwise dip below it. Curves are cut in
 * CURVE_SEGMENTS straight snips (a circle gets twice that).
 */
export function paperCutout(shape: THREE.Shape, color: THREE.Color, shadowOffset = 5, drop = true) {
  const g = new THREE.Group();
  const geo = new THREE.ShapeGeometry(shape, CURVE_SEGMENTS);
  const face = new THREE.Mesh(geo, lambert(color, false));
  const shadow = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.72) }),
  );
  shadow.position.set(drop ? shadowOffset * 0.6 : shadowOffset * 1.4, drop ? -shadowOffset : 0, -3);
  g.add(shadow, face);
  return g;
}

/** A paper cloud: five white puffs, about 200 across. */
function paperCloud(): THREE.Group {
  const cloud = new THREE.Group();
  for (const [dx, dy, rad] of [
    [0, 0, 44],
    [50, 10, 36],
    [-46, 6, 32],
    [16, 32, 34],
    [88, -4, 24],
  ]) {
    const puff = paperCutout(new THREE.Shape().absarc(0, 0, rad, 0, Math.PI * 2, false), col(0.99, 0.004, 220), 4);
    puff.position.set(dx, dy, 0);
    cloud.add(puff);
  }
  return cloud;
}

/** An axis-aligned rectangle shape. */
function rectShape(x0: number, y0: number, x1: number, y1: number): THREE.Shape {
  return new THREE.Shape([
    new THREE.Vector2(x0, y0),
    new THREE.Vector2(x1, y0),
    new THREE.Vector2(x1, y1),
    new THREE.Vector2(x0, y1),
  ]);
}

/**
 * Merge every mesh in `group` into one mesh per material kind (basic /
 * lambert, flat or smooth), with each source mesh's colour baked into a
 * vertex colour attribute. Replaces the group's children. Meshes marked
 * `userData.noBake` (e.g. transparent ones, which the merge would make
 * opaque) are kept as they are.
 */
function bake(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { geos: THREE.BufferGeometry[]; make: () => THREE.Material }>();
  const sources: THREE.Mesh[] = [];
  const kept: THREE.Object3D[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.userData.noBake) kept.push(m);
    else if (m.isMesh) sources.push(m);
  });
  for (const m of sources) {
    const mat = m.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
    const flat = "flatShading" in mat && !!mat.flatShading;
    const key = `${mat.type}|${flat}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        geos: [],
        make: () =>
          mat.type === "MeshBasicMaterial"
            ? new THREE.MeshBasicMaterial({ vertexColors: true })
            : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat }),
      });
    }
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    g.deleteAttribute("uv");
    const n = g.getAttribute("position").count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) mat.color.toArray(colors, i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    buckets.get(key)!.geos.push(g);
  }
  // Dispose the sources (geometry may be shared between face and shadow)
  const seen = new Set<unknown>();
  for (const m of sources) {
    for (const x of [m.geometry, m.material as THREE.Material]) {
      if (!seen.has(x)) (seen.add(x), (x as { dispose(): void }).dispose());
    }
  }
  group.clear();
  for (const { geos, make } of buckets.values()) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (merged) group.add(new THREE.Mesh(merged, make()));
  }
  for (const o of kept) {
    // Keep its world placement now that its old parents are gone
    o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
    group.add(o);
  }
}

function base(
  background: THREE.Color | THREE.Texture,
  floorColor: THREE.Color,
  fog: THREE.Fog | null,
  floorMap: THREE.Texture | null = null,
): Environment {
  const group = new THREE.Group();
  return {
    group,
    background,
    fog,
    floorColor,
    floorMap,
    dispose() {
      const seen = new Set<unknown>();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !seen.has(m.geometry)) {
          seen.add(m.geometry);
          m.geometry.dispose();
        }
        const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        for (const mat of mats) if (!seen.has(mat)) (seen.add(mat), mat.dispose());
      });
      if (background instanceof THREE.Texture) background.dispose();
      floorMap?.dispose();
    },
  };
}

// ---------------------------------------------------------------------------

function plain(): Environment {
  return base(new THREE.Color("#FFFEF7"), new THREE.Color("#f3eee0"), null);
}

function horizon(): Environment {
  const sky = col(0.95, 0.015, 85);
  const ground = col(0.92, 0.02, 80);
  return base(
    gradient(col(0.97, 0.01, 90), sky),
    ground,
    new THREE.Fog(sky, 900, 2600),
  );
}

function ruledPaper(anisotropy: number): Environment {
  const paper = col(0.975, 0.012, 90);
  // One repeat = one handwriting row: solid top line, dashed midline,
  // solid baseline (the rows run across the stage, receding into depth).
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = `#${paper.getHexString()}`;
    g.fillRect(0, 0, 256, 256);
    const line = "rgba(90, 140, 210, 0.55)";
    g.strokeStyle = line;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 20);
    g.lineTo(256, 20);
    g.moveTo(0, 236);
    g.lineTo(256, 236);
    g.stroke();
    g.setLineDash([14, 12]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 128);
    g.lineTo(256, 128);
    g.stroke();
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  // Floor plane is 20000 square; one row ≈ 110 units deep
  tex.repeat.set(20000 / 220, 20000 / 110);
  return base(
    gradient(col(0.985, 0.008, 90), paper),
    new THREE.Color(0xffffff),
    new THREE.Fog(paper, 800, 2400),
    tex,
  );
}

function cutPaper(): Environment {
  const r = rng(7);
  const sky = col(0.95, 0.02, 220);
  const env = base(gradient(col(0.97, 0.015, 220), sky), col(0.9, 0.035, 135), null);

  // Hill layers: back (pale, tall) to front (deeper, low)
  const layers = [
    { z: -1400, top: 260, l: 0.88, c: 0.03, h: 170 },
    { z: -950, top: 190, l: 0.85, c: 0.04, h: 155 },
    { z: -620, top: 130, l: 0.82, c: 0.045, h: 140 },
    { z: -380, top: 70, l: 0.8, c: 0.05, h: 128 },
  ];
  for (const L of layers) {
    const shape = new THREE.Shape();
    const x0 = -3000;
    const x1 = 3000;
    shape.moveTo(x0, 0);
    const phase = r() * 10;
    const steps = 22; // few points: a scissor-cut edge, not a smooth curve
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y =
        L.top *
        (0.55 + 0.3 * Math.sin(x / 520 + phase) + 0.15 * Math.sin(x / 170 + phase * 2) + 0.08 * (r() - 0.5));
      shape.lineTo(x, Math.max(8, y));
    }
    shape.lineTo(x1, 0);
    shape.closePath();
    const hill = paperCutout(shape, col(L.l, L.c, L.h), 6, false);
    hill.position.z = L.z;
    env.group.add(hill);
  }

  // Sun and clouds
  const sun = paperCutout(new THREE.Shape().absarc(0, 0, 70, 0, Math.PI * 2, false), col(0.93, 0.06, 90), 4);
  sun.position.set(-520, 520, -1500);
  env.group.add(sun);
  for (const [x, y] of [
    [380, 470],
    [-150, 560],
    [760, 380],
  ]) {
    const cloud = new THREE.Group();
    for (const [dx, dy, rad] of [
      [0, 0, 40],
      [45, 12, 34],
      [-42, 8, 30],
      [18, 30, 30],
    ]) {
      const puff = paperCutout(new THREE.Shape().absarc(0, 0, rad, 0, Math.PI * 2, false), col(0.985, 0.005, 220), 3);
      puff.position.set(dx, dy, 0);
      cloud.add(puff);
    }
    cloud.position.set(x, y, -1450);
    env.group.add(cloud);
  }
  return env;
}

function meadow(): Environment {
  const r = rng(11);
  const skyTop = col(0.9, 0.04, 230);
  const skyLow = col(0.96, 0.02, 200);
  const grass = col(0.86, 0.05, 135);
  const env = base(gradient(skyTop, skyLow), grass, new THREE.Fog(skyLow, 1000, 3200));

  // Faceted hills beyond the stage (heights ≥ 0; the stage area stays flat
  // on the depth-less floor)
  const hills = new THREE.PlaneGeometry(6000, 2600, 36, 14);
  hills.rotateX(-Math.PI / 2);
  const pos = hills.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) - 1500; // shift back: spans z ≈ -2800 … -200
    const back = Math.min(1, Math.max(0, (-z - 250) / 900)); // 0 near stage, 1 far
    const h = back * (60 + 90 * Math.sin(x / 420 + 1.3) + 50 * Math.sin(x / 190) + 40 * r());
    pos.setXYZ(i, x, Math.max(0, h), z);
  }
  hills.computeVertexNormals();
  env.group.add(new THREE.Mesh(hills, lambert(col(0.84, 0.055, 138))));

  // Cone trees
  const treeMat = lambert(col(0.72, 0.06, 150));
  const trunkMat = lambert(col(0.6, 0.04, 60));
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 3000;
    const z = -420 - r() * 1400;
    if (Math.abs(x) < 260 && z > -600) continue; // keep the stage backdrop clear
    const s = 0.7 + r() * 0.8;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(34 * s, 110 * s, 6), treeMat);
    cone.position.set(x, 30 * s + 55 * s, z);
    cone.rotation.y = r() * Math.PI;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(6 * s, 7 * s, 30 * s, 5), trunkMat);
    trunk.position.set(x, 15 * s, z);
    env.group.add(cone, trunk);
  }

  // Chunky clouds
  const cloudMat = lambert(new THREE.Color(0xffffff));
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(40 + r() * 25, 0), cloudMat);
      puff.position.set(k * 45 - 45, r() * 15, r() * 20);
      puff.scale.y = 0.6;
      cloud.add(puff);
    }
    cloud.position.set((r() - 0.5) * 2600, 380 + r() * 220, -1700 - r() * 600);
    env.group.add(cloud);
  }
  return env;
}

/**
 * Floorboards running away from the viewer: flat planks with a slight
 * per-plank tone shift, thin seams, staggered end joints. No grain — it's
 * cut paper, not a photo.
 */
function floorboards(anisotropy: number): THREE.Texture {
  const r = rng(19);
  const PLANKS = 8; // across the texture
  const W = 512;
  const H = 1024;
  const tex = canvasTexture(W, H, (g) => {
    const pw = W / PLANKS;
    for (let p = 0; p < PLANKS; p++) {
      // Two or three boards end-to-end per plank column, joints staggered
      let y = -r() * H * 0.5;
      while (y < H) {
        const len = H * (0.35 + r() * 0.3);
        const shade = col(0.8 + (r() - 0.5) * 0.05, 0.045 + (r() - 0.5) * 0.01, 62 + (r() - 0.5) * 8);
        g.fillStyle = `#${shade.getHexString()}`;
        g.fillRect(p * pw, y, pw, len);
        g.fillStyle = `#${col(0.64, 0.04, 58).getHexString()}`;
        g.fillRect(p * pw, y + len - 3, pw, 3); // end joint
        y += len;
      }
      g.fillStyle = `#${col(0.62, 0.04, 58).getHexString()}`;
      g.fillRect(p * pw + pw - 3, 0, 3, H); // long seam
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  // One texture = 8 planks × ~32 units wide, boards ~480 units long
  tex.repeat.set(20000 / 256, 20000 / 480);
  return tex;
}

function bookshelf(anisotropy: number): Environment {
  const r = rng(3);
  const wall = col(0.93, 0.02, 75);
  const env = base(wall.clone(), new THREE.Color(0xffffff), null, floorboards(anisotropy));

  const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000), lambert(wall, false));
  wallMesh.position.set(0, 1500, -320);
  env.group.add(wallMesh);

  // Shelf unit behind the stage
  const wood = lambert(col(0.72, 0.045, 65));
  const shelfW = 1500;
  const shelfZ = -280;
  const depth = 50;
  const levels = [0, 125, 250, 375, 500];
  for (const y of levels) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(shelfW, 8, depth), wood);
    board.position.set(0, y + 4, shelfZ);
    env.group.add(board);
  }
  for (const x of [-shelfW / 2, -shelfW / 6, shelfW / 6, shelfW / 2]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(10, levels[levels.length - 1] + 8, depth), wood);
    side.position.set(x, (levels[levels.length - 1] + 8) / 2, shelfZ);
    env.group.add(side);
  }

  // Blank books: muted blocks, varied, a few leaning, occasional gaps
  const hues = [20, 60, 110, 170, 230, 290];
  for (let li = 0; li < levels.length - 1; li++) {
    const y0 = levels[li] + 8;
    let x = -shelfW / 2 + 8;
    while (x < shelfW / 2 - 20) {
      if (r() < 0.08) {
        x += 25 + r() * 40; // gap
        continue;
      }
      const w = 9 + r() * 12;
      const h = 70 + r() * 42;
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, depth * 0.8),
        lambert(col(0.72 + r() * 0.1, 0.035 + r() * 0.035, hues[Math.floor(r() * hues.length)])),
      );
      const lean = r() < 0.07 ? (r() < 0.5 ? -1 : 1) * (8 + r() * 10) : 0;
      book.rotation.z = THREE.MathUtils.degToRad(lean);
      book.position.set(x + w / 2, y0 + h / 2 - Math.abs(lean) * 0.3, shelfZ);
      env.group.add(book);
      x += w + 1 + Math.abs(lean) * 0.8;
    }
  }
  return env;
}

// ---------------------------------------------------------------------------
// Bedroom (the bed lesson: b/d)
//
// A low-poly bedroom at night: a wall behind the stage with a window in the
// middle (night sky, moon and stars: self-lit, so they glow when the room is
// dark), picture frames either side (BEDROOM_FRAMES, hung by the lesson), a
// door on the right, a skirting board, floorboards and a rug in front of the
// bed. The bed is the lesson's letters; the end table and lamp are a prop
// (bedroomProps.ts), since the lamp is cued. The lesson dims the stage's
// lights for night (Stage3D.setLightLevel).
// ---------------------------------------------------------------------------

/** The bedroom's back wall (its face), behind the stage area. */
export const BEDROOM_WALL_Z = -180;

/**
 * Picture frames on the bedroom wall, either side of the window: the inner
 * area (inside the moulding) of each, centre and size. Empty in the set; a
 * lesson hangs pictures in them (bedroomProps.ts hangPicture).
 */
export const BEDROOM_FRAMES = {
  leftOuter: { x: -232, y: 178, w: 50, h: 58 },
  leftInner: { x: -138, y: 222, w: 58, h: 46 },
  rightInner: { x: 138, y: 222, w: 58, h: 46 },
} as const;

function bedroom(anisotropy: number): Environment {
  const r = rng(41);
  const wall = col(0.8, 0.035, 245);
  const env = base(wall.clone(), new THREE.Color(0xffffff), null, floorboards(anisotropy));
  const g = env.group;
  const z = BEDROOM_WALL_Z;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, zz: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, zz);
    g.add(m);
    return m;
  };

  // Wall
  add(new THREE.PlaneGeometry(6000, 3000), lambert(wall, false), 0, 1500, z);

  // Window: a sky behind a white frame, a sill. The sky, moon, stars and sun
  // stay out of the bake (each keeps its own material) so setDaylight can
  // recolour them: night to dawn to day. Self-lit (basic materials), so the
  // window glows when the room is dark.
  const win = { x: 0, y0: 150, w: 120, h: 125 };
  const frame = lambert(col(0.94, 0.01, 85));
  const live = (geo: THREE.BufferGeometry, color: THREE.Color, x: number, y: number, zz: number) => {
    const m = add(geo, new THREE.MeshBasicMaterial({ color }), x, y, zz);
    m.userData.noBake = true;
    return m.material as THREE.MeshBasicMaterial;
  };
  const SKY = { night: col(0.34, 0.075, 268), dawn: col(0.8, 0.085, 45), day: col(0.87, 0.065, 232) };
  const sky = live(new THREE.PlaneGeometry(win.w, win.h), SKY.night.clone(), win.x, win.y0 + win.h / 2, z + 0.5);
  const moonAt = { x: win.x + 30, y: win.y0 + win.h - 30 };
  const MOON = col(0.95, 0.06, 95);
  const moon = live(new THREE.CircleGeometry(15, 9), MOON.clone(), moonAt.x, moonAt.y, z + 1);
  // A bite out of it, in sky colour: a crescent
  const bite = live(new THREE.CircleGeometry(13, 9), SKY.night.clone(), moonAt.x + 7, moonAt.y + 5, z + 1.5);
  const STAR = col(0.92, 0.04, 95);
  const stars: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 9; i++) {
    const sx = win.x - win.w / 2 + 10 + r() * (win.w - 20);
    const sy = win.y0 + 10 + r() * (win.h - 20);
    const size = 1.4 + r() * 1.2;
    if (Math.hypot(sx - moonAt.x, sy - moonAt.y) < 26) continue;
    stars.push(live(new THREE.CircleGeometry(size, 4), STAR.clone(), sx, sy, z + 1));
  }
  // The sun comes up in the lower left pane (sky-coloured, so unseen, at night)
  const SUN = col(0.92, 0.13, 85);
  const sunFrom = { x: win.x - 30, y: win.y0 + 16 };
  const sunRise = 34;
  const sunMesh = add(new THREE.CircleGeometry(14, 10), new THREE.MeshBasicMaterial({ color: SKY.night.clone() }), sunFrom.x, sunFrom.y, z + 1);
  sunMesh.userData.noBake = true;
  const sun = sunMesh.material as THREE.MeshBasicMaterial;

  const ramp = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  env.setDaylight = (t: number) => {
    const skyNow = t < 0.5 ? SKY.night.clone().lerp(SKY.dawn, t / 0.5) : SKY.dawn.clone().lerp(SKY.day, (t - 0.5) / 0.5);
    sky.color.copy(skyNow);
    bite.color.copy(skyNow);
    for (const st of stars) st.color.copy(STAR).lerp(skyNow, ramp(t, 0, 0.35));
    moon.color.copy(MOON).lerp(skyNow, ramp(t, 0.15, 0.6));
    sun.color.copy(skyNow).lerp(SUN, ramp(t, 0.3, 0.7));
    sunMesh.position.y = sunFrom.y + sunRise * ramp(t, 0.3, 1);
  };

  const t = 7;
  add(new THREE.BoxGeometry(win.w + 2 * t, t, 6), frame, win.x, win.y0 + win.h + t / 2, z + 3);
  add(new THREE.BoxGeometry(win.w + 2 * t, t, 6), frame, win.x, win.y0 - t / 2, z + 3);
  add(new THREE.BoxGeometry(t, win.h, 6), frame, win.x - win.w / 2 - t / 2, win.y0 + win.h / 2, z + 3);
  add(new THREE.BoxGeometry(t, win.h, 6), frame, win.x + win.w / 2 + t / 2, win.y0 + win.h / 2, z + 3);
  add(new THREE.BoxGeometry(4, win.h, 4), frame, win.x, win.y0 + win.h / 2, z + 3); // mullion
  add(new THREE.BoxGeometry(win.w, 4, 4), frame, win.x, win.y0 + win.h / 2, z + 3); // transom
  add(new THREE.BoxGeometry(win.w + 2 * t + 12, 5, 14), frame, win.x, win.y0 - t - 2.5, z + 7); // sill

  // Picture frames: a wooden moulding round a cream mat (the picture goes on the mat)
  const moulding = lambert(col(0.58, 0.06, 55));
  const mat = lambert(col(0.95, 0.02, 85), false);
  const M = 5;
  for (const f of Object.values(BEDROOM_FRAMES)) {
    add(new THREE.BoxGeometry(f.w + 2 * M, M, 4), moulding, f.x, f.y + f.h / 2 + M / 2, z + 2);
    add(new THREE.BoxGeometry(f.w + 2 * M, M, 4), moulding, f.x, f.y - f.h / 2 - M / 2, z + 2);
    add(new THREE.BoxGeometry(M, f.h, 4), moulding, f.x - f.w / 2 - M / 2, f.y, z + 2);
    add(new THREE.BoxGeometry(M, f.h, 4), moulding, f.x + f.w / 2 + M / 2, f.y, z + 2);
    add(new THREE.PlaneGeometry(f.w, f.h), mat, f.x, f.y, z + 0.5);
  }

  // The bedroom door, on the right: a panelled slab in a frame, a round knob
  const door = { x: 252, w: 84, h: 196 };
  // Skirting board, stopping at the door's casing either side (it ran across
  // the bottom of the door)
  const skirting = lambert(col(0.9, 0.015, 80));
  const casing = { x0: door.x - door.w / 2 - 8, x1: door.x + door.w / 2 + 8 };
  const WALL_END = 3000;
  add(new THREE.BoxGeometry(casing.x0 + WALL_END, 12, 4), skirting, (casing.x0 - WALL_END) / 2, 6, z + 2);
  add(new THREE.BoxGeometry(WALL_END - casing.x1, 12, 4), skirting, (casing.x1 + WALL_END) / 2, 6, z + 2);
  const doorWood = lambert(col(0.82, 0.03, 75));
  const doorTrim = lambert(col(0.93, 0.012, 85));
  add(new THREE.BoxGeometry(door.w, door.h, 3), doorWood, door.x, door.h / 2, z + 1.5);
  for (const [px, py, pw, ph] of [
    [-18, 140, 30, 64],
    [18, 140, 30, 64],
    [-18, 52, 30, 76],
    [18, 52, 30, 76],
  ]) {
    add(new THREE.BoxGeometry(pw, ph, 2), lambert(col(0.79, 0.03, 75)), door.x + px, py, z + 3.5);
  }
  add(new THREE.BoxGeometry(door.w + 16, 8, 5), doorTrim, door.x, door.h + 4, z + 2.5);
  add(new THREE.BoxGeometry(8, door.h, 5), doorTrim, door.x - door.w / 2 - 4, door.h / 2, z + 2.5);
  add(new THREE.BoxGeometry(8, door.h, 5), doorTrim, door.x + door.w / 2 + 4, door.h / 2, z + 2.5);
  add(new THREE.SphereGeometry(4, 7, 5), lambert(col(0.75, 0.08, 85)), door.x - door.w / 2 + 12, 92, z + 6);

  // Rug in front of the bed: an octagon with a border
  const rug = (rx: number, rz: number, y: number, c: THREE.Color) => {
    // Turned an eighth so its edges (not corners) face the axes, then stretched
    const m = add(new THREE.CircleGeometry(1, 8).rotateZ(Math.PI / 8), lambert(c), 0, y, 80);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(rx, rz, 1);
  };
  rug(165, 58, 0.4, col(0.66, 0.07, 20));
  rug(150, 50, 0.6, col(0.76, 0.05, 30));

  return env;
}

// ---------------------------------------------------------------------------
// Harbor (the digraph lesson: sh → ship → fish)
//
// The stage is a pier. Its deck is the floor (y = 0) and its front edge is the
// word line: letters standing at HARBOR_WORD_Z stick out a few units past the
// fascia, so a descender (the p of ship) sits on its round bottom with its
// tail dangling in front of the pier, dipping into the water. Sea below and
// out to the horizon; the ship and fish are animated props (harborProps.ts).
//
// Two ways to show fish "underneath":
//  - cutaway:  a see-through slice of water in front of the pier, like a
//              picture-book cross-section; fish swim under the surface.
//  - waves:    layered paper wave flats, puppet-theatre style; fish leap
//              between them.
// ---------------------------------------------------------------------------

/** Front face of the pier (its fascia). */
export const HARBOR_EDGE_Z = 15;
/** Where letters stand in a word: front faces a few units proud of the edge. */
export const HARBOR_WORD_Z = 10;
/** The water surface, below the deck. A descender (35 deep) dips its tip in. */
export const HARBOR_WATER_Y = -30;
/** Cutaway: the front slice of water. */
export const HARBOR_CUT_Z = 80;
/** Cutaway: the sea floor. */
export const HARBOR_FLOOR_Y = -150;
/** Wave flats: z of each flat, back to front. Fish swim between them. */
export const HARBOR_WAVE_Z = [45, 85, 130] as const;
const HARBOR_BACK_Z = -270;
const HARBOR_HALF_WIDTH = 2400;

export type HarborKind = "cutaway" | "waves";
export const harborKind = (name: EnvironmentName | undefined): HarborKind | null =>
  name === "harbor-cutaway" ? "cutaway" : name === "harbor-waves" ? "waves" : null;

/** A scissor-cut wavy top edge from x0 to x1 around y = top, down to `bottom`. */
function waveShape(x0: number, x1: number, top: number, bottom: number, amp: number, wave: number, phase: number) {
  const shape = new THREE.Shape();
  shape.moveTo(x0, bottom);
  const steps = Math.ceil((x1 - x0) / (wave / 4)); // four points a wave: cut, not smooth
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    shape.lineTo(x, top + amp * Math.sin((x / wave) * Math.PI * 2 + phase));
  }
  shape.lineTo(x1, bottom);
  shape.closePath();
  return shape;
}

function harbor(kind: HarborKind): Environment {
  const r = rng(23);
  const skyTop = col(0.9, 0.04, 235);
  const skyLow = col(0.965, 0.018, 215);
  const sea = col(0.8, 0.05, 218);
  const env: Environment = {
    ...base(gradient(skyTop, skyLow), sea, new THREE.Fog(skyLow, 1600, 5200)),
    showFloor: false,
  };
  const add = (...o: THREE.Object3D[]) => env.group.add(...o);

  // Sea surface: out to the horizon, forward to the cutaway (or under the
  // flats). Opaque up to the quay wall; in front of it a see-through strip,
  // so the p's tail tip reads as dipped in the water rather than cut off.
  // (One transparent draw call over a thin band of screen.)
  const front = kind === "cutaway" ? HARBOR_CUT_Z : HARBOR_WAVE_Z[0] + 5;
  const far = -9000;
  const surfaceStrip = (z0: number, z1: number, material: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(HARBOR_HALF_WIDTH * 6, z1 - z0), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, HARBOR_WATER_Y, (z0 + z1) / 2);
    add(m);
    return m;
  };
  surfaceStrip(far, HARBOR_EDGE_Z, lambert(sea, false));
  const shallows = new THREE.MeshLambertMaterial({ color: sea, transparent: true, opacity: 0.5, depthWrite: false });
  surfaceStrip(HARBOR_EDGE_Z, front, shallows).userData.noBake = true;

  // Far headlands: low paper cut-outs on the horizon, the middle kept open for the ship
  for (const [x0, x1, top, z] of [
    [-4200, -700, 120, -4200],
    [900, 4600, 90, -4600],
  ] as const) {
    const shape = new THREE.Shape();
    shape.moveTo(x0, 0);
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = x0 + (x1 - x0) * u;
      const y = top * Math.sin(Math.PI * u) ** 0.6 * (0.8 + 0.2 * Math.sin(u * 9 + x0) + 0.1 * (r() - 0.5));
      shape.lineTo(x, Math.max(0, y));
    }
    shape.lineTo(x1, 0);
    shape.closePath();
    const land = paperCutout(shape, col(0.84, 0.035, 150), 8, false);
    land.position.set(0, HARBOR_WATER_Y, z);
    add(land);
  }

  // Clouds: paper puffs, still (motion up there would compete with the letters)
  for (const [x, y, z, s] of [
    [-620, 330, -2200, 1.1],
    [140, 400, -2600, 0.9],
    [760, 300, -2000, 1],
    [1500, 420, -2800, 1.2],
  ]) {
    const cloud = paperCloud();
    cloud.scale.setScalar(s);
    cloud.position.set(x, y, z);
    add(cloud);
  }

  // The pier. Deck boards run front to back, slightly varied, with seams.
  const deckDepth = HARBOR_EDGE_Z + 1 - HARBOR_BACK_Z; // boards lip 1 unit past the fascia
  const board = 26;
  for (let x = -HARBOR_HALF_WIDTH; x < HARBOR_HALF_WIDTH; x += board) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(board - 2, 6, deckDepth),
      lambert(col(0.77 + (r() - 0.5) * 0.05, 0.045 + (r() - 0.5) * 0.01, 62 + (r() - 0.5) * 8)),
    );
    plank.position.set(x + board / 2, -3, HARBOR_BACK_Z + deckDepth / 2);
    add(plank);
  }
  const darkWood = col(0.58, 0.045, 55);
  // Beneath the boards (shows in the seams)
  const under = new THREE.Mesh(new THREE.BoxGeometry(HARBOR_HALF_WIDTH * 2, 2, deckDepth), lambert(darkWood));
  under.position.set(0, -6, HARBOR_BACK_Z + deckDepth / 2);
  add(under);
  // Fascia / quay wall: down into the water (to the sea floor in the cutaway)
  const wallBottom = kind === "cutaway" ? HARBOR_FLOOR_Y : HARBOR_WATER_Y - 60;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(HARBOR_HALF_WIDTH * 2, -6 - wallBottom, 10),
    lambert(col(0.64, 0.045, 58)),
  );
  wall.position.set(0, (-6 + wallBottom) / 2, HARBOR_EDGE_Z - 5);
  add(wall);
  // Back edge, seen from the front across the deck
  const back = new THREE.Mesh(new THREE.BoxGeometry(HARBOR_HALF_WIDTH * 2, 40, 10), lambert(darkWood));
  back.position.set(0, -26, HARBOR_BACK_Z + 5);
  add(back);
  // Piles: the pier stands on posts. Along the back edge they run down into
  // the water; two stand tall as bollards (capped), clear of the entrances.
  const pileWood = lambert(col(0.5, 0.02, 60), false);
  const pile = (x: number, z: number, top: number, bottom: number, r: number) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 1.5, top - bottom, 10), pileWood);
    post.position.set(x, (top + bottom) / 2, z);
    add(post);
  };
  const backPileZ = HARBOR_BACK_Z - 4; // through the back beam, mostly behind it
  for (const x of [-730, -545, -175, 10, 195, 565, 750]) pile(x, backPileZ, 4, HARBOR_WATER_Y - 20, 10);
  for (const x of [-360, 380]) {
    pile(x, backPileZ, 30, HARBOR_WATER_Y - 20, 11);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 6, 10), lambert(col(0.46, 0.02, 60), false));
    cap.position.set(x, 32, backPileZ);
    add(cap);
  }
  // Foreground: fender piles against the quay face, down to the bottom, tops
  // just proud of the deck. Kept outside the words (x −173…168; the p's tail
  // hangs at 103…168) and inside the frame (±272 at the pier front).
  const frontPileR = 8;
  for (const x of [-230, 230, -450, 450, -670, 670]) {
    pile(x, HARBOR_EDGE_Z + frontPileR, 4, wallBottom, frontPileR);
  }

  // The water itself: paper bands against the quay wall, paler at the top,
  // each deeper band with a scissor-cut top. What the fish swim in front of
  // (cutaway) and what shows through the see-through shallows (both).
  // Without them the fish sat on the tan wall behind a blue film and all but
  // vanished (ΔE-ok ≈ 0.05 → ≈ 0.18 with the bands and the thinner cut).
  // The first band is flat-topped: it meets the surface.
  for (const [top, l, c, h, i] of [
    [HARBOR_WATER_Y, 0.8, 0.06, 220, 0],
    [-58, 0.74, 0.07, 224, 1],
    [-92, 0.68, 0.08, 228, 2],
    [-122, 0.63, 0.085, 232, 3],
  ]) {
    const band = new THREE.Mesh(
      new THREE.ShapeGeometry(
        waveShape(-HARBOR_HALF_WIDTH, HARBOR_HALF_WIDTH, top, HARBOR_FLOOR_Y, i ? 5 : 0, 170 - i * 25, i * 2.1),
        1,
      ),
      lambert(col(l, c, h), false),
    );
    band.position.z = HARBOR_EDGE_Z + 0.5 + i * 0.3;
    add(band);
  }

  if (kind === "cutaway") {
    // Sea floor: sand, a few pebbles and weeds along the quay wall
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(HARBOR_HALF_WIDTH * 2, HARBOR_CUT_Z - HARBOR_EDGE_Z + 20),
      lambert(col(0.82, 0.04, 80), false),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, HARBOR_FLOOR_Y, (HARBOR_CUT_Z + HARBOR_EDGE_Z) / 2);
    add(sand);
    for (let i = 0; i < 26; i++) {
      const x = (r() - 0.5) * 1600;
      if (r() < 0.55) {
        const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + r() * 8, 0), lambert(col(0.7, 0.02, 70 + r() * 40)));
        pebble.scale.y = 0.5;
        pebble.position.set(x, HARBOR_FLOOR_Y + 2, HARBOR_EDGE_Z + 20 + r() * (HARBOR_CUT_Z - HARBOR_EDGE_Z - 30));
        add(pebble);
      } else {
        // A frond: a tall thin leaf, cut from paper
        const h = 50 + r() * 60;
        const leaf = new THREE.Shape();
        leaf.moveTo(-5, 0);
        leaf.quadraticCurveTo(-12, h * 0.5, 2 * (r() - 0.5) * 10, h);
        leaf.quadraticCurveTo(10, h * 0.5, 5, 0);
        leaf.closePath();
        const weed = paperCutout(leaf, col(0.6, 0.09, 150), 3, false);
        weed.position.set(x, HARBOR_FLOOR_Y, HARBOR_EDGE_Z + 8 + r() * 10);
        add(weed);
      }
    }
    // The cut: a faint see-through slice of water, lighter at the top, with a
    // scissor-cut waterline. Transparent, so it stays out of the bake.
    const W = HARBOR_HALF_WIDTH * 2;
    const H = HARBOR_WATER_Y - HARBOR_FLOOR_Y + 40;
    const cut = new THREE.PlaneGeometry(W, H, 240, 4);
    const pos = cut.getAttribute("position");
    const colors = new Float32Array(pos.count * 3);
    const top = col(0.83, 0.06, 215);
    const deep = col(0.6, 0.08, 230);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const v = (pos.getY(i) + H / 2) / H; // 0 bottom … 1 top
      const y = HARBOR_FLOOR_Y - 40 + v * H;
      pos.setY(i, v === 1 ? HARBOR_WATER_Y + 3 * Math.sin((x / 90) * Math.PI * 2) : y);
      c.copy(deep).lerp(top, v ** 1.5).toArray(colors, i * 3);
    }
    cut.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const slice = new THREE.Mesh(
      cut,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    slice.position.z = HARBOR_CUT_Z;
    slice.userData.noBake = true;
    add(slice);
  } else {
    // Wave flats, back (paler) to front (deeper), crests around the waterline
    HARBOR_WAVE_Z.forEach((z, i) => {
      const shape = waveShape(-HARBOR_HALF_WIDTH, HARBOR_HALF_WIDTH, HARBOR_WATER_Y + 2 - i * 4, -900, 7, 150 - i * 20, i * 1.7);
      const flat = paperCutout(shape, col(0.8 - i * 0.04, 0.05 + i * 0.01, 215 - i * 3), 5, false);
      flat.position.z = z;
      add(flat);
    });
  }
  return env;
}

// ---------------------------------------------------------------------------
// Playground (the sight-words lesson: letters play on a slide in a sandbox)
//
// The stage floor is the sandbox's sand. A timber edge runs across behind the
// slide, with grass beyond it. The slide (slideProp.ts) stands upstage,
// centred, at PLAYGROUND_SLIDE_*; staging uses its metrics from there. The
// backdrop (picket fence, trees, a row of houses) is a placeholder: suburb,
// city block or other options to come.
// ---------------------------------------------------------------------------

/** Where the slide's local origin stands, world units (its footprint is centred on x). */
export const PLAYGROUND_SLIDE_X = 0;
export const PLAYGROUND_SLIDE_Z = -250;
/** The sandbox's timber back edge, behind the slide. */
const PLAYGROUND_EDGE_Z = -420;

/** Sand: a flat tone with lighter and darker grains. */
function sandTexture(anisotropy: number): THREE.Texture {
  const r = rng(31);
  const tex = canvasTexture(256, 256, (g) => {
    g.fillStyle = `#${col(0.9, 0.04, 82).getHexString()}`;
    g.fillRect(0, 0, 256, 256);
    const light = `#${col(0.94, 0.03, 88).getHexString()}`;
    const dark = `#${col(0.83, 0.05, 74).getHexString()}`;
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? light : dark;
      const s = 2 + r() * 3;
      g.fillRect(r() * 256, r() * 256, s, s);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  // One texture = 120 units square (a grain ≈ 1–2 units)
  tex.repeat.set(20000 / 120, 20000 / 120);
  return tex;
}

function playground(anisotropy: number): Environment {
  const r = rng(29);
  const skyTop = col(0.9, 0.04, 230);
  const skyLow = col(0.965, 0.02, 205);
  const env = base(
    gradient(skyTop, skyLow),
    new THREE.Color(0xffffff),
    new THREE.Fog(skyLow, 1400, 4400),
    sandTexture(anisotropy),
  );
  const add = (...o: THREE.Object3D[]) => env.group.add(...o);

  const slide = buildSlide();
  slide.position.set(PLAYGROUND_SLIDE_X, 0, PLAYGROUND_SLIDE_Z);
  add(slide);

  // Sandbox edge: timber boards end to end, slightly varied
  const edgeDepth = 20;
  for (let x = -3000; x < 3000; x += 190) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(186, 16, edgeDepth),
      lambert(col(0.68 + (r() - 0.5) * 0.05, 0.05, 60 + (r() - 0.5) * 8)),
    );
    board.position.set(x + 95, 8, PLAYGROUND_EDGE_Z);
    add(board);
  }
  // Grass beyond it
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(9000, 4000), lambert(col(0.86, 0.05, 135), false));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0.2, PLAYGROUND_EDGE_Z - edgeDepth / 2 - 2000);
  add(grass);

  // --- Placeholder backdrop ---
  // Picket fence
  const fenceZ = -800;
  const fence = col(0.95, 0.012, 90);
  for (let x = -2400; x < 2400; x += 34) {
    const picket = new THREE.Shape([
      new THREE.Vector2(-9, 0),
      new THREE.Vector2(9, 0),
      new THREE.Vector2(9, 50),
      new THREE.Vector2(0, 62),
      new THREE.Vector2(-9, 50),
    ]);
    const p = paperCutout(picket, fence, 3, false);
    p.position.set(x, 0, fenceZ);
    add(p);
  }
  for (const y of [14, 38]) {
    const rail = paperCutout(rectShape(-2420, y, 2420, y + 8), fence, 3, false);
    rail.position.z = fenceZ - 4; // behind the pickets
    add(rail);
  }
  // Trees between the fence and the houses
  for (let i = 0; i < 7; i++) {
    const x = -1500 + i * 500 + (r() - 0.5) * 200;
    const s = 0.8 + r() * 0.5;
    const tree = new THREE.Group();
    tree.add(paperCutout(rectShape(-9, 0, 9, 120), col(0.6, 0.04, 60), 4, false));
    const crown = paperCutout(new THREE.Shape().absarc(0, 0, 80, 0, Math.PI * 2, false), col(0.78, 0.07, 140), 5);
    crown.position.set(0, 170, 1);
    tree.add(crown);
    tree.scale.setScalar(s);
    tree.position.set(x, 0, -1100 - r() * 100);
    add(tree);
  }
  // A row of houses
  const hues = [30, 85, 200, 250, 140, 60, 20, 220, 110];
  for (let i = 0; i < 9; i++) {
    const w = 200 + r() * 90;
    const h = 120 + r() * 60;
    const house = new THREE.Group();
    house.add(paperCutout(rectShape(-w / 2, 0, w / 2, h), col(0.9, 0.035, hues[i]), 6, false));
    const roofPeak = h + 80 + r() * 40;
    const roof = paperCutout(
      new THREE.Shape([
        new THREE.Vector2(-w / 2 - 18, h),
        new THREE.Vector2(w / 2 + 18, h),
        new THREE.Vector2(0, roofPeak),
      ]),
      col(0.7, 0.06, i % 2 ? 30 : 250),
      6,
    );
    roof.position.z = 0.5;
    house.add(roof);
    const door = paperCutout(rectShape(-18, 0, 18, 64), col(0.7, 0.05, 50), 3, false);
    door.position.set((r() - 0.5) * (w - 90), 0, 1);
    house.add(door);
    for (const side of [-1, 1]) {
      const pane = paperCutout(rectShape(-18, -18, 18, 18), col(0.93, 0.03, 220), 3);
      pane.position.set(side * w * 0.28, h * 0.62, 1);
      house.add(pane);
    }
    house.position.set(-2200 + i * 540 + (r() - 0.5) * 120, 0, -1500 - r() * 150);
    add(house);
  }
  // Clouds
  for (const [x, y, z, s] of [
    [-700, 420, -2400, 1.1],
    [300, 500, -2800, 0.9],
    [1100, 400, -2200, 1],
  ]) {
    const cloud = paperCloud();
    cloud.scale.setScalar(s);
    cloud.position.set(x, y, z);
    add(cloud);
  }
  return env;
}

export function buildEnvironment(name: EnvironmentName, anisotropy = 1): Environment {
  const env = (() => {
    switch (name) {
      case "playground":
        return playground(anisotropy);
      case "bedroom":
        return bedroom(anisotropy);
      case "horizon":
        return horizon();
      case "ruled-paper":
        return ruledPaper(anisotropy);
      case "cut-paper":
        return cutPaper();
      case "meadow":
        return meadow();
      case "bookshelf":
        return bookshelf(anisotropy);
      case "harbor-cutaway":
        return harbor("cutaway");
      case "harbor-waves":
        return harbor("waves");
      default:
        return plain();
    }
  })();
  bake(env.group);
  return env;
}
