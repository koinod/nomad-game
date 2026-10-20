// vanModels.ts — the sedan / van / military family (CRAFT WAVE).
//
// Lofted, high-detail replacements for the old box builds in
// Vehicles.buildCarBody: family sedan, one-box utility van, V-03 Hauler
// (Stitch: reinforced charcoal cargo van), the walk-in Sprinter, the
// Goliath 6x6 APC and the battle tank. +Z is the nose everywhere.
//
// SYSTEM CONTRACTS preserved from the old branches (copied, not
// approximated):
//   wheels   axles z = ±L*0.32 (front steered → v.wheelPivots), Goliath
//            adds -L*0.1; x = ±(W/2 - 0.07); v.wheelR per vehicle below.
//   sedan    cushion top 0.60, seatZ L*0.03 (Player.ts, default car)
//   van/v03  cushion top 0.74, seatZ L*0.24 (Player.ts, cab-forward)
//   sprinter cushion top 0.80, seatZ L*0.24; v.interior, twin swing rear
//            doors and v.roofObj copied from the old branch (see buildSprinter)
//   goliath  cushion top 0.86, seatZ L*0.24; v.turret at (0, 2.2, 0.3),
//            EMPTY — MG / 40mm are bolted in by applyUpgradeVisuals
//   tank     NO wheels (tracks), v.wheelR 0.5; v.turret at
//            (0, 1.6, -L*0.02), barrel / brake / hatch / basket at the
//            old turret-local coordinates
//   glass    glassTint() everywhere — tinted, transparent, driver visible;
//            each glass band spans the driver's head (cushion + 1.04 ± 0.26)

import * as THREE from 'three';
import {
  archTub, box, buildInterior, chrome, darkTrim, decalPlane, glassDark, glassTint,
  honeycombMat, hullLoft, lampMat, makeWheel, mat, tailMat, tubMat, tube,
  type HullSection, type RimStyle,
} from './modelKit';
import type { Vehicle, VehicleDef } from './Vehicles';

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

/** Hull section from length/width fractions (+ absolute heights). */
const S = (L: number, zf: number, W: number, wf: number, yTop: number, yBot: number, exp?: number): HullSection =>
  ({ z: L * zf, halfW: W * wf, yTop, yBot, exp });

function mirrors(g: THREE.Group, W: number, y: number, z: number, body: THREE.Material, spread = 0.06): void {
  for (const sgn of [1, -1]) {
    box(g, 0.05, 0.03, 0.1, body, sgn * (W / 2 + spread - 0.02), y - 0.05, z + 0.02);
    box(g, 0.07, 0.12, 0.16, body, sgn * (W / 2 + spread + 0.02), y, z);
  }
}

function wheels(
  g: THREE.Group, v: Vehicle, W: number,
  r: number, w: number, style: RimStyle, tread: 'street' | 'at' | 'chunk',
  axles: number[],
): void {
  const x = W / 2 - 0.07;
  for (const az of axles) for (const sgn of [1, -1]) archTub(g, sgn * x, r, az, r, W / 2);
  axles.forEach((az, i) => {
    for (const sgn of [1, -1]) {
      makeWheel(g, {
        r, w, x: sgn * x, y: r, z: az, style, tread,
        spin: v.wheelSpin, pivots: i === 0 ? v.wheelPivots : undefined,
      });
    }
  });
  v.wheelR = r;
}

/** Thin dark panel-gap line on a flank (castShadow off — it is a seam). */
function seam(g: THREE.Group, x: number, y: number, z: number, h: number, d: number): void {
  box(g, 0.015, h, d, tubMat(), x, y, z).castShadow = false;
}

function exhaust(g: THREE.Group, x: number, y: number, z: number): void {
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12), chrome());
  tip.rotation.x = Math.PI / 2;
  tip.position.set(x, y, z);
  tip.castShadow = true;
  g.add(tip);
}

// ---------------------------------------------------------------------------
// SEDAN — the Stallion's 3-piece pattern at family-sedan proportions:
// taller greenhouse, a real trunk deck, four doors.
// ---------------------------------------------------------------------------

export function buildSedan(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const body = mat(def.color, 0.42, 0.4);
  const bodyDS = body.clone();
  bodyDS.side = THREE.DoubleSide;
  const dark = darkTrim();

  // shell: front clip (sloped hood) / open-top tub / rear clip (trunk deck)
  g.add(hullLoft([
    S(L, 0.50, W, 0.40, 0.70, 0.36), S(L, 0.47, W, 0.47, 0.79, 0.23),
    S(L, 0.40, W, 0.50, 0.87, 0.18), S(L, 0.32, W, 0.50, 0.93, 0.16),
    S(L, 0.24, W, 0.50, 0.97, 0.15), S(L, 0.19, W, 0.50, 0.98, 0.15),
  ], body, { capStart: true, capEnd: true }));
  g.add(hullLoft([
    S(L, 0.20, W, 0.50, 0.98, 0.15), S(L, 0.05, W, 0.50, 0.98, 0.15),
    S(L, -0.15, W, 0.50, 0.99, 0.15), S(L, -0.30, W, 0.50, 0.99, 0.16),
    S(L, -0.35, W, 0.49, 0.98, 0.16),
  ], bodyDS, { arc: [0.7, -(Math.PI - 0.7)] }));
  g.add(hullLoft([
    S(L, -0.33, W, 0.49, 0.98, 0.16), S(L, -0.40, W, 0.48, 0.96, 0.18),
    S(L, -0.47, W, 0.46, 0.92, 0.24), S(L, -0.50, W, 0.42, 0.88, 0.33),
  ], body, { capStart: true, capEnd: true }));

  // greenhouse: glass loft (head 1.64 = cushion 0.60 + 1.04, band to 1.90)
  // + a body-color roof strip over the top arc
  const glassSections = [
    S(L, 0.20, W, 0.33, 1.46, 0.82), S(L, 0.12, W, 0.40, 1.76, 0.80),
    S(L, 0.02, W, 0.42, 1.90, 0.80), S(L, -0.10, W, 0.42, 1.89, 0.80),
    S(L, -0.21, W, 0.40, 1.72, 0.82), S(L, -0.32, W, 0.34, 1.44, 0.84),
  ];
  g.add(hullLoft(glassSections, glassTint(), { seg: 28 }));
  g.add(hullLoft(
    glassSections.map((s) => ({ ...s, halfW: s.halfW + 0.015, yTop: s.yTop + 0.015 })),
    body, { seg: 12, arc: [1.02, 2.12] },
  ));
  for (const sgn of [1, -1]) {
    tube(g, sgn * W * 0.32, 1.02, L * 0.19, sgn * W * 0.39, 1.70, L * 0.13, 0.04, body); // A-pillar
    box(g, 0.05, 0.82, 0.07, dark, sgn * W * 0.425, 1.32, -L * 0.045); // B-post
    const sail = box(g, 0.09, 0.6, 0.5, body, sgn * W * 0.38, 1.3, -L * 0.29);
    sail.rotation.x = -0.5; // C-sail into the trunk deck
    // four door seams + handles + rocker
    seam(g, sgn * (W / 2 + 0.002), 0.58, L * 0.17, 0.54, 0.025);
    seam(g, sgn * (W / 2 + 0.002), 0.58, -L * 0.13, 0.54, 0.025);
    box(g, 0.02, 0.04, 0.16, dark, sgn * (W / 2 + 0.005), 0.9, L * 0.1).castShadow = false;
    box(g, 0.02, 0.04, 0.16, dark, sgn * (W / 2 + 0.005), 0.9, -L * 0.2).castShadow = false;
    box(g, 0.07, 0.14, 2.0, dark, sgn * (W / 2 - 0.03), 0.24, -L * 0.02); // rocker skirt
    exhaust(g, sgn * W * 0.28, 0.3, -L * 0.51);
  }
  box(g, 0.035, 0.07, 0.17, dark, 0, 1.94, -L * 0.08); // shark-fin antenna

  // fascias: honeycomb grille, slim lamps, full-width tail bar, valances
  box(g, W * 0.62, 0.3, 0.05, dark, 0, 0.58, L * 0.5);
  box(g, W * 0.5, 0.18, 0.06, honeycombMat(), 0, 0.58, L * 0.51);
  for (const sgn of [1, -1]) {
    box(g, 0.34, 0.1, 0.05, dark, sgn * W * 0.36, 0.8, L * 0.485);
    box(g, 0.3, 0.06, 0.03, lampMat(), sgn * W * 0.36, 0.8, L * 0.51).castShadow = false;
    box(g, 0.3, 0.08, 0.04, tailMat(), sgn * W * 0.3, 0.82, -L * 0.505).castShadow = false;
  }
  box(g, W * 0.5, 0.07, 0.04, tailMat(), 0, 0.82, -L * 0.505).castShadow = false; // tail light bar
  box(g, W * 0.92, 0.1, 0.24, body, 0, 0.9, -L * 0.46); // trunk lip
  box(g, W * 0.96, 0.18, 0.06, dark, 0, 0.32, L * 0.51); // bumpers / valances
  box(g, W * 0.96, 0.18, 0.06, dark, 0, 0.32, -L * 0.51);
  box(g, W * 0.8, 0.05, 0.3, dark, 0, 0.17, L * 0.47); // front splitter
  const badge = decalPlane('SEDAN', 0.7, 'rgba(200,205,210,0.85)', 40);
  badge.position.set(0, 0.68, -L * 0.515);
  badge.rotation.y = Math.PI;
  g.add(badge);
  mirrors(g, W, 1.24, L * 0.16, body);

  wheels(g, v, W, 0.33, 0.25, 'alloy', 'street', [L * 0.32, -L * 0.32]);

  buildInterior(g, v, {
    floorY: 0.44, floorW: 1.64, floorZFront: 0.92, floorZRear: -1.55,
    cushionY: 0.60, seatZ: L * 0.03, dashZ: 0.80, halfW: W / 2 - 0.04,
    rearBench: true, rearBenchZ: -0.85, fabric: 0x2e3134,
  });
}

// ---------------------------------------------------------------------------
// VAN — one-box cargo van: lofted sloped nose clip, slab cargo loft,
// panel seams + a sliding-door track line. Rear doors are STATIC panels
// (the old van had no door animations — none here either).
// ---------------------------------------------------------------------------

export function buildVan(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const body = mat(def.color, 0.5, 0.3);
  const dark = darkTrim();

  // sloped nose clip
  g.add(hullLoft([
    S(L, 0.50, W, 0.40, 0.66, 0.35), S(L, 0.47, W, 0.47, 0.80, 0.23),
    S(L, 0.42, W, 0.50, 0.95, 0.18), S(L, 0.36, W, 0.50, 1.09, 0.16),
    S(L, 0.30, W, 0.50, 1.21, 0.16),
  ], body, { capStart: true, capEnd: true, exp: 3.2 }));
  // lower body, full length (beltline shell under glass + cargo)
  g.add(hullLoft([
    S(L, 0.32, W, 0.50, 1.24, 0.16), S(L, 0.10, W, 0.50, 1.26, 0.15),
    S(L, -0.20, W, 0.50, 1.26, 0.15), S(L, -0.44, W, 0.50, 1.25, 0.17),
    S(L, -0.50, W, 0.48, 1.22, 0.26),
  ], body, { capStart: true, capEnd: true, exp: 3.4 }));
  // cargo upper: slab loft to the roof (head 1.78 = 0.74 + 1.04, roof 2.14)
  g.add(hullLoft([
    S(L, 0.18, W, 0.495, 2.12, 1.05), S(L, 0.0, W, 0.50, 2.14, 1.05),
    S(L, -0.30, W, 0.50, 2.14, 1.05), S(L, -0.47, W, 0.495, 2.12, 1.05),
    S(L, -0.50, W, 0.48, 2.06, 1.05),
  ], body, { capStart: true, capEnd: true, exp: 3.6 }));

  // cab glass band (spans the driver's head, 1.52–2.04) + roof strip
  const glassSections = [
    S(L, 0.36, W, 0.35, 1.60, 1.04), S(L, 0.30, W, 0.44, 1.95, 1.02),
    S(L, 0.24, W, 0.47, 2.04, 1.02), S(L, 0.18, W, 0.48, 2.05, 1.02),
  ];
  g.add(hullLoft(glassSections, glassTint(), { seg: 28 }));
  g.add(hullLoft(
    glassSections.map((s) => ({ ...s, halfW: s.halfW + 0.015, yTop: s.yTop + 0.015 })),
    body, { seg: 12, arc: [1.02, 2.12] },
  ));
  for (const sgn of [1, -1]) tube(g, sgn * W * 0.34, 1.2, L * 0.35, sgn * W * 0.46, 1.98, L * 0.25, 0.04, body);

  // face
  box(g, W * 0.66, 0.22, 0.06, dark, 0, 0.52, L * 0.505); // grille
  for (const sgn of [1, -1]) {
    box(g, 0.32, 0.11, 0.05, lampMat(), sgn * W * 0.34, 0.8, L * 0.5);
    box(g, 0.08, 0.36, 0.05, tailMat(), sgn * W * 0.44, 1.08, -L * 0.505);
    exhaust(g, sgn * W * 0.3, 0.26, -L * 0.52);
  }
  box(g, W * 0.98, 0.24, 0.12, dark, 0, 0.32, L * 0.51); // bumpers
  box(g, W * 0.98, 0.24, 0.12, dark, 0, 0.32, -L * 0.51);

  // panel seams: cab doors, cargo panel joints, roof ribs
  for (const sgn of [1, -1]) {
    seam(g, sgn * (W / 2 + 0.002), 0.85, L * 0.31, 0.9, 0.025);
    seam(g, sgn * (W / 2 + 0.002), 1.55, -L * 0.08, 1.7, 0.025);
    seam(g, sgn * (W / 2 + 0.002), 1.55, -L * 0.34, 1.7, 0.025);
    box(g, 0.02, 0.04, 0.16, dark, sgn * (W / 2 + 0.005), 1.05, L * 0.2).castShadow = false; // handles
  }
  for (let i = 0; i < 3; i++) box(g, W * 0.9, 0.03, 0.09, dark, 0, 2.16, -L * 0.3 + i * L * 0.18).castShadow = false;
  // sliding-door track line + door outline (right flank, +X)
  box(g, 0.02, 0.035, 1.5, dark, W / 2 + 0.008, 1.32, -L * 0.14).castShadow = false;
  seam(g, W / 2 + 0.002, 1.3, L * 0.02, 1.55, 0.025);
  seam(g, W / 2 + 0.002, 1.3, -L * 0.3, 1.55, 0.025);
  box(g, 0.02, 0.05, 0.2, dark, W / 2 + 0.008, 1.06, -L * 0.02).castShadow = false; // slider handle
  // rear doors: static panels — center seam, hinges, handles, plate
  box(g, 0.04, 1.6, 0.04, dark, 0, 1.3, -L * 0.502).castShadow = false;
  for (const sgn of [1, -1]) {
    box(g, 0.05, 0.16, 0.05, dark, sgn * (W / 2 - 0.03), 1.85, -L * 0.505).castShadow = false;
    box(g, 0.05, 0.16, 0.05, dark, sgn * (W / 2 - 0.03), 0.75, -L * 0.505).castShadow = false;
    box(g, 0.16, 0.04, 0.03, dark, sgn * 0.12, 1.28, -L * 0.51).castShadow = false;
  }
  const sideDecal = decalPlane('NOMAD CARGO', 1.6, 'rgba(70,76,82,0.8)', 40);
  sideDecal.position.set(-W / 2 - 0.012, 1.62, -L * 0.2);
  sideDecal.rotation.y = -Math.PI / 2;
  g.add(sideDecal);
  mirrors(g, W, 1.42, L * 0.3, body, 0.08);

  wheels(g, v, W, 0.36, 0.24, 'steel', 'street', [L * 0.32, -L * 0.32]);

  buildInterior(g, v, {
    floorY: 0.58, floorW: 1.84, floorZFront: 2.14, floorZRear: -0.8,
    cushionY: 0.74, seatZ: L * 0.24, dashZ: L * 0.24 + 0.62, halfW: W / 2 - 0.04,
    fabric: 0x2e3134,
  });
}

// ---------------------------------------------------------------------------
// V-03 HAULER — the van's armored sibling (Stitch): charcoal plated cargo
// box (loft exp ≈ 2.4), riveted flank plates, barred rear windows, brush
// guard, heavy bumpers, big storage identity.
// ---------------------------------------------------------------------------

export function buildV03(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const body = mat(def.color, 0.6, 0.4);
  const plate = mat(0x232629, 0.5, 0.5);
  const dark = darkTrim();

  // lofted cab: sloped nose clip + beltline shell
  g.add(hullLoft([
    S(L, 0.50, W, 0.40, 0.66, 0.35), S(L, 0.47, W, 0.47, 0.80, 0.23),
    S(L, 0.42, W, 0.50, 0.95, 0.18), S(L, 0.36, W, 0.50, 1.09, 0.16),
    S(L, 0.30, W, 0.50, 1.21, 0.16),
  ], body, { capStart: true, capEnd: true, exp: 3.0 }));
  g.add(hullLoft([
    S(L, 0.32, W, 0.50, 1.24, 0.16), S(L, 0.10, W, 0.50, 1.26, 0.15),
    S(L, -0.20, W, 0.50, 1.26, 0.15), S(L, -0.44, W, 0.50, 1.25, 0.17),
    S(L, -0.50, W, 0.48, 1.22, 0.26),
  ], body, { capStart: true, capEnd: true, exp: 3.2 }));
  // armored cargo box: faceted superellipse loft, plate seams in the skin
  g.add(hullLoft([
    S(L, 0.18, W, 0.495, 2.2, 1.02), S(L, 0.0, W, 0.50, 2.24, 1.02),
    S(L, -0.30, W, 0.50, 2.24, 1.02), S(L, -0.47, W, 0.495, 2.22, 1.02),
    S(L, -0.50, W, 0.48, 2.14, 1.02),
  ], body, { capStart: true, capEnd: true, exp: 2.4 }));
  box(g, 0.85, 0.08, 0.85, plate, 0, 2.28, -L * 0.08); // roof hatch (old V-03)

  // cab glass band (head 1.78, band to 2.04) + roof strip
  const glassSections = [
    S(L, 0.36, W, 0.35, 1.60, 1.04), S(L, 0.30, W, 0.44, 1.95, 1.02),
    S(L, 0.24, W, 0.47, 2.04, 1.02), S(L, 0.18, W, 0.48, 2.05, 1.02),
  ];
  g.add(hullLoft(glassSections, glassTint(), { seg: 28 }));
  g.add(hullLoft(
    glassSections.map((s) => ({ ...s, halfW: s.halfW + 0.015, yTop: s.yTop + 0.015 })),
    plate, { seg: 12, arc: [1.02, 2.12] },
  ));
  for (const sgn of [1, -1]) tube(g, sgn * W * 0.34, 1.2, L * 0.35, sgn * W * 0.46, 1.98, L * 0.25, 0.045, plate);

  // riveted armor plates over cargo flanks + cab doors, plate seams, steps
  const rivet = (x: number, y: number, z: number) => box(g, 0.025, 0.025, 0.025, dark, x, y, z).castShadow = false;
  for (const sgn of [1, -1]) {
    box(g, 0.04, 1.14, L * 0.52, plate, sgn * (W / 2 + 0.015), 1.38, -L * 0.16);
    box(g, 0.04, 0.78, 0.92, plate, sgn * (W / 2 + 0.01), 0.92, L * 0.33);
    box(g, 0.34, 0.07, L * 0.54, plate, sgn * (W / 2 - 0.2), 2.0, -L * 0.16); // plate top rail (old)
    for (let i = 0; i < 5; i++) {
      rivet(sgn * (W / 2 + 0.04), 0.9, -L * 0.38 + i * L * 0.11);
      rivet(sgn * (W / 2 + 0.04), 1.86, -L * 0.38 + i * L * 0.11);
    }
    seam(g, sgn * (W / 2 + 0.002), 1.6, -L * 0.3, 1.8, 0.03); // cargo plate seam
    box(g, 0.3, 0.06, 0.8, plate, sgn * (W / 2 + 0.1), 0.3, L * 0.3); // side step (old)
    exhaust(g, sgn * W * 0.3, 0.26, -L * 0.52);
  }
  // marker lights on the cab brow (old V-03)
  for (const mx of [-0.5, 0, 0.5]) box(g, 0.14, 0.06, 0.04, mat(0xd88f2e, 0.4, 0.1), mx, 1.98, L * 0.485).castShadow = false;

  // face + brush guard (old V-03 geometry, plate material)
  box(g, W * 0.7, 0.22, 0.06, dark, 0, 0.52, L * 0.51);
  for (const sgn of [1, -1]) box(g, 0.3, 0.1, 0.05, lampMat(), sgn * W * 0.34, 0.78, L * 0.51);
  for (const bx of [-0.52, 0, 0.52]) box(g, 0.07, 0.72, 0.07, plate, bx, 0.62, L * 0.55);
  for (const by of [0.34, 0.62, 0.9]) box(g, W * 0.62, 0.07, 0.07, plate, 0, by, L * 0.55);
  box(g, W, 0.3, 0.14, plate, 0, 0.3, L * 0.52); // heavy bumpers (old)
  box(g, W, 0.3, 0.14, plate, 0, 0.3, -L * 0.52);

  // rear doors with barred windows (old V-03): center seam, glass, 3 bars
  box(g, 0.04, 1.55, 0.05, dark, 0, 1.32, -L * 0.485).castShadow = false;
  for (const sgn of [1, -1]) {
    box(g, 0.08, 0.36, 0.05, tailMat(), sgn * W * 0.44, 1.05, -L * 0.51);
    const win = box(g, 0.44, 0.4, 0.03, glassDark(), sgn * W * 0.24, 1.72, -L * 0.49);
    win.castShadow = false;
    for (let i = 0; i < 3; i++) box(g, 0.46, 0.045, 0.04, plate, sgn * W * 0.24, 1.58 + i * 0.14, -L * 0.495).castShadow = false;
    box(g, 0.16, 0.04, 0.03, dark, sgn * 0.12, 1.1, -L * 0.51).castShadow = false;
  }
  const v03Decal = decalPlane('V-03', 0.9, 'rgba(200,205,210,0.75)', 44);
  v03Decal.position.set(W / 2 + 0.04, 1.62, -L * 0.16);
  v03Decal.rotation.y = Math.PI / 2;
  g.add(v03Decal);
  mirrors(g, W, 1.42, L * 0.3, body, 0.08);

  wheels(g, v, W, 0.38, 0.27, 'offroad', 'at', [L * 0.32, -L * 0.32]);

  buildInterior(g, v, {
    floorY: 0.58, floorW: 1.94, floorZFront: 2.3, floorZRear: -0.8,
    cushionY: 0.74, seatZ: L * 0.24, dashZ: L * 0.24 + 0.62, halfW: W / 2 - 0.04,
    fabric: 0x35382f,
  });
}

// ---------------------------------------------------------------------------
// SPRINTER — lofted cab + a HOLLOW walk-in cargo box. The cargo shell,
// the interior spec, the rear-door pivots and the roof object are the
// old branch's contracts, copied exactly (see the marked block).
// ---------------------------------------------------------------------------

export function buildSprinter(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const body = mat(def.color, 0.5, 0.35);
  const dark = darkTrim();
  const inner = mat(0x59616a, 0.9, 0.05);

  // --- lofted cab: sloped nose clip + beltline shell + glass band ---
  g.add(hullLoft([
    S(L, 0.50, W, 0.40, 0.68, 0.35), S(L, 0.475, W, 0.47, 0.84, 0.23),
    S(L, 0.44, W, 0.50, 1.0, 0.18), S(L, 0.40, W, 0.50, 1.16, 0.16),
    S(L, 0.36, W, 0.50, 1.32, 0.16),
  ], body, { capStart: true, capEnd: true, exp: 3.2 }));
  g.add(hullLoft([
    S(L, 0.37, W, 0.50, 1.3, 0.16), S(L, 0.30, W, 0.50, 1.31, 0.15),
    S(L, 0.23, W, 0.50, 1.31, 0.15),
  ], body, { capStart: true, capEnd: true, exp: 3.4 }));
  // cab glass (head 1.84 = cushion 0.80 + 1.04, band to 2.10) + roof strip
  const glassSections = [
    S(L, 0.37, W, 0.35, 1.64, 1.1), S(L, 0.33, W, 0.44, 1.98, 1.08),
    S(L, 0.29, W, 0.47, 2.09, 1.08), S(L, 0.24, W, 0.48, 2.1, 1.08),
  ];
  g.add(hullLoft(glassSections, glassTint(), { seg: 28 }));
  g.add(hullLoft(
    glassSections.map((s) => ({ ...s, halfW: s.halfW + 0.015, yTop: s.yTop + 0.015 })),
    body, { seg: 12, arc: [1.02, 2.12] },
  ));
  for (const sgn of [1, -1]) tube(g, sgn * W * 0.34, 1.24, L * 0.36, sgn * W * 0.46, 2.0, L * 0.30, 0.04, body);
  box(g, W * 0.66, 0.2, 0.06, dark, 0, 0.5, L * 0.51); // grille (old sprinter)
  for (const sgn of [1, -1]) {
    box(g, 0.3, 0.1, 0.05, lampMat(), sgn * W * 0.34, 0.76, L * 0.51);
    box(g, 0.07, 0.34, 0.05, tailMat(), sgn * W * 0.44, 1.0, -L * 0.51);
    exhaust(g, sgn * W * 0.3, 0.26, -L * 0.52);
  }
  box(g, W, 0.24, 0.12, dark, 0, 0.32, L * 0.52); // front bumper (old)
  mirrors(g, W, 1.5, L * 0.44, body, 0.08); // old sprinter mirror placement

  // --- cargo shell: floor / walls / roof / front wall — COPIED from the
  // old branch (floor top 0.56, cz/cd, wall + roof heights all exact) ---
  const cz = -L * 0.13;
  const cd = L * 0.72;
  box(g, W * 0.96, 0.08, cd, inner, 0, 0.52, cz); // floor (top ≈ 0.56)
  box(g, 0.07, 1.62, cd, body, -(W / 2 - 0.035), 1.37, cz);
  box(g, 0.07, 1.62, cd, body, W / 2 - 0.035, 1.37, cz);
  const roofS = box(g, W, 0.07, cd, body, 0, 2.21, cz);
  v.roofObj = roofS; // hidden while the player is inside, camera outside
  box(g, W, 1.62, 0.07, body, 0, 1.37, cz + cd / 2); // front wall (behind cab)
  box(g, W, 0.26, 0.07, body, 0, 2.05, cz - cd / 2); // header over the doors
  // interior ribs + a work light so the inside reads as a space (old)
  for (let i = 0; i < 3; i++) box(g, W * 0.9, 0.05, 0.08, inner, 0, 2.14, cz - cd * 0.3 + i * cd * 0.3);
  box(g, 0.3, 0.04, 0.12, mat(0xd8cf9a, 0.4, 0), 0, 2.15, cz); // cargo lamp
  // exterior dressing on the shell: sliding-door track + panel seams
  box(g, 0.02, 0.035, 1.6, dark, W / 2 + 0.008, 1.34, L * 0.05).castShadow = false;
  for (const sgn of [1, -1]) {
    seam(g, sgn * (W / 2 + 0.002), 1.5, -L * 0.28, 1.66, 0.025);
    box(g, 0.02, 0.04, 0.16, dark, sgn * (W / 2 + 0.005), 1.02, L * 0.3).castShadow = false; // cab handles
  }
  // twin rear doors, hinged at the sides — OLD pivot geometry, copied:
  // pivot at the wall edge, leaf offset half its width back to center.
  for (const sgn of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sgn * (W / 2 - 0.03), 1.28, cz - cd / 2);
    g.add(pivot);
    const leaf = box(pivot, W / 2 - 0.05, 1.5, 0.05, body, -sgn * (W / 4 - 0.01), 0, 0);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), glassTint());
    win.position.set(0, 0.42, -0.04);
    leaf.add(win); // door window (glassTint per the craft standard)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.03), dark);
    handle.position.set(sgn * 0.32, 0, -0.045);
    leaf.add(handle); // door handle
    v.doors.push({ obj: pivot, kind: sgn > 0 ? 'swing-l' : 'swing-r', base: 0, t: 0, target: 0 });
  }
  // walk-in interior volume — COPIED from the old branch
  v.interior = { halfW: W / 2 - 0.17, zFront: L * 0.2, zRear: -L * 0.47, floorY: 0.56, doorHalfW: W / 2 - 0.08 };

  wheels(g, v, W, 0.36, 0.24, 'steel', 'street', [L * 0.32, -L * 0.32]);

  // cab interior: a separate front section (its own seats/dash in front
  // of the cargo front wall at cz + cd/2); the bay stays open behind it
  buildInterior(g, v, {
    floorY: 0.64, floorW: 1.9, floorZFront: 2.32, floorZRear: cz + cd / 2,
    cushionY: 0.80, seatZ: L * 0.24, dashZ: L * 0.24 + 0.62, halfW: W / 2 - 0.04,
    fabric: 0x2e3134,
  });
}

// ---------------------------------------------------------------------------
// GOLIATH — 6x6 APC: faceted armored loft (lower exp ≈ 2.3), sloped
// glacis, viewport glass slits, stowage + rear spare + antenna (old
// branch, reshaped). v.turret stays EMPTY for the upgrade weapons.
// ---------------------------------------------------------------------------

export function buildGoliath(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const color = def.color;
  const armor = mat(color, 0.9, 0.1); // old branch armor material
  const armorDS = armor.clone();
  armorDS.side = THREE.DoubleSide;
  const darkArmor = mat(0x2e3238, 0.8, 0.2);
  const stowage = mat(0x454d3c, 0.9, 0.1);

  // lower hull: armored facets (exp 2.3)
  g.add(hullLoft([
    S(L, 0.50, W, 0.40, 1.02, 0.40), S(L, 0.46, W, 0.49, 1.14, 0.30),
    S(L, 0.30, W, 0.50, 1.28, 0.28), S(L, 0.0, W, 0.50, 1.36, 0.28),
    S(L, -0.30, W, 0.50, 1.36, 0.30), S(L, -0.47, W, 0.49, 1.28, 0.37),
    S(L, -0.50, W, 0.45, 1.20, 0.45),
  ], armor, { capStart: true, capEnd: true, exp: 2.3 }));
  // upper hull: tapered, sloped shoulders
  g.add(hullLoft([
    S(L, 0.42, W, 0.43, 1.94, 1.18), S(L, 0.30, W, 0.46, 2.07, 1.18),
    S(L, 0.0, W, 0.46, 2.13, 1.18), S(L, -0.30, W, 0.46, 2.13, 1.18),
    S(L, -0.46, W, 0.44, 2.05, 1.18),
  ], armor, { capStart: true, capEnd: true, exp: 2.6 }));
  // sloped glacis plate over the nose (old branch plate, reshaped to fit)
  const glacis = box(g, W * 0.9, 1.05, 0.13, armor, 0, 1.52, L * 0.435);
  glacis.rotation.x = -0.5;
  // viewport glass slits: driver head at y 1.90 → slits span 1.74–2.04,
  // laid on the glacis slope; side slits at the driver's station too
  for (const sgn of [1, -1]) {
    const slit = box(g, 0.44, 0.3, 0.04, glassTint(), sgn * W * 0.22, 1.89, L * 0.468);
    slit.rotation.x = -0.5;
    slit.castShadow = false;
    const sideSlit = box(g, 0.04, 0.26, 0.5, glassDark(), sgn * (W * 0.46 + 0.01), 1.89, L * 0.24);
    sideSlit.castShadow = false;
    box(g, 0.28, 0.07, 0.05, lampMat(), sgn * W * 0.3, 1.28, L * 0.5); // light slits (old)
    const skirt = box(g, 0.06, 0.55, L * 0.7, armor, sgn * (W / 2 + 0.03), 0.62, 0); // side skirts (old)
    skirt.rotation.z = sgn * 0.12;
    // hull stowage boxes (old)
    box(g, 0.18, 0.4, 1.6, stowage, sgn * (W / 2 + 0.02), 1.15, -L * 0.28);
    box(g, 0.16, 0.3, 0.9, stowage, sgn * (W / 2 + 0.01), 1.62, L * 0.05);
  }
  // open hatch above the driver (seat visible through it + the slits):
  // a rim frame at the hull top over the driver's station, no cover
  const hatchZ = L * 0.24;
  for (const [hx, hz, hw, hd] of [
    [0.38, hatchZ - 0.34, 0.82, 0.07], [0.38, hatchZ + 0.34, 0.82, 0.07],
    [0.38 - 0.38, hatchZ, 0.07, 0.62], [0.38 + 0.38, hatchZ, 0.07, 0.62],
  ] as const) box(g, hw, 0.07, hd, darkArmor, hx, 2.16, hz);
  // turret ring + hatch — OLD positions; the turret GROUP stays empty
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.16, 12), darkArmor);
  ring.position.set(0, 2.12, 0.3);
  ring.castShadow = true;
  g.add(ring);
  box(g, 0.85, 0.1, 0.85, darkArmor, 0, 2.22, 0.3); // hatch (old)
  const turret = new THREE.Group();
  turret.position.set(0, 2.2, 0.3); // CONTRACT: applyUpgradeVisuals bolts weapons here
  g.add(turret);
  v.turret = turret;
  // rear spare + antenna (old branch, reshaped with a hub)
  const gspare = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.24, 14), mat(0x1e1e22, 1, 0));
  gspare.rotation.x = Math.PI / 2;
  gspare.position.set(0, 1.1, -L / 2 - 0.1);
  gspare.castShadow = true;
  g.add(gspare);
  const spareHub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 10), darkArmor);
  spareHub.rotation.x = Math.PI / 2;
  spareHub.position.set(0, 1.1, -L / 2 - 0.1);
  g.add(spareHub);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.7, 5), mat(0x1c1f24, 0.8, 0));
  antenna.position.set(-W * 0.36, 2.8, -L * 0.32);
  antenna.rotation.z = 0.08;
  g.add(antenna);
  // exhaust stack + tow points
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10), darkArmor);
  stack.position.set(-W * 0.4, 1.5, -L * 0.42);
  stack.castShadow = true;
  g.add(stack);
  for (const sgn of [1, -1]) box(g, 0.12, 0.1, 0.08, darkArmor, sgn * W * 0.3, 0.5, L * 0.51);

  wheels(g, v, W, 0.46, 0.34, 'offroad', 'at', [L * 0.32, -L * 0.1, -L * 0.32]);

  // minimal military cab: bench, dash, turning wheel (kit interior)
  buildInterior(g, v, {
    floorY: 0.70, floorW: 2.3, floorZFront: 2.3, floorZRear: 0.35,
    cushionY: 0.86, seatZ: L * 0.24, dashZ: L * 0.24 + 0.62, halfW: W / 2 - 0.04,
    bench: true, fabric: 0x3a4030,
  });
}

// ---------------------------------------------------------------------------
// TANK — tracked armor. NO wheels: the old branch's track housings, road
// wheels (deliberately NOT registered in v.wheelSpin), turret position,
// barrel, muzzle brake, hatch and basket are copied exactly; the hull
// and turret shells are reshaped (low-exp lofts + angled glacis plates).
// ERA / reactive armor is an upgrade visual — base surfaces stay clean.
// ---------------------------------------------------------------------------

export function buildTank(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const armor = mat(def.color, 0.85, 0.25); // old branch armor material
  const trackM = mat(0x22241f, 1, 0);
  const roadM = mat(0x363a31, 0.9, 0.1);

  // tracks — OLD branch geometry, copied (housings, 5 road wheels/side,
  // top skirts); road wheels are modeled, never spin-registered
  for (const sgn of [1, -1]) {
    box(g, 0.62, 0.95, L * 0.98, trackM, sgn * (W / 2 - 0.31), 0.55, 0); // track housing
    for (let i = 0; i < 5; i++) {
      const rw = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.66, 10), roadM);
      rw.rotation.z = Math.PI / 2;
      rw.position.set(sgn * (W / 2 - 0.31), 0.36, -L * 0.36 + i * L * 0.18);
      rw.castShadow = true;
      g.add(rw);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.68, 8), trackM);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(rw.position);
      g.add(hub);
    }
    // return rollers along the top run (new detail, same registration rule)
    for (let i = 0; i < 3; i++) {
      const rr = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.64, 8), roadM);
      rr.rotation.z = Math.PI / 2;
      rr.position.set(sgn * (W / 2 - 0.31), 0.9, -L * 0.3 + i * L * 0.3);
      g.add(rr);
    }
    // drive sprocket + idler caps at the run ends
    for (const ez of [L * 0.44, -L * 0.44]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.64, 10), roadM);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(sgn * (W / 2 - 0.31), 0.58, ez);
      g.add(cap);
    }
    box(g, 0.66, 0.16, L * 0.9, armor, sgn * (W / 2 - 0.31), 1.1, 0); // track top skirt (old)
  }

  // hull: low-exp loft (angled flanks) + the old sloped glacis plate
  g.add(hullLoft([
    S(L, 0.50, W, 0.27, 1.26, 0.74), S(L, 0.44, W, 0.36, 1.42, 0.68),
    S(L, 0.20, W, 0.36, 1.45, 0.67), S(L, -0.20, W, 0.36, 1.45, 0.67),
    S(L, -0.44, W, 0.36, 1.42, 0.68), S(L, -0.50, W, 0.33, 1.34, 0.74),
  ], armor, { capStart: true, capEnd: true, exp: 2.2 }));
  const glacis = box(g, W * 0.72, 0.72, 0.12, armor, 0, 1.02, L * 0.47); // old glacis
  glacis.rotation.x = -0.45; // sloped nose
  box(g, W * 0.7, 0.16, L * 0.52, armor, 0, 1.52, -L * 0.12); // rear deck (old)
  for (let i = 0; i < 4; i++) box(g, W * 0.6, 0.03, 0.09, trackM, 0, 1.62, -L * 0.3 + i * 0.22).castShadow = false; // deck grilles
  for (const sgn of [1, -1]) {
    box(g, 0.24, 0.06, 0.05, lampMat(), sgn * W * 0.26, 1.24, L * 0.52); // headlights (old)
    box(g, 0.1, 0.22, 0.6, mat(0x454d3c, 0.9, 0.1), sgn * (W * 0.36 + 0.02), 1.2, -L * 0.3); // hull stowage
    exhaust(g, sgn * W * 0.2, 0.9, -L * 0.51);
  }

  // turret — GROUP POSITION COPIED from the old branch
  const turret = new THREE.Group();
  turret.position.set(0, 1.6, -L * 0.02);
  g.add(turret);
  // reshaped turret shell: faceted loft, angled cheeks (old slab was
  // 1.7 × 0.52 × 2.2 at (0, 0.26, -0.1) — same footprint / height band)
  turret.add(hullLoft([
    { z: 1.05, halfW: 0.30, yTop: 0.60, yBot: 0.04 },
    { z: 0.60, halfW: 0.44, yTop: 0.57, yBot: 0.0 },
    { z: -0.20, halfW: 0.46, yTop: 0.55, yBot: 0.0 },
    { z: -1.00, halfW: 0.42, yTop: 0.52, yBot: 0.0 },
    { z: -1.20, halfW: 0.35, yTop: 0.47, yBot: 0.04 },
  ], armor, { capStart: true, capEnd: true, exp: 2.4 }));
  // main cannon + muzzle brake — OLD turret-local geometry, copied
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.115, 3.4, 10), mat(0x3a3e35, 0.55, 0.4));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.34, 2.35);
  barrel.castShadow = true;
  turret.add(barrel);
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 10), mat(0x2c2f29, 0.7, 0.3));
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, 0.34, 3.85);
  turret.add(brake);
  const fume = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 10), mat(0x3a3e35, 0.55, 0.4));
  fume.rotation.x = Math.PI / 2;
  fume.position.set(0, 0.34, 1.6);
  turret.add(fume);
  // commander hatch — OLD turret-local position, copied: (0.32, 0.57, -0.35)
  box(turret, 0.62, 0.1, 0.62, mat(0x2c2f29, 0.8, 0.2), 0.32, 0.57, -0.35);
  const hatchRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 18), mat(0x2c2f29, 0.8, 0.2));
  hatchRing.rotation.x = Math.PI / 2;
  hatchRing.position.set(0.32, 0.53, -0.35);
  turret.add(hatchRing);
  box(turret, 1.2, 0.3, 0.5, mat(0x454d3c, 0.9, 0.1), 0, 0.3, -1.35); // turret basket stowage (old)
  // coax MG stub, periscopes, turret antenna
  const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), mat(0x2c2f29, 0.7, 0.3));
  coax.rotation.x = Math.PI / 2;
  coax.position.set(0.28, 0.34, 1.3);
  turret.add(coax);
  for (const px of [-0.3, 0.05]) box(turret, 0.14, 0.06, 0.1, glassDark(), px, 0.6, 0.55).castShadow = false;
  const tAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.016, 1.3, 5), mat(0x1c1f24, 0.8, 0));
  tAnt.position.set(-0.7, 1.1, -0.9);
  tAnt.rotation.z = 0.06;
  turret.add(tAnt);

  v.turret = turret;
  v.wheelR = 0.5; // old branch: the tank rolls on its modeled tracks
}
