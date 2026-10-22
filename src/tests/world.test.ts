// World terrain facts the fleet home depends on (map integration,
// 2026-10-21): the Beta airbase sector pad is truly flat across the
// complex, POIs resolve to their surveyed placements verbatim (no
// land scan — placements are facts now), and the carrier anchorage
// sits in the dredged channel at its surveyed depth.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { heightAt } from '../game/World';
import { buildWorld } from './buildings.test';
import { VehicleManager } from '../game/Vehicles';
import { buildContainerDefs } from '../game/Interact';
import { betaSector, BETA_POI_PLACEMENTS } from '../data/betaLayout';

describe('airbase sector pad', () => {
  it('is flat at grade across the whole complex core', () => {
    const s = betaSector('airbase');
    for (const dx of [-76, -38, 0, 38, 76]) {
      for (const dz of [-44, -22, 0, 22, 44]) {
        expect(Math.abs(heightAt(s.x + dx, s.z + dz) - s.padY)).toBeLessThan(0.02);
      }
    }
  });

  it('resolves every POI at its surveyed placement, verbatim', () => {
    const world = buildWorld();
    for (const p of BETA_POI_PLACEMENTS) {
      expect(world.poiPositions[p.poiId], p.poiId).toEqual([p.x, p.z]);
    }
    // the claim-only id rides the airbase ground (claim fallback moot)
    expect(world.poiPositions['military_base']).toEqual(world.poiPositions['airbase']);
  });

  it('does not disturb the Tern Rock town pad', () => {
    const s = betaSector('tern_rock');
    expect(heightAt(s.x, s.z)).toBeCloseTo(s.padY, 5);
  });
});

describe('carrier anchorage', () => {
  it('sits in the dredged channel at surveyed depth', () => {
    const c = BETA_POI_PLACEMENTS.find((p) => p.poiId === 'carrier')!;
    const h = heightAt(c.x, c.z);
    expect(h).toBeLessThan(-3.5);
    expect(h).toBeGreaterThan(-5);
  });
});

describe('boot smoke — the live world Game.init wires against', () => {
  it('constructs fully, and the fleet + loot sit on real ground', () => {
    const world = buildWorld(); // World.build() end to end, no errors
    expect(Object.keys(world.poiPositions).length).toBeGreaterThanOrEqual(22);

    // the fleet spawn Game performs: every vehicle on its pad, on land
    const vm = new VehicleManager();
    vm.spawn(new THREE.Scene(), world.poiPositions, (x, z) => heightAt(x, z));
    expect(vm.vehicles).toHaveLength(3);
    for (const v of vm.vehicles) {
      const { x, z } = v.group.position;
      expect(heightAt(x, z), v.def.id).toBeGreaterThan(2);
      expect(Math.abs(v.group.position.y - heightAt(x, z))).toBeLessThan(0.05);
    }

    // every loot container in the game stands on ground, none drowned
    const defs = buildContainerDefs(world.poiPositions);
    expect(defs.length).toBeGreaterThanOrEqual(30);
    for (const c of defs) {
      expect(heightAt(c.x, c.z), c.id).toBeGreaterThan(-0.25);
    }
  });
});
