// buildings.test.ts — the BUILDING_STRATEGY QA gate over the real world,
// post-TOTAL-PURGE: the lighthouse is the ONLY building left standing,
// and it must still pass every audit in kitQa.ts. The demolished stock
// (V4 houses, POI buildings, airbase, carrier) must not exist at all.

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

describe('the building QA gate — total purge', () => {
  it('the demolished builders are gone from the world entirely', () => {
    const world = buildWorld();
    const w = world as unknown as Record<string, unknown>;
    expect(w.houses).toBeUndefined();
    expect(w.poiBuildings).toBeUndefined();
  });

  it('passes the rebuilt lighthouse — watch room and lamp room reachable', () => {
    const world = buildWorld();
    expect(world.lighthouseBuilding).toBeDefined();
    expect(world.lampRoomY).toBeGreaterThan(15);
    expectGate([world.lighthouseBuilding!], 'lighthouse');
  });

  it('the lighthouse kit is the whole built world: colliders, floors, loot', () => {
    const world = buildWorld();
    expect(world.lighthouseKit.colliders.length).toBeGreaterThan(0);
    expect(world.lighthouseKit.floors.length).toBeGreaterThan(0);
    expect(world.lighthouseKit.containers.length).toBeGreaterThan(0);
    // the Keeper's ground: a container stands at the lighthouse, none of
    // the demolished POIs contribute containers through the world anymore
    const ids = world.lighthouseKit.containers.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
