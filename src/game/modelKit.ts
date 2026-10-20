// modelKit.ts — the CRAFT WAVE modeling standard, as code.
//
// Researched game-vehicle workflow (CRAFT_WAVE_BRIEF.md): proportions
// first, LOFTED cross-section shells (never stacked primitives), beveled
// edges, wheel arches with dark tubs, separate panels, FULL interiors,
// tinted transparent glass with the driver visible inside.
//
// Shared by Vehicles.ts (helis/tug), carModels.ts (the Stallion),
// truckModels.ts, vanModels.ts and smallModels.ts.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

export const mat = (c: number, rough = 0.75, metal = 0.15) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
export const darkTrim = () => mat(0x23272c, 0.9, 0.05);
export const chrome = () => mat(0x9aa2ac, 0.3, 0.8);
export const lampMat = () => mat(0xe8ecdf, 0.25, 0.1);
export const tailMat = () => mat(0x9e1622, 0.35, 0.1);
export const tubMat = () => mat(0x0c0d0f, 0.98, 0); // wheel tubs / dark cavities

/** Tinted, TRANSPARENT glass (the cockpit standard): the modeled interior
 *  — and the driver — read through it. */
export const glassTint = () =>
  new THREE.MeshStandardMaterial({
    color: 0x39505e, roughness: 0.08, metalness: 0.65,
    transparent: true, opacity: 0.42, side: THREE.DoubleSide,
  });

/** Darker glass for roof panels / small panes. */
export const glassDark = () =>
  new THREE.MeshStandardMaterial({
    color: 0x1d262e, roughness: 0.12, metalness: 0.6,
    transparent: true, opacity: 0.72, side: THREE.DoubleSide,
  });

// ---------------------------------------------------------------------------
// primitives with a purpose
// ---------------------------------------------------------------------------

export function box(g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

/** A strut/tube between two points (cage bars, columns, links). */
export function tube(g: THREE.Group, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, material: THREE.Material): THREE.Mesh {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), material);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  m.castShadow = true;
  g.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// lofting — the heart of the standard
// ---------------------------------------------------------------------------

export interface LoftSection { z: number; w: number; h: number; y: number }

/** Sweep elliptical cross-sections into a smooth body shell (fuselages). */
export function loftMesh(sections: LoftSection[], material: THREE.Material, arc?: [number, number]): THREE.Mesh {
  const SEG = 16;
  const a0 = arc ? arc[0] : 0;
  const a1 = arc ? arc[1] : Math.PI * 2;
  const wrap = !arc;
  const positions: number[] = [];
  const indices: number[] = [];
  sections.forEach((s) => {
    for (let i = 0; i <= SEG; i++) {
      const a = a0 + ((a1 - a0) * i) / SEG;
      positions.push(Math.cos(a) * s.w * 0.5, s.y + Math.sin(a) * s.h * 0.5, s.z);
    }
  });
  const cols = SEG + 1;
  for (let si = 0; si < sections.length - 1; si++) {
    const last = wrap ? SEG : SEG - 1;
    for (let i = 0; i <= last; i++) {
      const a = si * cols + i;
      const b = si * cols + ((i + 1) % cols);
      const c = a + cols;
      const d = b + cols;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  (material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface HullSection {
  z: number; // station along the body (+Z is the nose)
  halfW: number; // half width at this station
  yTop: number; // top edge height (centerline)
  yBot: number; // bottom edge height (centerline)
  exp?: number; // superellipse exponent override (2 = ellipse, 3-4 = slab-sided with soft corners)
}

function spow(v: number, p: number): number {
  return Math.sign(v) * Math.pow(Math.abs(v), p);
}

/**
 * Loft a vehicle body shell from cross-sections with SUPERELLIPSE rings:
 * flat flanks, rounded shoulders, a shaped top and underside — the
 * procedural equivalent of a modeled car body. `arc` limits the ring sweep
 * in parameter space (0 = +X flank, π/2 = top center, π = −X flank,
 * 3π/2 = bottom) for glass bands and roof strips that sit proud of a hull.
 */
export function hullLoft(
  sections: HullSection[],
  material: THREE.Material,
  opts: { seg?: number; exp?: number; arc?: [number, number]; capStart?: boolean; capEnd?: boolean } = {},
): THREE.Mesh {
  const SEG = opts.seg ?? 28;
  const exp = opts.exp ?? 3.1;
  const a0 = opts.arc ? opts.arc[0] : 0;
  const a1 = opts.arc ? opts.arc[1] : Math.PI * 2;
  const wrap = !opts.arc;
  const positions: number[] = [];
  const indices: number[] = [];
  sections.forEach((s) => {
    const cy = (s.yTop + s.yBot) / 2;
    const rT = s.yTop - cy;
    const rB = cy - s.yBot;
    const e = s.exp ?? exp;
    const p = 2 / e;
    for (let i = 0; i <= SEG; i++) {
      const a = a0 + ((a1 - a0) * i) / SEG;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      positions.push(s.halfW * spow(ca, p), cy + (sa >= 0 ? rT : rB) * spow(sa, p), s.z);
    }
  });
  const cols = SEG + 1;
  for (let si = 0; si < sections.length - 1; si++) {
    const last = wrap ? SEG : SEG - 1;
    for (let i = 0; i <= last; i++) {
      const a = si * cols + i;
      const b = si * cols + ((i + 1) % cols);
      const c = a + cols;
      const d = b + cols;
      indices.push(a, c, b, b, c, d);
    }
  }
  // end caps (triangle fans to the section centers) for closed hulls
  const cap = (si: number, flip: boolean) => {
    const s = sections[si];
    const cy = (s.yTop + s.yBot) / 2;
    const center = positions.length / 3;
    positions.push(0, cy, s.z);
    const base = si * cols;
    for (let i = 0; i < SEG; i++) {
      const a = base + i;
      const b = base + ((i + 1) % cols);
      if (flip) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  };
  if (!opts.arc && opts.capStart) cap(0, true);
  if (!opts.arc && opts.capEnd) cap(sections.length - 1, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// wheels — real assemblies, not discs
// ---------------------------------------------------------------------------

export type RimStyle = 'steel' | 'alloy' | 'rally' | 'offroad' | 'dually';

export interface WheelOpts {
  r: number;
  w: number;
  x: number;
  y: number;
  z: number;
  style?: RimStyle;
  tread?: 'street' | 'at' | 'chunk';
  spin: THREE.Object3D[];
  pivots?: THREE.Object3D[]; // pass for steered wheels
}

/**
 * A proper wheel: lathed tire (rounded shoulders, flat contact band),
 * tread blocks on AT/chunk tires, a styled rim with a real face.
 * The steering pivot wraps the spinning group — the drive loop's
 * spin/pivot contract is unchanged.
 */
export function makeWheel(g: THREE.Group, o: WheelOpts): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(o.x, o.y, o.z);
  g.add(pivot);
  const spinG = new THREE.Group();
  pivot.add(spinG);
  o.spin.push(spinG);
  if (o.pivots) o.pivots.push(pivot);
  const r = o.r;
  const w = o.w;
  const side = o.x >= 0 ? 1 : -1;
  // tire carcass: lathe profile (radius, axial) revolved, axis → X
  const prof: [number, number][] = [
    [r * 0.52, -w * 0.5], [r * 0.84, -w * 0.5], [r * 0.965, -w * 0.36], [r * 0.995, -w * 0.16],
    [r, 0], [r * 0.995, w * 0.16], [r * 0.965, w * 0.36], [r * 0.84, w * 0.5], [r * 0.52, w * 0.5],
  ];
  const pts = prof.map(([px, py]) => new THREE.Vector2(px, py));
  const tire = new THREE.Mesh(new THREE.LatheGeometry(pts, 30), mat(0x1b1b1e, 1, 0));
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spinG.add(tire);
  // tread blocks
  if (o.tread === 'at' || o.tread === 'chunk') {
    const n = o.tread === 'chunk' ? 16 : 20;
    const bh = o.tread === 'chunk' ? 0.055 : 0.035;
    const treadM = mat(0x17171a, 1, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const blk = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, bh, r * 0.24), treadM);
      blk.position.set(0, Math.sin(a) * (r + bh * 0.3), Math.cos(a) * (r + bh * 0.3));
      blk.rotation.x = -a;
      blk.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.18; // chevron-ish stagger
      spinG.add(blk);
    }
  }
  // rim barrel + face
  const style = o.style ?? 'alloy';
  const rimC = style === 'rally' ? 0xd8d8d2 : style === 'steel' || style === 'dually' ? 0x2c2f33 : 0x878d94;
  const rimM = mat(rimC, style === 'steel' ? 0.7 : 0.38, style === 'steel' ? 0.3 : 0.65);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.56, w * 0.72, 22), rimM);
  barrel.rotation.z = Math.PI / 2;
  barrel.castShadow = true;
  spinG.add(barrel);
  const faceX = side * w * 0.3;
  const face = new THREE.Group();
  face.position.x = faceX;
  spinG.add(face);
  if (style === 'rally') {
    // the FX look: a white disc drilled with holes
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.045, 22), rimM);
    disc.rotation.z = Math.PI / 2;
    face.add(disc);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.085, r * 0.085, 0.055, 10), tubMat());
      hole.rotation.z = Math.PI / 2;
      hole.position.set(side * 0.012, Math.sin(a) * r * 0.33, Math.cos(a) * r * 0.33);
      face.add(hole);
    }
    const capDot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.13, r * 0.13, 0.06, 12), tubMat());
    capDot.rotation.z = Math.PI / 2;
    face.add(capDot);
  } else if (style === 'alloy' || style === 'offroad') {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.04, 22), rimM);
    disc.rotation.z = Math.PI / 2;
    face.add(disc);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, r * 0.3, r * 0.16), tubMat());
      win.position.set(side * 0.012, Math.sin(a) * r * 0.3, Math.cos(a) * r * 0.3);
      win.rotation.x = -a;
      face.add(win);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.055, 12), rimM);
    hub.rotation.z = Math.PI / 2;
    face.add(hub);
  } else {
    // steel / dually: dark rim, vent slots, proud hub
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.04, 22), rimM);
    disc.rotation.z = Math.PI / 2;
    face.add(disc);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, r * 0.13, r * 0.22), tubMat());
      slot.position.set(side * 0.012, Math.sin(a) * r * 0.36, Math.cos(a) * r * 0.36);
      slot.rotation.x = -a;
      face.add(slot);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.07, 12), mat(0x3c4046, 0.55, 0.5));
    hub.rotation.z = Math.PI / 2;
    face.add(hub);
  }
  return pivot;
}

/** Dark wheel tub: a half-disc cavity behind the wheel + an arch lip. */
export function archTub(g: THREE.Group, x: number, y: number, z: number, r: number, bodyHW: number): void {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r + 0.07, 22, 0, Math.PI), tubMat());
  disc.position.set(x >= 0 ? bodyHW - 0.17 : -(bodyHW - 0.17), y, z);
  disc.rotation.y = x >= 0 ? Math.PI / 2 : -Math.PI / 2;
  // CircleGeometry theta runs in its local XY; after the Y-rotation the
  // half must face UP — rotate the geometry's local frame instead:
  disc.rotation.z = 0;
  disc.geometry = disc.geometry.clone();
  disc.geometry.rotateZ(0); // (kept explicit — half-disc spans local +Y)
  g.add(disc);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.035, 8, 20, Math.PI), tubMat());
  lip.position.set(x, y, z);
  lip.rotation.y = Math.PI / 2;
  g.add(lip);
}

// ---------------------------------------------------------------------------
// interiors — cabins are part of the model
// ---------------------------------------------------------------------------

export interface InteriorSpec2 {
  /** Interior floor top height (vehicle-local y). */
  floorY: number;
  /** Floor extent. */
  floorW: number;
  floorZFront: number;
  floorZRear: number;
  /** Seat cushion TOP height for the front row (see the seat contract). */
  cushionY: number;
  /** Driver seat center z (must match Player's placement for this id). */
  seatZ: number;
  /** Dash front face z. */
  dashZ: number;
  /** Cabin inner half width (door cards sit at ±this). */
  halfW: number;
  /** Rear bench instead of nothing behind the front row. */
  rearBench?: boolean;
  rearBenchZ?: number;
  /** Front bench (trucks) instead of buckets. */
  bench?: boolean;
  fabric?: number;
}

/** One seat: cushion, raked backrest, headrest, bolsters, rails. */
export function carSeat(g: THREE.Group, x: number, cushionTopY: number, z: number, fabric: THREE.Material, frame: THREE.Material): void {
  box(g, 0.54, 0.13, 0.55, fabric, x, cushionTopY - 0.065, z);
  box(g, 0.58, 0.05, 0.6, frame, x, cushionTopY - 0.16, z); // seat base pan
  for (const sgn of [1, -1]) {
    box(g, 0.09, 0.1, 0.5, fabric, x + sgn * 0.27, cushionTopY + 0.01, z); // cushion bolsters
    const rail = box(g, 0.06, 0.07, 0.44, frame, x + sgn * 0.18, cushionTopY - 0.23, z);
    rail.castShadow = false;
  }
  const back = box(g, 0.54, 0.72, 0.12, fabric, x, cushionTopY + 0.38, z - 0.3);
  back.rotation.x = 0.13;
  for (const sgn of [1, -1]) {
    const bol = box(g, 0.09, 0.55, 0.1, fabric, x + sgn * 0.27, cushionTopY + 0.36, z - 0.28);
    bol.rotation.x = 0.13;
  }
  const head = box(g, 0.3, 0.2, 0.1, fabric, x, cushionTopY + 0.86, z - 0.37);
  head.rotation.x = 0.13;
}

/**
 * Build a full cabin: floor tub, dash with a driver gauge cluster and
 * center screen, console, front seats, door cards — and a steering wheel
 * that TURNS. Assigns the wheel spinner to `v.steerWheel` (drive() rotates
 * it with the steer angle).
 */
export function buildInterior(
  g: THREE.Group,
  v: { steerWheel?: THREE.Object3D },
  s: InteriorSpec2,
): void {
  const dark = mat(0x1d1f23, 0.92, 0.05);
  const fabric = mat(s.fabric ?? 0x2e3134, 0.95, 0);
  const frame = mat(0x17181a, 0.85, 0.1);
  const fd = s.floorZFront - s.floorZRear;
  // floor tub + transmission tunnel
  box(g, s.floorW, 0.07, fd, dark, 0, s.floorY - 0.035, (s.floorZFront + s.floorZRear) / 2);
  box(g, 0.3, 0.1, fd * 0.7, dark, 0, s.floorY + 0.03, (s.floorZFront + s.floorZRear) / 2 - 0.1);
  // dash: main bar (slightly crowned), driver cluster hood, center screen
  const dashW = s.halfW * 2 - 0.06;
  box(g, dashW, 0.24, 0.34, dark, 0, s.cushionY + 0.52, s.dashZ);
  box(g, dashW * 0.96, 0.06, 0.4, dark, 0, s.cushionY + 0.66, s.dashZ - 0.02);
  const driverX = s.halfW * 0.44; // = W*0.21 when halfW ≈ W/2 (Player contract)
  const cluster = box(g, 0.52, 0.2, 0.1, frame, driverX, s.cushionY + 0.55, s.dashZ + 0.15);
  cluster.rotation.x = -0.35;
  const gaugeM = mat(0xb9c8ce, 0.3, 0.4);
  for (const gx of [-0.13, 0.13]) {
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 14), gaugeM);
    gauge.rotation.x = Math.PI / 2 - 0.35;
    gauge.position.set(driverX + gx, s.cushionY + 0.56, s.dashZ + 0.21);
    g.add(gauge);
  }
  const screen = box(g, 0.34, 0.22, 0.04, mat(0x0e2a33, 0.25, 0.5), -0.1, s.cushionY + 0.55, s.dashZ + 0.16);
  screen.rotation.x = -0.3;
  // vents + a dash seam line
  for (const vx of [-0.55, 0.45]) box(g, 0.2, 0.05, 0.03, frame, vx, s.cushionY + 0.6, s.dashZ + 0.18);
  // center console running back from the dash
  box(g, 0.32, 0.2, Math.max(0.4, s.seatZ + 0.3 - s.dashZ), dark, 0, s.floorY + 0.16, (s.dashZ + s.seatZ + 0.28) / 2);
  box(g, 0.1, 0.05, 0.22, frame, 0.02, s.floorY + 0.29, s.seatZ + 0.18); // shifter boot area
  // seats
  if (s.bench) {
    box(g, s.halfW * 2 - 0.3, 0.13, 0.58, fabric, 0, s.cushionY - 0.065, s.seatZ);
    const bb = box(g, s.halfW * 2 - 0.3, 0.7, 0.12, fabric, 0, s.cushionY + 0.36, s.seatZ - 0.31);
    bb.rotation.x = 0.12;
  } else {
    carSeat(g, driverX, s.cushionY, s.seatZ, fabric, frame);
    carSeat(g, -driverX, s.cushionY, s.seatZ, fabric, frame);
  }
  if (s.rearBench) {
    const bz = s.rearBenchZ ?? s.seatZ - 0.85;
    box(g, s.halfW * 2 - 0.24, 0.14, 0.55, fabric, 0, s.cushionY - 0.03, bz);
    const rb = box(g, s.halfW * 2 - 0.24, 0.62, 0.12, fabric, 0, s.cushionY + 0.32, bz - 0.3);
    rb.rotation.x = 0.12;
  }
  // door cards: inner panels with armrest + pull handle, both sides
  for (const sgn of [1, -1]) {
    box(g, 0.05, 0.62, Math.max(0.8, fd * 0.55), dark, sgn * (s.halfW - 0.02), s.cushionY + 0.22, (s.seatZ + s.dashZ) / 2 + 0.1);
    box(g, 0.06, 0.07, 0.5, frame, sgn * (s.halfW - 0.05), s.cushionY + 0.28, s.seatZ + 0.15); // armrest
    box(g, 0.03, 0.04, 0.18, chrome(), sgn * (s.halfW - 0.06), s.cushionY + 0.45, s.seatZ + 0.3); // pull
  }
  // pedals at the driver's feet
  for (const px of [0.12, 0.3]) {
    const pedal = box(g, 0.09, 0.14, 0.03, frame, driverX - 0.21 + px, s.floorY + 0.12, s.dashZ - 0.28);
    pedal.rotation.x = 0.5;
  }
  // steering wheel: tilt column + a spinner the drive loop turns
  const colGroup = new THREE.Group();
  colGroup.position.set(driverX, s.cushionY + 0.5, s.seatZ + 0.42);
  colGroup.rotation.x = -0.52; // column rake
  g.add(colGroup);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 8), frame);
  column.position.z = 0.14;
  column.rotation.x = Math.PI / 2;
  colGroup.add(column);
  const spinner = new THREE.Group();
  spinner.position.z = -0.06;
  colGroup.add(spinner);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 10, 24), mat(0x24262a, 0.8, 0.1));
  rim.castShadow = true;
  spinner.add(rim);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.17, 0.03), frame);
    const a = (i / 3) * Math.PI * 2 + Math.PI;
    spoke.position.set(Math.sin(a) * 0.09, Math.cos(a) * 0.09, 0);
    spoke.rotation.z = -a;
    spinner.add(spoke);
  }
  const hubPad = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), frame);
  hubPad.rotation.x = Math.PI / 2;
  spinner.add(hubPad);
  v.steerWheel = spinner;
}

// ---------------------------------------------------------------------------
// decals
// ---------------------------------------------------------------------------

/** Canvas-text stencil decal (nameplates, hull text). */
export function decalPlane(text: string, w: number, color = 'rgba(216,220,224,0.92)', fontPx = 46): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = color;
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, (w * 96) / 512),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  return m;
}

/** Honeycomb grille texture (canvas) — the pickup sheet's signature. */
export function honeycombMat(w = 128): THREE.Material {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = w;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#101215';
  ctx.fillRect(0, 0, w, w);
  ctx.strokeStyle = '#4a5058';
  ctx.lineWidth = 2;
  const s = 11;
  for (let row = 0; row * s * 0.87 < w + s; row++) {
    for (let col = 0; col * s < w + s; col++) {
      const cx = col * s * 1.5 + (row % 2 ? s * 0.75 : 0);
      const cy = row * s * 0.87;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const px = cx + Math.cos(a) * s * 0.48;
        const py = cy + Math.sin(a) * s * 0.48;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.3 });
}
