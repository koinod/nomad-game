// weaponMeshes.ts — distinct physical meshes for every carryable item.
// Ground: lying on the floor, recognizable at a glance. Hand: held variant
// attached to the player's right arm. Same builder, different presentation.

import * as THREE from 'three';
import { FINISHES, finishDef } from '../data/mods';
import { ITEMS } from '../data/items';

/**
 * Wave 4: refinish a built weapon mesh in place. Metal surfaces
 * (metalness >= 0.4 — barrels, receivers, blades) take the finish's own
 * color/rough/metalness; camo additionally breaks up the furniture by
 * alternating its two tones part by part; rust creeps into everything.
 * The mesh's materials are fresh-built per call, so mutating is safe.
 */
export function applyFinish(g: THREE.Group, finishId: string | undefined): void {
  const f = finishDef(finishId);
  if (!f) return;
  let n = 0;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    if (!('metalness' in m) || !('color' in m)) return;
    if (m.metalness >= 0.4) {
      m.color.setHex(f.metal);
      m.roughness = f.rough;
      m.metalness = f.metalness;
    } else if (f.camoTones) {
      m.color.setHex(f.camoTones[n++ % 2]);
      m.roughness = Math.max(m.roughness, 0.8);
    } else if (f.id === FINISHES.finish_rust.id) {
      m.color.lerp(new THREE.Color(0x7a4a2a), 0.35);
      m.roughness = Math.min(1, m.roughness + 0.15);
    }
  });
}

const MAT = {
  steel: () => new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.7 }),
  darkSteel: () => new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.45, metalness: 0.55 }),
  pipe: () => new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.55, metalness: 0.6 }),
  rust: () => new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.9, metalness: 0.1 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85 }),
  darkWood: () => new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.9 }),
  black: () => new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.6 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xc9a44a, roughness: 0.35, metalness: 0.7 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.4, metalness: 0.7 }),
  redPlastic: () => new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 }),
  whiteCloth: () => new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.95 }),
  tan: () => new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.95 }),
  tin: () => new THREE.MeshStandardMaterial({ color: 0x8a929a, roughness: 0.3, metalness: 0.7 }),
  blue: () => new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.4 }),
};

/** Ground mesh lying flat — distinct silhouette per itemId. */
export function buildGroundMesh(itemId: string, qty = 1): THREE.Group {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh) => { m.castShadow = true; g.add(m); return m; };

  switch (itemId) {
    case 'pipe': {
      // lead pipe: long grey cylinder + rust bands + open ends
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 12), MAT.pipe()));
      body.rotation.z = Math.PI / 2;
      const band1 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.12, 12), MAT.rust()));
      band1.rotation.z = Math.PI / 2; band1.position.x = -0.3;
      const band2 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.12, 12), MAT.rust()));
      band2.rotation.z = Math.PI / 2; band2.position.x = 0.3;
      break;
    }
    case 'machete': {
      const blade = add(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.015, 0.11), MAT.steel()));
      blade.position.x = 0.18;
      const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 4), MAT.steel()));
      tip.rotation.z = -Math.PI / 2; tip.position.x = 0.59;
      const grip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), MAT.darkWood()));
      grip.rotation.z = Math.PI / 2; grip.position.x = -0.28;
      const guard = add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.16), MAT.brass()));
      guard.position.x = -0.13;
      break;
    }
    case 'hatchet': {
      const handle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.62, 8), MAT.wood()));
      handle.rotation.z = Math.PI / 2;
      const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.04), MAT.darkSteel()));
      head.position.set(0.24, 0.06, 0);
      const edge = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.05), MAT.steel()));
      edge.position.set(0.31, 0.06, 0);
      break;
    }
    case 'pistol': {
      const slide = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.05), MAT.darkSteel()));
      slide.position.y = 0.05;
      const frame = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.045), MAT.black()));
      frame.position.set(-0.04, 0, 0);
      const grip = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.05), MAT.black()));
      grip.position.set(-0.13, -0.11, 0); grip.rotation.z = 0.25;
      const barrel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.08, 8), MAT.steel()));
      barrel.rotation.z = Math.PI / 2; barrel.position.set(0.24, 0.05, 0);
      break;
    }
    case 'flare': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.38, 10), MAT.redPlastic()));
      body.rotation.z = Math.PI / 2;
      const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 10), MAT.black()));
      cap.rotation.z = Math.PI / 2; cap.position.x = -0.2;
      if (qty > 1) {
        const b2 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.38, 10), MAT.redPlastic()));
        b2.rotation.z = Math.PI / 2; b2.position.set(0.05, 0.02, 0.1); b2.rotation.y = 0.4;
      }
      break;
    }
    case 'bandage': {
      const roll = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), MAT.whiteCloth()));
      roll.rotation.x = Math.PI / 2;
      const stripe = add(new THREE.Mesh(new THREE.BoxGeometry(0.182, 0.04, 0.17), MAT.redPlastic()));
      stripe.position.y = 0;
      if (qty > 1) {
        const r2 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), MAT.whiteCloth()));
        r2.rotation.x = Math.PI / 2; r2.position.set(0.16, 0, 0.12);
      }
      break;
    }
    case 'ammo_9mm': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.14), MAT.tan()));
      const lid = add(new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.02, 0.15), MAT.darkSteel()));
      lid.position.y = 0.05;
      for (let i = 0; i < 3; i++) {
        const round = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), MAT.brass()));
        round.position.set(-0.06 + i * 0.06, 0.08, 0);
      }
      break;
    }
    case 'shells': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.16), MAT.redPlastic()));
      for (let i = 0; i < 3; i++) {
        const shell = add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8), MAT.brass()));
        shell.position.set(-0.06 + i * 0.06, 0.06, 0);
      }
      break;
    }
    case 'ammo_rifle': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.13), MAT.darkWood()));
      for (let i = 0; i < 3; i++) {
        const round = add(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.07, 6), MAT.steel()));
        round.position.set(-0.07 + i * 0.07, 0.07, 0);
      }
      break;
    }
    case 'chemicals': {
      const jug = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 10), MAT.redPlastic()));
      jug.position.y = 0.12;
      const lid = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), MAT.black()));
      lid.position.y = 0.26;
      break;
    }
    case 'fuel_can': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.16), MAT.redPlastic()));
      const spout = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 8), MAT.black()));
      spout.position.set(0.06, 0.19, 0);
      break;
    }
    // new weapons lying flat: hand-space +Z is already horizontal — drop it in.
    // NOTE: throwables (frag/molotov/flashbang/smoke/rock/boombox) are NOT in
    // this list on purpose — they carry dedicated ground art below, and
    // listing them here shadowed those cases into dead code.
    case 'baseball_bat':
    case 'combat_knife':
    case 'sledgehammer':
    case 'shotgun':
    case 'hunting_rifle':
    case 'flare_gun':
    case 'revolver':
    case 'crossbow':
    case 'smg':
    case 'carbine':
    case 'dmr': {
      const m = buildHandMesh(itemId);
      m.position.y = 0.06;
      g.add(m);
      break;
    }
    case 'canned_food': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 14), MAT.tin()));
      const label = add(new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.07, 14), MAT.redPlastic()));
      label.position.y = 0;
      break;
    }
    case 'water_bottle': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.24, 12), MAT.blue()));
      const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), MAT.whiteCloth()));
      cap.position.y = 0.14;
      break;
    }
    case 'scrap': {
      const a = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.11), MAT.darkSteel()));
      a.rotation.set(0.4, 0.7, 0.2);
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.1), MAT.steel()));
      b.position.set(0.12, -0.02, 0.08); b.rotation.y = 0.6;
      break;
    }
    case 'wire': {
      const coil = add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 20), MAT.copper()));
      coil.rotation.x = Math.PI / 2;
      break;
    }
    case 'cloth': {
      const sheet = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.24), MAT.whiteCloth()));
      sheet.rotation.y = 0.3;
      break;
    }
    case 'medkit': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.26), MAT.redPlastic()));
      const crossV = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.16), MAT.whiteCloth()));
      crossV.position.y = 0.1;
      const crossH = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.05), MAT.whiteCloth()));
      crossH.position.y = 0.1;
      break;
    }
    case 'torch': {
      const stick = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 8), MAT.wood()));
      stick.rotation.z = Math.PI / 2;
      const wrap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), MAT.tan()));
      wrap.rotation.z = Math.PI / 2; wrap.position.x = 0.22;
      break;
    }
    case 'phone': {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.18), MAT.black()));
      const screen = add(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.005, 0.15), new THREE.MeshStandardMaterial({ color: 0x2a6e4e, emissive: 0x1a4a32, emissiveIntensity: 0.6 })));
      screen.position.y = 0.013;
      break;
    }
    case 'frag': {
      const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a5230, roughness: 0.7 })));
      body.position.z = 0.1;
      const lever = add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), MAT.steel()));
      lever.position.set(0.05, 0.05, 0.12);
      break;
    }
    case 'molotov': {
      const bottle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a22, roughness: 0.3 })));
      bottle.rotation.x = Math.PI / 2; bottle.position.z = 0.14;
      const rag = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), MAT.tan()));
      rag.position.set(0, 0.02, 0.3);
      break;
    }
    case 'flashbang': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10), MAT.steel()));
      body.rotation.x = Math.PI / 2; body.position.z = 0.12;
      const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.03, 10), MAT.darkSteel()));
      cap.rotation.x = Math.PI / 2; cap.position.z = 0.03;
      break;
    }
    case 'crowbar': {
      const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), MAT.steel()));
      bar.position.z = 0.3;
      const claw = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), MAT.steel()));
      claw.position.set(0, 0.05, 0.6);
      break;
    }
    case 'fire_axe': {
      const handle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.8, 8), MAT.wood()));
      handle.rotation.x = Math.PI / 2; handle.position.z = 0.3;
      const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.6, metalness: 0.3 })));
      head.position.set(0, -0.02, 0.6);
      break;
    }
    case 'spear': {
      const shaft = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), MAT.wood()));
      shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.6;
      const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 8), MAT.steel()));
      tip.rotation.x = Math.PI / 2; tip.position.z = 1.5;
      break;
    }
    case 'riot_baton': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.55, 10), MAT.black()));
      body.rotation.x = Math.PI / 2; body.position.z = 0.28;
      const grip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), MAT.black()));
      grip.rotation.z = Math.PI / 2; grip.position.set(0.1, -0.02, 0.05);
      break;
    }
    case 'flare_gun': {
      const frame = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xe07820, roughness: 0.5 })));
      frame.position.z = 0.14;
      const grip = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), MAT.black()));
      grip.position.set(0, -0.12, -0.04); grip.rotation.x = 0.4;
      break;
    }
    case 'revolver': {
      const frame = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.34), MAT.darkSteel()));
      frame.position.z = 0.18;
      const cyl = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.09, 10), MAT.steel()));
      cyl.rotation.z = Math.PI / 2; cyl.position.z = 0.12;
      const grip = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.09), MAT.wood()));
      grip.position.set(0, -0.11, -0.05); grip.rotation.x = 0.5;
      break;
    }
    case 'crossbow': {
      const stock = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.6), MAT.wood()));
      stock.position.z = 0.22;
      const bow = add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.09), MAT.darkSteel()));
      bow.position.z = 0.48;
      const bolt = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), MAT.wood()));
      bolt.rotation.x = Math.PI / 2; bolt.position.z = 0.32;
      break;
    }
    case 'smg': {
      const bodyM = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.5), MAT.black()));
      bodyM.position.z = 0.22;
      const mag = add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.2, 0.09), MAT.steel()));
      mag.position.set(0, -0.16, 0.18); mag.rotation.x = 0.15;
      const stock = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.18), MAT.black()));
      stock.position.z = -0.08;
      break;
    }
    case 'carbine': {
      const bodyM = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.78), MAT.darkSteel()));
      bodyM.position.z = 0.3;
      const mag = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.1), MAT.steel()));
      mag.position.set(0, -0.14, 0.2); mag.rotation.x = 0.25;
      const guard = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.26), MAT.black()));
      guard.position.z = 0.55;
      break;
    }
    case 'dmr': {
      const bodyM = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 1.0), MAT.darkSteel()));
      bodyM.position.z = 0.4;
      const mag = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.09), MAT.steel()));
      mag.position.set(0, -0.13, 0.28);
      const scope = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 8), MAT.black()));
      scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.11, 0.32);
      break;
    }
    case 'smoke': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.6 })));
      body.rotation.x = Math.PI / 2; body.position.z = 0.12;
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5 })));
      band.rotation.x = Math.PI / 2; band.position.z = 0.12;
      break;
    }
    case 'rock': {
      const r = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.09), new THREE.MeshStandardMaterial({ color: 0x7a7a72, roughness: 1 })));
      r.position.z = 0.1;
      break;
    }
    case 'boombox': {
      const bodyM = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.28, 0.18), MAT.black()));
      bodyM.position.z = 0.2;
      const spk = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), MAT.steel()));
      spk.rotation.x = Math.PI / 2; spk.position.set(-0.11, -0.02, 0.3);
      const spk2 = spk.clone();
      spk2.position.x = 0.11;
      g.add(spk2);
      break;
    }
    default: {
      const box = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.34), MAT.tan()));
      box.position.y = 0.02;
      break;
    }
  }
  return g;
}

// ------------------------------------------------------------ mod deltas ---
// SYSTEMS_SPEC §3.2: attached mods must READ on the hand mesh — a
// suppressor adds a tube, a reflex sight adds a hump, an extended mag
// lengthens the mag. Anchors are per weapon, in hand space (+Z forward),
// and exist only where the weapon's modSlots offer the slot — a mesh can
// never grow a part its data says it cannot mount. Foregrip and laser
// (the underbarrel pair) get the same treatment: a wedge / a lamp box
// under the barrel.

interface ModAnchors {
  muzzle?: { y: number; z: number; r: number; len: number }; // suppressor tube
  optic?: { y: number; z: number }; // reflex hump base (top of receiver)
  magExt?: { x: number; y: number; z: number; w: number; h: number; d: number; tilt: number; tube?: boolean };
  under?: { y: number; z: number }; // foregrip wedge / laser box
}

const MOD_ANCHORS: Record<string, ModAnchors> = {
  pistol: {
    muzzle: { y: 0.06, z: 0.33, r: 0.027, len: 0.15 },
    optic: { y: 0.095, z: 0.1 },
    // the base pistol models no mag — the extension IS the visible mag
    magExt: { x: 0, y: -0.17, z: -0.005, w: 0.045, h: 0.15, d: 0.07, tilt: 0.25 },
    under: { y: 0.0, z: 0.18 },
  },
  shotgun: {
    // tube magazine: the extension stretches the tube, not a box
    magExt: { x: 0, y: 0.0, z: 0.58, w: 0.04, h: 0.16, d: 0.04, tilt: 0, tube: true },
    under: { y: -0.05, z: 0.18 },
  },
  hunting_rifle: {
    muzzle: { y: 0.06, z: 0.79, r: 0.028, len: 0.17 },
    // optic slot exists but the base mesh already models a scope — the
    // scope IS the optic read; no second hump stacked on top of it
    magExt: { x: 0, y: -0.075, z: 0.02, w: 0.04, h: 0.11, d: 0.08, tilt: 0 },
    under: { y: -0.005, z: 0.4 },
  },
  revolver: {
    under: { y: -0.005, z: 0.16 },
  },
  crossbow: {
    optic: { y: 0.078, z: 0.14 },
  },
  smg: {
    muzzle: { y: 0.05, z: 0.4, r: 0.026, len: 0.14 },
    optic: { y: 0.078, z: 0.06 },
    magExt: { x: 0, y: -0.235, z: 0.09, w: 0.04, h: 0.09, d: 0.06, tilt: 0.12 },
    under: { y: -0.005, z: 0.24 },
  },
  carbine: {
    muzzle: { y: 0.05, z: 0.6, r: 0.026, len: 0.16 },
    optic: { y: 0.078, z: 0.12 },
    magExt: { x: 0, y: -0.225, z: 0.115, w: 0.04, h: 0.09, d: 0.07, tilt: 0.18 },
    under: { y: -0.02, z: 0.3 },
  },
  dmr: {
    // the can sleeves over the muzzle brake zone
    muzzle: { y: 0.06, z: 0.84, r: 0.03, len: 0.18 },
    // optic: modeled scope, same call as the hunting rifle
    magExt: { x: 0, y: -0.21, z: 0.125, w: 0.042, h: 0.08, d: 0.08, tilt: 0.1 },
    under: { y: -0.005, z: 0.42 },
  },
};

function applyModMeshes(
  add: (m: THREE.Mesh) => THREE.Mesh,
  itemId: string,
  mods: readonly string[],
): void {
  const a = MOD_ANCHORS[itemId];
  if (!a || mods.length === 0) return;
  for (const modId of mods) {
    if (modId === 'suppressor' && a.muzzle) {
      const tube = add(new THREE.Mesh(
        new THREE.CylinderGeometry(a.muzzle.r, a.muzzle.r, a.muzzle.len, 12), MAT.darkSteel()));
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, a.muzzle.y, a.muzzle.z + a.muzzle.len / 2 - 0.02);
      const collar = add(new THREE.Mesh(
        new THREE.CylinderGeometry(a.muzzle.r * 1.18, a.muzzle.r * 1.18, 0.035, 12), MAT.black()));
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, a.muzzle.y, a.muzzle.z + 0.005);
    } else if (modId === 'reflex_sight' && a.optic) {
      const base = add(new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.016, 0.046), MAT.black()));
      base.position.set(0, a.optic.y + 0.008, a.optic.z);
      const hood = add(new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.034, 0.03), MAT.black()));
      hood.position.set(0, a.optic.y + 0.032, a.optic.z);
      const lens = add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.004, 10),
        new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff2a1a, emissiveIntensity: 0.9, roughness: 0.3 }),
      ));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, a.optic.y + 0.034, a.optic.z + 0.016);
    } else if (modId === 'extended_mag' && a.magExt) {
      const m = a.magExt;
      const ext = m.tube
        ? add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, m.h, 8), MAT.steel()))
        : add(new THREE.Mesh(new THREE.BoxGeometry(m.w, m.h, m.d), MAT.black()));
      if (m.tube) ext.rotation.x = Math.PI / 2;
      else ext.rotation.x = m.tilt;
      ext.position.set(m.x, m.y, m.z);
    } else if (modId === 'foregrip' && a.under) {
      const wedge = add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.095, 0.045), MAT.black()));
      wedge.position.set(0, a.under.y - 0.045, a.under.z);
      wedge.rotation.x = -0.35;
    } else if (modId === 'laser_sight' && a.under) {
      const lamp = add(new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.032, 0.075), MAT.black()));
      lamp.position.set(0, a.under.y - 0.012, a.under.z + 0.02);
      const tip = add(new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.012, 0.006),
        new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff2015, emissiveIntensity: 1.2, roughness: 0.3 }),
      ));
      tip.position.set(0, a.under.y - 0.012, a.under.z + 0.06);
    }
  }
}

/**
 * Item 7 — per-weapon grip definitions, in HAND-MESH space (the space
 * buildHandMesh builds in: origin at the primary grip, +Z toward the
 * muzzle). `primary` is where the right hand holds; `support` is
 * where the left hand goes on two-handed weapons (the forend/pump —
 * genuinely forward on the weapon). Sidearms define their own hold:
 * pistol + revolver are two-handed with the support hand stacked on
 * the grip; the flare gun is light enough for one. Grips are defined
 * on the BASE weapon only — mods attach to the mesh and never move
 * them (a foregrip mod renders at its own anchor; the hands stay
 * where the base weapon puts them).
 */
export interface WeaponGrip {
  hands: 1 | 2;
  primary: [number, number, number];
  support?: [number, number, number];
}

export const WEAPON_GRIPS: Record<string, WeaponGrip> = {
  // long guns: support hand on the forend, well forward of the grip
  carbine: { hands: 2, primary: [0, 0, 0], support: [0, -0.02, 0.3] },
  dmr: { hands: 2, primary: [0, 0, 0], support: [0, -0.02, 0.34] },
  hunting_rifle: { hands: 2, primary: [0, 0, 0], support: [0, -0.02, 0.36] },
  shotgun: { hands: 2, primary: [0, 0, 0], support: [0, -0.02, 0.34] }, // on the pump
  crossbow: { hands: 2, primary: [0, 0, 0], support: [0, -0.02, 0.3] },
  smg: { hands: 2, primary: [0, 0, 0], support: [0, -0.03, 0.22] },
  // sidearms: their defined holds
  pistol: { hands: 2, primary: [0, 0, 0], support: [0, -0.01, 0.02] }, // support wraps the grip hand
  revolver: { hands: 2, primary: [0, 0, 0], support: [0, -0.01, 0.02] },
  flare_gun: { hands: 1, primary: [0, 0, 0] },
};

/** Grip definition for any carryable: explicit table first, then a
 *  category fallback so a future weapon still gets sane hands. */
export function gripFor(itemId: string): WeaponGrip {
  const g = WEAPON_GRIPS[itemId];
  if (g) return g;
  if (ITEMS[itemId]?.category === 'weapon-ranged') {
    return { hands: 2, primary: [0, 0, 0], support: [0, -0.02, 0.28] };
  }
  return { hands: 1, primary: [0, 0, 0] }; // melee / thrown / tools: one hand on the grip
}

/** Hand-held mesh — origin at the grip, points forward (+Z in hand space).
 *  `mods` (the instance's attached mod ids) grow their physical parts;
 *  `finish` refinishes the whole build, attachments included. */
export function buildHandMesh(itemId: string, finish?: string, mods: readonly string[] = []): THREE.Group {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh) => { m.castShadow = true; g.add(m); return m; };

  switch (itemId) {
    case 'pipe': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 12), MAT.pipe()));
      body.rotation.x = Math.PI / 2; body.position.z = 0.28;
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.1, 12), MAT.rust()));
      band.rotation.x = Math.PI / 2; band.position.z = 0.05;
      const band2 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.1, 12), MAT.rust()));
      band2.rotation.x = Math.PI / 2; band2.position.z = 0.55;
      break;
    }
    case 'machete': {
      const blade = add(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1, 0.62), MAT.steel()));
      blade.position.z = 0.36;
      const grip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 8), MAT.darkWood()));
      grip.rotation.x = Math.PI / 2; grip.position.z = -0.05;
      break;
    }
    case 'hatchet': {
      const handle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.55, 8), MAT.wood()));
      handle.rotation.x = Math.PI / 2; handle.position.z = 0.2;
      const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.09), MAT.darkSteel()));
      head.position.set(0, 0.05, 0.44);
      const edge = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.03), MAT.steel()));
      edge.position.set(0, 0.05, 0.5);
      break;
    }
    case 'pistol': {
      const slide = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.38), MAT.darkSteel()));
      slide.position.set(0, 0.06, 0.12);
      const grip = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.08), MAT.black()));
      grip.position.set(0, -0.06, -0.02); grip.rotation.x = 0.25;
      const barrel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.06, 8), MAT.steel()));
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.06, 0.33);
      break;
    }
    case 'flare': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.34, 10), MAT.redPlastic()));
      body.rotation.x = Math.PI / 2; body.position.z = 0.14;
      break;
    }
    case 'baseball_bat': {
      // tapered wooden bat: barrel forward, handle at the fist
      const barrel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.62, 10), MAT.wood()));
      barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.36;
      const grip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.22, 8), MAT.darkWood()));
      grip.rotation.x = Math.PI / 2; grip.position.z = -0.04;
      const knob = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), MAT.darkWood()));
      knob.rotation.x = Math.PI / 2; knob.position.z = -0.16;
      break;
    }
    case 'combat_knife': {
      const blade = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.26), MAT.steel()));
      blade.position.z = 0.2;
      const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), MAT.steel()));
      tip.rotation.x = Math.PI / 2; tip.position.z = 0.37;
      const grip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), MAT.black()));
      grip.rotation.x = Math.PI / 2; grip.position.z = 0.0;
      break;
    }
    case 'sledgehammer': {
      const handle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.85, 8), MAT.wood()));
      handle.rotation.x = Math.PI / 2; handle.position.z = 0.3;
      const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.24), MAT.darkSteel()));
      head.position.z = 0.68;
      break;
    }
    case 'shotgun': {
      const barrelTube = add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.62, 10), MAT.darkSteel()));
      barrelTube.rotation.x = Math.PI / 2; barrelTube.position.set(0, 0.05, 0.32);
      const mag = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), MAT.steel()));
      mag.rotation.x = Math.PI / 2; mag.position.set(0, 0.0, 0.26);
      const receiver = add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.24), MAT.black()));
      receiver.position.set(0, 0.02, -0.05);
      const pump = add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 10), MAT.wood()));
      pump.rotation.x = Math.PI / 2; pump.position.set(0, -0.01, 0.18);
      const stock = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.3), MAT.wood()));
      stock.position.set(0, -0.04, -0.3); stock.rotation.x = 0.18;
      break;
    }
    case 'hunting_rifle': {
      const barrelTube = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.78, 10), MAT.darkSteel()));
      barrelTube.rotation.x = Math.PI / 2; barrelTube.position.set(0, 0.06, 0.42);
      const body = add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.4), MAT.wood()));
      body.position.set(0, 0.01, 0.0);
      const scope = add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8), MAT.black()));
      scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.1, 0.05);
      const stock = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.32), MAT.darkWood()));
      stock.position.set(0, -0.04, -0.32); stock.rotation.x = 0.15;
      const bolt = add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), MAT.steel()));
      bolt.position.set(0.05, 0.04, -0.08);
      break;
    }
    case 'torch': {
      const stick = add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.48, 8), MAT.wood()));
      stick.rotation.x = Math.PI / 2; stick.position.z = 0.18;
      const wrap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.13, 8), MAT.tan()));
      wrap.rotation.x = Math.PI / 2; wrap.position.z = 0.38;
      break;
    }
    // ---- wave 4: the ranged roster's missing hand meshes ----
    case 'revolver': {
      const barrel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.3, 10), MAT.darkSteel()));
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.055, 0.22);
      const underlug = add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.26), MAT.darkSteel()));
      underlug.position.set(0, 0.03, 0.2);
      const drum = add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.07, 12), MAT.steel()));
      drum.rotation.x = Math.PI / 2; drum.position.set(0, 0.04, 0.02);
      const frame = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.14), MAT.darkSteel()));
      frame.position.set(0, 0.03, -0.04);
      const grip = add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.19, 0.07), MAT.wood()));
      grip.position.set(0, -0.07, -0.08); grip.rotation.x = 0.3;
      break;
    }
    case 'flare_gun': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.3, 10), MAT.redPlastic()));
      body.rotation.x = Math.PI / 2; body.position.set(0, 0.05, 0.14);
      const grip = add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.17, 0.07), MAT.black()));
      grip.position.set(0, -0.06, -0.02); grip.rotation.x = 0.25;
      break;
    }
    case 'smg': {
      const receiver = add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.34), MAT.darkSteel()));
      receiver.position.set(0, 0.03, 0.08);
      const barrel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.18, 8), MAT.steel()));
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.05, 0.33);
      const mag = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.06), MAT.black()));
      mag.position.set(0, -0.1, 0.08); mag.rotation.x = 0.12;
      const stock = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.2), MAT.black()));
      stock.position.set(0, 0.02, -0.18);
      const grip = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.06), MAT.black()));
      grip.position.set(0, -0.07, -0.04); grip.rotation.x = 0.25;
      break;
    }
    case 'carbine': {
      const receiver = add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.4), MAT.darkSteel()));
      receiver.position.set(0, 0.03, 0.1);
      const barrel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.34, 8), MAT.steel()));
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.05, 0.45);
      const guard = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.24, 8), MAT.black()));
      guard.rotation.x = Math.PI / 2; guard.position.set(0, 0.04, 0.3);
      const mag = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.07), MAT.black()));
      mag.position.set(0, -0.1, 0.1); mag.rotation.x = 0.18;
      const stock = add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.26), MAT.darkWood()));
      stock.position.set(0, -0.01, -0.22); stock.rotation.x = 0.1;
      const grip = add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.06), MAT.black()));
      grip.position.set(0, -0.07, -0.03); grip.rotation.x = 0.25;
      break;
    }
    case 'dmr': {
      const receiver = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.46), MAT.darkSteel()));
      receiver.position.set(0, 0.03, 0.08);
      const barrel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.5, 10), MAT.steel()));
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.06, 0.55);
      const brake = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.09, 8), MAT.darkSteel()));
      brake.rotation.x = Math.PI / 2; brake.position.set(0, 0.06, 0.82);
      const scope = add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 8), MAT.black()));
      scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.13, 0.08);
      const mag = add(new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.16, 0.08), MAT.black()));
      mag.position.set(0, -0.1, 0.12); mag.rotation.x = 0.1;
      const stock = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.3), MAT.darkWood()));
      stock.position.set(0, -0.02, -0.28); stock.rotation.x = 0.12;
      const bipod = add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.02), MAT.steel()));
      bipod.position.set(0.05, -0.06, 0.5); bipod.rotation.z = 0.3;
      const bipod2 = bipod.clone(); bipod2.position.x = -0.05; bipod2.rotation.z = -0.3;
      g.add(bipod2);
      break;
    }
    case 'crossbow': {
      const prod = add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.035, 0.09), MAT.darkWood()));
      prod.position.set(0, 0.06, 0.42);
      for (const sx of [-0.36, 0.36]) {
        const tip = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.05), MAT.steel()));
        tip.position.set(sx, 0.06, 0.38); tip.rotation.y = sx > 0 ? -0.5 : 0.5;
      }
      const rail = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.62), MAT.wood()));
      rail.position.set(0, 0.05, 0.12);
      const boltMesh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6), MAT.tan()));
      boltMesh.rotation.x = Math.PI / 2; boltMesh.position.set(0, 0.09, 0.18);
      const stock = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.3), MAT.darkWood()));
      stock.position.set(0, -0.02, -0.28); stock.rotation.x = 0.14;
      const stirrup = add(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), MAT.steel()));
      stirrup.position.set(0, 0.0, 0.5); stirrup.rotation.x = Math.PI / 2;
      break;
    }
    // ---- wave-4 melee the hand switch never got (their ground art was
    // shadowed by the reuse list too — both paths showed the generic box)
    case 'crowbar': {
      const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.55), MAT.steel()));
      bar.position.z = 0.22;
      const claw = add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.055), MAT.steel()));
      claw.position.set(0, 0.045, 0.5);
      break;
    }
    case 'fire_axe': {
      const handle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.78, 8), MAT.wood()));
      handle.rotation.x = Math.PI / 2; handle.position.z = 0.3;
      const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.28), new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.6, metalness: 0.3 })));
      head.position.set(0, 0.01, 0.62);
      break;
    }
    case 'spear': {
      const shaft = add(new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 1.5, 8), MAT.wood()));
      shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.55;
      const tip = add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.26, 8), MAT.steel()));
      tip.rotation.x = Math.PI / 2; tip.position.z = 1.42;
      break;
    }
    case 'riot_baton': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.52, 10), MAT.black()));
      body.rotation.x = Math.PI / 2; body.position.z = 0.2;
      const grip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.15, 8), MAT.black()));
      grip.rotation.z = Math.PI / 2; grip.position.set(0.09, -0.02, 0.0);
      break;
    }
    // ---- throwables in hand: what the throw arc starts from ----
    case 'frag': {
      const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3a5230, roughness: 0.7 })));
      body.position.z = 0.1;
      const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.04, 8), MAT.darkSteel()));
      neck.position.set(0, 0.055, 0.1);
      const lever = add(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.02), MAT.steel()));
      lever.position.set(0.028, 0.03, 0.1); lever.rotation.z = 0.25;
      break;
    }
    case 'molotov': {
      const bottle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.24, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a22, roughness: 0.3 })));
      bottle.rotation.x = Math.PI / 2; bottle.position.z = 0.1;
      const rag = add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.09), MAT.tan()));
      rag.position.set(0, 0.03, 0.24); rag.rotation.x = 0.4;
      break;
    }
    case 'flashbang': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.15, 10), MAT.steel()));
      body.rotation.x = Math.PI / 2; body.position.z = 0.08;
      const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.03, 10), MAT.darkSteel()));
      cap.rotation.x = Math.PI / 2; cap.position.z = 0.0;
      break;
    }
    case 'smoke': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.6 })));
      body.rotation.x = Math.PI / 2; body.position.z = 0.08;
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5 })));
      band.rotation.x = Math.PI / 2; band.position.z = 0.08;
      break;
    }
    case 'rock': {
      const r = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.065), new THREE.MeshStandardMaterial({ color: 0x7a7a72, roughness: 1 })));
      r.position.z = 0.07;
      break;
    }
    case 'boombox': {
      const bodyM = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.16), MAT.black()));
      bodyM.position.z = 0.12;
      const spk = add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 12), MAT.steel()));
      spk.rotation.x = Math.PI / 2; spk.position.set(-0.1, -0.02, 0.21);
      const spk2 = spk.clone();
      spk2.position.x = 0.1;
      g.add(spk2);
      break;
    }
    default: {
      // generic held item: small box at the fist
      const box = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.18), MAT.tan()));
      box.position.z = 0.08;
      break;
    }
  }
  // attached mods grow their parts BEFORE the finish pass, so a refinished
  // gun refinishes its can, sight and mag along with the receiver
  applyModMeshes(add, itemId, mods);
  if (finish) applyFinish(g, finish);
  return g;
}

/** Which item is "in hand". Inventory v2: the SELECTED weapon slot
 *  is what's held (keys 1/2/3) — the hand mesh follows it. The legacy
 *  melee-then-ranged order remains as the fallback for callers that
 *  pass only the projections. */
export function activeHandItemId(
  equipped: {
    melee: string | null; ranged: string | null;
    primary?: string | null; secondary?: string | null; tertiary?: string | null;
    activeWeapon?: 'primary' | 'secondary' | 'tertiary';
  },
  inventory: { uid: string; itemId: string }[],
): string | null {
  if (equipped.activeWeapon) {
    const heldUid = equipped[equipped.activeWeapon];
    const heldIt = heldUid ? inventory.find((i) => i.uid === heldUid) : undefined;
    if (heldIt) return heldIt.itemId;
    if (heldUid) return null; // slot selected but its weapon is gone — bare hands
  }
  const meleeIt = equipped.melee ? inventory.find((i) => i.uid === equipped.melee) : undefined;
  if (meleeIt) return meleeIt.itemId;
  const rangedIt = equipped.ranged ? inventory.find((i) => i.uid === equipped.ranged) : undefined;
  if (rangedIt) return rangedIt.itemId;
  return null;
}
