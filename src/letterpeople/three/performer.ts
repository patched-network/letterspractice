// letterpeople/src/three/performer.ts
//
// SPIKE: adapts a Letter3D to the renderer-neutral Performer, so the
// production sequences (animations/celebrations.ts, speech.ts) drive 3D
// letters unchanged.

import * as THREE from "three";
import { RANDOM_CELEBRATIONS_3D } from "../animations/celebrations";
import type { Performer } from "../animations/performer";
import type { Letter3D } from "./letterMesh";

const DEG = Math.PI / 180;
const noop = () => Promise.resolve();

/** Arms stand-in for letters built without arms (celebrations only read it). */
const NO_ARM = {
  rotateTo: noop,
  setHandPosition: noop,
  getHandPosition: () => ({ x: 0, y: 0 }),
  getShoulderPosition: () => ({ x: 0, y: 0 }),
};

export function performer3D(letter: Letter3D): Performer {
  const arms = letter.arms;
  return {
    eyes: {
      isVisible: () => letter.eyes !== null && letter.isPartVisible("eyes"),
      lookAt: (direction, options) => letter.lookDirection(direction, options),
      blink: (options) => letter.blink(options),
      brows: letter.brows ?? undefined,
    },
    mouth: letter.mouth ?? { updateShape: noop, animateSpeak: noop },
    arms: arms
      ? {
          isVisible: () => letter.isPartVisible("arms"),
          show: (options) => letter.showPart("arms", options),
          hide: (options) => letter.hidePart("arms", options),
          wave: (options) => arms.wave(options),
          relax: (options) => arms.relax(options),
          left: arms.left,
          right: arms.right,
        }
      : {
          isVisible: () => false,
          show: noop,
          hide: noop,
          wave: noop,
          relax: noop,
          left: NO_ARM,
          right: NO_ARM,
        },
    attachmentCoords: letter.geometry.attachments,
    pose: (props, origin) => letter.pose(props, origin),
    resetPose: () => letter.resetPose(),
    fillColor: () => letter.fillColor,
    randomPool: RANDOM_CELEBRATIONS_3D,
    spawnConfettiBit: (w, h, fill) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(fill),
          side: THREE.DoubleSide,
          transparent: true,
          roughness: 0.6,
        }),
      );
      // Scatter in depth in front of the face, and tumble off-axis so bits
      // catch the light as they flutter — the one liberty taken over SVG.
      mesh.position.z = letter.frontZ + 2 + Math.random() * 10;
      const tumbleX = 0.4 + Math.random() * 0.5;
      const tumbleY = 0.2 + Math.random() * 0.4;
      letter.content.add(mesh);
      const mat = mesh.material;
      return {
        place: (x, y, rot, opacity) => {
          mesh.position.x = x;
          mesh.position.y = y;
          mesh.rotation.set(rot * tumbleX * DEG, rot * tumbleY * DEG, rot * DEG);
          mat.opacity = opacity;
          letter.invalidate();
        },
        remove: () => {
          letter.content.remove(mesh);
          mesh.geometry.dispose();
          mat.dispose();
          letter.invalidate();
        },
      };
    },
  };
}
