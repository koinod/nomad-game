// smallModels.ts — the small craft at the CRAFT WAVE standard
// (CRAFT_WAVE_BRIEF.md): lofted shells, tube frames, real wheel
// assemblies from modelKit — no stacked-box builds.
//
// System contracts preserved from the old Vehicles.ts builders
// (buildBike / buildSkiff / the marsh_buggy branch of buildCarBody):
// wheel radii / positions / widths, the steered-axle pivot + spin
// registrations, and v.wheelR — the drive loop depends on all of them.
// +Z is the nose everywhere.
//
// Rider/driver placement contracts (Player.ts driveUpdate):
//   buggy  — seat cushion top 0.74 at z 0.11, driver x = W*0.21
//   atv    — saddle top 0.95 at z -0.05 (rider hips land at 1.04)
//   bikes  — seat top 0.92 at z -0.3 (rider hips at 0.98)
//   skiff  — helm bench cushion top 0.52 at (0.3, -0.6)

import * as THREE from 'three';
import {
  box, carSeat, chrome, darkTrim, glassDark, hullLoft, lampMat, makeWheel, mat, tailMat, tube,
} from './modelKit';
import type { Vehicle, VehicleDef } from './Vehicles';

// ---------------------------------------------------------------------------
// Marsh Buggy — open tube-frame buggy on balloon tires (Stitch ref:
// orange, huge balloons, full roll cage, no doors, no roof)
// ---------------------------------------------------------------------------

export function buildMarshBuggy(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const body = mat(def.color, 0.5, 0.35); // safety orange
  const bodyDS = body.clone();
  bodyDS.side = THREE.DoubleSide;
  const dark = darkTrim();
  const cageM = mat(0x2a2a2e, 0.55, 0.45);
  const fabric = mat(0x24262a, 0.95, 0);
  const frame = mat(0x17181a, 0.85, 0.1);

  // --- floor pan + side pods + shaped nose cowl
  box(g, W * 0.94, 0.16, L * 0.92, body, 0, 0.5, -0.05); // floor pan
  box(g, W * 0.9, 0.06, L * 0.5, dark, 0, 0.4, -0.2); // under-tray
  for (const sgn of [1, -1]) {
    box(g, 0.3, 0.3, L * 0.52, body, sgn * (W / 2 - 0.16), 0.66, -0.15); // side pods
    box(g, 0.34, 0.05, 0.9, dark, sgn * (W / 2 - 0.1), 0.34, 0.1); // running boards
  }
  // nose cowl: a small lofted shell, sloped down to the front bumper line
  g.add(hullLoft([
    { z: 1.80, halfW: 0.52, yTop: 0.60, yBot: 0.34 },
    { z: 1.55, halfW: 0.74, yTop: 0.74, yBot: 0.30 },
    { z: 1.20, halfW: 0.85, yTop: 0.84, yBot: 0.28 },
    { z: 0.85, halfW: 0.88, yTop: 0.86, yBot: 0.28 },
    { z: 0.62, halfW: 0.88, yTop: 0.84, yBot: 0.30 },
  ], body, { capStart: true, capEnd: true }));
  box(g, W * 0.52, 0.13, 0.05, dark, 0, 0.56, L * 0.5); // grille slot
  for (const sgn of [1, -1]) {
    const lamp = box(g, 0.21, 0.1, 0.05, lampMat(), sgn * W * 0.27, 0.72, 1.79);
    lamp.castShadow = false;
    // minimal fender blades over the balloons
    const fen = box(g, 0.56, 0.06, 1.06, body, sgn * (W / 2 - 0.07), 1.0, L * 0.32);
    fen.rotation.x = 0.04;
    const fenR = box(g, 0.56, 0.06, 1.06, body, sgn * (W / 2 - 0.07), 1.0, -L * 0.32);
    fenR.rotation.x = -0.04;
  }

  // --- FULL roll cage from tubes: front hoop, main hoop, roof bars,
  // downbars to the rear deck, dash bar, rear crossbar. Roof bars sit
  // at y 1.95 — clear of the seated driver's head (1.78).
  const X = 0.82; // cage half width
  for (const sgn of [1, -1]) {
    tube(g, sgn * X, 0.58, 0.72, sgn * X, 1.95, 0.42, 0.045, cageM); // front hoop legs (raked)
    tube(g, sgn * X, 0.58, -0.5, sgn * X, 1.95, -0.5, 0.045, cageM); // main hoop legs
    tube(g, sgn * X, 1.95, 0.42, sgn * X, 1.95, -0.5, 0.045, cageM); // roof bars
    tube(g, sgn * X, 1.95, -0.5, sgn * (X + 0.03), 0.6, -1.5, 0.045, cageM); // rear downbars
    tube(g, sgn * X, 0.6, -1.5, sgn * X, 0.6, -0.5, 0.04, cageM); // rear low rails
    tube(g, sgn * X, 0.58, 0.72, sgn * X, 0.58, -0.5, 0.04, cageM); // sill bars
    tube(g, sgn * X, 1.95, -0.5, sgn * X, 0.9, 0.1, 0.035, cageM); // harness diagonals
  }
  tube(g, -X, 1.95, 0.42, X, 1.95, 0.42, 0.045, cageM); // front crossbar
  tube(g, -X, 1.95, -0.5, X, 1.95, -0.5, 0.045, cageM); // main crossbar
  tube(g, -X, 1.45, 0.56, X, 1.45, 0.56, 0.04, cageM); // dash bar
  tube(g, -(X + 0.03), 0.6, -1.5, X + 0.03, 0.6, -1.5, 0.04, cageM); // rear crossbar
  // light bar on the cage brow
  box(g, 0.95, 0.07, 0.07, dark, 0, 2.02, 0.44);
  for (const lx of [-0.32, 0, 0.32]) {
    const pod = box(g, 0.17, 0.12, 0.05, lampMat(), lx, 2.02, 0.49);
    pod.castShadow = false;
  }

  // --- cockpit: two bucket seats (kit), dash panel + gauge pods, and a
  // hand-built steering wheel on the buildInterior pattern — column
  // group raked -0.52, spinner child assigned to v.steerWheel.
  carSeat(g, W * 0.21, 0.74, 0.11, fabric, frame); // driver
  carSeat(g, -W * 0.21, 0.74, 0.11, fabric, frame); // passenger
  box(g, W * 0.78, 0.09, 0.26, dark, 0, 1.08, 0.68); // dash panel
  box(g, W * 0.78, 0.2, 0.05, dark, 0, 0.94, 0.78); // dash face
  const gaugeM = mat(0xb9c8ce, 0.3, 0.4);
  for (const gx of [-0.11, 0.11]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.09, 12), frame);
    pod.rotation.x = Math.PI / 2 - 0.4;
    pod.position.set(W * 0.21 + gx, 1.16, 0.66);
    g.add(pod);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12), gaugeM);
    face.rotation.x = Math.PI / 2 - 0.4;
    face.position.set(W * 0.21 + gx, 1.175, 0.7);
    g.add(face);
  }
  box(g, 0.3, 0.16, 0.5, dark, 0, 0.62, 0.35); // center tunnel / shifter hump
  const colGroup = new THREE.Group();
  colGroup.position.set(W * 0.21, 1.24, 0.55);
  colGroup.rotation.x = -0.52; // column rake (buildInterior pattern)
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

  // --- rear deck: exposed engine block, exhaust stack, spare balloon
  // strapped to the rear cage (static mesh — NOT a rolling wheel)
  box(g, W * 0.58, 0.42, 0.55, dark, 0, 0.84, -L * 0.37);
  box(g, W * 0.4, 0.1, 0.4, frame, 0, 1.1, -L * 0.37); // airbox lid
  const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8), chrome());
  exh.rotation.x = 0.5;
  exh.position.set(W * 0.3, 1.12, -L * 0.45);
  exh.castShadow = true;
  g.add(exh);
  const spare = new THREE.Group();
  spare.position.set(0, 1.18, -L * 0.47);
  spare.rotation.x = 0.35;
  const sTire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), mat(0x1b1b1e, 1, 0));
  sTire.rotation.x = Math.PI / 2;
  sTire.castShadow = true;
  const sHub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12), mat(0x878d94, 0.38, 0.65));
  sHub.rotation.x = Math.PI / 2;
  spare.add(sTire, sHub);
  g.add(spare);

  // --- wheels: balloon tires, front steered (contract at the top)
  for (const sgn of [1, -1]) {
    makeWheel(g, { r: 0.46, w: 0.44, x: sgn * (W / 2 - 0.07), y: 0.46, z: L * 0.32, style: 'offroad', tread: 'chunk', spin: v.wheelSpin, pivots: v.wheelPivots });
    makeWheel(g, { r: 0.46, w: 0.44, x: sgn * (W / 2 - 0.07), y: 0.46, z: -L * 0.32, style: 'offroad', tread: 'chunk', spin: v.wheelSpin });
  }
  v.wheelR = 0.46;
}

// ---------------------------------------------------------------------------
// ATV — quad: shaped body, fenders over every wheel, tube racks,
// long saddle, handlebars (no steering wheel)
// ---------------------------------------------------------------------------

export function buildATV(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const body = mat(def.color, 0.65, 0.15); // olive drab
  const bodyDS = body.clone();
  bodyDS.side = THREE.DoubleSide;
  const dark = darkTrim();
  const steel = mat(0x2b2f36, 0.5, 0.5);
  const vinyl = mat(0x1e1e22, 0.95, 0);

  // --- central body: a lofted spine, nose high, tail tucked
  g.add(hullLoft([
    { z: 1.04, halfW: 0.26, yTop: 0.68, yBot: 0.44 },
    { z: 0.82, halfW: 0.42, yTop: 0.80, yBot: 0.36 },
    { z: 0.35, halfW: 0.47, yTop: 0.78, yBot: 0.33 },
    { z: -0.3, halfW: 0.46, yTop: 0.74, yBot: 0.33 },
    { z: -0.85, halfW: 0.43, yTop: 0.72, yBot: 0.36 },
    { z: -1.04, halfW: 0.34, yTop: 0.66, yBot: 0.44 },
  ], body, { capStart: true, capEnd: true }));
  box(g, 0.5, 0.22, 0.6, dark, 0, 0.42, -0.05); // engine / driveline mass
  // front pod: headlights + a small grille between the front fenders
  box(g, 0.52, 0.16, 0.1, body, 0, 0.74, 0.92);
  for (const sgn of [1, -1]) {
    const lamp = box(g, 0.15, 0.09, 0.05, lampMat(), sgn * 0.16, 0.76, 0.98);
    lamp.castShadow = false;
  }
  const tail = box(g, 0.16, 0.07, 0.04, tailMat(), 0, 0.68, -1.05);
  tail.castShadow = false;

  // --- long saddle: top 0.95 at the rider's z -0.05, stepped down to
  // the tank spine at the front
  box(g, 0.48, 0.15, 1.05, vinyl, 0, 0.875, -0.28); // main saddle (top 0.95)
  const noseSeat = box(g, 0.4, 0.12, 0.4, vinyl, 0, 0.85, 0.32);
  noseSeat.rotation.x = 0.1;
  box(g, 0.44, 0.1, 0.3, vinyl, 0, 0.9, -0.88); // rear passenger step

  // --- shaped fenders: lofted half-shells over each wheel + splash sides
  for (const [sx, sz] of [[-1, 0.7], [1, 0.7], [-1, -0.7], [1, -0.7]] as [number, number][]) {
    const fg = new THREE.Group();
    fg.position.set(sx * 0.52, 0, sz);
    g.add(fg);
    fg.add(hullLoft([
      { z: -0.48, halfW: 0.21, yTop: 0.74, yBot: 0.5 },
      { z: -0.2, halfW: 0.22, yTop: 0.82, yBot: 0.5 },
      { z: 0.2, halfW: 0.22, yTop: 0.82, yBot: 0.5 },
      { z: 0.48, halfW: 0.21, yTop: 0.74, yBot: 0.5 },
    ], bodyDS, { arc: [0, Math.PI], seg: 14 }));
    box(fg, 0.05, 0.22, 0.85, body, sx * 0.2, 0.58, 0); // outer splash drop
  }

  // --- cargo racks: welded tube frames, front + rear
  const rack = (zc: number) => {
    const y = 0.9;
    const hw = 0.5;
    const hd = 0.2;
    tube(g, -hw, y, zc - hd, hw, y, zc - hd, 0.02, steel);
    tube(g, -hw, y, zc + hd, hw, y, zc + hd, 0.02, steel);
    tube(g, -hw, y, zc - hd, -hw, y, zc + hd, 0.02, steel);
    tube(g, hw, y, zc - hd, hw, y, zc + hd, 0.02, steel);
    for (let i = -1; i <= 1; i++) tube(g, i * 0.25, y, zc - hd, i * 0.25, y, zc + hd, 0.016, steel);
    for (const sgn of [1, -1]) tube(g, sgn * 0.42, y - 0.14, zc, sgn * 0.48, y, zc, 0.016, steel); // legs
  };
  rack(0.9);
  rack(-0.9);

  // --- handlebars on a steering column, grips, thumb pod (NO wheel)
  tube(g, 0, 0.72, 0.58, 0, 1.04, 0.46, 0.035, steel); // column
  tube(g, -0.31, 1.05, 0.45, 0.31, 1.05, 0.45, 0.024, steel); // bar
  tube(g, -0.31, 1.05, 0.45, -0.36, 1.03, 0.38, 0.024, steel); // pullbacks
  tube(g, 0.31, 1.05, 0.45, 0.36, 1.03, 0.38, 0.024, steel);
  for (const sgn of [1, -1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 8), vinyl);
    grip.rotation.z = Math.PI / 2;
    grip.rotation.y = sgn * 0.2;
    grip.position.set(sgn * 0.38, 1.025, 0.36);
    grip.castShadow = true;
    g.add(grip);
  }
  box(g, 0.2, 0.09, 0.14, dark, 0, 1.0, 0.5); // instrument pod

  // --- floorboards, snorkel + exhaust stack
  for (const sgn of [1, -1]) {
    box(g, 0.3, 0.05, 0.85, dark, sgn * 0.5, 0.34, 0); // floorboards (old offset)
    box(g, 0.06, 0.18, 0.7, dark, sgn * 0.36, 0.44, 0); // inner splash guards
  }
  tube(g, 0.26, 0.7, 0.55, 0.3, 1.12, 0.5, 0.035, dark); // snorkel riser
  box(g, 0.11, 0.06, 0.11, dark, 0.3, 1.14, 0.5); // snorkel head
  const muffler = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.5, 10), mat(0x4a4f55, 0.45, 0.6));
  muffler.rotation.x = Math.PI / 2 - 0.18;
  muffler.position.set(0.27, 0.58, -0.78);
  muffler.castShadow = true;
  g.add(muffler);
  tube(g, 0.2, 0.4, -0.3, 0.26, 0.52, -0.58, 0.032, steel); // exhaust header

  // --- wheels: exact old offsets, front steered
  for (const [sx, sz] of [[-1, 0.7], [1, 0.7], [-1, -0.7], [1, -0.7]] as [number, number][]) {
    makeWheel(g, {
      r: 0.32, w: 0.24, x: sx * 0.52, y: 0.32, z: sz, style: 'steel', tread: 'chunk',
      spin: v.wheelSpin, pivots: sz > 0 ? v.wheelPivots : undefined,
    });
  }
  v.wheelR = 0.32;
}

// ---------------------------------------------------------------------------
// Bikes — shared spine: fork + swingarm tubes, lofted tank, seat at the
// contract height. Sportbike wears a fairing; motocross wears knobs,
// a high fender and a number plate.
// ---------------------------------------------------------------------------

function bikeForkAndBars(g: THREE.Group, frontZ: number, headY: number, barY: number, barZ: number, forkM: THREE.Material): void {
  for (const sgn of [1, -1]) {
    // angled front fork: steering head down to the front axle
    tube(g, sgn * 0.07, headY, frontZ - 0.2, sgn * 0.07, 0.34, frontZ, 0.028, forkM);
    tube(g, sgn * 0.07, headY - 0.22, frontZ - 0.13, sgn * 0.07, 0.34, frontZ, 0.034, chrome()); // slider
    // swingarm to the rear axle
    tube(g, sgn * 0.08, 0.52, -0.25, sgn * 0.08, 0.36, -frontZ, 0.024, forkM);
  }
  // handlebar + grips
  tube(g, -0.26, barY, barZ, 0.26, barY, barZ, 0.022, forkM);
  for (const sgn of [1, -1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 8), mat(0x17181a, 0.9, 0));
    grip.rotation.z = Math.PI / 2;
    grip.position.set(sgn * 0.3, barY, barZ);
    g.add(grip);
  }
}

export function buildSportbike(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const body = mat(def.color, 0.35, 0.45);
  const dark = darkTrim();
  const steel = mat(0x2b2f36, 0.5, 0.5);
  const vinyl = mat(0x1e1e22, 0.95, 0);

  // engine + frame cradle low between the wheels
  box(g, 0.3, 0.3, 0.7, mat(0x3c4046, 0.5, 0.6), 0, 0.45, -0.02);
  for (const sgn of [1, -1]) tube(g, sgn * 0.1, 0.92, 0.55, sgn * 0.1, 0.5, -0.3, 0.026, steel); // frame spars
  bikeForkAndBars(g, 0.8, 1.02, 1.04, 0.5, steel);

  // nose fairing: a lofted wedge wrapping the front, twin lamps inset
  g.add(hullLoft([
    { z: 0.88, halfW: 0.07, yTop: 0.9, yBot: 0.66 },
    { z: 0.68, halfW: 0.18, yTop: 1.0, yBot: 0.55 },
    { z: 0.45, halfW: 0.21, yTop: 1.03, yBot: 0.5 },
    { z: 0.28, halfW: 0.19, yTop: 1.0, yBot: 0.55 },
  ], body, { capStart: true, capEnd: true }));
  for (const sgn of [1, -1]) {
    const lamp = box(g, 0.13, 0.06, 0.04, lampMat(), sgn * 0.08, 0.88, 0.86);
    lamp.rotation.x = 0.35;
    lamp.castShadow = false;
    box(g, 0.2, 0.34, 0.55, body, sgn * 0.13, 0.6, 0.32); // lower fairing cheeks
  }
  const screen = box(g, 0.3, 0.26, 0.03, glassDark(), 0, 1.14, 0.52);
  screen.rotation.x = -0.52; // windscreen

  // fuel tank loft flowing into the seat
  g.add(hullLoft([
    { z: 0.42, halfW: 0.13, yTop: 0.99, yBot: 0.74 },
    { z: 0.15, halfW: 0.165, yTop: 1.01, yBot: 0.7 },
    { z: -0.12, halfW: 0.15, yTop: 0.98, yBot: 0.7 },
    { z: -0.3, halfW: 0.12, yTop: 0.94, yBot: 0.74 },
  ], body, { capStart: true, capEnd: true }));
  box(g, 0.26, 0.08, 0.55, vinyl, 0, 0.88, -0.3); // seat — top 0.92 at z -0.3
  // raised tail loft with an inset tail light
  g.add(hullLoft([
    { z: -0.5, halfW: 0.12, yTop: 0.97, yBot: 0.82 },
    { z: -0.7, halfW: 0.1, yTop: 1.01, yBot: 0.86 },
    { z: -0.86, halfW: 0.045, yTop: 1.03, yBot: 0.94 },
  ], body, { capStart: true, capEnd: true }));
  const tl = box(g, 0.12, 0.05, 0.03, tailMat(), 0, 0.99, -0.87);
  tl.castShadow = false;
  // low exhaust: header sweep + chrome muffler on the right
  tube(g, 0.1, 0.42, 0.35, 0.15, 0.36, -0.1, 0.035, steel);
  const muff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 10), chrome());
  muff.rotation.x = Math.PI / 2 - 0.08;
  muff.position.set(0.17, 0.42, -0.42);
  muff.castShadow = true;
  g.add(muff);
  for (const sgn of [1, -1]) box(g, 0.05, 0.03, 0.16, dark, sgn * 0.14, 0.52, -0.05); // rearsets

  // wheels — old positions exactly; front steered
  makeWheel(g, { r: 0.32, w: 0.1, x: 0, y: 0.32, z: 0.8, style: 'alloy', tread: 'street', spin: v.wheelSpin, pivots: v.wheelPivots });
  makeWheel(g, { r: 0.32, w: 0.14, x: 0, y: 0.32, z: -0.8, style: 'alloy', tread: 'street', spin: v.wheelSpin });
  v.wheelR = 0.32;
}

export function buildMotocross(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const body = mat(def.color, 0.55, 0.25);
  const dark = darkTrim();
  const steel = mat(0x2b2f36, 0.5, 0.5);
  const vinyl = mat(0x1e1e22, 0.95, 0);

  // engine + skid plate, slim frame
  box(g, 0.3, 0.26, 0.55, mat(0x3c4046, 0.5, 0.6), 0, 0.48, 0);
  box(g, 0.34, 0.05, 0.6, dark, 0, 0.32, 0); // skid plate
  for (const sgn of [1, -1]) tube(g, sgn * 0.09, 0.95, 0.55, sgn * 0.09, 0.52, -0.2, 0.024, steel);
  bikeForkAndBars(g, 0.82, 1.08, 1.12, 0.6, steel);
  box(g, 0.17, 0.05, 0.17, vinyl, 0, 1.13, 0.6); // bar pad

  // slim tank loft + radiator shrouds angled off its flanks
  g.add(hullLoft([
    { z: 0.5, halfW: 0.11, yTop: 0.96, yBot: 0.72 },
    { z: 0.25, halfW: 0.14, yTop: 0.99, yBot: 0.68 },
    { z: -0.02, halfW: 0.125, yTop: 0.96, yBot: 0.68 },
    { z: -0.2, halfW: 0.1, yTop: 0.93, yBot: 0.72 },
  ], body, { capStart: true, capEnd: true }));
  for (const sgn of [1, -1]) {
    const shroud = box(g, 0.04, 0.3, 0.42, body, sgn * 0.17, 0.82, 0.3);
    shroud.rotation.z = -sgn * 0.25;
    shroud.rotation.x = 0.1;
    box(g, 0.05, 0.03, 0.18, dark, sgn * 0.15, 0.55, -0.02); // pegs
  }
  // long flat seat — top 0.92, running tank-to-tail through z -0.3
  box(g, 0.24, 0.07, 1.0, vinyl, 0, 0.885, -0.3);
  // high front fender over the knobby + number plate on the fork
  const ff = box(g, 0.32, 0.045, 0.55, body, 0, 0.84, 0.84);
  ff.rotation.x = -0.28;
  box(g, 0.05, 0.3, 0.4, body, -0.14, 0.62, 0.8).rotation.x = -0.2; // fork guards
  box(g, 0.05, 0.3, 0.4, body, 0.14, 0.62, 0.8).rotation.x = -0.2;
  const plate = box(g, 0.3, 0.34, 0.035, mat(0xe8e8e2, 0.6, 0), 0, 1.0, 0.78);
  plate.rotation.x = -0.18; // number plate
  // kicked-up rear fender + tail light nub
  const rf = box(g, 0.28, 0.045, 0.5, body, 0, 0.98, -0.82);
  rf.rotation.x = 0.42;
  const tl = box(g, 0.1, 0.04, 0.03, tailMat(), 0, 1.06, -0.98);
  tl.rotation.x = 0.42;
  tl.castShadow = false;
  // high exhaust sweeping up the right side to a rear muffler
  tube(g, 0.1, 0.45, 0.3, 0.15, 0.62, -0.25, 0.032, steel);
  const muff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.5, 10), mat(0x6a7076, 0.4, 0.6));
  muff.rotation.x = Math.PI / 2 - 0.3;
  muff.position.set(0.15, 0.8, -0.62);
  muff.castShadow = true;
  g.add(muff);

  // wheels — old positions exactly; front steered
  makeWheel(g, { r: 0.36, w: 0.13, x: 0, y: 0.36, z: 0.82, style: 'steel', tread: 'chunk', spin: v.wheelSpin, pivots: v.wheelPivots });
  makeWheel(g, { r: 0.36, w: 0.14, x: 0, y: 0.36, z: -0.82, style: 'steel', tread: 'chunk', spin: v.wheelSpin });
  v.wheelR = 0.36;
}

// ---------------------------------------------------------------------------
// Skiff — shaped V-hull center-console boat. The old buildSkiff
// registered NOTHING (no spin/pivot/wheelR writes — makeVehicle's
// default wheelR stands), so this builder registers nothing either.
// ---------------------------------------------------------------------------

export function buildSkiff(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  void v; // contract: no registrations (see header)
  const hullM = mat(def.color, 0.7, 0.15);
  hullM.side = THREE.DoubleSide;
  const wood = mat(0x6b4a2f, 0.9, 0);
  const dark = darkTrim();
  const L = def.length; // 5.5
  const W = def.width; // 2.0

  // --- V-hull loft: bottom dips to -0.35 amidships, the bow rises
  // and narrows, the transom stays broad and flat. Gunwale ~0.55.
  g.add(hullLoft([
    { z: -L / 2, halfW: 0.9, yTop: 0.55, yBot: -0.08 },
    { z: -2.0, halfW: 0.98, yTop: 0.55, yBot: -0.3 },
    { z: -0.8, halfW: W / 2, yTop: 0.55, yBot: -0.35 },
    { z: 0.6, halfW: W / 2, yTop: 0.56, yBot: -0.35 },
    { z: 1.6, halfW: 0.94, yTop: 0.58, yBot: -0.26 },
    { z: 2.3, halfW: 0.7, yTop: 0.66, yBot: 0.02 },
    { z: L / 2, halfW: 0.26, yTop: 0.8, yBot: 0.38 },
  ], hullM, { capStart: true, capEnd: true, exp: 2.7 }));
  // inner floor + sole boards
  box(g, 1.66, 0.06, 4.5, wood, 0, 0.05, -0.15);
  box(g, 1.5, 0.03, 0.7, hullM, 0, 0.1, 2.0); // bow casting deck step
  // rub strake along the sheer
  for (const sgn of [1, -1]) {
    box(g, 0.07, 0.09, 3.6, dark, sgn * 0.99, 0.5, -0.5);
  }

  // --- bench seats (bow + mid) and the helm bench at (0.3, -0.6)
  box(g, 1.6, 0.07, 0.42, wood, 0, 0.44, 1.15); // bow bench
  box(g, 1.6, 0.3, 0.06, wood, 0, 0.28, 1.34);
  box(g, 1.6, 0.07, 0.42, wood, 0, 0.44, -1.55); // stern bench
  box(g, 0.62, 0.1, 0.45, mat(0x365a66, 0.9, 0), 0.3, 0.47, -0.6); // helm cushion — top 0.52
  box(g, 0.66, 0.34, 0.48, dark, 0.3, 0.26, -0.6); // helm bench base / stowage
  const helmBack = box(g, 0.62, 0.4, 0.08, mat(0x365a66, 0.9, 0), 0.3, 0.68, -0.86);
  helmBack.rotation.x = 0.1;

  // --- center console at (0.3, 0.1): body, sloped face, small
  // glassDark windscreen, grab rail, and a STATIC helm wheel
  // (visual only — the old skiff registered no steerWheel)
  box(g, 0.58, 0.62, 0.5, hullM, 0.3, 0.38, 0.1);
  const cFace = box(g, 0.58, 0.34, 0.06, dark, 0.3, 0.78, 0.22);
  cFace.rotation.x = -0.35;
  const ws = box(g, 0.56, 0.3, 0.03, glassDark(), 0.3, 1.02, 0.3);
  ws.rotation.x = -0.42; // windscreen
  tube(g, -0.0 + 0.02, 1.12, 0.38, 0.58, 1.12, 0.38, 0.018, chrome()); // grab rail over the screen
  const helmWheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 8, 18), dark);
  helmWheel.position.set(0.3, 0.82, -0.18);
  helmWheel.rotation.x = -0.9;
  helmWheel.castShadow = true;
  g.add(helmWheel);
  tube(g, 0.3, 0.72, -0.05, 0.3, 0.8, -0.16, 0.02, dark); // wheel column
  const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), mat(0xb9c8ce, 0.3, 0.4));
  gauge.rotation.x = Math.PI / 2 - 0.35;
  gauge.position.set(0.18, 0.86, 0.26);
  g.add(gauge);
  box(g, 0.08, 0.2, 0.05, dark, 0.62, 0.62, 0.05); // throttle lever block

  // --- gunwale rail: a tube run along the sheer, both sides, meeting
  // at the bow tip
  const sheer: [number, number][] = [
    // z, halfW at that station (rail sits just inboard of the edge)
    [-2.72, 0.86], [-2.0, 0.94], [-0.8, 0.96], [0.6, 0.96], [1.6, 0.9], [2.3, 0.66],
  ];
  const railY = (z: number) => (z > 1.6 ? 0.62 + (z - 1.6) * 0.18 : 0.59);
  for (const sgn of [1, -1]) {
    for (let i = 0; i < sheer.length - 1; i++) {
      const [z1, w1] = sheer[i];
      const [z2, w2] = sheer[i + 1];
      tube(g, sgn * w1, railY(z1), z1, sgn * w2, railY(z2), z2, 0.03, wood);
    }
    tube(g, sgn * 0.66, railY(2.3), 2.3, 0, 0.84, 2.72, 0.03, wood); // to the bow tip
    // rail stanchions down to the gunwale
    for (const [z, w] of sheer) tube(g, sgn * w, railY(z) - 0.12, z, sgn * w, railY(z), z, 0.016, dark);
  }
  // cleats + a bow eye
  for (const sgn of [1, -1]) box(g, 0.16, 0.04, 0.05, chrome(), sgn * 0.7, 0.58, -2.5);
  box(g, 0.05, 0.1, 0.05, chrome(), 0, 0.62, 2.68);

  // --- outboard at the stern: cowling, shaft, cavitation plate, prop
  box(g, 0.44, 0.5, 0.34, dark, 0, 0.78, -2.86); // cowling
  const cowlTop = box(g, 0.4, 0.1, 0.3, mat(0x2e3338, 0.6, 0.3), 0, 1.06, -2.86);
  cowlTop.rotation.x = 0.08;
  box(g, 0.3, 0.06, 0.2, mat(0xb03a2e, 0.5, 0.2), 0, 0.92, -2.7); // cowling stripe (bow face)
  box(g, 0.16, 0.14, 0.1, dark, 0, 0.55, -2.8); // mount bracket
  box(g, 0.09, 0.62, 0.13, dark, 0, 0.22, -2.88); // shaft leg
  box(g, 0.02, 0.05, 0.42, dark, 0, 0.02, -2.92); // cavitation plate / fin
  const prop = new THREE.Group();
  prop.position.set(0, -0.08, -3.0);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), chrome());
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.07), chrome());
    const a = (i / 3) * Math.PI * 2;
    blade.position.set(Math.sin(a) * 0.07, Math.cos(a) * 0.07, 0);
    blade.rotation.z = -a;
    blade.rotation.y = 0.5;
    prop.add(blade);
  }
  g.add(prop);
  // fuel tank + battery box under the stern bench line
  box(g, 0.5, 0.32, 0.35, mat(0x8e2f28, 0.6, 0.1), -0.55, 0.24, -2.2);
  box(g, 0.4, 0.26, 0.3, dark, 0.55, 0.21, -2.2);
}
