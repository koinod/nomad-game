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
    // gas station's two structures (store + canopy). The town warehouse
    // and Jonah's barn are keepers — legacy builds, not gated.
    expect(world.poiBuildings.buildings.length).toBe(7);
    expectGate(world.poiBuildings.buildings, 'poi buildings');
  });

  it('passes the rebuilt lighthouse — watch room and lamp room reachable', () => {
    const world = buildWorld();
    expect(world.lighthouseBuilding).toBeDefined();
    expect(world.lampRoomY).toBeGreaterThan(15);
    expectGate([world.lighthouseBuilding!], 'lighthouse');
  });
});
