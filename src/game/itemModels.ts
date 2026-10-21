// itemModels.ts — real ground/world models for the items weaponMeshes
// doesn't cover (Lane 6, SYSTEMS_SPEC order item 4). weaponMeshes owns
// weapons + a first set of props; everything else in the catalog fell
// back to its generic default box. This module gives the rest a
// silhouette: a tire is a torus, a circuit board is a green slab with
// chips, gun_parts are a tray of springs and pins.
//
// WIRED (stage 7): Interact.buildPickupMesh prefers buildItemModel()
// and falls back to weaponMeshes' buildGroundMesh for unmodeled ids.

import * as THREE from 'three';

const M = {
  steel: () => new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.7 }),
  darkSteel: () => new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.45, metalness: 0.55 }),
  black: () => new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.6 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.95 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xc9a44a, roughness: 0.35, metalness: 0.7 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.4, metalness: 0.7 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85 }),
  tan: () => new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.95 }),
  olive: () => new THREE.MeshStandardMaterial({ color: 0x5a6248, roughness: 0.9 }),
  redPlastic: () => new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 }),
  pcb: () => new THREE.MeshStandardMaterial({ color: 0x1e6a34, roughness: 0.55 }),
  glass: () => new THREE.MeshStandardMaterial({ color: 0x7ab0c9, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55 }),
};

type Add = (geo: THREE.BufferGeometry, mat: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh;

function group(): { g: THREE.Group; add: Add } {
  const g = new THREE.Group();
  const add: Add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  return { g, add };
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Ids this module models. Anything else returns null from the builder. */
export const ITEM_MODEL_IDS = new Set([
  'raw_meat', 'cooked_meat', 'relay_part', 'beacon_cell', 'pack_t1', 'pack_t2',
  'tire', 'engine_part', 'car_battery', 'armor_plate', 'fire_starter', 'wood',
  'gun_parts', 'valuables', 'produce', 'lockpick', 'tool_kit', 'cleaning_kit',
  'gun_oil', 'ammo_556', 'bolts', 'reflex_sight', 'suppressor', 'extended_mag',
  'foregrip', 'laser_sight', 'scope', 'choke', 'flashlight',
  'finish_matte', 'finish_camo', 'finish_rust', 'finish_worn',
  'armored_vest', 'riot_helmet', 'plate_carrier', 'shin_guards',
  'circuit_board', 'gunpowder', 'brass', 'lead', 'bp_turret', 'turret',
]);

export function buildItemModel(itemId: string, qty = 1): THREE.Group | null {
  if (!ITEM_MODEL_IDS.has(itemId)) return null;
  const { g, add } = group();
  switch (itemId) {
    case 'raw_meat': {
      add(box(0.34, 0.09, 0.22), new THREE.MeshStandardMaterial({ color: 0x8a3038, roughness: 0.7 }), 0, 0.05, 0);
      const bone = add(cyl(0.02, 0.02, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8 }), 0.1, 0.07, 0);
      bone.rotation.z = Math.PI / 2;
      break;
    }
    case 'cooked_meat': {
      add(box(0.34, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: 0x6e4526, roughness: 0.8 }), 0, 0.05, 0);
      for (const dx of [-0.08, 0.02, 0.11]) add(box(0.025, 0.012, 0.2), M.black(), dx, 0.095, 0); // sear marks
      break;
    }
    case 'relay_part': {
      // scorched capacitor: fat can, tarred top, two bent pins
      add(cyl(0.055, 0.055, 0.14, 14), M.darkSteel(), 0, 0.07, 0);
      add(cyl(0.057, 0.057, 0.02, 14), M.black(), 0, 0.145, 0);
      for (const s of [-1, 1]) {
        const pin = add(cyl(0.006, 0.006, 0.07, 6), M.copper(), s * 0.03, -0.02, 0);
        pin.rotation.z = s * 0.25;
      }
      break;
    }
    case 'beacon_cell': {
      add(cyl(0.07, 0.08, 0.22, 14), M.darkSteel(), 0, 0.11, 0);
      add(cyl(0.072, 0.072, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0xd88f2a, roughness: 0.4, emissive: 0x3a2404 }), 0, 0.13, 0);
      add(cyl(0.05, 0.05, 0.03, 10), M.steel(), 0, 0.235, 0);
      break;
    }
    case 'pack_t1': case 'pack_t2': {
      const big = itemId === 'pack_t2';
      const body = big ? M.olive() : M.tan();
      add(box(big ? 0.44 : 0.38, big ? 0.52 : 0.44, 0.24), body, 0, (big ? 0.26 : 0.22), 0);
      add(cyl(0.09, 0.09, big ? 0.44 : 0.38, 10), body, 0, (big ? 0.55 : 0.47), 0).rotation.z = Math.PI / 2; // bedroll
      for (const s of [-1, 1]) add(box(0.07, big ? 0.4 : 0.34, 0.02), M.black(), s * 0.11, (big ? 0.26 : 0.22), -0.13); // straps
      if (big) for (const s of [-1, 1]) add(box(0.03, 0.56, 0.03), M.steel(), s * 0.24, 0.28, -0.1); // frame rails
      break;
    }
    case 'tire': {
      const t = add(new THREE.TorusGeometry(0.26, 0.09, 10, 22), M.rubber(), 0, 0.1, 0);
      t.rotation.x = Math.PI / 2;
      add(cyl(0.15, 0.15, 0.07, 16), M.darkSteel(), 0, 0.1, 0);
      break;
    }
    case 'engine_part': {
      add(box(0.4, 0.22, 0.26), M.darkSteel(), 0, 0.11, 0);
      for (const dx of [-0.12, 0, 0.12]) add(cyl(0.045, 0.045, 0.06, 10), M.steel(), dx, 0.25, 0);
      add(cyl(0.09, 0.09, 0.04, 14), M.black(), 0.24, 0.11, 0).rotation.z = Math.PI / 2; // pulley
      break;
    }
    case 'car_battery': {
      add(box(0.28, 0.2, 0.18), M.black(), 0, 0.1, 0);
      add(cyl(0.025, 0.025, 0.03, 8), M.steel(), -0.08, 0.215, 0);
      add(cyl(0.025, 0.025, 0.03, 8), M.redPlastic(), 0.08, 0.215, 0);
      add(box(0.2, 0.02, 0.1), M.darkSteel(), 0, 0.205, 0);
      break;
    }
    case 'armor_plate': {
      add(box(0.34, 0.02, 0.44), M.steel(), 0, 0.03, 0);
      for (const [dx, dz] of [[-0.13, -0.18], [0.13, -0.18], [-0.13, 0.18], [0.13, 0.18]]) {
        add(cyl(0.018, 0.018, 0.03, 8), M.darkSteel(), dx, 0.035, dz);
      }
      break;
    }
    case 'fire_starter': {
      add(box(0.16, 0.015, 0.05), M.steel(), 0, 0.02, 0);
      const wad = add(new THREE.ConeGeometry(0.045, 0.09, 8), M.tan(), 0.1, 0.045, 0.03);
      wad.rotation.z = -0.4;
      break;
    }
    case 'wood': {
      add(box(0.9, 0.06, 0.18), M.wood(), 0, 0.03, -0.1);
      add(box(0.85, 0.06, 0.18), M.wood(), 0.03, 0.09, 0.08);
      add(box(0.88, 0.06, 0.18), M.wood(), -0.02, 0.15, -0.02).rotation.y = 0.12;
      break;
    }
    case 'gun_parts': {
      add(box(0.36, 0.03, 0.26), M.darkSteel(), 0, 0.015, 0); // tray
      const spring = add(new THREE.TorusGeometry(0.05, 0.012, 6, 14), M.steel(), -0.08, 0.05, 0);
      spring.rotation.x = Math.PI / 2;
      add(cyl(0.012, 0.012, 0.16, 6), M.steel(), 0.08, 0.045, -0.05).rotation.z = Math.PI / 2; // pin
      add(box(0.07, 0.03, 0.05), M.brass(), 0.06, 0.045, 0.06); // trigger group
      if (qty > 1) add(box(0.05, 0.025, 0.04), M.darkSteel(), -0.02, 0.042, 0.07);
      break;
    }
    case 'valuables': {
      add(box(0.2, 0.07, 0.13), new THREE.MeshStandardMaterial({ color: 0x4a6a48, roughness: 0.8 }), 0, 0.035, 0); // cash brick
      add(new THREE.TorusGeometry(0.035, 0.01, 6, 14), M.brass(), 0.13, 0.03, 0.05).rotation.x = Math.PI / 2; // ring
      add(new THREE.OctahedronGeometry(0.03), new THREE.MeshStandardMaterial({ color: 0x7ad0e8, roughness: 0.1, metalness: 0.3 }), -0.12, 0.04, 0.04); // loose stone
      break;
    }
    case 'produce': {
      const fruit = new THREE.MeshStandardMaterial({ color: 0xb8562e, roughness: 0.6 });
      add(new THREE.SphereGeometry(0.055, 10, 8), fruit, -0.07, 0.055, 0);
      add(new THREE.SphereGeometry(0.05, 10, 8), fruit, 0.05, 0.05, 0.05);
      if (qty > 1) add(new THREE.SphereGeometry(0.048, 10, 8), fruit, 0.02, 0.05, -0.06);
      add(new THREE.ConeGeometry(0.03, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0x3a6a34, roughness: 0.9 }), 0, 0.12, 0.02); // greens
      break;
    }
    case 'lockpick': {
      const p1 = add(box(0.16, 0.006, 0.018), M.steel(), 0, 0.02, -0.02);
      p1.rotation.y = 0.2;
      const p2 = add(box(0.13, 0.006, 0.015), M.darkSteel(), 0.02, 0.02, 0.03);
      p2.rotation.y = -0.35;
      add(box(0.02, 0.012, 0.02), M.steel(), 0.1, 0.02, -0.045); // hook tip
      break;
    }
    case 'tool_kit': {
      add(box(0.44, 0.18, 0.24), M.redPlastic(), 0, 0.09, 0);
      add(cyl(0.02, 0.02, 0.2, 8), M.black(), 0, 0.21, 0).rotation.z = Math.PI / 2; // handle
      const wrench = add(box(0.2, 0.015, 0.04), M.steel(), 0.28, 0.05, 0.1);
      wrench.rotation.y = -0.5;
      break;
    }
    case 'cleaning_kit': {
      add(cyl(0.05, 0.05, 0.34, 10), M.tan(), 0, 0.05, 0).rotation.z = Math.PI / 2; // roll pouch
      add(cyl(0.006, 0.006, 0.4, 6), M.brass(), 0, 0.03, 0.07).rotation.z = Math.PI / 2; // rod
      break;
    }
    case 'gun_oil': {
      add(cyl(0.032, 0.036, 0.11, 10), new THREE.MeshStandardMaterial({ color: 0x3a5a7a, roughness: 0.4 }), 0, 0.055, 0);
      add(cyl(0.014, 0.014, 0.04, 8), M.black(), 0, 0.13, 0);
      break;
    }
    case 'ammo_556': {
      for (let i = 0; i < 3; i++) {
        const x = -0.05 + i * 0.05;
        add(cyl(0.011, 0.013, 0.045, 8), M.brass(), x, 0.023, 0);
        add(new THREE.ConeGeometry(0.009, 0.03, 8), M.copper(), x, 0.06, 0);
      }
      add(box(0.2, 0.012, 0.03), M.darkSteel(), 0, 0.008, 0); // stripper clip
      break;
    }
    case 'bolts': {
      for (let i = 0; i < 3; i++) {
        const z = -0.04 + i * 0.04;
        add(cyl(0.008, 0.008, 0.34, 6), M.wood(), 0, 0.03, z).rotation.z = Math.PI / 2;
        add(new THREE.ConeGeometry(0.011, 0.05, 6), M.steel(), 0.19, 0.03, z).rotation.z = -Math.PI / 2;
        add(box(0.06, 0.035, 0.006), M.redPlastic(), -0.14, 0.045, z); // fletching
      }
      break;
    }
    case 'reflex_sight': {
      add(box(0.05, 0.02, 0.09), M.black(), 0, 0.01, 0); // mount
      add(box(0.055, 0.06, 0.02), M.black(), 0, 0.05, 0.02); // frame
      add(box(0.04, 0.04, 0.005), M.glass(), 0, 0.055, 0.02);
      break;
    }
    case 'suppressor': {
      add(cyl(0.032, 0.032, 0.19, 14), M.darkSteel(), 0, 0.035, 0).rotation.z = Math.PI / 2;
      add(cyl(0.034, 0.034, 0.02, 14), M.black(), -0.09, 0.035, 0).rotation.z = Math.PI / 2;
      break;
    }
    case 'extended_mag': {
      add(box(0.045, 0.17, 0.09), M.darkSteel(), 0, 0.085, 0); // the long box
      add(box(0.055, 0.02, 0.1), M.black(), 0, 0.01, 0); // baseplate
      break;
    }
    case 'foregrip': {
      add(box(0.12, 0.02, 0.04), M.black(), 0, 0.09, 0); // rail stub
      const grip = add(cyl(0.02, 0.024, 0.11, 10), M.black(), 0, 0.035, 0);
      grip.rotation.z = 0.25;
      break;
    }
    case 'laser_sight': {
      add(box(0.035, 0.035, 0.08), M.black(), 0, 0.03, 0);
      add(cyl(0.008, 0.008, 0.01, 8), new THREE.MeshStandardMaterial({ color: 0xd82a2a, emissive: 0x550000 }), 0, 0.03, 0.045).rotation.x = Math.PI / 2;
      break;
    }
    case 'scope': {
      add(cyl(0.021, 0.021, 0.24, 12), M.black(), 0, 0.05, 0).rotation.z = Math.PI / 2; // tube
      add(cyl(0.032, 0.026, 0.05, 12), M.black(), 0.13, 0.05, 0).rotation.z = Math.PI / 2; // objective bell
      add(cyl(0.016, 0.016, 0.035, 10), M.darkSteel(), 0, 0.085, 0); // turret
      add(cyl(0.012, 0.012, 0.004, 10), M.glass(), 0.157, 0.05, 0).rotation.z = Math.PI / 2; // lens
      break;
    }
    case 'choke': {
      add(cyl(0.026, 0.026, 0.07, 12), M.darkSteel(), 0, 0.03, 0).rotation.z = Math.PI / 2;
      for (const dx of [-0.02, 0, 0.02]) add(new THREE.TorusGeometry(0.027, 0.004, 6, 12), M.black(), dx, 0.03, 0).rotation.y = Math.PI / 2; // knurl rings
      break;
    }
    case 'flashlight': {
      add(cyl(0.02, 0.02, 0.11, 12), M.black(), 0, 0.03, 0).rotation.z = Math.PI / 2;
      add(cyl(0.03, 0.024, 0.035, 12), M.darkSteel(), 0.07, 0.03, 0).rotation.z = Math.PI / 2; // head
      add(cyl(0.026, 0.026, 0.004, 12), M.glass(), 0.09, 0.03, 0).rotation.z = Math.PI / 2;
      break;
    }
    case 'finish_matte': case 'finish_camo': case 'finish_rust': case 'finish_worn': {
      const band = { finish_matte: 0x1e1e22, finish_camo: 0x5a6248, finish_rust: 0x7a4a2a, finish_worn: 0x9aa0a8 }[itemId];
      add(box(0.16, 0.18, 0.16), M.tan(), 0, 0.09, 0); // kit tin
      add(box(0.165, 0.05, 0.165), new THREE.MeshStandardMaterial({ color: band, roughness: 0.6 }), 0, 0.13, 0); // the finish, shown
      add(cyl(0.008, 0.008, 0.14, 6), M.wood(), 0.12, 0.05, 0.05).rotation.z = 1.1; // brush
      break;
    }
    case 'armored_vest': {
      add(box(0.4, 0.5, 0.09), new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.95 }), 0, 0.06, -0.08); // back panel
      add(box(0.4, 0.5, 0.09), new THREE.MeshStandardMaterial({ color: 0x55483a, roughness: 0.95 }), 0, 0.06, 0.09); // front panel
      for (const s of [-1, 1]) add(box(0.09, 0.05, 0.26), M.tan(), s * 0.14, 0.33, 0); // shoulders
      break;
    }
    case 'riot_helmet': {
      const shell = add(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.darkSteel(), 0, 0.1, 0);
      shell.scale.y = 1.15;
      add(box(0.26, 0.12, 0.02), M.glass(), 0, 0.12, 0.15); // cracked visor, worn proud
      break;
    }
    case 'plate_carrier': {
      add(box(0.36, 0.44, 0.05), M.olive(), 0, 0.05, 0.06); // front plate bag
      add(box(0.3, 0.36, 0.02), M.darkSteel(), 0, 0.05, 0.095); // the plate itself, peeking
      for (let i = 0; i < 3; i++) add(box(0.08, 0.12, 0.04), M.tan(), -0.11 + i * 0.11, 0.0, 0.1); // mag pouches
      for (const s of [-1, 1]) add(box(0.07, 0.04, 0.2), M.black(), s * 0.13, 0.3, 0); // shoulders
      break;
    }
    case 'shin_guards': {
      for (const s of [-1, 1]) {
        const guard = add(box(0.13, 0.34, 0.03), M.black(), s * 0.1, 0.03, 0);
        guard.rotation.x = -0.15;
        add(box(0.14, 0.03, 0.04), M.darkSteel(), s * 0.1, 0.14, -0.01); // strap
      }
      break;
    }
    case 'circuit_board': {
      add(box(0.24, 0.012, 0.17), M.pcb(), 0, 0.02, 0);
      add(box(0.07, 0.025, 0.05), M.black(), -0.05, 0.038, -0.02); // main chip
      add(box(0.04, 0.02, 0.04), M.black(), 0.06, 0.035, 0.03);
      for (let i = 0; i < 5; i++) add(box(0.012, 0.008, 0.03), M.brass(), -0.08 + i * 0.04, 0.03, 0.075); // gold fingers
      add(cyl(0.012, 0.012, 0.03, 8), M.darkSteel(), 0.08, 0.04, -0.05); // cap
      break;
    }
    case 'gunpowder': {
      add(cyl(0.09, 0.1, 0.2, 14), M.wood(), 0, 0.1, 0); // keg
      add(new THREE.TorusGeometry(0.098, 0.008, 6, 16), M.darkSteel(), 0, 0.15, 0).rotation.x = Math.PI / 2;
      add(box(0.1, 0.03, 0.06), M.black(), 0, 0.21, 0); // lid + stencil block
      break;
    }
    case 'brass': {
      // a spill of spent casings
      const spots: [number, number, number][] = [[0, 0, 0], [0.05, 0.01, 0.04], [-0.05, 0.01, 0.03], [0.02, 0.01, -0.05], [-0.03, 0.03, -0.01], [0.07, 0.03, -0.02]];
      for (const [x, y, z] of spots) {
        const c = add(cyl(0.011, 0.013, 0.045, 8), M.brass(), x, y + 0.012, z);
        c.rotation.set(Math.PI / 2, 0, x * 8);
      }
      if (qty > 3) add(cyl(0.011, 0.013, 0.045, 8), M.brass(), 0.01, 0.05, 0.01).rotation.x = Math.PI / 2;
      break;
    }
    case 'lead': {
      add(box(0.2, 0.05, 0.09), new THREE.MeshStandardMaterial({ color: 0x6a7076, roughness: 0.5, metalness: 0.6 }), 0, 0.025, 0);
      add(box(0.18, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x767c82, roughness: 0.5, metalness: 0.6 }), 0.01, 0.075, 0.01).rotation.y = 0.3;
      break;
    }
    case 'bp_turret': {
      add(cyl(0.035, 0.035, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x38618a, roughness: 0.6 }), 0, 0.04, 0).rotation.z = Math.PI / 2; // rolled plans tube
      add(box(0.26, 0.005, 0.19), new THREE.MeshStandardMaterial({ color: 0xd8dee2, roughness: 0.9 }), 0.02, 0.012, 0.1); // one sheet, escaped
      break;
    }
    case 'turret': {
      add(box(0.44, 0.05, 0.44), M.darkSteel(), 0, 0.025, 0); // base plate
      add(cyl(0.09, 0.11, 0.1, 12), M.darkSteel(), 0, 0.1, 0); // pedestal
      add(box(0.3, 0.16, 0.24), M.olive(), 0, 0.23, 0); // head
      for (const s of [-1, 1]) add(cyl(0.016, 0.016, 0.3, 8), M.black(), s * 0.05, 0.25, 0.24).rotation.x = Math.PI / 2; // twin barrels
      add(box(0.14, 0.12, 0.2), M.tan(), -0.23, 0.2, 0); // ammo box
      add(cyl(0.025, 0.025, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0xd82a2a, emissive: 0x440000 }), 0, 0.28, 0.125).rotation.x = Math.PI / 2; // the eye
      break;
    }
  }
  return g;
}
