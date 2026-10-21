// furnitureMeshes.ts — distinct low-poly meshes for house furniture,
// so every room reads at a glance. Origin at floor level, facing +Z.
//
// Disturbed state (Lane 6, §4.5's companion visual): doors, drawers,
// and lids are built as 'opener' subgroups. When a container is
// searched out, Interact calls applyDisturbed() — the fridge door
// hangs open, the drawer slides out, everything darkens a shade —
// and applyRestored() when the respawn clock restocks it.

import * as THREE from 'three';

export type FurnitureKind =
  | 'fridge' | 'cabinets' | 'dresser' | 'bookshelf'
  | 'cooler' | 'crate' | 'barrel' | 'toolbox'
  | 'safe' | 'logpile' | 'berrybush';

/** Half-extents (x,z) for collision — keep the player out of the fridge. */
export const FURNITURE_HALF: Record<FurnitureKind, [number, number]> = {
  fridge: [0.38, 0.35],
  cabinets: [0.72, 0.27],
  dresser: [0.62, 0.27],
  bookshelf: [0.52, 0.2],
  cooler: [0.32, 0.22],
  crate: [0.47, 0.47],
  barrel: [0.37, 0.37],
  toolbox: [0.27, 0.17],
  safe: [0.34, 0.3],
  logpile: [0.55, 0.4],
  berrybush: [0.5, 0.5],
};

export const FURNITURE_LABEL: Record<FurnitureKind, string> = {
  fridge: 'Search fridge',
  cabinets: 'Search cabinets',
  dresser: 'Search dresser',
  bookshelf: 'Search bookshelf',
  cooler: 'Search cooler',
  crate: 'Search crate',
  barrel: 'Search barrel',
  toolbox: 'Search toolbox',
  safe: 'Pick safe (locked)',
  logpile: 'Gather wood',
  berrybush: 'Gather produce',
};

function mat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 1 });
}

interface DisturbedDelta { rx?: number; ry?: number; rz?: number; dx?: number; dy?: number; dz?: number }

/** A subgroup that moves when the piece is searched out. */
function opener(parent: THREE.Group, x: number, y: number, z: number, delta: DisturbedDelta): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.name = 'opener';
  g.userData.disturbedDelta = delta;
  parent.add(g);
  return g;
}

export function buildFurnitureMesh(kind: FurnitureKind): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, parent: THREE.Object3D = g) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  switch (kind) {
    case 'fridge': {
      add(box(0.72, 1.68, 0.66), 0xd8dcd2, 0, 0.84, 0);
      // door on a left hinge: panel + handle ride the opener group
      const door = opener(g, -0.33, 0, 0.33, { ry: -1.8 });
      add(box(0.66, 1.6, 0.03), 0xd0d4cc, 0.33, 0.86, 0, door);
      add(box(0.04, 0.3, 0.04), 0x3a3d40, 0.6, 0.95, 0.04, door); // handle
      break;
    }
    case 'cabinets': {
      add(box(1.4, 0.88, 0.5), 0x8a6f4d, 0, 0.44, 0);
      add(box(1.44, 0.05, 0.54), 0x6e5639, 0, 0.9, 0); // countertop
      const left = opener(g, -0.68, 0, 0.26, { ry: 0.9 });
      add(box(0.64, 0.5, 0.02), 0x6e5639, 0.32, 0.45, 0, left);
      const right = opener(g, 0.68, 0, 0.26, { ry: -0.9 });
      add(box(0.64, 0.5, 0.02), 0x6e5639, -0.32, 0.45, 0, right);
      break;
    }
    case 'dresser': {
      add(box(1.2, 0.9, 0.5), 0x6b4e32, 0, 0.45, 0);
      // top drawer slides out when searched; the lower front is fixed
      const drawer = opener(g, 0, 0, 0, { dz: 0.17 });
      add(box(1.04, 0.22, 0.02), 0x54401f, 0, 0.68, 0.26, drawer);
      add(box(0.08, 0.05, 0.03), 0x2e2a24, 0, 0.68, 0.28, drawer); // knob
      add(box(1.04, 0.22, 0.02), 0x54401f, 0, 0.38, 0.26);
      add(box(0.08, 0.05, 0.03), 0x2e2a24, 0, 0.38, 0.28); // knob
      break;
    }
    case 'bookshelf': {
      add(box(1.0, 1.8, 0.34), 0x5a4028, 0, 0.9, 0);
      const bookColors = [0x8a3b3b, 0x3b5a8a, 0x3b8a5a, 0x8a7a3b, 0x6a3b8a];
      for (let s = 0; s < 3; s++) {
        const sy = 0.45 + s * 0.5;
        add(box(0.9, 0.04, 0.3), 0x3a2c1c, 0, sy - 0.2, 0); // shelf
        let bx = -0.4;
        let bi = s;
        while (bx < 0.38) {
          const bw = 0.05 + ((bi * 7) % 3) * 0.02;
          add(box(bw, 0.36, 0.24), bookColors[bi % bookColors.length], bx + bw / 2, sy, 0);
          bx += bw + 0.012;
          bi++;
        }
      }
      break;
    }
    case 'cooler': {
      add(box(0.6, 0.38, 0.4), 0x3f7a8a, 0, 0.19, 0);
      // lid hinged at the back edge, flips up when searched
      const lid = opener(g, 0, 0.42, -0.21, { rx: -0.55 });
      add(box(0.62, 0.08, 0.42), 0xd8d8d0, 0, 0, 0.21, lid);
      break;
    }
    case 'crate': {
      add(box(0.9, 0.9, 0.9), 0x6e5a3e, 0, 0.45, 0);
      const lid = opener(g, 0, 0, 0, { dx: 0.22, rz: 0.18 });
      add(box(0.94, 0.08, 0.94), 0x54401f, 0, 0.82, 0, lid);
      break;
    }
    case 'barrel': {
      const cyl = new THREE.CylinderGeometry(0.35, 0.35, 0.88, 10);
      add(cyl, 0x6a4a33, 0, 0.44, 0);
      const band = new THREE.TorusGeometry(0.355, 0.025, 6, 14);
      const b1 = new THREE.Mesh(band, mat(0x3a3a3a));
      b1.rotation.x = Math.PI / 2;
      b1.position.y = 0.66;
      const b2 = b1.clone();
      b2.position.y = 0.24;
      g.add(b1, b2);
      break;
    }
    case 'toolbox': {
      add(box(0.5, 0.28, 0.3), 0x8a2f2f, 0, 0.14, 0);
      add(box(0.2, 0.05, 0.04), 0x2e2e2e, 0, 0.3, 0); // handle
      break;
    }
    case 'safe': {
      add(box(0.62, 0.62, 0.55), 0x3a4048, 0, 0.31, 0); // body
      // the whole door — plate, dial, handle — swings on its left hinge
      const door = opener(g, -0.25, 0, 0.28, { ry: -1.1 });
      add(box(0.5, 0.52, 0.04), 0x2c3339, 0.25, 0.31, 0, door); // door plate
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), mat(0xb0b6bc));
      dial.rotation.x = Math.PI / 2;
      dial.position.set(0.25, 0.42, 0.03);
      door.add(dial);
      add(box(0.12, 0.04, 0.04), 0xb0b6bc, 0.25, 0.24, 0.03, door); // handle
      add(box(0.5, 0.03, 0.5), 0x6a2c2c, 0, 0.58, 0); // red stripe — pick me
      break;
    }
    case 'logpile': {
      const logGeo = new THREE.CylinderGeometry(0.14, 0.16, 1.1, 8);
      logGeo.rotateZ(Math.PI / 2);
      add(logGeo, 0x5a4028, 0, 0.15, 0.18);
      add(logGeo, 0x4a3520, 0.06, 0.15, -0.18);
      add(logGeo, 0x63482e, -0.03, 0.4, 0.02);
      break;
    }
    case 'berrybush': {
      const blob = new THREE.IcosahedronGeometry(0.5, 0);
      add(blob, 0x2e5a2e, 0, 0.55, 0);
      add(blob, 0x3a6a34, 0.35, 0.4, 0.2);
      add(blob, 0x264d26, -0.35, 0.42, -0.15);
      const dot = new THREE.SphereGeometry(0.06, 6, 6);
      add(dot, 0xc23b4e, 0.18, 0.75, 0.3);
      add(dot, 0xc23b4e, -0.3, 0.62, 0.34);
      add(dot, 0xd65668, 0.42, 0.52, -0.1);
      break;
    }
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/**
 * Searched-out look: opener subgroups swing/slide per their build-time
 * delta, and every material darkens a shade (ransacked, dusty, handled).
 * Idempotent; applyRestored() undoes it exactly (respawn restock).
 */
export function applyDisturbed(root: THREE.Object3D): void {
  if (root.userData.disturbedApplied) return;
  root.userData.disturbedApplied = true;
  const darkened = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o.name === 'opener' && o.userData.disturbedDelta) {
      const d = o.userData.disturbedDelta as DisturbedDelta;
      o.userData.preDisturbed = {
        rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z,
        dx: o.position.x, dy: o.position.y, dz: o.position.z,
      };
      o.rotation.x += d.rx ?? 0;
      o.rotation.y += d.ry ?? 0;
      o.rotation.z += d.rz ?? 0;
      o.position.x += d.dx ?? 0;
      o.position.y += d.dy ?? 0;
      o.position.z += d.dz ?? 0;
    }
    if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.MeshStandardMaterial;
      if ('color' in m && !darkened.has(m)) {
        darkened.add(m);
        if (o.userData.preColor === undefined) o.userData.preColor = m.color.getHex();
        m.color.multiplyScalar(0.85);
      }
    }
  });
}

/** Undo applyDisturbed — the island restocked it while you were gone. */
export function applyRestored(root: THREE.Object3D): void {
  if (!root.userData.disturbedApplied) return;
  delete root.userData.disturbedApplied;
  const restored = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o.name === 'opener' && o.userData.preDisturbed) {
      const p = o.userData.preDisturbed as { rx: number; ry: number; rz: number; dx: number; dy: number; dz: number };
      o.rotation.set(p.rx, p.ry, p.rz);
      o.position.set(p.dx, p.dy, p.dz);
      delete o.userData.preDisturbed;
    }
    if (o instanceof THREE.Mesh) {
      const m = o.material as THREE.MeshStandardMaterial;
      if ('color' in m && !restored.has(m) && o.userData.preColor !== undefined) {
        restored.add(m);
        m.color.setHex(o.userData.preColor as number);
        delete o.userData.preColor;
      }
    }
  });
}
