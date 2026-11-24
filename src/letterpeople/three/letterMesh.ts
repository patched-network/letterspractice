// letterpeople/src/three/letterMesh.ts
//
// SPIKE: LetterPeople bodies as three.js meshes, built from the same
// renderer-independent geometry the SVG path uses (getLetterGeometry).
//
// Coordinate handling: each letter has an inner `svgSpace` group with
// scale.y = -1, so body geometry and attachment anchors are used verbatim in
// letter-local SVG units (y-down, 100 = cap height). three.js flips face
// culling for negative-determinant transforms, so lighting/culling stay right.
//
// The outer `root` group has its origin at the letter's baseline, horizontally
// centred, centred in depth. Position/rotate `root`; never touch `svgSpace`.
// Between them sit two pose groups driven by `pose()` (celebration body
// motion), so pose and whatever the host does to `root` compose.

import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { animate, type AnimationParams, type JSAnimation } from "animejs";

import type { LetterGeometry, LetterPart } from "../types";
import {
  getLetterGeometry,
  DESCENDER_LETTERS,
  DESCENDER_DEPTH,
} from "../letters/registry";
import { VIEWBOX_HEIGHT } from "../letters/CONSTS";
import {
  computeMouthCurve,
  DEFAULT_MOUTH_PARAMS,
  type MouthAppearanceOptions,
  type MouthParameters,
} from "../attachments/mouth";
import { createArm3D, createArms3D, type Arms3D } from "./arms";
import { createBrow3D, createBrows3D, type Brows3D } from "./brows";
import { calculateEyebrowPosition } from "../attachments/eyebrow";
import { blendColors } from "../util/color";

/**
 * How the black outline of the 2D letters is carried into 3D.
 * - none:   no outline; lighting alone separates the shape
 * - cookie: black side walls + the SVG stroke laid on front/back faces
 *           (face-on it matches the SVG exactly; reads like a cookie/tile)
 * - hull:   inverted-hull silhouette (back-faces pushed out along normals);
 *           tracks the silhouette at every angle, classic toon look
 * - edges:  screen-space fat lines on crease edges (EdgesGeometry)
 */
export type OutlineStyle = "none" | "cookie" | "hull" | "edges";
/** Attachments that can be shown / hidden (eyes include their brows). */
/** "arms" means both; either arm can also pop on its own (e.g. a one-handed wave). */
export type FacePart = "eyes" | "mouth" | "arms" | "armLeft" | "armRight";
type PartSlot = "eyes" | "mouth" | "armLeft" | "armRight";
const slotsOf = (part: FacePart): PartSlot[] =>
  part === "arms" ? ["armLeft", "armRight"] : [part];
export type Shading = "standard" | "toon";

export interface Letter3DOptions {
  color: THREE.ColorRepresentation;
  outlineColor?: THREE.ColorRepresentation;
  /** Extrusion depth in letter units (cap height = 100). */
  depth: number;
  /** Bevel size in letter units; 0 disables bevel. */
  bevel: number;
  outline: OutlineStyle;
  shading: Shading;
  /** Outline width in letter units (SVG default borderWidth is 4). */
  outlineWidth: number;
  /** Screen-space line width in px (edges style only). */
  edgePx?: number;
  /** Letter stroke thickness (LetterOptions.lineWidth). */
  lineWidth?: number;
  showEyes?: boolean;
  showMouth?: boolean;
  mouthParams?: Partial<MouthParameters>;
  mouthAppearance?: MouthAppearanceOptions;
  /** Defaults to showEyes. */
  showBrows?: boolean;
  /**
   * Parts built but starting hidden, to be popped in with `showPart` (the 3D
   * counterpart of the SVG attachments' show()/hide()).
   */
  hiddenParts?: FacePart[];
  showArms?: boolean;
  /** 0 = shoulders at back face, 1 = front face (default). */
  shoulderDepth?: number;
  /**
   * Called after every visual change: pose, face, attachments, and anything
   * external (walkers, effects) reports via `invalidate()`. A host that
   * renders on demand redraws when this fires; nothing else needs to know.
   */
  onChange?: () => void;
}

export interface Eye3D {
  group: THREE.Group;
  pupil: THREE.Mesh;
  radius: number;
}

/**
 * Same animation surface as the SVG MouthAttachment (minus show/hide), so
 * sequences written against `letter.mouth` can drive either renderer.
 */
export interface Mouth3D {
  readonly mesh: THREE.Mesh;
  updateShape(params: Partial<MouthParameters>, options?: AnimationParams): Promise<void>;
  getCurrentShapeParams(): MouthParameters;
  animateSpeak(options?: AnimationParams): Promise<void>;
  stopAnimations(): void;
}

export interface Letter3D {
  readonly character: string;
  readonly geometry: LetterGeometry;
  /** Position / rotate this. Origin: baseline, horizontal centre, mid-depth. */
  readonly root: THREE.Group;
  /** Advance width in letter units. */
  readonly width: number;
  readonly eyes: { left: Eye3D; right: Eye3D } | null;
  readonly mouth: Mouth3D | null;
  readonly arms: Arms3D | null;
  readonly brows: Brows3D | null;
  /** Point pupils toward a world-space target. */
  lookAt(target: THREE.Vector3): void;
  /**
   * Tween pupils to a direction, as the SVG `eyes.lookAt`: {x, y} in SVG
   * units (y-down), clamped to the pupil's reach; a number is an angle in
   * degrees.
   */
  lookDirection(
    direction: { x: number; y: number } | number,
    options?: AnimationParams,
  ): Promise<void>;
  /** Animated blink (shut and open over `duration`). */
  blink(options?: AnimationParams): Promise<void>;
  /** Hold the eyes shut (1), open (0) or between (asleep, drowsy); tweened if `duration` is given. */
  setEyesShut(amount: number, options?: AnimationParams): Promise<void>;
  /**
   * Whole-body tween. `props` are anime.js props over translateY / scale /
   * scaleX / scaleY / rotate / rotateY in CSS terms (y-down, clockwise degrees;
   * 1px = 1 letter unit). `origin`: pivot at the baseline or body centre.
   */
  pose(props: Record<string, any>, origin: "bottom" | "center"): Promise<void>;
  resetPose(): void;
  /** Body colour as a CSS string. */
  readonly fillColor: string;
  /** Tween the body colour (the 3D counterpart of updateAppearance({color})). */
  setColor(color: THREE.ColorRepresentation, options?: AnimationParams): Promise<void>;
  /** 0–1 glow on the body, in `color` (default a soft blue). */
  setHighlight(amount: number, color?: THREE.ColorRepresentation): void;
  /** Pop a part in (scale up) / out (scale down). */
  showPart(part: FacePart, options?: AnimationParams): Promise<void>;
  hidePart(part: FacePart, options?: AnimationParams): Promise<void>;
  isPartVisible(part: FacePart): boolean;
  /** Letter-local (SVG-unit) content group, for attaching effects. */
  readonly content: THREE.Group;
  /** z of the front face within `content`. */
  readonly frontZ: number;
  /** 0 = open, 1 = shut. */
  setBlink(amount: number): void;
  /** Report a visual change made from outside (walker, effects). */
  invalidate(): void;
  /** Keep screen-space line materials correct after canvas resize. */
  setResolution(width: number, height: number): void;
  dispose(): void;
}

const CURVE_SEGMENTS = 24;
const DEG = Math.PI / 180;

/** SVG path data → three Shapes (holes resolved via fill-rule / winding). */
function partToShapePaths(part: LetterPart) {
  const fillRule = part.fillRule ?? "nonzero";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${part.d}" fill-rule="${fillRule}"/></svg>`;
  return new SVGLoader().parse(svg).paths;
}

let toonGradient: THREE.DataTexture | null = null;
function getToonGradient(): THREE.DataTexture {
  if (!toonGradient) {
    // 3 bands: shadow / mid / lit
    const data = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
    toonGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    toonGradient.minFilter = THREE.NearestFilter;
    toonGradient.magFilter = THREE.NearestFilter;
    toonGradient.needsUpdate = true;
  }
  return toonGradient;
}

function bodyMaterial(color: THREE.ColorRepresentation, shading: Shading): THREE.Material {
  return shading === "toon"
    ? new THREE.MeshToonMaterial({ color, gradientMap: getToonGradient() })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 });
}

/** Inverted hull: back faces pushed out along smoothed normals. */
function makeHull(
  body: THREE.BufferGeometry,
  thickness: number,
  color: THREE.ColorRepresentation,
): THREE.Mesh {
  const g = body.clone();
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const smooth = mergeVertices(g, 1e-3);
  smooth.computeVertexNormals();
  g.dispose();

  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  // Push vertices out along the (object-space) normal attribute. MeshBasic
  // doesn't declare objectNormal, but the `normal` attribute is always there.
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.hullThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float hullThickness;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed += normalize(normal) * hullThickness;",
      );
  };
  return new THREE.Mesh(smooth, mat);
}

/** The SVG stroke, as flat ribbon geometry in the XY plane. */
function strokeGeometry(
  shapePaths: ReturnType<typeof partToShapePaths>,
  width: number,
): THREE.BufferGeometry | null {
  const style = SVGLoader.getStrokeStyle(width, "black", "round", "round", 4);
  const geoms: THREE.BufferGeometry[] = [];
  for (const sp of shapePaths) {
    for (const sub of sp.subPaths) {
      const g = SVGLoader.pointsToStroke(sub.getPoints(CURVE_SEGMENTS), style);
      if (g) geoms.push(g);
    }
  }
  if (!geoms.length) return null;
  const merged = mergeGeometries(geoms);
  geoms.forEach((g) => g.dispose());
  return merged;
}

function makeEye(radius: number, z: number): Eye3D {
  const group = new THREE.Group();
  group.position.z = z;

  const sclera = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  );
  sclera.scale.z = 0.55;
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(radius + 0.9, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  rim.scale.z = 0.45;
  rim.position.z = -0.4;

  const pupilR = radius * 0.4;
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(pupilR, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x111111 }),
  );
  pupil.scale.z = 0.5;
  // Rest on the eyeball's front surface (where look-at / gaze put it). At the
  // centre it's buried inside the sclera — invisible until something tracks.
  pupil.position.z = radius * 0.5;

  group.add(rim, sclera, pupil);
  return { group, pupil, radius };
}

/** Flat mouth decal geometry (letter-local SVG units, y-down). */
function mouthGeometry(
  at: { x: number; y: number },
  params: MouthParameters,
  appearance?: MouthAppearanceOptions,
): THREE.ShapeGeometry {
  const c = computeMouthCurve(at.x, at.y, params, appearance);
  const shape = new THREE.Shape();
  shape.moveTo(c.start.x, c.start.y);
  shape.quadraticCurveTo(c.bottomControl.x, c.bottomControl.y, c.end.x, c.end.y);
  shape.quadraticCurveTo(c.topControl.x, c.topControl.y, c.start.x, c.start.y);
  return new THREE.ShapeGeometry(shape, 12);
}

function makeMouth(
  at: { x: number; y: number },
  z: number,
  initial: MouthParameters,
  appearance: MouthAppearanceOptions | undefined,
  onChange: () => void,
): Mouth3D {
  const mat = new THREE.MeshBasicMaterial({
    color: appearance?.fillColor ?? 0x000000,
    // svgSpace has a negative determinant; don't care which way the decal winds
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(mouthGeometry(at, initial, appearance), mat);
  mesh.position.z = z;

  // `target` is where the mouth is headed; `shown` is what's on screen. Tweens
  // start from `shown`, so interrupting one mid-flight doesn't snap. `rest` is
  // the expression a speak pulse returns to; it's held while a pulse is in
  // flight so overlapping speaks don't ratchet the mouth open.
  let target: MouthParameters = { ...initial };
  const shown: MouthParameters = { ...initial };
  let rest: MouthParameters | null = null;
  let anim: JSAnimation | null = null;

  const redraw = () => {
    mesh.geometry.dispose();
    mesh.geometry = mouthGeometry(at, shown, appearance);
    onChange();
  };

  const stopAnimations = () => {
    anim?.pause();
    anim = null;
  };

  const tweenTo = (params: Partial<MouthParameters>, options?: AnimationParams) => {
    stopAnimations();
    target = { ...target, ...params };
    if (!options?.duration) {
      Object.assign(shown, target);
      redraw();
      return Promise.resolve();
    }
    anim = animate(shown, {
      openness: target.openness,
      mood: target.mood,
      duration: options.duration,
      ease: options.ease ?? "inOutQuad",
      delay: options.delay ?? 0,
      onUpdate: redraw,
    });
    return anim.then(() => undefined);
  };

  const updateShape = (params: Partial<MouthParameters>, options?: AnimationParams) => {
    if (rest) rest = { ...rest, ...params };
    return tweenTo(params, options);
  };

  // Mirrors MouthControllerImpl.animateSpeak
  const animateSpeak = async (options?: AnimationParams) => {
    const base = rest ?? { ...target };
    rest = base;
    const duration = options?.duration ?? 200;
    await tweenTo(
      { openness: Math.min(1, base.openness + 0.4) },
      { ...options, duration, ease: options?.ease ?? "outQuad" },
    );
    await tweenTo(rest, { ...options, duration, ease: options?.ease ?? "inQuad", delay: 0 });
    rest = null;
  };

  return {
    mesh,
    updateShape,
    getCurrentShapeParams: () => ({ ...(rest ?? target) }),
    animateSpeak,
    stopAnimations,
  };
}

export function createLetter3D(char: string, opts: Letter3DOptions): Letter3D | null {
  const geometry = getLetterGeometry(char, {
    lineWidth: opts.lineWidth,
    borderWidth: opts.outlineWidth,
  });
  if (!geometry) return null;

  const outlineColor = opts.outlineColor ?? 0x000000;
  const [vbX, , vbW] = geometry.viewBox;
  const yOff = DESCENDER_LETTERS.has(char) ? DESCENDER_DEPTH : 0;

  const root = new THREE.Group();
  root.name = `letter3d-${char}`;
  const svgSpace = new THREE.Group();
  svgSpace.scale.y = -1;
  svgSpace.position.set(-vbX - vbW / 2, VIEWBOX_HEIGHT - yOff, -opts.depth / 2);
  // root → poseOuter (at pivot: translate, rotate, scale) → poseInner (back
  // off the pivot) → svgSpace
  const poseOuter = new THREE.Group();
  const poseInner = new THREE.Group();
  root.add(poseOuter);
  poseOuter.add(poseInner);
  poseInner.add(svgSpace);

  const bevelOn = opts.bevel > 0;
  const bevelT = bevelOn ? opts.bevel : 0;
  const extrude: THREE.ExtrudeGeometryOptions = {
    depth: opts.depth,
    curveSegments: CURVE_SEGMENTS,
    bevelEnabled: bevelOn,
    bevelThickness: bevelT,
    bevelSize: bevelOn ? opts.bevel * 0.8 : 0,
    bevelOffset: bevelOn ? -opts.bevel * 0.8 : 0, // keep the silhouette = SVG path
    bevelSegments: 4,
  };
  const frontZ = opts.depth + bevelT;
  const backZ = -bevelT;

  const body = bodyMaterial(opts.color, opts.shading);
  const sideMat =
    opts.outline === "cookie"
      ? new THREE.MeshStandardMaterial({ color: outlineColor, roughness: 0.8 })
      : body;
  const outlineMat = new THREE.MeshBasicMaterial({
    color: outlineColor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const lineMats: LineMaterial[] = [];

  for (const part of geometry.parts) {
    const shapePaths = partToShapePaths(part);
    const shapes = shapePaths.flatMap((sp) => sp.toShapes());
    const bodyGeom = new THREE.ExtrudeGeometry(shapes, extrude);
    // ExtrudeGeometry groups: 0 = caps, 1 = side walls
    svgSpace.add(new THREE.Mesh(bodyGeom, [body, sideMat]));

    if (opts.outline === "cookie") {
      const sg = strokeGeometry(shapePaths, opts.outlineWidth);
      if (sg) {
        const front = new THREE.Mesh(sg, outlineMat);
        front.position.z = frontZ + 0.05;
        const back = new THREE.Mesh(sg, outlineMat);
        back.position.z = backZ - 0.05;
        svgSpace.add(front, back);
      }
    } else if (opts.outline === "hull") {
      svgSpace.add(makeHull(bodyGeom, opts.outlineWidth * 0.6, outlineColor));
    } else if (opts.outline === "edges") {
      // Creases of the unbevelled form. The bevel rounds every crease in
      // 90° / bevelSegments steps (22.5°), all under the 35° threshold, so
      // the bevelled body has next to none (round letters: none at all).
      // The body's side walls are the SVG path (bevelOffset cancels
      // bevelSize); the plain extrusion runs cap to cap, so its rims sit at
      // the path's edge level with the caps, just clear of the rounding.
      let creaseGeom = bodyGeom;
      if (bevelOn) {
        creaseGeom = new THREE.ExtrudeGeometry(shapes, {
          depth: opts.depth + 2 * bevelT,
          curveSegments: CURVE_SEGMENTS,
          bevelEnabled: false,
        });
        creaseGeom.translate(0, 0, -bevelT);
      }
      const edges = new THREE.EdgesGeometry(creaseGeom, 35);
      if (creaseGeom !== bodyGeom) creaseGeom.dispose();
      const lg = new LineSegmentsGeometry().fromEdgesGeometry(edges);
      edges.dispose();
      const lm = new LineMaterial({
        color: new THREE.Color(outlineColor).getHex(),
        linewidth: opts.edgePx ?? 3,
        // svgSpace's negative determinant flips the quads' winding (as the decals')
        side: THREE.DoubleSide,
      });
      lineMats.push(lm);
      svgSpace.add(new LineSegments2(lg, lm));
    }
  }

  // Body-only bounds (before attachments), in root space
  const bodyCenterY = new THREE.Box3().setFromObject(poseOuter).getCenter(new THREE.Vector3()).y;

  let eyes: Letter3D["eyes"] = null;
  if (opts.showEyes ?? true) {
    const r = 5; // SVG default eyeSize 10 → radius 5
    const left = makeEye(r, frontZ);
    const right = makeEye(r, frontZ);
    const a = geometry.attachments;
    left.group.position.x = a.leftEye.x;
    left.group.position.y = a.leftEye.y;
    right.group.position.x = a.rightEye.x;
    right.group.position.y = a.rightEye.y;
    svgSpace.add(left.group, right.group);
    eyes = { left, right };
  }

  const fillColor = `#${new THREE.Color(opts.color).getHexString()}`;
  const invalidate = () => opts.onChange?.();

  let brows: Brows3D | null = null;
  if (eyes && (opts.showBrows ?? true)) {
    // Same colour rule as the SVG brows: 60% fill + 40% border
    const color = blendColors(fillColor, `#${new THREE.Color(outlineColor).getHexString()}`, 0.4);
    const brow = (eye: Eye3D) =>
      createBrow3D({
        center: calculateEyebrowPosition(
          { x: eye.group.position.x, y: eye.group.position.y },
          eye.radius * 2,
        ),
        // Centred on the eye's front surface: floats just proud of the face
        z: frontZ + eye.radius * 0.5,
        color,
        onChange: invalidate,
      });
    brows = createBrows3D(brow(eyes.left), brow(eyes.right));
    svgSpace.add(brows.left.group, brows.right.group);
  }

  let mouth: Mouth3D | null = null;
  if (opts.showMouth) {
    mouth = makeMouth(
      geometry.attachments.mouth,
      frontZ + 0.1,
      { ...DEFAULT_MOUTH_PARAMS, ...opts.mouthParams },
      opts.mouthAppearance,
      invalidate,
    );
    svgSpace.add(mouth.mesh);
  }

  let arms: Arms3D | null = null;
  if (opts.showArms) {
    // Same defaults createLetter() gives the SVG arms
    const arm = (shoulder: { x: number; y: number }, restAngle: number, side: "left" | "right") =>
      createArm3D({
        shoulder,
        restAngle,
        side,
        length: 15,
        thickness: 3,
        backZ,
        frontZ,
        shoulderDepth: opts.shoulderDepth,
        onChange: invalidate,
      });
    arms = createArms3D(
      arm(geometry.attachments.leftArm, 150, "left"),
      arm(geometry.attachments.rightArm, 30, "right"),
    );
    svgSpace.add(arms.left.group, arms.right.group);
  }

  // --- show / hide: each part pops (scales) about its own anchor ---
  // Eyes, arms and the mouth get a wrapper group at their anchor (their own
  // transforms are in use: blink scales eye groups, arms rotate, the mouth's
  // geometry is drawn in place); brows scale their own group directly.
  const popWrap = (obj: THREE.Object3D, pivot: { x: number; y: number }) => {
    const wrapper = new THREE.Group();
    wrapper.position.set(pivot.x, pivot.y, 0);
    obj.parent?.remove(obj);
    obj.position.x -= pivot.x;
    obj.position.y -= pivot.y;
    wrapper.add(obj);
    svgSpace.add(wrapper);
    return wrapper;
  };
  const partObjects: Record<PartSlot, THREE.Object3D[]> = {
    eyes: [],
    mouth: [],
    armLeft: [],
    armRight: [],
  };
  if (eyes) {
    for (const eye of [eyes.left, eyes.right]) {
      const at = { x: eye.group.position.x, y: eye.group.position.y };
      partObjects.eyes.push(popWrap(eye.group, at));
    }
    if (brows) partObjects.eyes.push(brows.left.group, brows.right.group);
  }
  if (mouth) partObjects.mouth.push(popWrap(mouth.mesh, geometry.attachments.mouth));
  if (arms) {
    partObjects.armLeft.push(popWrap(arms.left.group, geometry.attachments.leftArm));
    partObjects.armRight.push(popWrap(arms.right.group, geometry.attachments.rightArm));
  }
  const partScale: Record<PartSlot, { s: number }> = {
    eyes: { s: 1 },
    mouth: { s: 1 },
    armLeft: { s: 1 },
    armRight: { s: 1 },
  };
  const partVisible: Record<PartSlot, boolean> = {
    eyes: true,
    mouth: true,
    armLeft: true,
    armRight: true,
  };
  const partAnim: Partial<Record<PartSlot, JSAnimation>> = {};
  const applyPart = (part: PartSlot) => {
    const s = Math.max(0.0001, partScale[part].s);
    for (const o of partObjects[part]) {
      o.scale.setScalar(s);
      o.visible = partScale[part].s > 0.001;
    }
    invalidate();
  };
  for (const part of (opts.hiddenParts ?? []).flatMap(slotsOf)) {
    partScale[part].s = 0;
    partVisible[part] = false;
    applyPart(part);
  }
  const tweenSlot = (part: PartSlot, to: number, options?: AnimationParams) => {
    partAnim[part]?.pause();
    partVisible[part] = to > 0;
    const duration = typeof options?.duration === "number" ? options.duration : 250;
    if (duration <= 0) {
      partScale[part].s = to;
      applyPart(part);
      return Promise.resolve();
    }
    const anim = animate(partScale[part], {
      s: to,
      duration,
      ease: options?.ease ?? (to > 0 ? "outBack(1.8)" : "inQuad"),
      delay: options?.delay ?? 0,
      onUpdate: () => applyPart(part),
    });
    partAnim[part] = anim;
    return anim.then(() => undefined);
  };
  const tweenPart = async (part: FacePart, to: number, options?: AnimationParams) => {
    await Promise.all(slotsOf(part).map((slot) => tweenSlot(slot, to, options)));
  };

  // --- body colour + highlight ---
  const bodyMat = body as THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
  let currentFill = fillColor;
  let colorAnim: JSAnimation | null = null;
  const setColor: Letter3D["setColor"] = (color, options) => {
    colorAnim?.pause();
    const from = bodyMat.color.clone();
    const to = new THREE.Color(color);
    currentFill = `#${to.getHexString()}`;
    const duration = typeof options?.duration === "number" ? options.duration : 0;
    if (duration <= 0) {
      bodyMat.color.copy(to);
      invalidate();
      return Promise.resolve();
    }
    const mix = { t: 0 };
    colorAnim = animate(mix, {
      t: 1,
      duration,
      ease: options?.ease ?? "inOutQuad",
      delay: options?.delay ?? 0,
      onUpdate: () => {
        bodyMat.color.lerpColors(from, to, mix.t);
        invalidate();
      },
    });
    return colorAnim.then(() => undefined);
  };
  const HIGHLIGHT = new THREE.Color(0x2196f3);
  const setHighlight = (amount: number, color?: THREE.ColorRepresentation) => {
    const c = color === undefined ? HIGHLIGHT : new THREE.Color(color);
    bodyMat.emissive.copy(c).multiplyScalar(0.45 * Math.max(0, Math.min(1, amount)));
    invalidate();
  };

  const tmp = new THREE.Vector3();
  const lookAt = (target: THREE.Vector3) => {
    // Hidden eyes sit at ~zero scale; inverting that would be degenerate
    if (!eyes || partScale.eyes.s < 0.05) return;
    for (const eye of [eyes.left, eyes.right]) {
      // Direction to target in eye-local (SVG) space
      eye.group.worldToLocal(tmp.copy(target));
      tmp.normalize();
      const reach = eye.radius * 0.55;
      eye.pupil.position.set(tmp.x * reach, tmp.y * reach, eye.radius * 0.5);
    }
    invalidate();
  };

  const setBlink = (amount: number) => {
    if (!eyes) return;
    const s = Math.max(0.08, 1 - amount);
    eyes.left.group.scale.y = s;
    eyes.right.group.scale.y = s;
    invalidate();
  };

  // --- gaze / blink tweens (SVG-style eye API) ---
  const gaze = { x: 0, y: 0 };
  let gazeAnim: JSAnimation | null = null;
  const applyGaze = () => {
    if (!eyes) return;
    for (const eye of [eyes.left, eyes.right]) {
      eye.pupil.position.set(gaze.x, gaze.y, eye.radius * 0.5);
    }
    invalidate();
  };
  const lookDirection: Letter3D["lookDirection"] = (direction, options) => {
    if (!eyes) return Promise.resolve();
    const reach = eyes.left.radius * 0.55;
    let x: number;
    let y: number;
    if (typeof direction === "number") {
      x = Math.cos(direction * DEG) * reach;
      y = Math.sin(direction * DEG) * reach;
    } else {
      const m = Math.hypot(direction.x, direction.y);
      const k = m > 0 ? Math.min(m, reach) / m : 0;
      x = direction.x * k;
      y = direction.y * k;
    }
    gazeAnim?.pause();
    const duration = typeof options?.duration === "number" ? options.duration : 150;
    gazeAnim = animate(gaze, {
      x,
      y,
      duration,
      ease: options?.ease ?? "outQuad",
      delay: options?.delay ?? 0,
      onUpdate: applyGaze,
    });
    return gazeAnim.then(() => undefined);
  };

  const blinkState = { amount: 0 };
  const blink: Letter3D["blink"] = async (options) => {
    if (!eyes) return;
    const half = (typeof options?.duration === "number" ? options.duration : 150) / 2;
    const step = (amount: number, ease: string) =>
      animate(blinkState, {
        amount,
        duration: half,
        ease,
        onUpdate: () => setBlink(blinkState.amount),
      }).then(() => undefined);
    await step(1, "inQuad");
    await step(0, "outQuad");
  };
  const setEyesShut: Letter3D["setEyesShut"] = (amount, options) => {
    if (!eyes) return Promise.resolve();
    if (!options?.duration) {
      blinkState.amount = amount;
      setBlink(amount);
      return Promise.resolve();
    }
    return animate(blinkState, {
      amount,
      duration: options.duration,
      ease: options.ease ?? "inOutQuad",
      delay: options.delay ?? 0,
      onUpdate: () => setBlink(blinkState.amount),
    }).then(() => undefined);
  };

  // --- whole-body pose ---
  const poseState = { translateY: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, rotateY: 0 };
  let poseOrigin: "bottom" | "center" = "bottom";
  const applyPose = () => {
    const py = poseOrigin === "bottom" ? 0 : bodyCenterY;
    const u = poseState.scale;
    poseOuter.position.set(0, py - poseState.translateY, 0);
    poseOuter.rotation.set(0, poseState.rotateY * DEG, -poseState.rotate * DEG); // CSS rotate is clockwise
    poseOuter.scale.set(u * poseState.scaleX, u * poseState.scaleY, u);
    poseInner.position.y = -py;
    invalidate();
  };
  const pose: Letter3D["pose"] = (props, origin) => {
    poseOrigin = origin;
    return new Promise((resolve) => {
      animate(poseState, {
        ...props,
        onUpdate: applyPose,
        onComplete: () => {
          applyPose();
          resolve();
        },
      });
    });
  };
  const resetPose = () => {
    Object.assign(poseState, { translateY: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, rotateY: 0 });
    applyPose();
  };

  const setResolution = (w: number, h: number) => {
    for (const m of lineMats) m.resolution.set(w, h);
  };

  const dispose = () => {
    mouth?.stopAnimations();
    arms?.stopAnimations();
    brows?.stopAnimations();
    gazeAnim?.pause();
    colorAnim?.pause();
    Object.values(partAnim).forEach((a) => a?.pause());
    const mats = new Set<THREE.Material>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
      }
    });
    mats.forEach((m) => m.dispose());
  };

  return {
    character: char,
    geometry,
    root,
    width: vbW,
    eyes,
    mouth,
    arms,
    brows,
    lookAt,
    lookDirection,
    blink,
    setEyesShut,
    pose,
    resetPose,
    get fillColor() {
      return currentFill;
    },
    setColor,
    setHighlight,
    showPart: (part, options) => tweenPart(part, 1, options),
    hidePart: (part, options) => tweenPart(part, 0, options),
    isPartVisible: (part) => slotsOf(part).every((slot) => partVisible[slot]),
    content: svgSpace,
    frontZ,
    setBlink,
    invalidate,
    setResolution,
    dispose,
  };
}
