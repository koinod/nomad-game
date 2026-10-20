// furnitureMeshes.ts — distinct low-poly meshes for house furniture,
// so every room reads at a glance. Origin at floor level, facing +Z.

import * as THREE from 'three';

export type FurnitureKind =
  | 'fridge' | 'cabinets' | 'dresser' | 'bookshelf'
  | 'cooler' | 'crate' | 'barrel' | 'toolbox';

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
};

function mat(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 1 });
}

export function buildFurnitureMesh(kind: FurnitureKind): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  switch (kind) {
    case 'fridge': {
      add(box(0.72, 1.68, 0.66), 0xd8dcd2, 0, 0.84, 0);
      add(box(0.66, 0.02, 0.6), 0x9aa0a8, 0, 1.18, 0.02); // door split
      add(box(0.04, 0.3, 0.04), 0x3a3d40, 0.3, 0.95, 0.34); // handle
      break;
    }
    case 'cabinets': {
      add(box(1.4, 0.88, 0.5), 0x8a6f4d, 0, 0.44, 0);
      add(box(1.44, 0.05, 0.54), 0x6e5639, 0, 0.9, 0); // countertop
      add(box(0.64, 0.5, 0.02), 0x6e5639, -0.35, 0.45, 0.26);
      add(box(0.64, 0.5, 0.02), 0x6e5639, 0.35, 0.45, 0.26);
      break;
    }
    case 'dresser': {
      add(box(1.2, 0.9, 0.5), 0x6b4e32, 0, 0.45, 0);
      for (const dy of [0.68, 0.38]) {
        add(box(1.04, 0.22, 0.02), 0x54401f, 0, dy, 0.26);
        add(box(0.08, 0.05, 0.03), 0x2e2a24, 0, dy, 0.28); // knob
      }
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
      add(box(0.62, 0.08, 0.42), 0xd8d8d0, 0, 0.42, 0); // lid
      break;
    }
    case 'crate': {
      add(box(0.9, 0.9, 0.9), 0x6e5a3e, 0, 0.45, 0);
      add(box(0.94, 0.08, 0.94), 0x54401f, 0, 0.82, 0);
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
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
