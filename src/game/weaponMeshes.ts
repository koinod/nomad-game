// weaponMeshes.ts — distinct physical meshes for every carryable item.
// Ground: lying on the floor, recognizable at a glance. Hand: held variant
// attached to the player's right arm. Same builder, different presentation.

import * as THREE from 'three';

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
    default: {
      const box = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.34), MAT.tan()));
      box.position.y = 0.02;
      break;
    }
  }
  return g;
}

/** Hand-held mesh — origin at the grip, points forward (+Z in hand space). */
export function buildHandMesh(itemId: string): THREE.Group {
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
    case 'torch': {
      const stick = add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.48, 8), MAT.wood()));
      stick.rotation.x = Math.PI / 2; stick.position.z = 0.18;
      const wrap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.13, 8), MAT.tan()));
      wrap.rotation.x = Math.PI / 2; wrap.position.z = 0.38;
      break;
    }
    default: {
      // generic held item: small box at the fist
      const box = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.18), MAT.tan()));
      box.position.z = 0.08;
      break;
    }
  }
  return g;
}

/** Which item is "in hand" — melee wins, then ranged, then any holdable tool. */
export function activeHandItemId(
  equipped: { melee: string | null; ranged: string | null },
  inventory: { uid: string; itemId: string }[],
): string | null {
  const meleeIt = equipped.melee ? inventory.find((i) => i.uid === equipped.melee) : undefined;
  if (meleeIt) return meleeIt.itemId;
  const rangedIt = equipped.ranged ? inventory.find((i) => i.uid === equipped.ranged) : undefined;
  if (rangedIt) return rangedIt.itemId;
  return null;
}
