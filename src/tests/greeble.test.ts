/**
 * Greeble pass gate — the surface-detail layer over the Spec §3.2
 * sector kits + the airbase.
 *
 * The pass is ADDITIVE dressing: interiors furnished, yards
 * cluttered, fixtures named. These pins hold the contract:
 *  - every named dressing group is present in the built data
 *    (features, loot containers, named fixture meshes),
 *  - the new lootable props ride the shared container registry
 *    with zero duplicate ids across lighthouse+airfield+sectors,
 *  - solid dressing registered real colliders,
 *  - the geometry budget stays lean: per-sector ceilings and a
 *    total-added cap far under the 60k brief target.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildSectors } from '../game/Sectors';
import { SECTOR_BUILDINGS } from '../game/sectorSites';
import { buildAirbaseSite } from '../game/airbase';
import { heightAt } from '../game/World';
import { buildWorld } from './buildings.test';

/** Kit signage paints decal canvases; headless runs only need
 *  createElement('canvas') to exist (same stub as buildings.test,
 *  installed before the module-scope sector build below). */
function stubCanvas(): void {
  if (typeof document !== 'undefined') return;
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy({}, {
    get: (_t, p) => {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
      return () => undefined;
    },
    set: () => true,
  });
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas'
      ? { width: 0, height: 0, getContext: () => ctx, toDataURL: () => '' }
      : {}),
  };
}
stubCanvas();

const flat = (x: number, z: number): number => heightAt(x, z);

/** Pre-greeble export (tools/export_strongholds.ts @ ef19687):
 *  kits 21,206 + ground works 6,586 = 27,792 tris. */
const BASELINE_KITS: Record<string, number> = {
  ridge: 2584, citadel: 4336, lighthouse: 3508, refuge: 3378, pier_hq: 1622, tern_rock: 5778,
};
const BASELINE_GROUND = 6586;
const BASELINE_TOTAL = 27792;

/** After-state ceilings (measured + headroom): kits per sector,
 *  ground works total, and the pass's total-added cap. */
const KIT_CEILINGS: Record<string, number> = {
  ridge: 4000, citadel: 7000, lighthouse: 5500, refuge: 6200, pier_hq: 3600, tern_rock: 11500,
};
const GROUND_CEILING = 14000;
const ADDED_CAP = 20000; // measured +15,052 — the brief allows 60k

function triCount(root: THREE.Object3D): number {
  let tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  return Math.round(tris);
}

function countNamed(root: THREE.Object3D, name: string): number {
  let n = 0;
  root.traverse((o) => { if (o.name === name) n++; });
  return n;
}

const built = buildSectors(flat);

describe('greeble pass — dressing completeness', () => {
  it('named ground-dressing features are registered per sector', () => {
    const ids = new Set(built.features.map((f) => f.id));
    for (const id of [
      'ridge_guy_wires', 'ridge_pad_wear',
      'citadel_yard_clutter', 'citadel_yard_refinery_drums',
      'refuge_palisade_platforms', 'pier_slip_dressing',
    ]) {
      expect(ids.has(id), `feature ${id}`).toBe(true);
    }
  });

  it('new lootable dressing rides the container registry', () => {
    const ids = new Set<string>();
    for (const k of built.kits) for (const c of k.containers) ids.add(c.id);
    for (const id of [
      'ridge_bunker_dresser', 'ridge_tower_toolbox',
      'citadel_gate_w_toolbox', 'citadel_gate_e_toolbox',
      'tern_fuel_dock_toolbox',
    ]) {
      expect(ids.has(id), `container ${id}`).toBe(true);
    }
  });

  it('named fixture meshes are placed (emissive faces, fenders, nets)', () => {
    const all = new THREE.Group();
    for (const k of built.kits) all.add(k.group.clone());
    all.add(built.groundGroup.clone());
    expect(countNamed(all, 'crown_floodlight'), 'citadel crown floodlight faces').toBe(2);
    expect(countNamed(all, 'porch_lantern'), 'tern porch lanterns (3 cottages × rail pair + post)').toBe(9);
    expect(countNamed(all, 'dock_lantern'), 'fuel dock lantern').toBe(1);
    expect(countNamed(all, 'dock_fender'), 'fuel dock fenders').toBe(6);
    expect(countNamed(all, 'slip_fender'), 'pier slip fenders').toBe(12);
    expect(countNamed(all, 'gate_lantern'), 'refuge gate lanterns').toBe(4);
    expect(countNamed(all, 'deck_net'), 'boardwalk net bundles').toBe(2);
    expect(countNamed(all, 'deck_buoy'), 'boardwalk buoys').toBe(3);
  });

  it('solid dressing registered colliders (ground props + kit obstacles)', () => {
    // ground props are AABBs: guy-wire anchors, yard clutter, posts…
    expect(built.propColliders.length).toBeGreaterThanOrEqual(12);
    const covers = (x: number, z: number, r: number): boolean =>
      built.propColliders.some((c) => x >= c.x0 - r && x <= c.x1 + r && z >= c.z0 - r && z <= c.z1 + r);
    expect(covers(288, -188.6, 0.3), 'citadel drum cluster collider').toBe(true);
    expect(covers(292, -196, 0.3), 'citadel tire pile collider').toBe(true);
    expect(covers(-60, -49.2, 1.2), 'refuge platform posts collider').toBe(true);
    // kit-side dressing obstacles land as building colliders too
    const kitCovers = (x: number, z: number, r: number): boolean =>
      built.kits.some((k) => k.building.colliders.some((c) => x >= c.x0 - r && x <= c.x1 + r && z >= c.z0 - r && z <= c.z1 + r));
    expect(kitCovers(-543.6, -210.3, 0.4), 'bunker map table collider').toBe(true);
    expect(kitCovers(260.8, -203.5, 0.4), 'truck hall tool chest collider').toBe(true);
    expect(kitCovers(591.5, -232.15, 0.4), 'radar console collider').toBe(true);
  });

  it('airbase: depot dressing + 20 pad corner markers', () => {
    const world = buildWorld();
    const registry = world.airfieldKits.flatMap((k) => k.containers.map((c) => c.id));
    expect(registry).toContain('depot_parts_shelf_2');
    const ground = buildAirbaseSite(flat).groundGroup;
    expect(countNamed(ground, 'pad_marker'), '4 markers × 5 pads').toBe(20);
    expect(triCount(ground), 'airbase ground stays lean').toBeLessThanOrEqual(1300);
  });

  it('zero duplicate container ids across lighthouse + airfield + sectors', () => {
    const world = buildWorld();
    const all: string[] = [
      ...world.lighthouseKit.containers,
      ...world.airfieldKits.flatMap((k) => k.containers),
      ...world.sectorKits.flatMap((k) => k.containers),
    ].map((c) => c.id);
    expect(all.length).toBeGreaterThan(60);
    expect(new Set(all).size, `duplicates: ${all.filter((id, i) => all.indexOf(id) !== i).join(', ')}`).toBe(all.length);
  });
});

describe('greeble pass — geometry budget', () => {
  it('per-sector kit ceilings hold and the pass total stays lean', () => {
    const perSector = new Map<string, number>();
    built.kits.forEach((k, i) => {
      // the truck hall anchors to the citadel yard site — same sector
      const raw = SECTOR_BUILDINGS[i].sector;
      const sector = raw.startsWith('citadel') ? 'citadel' : raw;
      perSector.set(sector, (perSector.get(sector) ?? 0) + triCount(k.group));
    });
    let kitsTotal = 0;
    for (const [sector, ceiling] of Object.entries(KIT_CEILINGS)) {
      const tris = perSector.get(sector) ?? 0;
      kitsTotal += tris;
      expect(tris, `${sector} kits ${tris} > ceiling ${ceiling}`).toBeLessThanOrEqual(ceiling);
      expect(tris, `${sector} kits should exceed the bare baseline`).toBeGreaterThan(BASELINE_KITS[sector]);
    }
    const groundTris = triCount(built.groundGroup);
    expect(groundTris, `ground ${groundTris}`).toBeLessThanOrEqual(GROUND_CEILING);
    expect(groundTris).toBeGreaterThan(BASELINE_GROUND);
    const added = kitsTotal + groundTris - BASELINE_TOTAL;
    expect(added, `greeble added ${added} tris`).toBeLessThanOrEqual(ADDED_CAP);
    expect(added).toBeGreaterThan(0);
  });
});
