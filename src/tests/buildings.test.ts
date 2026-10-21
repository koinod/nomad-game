// buildings.test.ts — the BUILDING_STRATEGY QA gate over the real world.
// Every kit building placed in the world must pass every audit in
// kitQa.ts. This is the gate a building cannot ship without passing.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { World, heightAt } from '../game/World';
import { auditBuildings, type QaFailure } from '../game/kitQa';

/** World building paints stencil/decal canvas textures; headless tests
 *  only need createElement('canvas') to exist — nothing ever renders. */
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

export function buildWorld(): World {
  stubCanvas();
  const world = new World(new THREE.Scene(), 20261020);
  world.build();
  return world;
}

export function expectGate(buildings: Parameters<typeof auditBuildings>[0], label: string): void {
  const failures: QaFailure[] = auditBuildings(buildings, (x, z) => heightAt(x, z));
  const summary = failures.map((f) => `[${f.audit}] ${f.building}: ${f.msg}`).join('\n');
  expect(failures, `${label} QA gate failures:\n${summary}`).toEqual([]);
}

describe('the building QA gate', () => {
  it('passes every V4 house in the world', () => {
    const world = buildWorld();
    // 19 placements, 3 of them Jonah's-camp keepers (legacy — not gated,
    // not demolished, per Ian's keeper order)
    expect(world.houses.buildings.length).toBe(16);
    expectGate(world.houses.buildings, 'houses');
  });

  it('passes every kit POI building in the world', () => {
    const world = buildWorld();
    // mall, convenience store, auto garage, school, boathouse, and the
    // gas station's two structures (store + canopy), plus the six
    // Stitch-template buildings (pharmacy, clinic, hardware, marine,
    // police, warehouse utility). The town warehouse and Jonah's barn
    // are keepers — legacy builds, not gated.
    expect(world.poiBuildings.buildings.length).toBe(13);
    expectGate(world.poiBuildings.buildings, 'poi buildings');
  });

  it('gas canopy clears a semi — real fuel-canopy height over the pump lanes', () => {
    const world = buildWorld();
    const canopy = world.poiBuildings.buildings.find((b) => b.id === 'gas_canopy');
    expect(canopy).toBeDefined();
    const floorY = canopy!.baseY + 0.14; // kit slab top (KIT.FLOOR_LIFT)
    const roofs = canopy!.pieces.filter((p) => p.kind === 'roof');
    expect(roofs.length).toBeGreaterThan(0);
    const soffit = Math.min(...roofs.map((p) => p.y0));
    // >= 4.5 m of open air, and comfortably over a ~4.1 m semi
    expect(soffit - floorY).toBeGreaterThanOrEqual(4.5);
    expect(soffit - floorY).toBeGreaterThan(4.1 + 0.4);
    // the support posts actually reach the seat they carry (the short
    // price-sign post elsewhere in the building is not a support)
    expect(canopy!.roofSeatY).toBeDefined();
    const supports = canopy!.pieces.filter((p) => p.kind === 'post' && p.y1 >= soffit - 0.01);
    expect(supports.length).toBeGreaterThanOrEqual(4);
    // nothing structural hangs into the drive lanes below the soffit
    // except the posts themselves and the pump-island strip at center
    const intruders = canopy!.pieces.filter((p) => {
      if (p.kind === 'floor' || p.kind === 'roof' || p.kind === 'post') return false;
      const pcx = (p.x0 + p.x1) / 2 - canopy!.cx;
      const pcz = (p.z0 + p.z1) / 2 - canopy!.cz;
      return p.y0 < soffit - 0.05 && Math.abs(pcx) < 4.8 && Math.abs(pcz) > 0.8 && Math.abs(pcz) < 3.2;
    });
    expect(intruders).toEqual([]);
  });

  it('passes the rebuilt lighthouse — watch room and lamp room reachable', () => {
    const world = buildWorld();
    expect(world.lighthouseBuilding).toBeDefined();
    expect(world.lampRoomY).toBeGreaterThan(15);
    expectGate([world.lighthouseBuilding!], 'lighthouse');
  });
});
