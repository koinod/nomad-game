// carModels.ts — the Stallion family (CRAFT WAVE, pinned flagship).
//
// One lofted S650-style shell, THREE cars (design-refs/stallion/):
//   Base Model        — matte slate, stock spawn at the depot
//   FX Package        — Adriatic teal hero: white rally wheels, hood vent,
//                       glass roof panel, tri-bar lamps, blade spoiler
//   Convoy Combat Ed. — NOT a spawn: what the upgrade tree does to a
//                       Stallion (armor → riveted plates + ballistic
//                       louvers, engine_tune → exposed supercharger,
//                       bullbar → spiked ram bar + winch, mg_mount →
//                       roof pintle gun, cargo_racks → decklid rack)
//
// Interior contract (Player.ts must agree): cushion top 0.46, driver hip
// at seatZ 0.14 (= L*0.03), head center 1.50 inside the glass band,
// steering wheel from modelKit.buildInterior turns with the steer angle.

import * as THREE from 'three';
import {
  archTub, box, buildInterior, chrome, darkTrim, decalPlane, glassDark, glassTint,
  honeycombMat, hullLoft, lampMat, makeWheel, mat, tailMat, tubMat, tube,
} from './modelKit';
import type { Vehicle, VehicleDef } from './Vehicles';

export function buildStallion(g: THREE.Group, def: VehicleDef, v: Vehicle): void {
  const L = def.length;
  const W = def.width;
  const fx = v.variant === 'fx';
  const body = fx
    ? mat(0x10b5a6, 0.32, 0.55) // Adriatic teal metallic
    : mat(def.color, 0.52, 0.35); // matte slate charcoal
  const bodyDS = body.clone();
  bodyDS.side = THREE.DoubleSide;
  const dark = darkTrim();

  // --- shell: front clip (hood) / open tub (cabin) / rear clip (haunches)
  g.add(hullLoft([
    { z: 2.40, halfW: 0.74, yTop: 0.70, yBot: 0.34 },
    { z: 2.25, halfW: 0.86, yTop: 0.78, yBot: 0.22 },
    { z: 1.90, halfW: 0.92, yTop: 0.86, yBot: 0.17 },
    { z: 1.54, halfW: 0.94, yTop: 0.92, yBot: 0.155 },
    { z: 1.10, halfW: 0.95, yTop: 0.96, yBot: 0.15 },
    { z: 0.92, halfW: 0.95, yTop: 0.97, yBot: 0.15 },
  ], body, { capStart: true, capEnd: true }));
  // open-top tub: sweep under the bottom so the cabin is a real cavity
  g.add(hullLoft([
    { z: 1.00, halfW: 0.95, yTop: 0.97, yBot: 0.15 },
    { z: 0.40, halfW: 0.95, yTop: 0.97, yBot: 0.15 },
    { z: -0.60, halfW: 0.95, yTop: 0.98, yBot: 0.15 },
    { z: -1.20, halfW: 0.95, yTop: 0.99, yBot: 0.15 },
    { z: -1.62, halfW: 0.94, yTop: 0.97, yBot: 0.16 },
  ], bodyDS, { arc: [0.7, -(Math.PI - 0.7)] }));
  g.add(hullLoft([
    { z: -1.55, halfW: 0.94, yTop: 0.97, yBot: 0.16 },
    { z: -1.90, halfW: 0.93, yTop: 0.95, yBot: 0.17 },
    { z: -2.25, halfW: 0.90, yTop: 0.90, yBot: 0.24 },
    { z: -2.40, halfW: 0.84, yTop: 0.85, yBot: 0.32 },
  ], body, { capStart: true, capEnd: true }));

  // --- greenhouse: tinted glass loft + roof strip (FX: glass roof)
  const glassSections = [
    { z: 1.00, halfW: 0.60, yTop: 1.24, yBot: 0.80 },
    { z: 0.60, halfW: 0.74, yTop: 1.56, yBot: 0.78 },
    { z: 0.15, halfW: 0.79, yTop: 1.71, yBot: 0.78 },
    { z: -0.45, halfW: 0.80, yTop: 1.70, yBot: 0.78 },
    { z: -1.05, halfW: 0.77, yTop: 1.56, yBot: 0.78 },
    { z: -1.55, halfW: 0.68, yTop: 1.30, yBot: 0.80 },
  ];
  g.add(hullLoft(glassSections, glassTint(), { seg: 28 }));
  const roofMat = fx ? glassDark() : body;
  g.add(hullLoft(
    glassSections.map((s) => ({ ...s, halfW: s.halfW + 0.015, yTop: s.yTop + 0.015 })),
    roofMat, { seg: 12, arc: [1.02, 2.12] },
  ));
  // pillars: A tubes, B posts, C sails
  for (const sgn of [1, -1]) {
    tube(g, sgn * 0.58, 1.00, 0.95, sgn * 0.75, 1.58, 0.40, 0.045, body);
    box(g, 0.05, 0.78, 0.07, dark, sgn * 0.80, 1.24, -0.14);
    const sail = box(g, 0.09, 0.58, 0.52, body, sgn * 0.73, 1.28, -1.30);
    sail.rotation.x = -0.52;
  }
  // shark-fin antenna on the roof strip
  box(g, 0.035, 0.07, 0.17, dark, 0, 1.76, -0.55);

  // --- fascias
  box(g, 1.32, 0.44, 0.05, dark, 0, 0.60, 2.375); // grille surround
  box(g, 1.16, 0.30, 0.06, honeycombMat(), 0, 0.60, 2.40); // hex grille
  const pony = box(g, 0.16, 0.07, 0.02, chrome(), 0, 0.60, 2.44);
  pony.castShadow = false;
  for (const sgn of [1, -1]) {
    box(g, 0.36, 0.13, 0.05, dark, sgn * 0.68, 0.81, 2.335); // lamp housing
    for (let i = 0; i < 3; i++) {
      const bar = box(g, 0.045, 0.085, 0.03, lampMat(), sgn * (0.60 + i * 0.075), 0.81, 2.365);
      bar.castShadow = false;
    }
    const tail = box(g, 0.05, 0.27, 0.04, tailMat(), sgn * 0.60, 0.76, -2.425);
    tail.castShadow = false;
    const tail2 = box(g, 0.05, 0.27, 0.04, tailMat(), sgn * 0.68, 0.76, -2.425);
    tail2.castShadow = false;
    const tail3 = box(g, 0.05, 0.27, 0.04, tailMat(), sgn * 0.52, 0.76, -2.425);
    tail3.castShadow = false;
    // exhaust tips (FX: quad)
    const tip = (ex: number) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 12), chrome());
      t.rotation.x = Math.PI / 2;
      t.position.set(ex, 0.30, -2.44);
      t.castShadow = true;
      g.add(t);
    };
    tip(sgn * 0.58);
    if (fx) tip(sgn * 0.44);
    // mirrors
    box(g, 0.05, 0.03, 0.1, body, sgn * 0.99, 1.0, 0.80);
    box(g, 0.07, 0.11, 0.16, body, sgn * 1.03, 1.05, 0.78);
    // door seam + handle + quarter seam (panel gaps read as separate panels)
    box(g, 0.015, 0.52, 0.025, tubMat(), sgn * 0.952, 0.58, 0.60).castShadow = false;
    box(g, 0.015, 0.5, 0.025, tubMat(), sgn * 0.952, 0.58, -0.88).castShadow = false;
    box(g, 0.02, 0.04, 0.17, dark, sgn * 0.955, 0.84, 0.30).castShadow = false;
    // rocker skirt
    box(g, 0.07, 0.15, 2.1, dark, sgn * 0.92, 0.23, -0.30);
  }
  box(g, 1.55, 0.36, 0.06, dark, 0, 0.75, -2.40); // tail panel
  box(g, 1.6, 0.17, 0.05, dark, 0, 0.30, -2.40); // rear valance
  box(g, 1.5, 0.16, 0.06, tubMat(), 0, 0.35, 2.36); // lower intake
  box(g, 1.72, 0.05, 0.32, dark, 0, 0.155, 2.28); // front splitter
  // nameplate on the tail
  const badge = decalPlane('STALLION', 0.8, 'rgba(200,205,210,0.85)', 40);
  badge.position.set(0, 0.97, -2.415);
  badge.rotation.y = Math.PI;
  g.add(badge);

  // spoiler: base lip / FX blade
  if (fx) {
    for (const sgn of [1, -1]) box(g, 0.06, 0.12, 0.06, dark, sgn * 0.5, 0.97, -2.28);
    const blade = box(g, 1.46, 0.035, 0.26, dark, 0, 1.05, -2.30);
    blade.rotation.x = 0.1;
    // hood vent with louver slats
    const vent = box(g, 0.62, 0.03, 0.82, dark, 0, 0.945, 1.32);
    vent.rotation.x = -0.055;
    for (let i = 0; i < 3; i++) {
      const slat = box(g, 0.54, 0.02, 0.07, tubMat(), 0, 0.955, 1.12 + i * 0.2);
      slat.rotation.x = -0.055;
      slat.castShadow = false;
    }
  } else {
    const lip = box(g, 1.34, 0.04, 0.2, body, 0, 0.90, -2.33);
    lip.rotation.x = 0.16;
  }

  // --- wheels + tubs (proportions first: axles at the true ±L*0.32)
  for (const sgn of [1, -1]) {
    archTub(g, sgn * 0.90, 0.33, L * 0.32, 0.33, W / 2);
    archTub(g, sgn * 0.90, 0.33, -L * 0.32, 0.33, W / 2);
  }
  const wheelStyle = fx ? 'rally' : 'alloy';
  for (const sgn of [1, -1]) {
    makeWheel(g, { r: 0.33, w: 0.27, x: sgn * 0.88, y: 0.33, z: L * 0.32, style: wheelStyle, tread: 'street', spin: v.wheelSpin, pivots: v.wheelPivots });
    makeWheel(g, { r: 0.33, w: 0.29, x: sgn * 0.88, y: 0.33, z: -L * 0.32, style: wheelStyle, tread: 'street', spin: v.wheelSpin });
  }
  v.wheelR = 0.33;

  // --- interior (the contract at the top of this file)
  buildInterior(g, v, {
    floorY: 0.30, floorW: 1.66, floorZFront: 0.95, floorZRear: -1.55,
    cushionY: 0.46, seatZ: 0.14, dashZ: 0.80, halfW: 0.91,
    rearBench: true, rearBenchZ: -0.80, fabric: 0x2a2c2e,
  });
}

/**
 * Convoy Combat Edition — installed upgrades made visible on a Stallion.
 * Called from Vehicles.applyUpgradeVisuals; `g` is the (rebuilt) upgrade
 * group.
 */
export function applyStallionUpgrades(v: Vehicle, g: THREE.Group): void {
  const L = v.def.length;
  const dark = darkTrim();
  const steel = mat(0x43484e, 0.55, 0.55);
  const rust = mat(0x9a4a1e, 0.8, 0.2);
  const rivet = (parent: THREE.Group, x: number, y: number, z: number) => {
    const r = box(parent, 0.02, 0.02, 0.02, dark, x, y, z);
    r.castShadow = false;
  };
  if (v.upgrades.includes('armor')) {
    for (const sgn of [1, -1]) {
      // riveted door + quarter plates with rust-orange edge trim
      box(g, 0.05, 0.52, 1.25, steel, sgn * 0.965, 0.58, 0.05);
      box(g, 0.055, 0.045, 1.25, rust, sgn * 0.965, 0.86, 0.05).castShadow = false;
      box(g, 0.05, 0.46, 0.95, steel, sgn * 0.955, 0.60, -1.55);
      box(g, 0.055, 0.045, 0.95, rust, sgn * 0.955, 0.85, -1.55).castShadow = false;
      for (let i = 0; i < 4; i++) {
        rivet(g, sgn * 0.995, 0.38, -0.45 + i * 0.32);
        rivet(g, sgn * 0.995, 0.78, -0.45 + i * 0.32);
      }
      // ballistic louvers over the side glass
      for (let i = 0; i < 3; i++) {
        const slat = box(g, 0.03, 0.035, 0.52, steel, sgn * 0.815, 1.30 + i * 0.14, 0.18);
        slat.rotation.z = sgn * 0.1;
        slat.castShadow = false;
      }
    }
    // windshield louver slats down the glass slope
    for (let i = 0; i < 4; i++) {
      const t = 0.12 + i * 0.26;
      const slat = box(g, 1.22, 0.035, 0.18, steel, 0, 1.06 + 0.56 * t, 0.94 - 0.56 * t);
      slat.rotation.x = -0.72;
      slat.castShadow = false;
    }
    // rear-glass louver panel
    for (let i = 0; i < 3; i++) {
      const t = 0.2 + i * 0.3;
      const slat = box(g, 1.14, 0.03, 0.16, steel, 0, 1.58 - 0.28 * t, -0.95 - 0.55 * t);
      slat.rotation.x = 0.55;
      slat.castShadow = false;
    }
  }
  if (v.upgrades.includes('engine_tune')) {
    // the cowl splits open around an exposed supercharger
    box(g, 0.58, 0.12, 0.85, dark, 0, 1.0, 1.28);
    box(g, 0.30, 0.13, 0.42, chrome(), 0, 1.11, 1.30);
    box(g, 0.36, 0.09, 0.32, dark, 0, 1.21, 1.30);
    for (let i = -1; i <= 1; i++) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.09, 8), chrome());
      stack.position.set(i * 0.11, 1.28, 1.30);
      stack.castShadow = true;
      g.add(stack);
    }
  }
  if (v.upgrades.includes('bullbar')) {
    // spiked ram bar + winch (the Combat sheet's face)
    const barM = mat(0x2c2f33, 0.5, 0.6);
    for (const [by, bz] of [[0.46, 2.54], [0.74, 2.52]] as const) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 10), barM);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, by, bz);
      bar.castShadow = true;
      g.add(bar);
    }
    for (const sgn of [1, -1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), barM);
      post.position.set(sgn * 0.55, 0.55, 2.50);
      post.rotation.x = 0.3;
      g.add(post);
      tube(g, sgn * 0.55, 0.42, 2.52, sgn * 0.72, 0.38, 2.38, 0.035, barM);
    }
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.16, 8), barM);
      spike.rotation.x = Math.PI / 2;
      spike.position.set(-0.45 + i * 0.3, 0.74, 2.62);
      g.add(spike);
    }
    box(g, 0.42, 0.18, 0.16, dark, 0, 0.44, 2.52); // winch housing
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 10), chrome());
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, 0.44, 2.61);
    g.add(drum);
  }
  if (v.upgrades.includes('cargo_racks')) {
    // low decklid luggage rack — the roofline stays clean
    for (const sgn of [1, -1]) box(g, 0.05, 0.04, 0.72, dark, sgn * 0.36, 0.97, -L * 0.40);
    for (let i = 0; i < 3; i++) box(g, 0.78, 0.03, 0.07, dark, 0, 0.97, -L * 0.40 + (i - 1) * 0.26);
  }
  if (v.upgrades.includes('mg_mount')) {
  }
}
