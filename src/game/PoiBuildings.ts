// PoiBuildings.ts — POI-scale buildings for the beta island: strip mall,
// gas station, warehouse, school, barn, marina boathouse. Same quality bar as
// Houses.ts (walls with real door gaps, joined roofs, framed windows,
// foundation skirts, colliders, floor rects, loot containers) — distinct
// archetypes, not house variants.

import * as THREE from 'three';
import { FURNITURE_LOOT, type HuskLootEntry } from '../data/items';
import { FURNITURE_HALF, FURNITURE_LABEL, type FurnitureKind } from './furnitureMeshes';
import { type Collider, type FloorRect } from './Colliders';
import type { ContainerDef } from './Interact';

function aabb(x0: number, z0: number, x1: number, z1: number): Collider {
  return { x0, z0, x1, z1 };
}

export interface PoiBuildResult {
  group: THREE.Group;
  colliders: Collider[];
  floors: FloorRect[];
  containers: ContainerDef[];
  roofs: { bounds: { x0: number; z0: number; x1: number; z1: number }; group: THREE.Group }[];
}

export interface PoiFootprint {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
}

type GroundY = (x: number, z: number) => number;

interface WallOpt {
  doorW?: number; // gap width on the front wall, centered
  doorX?: number; // gap center offset (default 0)
  winN?: number; // windows per side wall
}

class B {
  group = new THREE.Group();
  colliders: Collider[] = [];
  floors: FloorRect[] = [];
  containers: ContainerDef[] = [];
  roofs: PoiBuildResult['roofs'] = [];
  constructor(
    readonly cx: number,
    readonly cz: number,
    readonly w: number,
    readonly d: number,
    readonly h: number, // wall height
    readonly t = 0.18,
    readonly base: number = 0,
    readonly color = 0x8a7f72,
  ) {}
  private box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 1 }),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }
  /** Perimeter walls with a door gap on the front (+Z), framed windows on sides. */
  shell(opt: WallOpt = {}): void {
    const { w, d, h, t } = this;
    const hw = w / 2;
    const hd = d / 2;
    const seg = (sw: number, sd: number, x: number, z: number) => {
      const m = this.box(sw, h, sd, this.color, x, h / 2 - 0.3, z);
      this.colliders.push(aabb(x - sw / 2, z - sd / 2, x + sw / 2, z + sd / 2));
      return m;
    };
    const doorW = opt.doorW ?? 0;
    const doorX = opt.doorX ?? 0;
    if (doorW > 0) {
      const lo = doorX - doorW / 2;
      const hi = doorX + doorW / 2;
      seg(lo + hw, t, (-hw + lo) / 2, hd - t / 2);
      seg(hw - hi, t, (hi + hw) / 2, hd - t / 2);
      // header above the door + jambs + a real leaf, open inward
      const jamb = this.color;
      this.box(t, 2.05, t, jamb, lo + t / 2, 0.72, hd - t / 2);
      this.box(t, 2.05, t, jamb, hi - t / 2, 0.72, hd - t / 2);
      this.box(doorW, h - 2.05, t, this.color, doorX, 2.05 + (h - 2.05) / 2 - 0.3, hd - t / 2);
      const leaf = this.box(doorW - 0.08, 2.0, 0.06, 0x5a4632, lo + 0.06, 0.72, hd - t / 2 - 0.06);
      leaf.geometry.translate(-(doorW - 0.08) / 2, 0, 0);
      leaf.position.x = lo + 0.06 + (doorW - 0.08) / 2;
      leaf.rotation.y = 0.35;
    } else {
      seg(w, t, 0, hd - t / 2);
    }
    seg(w, t, 0, -hd + t / 2);
    seg(t, d - 2 * t, -hw + t / 2, 0);
    seg(t, d - 2 * t, hw - t / 2, 0);
    // framed windows on the side walls
    const n = opt.winN ?? 2;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const z = -hd + t + ((i + 1) * (d - 2 * t)) / (n + 1);
        this.box(0.08, 1.1, 1.0, this.color, sx * (hw - t / 2), 1.3, z);
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 1.0, 0.86),
          new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.2, metalness: 0.4 }),
        );
        glass.position.set(sx * (hw - t / 2), 1.3, z);
        this.group.add(glass);
        this.box(0.1, 0.08, 1.0, 0xd8d0c0, sx * (hw - t / 2), 0.78, z); // sill
      }
    }
    // foundation skirt + floor
    this.box(w + 0.24, 0.55, d + 0.24, 0x6a625a, 0, -0.14, 0);
    this.box(w - t, 0.14, d - t, 0x9a938a, 0, 0.07, 0);
    const fr = aabb(-hw + t / 2, -hd + t / 2, hw - t / 2, hd - t / 2);
    this.floors.push({ x0: fr.x0, z0: fr.z0, x1: fr.x1, z1: fr.z1, y: 0.14 });
  }
  gableRoof(riseFrac = 0.35, color = 0x6e4a3a): void {
    const { w, d, h } = this;
    const hw = w / 2;
    const hd = d / 2;
    const rise = riseFrac * hd;
    const top = h - 0.3 + 0.1; // wall top the roof sits on
    // endpoint-exact panels: eave overhang outside, top edges MEET at the
    // ridge (the old slope+0.5 panels crossed through it — an X from
    // below — and the gable triangles were pasted on the eave sides,
    // leaving both ends of the roof open)
    const slopeLen = Math.hypot(hd + 0.39, rise + 0.08);
    const a = Math.atan2(rise + 0.08, hd + 0.39);
    const roofGroup = new THREE.Group();
    const roofMat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    for (const sgn of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.14, slopeLen), roofMat);
      panel.rotation.x = -sgn * a;
      panel.position.set(0, top + (rise - 0.04) / 2, sgn * ((hd + 0.33) / 2));
      panel.castShadow = true;
      roofGroup.add(panel);
      const fascia = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.7, 0.22, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 }),
      );
      fascia.position.set(0, h - 0.3, sgn * (hd + 0.3));
      roofGroup.add(fascia);
    }
    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.7, 0.14, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 }),
    );
    ridge.position.set(0, top + rise + 0.02, 0);
    ridge.castShadow = true;
    roofGroup.add(ridge);
    // gable caps on the X ends, in the ZY plane — these close the roof
    const capMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 1, side: THREE.DoubleSide });
    for (const sgn of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-hd, top - 0.05);
      shape.lineTo(hd, top - 0.05);
      shape.lineTo(0, top + rise);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateY(Math.PI / 2);
      const gable = new THREE.Mesh(geo, capMat);
      gable.position.set(sgn * (hw - 0.02), 0, 0);
      gable.castShadow = true;
      roofGroup.add(gable);
    }
    this.group.add(roofGroup);
    this.roofs.push({ bounds: aabb(-hw, -hd, hw, hd), group: roofGroup });
  }
  flatRoof(color = 0x5a5a5e): void {
    const { w, d, h } = this;
    const hw = w / 2;
    const hd = d / 2;
    const roofGroup = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.5, 0.16, d + 0.5),
      new THREE.MeshStandardMaterial({ color, roughness: 1 }),
    );
    slab.position.set(0, h - 0.28, 0);
    slab.castShadow = true;
    roofGroup.add(slab);
    const par = new THREE.MeshStandardMaterial({ color: this.color, roughness: 1 });
    for (const [pw, pd, px, pz] of [
      [w + 0.5, 0.12, 0, hd + 0.2],
      [w + 0.5, 0.12, 0, -hd - 0.2],
      [0.12, d + 0.5, -hw - 0.2, 0],
      [0.12, d + 0.5, hw + 0.2, 0],
    ] as [number, number, number, number][]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.5, pd), par);
      p.position.set(px, h - 0.28 + 0.25, pz);
      p.castShadow = true;
      roofGroup.add(p);
    }
    this.group.add(roofGroup);
    this.roofs.push({ bounds: aabb(-hw, -hd, hw, hd), group: roofGroup });
  }
  /** Interior loot container backed by furniture meshes. Local coords. */
  furnish(kind: FurnitureKind, lx: number, lz: number, id: string, loot: HuskLootEntry[], label?: string): void {
    const [hx, hz] = FURNITURE_HALF[kind];
    this.colliders.push(aabb(lx - hx, lz - hz, lx + hx, lz + hz));
    this.containers.push({
      id,
      x: this.cx + lx,
      z: this.cz + lz,
      loot,
      label: label ?? FURNITURE_LABEL[kind],
      meshKind: kind,
    });
  }
  finalize(): void {
    this.group.position.set(this.cx, this.base, this.cz);
  }
}

// ---------------------------------------------------------------------------
// archetypes

function stripMall(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 16, 7, 3.4, 0.2, groundY(cx, cz) - 0.1, 0x9a8f80);
  b.shell({ doorW: 1.6, doorX: -5.2, winN: 3 });
  b.flatRoof();
  // storefront bays on the front: big glass for all three shops
  for (const bx of [-5.2, 0, 5.2]) {
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 1.6, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.15, metalness: 0.4 }),
    );
    glass.position.set(bx, 1.5, 3.52);
    b.group.add(glass);
  }
  // signage strip
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(15.5, 0.7, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x2e4a6e, roughness: 0.8 }),
  );
  sign.position.set(0, 2.95, 3.55);
  b.group.add(sign);
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(15.0, 0.1, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xe8b34b, emissive: 0xe8b34b, emissiveIntensity: 0.4 }),
  );
  strip.position.set(0, 2.55, 3.56);
  b.group.add(strip);
  b.furnish('crate', -5, -2, 'mall_crate_1', FURNITURE_LOOT.crate.suburban);
  b.furnish('crate', 5, -2, 'mall_crate_2', FURNITURE_LOOT.crate.suburban);
  b.furnish('toolbox', 0, -2, 'mall_toolbox', FURNITURE_LOOT.toolbox.suburban);
  b.finalize();
  return b;
}

function gasStation(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 5, 4, 2.9, 0.18, groundY(cx, cz) - 0.1, 0xa09a8e);
  b.shell({ doorW: 1.2, winN: 1 });
  b.flatRoof(0x6a6a6e);
  // canopy: flat slab on four columns over two pump islands
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.8 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 9), canopyMat);
  slab.position.set(0, 4.4, 10);
  slab.castShadow = true;
  b.group.add(slab);
  for (const [px, pz] of [[-5, 6], [5, 6], [-5, 14], [5, 14]] as [number, number][]) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 4.4, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.9 }),
    );
    col.position.set(px, 2.2, pz);
    col.castShadow = true;
    b.group.add(col);
  }
  for (const px of [-3, 3]) {
    const pump = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.7 }),
    );
    pump.position.set(px, 0.65, 10);
    pump.castShadow = true;
    b.group.add(pump);
    b.colliders.push(aabb(px - 0.35, 10 - 0.25, px + 0.35, 10 + 0.25));
  }
  b.containers.push({
    id: 'gas_pump_loot',
    x: cx,
    z: cz + 10,
    loot: [{ id: 'fuel_can', min: 1, max: 2, chance: 0.6 }, { id: 'scrap', min: 1, max: 2, chance: 0.5 }],
    label: 'Search pump island',
    searchTime: 2.5,
  });
  b.furnish('cabinets', 0, -1, 'gas_kiosk_cabinets', FURNITURE_LOOT.cabinets.suburban);
  b.finalize();
  return b;
}

function warehouse(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 17, 11, 4.6, 0.22, groundY(cx, cz) - 0.1, 0x7a8a94);
  b.shell({ doorW: 3.2, winN: 3 });
  b.gableRoof(0.22, 0x4a5a63);
  // sliding door half-open beside the gap
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3.6, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x5a6a74, roughness: 0.9 }),
  );
  panel.position.set(3.3, 1.5, 5.52);
  panel.castShadow = true;
  b.group.add(panel);
  b.furnish('crate', -5, -3, 'wh_crate_1', FURNITURE_LOOT.crate.suburban);
  b.furnish('crate', -5, 2, 'wh_crate_2', FURNITURE_LOOT.crate.suburban);
  b.furnish('crate', 5, -3, 'wh_crate_3', FURNITURE_LOOT.crate.suburban);
  b.furnish('barrel', 5, 2, 'wh_barrel', FURNITURE_LOOT.barrel.suburban);
  b.furnish('toolbox', 0, -4, 'wh_toolbox', FURNITURE_LOOT.toolbox.suburban);
  b.finalize();
  return b;
}

/** store_convenience_small (Stitch): white block walls, flat roof +
 *  parapet, glass storefront, sign band, and shelving/fridges inside
 *  stocked food/produce/medical-leaning. */
function convenienceStore(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 12, 10, 3.4, 0.2, groundY(cx, cz) - 0.1, 0xdcd8d0);
  b.shell({ doorW: 1.4, winN: 2 });
  b.flatRoof(0x6a6a6e);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.15, metalness: 0.4 });
  // storefront glass flanking the door
  for (const gx of [-3.4, 3.4]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.9, 0.06), glassMat);
    pane.position.set(gx, 1.35, 5.02);
    pane.castShadow = true;
    b.group.add(pane);
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.9, 0.08), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 1 }));
    mull.position.set(gx, 1.35, 5.03);
    b.group.add(mull);
  }
  // sign band + lit strip + a little OPEN glow by the door
  const sign = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.85, 0.12), new THREE.MeshStandardMaterial({ color: 0x2e7a6e, roughness: 0.8 }));
  sign.position.set(0, 2.95, 5.06);
  b.group.add(sign);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.09, 0.06), new THREE.MeshStandardMaterial({ color: 0xf2e3b3, emissive: 0xf2e3b3, emissiveIntensity: 0.5 }));
  strip.position.set(0, 2.45, 5.07);
  b.group.add(strip);
  const open = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.3, 0.05), new THREE.MeshStandardMaterial({ color: 0xffb35c, emissive: 0xff9a3c, emissiveIntensity: 0.9 }));
  open.position.set(1.35, 1.7, 5.05);
  b.group.add(open);
  // rooftop AC unit
  const ac = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.5), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.9 }));
  ac.position.set(-3, 3.55, -2);
  ac.castShadow = true;
  b.group.add(ac);
  // interior: shelf runs down the back + a freestanding aisle, fridge +
  // cooler by the walls — food/produce with a medical lean at the counter
  const GROCERY = [
    { id: 'canned_food', min: 1, max: 3, chance: 0.85 },
    { id: 'water_bottle', min: 1, max: 2, chance: 0.6 },
    { id: 'cooked_meat', min: 1, max: 1, chance: 0.3 },
  ];
  const PHARMACY = [
    { id: 'bandage', min: 1, max: 2, chance: 0.65 },
    { id: 'medkit', min: 1, max: 1, chance: 0.22 },
    { id: 'cloth', min: 1, max: 2, chance: 0.4 },
  ];
  b.furnish('bookshelf', -3.6, -3.9, 'store_shelf_1', GROCERY, 'Search grocery shelf');
  b.furnish('bookshelf', 0, -3.9, 'store_shelf_2', GROCERY, 'Search grocery shelf');
  b.furnish('bookshelf', 0, 0.4, 'store_aisle', GROCERY, 'Search grocery shelf');
  b.furnish('cabinets', 3.6, -3.9, 'store_pharmacy', PHARMACY, 'Search pharmacy shelf');
  b.furnish('fridge', -5.0, 1.6, 'store_fridge', FURNITURE_LOOT.fridge.suburban);
  b.furnish('cooler', 5.0, 3.4, 'store_cooler', FURNITURE_LOOT.cooler.suburban);
  b.furnish('crate', -5.0, -3.6, 'store_stock', FURNITURE_LOOT.crate.suburban);
  b.finalize();
  return b;
}

/** industrial_garage_1 (Stitch): red-brown brick auto shop, corrugated
 *  gable roof, two roll-up bays (one rolled open, one shut), rooftop
 *  vents, and the repair economy's parts caches. The home POI for
 *  tire/engine_part/car_battery/armor_plate loot. */
function autoGarage(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 15, 12, 4.2, 0.22, groundY(cx, cz) - 0.1, 0x7a4438);
  const { w, d, h, t } = b;
  const hw = w / 2;
  const hd = d / 2;
  const seg = (sw: number, sd: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sd), new THREE.MeshStandardMaterial({ color: b.color, roughness: 1 }));
    m.position.set(x, h / 2 - 0.3, z);
    m.castShadow = true;
    m.receiveShadow = true;
    b.group.add(m);
    b.colliders.push(aabb(x - sw / 2, z - sd / 2, x + sw / 2, z + sd / 2));
    return m;
  };
  // back + sides solid; front gets two 3.4m bays and a pedestrian door
  // in the middle pier
  seg(w, t, 0, -hd + t / 2);
  seg(t, d - 2 * t, -hw + t / 2, 0);
  seg(t, d - 2 * t, hw - t / 2, 0);
  seg(2.2, t, -hw + 1.1, hd - t / 2); // front-left run
  seg(2.2, t, hw - 1.1, hd - t / 2); // front-right run
  seg(1.4, t, -1.2, hd - t / 2); // pier left of the walk door
  seg(1.4, t, 1.2, hd - t / 2); // pier right of the walk door
  // header band above the bays + walk door — VISUAL ONLY: a collider
  // here would seal the open bay (colliders are height-blind)
  const header = new THREE.Mesh(new THREE.BoxGeometry(w, h - 3.05, t), new THREE.MeshStandardMaterial({ color: b.color, roughness: 1 }));
  header.position.set(0, 3.05 - 0.3 + (h - 3.05) / 2, hd - t / 2);
  header.castShadow = true;
  b.group.add(header);
  // pedestrian door leaf, ajar
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.94, 2.0, 0.06), new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 1 }));
  leaf.geometry.translate(-0.47, 0, 0);
  leaf.position.set(-0.47, 0.72, hd - t / 2 - 0.05);
  leaf.rotation.y = 0.4;
  leaf.castShadow = true;
  b.group.add(leaf);
  // high side windows (garage glass sits tall)
  for (const sx of [-1, 1]) {
    for (const wz of [-2.6, 2.6]) {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.9, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.2, metalness: 0.4 }),
      );
      glass.position.set(sx * (hw - t / 2), 2.6, wz);
      b.group.add(glass);
    }
  }
  // foundation skirt + concrete floor (same recipe as B.shell)
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, 0.55, d + 0.24), new THREE.MeshStandardMaterial({ color: 0x6a625a, roughness: 1 }));
  skirt.position.set(0, -0.14, 0);
  b.group.add(skirt);
  const slabM = new THREE.Mesh(new THREE.BoxGeometry(w - t, 0.14, d - t), new THREE.MeshStandardMaterial({ color: 0x8a8078, roughness: 1 }));
  slabM.position.set(0, 0.07, 0);
  slabM.receiveShadow = true;
  b.group.add(slabM);
  const fr = aabb(-hw + t / 2, -hd + t / 2, hw - t / 2, hd - t / 2);
  b.floors.push({ x0: fr.x0, z0: fr.z0, x1: fr.x1, z1: fr.z1, y: 0.14 });
  b.gableRoof(0.32, 0x8a5a40); // corrugated, rust-brown
  // ----- roll-up doors -----
  const slatMat = new THREE.MeshStandardMaterial({ color: 0x8b9299, roughness: 0.6, metalness: 0.35 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.8 });
  for (const bx of [-3.6, 3.6]) {
    for (const rx of [bx - 1.74, bx + 1.74]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.05, 0.12), railMat);
      rail.position.set(rx, 1.22, hd - t / 2);
      b.group.add(rail);
    }
  }
  // bay 1 (left): door rolled OPEN — coil drum + a couple of slats below it
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.4, 12), slatMat);
  coil.rotation.z = Math.PI / 2;
  coil.position.set(-3.6, 3.0, hd - 0.42);
  coil.castShadow = true;
  b.group.add(coil);
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.17, 0.05), slatMat);
    s.position.set(-3.6, 2.78 - i * 0.18, hd - t / 2);
    b.group.add(s);
  }
  // bay 2 (right): door SHUT — full slat curtain + collider
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.37, 0.05), slatMat);
    s.position.set(3.6, 0.32 + i * 0.37, hd - t / 2);
    s.castShadow = true;
    b.group.add(s);
  }
  b.colliders.push(aabb(1.86, hd - 0.16, 5.34, hd + 0.02));
  // rooftop vents: two louver boxes riding the slopes + an exhaust stack
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.7, metalness: 0.3 });
  const slopeA = Math.atan2(0.32 * hd + 0.08, hd + 0.39);
  for (const [vx, vz, sgn] of [[-3.5, -2.2, 1], [3.5, 2.2, -1]] as [number, number, number][]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.65, 0.95), ventMat);
    const surfY = h - 0.2 + 0.32 * hd * (1 - Math.abs(vz) / (hd + 0.39));
    vent.position.set(vx, surfY + 0.12, vz);
    vent.rotation.x = sgn * slopeA;
    vent.castShadow = true;
    b.group.add(vent);
  }
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 10), ventMat);
  stack.position.set(2.0, h - 0.2 + 0.32 * hd + 0.35, 0);
  stack.castShadow = true;
  b.group.add(stack);
  // interior: workbench (visual) + a tire stack beside the parts caches
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 0.8), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
  bench.position.set(-4.4, 0.56, -5.3);
  bench.castShadow = true;
  b.group.add(bench);
  b.colliders.push(aabb(-6.0, -5.7, -2.8, -4.9));
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.26, 14), tireMat);
    tire.position.set(6.2, 0.27 + i * 0.27, 3.4);
    tire.castShadow = true;
    b.group.add(tire);
  }
  b.colliders.push(aabb(5.83, 3.03, 6.57, 3.77));
  const PARTS = [
    { id: 'tire', min: 1, max: 1, chance: 0.5 },
    { id: 'engine_part', min: 1, max: 1, chance: 0.4 },
    { id: 'car_battery', min: 1, max: 1, chance: 0.45 },
    { id: 'armor_plate', min: 1, max: 1, chance: 0.3 },
    { id: 'scrap', min: 2, max: 4, chance: 0.85 },
  ];
  const BATTERIES = [
    { id: 'car_battery', min: 1, max: 2, chance: 0.7 },
    { id: 'wire', min: 1, max: 2, chance: 0.5 },
    { id: 'scrap', min: 1, max: 2, chance: 0.6 },
  ];
  b.furnish('bookshelf', 0.5, -5.2, 'garage_parts_shelf', PARTS, 'Search parts shelf');
  b.furnish('cabinets', 6.5, -0.6, 'garage_battery_rack', BATTERIES, 'Search battery rack');
  b.furnish('toolbox', -6.4, -4.6, 'garage_toolbox_1', FURNITURE_LOOT.toolbox.suburban);
  b.furnish('toolbox', 6.4, -4.6, 'garage_toolbox_2', FURNITURE_LOOT.toolbox.suburban);
  b.furnish('crate', -6.4, 3.6, 'garage_crate', FURNITURE_LOOT.crate.suburban);
  b.furnish('barrel', -6.5, 0.8, 'garage_barrel', FURNITURE_LOOT.barrel.suburban);
  b.finalize();
  return b;
}

function school(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 19, 10, 3.8, 0.2, groundY(cx, cz) - 0.1, 0xa8785a);
  b.shell({ doorW: 2.2, winN: 4 });
  b.flatRoof(0x5e5e62);
  // entrance portico
  const portico = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.25, 2),
    new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 }),
  );
  portico.position.set(0, 3.3, 6);
  portico.castShadow = true;
  b.group.add(portico);
  for (const px of [-2.6, 2.6]) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 3.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 1 }),
    );
    col.position.set(px, 1.65, 6);
    b.group.add(col);
  }
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.6, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x3a5a7a, roughness: 0.8 }),
  );
  sign.position.set(0, 3.0, 5.05);
  b.group.add(sign);
  b.furnish('bookshelf', -7, -3, 'school_shelf', FURNITURE_LOOT.bookshelf.suburban);
  b.furnish('cabinets', 7, -3, 'school_cabinets', FURNITURE_LOOT.cabinets.suburban);
  b.furnish('crate', 0, -3, 'school_crate', FURNITURE_LOOT.crate.suburban);
  b.furnish('cooler', -7, 3, 'school_cooler', FURNITURE_LOOT.cooler.suburban);
  b.finalize();
  return b;
}

function barn(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 10, 8, 3.2, 0.2, groundY(cx, cz) - 0.1, 0x8a3a2e);
  b.shell({ doorW: 2.6, winN: 1 });
  b.gableRoof(0.55, 0x5a2e24);
  // big double doors, swung open
  for (const sgn of [-1, 1]) {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 2.4, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x6e2e22, roughness: 1 }),
    );
    leaf.geometry.translate(sgn * 0.625, 0, 0);
    leaf.position.set(sgn * 1.25, 0.9, 4.06);
    leaf.rotation.y = sgn * -0.7;
    leaf.castShadow = true;
    b.group.add(leaf);
  }
  // hay bales
  for (const [bx, bz] of [[-3, -2], [3, -2], [-3, 1.5]] as [number, number][]) {
    const bale = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.9, 10),
      new THREE.MeshStandardMaterial({ color: 0xb8a44a, roughness: 1 }),
    );
    bale.rotation.z = Math.PI / 2;
    bale.position.set(bx, 0.7, bz);
    bale.castShadow = true;
    b.group.add(bale);
    b.colliders.push(aabb(bx - 0.45, bz - 0.7, bx + 0.45, bz + 0.7));
  }
  b.furnish('toolbox', 3.5, 2, 'barn_toolbox', FURNITURE_LOOT.toolbox.suburban);
  b.furnish('crate', -3.5, 2.5, 'barn_crate', FURNITURE_LOOT.crate.suburban);
  b.finalize();
  return b;
}

function boathouse(cx: number, cz: number, groundY: GroundY): B {
  const b = new B(cx, cz, 10, 7, 3.0, 0.18, groundY(cx, cz) - 0.1, 0x5a6a72);
  // open front facing the water (+Z): no front wall, no door
  const hw = 5;
  const hd = 3.5;
  const t = 0.18;
  const seg = (sw: number, sd: number, x: number, z: number) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(sw, 3.0, sd),
      new THREE.MeshStandardMaterial({ color: 0x5a6a72, roughness: 1 }),
    );
    m.position.set(x, 1.2, z);
    m.castShadow = true;
    b.group.add(m);
    b.colliders.push(aabb(x - sw / 2, z - sd / 2, x + sw / 2, z + sd / 2));
  };
  seg(10, t, 0, -hd + t / 2);
  seg(t, 7, -hw + t / 2, 0);
  seg(t, 7, hw - t / 2, 0);
  // dock: planks running out over the water
  for (let i = 0; i < 8; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.1, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }),
    );
    plank.position.set(0, 0.35, hd + 0.8 + i * 0.78);
    b.group.add(plank);
  }
  b.gableRoof(0.3, 0x3a4a52);
  b.furnish('crate', -3.5, -2, 'dock_crate', FURNITURE_LOOT.crate.camp);
  b.furnish('cooler', 3.5, -2, 'dock_cooler', FURNITURE_LOOT.cooler.camp);
  b.containers.push({
    id: 'dock_boat_tools',
    x: cx + 2,
    z: cz + 1,
    loot: [{ id: 'scrap', min: 1, max: 3, chance: 0.8 }, { id: 'wire', min: 1, max: 2, chance: 0.6 }],
    label: 'Search dock box',
    meshKind: 'toolbox',
    searchTime: 2,
  });
  b.finalize();
  return b;
}

// ---------------------------------------------------------------------------
// placement

export function poiFootprints(pois: Record<string, [number, number]>): PoiFootprint[] {
  const at = (pid: string, dx: number, dz: number): [number, number] => {
    const p = pois[pid] ?? [0, 0];
    return [p[0] + dx, p[1] + dz];
  };
  const town: [number, number, number, number][] = [
    [55, -30, 8.5, 4], // strip mall
    [105, 55, 9, 6], // warehouse
    [-30, 60, 10, 5.5], // school
    [30, 48, 6.5, 5.5], // convenience store
    [130, 58, 8, 6.5], // auto garage (by the warehouse)
  ];
  const out: PoiFootprint[] = town.map(([dx, dz, hw, hd]) => {
    const [cx, cz] = at('town', dx, dz);
    return { cx, cz, hw, hd };
  });
  {
    // gas station: pad covers the kiosk, the canopy, and both pump islands
    const [kx, kz] = at('town', 75, 30);
    out.push({ cx: kx, cz: kz + 8, hw: 7.5, hd: 9 });
  }
  {
    const [cx, cz] = at('jonah_camp', -16, -10);
    out.push({ cx, cz, hw: 5.5, hd: 4.5 }); // barn
  }
  {
    const [cx, cz] = at('marina', 0, 0);
    out.push({ cx, cz, hw: 5.5, hd: 4 }); // boathouse
  }
  return out;
}

export function buildPoiBuildings(
  scene: THREE.Scene,
  pois: Record<string, [number, number]>,
  groundY: GroundY,
): PoiBuildResult {
  const out: PoiBuildResult = { group: new THREE.Group(), colliders: [], floors: [], containers: [], roofs: [] };
  const add = (b: B) => {
    // local colliders/floors bake into world space by the building's center
    for (const c of b.colliders) {
      out.colliders.push({ x0: b.cx + c.x0, z0: b.cz + c.z0, x1: b.cx + c.x1, z1: b.cz + c.z1 });
    }
    for (const f of b.floors) {
      out.floors.push({
        x0: b.cx + f.x0,
        z0: b.cz + f.z0,
        x1: b.cx + f.x1,
        z1: b.cz + f.z1,
        y: f.y,
      });
    }
    out.group.add(b.group);
    out.containers.push(...b.containers);
    // roof bounds must be world-space too (they were pushed raw — the
    // hide-roof check compared them against world positions and misfired)
    for (const r of b.roofs) {
      out.roofs.push({
        bounds: { x0: b.cx + r.bounds.x0, z0: b.cz + r.bounds.z0, x1: b.cx + r.bounds.x1, z1: b.cz + r.bounds.z1 },
        group: r.group,
      });
    }
  };
  const at = (pid: string, dx: number, dz: number): [number, number] => {
    const p = pois[pid] ?? [0, 0];
    return [p[0] + dx, p[1] + dz];
  };
  let m: [number, number];
  m = at('town', 55, -30);
  add(stripMall(m[0], m[1], groundY));
  m = at('town', 75, 30);
  add(gasStation(m[0], m[1], groundY));
  m = at('town', 105, 55);
  add(warehouse(m[0], m[1], groundY));
  m = at('town', -30, 60);
  add(school(m[0], m[1], groundY));
  m = at('town', 30, 48);
  add(convenienceStore(m[0], m[1], groundY));
  m = at('town', 130, 58);
  add(autoGarage(m[0], m[1], groundY));
  m = at('jonah_camp', -16, -10);
  add(barn(m[0], m[1], groundY));
  m = at('marina', 0, 0);
  add(boathouse(m[0], m[1], groundY));
  scene.add(out.group);
  return out;
}
