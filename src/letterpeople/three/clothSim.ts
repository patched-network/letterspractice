// letterpeople/src/three/clothSim.ts
//
// A small position-based (Verlet) cloth for props that drape over things and
// get pulled about: the bed lesson's sheet (bedProp.ts). Pure maths, no
// three.js, so it runs headless (clothSim.test.ts).
//
// World units as the stage: letter cap height 100, y up, floor at y = 0.
//
// The sheet is a grid of particles laid flat in the xz plane: column i runs
// along x, row j along z. Distance constraints hold it together: structural
// (neighbours), shear (diagonals) and bend (two apart, softer). Collisions are
// against signed-distance colliders (rounded boxes, cylinders, ellipsoids) and
// the floor, with a little friction so it rests where it lands. No
// self-collision.
//
// Motion is deterministic: the same inputs give the same drape, so the rest
// shape a lesson starts from is the same on every run.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A solid the cloth can't enter. */
export interface Collider {
  /** Signed distance to the surface: negative inside. */
  sdf(x: number, y: number, z: number): number;
  /** Bounding box (the cloth only tests particles near it). */
  readonly min: Vec3;
  readonly max: Vec3;
  /**
   * Static grip, 0–1: cloth touching this counts as this much lighter in the
   * constraint solve (0.15: nearly held in place), so a sheet over a post
   * tents round it instead of being dragged off it. 1 (default): no grip.
   */
  grip?: number;
}

const hypot2 = (a: number, b: number) => Math.sqrt(a * a + b * b);

/** A held sheet's particles may sit this much farther from the hand than across the flat sheet. */
const TETHER_SLACK = 1.08;

/** A box with rounded edges (radius ≤ half the smallest side). */
export function roundedBox(min: Vec3, max: Vec3, radius = 0): Collider {
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const cz = (min.z + max.z) / 2;
  const r = Math.max(0, Math.min(radius, (max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2));
  const hx = (max.x - min.x) / 2 - r;
  const hy = (max.y - min.y) / 2 - r;
  const hz = (max.z - min.z) / 2 - r;
  return {
    min,
    max,
    sdf(x, y, z) {
      const qx = Math.abs(x - cx) - hx;
      const qy = Math.abs(y - cy) - hy;
      const qz = Math.abs(z - cz) - hz;
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
  };
}

/** A capped cylinder with its axis along z (a letter's bowl, extruded). */
export function zCylinder(cx: number, cy: number, radius: number, z0: number, z1: number): Collider {
  const cz = (z0 + z1) / 2;
  const hz = (z1 - z0) / 2;
  return {
    min: { x: cx - radius, y: cy - radius, z: z0 },
    max: { x: cx + radius, y: cy + radius, z: z1 },
    sdf(x, y, z) {
      const dr = hypot2(x - cx, y - cy) - radius;
      const dz = Math.abs(z - cz) - hz;
      return Math.min(Math.max(dr, dz), 0) + hypot2(Math.max(dr, 0), Math.max(dz, 0));
    },
  };
}

/** An ellipsoid (approximate distance: exact on the surface, close near it). */
export function ellipsoid(c: Vec3, r: Vec3): Collider {
  return {
    min: { x: c.x - r.x, y: c.y - r.y, z: c.z - r.z },
    max: { x: c.x + r.x, y: c.y + r.y, z: c.z + r.z },
    sdf(x, y, z) {
      const px = (x - c.x) / r.x;
      const py = (y - c.y) / r.y;
      const pz = (z - c.z) / r.z;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const k1 = Math.sqrt((px * px) / (r.x * r.x) + (py * py) / (r.y * r.y) + (pz * pz) / (r.z * r.z));
      return k1 === 0 ? -Math.min(r.x, r.y, r.z) : (k0 * (k0 - 1)) / k1;
    },
  };
}

export interface ClothOptions {
  /** Size of the flat sheet along x and along z, world units. */
  sizeX: number;
  sizeZ: number;
  /** Centre of the flat sheet at the start. */
  center: Vec3;
  /**
   * The sheet is this much longer along x than it starts (1.2: 20% more
   * cloth than `sizeX`). It spreads out to its full length as it settles, so
   * one dropped between two walls fills the gap and bunches up against them.
   * Default 1.
   */
  slackX?: number;
  /** Rest distance between neighbouring particles (sets the grid). */
  spacing: number;
  /** Units / s². Default 980 (a letter is about a metre tall). */
  gravity?: number;
  /** Velocity kept per substep, 0–1. Default 0.992. */
  damping?: number;
  /** Constraint passes per substep. Default 6. */
  iterations?: number;
  /** Substeps per step(). Default 2. */
  substeps?: number;
  /** How far the cloth keeps off colliders and the floor. Default 1.5. */
  thickness?: number;
  /** Share of sliding motion lost on contact per substep, 0–1. Default 0.35. */
  friction?: number;
  /** Stiffness of the bend constraints, 0–1. Default 0.12 (soft: it folds). */
  bend?: number;
  /** Stiffness of the shear constraints, 0–1. Default 0.6. */
  shear?: number;
}

export class Cloth {
  readonly cols: number;
  readonly rows: number;
  readonly count: number;
  /** Particle positions, xyz interleaved (a renderer can use this array directly). */
  readonly pos: Float32Array;
  private readonly prev: Float32Array;
  private readonly invMass: Float32Array;
  /** Per particle: its grip from what it touched last substep (1 = none). */
  private readonly contactW: Float32Array;
  private readonly cA: Uint32Array;
  private readonly cB: Uint32Array;
  private readonly rest: Float32Array;
  private readonly stiff: Float32Array;
  /** Index where the structural constraints end (they come first). */
  private readonly structuralCount: number;

  colliders: Collider[] = [];
  floorY = 0;
  /** Colliders' grip applies (off for a pull: the sheet should slide off). */
  gripping = true;
  gravity: number;
  damping: number;
  iterations: number;
  substeps: number;
  thickness: number;
  friction: number;

  /** The flat sheet as it started (reset() puts it back). */
  private readonly initPos: Float32Array;
  /** The flat sheet at its true size (slackX applied); rest lengths and tethers are measured on it. */
  private readonly restPos: Float32Array;
  /**
   * While held: each particle's longest allowed distance from the hand (its
   * distance across the flat sheet, times TETHER_SLACK). Keeps a fast yank
   * from stretching the sheet however few constraint passes run.
   */
  private tether: Float32Array | null = null;

  // The grab (a hand holding a bunch of the sheet)
  private grabbed: Uint32Array = new Uint32Array(0);
  private grabOffsets: Float32Array = new Float32Array(0);
  private grabFrom: Vec3 = { x: 0, y: 0, z: 0 };
  private grabTo: Vec3 = { x: 0, y: 0, z: 0 };
  private gatherFrom = 1;
  private gatherTo = 1;

  constructor(o: ClothOptions) {
    this.cols = Math.max(2, Math.round(o.sizeX / o.spacing) + 1);
    this.rows = Math.max(2, Math.round(o.sizeZ / o.spacing) + 1);
    this.count = this.cols * this.rows;
    this.gravity = o.gravity ?? 980;
    this.damping = o.damping ?? 0.992;
    this.iterations = o.iterations ?? 6;
    this.substeps = o.substeps ?? 2;
    this.thickness = o.thickness ?? 1.5;
    this.friction = o.friction ?? 0.35;

    const dx = o.sizeX / (this.cols - 1);
    const dz = o.sizeZ / (this.rows - 1);
    this.pos = new Float32Array(this.count * 3);
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const k = (j * this.cols + i) * 3;
        this.pos[k] = o.center.x - o.sizeX / 2 + i * dx;
        this.pos[k + 1] = o.center.y;
        this.pos[k + 2] = o.center.z - o.sizeZ / 2 + j * dz;
      }
    }
    this.prev = this.pos.slice();
    this.initPos = this.pos.slice();
    // The sheet's true shape (rest lengths and tethers are measured on it)
    this.restPos = this.pos.slice();
    const slack = o.slackX ?? 1;
    for (let p = 0; p < this.restPos.length; p += 3) {
      this.restPos[p] = o.center.x + (this.restPos[p] - o.center.x) * slack;
    }
    this.invMass = new Float32Array(this.count).fill(1);
    this.contactW = new Float32Array(this.count).fill(1);

    const a: number[] = [];
    const b: number[] = [];
    const s: number[] = [];
    const id = (i: number, j: number) => j * this.cols + i;
    const add = (p: number, q: number, k: number) => {
      a.push(p);
      b.push(q);
      s.push(k);
    };
    // Structural first (worstStretch reads these)
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        if (i + 1 < this.cols) add(id(i, j), id(i + 1, j), 1);
        if (j + 1 < this.rows) add(id(i, j), id(i, j + 1), 1);
      }
    }
    this.structuralCount = a.length;
    const shear = o.shear ?? 0.6;
    const bend = o.bend ?? 0.12;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        if (i + 1 < this.cols && j + 1 < this.rows) {
          add(id(i, j), id(i + 1, j + 1), shear);
          add(id(i + 1, j), id(i, j + 1), shear);
        }
        if (i + 2 < this.cols) add(id(i, j), id(i + 2, j), bend);
        if (j + 2 < this.rows) add(id(i, j), id(i, j + 2), bend);
      }
    }
    this.cA = Uint32Array.from(a);
    this.cB = Uint32Array.from(b);
    this.stiff = Float32Array.from(s);
    this.rest = new Float32Array(a.length);
    const r = this.restPos;
    for (let c = 0; c < a.length; c++) {
      const p = a[c] * 3;
      const q = b[c] * 3;
      this.rest[c] = Math.hypot(r[q] - r[p], r[q + 1] - r[p + 1], r[q + 2] - r[p + 2]);
    }
  }

  /** Particle index of grid point (i along x, j along z). */
  index(i: number, j: number): number {
    return j * this.cols + i;
  }

  /** Advance `dt` seconds. */
  step(dt: number): void {
    const n = this.substeps;
    const h = dt / n;
    const g = -this.gravity * h * h;
    const { pos, prev, invMass } = this;
    for (let s = 0; s < n; s++) {
      // A held bunch moves with the hand, spread evenly over the substeps
      let cx = 0;
      let cy = 0;
      let cz = 0;
      if (this.grabbed.length) {
        const f = (s + 1) / n;
        cx = this.grabFrom.x + (this.grabTo.x - this.grabFrom.x) * f;
        cy = this.grabFrom.y + (this.grabTo.y - this.grabFrom.y) * f;
        cz = this.grabFrom.z + (this.grabTo.z - this.grabFrom.z) * f;
        const gather = this.gatherFrom + (this.gatherTo - this.gatherFrom) * f;
        for (let k = 0; k < this.grabbed.length; k++) {
          const p = this.grabbed[k] * 3;
          prev[p] = pos[p];
          prev[p + 1] = pos[p + 1];
          prev[p + 2] = pos[p + 2];
          pos[p] = cx + this.grabOffsets[k * 3] * gather;
          pos[p + 1] = cy + this.grabOffsets[k * 3 + 1] * gather;
          pos[p + 2] = cz + this.grabOffsets[k * 3 + 2] * gather;
        }
      }
      // Integrate
      for (let k = 0; k < this.count; k++) {
        if (invMass[k] === 0) continue;
        const p = k * 3;
        const vx = (pos[p] - prev[p]) * this.damping;
        const vy = (pos[p + 1] - prev[p + 1]) * this.damping;
        const vz = (pos[p + 2] - prev[p + 2]) * this.damping;
        prev[p] = pos[p];
        prev[p + 1] = pos[p + 1];
        prev[p + 2] = pos[p + 2];
        pos[p] += vx;
        pos[p + 1] += vy + g;
        pos[p + 2] += vz;
      }
      for (let it = 0; it < this.iterations; it++) this.solveConstraints();
      if (this.tether) this.applyTethers(cx, cy, cz);
      this.collide();
    }
    this.grabFrom = { ...this.grabTo };
    this.gatherFrom = this.gatherTo;
  }

  private solveConstraints(): void {
    const { pos, invMass, contactW, cA, cB, rest, stiff } = this;
    for (let c = 0; c < cA.length; c++) {
      const a = cA[c];
      const b = cB[c];
      const wa = invMass[a] * contactW[a];
      const wb = invMass[b] * contactW[b];
      const w = wa + wb;
      if (w === 0) continue;
      const p = a * 3;
      const q = b * 3;
      const dx = pos[q] - pos[p];
      const dy = pos[q + 1] - pos[p + 1];
      const dz = pos[q + 2] - pos[p + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d === 0) continue;
      const k = ((d - rest[c]) / (d * w)) * stiff[c];
      pos[p] += dx * wa * k;
      pos[p + 1] += dy * wa * k;
      pos[p + 2] += dz * wa * k;
      pos[q] -= dx * wb * k;
      pos[q + 1] -= dy * wb * k;
      pos[q + 2] -= dz * wb * k;
    }
  }

  private applyTethers(cx: number, cy: number, cz: number): void {
    const { pos, invMass } = this;
    const tether = this.tether!;
    for (let k = 0; k < this.count; k++) {
      if (invMass[k] === 0) continue;
      const p = k * 3;
      const dx = pos[p] - cx;
      const dy = pos[p + 1] - cy;
      const dz = pos[p + 2] - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const max = tether[k];
      if (d <= max || d === 0) continue;
      const f = max / d;
      pos[p] = cx + dx * f;
      pos[p + 1] = cy + dy * f;
      pos[p + 2] = cz + dz * f;
    }
  }

  private collide(): void {
    const { pos, prev, invMass, contactW, thickness: t, friction } = this;
    const eps = 0.25;
    for (let k = 0; k < this.count; k++) {
      contactW[k] = 1;
      if (invMass[k] === 0) continue;
      const p = k * 3;
      // Floor
      if (pos[p + 1] < this.floorY + t) {
        pos[p + 1] = this.floorY + t;
        prev[p] += (pos[p] - prev[p]) * friction;
        prev[p + 2] += (pos[p + 2] - prev[p + 2]) * friction;
      }
      for (const c of this.colliders) {
        const x = pos[p];
        const y = pos[p + 1];
        const z = pos[p + 2];
        if (
          x < c.min.x - t || x > c.max.x + t ||
          y < c.min.y - t || y > c.max.y + t ||
          z < c.min.z - t || z > c.max.z + t
        ) {
          continue;
        }
        const d = c.sdf(x, y, z);
        if (d >= t) continue;
        let nx = c.sdf(x + eps, y, z) - c.sdf(x - eps, y, z);
        let ny = c.sdf(x, y + eps, z) - c.sdf(x, y - eps, z);
        let nz = c.sdf(x, y, z + eps) - c.sdf(x, y, z - eps);
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nl === 0) {
          nx = 0;
          ny = 1;
          nz = 0;
        } else {
          nx /= nl;
          ny /= nl;
          nz /= nl;
        }
        if (this.gripping && c.grip !== undefined) contactW[k] = Math.min(contactW[k], c.grip);
        const push = t - d;
        pos[p] = x + nx * push;
        pos[p + 1] = y + ny * push;
        pos[p + 2] = z + nz * push;
        // Friction: lose a share of the motion along the surface
        const vx = pos[p] - prev[p];
        const vy = pos[p + 1] - prev[p + 1];
        const vz = pos[p + 2] - prev[p + 2];
        const vn = vx * nx + vy * ny + vz * nz;
        prev[p] += (vx - nx * vn) * friction;
        prev[p + 1] += (vy - ny * vn) * friction;
        prev[p + 2] += (vz - nz * vn) * friction;
      }
    }
  }

  /**
   * Run until it comes to rest (no particle moving faster than `restSpeed`
   * units / s) or `maxSeconds` pass. Returns the seconds simulated.
   */
  settle(maxSeconds = 3, dt = 1 / 60, restSpeed = 4): number {
    // Only the rest shape matters, not how it got there: heavy damping kills
    // the swinging fast, and fewer passes per step keep it cheap
    const keep = { damping: this.damping, iterations: this.iterations, substeps: this.substeps };
    this.damping = 0.94;
    this.iterations = Math.min(this.iterations, 6);
    this.substeps = 1;
    const before = new Float32Array(this.pos.length);
    let t = 0;
    while (t < maxSeconds) {
      before.set(this.pos);
      this.step(dt);
      t += dt;
      let fastest = 0;
      for (let p = 0; p < this.pos.length; p += 3) {
        const d = Math.hypot(this.pos[p] - before[p], this.pos[p + 1] - before[p + 1], this.pos[p + 2] - before[p + 2]);
        if (d > fastest) fastest = d;
      }
      if (fastest / dt < restSpeed) break;
    }
    Object.assign(this, keep);
    // Start from rest
    this.prev.set(this.pos);
    return t;
  }

  /** Back to the flat sheet it started as, `lift` higher, at rest and let go of. */
  reset(lift = 0): void {
    this.release();
    this.pos.set(this.initPos);
    for (let p = 1; p < this.pos.length; p += 3) this.pos[p] += lift;
    this.prev.set(this.pos);
    this.contactW.fill(1);
  }

  /** The particle nearest a point. */
  nearest(at: Vec3): number {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < this.count; k++) {
      const p = k * 3;
      const d = (this.pos[p] - at.x) ** 2 + (this.pos[p + 1] - at.y) ** 2 + (this.pos[p + 2] - at.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  /**
   * Take hold of the sheet near `at`: every particle within `radius` of the
   * nearest one is held from now on, moved by setGrabTarget. Returns the
   * world point held (the nearest particle), which the hand should be at.
   */
  grab(at: Vec3, radius: number): Vec3 {
    this.release();
    const c = this.nearest(at) * 3;
    const center = { x: this.pos[c], y: this.pos[c + 1], z: this.pos[c + 2] };
    const held: number[] = [];
    const offsets: number[] = [];
    for (let k = 0; k < this.count; k++) {
      const p = k * 3;
      const ox = this.pos[p] - center.x;
      const oy = this.pos[p + 1] - center.y;
      const oz = this.pos[p + 2] - center.z;
      if (ox * ox + oy * oy + oz * oz > radius * radius) continue;
      held.push(k);
      offsets.push(ox, oy, oz);
      this.invMass[k] = 0;
    }
    this.grabbed = Uint32Array.from(held);
    this.grabOffsets = Float32Array.from(offsets);
    // Tethers: how far each particle may be from the hand, measured across
    // the flat sheet from the held particle
    const r = this.restPos;
    const tether = new Float32Array(this.count);
    for (let k = 0; k < this.count; k++) {
      const p = k * 3;
      tether[k] = Math.hypot(r[p] - r[c], r[p + 1] - r[c + 1], r[p + 2] - r[c + 2]) * TETHER_SLACK + this.thickness;
    }
    this.tether = tether;
    this.grabFrom = { ...center };
    this.grabTo = { ...center };
    this.gatherFrom = this.gatherTo = 1;
    return center;
  }

  /**
   * Where the hand is by the end of the next step(), and how tightly it
   * holds: `gather` 1 keeps the bunch as it was grabbed, smaller balls it up
   * into the fist.
   */
  setGrabTarget(center: Vec3, gather = 1): void {
    this.grabTo = { ...center };
    this.gatherTo = gather;
  }

  /** Let go. Held particles fly on with the hand's last motion. */
  release(): void {
    for (const k of this.grabbed) this.invMass[k] = 1;
    this.tether = null;
    this.grabbed = new Uint32Array(0);
    this.grabOffsets = new Float32Array(0);
  }

  get holding(): boolean {
    return this.grabbed.length > 0;
  }

  // --- measures (for checks) ---

  /** Most a neighbouring pair is stretched past its rest length (0.1 = 10%). */
  worstStretch(): number {
    let worst = 0;
    for (let c = 0; c < this.structuralCount; c++) {
      const p = this.cA[c] * 3;
      const q = this.cB[c] * 3;
      const d = Math.hypot(this.pos[q] - this.pos[p], this.pos[q + 1] - this.pos[p + 1], this.pos[q + 2] - this.pos[p + 2]);
      worst = Math.max(worst, d / this.rest[c] - 1);
    }
    return worst;
  }

  /** Deepest any particle is inside a collider (0 if none). */
  deepestPenetration(): number {
    let deepest = 0;
    for (let p = 0; p < this.pos.length; p += 3) {
      for (const c of this.colliders) {
        const d = c.sdf(this.pos[p], this.pos[p + 1], this.pos[p + 2]);
        if (d < 0) deepest = Math.max(deepest, -d);
      }
    }
    return deepest;
  }

  /** Axis-aligned bounds of the whole sheet. */
  bounds(): { min: Vec3; max: Vec3 } {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let p = 0; p < this.pos.length; p += 3) {
      min.x = Math.min(min.x, this.pos[p]);
      min.y = Math.min(min.y, this.pos[p + 1]);
      min.z = Math.min(min.z, this.pos[p + 2]);
      max.x = Math.max(max.x, this.pos[p]);
      max.y = Math.max(max.y, this.pos[p + 1]);
      max.z = Math.max(max.z, this.pos[p + 2]);
    }
    return { min, max };
  }
}
