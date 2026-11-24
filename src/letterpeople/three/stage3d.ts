// letterpeople/src/three/stage3d.ts
//
// SPIKE: a three.js stage for lesson scenes — the 3D counterpart of
// scene/Stage.ts. One canvas per stage, filling its container; DOM speech
// balloons (the same SpeechBalloon as the SVG stage) float in a layer above
// it, positioned by projecting each actor to screen space.
//
// World units: letter cap height = 100; floor at y = 0; +z toward camera.
// Rendering is on demand: letters, walkers and effects invalidate; the loop
// only runs while something moves.
//
// Actor3D structurally implements the lesson runner's LessonActor
// (src/lessons/lessonActor.ts), so useLessonRunner drives it unchanged.

import * as THREE from "three";
import { createTimer, type AnimationParams } from "animejs";
import type { LetterEffect } from "../../composables/useTimedWordPlayback";
import { SpeechBalloon } from "../scene/SpeechBalloon";
import { balloonColorsForLetter } from "../scene/Stage";
import { createLetter3D, type FacePart, type Letter3D, type Letter3DOptions } from "./letterMesh";
import { createWalker, type Gait, type Walker } from "./locomotion";
import { performer3D } from "./performer";
import { buildEnvironment, type Environment, type EnvironmentName } from "./environments";
import type { Performer } from "../animations/performer";

export interface Stage3DOptions {
  background?: THREE.ColorRepresentation;
  floorColor?: THREE.ColorRepresentation;
  /** Eyes follow the pointer while it's over the stage. */
  trackPointer?: boolean;
  /** Set dressing (overrides background / floorColor). */
  environment?: EnvironmentName;
  /**
   * No background, set or floor: the page shows through and actors float on
   * it (contact shadows still ground them). Environments are ignored.
   */
  transparent?: boolean;
  /** DBG: drag to orbit, right-drag to pan, wheel to zoom (setFreeCamera). */
  freeCamera?: boolean;
}

/** Pointer look-target plane: this far in front of the stage's z = 0. */
const LOOK_PLANE_Z = 160;
/**
 * The audience: a point out front on the stage's centre line. Actors rest
 * turned toward it ("cheating out" — slightly inward from wherever they
 * stand), and without a pointer their eyes hold contact with the camera.
 * Fixed rather than the camera's position so resting angles don't shift
 * when the stage re-frames on resize.
 */
const AUDIENCE_Z = 450;
/** Gaze smoothing time constant, seconds. */
const GAZE_TAU = 0.09;

export interface Actor3DOptions {
  x?: number;
  z?: number;
  /** Height of the surface the actor stands on (e.g. a riser). Default 0. */
  floorY?: number;
  /** Uniform size multiplier (1 = cap height 100). */
  scale?: number;
  color: string;
  /** Parts that start hidden (pop in later with actor.letter.showPart). */
  hiddenParts?: FacePart[];
  /** Overrides for the letter's look. */
  look?: Partial<Omit<Letter3DOptions, "color" | "onChange" | "hiddenParts">>;
}

/**
 * A close-up: the camera aims at `target` from in front and above, near
 * enough to fit `halfWidth` × `halfHeight` (world units) around it.
 */
export interface CameraShot {
  target: THREE.Vector3;
  halfWidth: number;
  halfHeight: number;
  /** How steeply it looks down: camera height over horizontal distance (the framing's is about 0.16). */
  elevation: number;
}

/** Where a camera (vertical fov, aspect) goes for `shot`, and the point it looks at. */
export function shotCamera(shot: CameraShot, fov: number, aspect: number) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const d = Math.max((shot.halfWidth * 1.12) / (tanV * aspect), (shot.halfHeight * 1.12) / tanV);
  const dir = new THREE.Vector3(0, shot.elevation, 1).normalize();
  return { position: shot.target.clone().addScaledVector(dir, d), look: shot.target.clone() };
}

const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

export interface ScreenBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const DEFAULT_LOOK: Omit<Letter3DOptions, "color"> = {
  depth: 14,
  bevel: 1.5,
  outline: "cookie",
  shading: "standard",
  outlineWidth: 1, // Colin, session 3: 3 → 2 → 1 (SVG borderWidth is 4); tune on /dbg/lesson/three
  lineWidth: 20,
  showEyes: true,
  showBrows: true,
  showMouth: true,
  showArms: true,
};

// Balloon placement, as in the SVG Stage
const BALLOON_GAP = 10;
const BALLOON_MARGIN = 8;
/**
 * A side balloon: its tail's length (SpeechBalloon.ARROW_SIZE); where the
 * tail points on a letter with no mouth (this far below its top); and how far
 * above the letter's top the bubble's top sits.
 */
const BALLOON_TAIL = 12;
const BALLOON_SIDE_DROP = 18;
const BALLOON_SIDE_RISE = 8;

export class Actor3D {
  readonly id: string;
  readonly letter: Letter3D;
  readonly walker: Walker;
  readonly balloon: SpeechBalloon;
  readonly performer: Performer;
  private readonly stage: Stage3D;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private _visible = true;
  private lookTarget: THREE.Vector3 | null = null;
  /** Size multiplier the actor was created with. */
  readonly scale: number;
  /**
   * Where this actor's speech balloon sits: above its head (the default) or
   * to its right, and the largest it may grow, px. The text grows to fill the
   * space it's given, so an uncapped balloon over a low, central speaker
   * takes most of the view.
   */
  balloonPlacement: { side: "above" | "right"; maxWidth?: number; maxHeight?: number } = { side: "above" };

  constructor(
    stage: Stage3D,
    id: string,
    letter: Letter3D,
    walker: Walker,
    color: string,
    scale = 1,
  ) {
    this.stage = stage;
    this.scale = scale;
    this.id = id;
    this.letter = letter;
    this.walker = walker;
    this.performer = performer3D(letter);
    this.balloon = new SpeechBalloon({ text: "...", maxWidth: 200, ...balloonColorsForLetter(color) });
  }

  // --- gaze ---

  /**
   * Look at a world point (another letter, a spot in the air) instead of
   * where everyone looks (the camera, or the pointer); null to rejoin them.
   * Called every frame, it steers the eyes (an eye roll).
   */
  lookAtPoint(target: THREE.Vector3 | null): void {
    this.lookTarget = target ? target.clone() : null;
    this.stage.invalidate();
  }

  /** Where this actor's eyes point this frame, given the stage's shared gaze. */
  gazeFor(shared: THREE.Vector3): THREE.Vector3 {
    return this.lookTarget ?? shared;
  }

  // --- movement ---

  get position() {
    return this.walker.getPosition();
  }
  /** Advance width on stage, world units. */
  get width() {
    return this.letter.width * this.scale;
  }
  get visible() {
    return this._visible;
  }
  /** Take the actor off stage entirely (the SVG lessons' display: none). */
  setVisible(visible: boolean) {
    this._visible = visible;
    this.walker.object.visible = visible;
    if (!visible) void this.silence();
    this.stage.invalidate();
  }
  /** Place instantly, turned toward the audience (or facing `yaw`). */
  moveTo(x: number, z: number, yaw = this.stage.audienceYaw(x, z)) {
    this.walker.setPosition(x, z, yaw);
  }
  /** Walk there, then settle turned toward the audience. */
  walkTo(
    x: number,
    z: number,
    options?: { gait?: Gait; durationMs?: number; faceCamera?: boolean; endYaw?: number },
  ) {
    return this.walker.walkTo(
      { x, z },
      { ...options, endYaw: options?.endYaw ?? this.stage.audienceYaw(x, z) },
    );
  }

  // --- LessonActor ---

  async say(text: string, duration?: number): Promise<void> {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    await this.balloon.hide({ duration: 150 });
    this.balloon.setText(text);
    this.stage.placeBalloon(this);
    await this.balloon.show();
    if (duration) this.silenceTimer = setTimeout(() => void this.silence(), duration);
  }

  async silence(): Promise<void> {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    await this.balloon.hide();
  }

  canSpeak(): boolean {
    return !!this.letter.mouth;
  }

  speakPulse(params?: AnimationParams): Promise<void> {
    return this.letter.mouth?.animateSpeak(params) ?? Promise.resolve();
  }

  /** Mirrors applyLetterEffect for the effects that have a 3D meaning yet. */
  async applyEffect(effect: LetterEffect | LetterEffect[], params?: AnimationParams): Promise<void> {
    const effects = Array.isArray(effect) ? effect : [effect];
    await Promise.all(
      effects.map(async (e) => {
        const l = this.letter;
        switch (e) {
          case "speak":
            if (!l.mouth) return;
            if (l.isPartVisible("mouth")) return l.mouth.animateSpeak(params);
            await l.showPart("mouth", { duration: 100 });
            await l.mouth.animateSpeak(params);
            await l.hidePart("mouth", { duration: 100 });
            return;
          case "bounce":
            await l.pose({ translateY: -10, duration: 150, ease: "outQuad" }, "bottom");
            await l.pose({ translateY: 0, duration: 150, ease: "inQuad" }, "bottom");
            return;
          case "highlight": {
            const original = l.fillColor;
            await l.setColor("#ffeb3b", { duration: 150, ...params });
            await new Promise((r) => setTimeout(r, 300));
            await l.setColor(original, { duration: 150 });
            return;
          }
          case "silent-e":
            // 3D treatment (approved; SVG dims to 60% opacity): the letter
            // hushes — colour drains toward the paper and it shrinks a touch,
            // on the same 200 / 300 / 200 ms beat as the SVG effect.
            return this.hush(0.6, 0.93);
          case "r-control":
          case "l-control":
            // PROVISIONAL: a lighter hush (SVG: drop-shadow + dim).
            return this.hush(0.35, 0.96);
          case "glow": {
            // SVG: gold drop-shadow for 400 ms
            l.setHighlight(1, "#ffcc33");
            await new Promise((r) => setTimeout(r, 400));
            l.setHighlight(0);
            return;
          }
          default:
            return;
        }
      }),
    );
  }

  /** Drain colour toward the paper by `amount` and shrink to `scale`, then recover. */
  private async hush(amount: number, scale: number): Promise<void> {
    const l = this.letter;
    const original = l.fillColor;
    const quiet = new THREE.Color(original).lerp(new THREE.Color("#e4e0d4"), amount);
    await Promise.all([
      l.setColor(quiet, { duration: 200 }),
      l.pose({ scale, duration: 200, ease: "outQuad" }, "bottom"),
    ]);
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all([
      l.setColor(original, { duration: 200 }),
      l.pose({ scale: 1, duration: 200, ease: "inOutQuad" }, "bottom"),
    ]);
  }

  eyesVisible(): boolean {
    return !!this.letter.eyes && this.letter.isPartVisible("eyes");
  }

  /** Blink-only idle loop (as presence.startIdle with tracking off). */
  startIdle(): () => void {
    let running = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (!running) return;
      timer = setTimeout(async () => {
        if (!running) return;
        // Tab hidden: frames are frozen, so a blink would stick half-shut
        if (!document.hidden && this.eyesVisible()) await this.letter.blink({ duration: 150 });
        schedule();
      }, 3000 + Math.random() * 3000);
    };
    schedule();
    return () => {
      running = false;
      if (timer) clearTimeout(timer);
    };
  }

  boundsIn(container: HTMLElement) {
    if (!this._visible) return null;
    const b = this.stage.screenBounds(this);
    if (!b) return null;
    // Bounds are relative to the stage container; translate if asked for another
    const s = this.stage.container.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const dx = s.left - c.left;
    const dy = s.top - c.top;
    return { left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy };
  }

  /**
   * The runner marks whose turn it is on sound steps. The SVG stage pulses a
   * glow; the 3D stage deliberately shows nothing (the audio button already
   * sits over the speaker). Kept so the LessonActor contract holds.
   */
  setActive(_active: boolean): void {}

  /** The body colour now (LessonActor: the sound rail's milestones wear it). */
  fillColor(): string {
    return this.letter.fillColor;
  }
}

export class Stage3D {
  readonly container: HTMLElement;
  readonly actors = new Map<string, Actor3D>();
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);
  private readonly balloonLayer: HTMLElement;
  private readonly resizeObs: ResizeObserver;
  private readonly floor: THREE.Mesh;
  private framing = { halfWidth: 150, centerX: 0, top: 100, heightFactor: 4, lookFactor: 0.8, elevation: 0.16 };
  /** A close-up in place of the framing (shotTo), and the move into or out of one. */
  private shot: CameraShot | null = null;
  private shotMove: { timer: { pause(): void }; done: () => void } | null = null;
  /** Where the camera looks (the start of a move). */
  private readonly cameraLook = new THREE.Vector3();
  private readonly transparent: boolean;
  private environment: Environment | null = null;
  private readonly pointerNdc = new THREE.Vector2();
  private readonly lookTarget = new THREE.Vector3();
  private pointerActive = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -LOOK_PLANE_Z);
  private readonly onPointerMove = (e: PointerEvent) => {
    const r = this.container.getBoundingClientRect();
    this.pointerNdc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.pointerActive = true;
    this.invalidate();
  };
  private readonly onPointerLeave = () => {
    this.pointerActive = false; // gaze glides back to the camera
    this.invalidate();
  };
  /** Where the eyes are looking (world), eased toward the pointer or camera. */
  private readonly gaze = new THREE.Vector3();
  private gazeInit = false;
  private lastFrameAt = 0;
  private raf = 0;
  private frameQueued = false;
  private inFrame = false;
  private destroyed = false;
  private readonly tickers = new Set<(tSec: number) => void>();
  private framedCamZ = 1000;
  private orbit: { dispose(): void } | null = null;
  private orbitWanted = false;
  /** The stage's own lights and their full intensities (setLightLevel scales them). */
  private readonly baseLights: { light: THREE.Light; intensity: number }[];
  private lightLevel = 1;

  constructor(container: HTMLElement, options: Stage3DOptions = {}) {
    this.container = container;
    container.style.position = "relative";
    container.style.overflow = "hidden";

    this.transparent = !!options.transparent;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: this.transparent });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.display = "block";
    container.appendChild(canvas);

    this.balloonLayer = document.createElement("div");
    Object.assign(this.balloonLayer.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "1000",
    });
    container.appendChild(this.balloonLayer);

    this.scene.background = this.transparent ? null : new THREE.Color(options.background ?? "#FFFEF7");
    if (this.transparent) this.renderer.setClearColor(0x000000, 0);
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8a98f, 1.4);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-300, 500, 700);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(400, 200, -500);
    this.scene.add(hemi, key, rim);
    this.baseLights = [hemi, key, rim].map((light) => ({ light, intensity: light.intensity }));

    // A backdrop, not a solid: never writes depth, so descenders that sink
    // below the baseline stay visible.
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20000, 20000),
      new THREE.MeshStandardMaterial({
        color: options.floorColor ?? "#f3eee0",
        roughness: 1,
        depthWrite: false,
      }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = -10;
    this.floor.visible = !this.transparent;
    this.scene.add(this.floor);

    if (options.trackPointer) {
      container.addEventListener("pointermove", this.onPointerMove);
      container.addEventListener("pointerleave", this.onPointerLeave);
    }

    if (options.environment) this.setEnvironment(options.environment);

    // three.js restores its GPU state after a context loss; render on demand
    // needs a nudge to draw again
    canvas.addEventListener("webglcontextrestored", () => this.invalidate());
    if (import.meta.env.DEV) {
      canvas.addEventListener("webglcontextlost", () => {
        if (!this.destroyed) console.warn("[Stage3D blip-diag] WebGL context LOST");
      });
      canvas.addEventListener("webglcontextrestored", () => console.warn("[Stage3D blip-diag] WebGL context restored"));
    }

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    if (options.freeCamera) this.setFreeCamera(true);
  }

  /**
   * The framed camera's distance (z). Staging maths uses this rather than the
   * live camera, which the dbg free camera may have moved.
   */
  get framedCameraZ(): number {
    return this.framedCamZ;
  }

  /**
   * DBG: hand the camera to OrbitControls (drag orbits, right-drag / shift-drag
   * pans, wheel zooms), to look the set over from anywhere. Staging is
   * unaffected (offstageX etc. use the framed camera); turning it off snaps
   * back to the framing. OrbitControls loads lazily, so it's never in a chunk
   * that doesn't use it.
   */
  setFreeCamera(on: boolean) {
    this.orbitWanted = on;
    if (!on) {
      this.orbit?.dispose();
      this.orbit = null;
      this.applyFraming();
      return;
    }
    if (this.orbit) return;
    void import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
      if (!this.orbitWanted || this.orbit || this.destroyed) return;
      const controls = new OrbitControls(this.camera, this.renderer.domElement);
      const { centerX, top, lookFactor } = this.framing;
      controls.target.set(centerX, top * lookFactor, 0);
      controls.screenSpacePanning = true;
      controls.update();
      const onChange = () => this.invalidate();
      controls.addEventListener("change", onChange);
      this.orbit = {
        dispose: () => {
          controls.removeEventListener("change", onChange);
          controls.dispose();
        },
      };
    });
  }

  addActor(id: string, char: string, options: Actor3DOptions): Actor3D | null {
    const letter = createLetter3D(char, {
      ...DEFAULT_LOOK,
      ...options.look,
      color: options.color,
      hiddenParts: options.hiddenParts,
      onChange: () => this.invalidate(),
    });
    if (!letter) return null;
    // Screen-space line materials (the "edges" outline) need the canvas size
    letter.setResolution(this.container.clientWidth || 1, this.container.clientHeight || 1);
    const scale = options.scale ?? 1;
    if (scale !== 1) letter.root.scale.setScalar(scale); // before the walker measures it
    const walker = createWalker(letter, options.floorY ?? 0);
    const x = options.x ?? 0;
    const z = options.z ?? 0;
    walker.setPosition(x, z, this.audienceYaw(x, z));
    this.scene.add(walker.object);
    const actor = new Actor3D(this, id, letter, walker, options.color, scale);
    this.balloonLayer.appendChild(actor.balloon.element);
    this.actors.set(id, actor);
    this.invalidate();
    return actor;
  }

  /**
   * Frame the camera on a stage region: `halfWidth` world units either side
   * of `centerX` must fit, the content (up to height `top`) stands in the
   * lower-middle of the view, and the space above is left for speech
   * balloons. Re-applied on resize.
   */
  frame(
    halfWidth: number,
    options: {
      centerX?: number;
      top?: number;
      /**
       * Minimum camera distance as a multiple of `top` (default 4, which
       * leaves room above for speech balloons; ~3 frames content tightly).
       */
      heightFactor?: number;
      /** Aim point as a fraction of `top` (default 0.8). */
      lookFactor?: number;
      /**
       * Camera height above the aim point, as a fraction of its distance
       * (default 0.16). Lower sees faces more level (under a cap's brim).
       */
      elevation?: number;
    } = {},
  ) {
    this.framing = {
      halfWidth,
      centerX: options.centerX ?? 0,
      top: options.top ?? 100,
      heightFactor: options.heightFactor ?? 4,
      lookFactor: options.lookFactor ?? 0.8,
      elevation: options.elevation ?? 0.16,
    };
    this.applyFraming();
  }

  /** The framing's camera: where it goes and what it looks at (and its distance, framedCamZ). */
  private framingCamera() {
    const cam = this.camera;
    const { halfWidth, centerX, top, heightFactor, lookFactor, elevation } = this.framing;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fitWidth = (halfWidth * 1.12) / (tanV * cam.aspect);
    const fitHeight = top * heightFactor;
    const d = Math.max(fitWidth, fitHeight);
    const lookY = top * lookFactor;
    return {
      d,
      position: new THREE.Vector3(centerX, lookY + 10 + d * elevation, d),
      look: new THREE.Vector3(centerX, lookY, 0),
    };
  }

  private applyFraming() {
    const cam = this.camera;
    const framed = this.framingCamera();
    this.framedCamZ = framed.d;
    if (this.orbit) return this.invalidate(); // the free camera stays where it was put
    if (this.shotMove) return; // a move is under way; it lands on the current shot or framing
    const { position, look } = this.shot ? shotCamera(this.shot, cam.fov, cam.aspect) : framed;
    cam.position.copy(position);
    this.cameraLook.copy(look);
    cam.lookAt(look);
    cam.updateMatrixWorld();
    this.invalidate();
  }

  /**
   * Move the camera into a close-up (`shot`), or back to the framing (null),
   * eased over `duration` ms. Staging maths (offstageX, framedCameraZ) keeps
   * using the framing throughout. With the dbg free camera on, the camera
   * stays put (the shot applies once it's off).
   */
  shotTo(shot: CameraShot | null, options: { duration?: number } = {}): Promise<void> {
    this.shot = shot;
    if (this.shotMove) {
      this.shotMove.timer.pause();
      this.shotMove.done();
      this.shotMove = null;
    }
    if (this.orbit || this.destroyed) return Promise.resolve();
    const cam = this.camera;
    const fromPos = cam.position.clone();
    const fromLook = this.cameraLook.clone();
    const to = shot ? shotCamera(shot, cam.fov, cam.aspect) : this.framingCamera();
    return new Promise<void>((resolve) => {
      const timer = createTimer({
        duration: Math.max(1, options.duration ?? 900),
        onUpdate: (self) => {
          const e = easeInOut(Math.min(1, self.progress));
          cam.position.lerpVectors(fromPos, to.position, e);
          this.cameraLook.lerpVectors(fromLook, to.look, e);
          cam.lookAt(this.cameraLook);
          cam.updateMatrixWorld();
          this.invalidate();
        },
        onComplete: () => {
          if (this.shotMove?.timer !== timer) return;
          this.shotMove = null;
          this.applyFraming(); // exact, and right for the aspect if it changed meanwhile
          resolve();
        },
      });
      this.shotMove = { timer, done: resolve };
    });
  }

  /**
   * An x just out of view at depth `z` on the given side (for entrances and
   * exits), with `margin` world units to spare beyond the frame edge.
   */
  offstageX(side: "left" | "right", z: number, margin = 90): number {
    const cam = this.camera;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const halfW = (this.framedCamZ - z) * tanV * cam.aspect;
    return this.framing.centerX + (side === "right" ? 1 : -1) * (halfW + margin);
  }

  /** Swap the set dressing (background, fog, floor, backdrop geometry). */
  setEnvironment(name: EnvironmentName) {
    if (this.transparent) return;
    if (this.environment) {
      this.scene.remove(this.environment.group);
      this.environment.dispose();
    }
    const env = buildEnvironment(name, this.renderer.capabilities.getMaxAnisotropy());
    this.environment = env;
    this.scene.add(env.group);
    this.scene.background = env.background;
    this.scene.fog = env.fog;
    const floorMat = this.floor.material as THREE.MeshStandardMaterial;
    floorMat.color.copy(env.floorColor);
    floorMat.map = env.floorMap;
    floorMat.needsUpdate = true;
    this.floor.visible = env.showFloor !== false;
    this.invalidate();
  }

  /** Facing (yaw) from (x, z) toward the audience point. */
  audienceYaw(x: number, z: number): number {
    return Math.atan2(this.framing.centerX - x, AUDIENCE_Z - z);
  }

  /** The world ray under a client (page) point, for picking props. */
  rayFromClient(clientX: number, clientY: number): THREE.Ray {
    const r = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    return rc.ray.clone();
  }

  /** Actor's on-screen bounds, px relative to the stage container. */
  screenBounds(actor: Actor3D): ScreenBounds | null {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return null;
    this.scene.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject(actor.letter.root);
    if (box.isEmpty()) return null;
    const out = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ).project(this.camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      out.left = Math.min(out.left, x);
      out.right = Math.max(out.right, x);
      out.top = Math.min(out.top, y);
      out.bottom = Math.max(out.bottom, y);
    }
    return out;
  }

  /** Same placement rule as the SVG Stage: fit the headroom, stay on stage. */
  placeBalloon(actor: Actor3D) {
    const b = this.screenBounds(actor);
    if (!b) return;
    const centerX = (b.left + b.right) / 2;
    const topY = b.top;
    const containerW = this.container.clientWidth || 400;
    const { side, maxWidth = Infinity, maxHeight = Infinity } = actor.balloonPlacement;
    if (side === "right") {
      // The tail points at the mouth (a capital A's is on its crossbar), from
      // just right of the letter; the bubble keeps level with the head and the
      // tail slides down its edge (the bubble drops only if it's too short)
      const containerH = this.container.clientHeight || 300;
      const tipX = b.right + BALLOON_GAP;
      const tipY = this.mouthScreenY(actor, containerH) ?? b.top + BALLOON_SIDE_DROP;
      const top = Math.max(BALLOON_MARGIN, b.top - BALLOON_SIDE_RISE);
      actor.balloon.setTailSide("left");
      actor.balloon.fit(
        Math.min(maxWidth, containerW - tipX - BALLOON_TAIL - BALLOON_MARGIN),
        Math.min(maxHeight, containerH - top - BALLOON_MARGIN),
      );
      const h = actor.balloon.getHeight();
      const inset = SpeechBalloon.SIDE_TAIL_Y;
      actor.balloon.setSideTailOffset(Math.min(Math.max(tipY - top, inset), Math.max(inset, h - inset)));
      actor.balloon.setPosition(tipX, tipY);
      return;
    }
    actor.balloon.setTailSide("bottom");
    actor.balloon.fit(
      Math.min(maxWidth, containerW - BALLOON_MARGIN * 2, 460),
      Math.min(maxHeight, topY - BALLOON_GAP - BALLOON_MARGIN),
    );
    const half = actor.balloon.getWidth() / 2;
    const clampedX = Math.min(Math.max(centerX, BALLOON_MARGIN + half), containerW - BALLOON_MARGIN - half);
    actor.balloon.setShift(clampedX - centerX);
    actor.balloon.setPosition(centerX, topY);
  }

  private readonly mouthTmp = new THREE.Vector3();

  /** Where the actor's mouth is on screen (px down the container), or null if it has none. */
  private mouthScreenY(actor: Actor3D, containerH: number): number | null {
    const mouth = actor.letter.geometry.attachments?.mouth;
    if (!mouth) return null;
    actor.letter.content.updateWorldMatrix(true, false);
    const p = actor.letter.content.localToWorld(this.mouthTmp.set(mouth.x, mouth.y, 0)).project(this.camera);
    return ((1 - p.y) / 2) * containerH;
  }

  /**
   * Run `fn(seconds)` every frame (continuous motion, e.g. an idle sway).
   * While any ticker is registered the stage renders every frame; remove
   * them all and it goes back to rendering only on change. Returns remove.
   */
  addTicker(fn: (tSec: number) => void): () => void {
    this.tickers.add(fn);
    this.invalidate();
    return () => {
      this.tickers.delete(fn);
      this.invalidate();
    };
  }

  // --- lighting ---

  /**
   * Dim (or restore) the stage's own lights: 1 is full, 0.2 a dark room.
   * Lights a set or prop adds (a lamp) are its own business. Animated over
   * `durationMs` if given.
   */
  setLightLevel(level: number, durationMs = 0): Promise<void> {
    const apply = (l: number) => {
      this.lightLevel = l;
      for (const { light, intensity } of this.baseLights) light.intensity = intensity * l;
      this.invalidate();
    };
    if (durationMs <= 0) {
      apply(level);
      return Promise.resolve();
    }
    const from = this.lightLevel;
    return new Promise((resolve) =>
      createTimer({
        duration: durationMs,
        onUpdate: (self) => apply(from + (level - from) * easeInOut(Math.min(1, self.progress))),
        onComplete: () => {
          apply(level);
          resolve();
        },
      }),
    );
  }

  /** Time of day for sets that have one (Environment.setDaylight): 0 night … 1 day. */
  setDaylight(t: number): void {
    this.environment?.setDaylight?.(t);
    this.invalidate();
  }

  // --- render on demand ---

  invalidate() {
    if (this.inFrame || this.frameQueued || this.destroyed) return;
    this.frameQueued = true;
    this.raf = requestAnimationFrame((t) => this.frameNow(t));
  }

  private frameNow(now: number) {
    this.frameQueued = false;
    this.inFrame = true;
    const diagT0 = import.meta.env.DEV ? performance.now() : 0;
    for (const tick of this.tickers) tick(now / 1000);
    const diagTicked = import.meta.env.DEV ? performance.now() : 0;
    // Gaze: the pointer if it's over the stage, else eye contact (the camera)
    let desired: THREE.Vector3 = this.camera.position;
    if (this.pointerActive) {
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      if (this.raycaster.ray.intersectPlane(this.lookPlane, this.lookTarget)) desired = this.lookTarget;
    }
    const dt = Math.min(1 / 30, Math.max(0, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    if (!this.gazeInit) {
      this.gaze.copy(desired);
      this.gazeInit = true;
    } else {
      this.gaze.lerp(desired, 1 - Math.exp(-dt / GAZE_TAU));
    }
    const gazeSettling = this.gaze.distanceTo(desired) > 0.5;
    this.scene.updateMatrixWorld();
    for (const a of this.actors.values()) a.letter.lookAt(a.gazeFor(this.gaze));
    for (const a of this.actors.values()) {
      if (!a.visible) continue;
      a.walker.update();
      this.placeBalloon(a);
    }
    const diagPlaced = import.meta.env.DEV ? performance.now() : 0;
    const programsBefore = import.meta.env.DEV ? (this.renderer.info.programs?.length ?? 0) : 0;
    const renderStart = import.meta.env.DEV ? performance.now() : 0;
    this.renderer.render(this.scene, this.camera);
    if (import.meta.env.DEV) {
      this.blipDiag(now, performance.now() - renderStart, programsBefore, {
        tickers: diagTicked - diagT0,
        actorsAndBalloons: diagPlaced - diagTicked,
        render: performance.now() - renderStart,
        frameStartLag: diagT0 - now,
      });
    }
    this.inFrame = false;
    if (gazeSettling || this.tickers.size > 0) this.invalidate();
  }

  // DEV: why did the screen blip? Logs slow frames (and whether a shader
  // compiled in them), gaps between frames while continuously rendering, and
  // WebGL context loss. Filter the console on "blip-diag".
  private diagLastFrame = 0;
  private diagWasTicking = false;
  private diagPrevParts = "";
  private blipDiag(now: number, renderMs: number, programsBefore: number, parts: Record<string, number>) {
    const programs = this.renderer.info.programs?.length ?? 0;
    const gap = now - this.diagLastFrame;
    const partsStr = Object.entries(parts)
      .map(([k, v]) => `${k} ${v.toFixed(1)}`)
      .join(", ");
    const ours = parts.tickers + parts.actorsAndBalloons + parts.render;
    if (ours > 40 || programs !== programsBefore) {
      console.warn(`[Stage3D blip-diag] frame work took ${ours.toFixed(0)} ms (${partsStr} ms); shader programs ${programsBefore} → ${programs}`);
    }
    if (this.diagWasTicking && this.diagLastFrame && gap > 80 && document.visibilityState === "visible") {
      // The frame before the gap: if its work was small, the time went elsewhere
      console.warn(`[Stage3D blip-diag] ${gap.toFixed(0)} ms since the previous frame while rendering continuously. Previous frame: ${this.diagPrevParts} ms; this frame: ${partsStr} ms`);
    }
    this.diagPrevParts = partsStr;
    this.diagLastFrame = now;
    this.diagWasTicking = this.tickers.size > 0;
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    if (import.meta.env.DEV) {
      const c = this.renderer.domElement;
      const pr = this.renderer.getPixelRatio();
      console.warn(`[Stage3D blip-diag] resize → canvas cleared: ${c.width}×${c.height} → ${Math.floor(w * pr)}×${Math.floor(h * pr)}${this.inFrame ? " (DURING a frame: no immediate redraw!)" : ""}`);
    }
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const a of this.actors.values()) a.letter.setResolution(w, h);
    this.applyFraming();
    // setSize() clears the canvas. Redraw now (ResizeObserver callbacks run
    // before paint) rather than next frame, or every resize flashes blank —
    // visible when a container animates its size (e.g. a keycap pressing).
    if (!this.destroyed && !this.inFrame) this.frameNow(performance.now());
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.orbit?.dispose();
    this.orbit = null;
    this.container.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("pointerleave", this.onPointerLeave);
    this.resizeObs.disconnect();
    for (const a of this.actors.values()) {
      void a.silence();
      a.walker.dispose();
      a.letter.dispose();
    }
    this.actors.clear();
    this.environment?.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.renderer.dispose();
    // Hand the WebGL context back now rather than at GC: browsers keep ~16
    // live, and each GPC intro frame builds its own stage
    this.renderer.forceContextLoss();
    this.container.innerHTML = "";
  }
}
