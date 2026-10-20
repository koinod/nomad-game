// truckModels.ts — the truck family (CRAFT WAVE), lofted to the same
// standard as the Stallion (carModels.ts): proportions first, hullLoft
// shells in three pieces (closed front clip / open-top tub arc
// [0.7, -(PI-0.7)] / closed rear clip), a tinted glass loft + roof strip,
// separate panels (seams, handles, mirrors, lamps, grilles), dark arch
// tubs, lathed wheels with real tread, and FULL interiors via
// modelKit.buildInterior. Glass is glassTint() everywhere — transparent,
// the seated player stays visible. +Z is the nose.
//
// SYSTEM CONTRACTS preserved from the old buildCarBody branches in
// Vehicles.ts (mined 2026-10-20, do not drift):
//   Wheels: front axle z = +L*0.32 (steered — pivots into v.wheelPivots),
//   rear axle z = -L*0.32; 3-axle trucks add z = -L*0.1. Wheel
//   x = ±(W/2 - 0.07), every wheel's spin group into v.wheelSpin.
//   v.wheelR: pickup 0.40, f250 0.44, bronco 0.38, boxtruck 0.42,
//   semi / semi_day 0.42.
//   F-250 dually: extra rear pair at the OLD offset x = ±(W/2 - 0.30),
//   width 0.22, z = -L*0.32, spin-only (no pivots).
//   Driver interior (Player.ts places the avatar at x = W*0.21,
//   z = L*0.03 for cab-behind vehicles / L*0.24 for cab-forward):
//   cushion TOP pickup 0.80 / f250 0.86 / bronco 0.80 (seatZ = L*0.03),
//   boxtruck 0.98 / semi 1.02 (seatZ = L*0.24). buildInterior derives
//   driverX = halfW * 0.44 ≈ W*0.21 when halfW = W/2 - 0.04. Every
//   glass loft tops out at >= cushion + 1.04 + 0.26 (head coverage).
//   Pickup bed: floor TOP at y 0.89, centered z = -L*0.3 — exactly
//   where refreshCargoVisuals lands its crates (floorY 0.9, z0 -L*0.3).
//   Boxtruck REAR ROLL DOOR: registered in v.doors EXACTLY as the old
//   branch — { kind: 'slide-up', base: 1.5, t: 0, target: 0 } (no
//   travel field: stepDoors' slide default +1.5 applies), door mesh
//   W*0.8 x 1.9 x 0.05 at (0, 1.5, -L*0.5) with the same 4 slats.
//   Semi: fifth-wheel plate at z = -L*0.25, y = 1.15; chrome exhaust
//   stacks behind the cab; side fuel-tank cylinders; 3 axles. Sleeper
//   cab on 'semi' only — 'semi_day' (def.id) drops it, same face.

import * as THREE from 'three';
import {
  archTub, box, buildInterior, chrome, darkTrim, decalPlane, glassDark, glassTint,
  honeycombMat, hullLoft, lampMat, makeWheel, mat, tailMat, tubMat, tube,
} from './modelKit';
import type { Vehicle, VehicleDef } from './Vehicles';

/** Semi paint rotation — mirrors SEMI_PAINTS in Vehicles.ts. Duplicated
 *  (not imported) so this module keeps Vehicles.ts a TYPE-ONLY import,
 *  exactly like carModels.ts: no runtime import cycle. */
const SEMI_PAINTS = [0x3a3f45, 0x7a2020, 0x2e4a5a, 0x5c5648];

/** Truck mirrors: a stalk out from the A-pillar base + a real housing. */
function truckMirrors(g: THREE.Group, body: THREE.Material, x: number, y: number, z: number): void {
  const dark = darkTrim();
  for (const sgn of [1, -1]) {
    box(g, 0.16, 0.035, 0.05, dark, sgn * (x + 0.05), y + 0.06, z);
    box(g, 0.07, 0.24, 0.15, body, sgn * (x + 0.13), y, z);
    box(g, 0.02, 0.19, 0.11, dark, sgn * (x + 0.175), y, z).castShadow = false;
  }
}

/** Dark fender flare over one wheel: vertical cheek + top brow strip. */
function flare(g: THREE.Group, dark: THREE.Material, W: number, thick: number, y: number, browY: number, z: number, len: number): void {
  for (const sgn of [1, -1]) {
    box(g, thick, browY - y + 0.24, len, dark, sgn * (W / 2 - 0.01), y, z);
    box(g, thick + 0.02, 0.09, len + 0.05, dark, sgn * (W / 2 - 0.01), browY, z);
  }
}

// ---------------------------------------------------------------------------
// Pickup family — crew cab + OPEN bed, built from the slate-blue sheet
// (design-refs/media-generation-pickup-model-0-*.webp): tall stance,
// flat hood line, honeycomb grille with C-bracket DRLs, black flares,
// black roof + rack (pickup), open bed. The F-250 is the dually tier:
// taller, wider flares, ram bar, bed toolboxes + spare, roof markers.
// ---------------------------------------------------------------------------

interface PickupCfg {
  wheelR: number;
  cushion: number;
  hoodTop: number;
  belt: number;
  glassTop: number;
  dually: boolean;
  roofRack: boolean;
  ramBar: boolean;
}

function buildPickupFamily(g: THREE.Group, def: VehicleDef, v: Vehicle, cfg: PickupCfg): void {
  const L = def.length;
  const W = def.width;
  const body = mat(def.color, 0.48, 0.35);
  const bodyDS = body.clone();
  bodyDS.side = THREE.DoubleSide;
  const dark = darkTrim();
  const noseZ = L / 2;
  const seatZ = L * 0.03;

  // chassis shadow mass under the lofted shell
  box(g, W * 0.72, 0.24, L * 0.82, tubMat(), 0, 0.30, 0);

  // --- front clip: closed loft, flat hood line (sheet stance)
  g.add(hullLoft([
    { z: L * 0.50, halfW: W * 0.41, yTop: cfg.hoodTop - 0.19, yBot: 0.52 },
    { z: L * 0.46, halfW: W * 0.47, yTop: cfg.hoodTop - 0.07, yBot: 0.40 },
    { z: L * 0.38, halfW: W * 0.49, yTop: cfg.hoodTop - 0.01, yBot: 0.34 },
    { z: L * 0.29, halfW: W * 0.50, yTop: cfg.hoodTop, yBot: 0.32 },
    { z: L * 0.21, halfW: W * 0.50, yTop: cfg.hoodTop + 0.02, yBot: 0.32 },
    { z: L * 0.18, halfW: W * 0.50, yTop: cfg.belt, yBot: 0.32 },
  ], body, { capStart: true, capEnd: true }));
  // hood power bulge (a raised panel, per the sheet + the old build)
  const bulge = box(g, W * 0.5, 0.07, L * 0.19, body, 0, cfg.hoodTop + 0.045, L * 0.335);
  bulge.rotation.x = 0.012;

  // --- crew-cab tub: open-top arc, the cabin is a real cavity
  g.add(hullLoft([
    { z: L * 0.19, halfW: W * 0.50, yTop: cfg.belt, yBot: 0.32 },
    { z: L * 0.08, halfW: W * 0.50, yTop: cfg.belt, yBot: 0.32 },
    { z: -L * 0.08, halfW: W * 0.50, yTop: cfg.belt, yBot: 0.32 },
    { z: -L * 0.16, halfW: W * 0.495, yTop: cfg.belt, yBot: 0.33 },
  ], bodyDS, { arc: [0.7, -(Math.PI - 0.7)] }));

  // --- greenhouse: tinted glass loft + roof strip (black per the sheet)
  const glassSections = [
    { z: L * 0.185, halfW: W * 0.33, yTop: cfg.glassTop - 0.34, yBot: cfg.belt - 0.22 },
    { z: L * 0.10, halfW: W * 0.42, yTop: cfg.glassTop - 0.06, yBot: cfg.belt - 0.22 },
    { z: L * 0.02, halfW: W * 0.45, yTop: cfg.glassTop, yBot: cfg.belt - 0.22 },
    { z: -L * 0.09, halfW: W * 0.45, yTop: cfg.glassTop, yBot: cfg.belt - 0.22 },
    { z: -L * 0.16, halfW: W * 0.43, yTop: cfg.glassTop - 0.08, yBot: cfg.belt - 0.22 },
  ];
  g.add(hullLoft(glassSections, glassTint(), { seg: 28 }));
  g.add(hullLoft(
    glassSections.map((s) => ({ ...s, halfW: s.halfW + 0.015, yTop: s.yTop + 0.015 })),
    dark, { seg: 12, arc: [1.02, 2.12] },
  ));
  // pillars: A tubes, B posts, C sails
  for (const sgn of [1, -1]) {
    tube(g, sgn * W * 0.32, cfg.belt, L * 0.175, sgn * W * 0.415, cfg.glassTop - 0.10, L * 0.095, 0.04, body);
    box(g, 0.05, cfg.glassTop - cfg.belt - 0.04, 0.07, dark, sgn * W * 0.452, (cfg.belt + cfg.glassTop) / 2, -L * 0.005);
    box(g, 0.07, cfg.glassTop - cfg.belt - 0.02, 0.10, body, sgn * W * 0.44, (cfg.belt + cfg.glassTop) / 2, -L * 0.152);
  }

  // --- face: grille surround + honeycomb inset + C-bracket DRLs
  box(g, W * 0.78, 0.50, 0.09, mat(0x3a4148, 0.7, 0.2), 0, cfg.hoodTop - 0.32, noseZ + 0.01);
  box(g, W * 0.62, 0.34, 0.05, honeycombMat(), 0, cfg.hoodTop - 0.32, noseZ + 0.045);
  for (const sgn of [1, -1]) {
    box(g, 0.20, 0.16, 0.05, dark, sgn * W * 0.40, cfg.hoodTop - 0.22, noseZ + 0.02); // lamp pod
    box(g, 0.36, 0.075, 0.04, lampMat(), sgn * W * 0.355, cfg.hoodTop - 0.16, noseZ + 0.055).castShadow = false; // C top bar
    box(g, 0.075, 0.26, 0.04, lampMat(), sgn * W * 0.475, cfg.hoodTop - 0.29, noseZ + 0.055).castShadow = false; // C drop
  }
  // steel bumper + tow hooks + fogs
  box(g, W, 0.32, 0.22, dark, 0, 0.47, noseZ + 0.06);
  for (const sgn of [1, -1]) {
    box(g, 0.09, 0.14, 0.06, mat(0x14161a, 0.8, 0.2), sgn * W * 0.20, 0.30, noseZ + 0.19);
    box(g, 0.14, 0.09, 0.04, lampMat(), sgn * W * 0.38, 0.50, noseZ + 0.175).castShadow = false;
  }
  if (cfg.ramBar) {
    // F-250 tactical ram bar (Stitch F-250 sheet): twin rails + posts
    const barM = mat(0x2c2f33, 0.5, 0.6);
    for (const by of [0.55, 0.90]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, W * 0.8, 10), barM);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, by, noseZ + 0.24);
      bar.castShadow = true;
      g.add(bar);
    }
    for (const sgn of [1, -1]) tube(g, sgn * W * 0.28, 0.38, noseZ + 0.12, sgn * W * 0.28, 0.95, noseZ + 0.24, 0.04, barM);
  }

  // --- rear clip under the bed + the OPEN bed itself
  g.add(hullLoft([
    { z: -L * 0.15, halfW: W * 0.495, yTop: 0.86, yBot: 0.33 },
    { z: -L * 0.30, halfW: W * 0.49, yTop: 0.86, yBot: 0.33 },
    { z: -L * 0.44, halfW: W * 0.48, yTop: 0.86, yBot: 0.36 },
    { z: -L * 0.50, halfW: W * 0.44, yTop: 0.84, yBot: 0.44 },
  ], body, { capStart: true, capEnd: true }));
  // bed floor: TOP at y 0.89, centered z = -L*0.3 (the cargo contract)
  box(g, W * 0.92, 0.06, L * 0.35, mat(0x22262b, 0.95, 0), 0, 0.86, -L * 0.30);
  // bed walls rise from the rear clip to the beltline; front wall + tailgate
  const wallH = cfg.belt - 0.86;
  const wallY = 0.86 + wallH / 2;
  for (const sgn of [1, -1]) {
    box(g, 0.09, wallH, L * 0.335, body, sgn * (W / 2 - 0.045), wallY, -L * 0.315);
    box(g, 0.03, wallH - 0.08, L * 0.32, mat(0x22262b, 0.95, 0), sgn * (W / 2 - 0.105), wallY, -L * 0.315); // liner
    box(g, 0.36, 0.30, 1.0, tubMat(), sgn * (W / 2 - 0.27), 1.02, -L * 0.32); // inner wheel tub
  }
  box(g, W * 0.94, wallH, 0.07, body, 0, wallY, -L * 0.155); // bed front wall
  box(g, W * 0.96, wallH, 0.07, body, 0, wallY, -L * 0.4875); // tailgate
  box(g, 0.22, 0.05, 0.03, dark, 0, cfg.belt - 0.10, -L * 0.4875 - 0.05); // tailgate handle
  const badge = decalPlane('NOMAD', 0.9, 'rgba(216,220,224,0.85)', 40);
  badge.position.set(0, 1.02, -L * 0.4875 - 0.045);
  badge.rotation.y = Math.PI;
  g.add(badge);
  // rear lamps + bumper + exhaust
  for (const sgn of [1, -1]) box(g, 0.10, 0.32, 0.05, tailMat(), sgn * W * 0.42, 1.02, -L * 0.505).castShadow = false;
  box(g, W, 0.26, 0.14, dark, 0, 0.46, -L * 0.52);
  const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), chrome());
  exh.rotation.x = Math.PI / 2;
  exh.position.set(W * 0.32, 0.30, -L * 0.53);
  exh.castShadow = true;
  g.add(exh);

  // --- cab details: mirrors, seams, handles, steps; roof dressing
  truckMirrors(g, body, W / 2, cfg.belt + 0.28, L * 0.155);
  for (const sgn of [1, -1]) {
    box(g, 0.015, 0.55, 0.025, tubMat(), sgn * (W / 2 + 0.002), 0.72, L * 0.005).castShadow = false; // front door rear seam
    box(g, 0.015, 0.55, 0.025, tubMat(), sgn * (W / 2 + 0.002), 0.72, -L * 0.145).castShadow = false; // rear door rear seam
    box(g, 0.02, 0.04, 0.17, dark, sgn * (W / 2 + 0.005), cfg.belt - 0.14, L * 0.06).castShadow = false; // handles
    box(g, 0.02, 0.04, 0.17, dark, sgn * (W / 2 + 0.005), cfg.belt - 0.14, -L * 0.09).castShadow = false;
    box(g, 0.20, 0.06, L * 0.30, dark, sgn * (W / 2 + 0.03), 0.44, L * 0.02); // side step
  }
  if (cfg.roofRack) {
    for (const sgn of [1, -1]) box(g, 0.06, 0.05, L * 0.26, dark, sgn * W * 0.30, cfg.glassTop + 0.05, -L * 0.02);
    for (let i = 0; i < 3; i++) box(g, W * 0.64, 0.04, 0.08, dark, 0, cfg.glassTop + 0.06, -L * 0.02 + (i - 1) * L * 0.10);
  } else {
    // F-250 cab roof markers (the dually tell)
    for (let i = -1; i <= 1; i++) box(g, 0.14, 0.05, 0.04, mat(0xd88f2a, 0.4, 0), i * 0.28, cfg.glassTop + 0.03, L * 0.10).castShadow = false;
    // bed toolboxes + a spare stood against the bed front wall (Stitch)
    for (const sgn of [1, -1]) box(g, 0.36, 0.34, 0.9, dark, sgn * (W / 2 - 0.30), 1.06, -L * 0.21);
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(cfg.wheelR - 0.02, cfg.wheelR - 0.02, 0.24, 18), mat(0x1b1b1e, 1, 0));
    spare.rotation.x = Math.PI / 2;
    spare.position.set(W * 0.22, cfg.belt - 0.02, -L * 0.175);
    spare.castShadow = true;
    g.add(spare);
  }

  // --- wheels + arch tubs + flares (proportions first)
  for (const sgn of [1, -1]) {
    archTub(g, sgn * (W / 2 - 0.07), cfg.wheelR, L * 0.32, cfg.wheelR, W / 2);
    archTub(g, sgn * (W / 2 - 0.07), cfg.wheelR, -L * 0.32, cfg.wheelR, W / 2);
  }
  flare(g, dark, W, cfg.dually ? 0.10 : 0.10, 0.80, cfg.wheelR + 0.62, L * 0.32, 1.02);
  flare(g, dark, W, cfg.dually ? 0.17 : 0.10, 0.80, cfg.wheelR + 0.62, -L * 0.32, cfg.dually ? 1.12 : 1.02);
  for (const sgn of [1, -1]) {
    makeWheel(g, { r: cfg.wheelR, w: 0.30, x: sgn * (W / 2 - 0.07), y: cfg.wheelR, z: L * 0.32, style: 'offroad', tread: 'at', spin: v.wheelSpin, pivots: v.wheelPivots });
    makeWheel(g, { r: cfg.wheelR, w: 0.30, x: sgn * (W / 2 - 0.07), y: cfg.wheelR, z: -L * 0.32, style: 'offroad', tread: 'at', spin: v.wheelSpin });
    if (cfg.dually) {
      // the dually pair — OLD offset preserved exactly: x = ±(W/2 - 0.30),
      // width 0.22, rear axle, spin-only (see the header contract).
      makeWheel(g, { r: cfg.wheelR, w: 0.22, x: sgn * (W / 2 - 0.30), y: cfg.wheelR, z: -L * 0.32, style: 'offroad', tread: 'at', spin: v.wheelSpin });
    }
  }
  v.wheelR = cfg.wheelR;

  // --- interior (contract: cushion top per cfg, seatZ = L*0.03)
  buildInterior(g, v, {
    floorY: cfg.cushion - 0.28, floorW: W - 0.24, floorZFront: seatZ + 0.79, floorZRear: -L * 0.155,
    cushionY: cfg.cushion, seatZ, dashZ: seatZ + 0.62, halfW: W / 2 - 0.04,
    rearBench: true, rearBenchZ: -L * 0.09, fabric: 0x2c2f33,
  });
}

export function buildPickup(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  buildPickupFamily(g, def, v, {
    wheelR: 0.40, cushion: 0.80, hoodTop: 1.25, belt: 1.32, glassTop: 2.12,
    dually: false, roofRack: true, ramBar: false,
  });
}

export function buildF250(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  buildPickupFamily(g, def, v, {
    wheelR: 0.44, cushion: 0.86, hoodTop: 1.31, belt: 1.38, glassTop: 2.18,
    dually: true, roofRack: false, ramBar: true,
  });
}

// ---------------------------------------------------------------------------
// Bronco — upright 4x4 SUV on the pickup family's recipe: lofted hood
// clip, open-top cabin tub, full-length glass loft + roof strip, closed
// rear clip with a rear glass panel, roof rack, bullbar, rear spare.
// Cargo crates (refreshCargoVisuals) land at floorY 1.0, z0 = -L*0.3 —
// the interior cargo plate's top is exactly y 1.00 behind the bench.
// ---------------------------------------------------------------------------

export function buildBronco(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const body = mat(def.color, 0.52, 0.3);
  const bodyDS = body.clone();
  bodyDS.side = THREE.DoubleSide;
  const dark = darkTrim();
  const noseZ = L / 2;
  const seatZ = L * 0.03;
  const hoodTop = 1.24;
  const belt = 1.30;
  const glassTop = 2.12;
  const wheelR = 0.38;

  box(g, W * 0.72, 0.24, L * 0.82, tubMat(), 0, 0.30, 0); // chassis mass

  // --- front clip (closed loft)
  g.add(hullLoft([
    { z: L * 0.50, halfW: W * 0.42, yTop: hoodTop - 0.18, yBot: 0.50 },
    { z: L * 0.45, halfW: W * 0.48, yTop: hoodTop - 0.06, yBot: 0.38 },
    { z: L * 0.36, halfW: W * 0.50, yTop: hoodTop, yBot: 0.33 },
    { z: L * 0.26, halfW: W * 0.50, yTop: hoodTop + 0.02, yBot: 0.32 },
    { z: L * 0.20, halfW: W * 0.50, yTop: belt, yBot: 0.32 },
  ], body, { capStart: true, capEnd: true }));

  // --- cabin tub (open-top arc), full length
  g.add(hullLoft([
    { z: L * 0.205, halfW: W * 0.50, yTop: belt, yBot: 0.32 },
    { z: L * 0.05, halfW: W * 0.50, yTop: belt, yBot: 0.32 },
    { z: -L * 0.20, halfW: W * 0.50, yTop: belt, yBot: 0.32 },
    { z: -L * 0.40, halfW: W * 0.495, yTop: belt, yBot: 0.33 },
  ], bodyDS, { arc: [0.7, -(Math.PI - 0.7)] }));

  // --- greenhouse: glass loft + roof strip + pillars
  const glassSections = [
    { z: L * 0.20, halfW: W * 0.34, yTop: glassTop - 0.32, yBot: belt - 0.22 },
    { z: L * 0.11, halfW: W * 0.43, yTop: glassTop - 0.05, yBot: belt - 0.22 },
    { z: L * 0.02, halfW: W * 0.45, yTop: glassTop, yBot: belt - 0.22 },
    { z: -L * 0.20, halfW: W * 0.45, yTop: glassTop, yBot: belt - 0.22 },
    { z: -L * 0.41, halfW: W * 0.43, yTop: glassTop - 0.07, yBot: belt - 0.22 },
  ];
  g.add(hullLoft(glassSections, glassTint(), { seg: 28 }));
  g.add(hullLoft(
    glassSections.map((s) => ({ ...s, halfW: s.halfW + 0.015, yTop: s.yTop + 0.015 })),
    body, { seg: 12, arc: [1.02, 2.12] },
  ));
  for (const sgn of [1, -1]) {
    tube(g, sgn * W * 0.33, belt, L * 0.19, sgn * W * 0.42, glassTop - 0.09, L * 0.105, 0.04, body);
    box(g, 0.05, glassTop - belt - 0.04, 0.07, dark, sgn * W * 0.452, (belt + glassTop) / 2, -L * 0.01); // B post
    box(g, 0.07, glassTop - belt - 0.02, 0.10, body, sgn * W * 0.44, (belt + glassTop) / 2, -L * 0.395); // C sail
  }

  // --- rear clip (closed loft) + rear glass panel + header
  g.add(hullLoft([
    { z: -L * 0.40, halfW: W * 0.49, yTop: belt, yBot: 0.34 },
    { z: -L * 0.47, halfW: W * 0.48, yTop: belt - 0.04, yBot: 0.38 },
    { z: -L * 0.50, halfW: W * 0.44, yTop: belt - 0.10, yBot: 0.46 },
  ], body, { capStart: true, capEnd: true }));
  const rearGlass = box(g, W * 0.78, glassTop - belt - 0.08, 0.05, glassTint(), 0, (belt + glassTop) / 2, -L * 0.43);
  rearGlass.rotation.x = -0.05;
  box(g, W * 0.84, 0.10, 0.16, body, 0, glassTop - 0.02, -L * 0.425); // rear header

  // --- face: grille, lamps, bullbar, bumper
  box(g, W * 0.66, 0.22, 0.06, dark, 0, 0.86, noseZ + 0.01);
  box(g, W * 0.5, 0.13, 0.05, honeycombMat(), 0, 0.86, noseZ + 0.04);
  for (const sgn of [1, -1]) box(g, 0.27, 0.12, 0.05, lampMat(), sgn * W * 0.33, 1.00, noseZ + 0.015).castShadow = false;
  box(g, W * 0.70, 0.11, 0.08, dark, 0, 0.60, noseZ + 0.24); // bullbar rails
  box(g, W * 0.70, 0.11, 0.08, dark, 0, 0.94, noseZ + 0.20);
  for (const sgn of [1, -1]) box(g, 0.09, 0.48, 0.08, dark, sgn * W * 0.30, 0.77, noseZ + 0.22);
  box(g, W, 0.24, 0.12, dark, 0, 0.38, noseZ + 0.05); // front bumper

  // --- tail: lamps, bumper, rear spare (the old build's signature)
  for (const sgn of [1, -1]) box(g, 0.09, 0.26, 0.05, tailMat(), sgn * W * 0.42, 0.95, -L * 0.505).castShadow = false;
  box(g, W, 0.24, 0.12, dark, 0, 0.40, -L * 0.53);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 18), mat(0x1b1b1e, 1, 0));
  spare.rotation.x = Math.PI / 2;
  spare.position.set(0, 1.12, -L / 2 - 0.14);
  spare.castShadow = true;
  g.add(spare);
  const spareHub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 12), mat(0x3c4046, 0.55, 0.5));
  spareHub.rotation.x = Math.PI / 2;
  spareHub.position.set(0, 1.12, -L / 2 - 0.14);
  g.add(spareHub);

  // --- roof rack (rails + crossbars, from the old build + sheets)
  for (const sgn of [1, -1]) box(g, 0.06, 0.05, L * 0.42, dark, sgn * W * 0.32, glassTop + 0.06, -L * 0.10);
  for (let i = 0; i < 3; i++) box(g, W * 0.68, 0.04, 0.08, dark, 0, glassTop + 0.07, -L * 0.10 + (i - 1) * L * 0.17);

  // --- sides: mirrors, seams, handles, steps
  truckMirrors(g, body, W / 2, belt + 0.26, L * 0.16);
  for (const sgn of [1, -1]) {
    box(g, 0.015, 0.55, 0.025, tubMat(), sgn * (W / 2 + 0.002), 0.72, -L * 0.10).castShadow = false; // door seam
    box(g, 0.02, 0.04, 0.17, dark, sgn * (W / 2 + 0.005), belt - 0.14, L * 0.02).castShadow = false; // handle
    box(g, 0.20, 0.06, L * 0.26, dark, sgn * (W / 2 + 0.03), 0.44, L * 0.03); // step
  }

  // --- wheels + tubs + flares
  for (const sgn of [1, -1]) {
    archTub(g, sgn * (W / 2 - 0.07), wheelR, L * 0.32, wheelR, W / 2);
    archTub(g, sgn * (W / 2 - 0.07), wheelR, -L * 0.32, wheelR, W / 2);
  }
  flare(g, dark, W, 0.10, 0.78, wheelR + 0.60, L * 0.32, 0.98);
  flare(g, dark, W, 0.10, 0.78, wheelR + 0.60, -L * 0.32, 0.98);
  for (const sgn of [1, -1]) {
    makeWheel(g, { r: wheelR, w: 0.30, x: sgn * (W / 2 - 0.07), y: wheelR, z: L * 0.32, style: 'offroad', tread: 'at', spin: v.wheelSpin, pivots: v.wheelPivots });
    makeWheel(g, { r: wheelR, w: 0.30, x: sgn * (W / 2 - 0.07), y: wheelR, z: -L * 0.32, style: 'offroad', tread: 'at', spin: v.wheelSpin });
  }
  v.wheelR = wheelR;

  // --- interior (contract: cushion 0.80, seatZ = L*0.03) + cargo plate
  buildInterior(g, v, {
    floorY: 0.52, floorW: W - 0.24, floorZFront: seatZ + 0.77, floorZRear: -L * 0.39,
    cushionY: 0.80, seatZ, dashZ: seatZ + 0.62, halfW: W / 2 - 0.04,
    rearBench: true, rearBenchZ: -L * 0.11, fabric: 0x2c2f33,
  });
  // cargo floor plate behind the bench: TOP at y 1.00 (the crate contract)
  box(g, W * 0.86, 0.06, L * 0.30, mat(0x22262b, 0.95, 0), 0, 0.97, -L * 0.33);
}

// ---------------------------------------------------------------------------
// Box truck — lofted cab-over cab + a SHAPED, HOLLOW cargo box: paneled
// shell with a crowned roof loft strip, a beveled front top edge and
// applied side ribs. The bay is real (floor / walls / ceiling): the
// rear roll door — registered EXACTLY as the old branch did — slides
// up to reveal it. 3 axles, street tread on steel rims.
// ---------------------------------------------------------------------------

export function buildBoxtruck(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const body = mat(def.color, 0.55, 0.25);
  const bodyDS = body.clone();
  bodyDS.side = THREE.DoubleSide;
  const dark = darkTrim();
  const seatZ = L * 0.24;
  const wheelR = 0.42;
  const belt = 1.50;
  const glassTop = 2.31;

  box(g, W * 0.7, 0.24, L * 0.85, tubMat(), 0, 0.30, -L * 0.05); // chassis mass

  // --- cab: closed cowl loft (nose/dash) + open-top tub under the glass
  g.add(hullLoft([
    { z: L * 0.496, halfW: W * 0.455, yTop: 1.32, yBot: 0.50 },
    { z: L * 0.46, halfW: W * 0.48, yTop: 1.46, yBot: 0.34 },
    { z: L * 0.40, halfW: W * 0.48, yTop: belt, yBot: 0.31 },
    { z: L * 0.395, halfW: W * 0.48, yTop: belt, yBot: 0.31 },
  ], body, { capStart: true, capEnd: true }));
  g.add(hullLoft([
    { z: L * 0.40, halfW: W * 0.48, yTop: belt, yBot: 0.31 },
    { z: L * 0.30, halfW: W * 0.48, yTop: belt, yBot: 0.31 },
    { z: L * 0.20, halfW: W * 0.48, yTop: belt, yBot: 0.31 },
  ], bodyDS, { arc: [0.7, -(Math.PI - 0.7)] }));

  // --- cab greenhouse: glass loft + roof strip + A-pillars
  const cabGlass = [
    { z: L * 0.475, halfW: W * 0.38, yTop: 1.86, yBot: 1.24 },
    { z: L * 0.42, halfW: W * 0.44, yTop: 2.28, yBot: 1.22 },
    { z: L * 0.345, halfW: W * 0.455, yTop: glassTop, yBot: 1.22 },
    { z: L * 0.205, halfW: W * 0.455, yTop: glassTop - 0.02, yBot: 1.22 },
  ];
  g.add(hullLoft(cabGlass, glassTint(), { seg: 28 }));
  g.add(hullLoft(
    cabGlass.map((s) => ({ ...s, halfW: s.halfW + 0.015, yTop: s.yTop + 0.015 })),
    body, { seg: 12, arc: [1.02, 2.12] },
  ));
  for (const sgn of [1, -1]) {
    tube(g, sgn * W * 0.375, belt, L * 0.465, sgn * W * 0.435, 2.24, L * 0.415, 0.045, body);
    box(g, 0.05, glassTop - belt - 0.04, 0.07, dark, sgn * (W * 0.48 - 0.01), (belt + glassTop) / 2, L * 0.21); // cab rear post
  }

  // --- cab face + details
  box(g, W * 0.6, 0.20, 0.06, dark, 0, 0.62, L * 0.498); // grille
  box(g, W * 0.44, 0.11, 0.05, honeycombMat(), 0, 0.62, L * 0.505);
  for (const sgn of [1, -1]) box(g, 0.32, 0.11, 0.05, lampMat(), sgn * W * 0.33, 0.85, L * 0.50).castShadow = false;
  box(g, W * 0.98, 0.26, 0.14, dark, 0, 0.34, L * 0.505); // bumper
  truckMirrors(g, body, W / 2, 1.98, L * 0.43);
  for (const sgn of [1, -1]) {
    box(g, 0.015, 0.60, 0.025, tubMat(), sgn * (W * 0.48 + 0.002), 0.85, L * 0.295).castShadow = false; // door seam
    box(g, 0.02, 0.04, 0.18, dark, sgn * (W * 0.48 + 0.005), belt - 0.12, L * 0.33).castShadow = false; // handle
    box(g, 0.30, 0.06, 0.55, dark, sgn * (W / 2 + 0.03), 0.42, L * 0.27); // cab steps
    box(g, 0.34, 0.06, 0.50, dark, sgn * (W / 2 + 0.05), 0.20, L * 0.27);
  }

  // --- cargo box: hollow paneled shell (floor / walls / ceiling)
  const boxFront = L * 0.20; // front wall plane = the cab's rear wall
  const boxRear = -L * 0.50; // rear face plane (the roll door's z)
  const cd = boxFront - boxRear;
  const cz = (boxFront + boxRear) / 2;
  const wallTop = 2.68;
  const bayFloorTop = 0.90;
  box(g, W * 0.96, 0.10, cd, mat(0x2a2e33, 0.9, 0.1), 0, bayFloorTop - 0.05, cz); // bay floor (top 0.90)
  for (const sgn of [1, -1]) {
    box(g, 0.08, wallTop - bayFloorTop, cd, body, sgn * (W / 2 - 0.04), (bayFloorTop + wallTop) / 2, cz); // side wall
    box(g, 0.03, wallTop - bayFloorTop - 0.12, cd - 0.16, mat(0x4a4f55, 0.9, 0.05), sgn * (W / 2 - 0.095), (bayFloorTop + wallTop) / 2, cz); // inner liner
    // applied ribs on the outer flank (the shaped-panel read)
    for (let i = 0; i < 8; i++) {
      box(g, 0.03, wallTop - bayFloorTop - 0.16, 0.10, body, sgn * (W / 2 + 0.008), (bayFloorTop + wallTop) / 2, boxFront - 0.45 - i * (cd - 0.9) / 7);
    }
    box(g, 0.03, 0.08, cd - 0.1, dark, sgn * (W / 2 + 0.008), 1.06, cz).castShadow = false; // rub rail
  }
  box(g, W * 0.96, wallTop - bayFloorTop, 0.08, body, 0, (bayFloorTop + wallTop) / 2, boxFront - 0.04); // front wall
  box(g, W * 0.96, 0.07, cd, mat(0x3c4147, 0.9, 0.05), 0, wallTop - 0.035, cz); // ceiling panel
  // crowned roof: a wide-arc loft strip over the ceiling, proud of the walls
  const roofSections = [boxFront + 0.04, cz + cd * 0.25, cz, cz - cd * 0.28, boxRear - 0.04].map((z) => ({
    z, halfW: W / 2 + 0.01, yTop: 2.80, yBot: 2.58,
  }));
  g.add(hullLoft(roofSections, body, { seg: 20, arc: [0.30, Math.PI - 0.30] }));
  for (const sgn of [1, -1]) box(g, 0.09, 0.14, cd, body, sgn * (W / 2 - 0.02), wallTop - 0.03, cz); // top side rails
  // beveled front top edge: a chamfer panel from the front wall to the roof
  const bevel = box(g, W * 0.97, 0.36, 0.06, body, 0, wallTop + 0.02, boxFront + 0.10);
  bevel.rotation.x = 0.62;
  box(g, 0.3, 0.04, 0.12, mat(0xd8cf9a, 0.4, 0), 0, wallTop - 0.12, cz); // bay work light
  // rear frame around the door: posts + header
  for (const sgn of [1, -1]) box(g, 0.10, 1.98, 0.08, body, sgn * (W / 2 - 0.05), 1.52, boxRear - 0.01);
  box(g, W, 0.26, 0.08, body, 0, 2.56, boxRear - 0.01); // header over the door
  const sideDecal = decalPlane('NOMAD FREIGHT', 2.6, 'rgba(70,78,86,0.9)', 44);
  for (const sgn of [1, -1]) {
    const d = sgn > 0 ? sideDecal : sideDecal.clone();
    d.position.set(sgn * (W / 2 + 0.028), 1.92, cz);
    d.rotation.y = sgn * Math.PI / 2;
    g.add(d);
  }

  // --- REAR ROLL DOOR — geometry + registration copied from the old
  // branch EXACTLY (see header): slatted door, slides up via stepDoors.
  const rollDoor = box(g, W * 0.8, 1.9, 0.05, mat(0xbdbab0, 0.7, 0.1), 0, 1.5, -L * 0.5);
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.04, 0.02), darkTrim());
    slat.position.set(0, -0.65 + i * 0.45, -0.04);
    rollDoor.add(slat);
  }
  v.doors.push({ obj: rollDoor, kind: 'slide-up', base: 1.5, t: 0, target: 0 });

  // --- rear details: lamps, markers, step bumper, mudflaps
  for (const sgn of [1, -1]) {
    box(g, 0.07, 0.30, 0.05, tailMat(), sgn * W * 0.44, 0.95, -L * 0.51).castShadow = false;
    box(g, 0.12, 0.05, 0.05, mat(0xd88f2a, 0.4, 0), sgn * (W / 2 - 0.12), 2.58, boxRear - 0.06).castShadow = false; // box markers
    box(g, 0.05, 0.34, 0.30, dark, sgn * (W / 2 - 0.14), 0.42, -L * 0.32 - 0.55).castShadow = false; // mudflap
  }
  box(g, W * 0.9, 0.18, 0.16, dark, 0, 0.55, boxRear - 0.06); // rear step

  // --- wheels (3 axles) + arch tubs
  const axleZs = [L * 0.32, -L * 0.1, -L * 0.32];
  for (const az of axleZs) {
    for (const sgn of [1, -1]) archTub(g, sgn * (W / 2 - 0.07), wheelR, az, wheelR, W / 2);
  }
  axleZs.forEach((az, i) => {
    for (const sgn of [1, -1]) {
      makeWheel(g, {
        r: wheelR, w: 0.24, x: sgn * (W / 2 - 0.07), y: wheelR, z: az,
        style: 'steel', tread: 'street', spin: v.wheelSpin,
        pivots: i === 0 ? v.wheelPivots : undefined,
      });
    }
  });
  v.wheelR = wheelR;

  // --- interior (contract: cushion 0.98, seatZ = L*0.24, cab-forward)
  buildInterior(g, v, {
    floorY: 0.70, floorW: W - 0.24, floorZFront: seatZ + 0.75, floorZRear: L * 0.17,
    cushionY: 0.98, seatZ, dashZ: seatZ + 0.62, halfW: W / 2 - 0.04,
    fabric: 0x2c2f33,
  });
}

// ---------------------------------------------------------------------------
// Semi — conventional long-hood tractor, BOTH cabs from def.id:
// 'semi' gets the sleeper (with a bunk inside), 'semi_day' a short
// day cab with a rear window. Preserved systems: fifth-wheel plate
// (z = -L*0.25, y = 1.15) on its deck, chrome exhaust stacks behind
// the cab (material follows the old colorPick rule), side fuel-tank
// cylinders, vertical-bar chrome grille + cow-catcher guard, roof
// markers, 3 axles (street tread; steel fronts, dually rears).
// ---------------------------------------------------------------------------

export function buildSemi(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const day = def.id === 'semi_day';
  const color = day ? def.color : SEMI_PAINTS[v.colorPick % SEMI_PAINTS.length];
  const body = mat(color, 0.5, 0.35);
  const bodyDS = body.clone();
  bodyDS.side = THREE.DoubleSide;
  const dark = darkTrim();
  const seatZ = L * 0.24;
  const wheelR = 0.42;
  const belt = 1.78;
  const glassTop = 2.36;
  const tubFront = L * 0.36;
  const tubRear = day ? L * 0.055 : L * 0.09;
  const cabRearZ = day ? tubRear : -L * 0.15; // sleeper rear on the semi

  // frame rails + chassis mass
  for (const sgn of [1, -1]) box(g, 0.16, 0.26, L * 0.62, tubMat(), sgn * 0.42, 0.70, -L * 0.14);
  box(g, W * 0.6, 0.18, L * 0.5, tubMat(), 0, 0.52, L * 0.18);

  // --- hood clip: closed loft, long conventional nose
  g.add(hullLoft([
    { z: L * 0.495, halfW: W * 0.37, yTop: 1.28, yBot: 0.44 },
    { z: L * 0.455, halfW: W * 0.42, yTop: 1.48, yBot: 0.36 },
    { z: L * 0.40, halfW: W * 0.44, yTop: 1.58, yBot: 0.34 },
    { z: L * 0.355, halfW: W * 0.45, yTop: 1.63, yBot: 0.34 },
  ], body, { capStart: true, capEnd: true }));
  // hood center ridge panel
  const ridge = box(g, W * 0.3, 0.05, L * 0.13, body, 0, 1.615, L * 0.415);
  ridge.rotation.x = 0.03;

  // --- cab tub: open-top arc
  g.add(hullLoft([
    { z: tubFront, halfW: W * 0.48, yTop: belt, yBot: 0.34 },
    { z: L * 0.24, halfW: W * 0.49, yTop: belt, yBot: 0.34 },
    { z: tubRear, halfW: W * 0.485, yTop: belt, yBot: 0.34 },
  ], bodyDS, { arc: [0.7, -(Math.PI - 0.7)] }));

  // --- greenhouse: glass loft + roof strip + A-pillars
  const glassSections = [
    { z: tubFront + 0.01, halfW: W * 0.35, yTop: 2.10, yBot: 1.55 },
    { z: L * 0.315, halfW: W * 0.42, yTop: 2.32, yBot: 1.55 },
    { z: L * 0.24, halfW: W * 0.45, yTop: glassTop, yBot: 1.55 },
    { z: L * 0.15, halfW: W * 0.45, yTop: glassTop, yBot: 1.55 },
    { z: tubRear + 0.01, halfW: W * 0.43, yTop: glassTop - 0.06, yBot: 1.55 },
  ];
  g.add(hullLoft(glassSections, glassTint(), { seg: 28 }));
  g.add(hullLoft(
    glassSections.map((s) => ({ ...s, halfW: s.halfW + 0.015, yTop: s.yTop + 0.015 })),
    body, { seg: 12, arc: [1.02, 2.12] },
  ));
  for (const sgn of [1, -1]) {
    tube(g, sgn * W * 0.345, belt, tubFront - 0.02, sgn * W * 0.415, 2.28, L * 0.31, 0.045, body);
    box(g, 0.05, glassTop - belt - 0.04, 0.07, dark, sgn * (W * 0.452), (belt + glassTop) / 2, tubRear + 0.03); // B post
  }
  // roof markers (old build: 3 amber over the windshield)
  for (let i = -1; i <= 1; i++) box(g, 0.12, 0.05, 0.04, mat(0xd88f2a, 0.4, 0), i * 0.3, glassTop + 0.06, L * 0.315).castShadow = false;
  // sun visor over the windshield
  const visor = box(g, W * 0.72, 0.04, 0.34, body, 0, 2.30, tubFront + 0.10);
  visor.rotation.x = 0.22;

  // --- behind the cab: sleeper (semi) or day-cab rear clip
  if (!day) {
    g.add(hullLoft([
      { z: tubRear + 0.01, halfW: W * 0.465, yTop: 2.30, yBot: 0.36 },
      { z: -L * 0.05, halfW: W * 0.47, yTop: 2.34, yBot: 0.36 },
      { z: cabRearZ, halfW: W * 0.465, yTop: 2.32, yBot: 0.38 },
    ], body, { capStart: true, capEnd: true }));
    for (const sgn of [1, -1]) {
      const win = box(g, 0.03, 0.34, 0.52, glassDark(), sgn * (W * 0.472), 1.95, -L * 0.03);
      win.castShadow = false; // sleeper window
    }
    // roof air deflector sweeping back over the sleeper
    const deflector = box(g, W * 0.84, 0.05, L * 0.15, body, 0, glassTop + 0.16, L * 0.05);
    deflector.rotation.x = 0.38;
    // the bunk, visible through the cab
    box(g, 1.7, 0.16, 0.66, mat(0x2e3134, 0.95, 0), 0, 0.94, -L * 0.07);
    box(g, 0.5, 0.10, 0.4, mat(0x8a8d90, 0.95, 0), -0.5, 1.06, -L * 0.07); // pillow
  } else {
    g.add(hullLoft([
      { z: tubRear + 0.02, halfW: W * 0.46, yTop: 2.28, yBot: 0.36 },
      { z: tubRear - L * 0.05, halfW: W * 0.45, yTop: 2.18, yBot: 0.40 },
    ], body, { capStart: true, capEnd: true }));
    const rearWin = box(g, 0.72, 0.38, 0.04, glassDark(), 0, 1.96, tubRear - L * 0.052);
    rearWin.castShadow = false;
  }

  // --- face: chrome vertical-bar grille, bumper, lamps, cow-catcher
  box(g, W * 0.62, 0.82, 0.08, chrome(), 0, 1.00, L * 0.50);
  for (let i = -2; i <= 2; i++) box(g, 0.05, 0.74, 0.03, dark, i * W * 0.11, 1.00, L * 0.50 + 0.05).castShadow = false;
  box(g, W * 0.98, 0.30, 0.14, chrome(), 0, 0.34, L * 0.515); // bumper
  for (const sgn of [1, -1]) box(g, 0.30, 0.10, 0.05, lampMat(), sgn * W * 0.32, 0.80, L * 0.505).castShadow = false;
  const guard = mat(0x2b2f36, 0.8, 0.3); // the Stitch semi's cow-catcher
  box(g, W * 0.78, 0.09, 0.07, guard, 0, 0.92, L * 0.56);
  box(g, W * 0.78, 0.09, 0.07, guard, 0, 0.38, L * 0.58);
  for (let i = -2; i <= 2; i++) {
    const tooth = box(g, 0.09, 0.62, 0.07, guard, i * W * 0.17, 0.65, L * 0.57);
    tooth.rotation.x = 0.1;
  }

  // --- stacks behind the cab (old position rule + old material rule:
  // chrome when colorPick is even, dark steel when odd)
  const stackMat = v.colorPick % 2 === 0 ? chrome() : mat(0x2b2f36, 0.6, 0.4);
  for (const sgn of [1, -1]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 10), stackMat);
    stack.position.set(sgn * (W / 2 - 0.12), 1.6, cabRearZ - 0.14);
    stack.castShadow = true;
    g.add(stack);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10), stackMat);
    cap.position.set(sgn * (W / 2 - 0.12), 2.77, cabRearZ - 0.14);
    g.add(cap);
    tube(g, sgn * (W / 2 - 0.12), 0.45, cabRearZ - 0.14, sgn * (W / 2 - 0.30), 0.42, cabRearZ + 0.22, 0.055, stackMat); // elbow to the cab
  }

  // --- side fuel tanks: cylinders + straps + steps (old r 0.27 tanks;
  // z moved to L*0.175 so the tank clears the front wheel — see report)
  for (const sgn of [1, -1]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.1, 14), mat(0x6a7076, 0.35, 0.7));
    tank.rotation.x = Math.PI / 2;
    tank.position.set(sgn * (W / 2 - 0.05), 0.55, L * 0.175);
    tank.castShadow = true;
    g.add(tank);
    for (const dz of [-0.32, 0.32]) box(g, 0.05, 0.58, 0.07, dark, sgn * (W / 2 - 0.05), 0.55, L * 0.175 + dz).castShadow = false; // straps
    box(g, 0.30, 0.06, 0.52, chrome(), sgn * (W / 2 + 0.02), 0.40, seatZ + 0.05); // cab step
    box(g, 0.34, 0.06, 0.46, chrome(), sgn * (W / 2 + 0.04), 0.18, seatZ + 0.05);
  }

  // --- fifth wheel: deck + plate (plate z = -L*0.25, top y = 1.15)
  box(g, W * 0.8, 0.26, L * 0.34, mat(0x2e3238, 0.8, 0.2), 0, 0.99, -L * 0.21); // deck (top 1.12)
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 20), mat(0x24272c, 0.6, 0.5));
  plate.position.set(0, 1.15, -L * 0.25);
  plate.castShadow = true;
  g.add(plate);
  box(g, 0.15, 0.075, 0.42, tubMat(), 0, 1.152, -L * 0.25 - 0.18).castShadow = false; // plate throat slot
  for (const sgn of [1, -1]) box(g, 0.5, 0.34, 0.06, dark, sgn * (W / 2 - 0.28), 0.55, -L * 0.50).castShadow = false; // mudflaps
  for (const sgn of [1, -1]) box(g, 0.24, 0.12, 0.05, tailMat(), sgn * W * 0.40, 0.62, -L * 0.505).castShadow = false; // rear light bar

  // --- cab sides: mirrors, seams, handles
  truckMirrors(g, body, W / 2, 2.00, tubFront - 0.04);
  for (const sgn of [1, -1]) {
    box(g, 0.015, 0.70, 0.025, tubMat(), sgn * (W * 0.49 + 0.002), 1.05, tubRear + 0.06).castShadow = false; // door seam
    box(g, 0.02, 0.05, 0.20, dark, sgn * (W * 0.49 + 0.005), belt - 0.10, seatZ + 0.28).castShadow = false; // handle
  }

  // --- wheels (3 axles) + arch tubs: steel fronts, dually rears
  const axleZs = [L * 0.32, -L * 0.1, -L * 0.32];
  for (const az of axleZs) {
    for (const sgn of [1, -1]) archTub(g, sgn * (W / 2 - 0.07), wheelR, az, wheelR, W / 2);
  }
  axleZs.forEach((az, i) => {
    for (const sgn of [1, -1]) {
      makeWheel(g, {
        r: wheelR, w: 0.24, x: sgn * (W / 2 - 0.07), y: wheelR, z: az,
        style: i === 0 ? 'steel' : 'dually', tread: 'street', spin: v.wheelSpin,
        pivots: i === 0 ? v.wheelPivots : undefined,
      });
    }
  });
  v.wheelR = wheelR;

  // --- interior (contract: cushion 1.02, seatZ = L*0.24, cab-forward)
  buildInterior(g, v, {
    floorY: 0.74, floorW: W - 0.24, floorZFront: seatZ + 0.77, floorZRear: day ? L * 0.06 : -L * 0.02,
    cushionY: 1.02, seatZ, dashZ: seatZ + 0.62, halfW: W / 2 - 0.04,
    fabric: 0x2c2f33,
  });
}
