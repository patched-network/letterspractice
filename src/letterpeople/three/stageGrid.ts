// letterpeople/src/three/stageGrid.ts
//
// DBG: a world-coordinate grid on the stage floor, for talking about
// placements in numbers. Lines every 50 units, every 100 stronger, the x = 0
// and z = 0 lines in colour; x labels along z = 0, z labels along x = 0; and
// under each actor a live readout of where it stands (x, z, and its height
// when it's up on something). World units: letter cap height 100, floor
// y = 0, +z toward the camera.

import * as THREE from "three";
import type { Stage3D } from "./stage3d";

const X_EXTENT = 1000;
const Z_FROM = -900;
const Z_TO = 400;
const MINOR = 50;
const MAJOR = 100;
/** Just above the floor, so the lines show on it but hide behind the set. */
const LINE_Y = 0.6;
/** Label height as a fraction of the view's height (constant on screen). */
const LABEL_SIZE = 0.03;

interface Label {
  sprite: THREE.Sprite;
  setText(text: string): void;
  dispose(): void;
}

function label(text: string, color: string): Label {
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;
  let current = "";
  const setText = (t: string) => {
    if (t === current) return;
    current = t;
    const font = "600 28px system-ui, sans-serif";
    g.font = font;
    const w = Math.ceil(g.measureText(t).width) + 16;
    canvas.width = w;
    canvas.height = 40;
    g.font = font;
    g.fillStyle = "rgba(255, 255, 255, 0.8)";
    g.beginPath();
    g.roundRect(0, 0, w, 40, 8);
    g.fill();
    g.fillStyle = color;
    g.textBaseline = "middle";
    g.fillText(t, 8, 21);
    texture.needsUpdate = true;
    sprite.scale.set((LABEL_SIZE * w) / 40, LABEL_SIZE, 1);
  };
  setText(text);
  return {
    sprite,
    setText,
    dispose: () => {
      texture.dispose();
      material.dispose();
    },
  };
}

function lines(points: number[], color: string, opacity: number): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
}

/** Put the grid on `stage` (until dispose). */
export function createStageGrid(stage: Stage3D): { dispose(): void } {
  const group = new THREE.Group();
  group.name = "dbg-stage-grid";
  const minor: number[] = [];
  const major: number[] = [];
  for (let x = -X_EXTENT; x <= X_EXTENT; x += MINOR) {
    if (x === 0) continue;
    (x % MAJOR === 0 ? major : minor).push(x, LINE_Y, Z_FROM, x, LINE_Y, Z_TO);
  }
  for (let z = Z_FROM; z <= Z_TO; z += MINOR) {
    if (z === 0) continue;
    (z % MAJOR === 0 ? major : minor).push(-X_EXTENT, LINE_Y, z, X_EXTENT, LINE_Y, z);
  }
  group.add(
    lines(minor, "#5a6b86", 0.18),
    lines(major, "#3d4f6b", 0.4),
    lines([-X_EXTENT, LINE_Y, 0, X_EXTENT, LINE_Y, 0], "#c0392b", 0.8), // z = 0: the x axis
    lines([0, LINE_Y, Z_FROM, 0, LINE_Y, Z_TO], "#2461b5", 0.8), // x = 0: the z axis
  );

  const labels: Label[] = [];
  const place = (l: Label, x: number, y: number, z: number) => {
    l.sprite.position.set(x, y, z);
    group.add(l.sprite);
    labels.push(l);
  };
  for (let x = -X_EXTENT; x <= X_EXTENT; x += MAJOR) place(label(`x ${x}`, "#8e2a1f"), x, 2, 0);
  for (let z = Z_FROM; z <= Z_TO; z += MAJOR) if (z !== 0) place(label(`z ${z}`, "#1b4a8c"), 0, 2, z);

  // Live readouts under each actor
  const readouts = new Map<string, Label>();
  const round = (n: number) => Math.round(n);
  const stopTicker = stage.addTicker(() => {
    for (const [id, actor] of stage.actors) {
      let l = readouts.get(id);
      if (!l) {
        l = label("", "#222");
        l.sprite.center.set(0.5, 1); // hangs below the point
        readouts.set(id, l);
        group.add(l.sprite);
        labels.push(l);
      }
      l.sprite.visible = actor.visible;
      const p = actor.walker.getPosition();
      const y = actor.walker.getFloorY();
      l.setText(`${id}  ${round(p.x)}, ${round(p.z)}${Math.abs(y) > 0.5 ? `  ↑${round(y)}` : ""}`);
      l.sprite.position.set(p.x, y - 4, p.z + 10);
    }
  });

  stage.scene.add(group);
  stage.invalidate();
  return {
    dispose() {
      stopTicker();
      stage.scene.remove(group);
      group.traverse((o) => {
        const line = o as THREE.LineSegments;
        if (line.isLineSegments) {
          line.geometry.dispose();
          (line.material as THREE.Material).dispose();
        }
      });
      for (const l of labels) l.dispose();
      stage.invalidate();
    },
  };
}
