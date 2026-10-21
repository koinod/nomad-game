import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  initTerrainField, setTerrainPads, bakeGroundField, groundFieldHeights,
  analyticHeightAt, heightAt, sampleGroundField,
  GROUND_COLS, GROUND_ROWS, AIRBASE_CENTER, AIRBASE_GRADE,
} from '../game/World';
import RAPIER from '@dimforge/rapier3d-compat';
import { CarPhysics, buildRapierHeightfield } from '../game/CarPhysics';
import { VEHICLE_DEFS, type Vehicle } from '../game/Vehicles';

/**
 * GROUND TRUTH (Ian playtest, 2026-10-21): the car fell through the
 * floor and floated on thin air; feet fell through the topo. Measured
 * root cause: mesh (4.4x4 m chords), Rapier heightfield (5x5 m), and
 * gameplay (analytic heightAt) were three different surfaces — up to
 * 1.17 m apart on the dune ridges. Now ONE baked field (2 m nodes) is
 * the terrain for all three. These tests pin that unity.
 */

function nodeX(i: number): number { return -700 + (i / GROUND_COLS) * 1400; }
function nodeZ(j: number): number { return -320 + (j / GROUND_ROWS) * 640; }

beforeAll(() => {
  initTerrainField(1337);
  setTerrainPads([]);
  bakeGroundField();
});

describe('the baked field is the analytic island, sampled once', () => {
  it('field nodes equal the analytic generator at the nodes', () => {
    const f = groundFieldHeights()!;
    expect(f).not.toBeNull();
    expect(f.length).toBe((GROUND_COLS + 1) * (GROUND_ROWS + 1));
    for (let i = 0; i <= GROUND_COLS; i += 37) {
      for (let j = 0; j <= GROUND_ROWS; j += 23) {
        expect(f[j * (GROUND_COLS + 1) + i]).toBeCloseTo(analyticHeightAt(nodeX(i), nodeZ(j)), 5);
        // and heightAt at a node reads the node itself
        expect(heightAt(nodeX(i), nodeZ(j))).toBeCloseTo(f[j * (GROUND_COLS + 1) + i], 4);
      }
    }
  });

  it('the surveyed airbase grade survives the bake', () => {
    const [cx, cz] = AIRBASE_CENTER;
    expect(Math.abs(heightAt(cx, cz) - AIRBASE_GRADE)).toBeLessThan(0.05);
  });
});

describe('physics and mesh consume the same field', () => {
  it('the Rapier heightfield heights ARE the field nodes (in Rapier layout)', () => {
    const hf = buildRapierHeightfield((x, z) => heightAt(x, z));
    const f = groundFieldHeights()!;
    expect(hf.heights.length).toBe(f.length);
    expect(hf.nsubdivx).toBe(GROUND_ROWS);
    expect(hf.nsubdivz).toBe(GROUND_COLS);
    for (let i = 0; i <= GROUND_COLS; i += 41) {
      for (let j = 0; j <= GROUND_ROWS; j += 29) {
        expect(hf.heights[i * (GROUND_ROWS + 1) + j]).toBeCloseTo(f[j * (GROUND_COLS + 1) + i], 4);
      }
    }
  });

  it('Rapier itself reads the layout as intended (raycast bump probe)', async () => {
    // The layout above was reverse-engineered by probing Rapier with
    // a single-bump field on a RECTANGULAR grid (a square grid cannot
    // distinguish transpose errors). Pin the behavior: if a Rapier
    // upgrade changes the convention, this fails loudly instead of
    // silently unscrambling the island under the cars.
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const bump = (x: number, z: number): number => (x === 100 && z === 0 ? 7 : 0);
    const hf = buildRapierHeightfield(bump, 4, 2, -200, 200, -50, 50);
    world.createCollider(RAPIER.ColliderDesc.heightfield(
      hf.nsubdivx, hf.nsubdivz, hf.heights, new RAPIER.Vector3(400, 1, 100),
    ));
    world.step();
    const rayAt = (x: number, z: number): number | null => {
      const ray = new RAPIER.Ray({ x, y: 20, z }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, 40, true);
      return hit ? 20 - hit.timeOfImpact : null;
    };
    expect(rayAt(100, 0)).toBeCloseTo(7, 3); // the bump node itself
    expect(rayAt(-100, 0)).toBeCloseTo(0, 3); // opposite node stays flat
    expect(rayAt(100, -50)).toBeCloseTo(0, 3); // same x, other z row
    expect(rayAt(50, 0)).toBeCloseTo(3.5, 2); // slope midpoint toward the bump
  });

  it('a terrain mesh built like buildTerrain (one vertex per node) sits on the field', () => {
    const geo = new THREE.PlaneGeometry(1400, 640, GROUND_COLS, GROUND_ROWS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    expect(pos.count).toBe((GROUND_COLS + 1) * (GROUND_ROWS + 1));
    for (let k = 0; k < pos.count; k += 997) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      // buildTerrain sets each vertex Y from heightAt(x, z)
      expect(heightAt(x, z)).toBeCloseTo(sampleGroundField(x, z), 5);
      expect(Math.abs(heightAt(x, z) - analyticHeightAt(x, z))).toBeLessThan(0.65);
    }
  });

  it('feet == rendered triangles == physics triangles, point for point', () => {
    // heightAt interpolates each field cell as two triangles split
    // along h10-h01 — the diagonal BOTH the mesh's index buffer and
    // Rapier's heightfield use (probed). So the sampled ground, the
    // rendered ground, and the ridden ground are the same surface;
    // assert the identity numerically across the island.
    const f = groundFieldHeights()!;
    const W = GROUND_COLS + 1;
    for (let i = 0; i < GROUND_COLS; i += 3) {
      for (let j = 0; j < GROUND_ROWS; j += 3) {
        const h00 = f[j * W + i], h10 = f[j * W + i + 1];
        const h01 = f[(j + 1) * W + i], h11 = f[(j + 1) * W + i + 1];
        for (const [tx, tz] of [[0.31, 0.57], [0.73, 0.19], [0.5, 0.5], [0.9, 0.9]] as const) {
          const planeB = tx + tz <= 1
            ? h00 + (h10 - h00) * tx + (h01 - h00) * tz
            : (h10 + h01 - h11) + (h11 - h01) * tx + (h11 - h10) * tz;
          const x = nodeX(i) + tx * 2;
          const z = nodeZ(j) + tz * 2;
          expect(Math.abs(heightAt(x, z) - planeB)).toBeLessThan(1e-4);
        }
      }
    }
  }, 120000);
});

// ------------------------------------------------------------ end to end

function fakeVehicle(defId: string, x: number, z: number): Vehicle {
  const def = VEHICLE_DEFS.find((d) => d.id === defId)!;
  const group = new THREE.Group();
  // VehicleManager.spawn places the car on groundY — do the same, or
  // the car spawns inside the hill and no suspension can save it
  group.position.set(x, heightAt(x, z), z);
  return {
    uid: def.id, def, group, heading: 0, speed: 0, fuel: 61, condition: 1,
    wheelSpin: [], wheelPivots: [], steerVis: 0, wheelSpinAngle: 0,
    suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: 0, steerAngle: 0, wheelR: 0.343,
    storage: [], upgrades: [], tiresFlat: 0,
    flatSide: 1, blewTire: false, wasClipped: false, doors: [],
  } as unknown as Vehicle;
}

describe('the rigid body rides the same ground the player sees', () => {
  const sites: [string, number, number][] = [
    ['airbase plateau edge', 332, -108],
    ['dune ridge (the old 1.17 m divergence point)', 22, -174],
    ['shoreline', 0, 296],
    ['open dune field', -331, 161],
  ];
  for (const [name, x, z] of sites) {
    it(`settles on the field at ${name}`, async () => {
      const cp = await CarPhysics.create((gx, gz) => heightAt(gx, gz));
      const v = fakeVehicle('gt500', x, z);
      cp.spawnCar(v, [], 0);
      for (let i = 0; i < 240; i++) {
        cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, (gx, gz) => heightAt(gx, gz));
      }
      const yLate = v.group.position.y;
      for (let i = 0; i < 60; i++) {
        cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, (gx, gz) => heightAt(gx, gz));
      }
      const ground = heightAt(v.group.position.x, v.group.position.z);
      // not fallen through, not still falling, not floating on air
      expect(v.group.position.y).toBeGreaterThan(ground - 0.45);
      expect(v.group.position.y).toBeLessThan(ground + 0.55);
      expect(Math.abs(v.group.position.y - yLate)).toBeLessThan(0.06);
      // it stayed where it was put (handbrake on a slope may creep, not roam)
      expect(Math.hypot(v.group.position.x - x, v.group.position.z - z)).toBeLessThan(4);
      for (const s of v.suspension) {
        expect(s).toBeGreaterThan(0.0);
        expect(s).toBeLessThan(0.75);
      }
    }, 60000);
  }
});
