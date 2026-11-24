// letterpeople/src/three/costumes.ts
//
// SPIKE: things a 3D letter can wear. First wardrobe: a cap that becomes a
// cape (SplitDigraphLesson3D: cap → cape, the e's own costume changing as
// the e joins the word).
//
// Worn on the letter's `content` group (SVG units, y-down), anchored at the
// glyph's `hat` attachment point, so they follow every walk, hop and pose.
// Inside the anchor, costume space is y-up with its origin on top of the
// head at mid-depth; +z is the letter's front.
//
// Motion (the swap, the cape's flutter) runs on the stage ticker only while
// it's happening: at rest the costumes are still, like the rest of the set.

import * as THREE from "three";
import { animate } from "animejs";
import type { Letter3D } from "./letterMesh";
import type { Stage3D } from "./stage3d";
import { SHADOW_UNDER_LETTER } from "./locomotion";

export interface CapAndCape {
  /** The cap is on from creation (or nothing, with `cap: false`); the cape is not. */
  readonly wearing: "cap" | "cape" | "none";
  /**
   * The cap becomes the cape: its brim flows down the back into the cape
   * while the crown shrinks away into the head. Resolves when done.
   */
  capToCape(): Promise<void>;
  /**
   * No cap (`cap: false`): the cape falls into place from the shoulders, in
   * the same beat as capToCape (so a friend's cape can arrive with it).
   */
  putOnCape(): Promise<void>;
  /** Ripple the cape for `ms` (while its wearer moves), `amp` units deep. No-op before the swap. */
  flutter(ms: number, amp?: number): void;
  dispose(): void;
}

const CAPE_W_BOTTOM = 118;
/** The worn cape's persistent sway: side swing and back billow (units), cycles/s. */
const SWAY_X = 3;
const SWAY_Z = 3;
const SWAY_HZ = 0.35;
const CAPE_SEGS_X = 8;
const CAPE_SEGS_Y = 10;

export function wearCapAndCape(
  letter: Letter3D,
  stage: Stage3D,
  color: THREE.ColorRepresentation,
  opts: { cap?: boolean } = {},
): CapAndCape {
  const withCap = opts.cap ?? true;
  const hat = letter.geometry.attachments.hat;
  const midZ = letter.frontZ / 2;
  const anchor = new THREE.Group();
  anchor.position.set(hat.x, hat.y, midZ);
  anchor.scale.y = -1; // content is y-down; costume space is y-up
  letter.content.add(anchor);

  const cloth = new THREE.Color(color);
  const standard = (c: THREE.Color, side: THREE.Side = THREE.FrontSide) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side });
  const clothMat = standard(cloth);
  const clothDark = standard(cloth.clone().multiplyScalar(0.72));

  // --- Cap: domed crown, brim turned to the side (a front brim would be
  // edge-on to the camera), a button on top; a jaunty tilt. Seated at the
  // brow line, just above the eyes, so the brows are hidden while it's on
  // (as a real cap's brim hides them; the e's brows sit right at the top of
  // its ring, where no cap could clear them without floating). The crown
  // runs a little past a half-dome, so its sides come down over the ring's
  // curve instead of leaving gaps. ---
  const CROWN_R = 18;
  const CROWN_SWEEP = Math.PI * 0.58; // past the equator: the sides hug the head
  const crownDrop = -CROWN_R * Math.cos(CROWN_SWEEP) * 0.85; // lip below the equator
  const cap = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.SphereGeometry(CROWN_R, 20, 12, 0, Math.PI * 2, 0, CROWN_SWEEP), clothMat);
  crown.scale.set(1, 0.85, 0.8);
  crown.position.y = crownDrop; // lip at the cap's origin
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 24), clothDark);
  brim.scale.set(16, 1, 10.5);
  brim.position.set(17, 0.5, 0);
  brim.rotation.z = -0.12;
  const button = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 6), clothDark);
  button.position.y = crownDrop + CROWN_R * 0.85;
  cap.add(crown, brim, button);
  const CAP_SEAT_Y = -2.5; // lip just over the eye tops (~3.5 under the hat point)
  cap.position.y = CAP_SEAT_Y;
  cap.rotation.set(-0.15, 0, 0.16); // a touch back; tilted
  if (withCap) anchor.add(cap);
  // Brows hidden under the cap; back when it comes off. (Their meshes, not
  // their groups: showing / hiding the eyes sets the groups' visibility.)
  const setBrows = (on: boolean) => {
    if (!letter.brows) return;
    for (const g of [letter.brows.left.group, letter.brows.right.group]) {
      for (const child of g.children) child.visible = on;
    }
    letter.invalidate();
  };
  if (withCap) setBrows(false);

  // --- Cape: hung from the back of the shoulders, just above the arm
  // roots, flared down the back. (Placed from the glyph's arm attachment
  // points, so it suits any letter.)
  // Hidden until the swap. ---
  const att = letter.geometry.attachments;
  const shoulderSvgY = Math.min(att.leftArm.y, att.rightArm.y);
  const shoulderHalf = Math.abs(att.rightArm.x - att.leftArm.x) / 2;
  const capeTopY = -(shoulderSvgY - hat.y) + 4; // costume space: ~an arm's width above the shoulders
  // Narrower than the body at the nape, so it's hidden behind the shoulders
  // and only shows as it flares out lower down
  const CAPE_W_TOP = 2 * shoulderHalf * 0.78;
  const letterBackZ = -midZ;
  const capeZ = letterBackZ - 2; // on the back (clear of its bevel)
  const capeHeight = capeTopY - (-(100 - hat.y) + 4); // to just above the baseline
  const capeGeo = new THREE.PlaneGeometry(1, 1, CAPE_SEGS_X, CAPE_SEGS_Y);
  const capePos = capeGeo.getAttribute("position") as THREE.BufferAttribute;
  // Rest shape per vertex: u ∈ [-½, ½] across, v ∈ [0, 1] down
  const uv0 = Array.from({ length: capePos.count }, (_, i) => ({
    u: capePos.getX(i),
    v: 0.5 - capePos.getY(i),
  }));
  /**
   * `t` seconds; `sway` 0–1 (the persistent gentle swing, once it's worn);
   * `flutterAmp` the ripple while its wearer moves. Displacement is only ever
   * backward (away from the body), so it never cuts into the letter.
   */
  // During the swap the cape starts as the brim: each vertex's position on
  // the brim (anchor space), blended toward its draped place by `morph`.
  let brimStart: Float32Array | null = null;
  let morph = 1;
  const shapeCape = (t: number, sway: number, flutterAmp: number) => {
    const swing = sway * SWAY_X * Math.sin(Math.PI * 2 * SWAY_HZ * t);
    for (let i = 0; i < capePos.count; i++) {
      const { u, v } = uv0[i];
      const w = CAPE_W_TOP + (CAPE_W_BOTTOM - CAPE_W_TOP) * v;
      const lag = v ** 1.5; // the hem swings most, the top not at all
      const idle = sway * SWAY_Z * lag * (1 + Math.sin(Math.PI * 2 * (v * 0.6 - SWAY_HZ * t) + u * 1.4)) * 0.5;
      const wave = flutterAmp * v ** 1.3 * Math.sin(Math.PI * 2 * (v * 0.9 - 1.4 * t) + u * 2.2);
      let x = u * w + swing * lag + 0.3 * wave;
      let y = capeTopY - v * capeHeight;
      let z = capeZ - 7 * v - idle - Math.abs(wave);
      if (brimStart && morph < 1) {
        const k = morph;
        x = brimStart[i * 3] + (x - brimStart[i * 3]) * k;
        y = brimStart[i * 3 + 1] + (y - brimStart[i * 3 + 1]) * k;
        z = brimStart[i * 3 + 2] + (z - brimStart[i * 3 + 2]) * k;
      }
      capePos.setXYZ(i, x, y, z);
    }
    capePos.needsUpdate = true;
    capeGeo.computeVertexNormals();
  };
  shapeCape(0, 0, 0);
  const capeMat = standard(cloth, THREE.DoubleSide);
  const capeMesh = new THREE.Mesh(capeGeo, capeMat);
  const cape = new THREE.Group();
  cape.position.y = capeTopY;
  capeMesh.position.y = -capeTopY;
  cape.add(capeMesh);
  // (No collar or clasp: a strap across the face read loud. The cape just
  // hangs from the back of the shoulders.)
  cape.visible = false;
  anchor.add(cape);

  // Drawn with the letters, after their contact shadows (locomotion.ts)
  anchor.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.renderOrder = SHADOW_UNDER_LETTER;
  });

  // --- motion: once the cape is on, one stage ticker runs for as long as
  // it's worn (a gentle persistent sway, at Colin's ask: so the stage renders
  // continuously from the swap to the end of the lesson), with a stronger
  // ripple on top while its wearer walks ---
  let wearing: "cap" | "cape" | "none" = withCap ? "cap" : "none";
  let flutterUntil = 0;
  let flutterFrom = 0;
  let flutterAmp = 0;
  let swayFrom = 0;
  let removeTicker: (() => void) | null = null;
  const capeTick = (t: number) => {
    const now = performance.now();
    const sway = Math.min(1, (now - swayFrom) / 1500); // eases in after the swap
    // Flutter eases in and out, so the cape settles back into its sway
    const k = now >= flutterUntil ? 0 : Math.min(1, (now - flutterFrom) / 300, (flutterUntil - now) / 600);
    if (k === 0) flutterAmp = 0;
    shapeCape(t, sway, flutterAmp * k);
    letter.invalidate();
  };
  const startMotion = () => {
    if (removeTicker) return;
    swayFrom = performance.now();
    removeTicker = stage.addTicker(capeTick);
  };
  const flutter = (ms: number, amp = 6) => {
    if (wearing !== "cape") return;
    const now = performance.now();
    if (now >= flutterUntil) (flutterFrom = now), (flutterAmp = amp);
    else flutterAmp = Math.max(flutterAmp, amp);
    flutterUntil = Math.max(flutterUntil, now + ms);
    startMotion();
  };

  /** Each cape vertex's place on the brim's disc, in anchor (cape mesh) space. */
  const brimPositions = (): Float32Array => {
    anchor.updateWorldMatrix(true, true);
    const toAnchor = new THREE.Matrix4().copy(anchor.matrixWorld).invert().multiply(brim.matrixWorld);
    const out = new Float32Array(capePos.count * 3);
    const p = new THREE.Vector3();
    uv0.forEach(({ u, v }, i) => {
      // square (u across, v down) → unit disc, in the brim's flat x/z plane
      const a = 2 * u;
      const b = 2 * v - 1;
      p.set(a * Math.sqrt(1 - (b * b) / 2), 0.6, b * Math.sqrt(1 - (a * a) / 2)).applyMatrix4(toAnchor);
      out.set([p.x, p.y, p.z], i * 3);
    });
    return out;
  };

  const tween = (target: object, params: Record<string, unknown>, update?: () => void) =>
    new Promise<void>((resolve) => {
      animate(target, {
        ...params,
        onUpdate: () => {
          update?.();
          letter.invalidate();
        },
        onComplete: () => resolve(),
      });
    });

  return {
    get wearing() {
      return wearing;
    },
    async capToCape() {
      if (wearing !== "cap") return;
      wearing = "cape";
      // The cape takes over from the brim, in its place and shade
      brimStart = brimPositions();
      morph = 0;
      shapeCape(0, 0, 0);
      brim.visible = false;
      cape.visible = true;
      const brimShade = clothDark.color.clone();
      const clothShade = capeMat.color.clone();
      capeMat.color.copy(brimShade);
      const m = { k: 0 };
      const crownShrink = { s: 1 };
      await Promise.all([
        // Crown and button: shrink away down into the head
        tween(crownShrink, { s: 0, duration: 380, ease: "inBack(1.4)" }, () => {
          const k = Math.max(0.001, crownShrink.s);
          crown.scale.set(k, 0.85 * k, 0.8 * k);
          button.scale.setScalar(k);
          button.position.y = (crownDrop + CROWN_R * 0.85) * k;
        }).then(() => (cap.visible = false)),
        // Brows back as the crown goes
        new Promise<void>((r) => setTimeout(() => (setBrows(true), r()), 200)),
        // Brim: flows down the back into the cape
        tween(m, { k: 1, duration: 620, delay: 80, ease: "outBack(1.3)" }, () => {
          morph = m.k;
          capeMat.color.copy(brimShade).lerp(clothShade, Math.min(1, Math.max(0, m.k)));
          shapeCape(0, 0, 0);
        }).then(() => {
          morph = 1;
          brimStart = null;
          capeMat.color.copy(clothShade);
          flutter(1400);
        }),
      ]);
    },
    async putOnCape() {
      if (wearing !== "none") return;
      wearing = "cape";
      // Every vertex starts gathered along the cape's top edge, then the
      // cape drops into its drape (the same blend as the brim's morph)
      brimStart = new Float32Array(capePos.count * 3);
      uv0.forEach(({ u }, i) => brimStart!.set([u * CAPE_W_TOP, capeTopY, capeZ], i * 3));
      morph = 0;
      shapeCape(0, 0, 0);
      cape.visible = true;
      const m = { k: 0 };
      await tween(m, { k: 1, duration: 620, delay: 80, ease: "outBack(1.3)" }, () => {
        morph = m.k;
        shapeCape(0, 0, 0);
      });
      morph = 1;
      brimStart = null;
      flutter(1400);
    },
    flutter,
    dispose() {
      removeTicker?.();
      removeTicker = null;
      if (withCap) setBrows(true);
      letter.content.remove(anchor);
      const seen = new Set<unknown>();
      // (Without a cap, the cap was built but never worn: free it too)
      const parts = withCap ? [anchor] : [anchor, cap];
      for (const part of parts) {
        part.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          for (const x of [m.geometry, m.material as THREE.Material]) {
            if (!seen.has(x)) (seen.add(x), (x as { dispose(): void }).dispose());
          }
        });
      }
    },
  };
}
