import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { heightAt } from '../game/World';
import { buildWorld } from './buildings.test';
import {
  BETA_COLS, BETA_ROWS, betaNodeX, betaNodeZ, buildBetaGrid, betaHeightAt,
  buildBetaRapierHeightfield,
} from '../game/betaTerrain';
import RAPIER from '@dimforge/rapier3d-compat';
import { CarPhysics, buildRapierHeightfield } from '../game/CarPhysics';
import { VEHICLE_DEFS, type Vehicle } from '../game/Vehicles';

/**
 * GROUND TRUTH, BETA EDITION (map integration, 2026-10-21).
 *
 * The original ground-truth suite (same day, earlier) pinned the fix
 * for the playtest's falls-through-floor / floats-on-thin-air: mesh,
 * physics and gameplay had been THREE surfaces disagreeing by up to
 * 1.17 m. The Beta restart replaced the whole terrain with ONE
 * authored grid — and this suite now proves the LIVE world runs on
 * it: World's heightAt is the grid's sampler, the terrain meshes in
 * a built World carry the grid nodes verbatim, the heightfield
 * CarPhysics receives is the grid verbatim, and a rigid body settles
 * and drives on that surface at the new map's real places. (The
 * beta module's internal identity is proven in betaTerrain.test.ts;
 * nothing here re-proves it in isolation.)
 */

const STRIDE = BETA_COLS + 1;
const grid = buildBetaGrid();

describe('the live sampler is the beta grid', () => {
  it('World.heightAt === betaHeightAt at nodes and between them', () => {
    for (let i = 0; i <= BETA_COLS; i += 61) {
      for (let j = 0; j <= BETA_ROWS; j += 47) {
        expect(heightAt(betaNodeX(i), betaNodeZ(j))).toBe(grid[j * STRIDE + i]);
      }
    }
    const probes: [number, number][] = [
      [123.37, -56.71], [-520.4, -184.6], [392.2, 167.8], [0.31, 0.57],
      [-548.3, 198.9], [267.9, -251.7], [596.1, -192.2],
    ];
    for (const [x, z] of probes) {
      expect(heightAt(x, z)).toBe(betaHeightAt(x, z));
    }
  });

  it('feet read the same two triangles the mesh renders (live sampler, cell by cell)', () => {
    for (let i = 0; i < BETA_COLS; i += 7) {
      for (let j = 0; j < BETA_ROWS; j += 7) {
        const h00 = grid[j * STRIDE + i], h10 = grid[j * STRIDE + i + 1];
        const h01 = grid[(j + 1) * STRIDE + i], h11 = grid[(j + 1) * STRIDE + i + 1];
        for (const [tx, tz] of [[0.31, 0.57], [0.73, 0.19], [0.5, 0.5], [0.9, 0.9]] as const) {
          const plane = tx + tz <= 1
            ? h00 + (h10 - h00) * tx + (h01 - h00) * tz
            : (h10 + h01 - h11) + (h11 - h01) * tx + (h11 - h10) * tz;
          const x = betaNodeX(i) + tx * 1.25;
          const z = betaNodeZ(j) + tz * 1.25;
          expect(Math.abs(heightAt(x, z) - plane)).toBeLessThan(1e-4);
        }
      }
    }
  }, 120000);
});

describe('the built world renders the grid', () => {
  it('every terrain chunk in a live World carries grid nodes verbatim', () => {
    const world = buildWorld();
    const terrains: THREE.Mesh[] = [];
    world.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.name === 'terrain') terrains.push(o as THREE.Mesh);
    });
    expect(terrains.length).toBe(32); // 8x4 chunks over the grid
    let checked = 0;
    for (const mesh of terrains) {
      const pos = mesh.geometry.getAttribute('position');
      for (let v = 0; v < pos.count; v += 389) {
        const x = pos.getX(v);
        const y = pos.getY(v);
        const z = pos.getZ(v);
        const i = Math.round((x + 700) / 1.25);
        const j = Math.round((z + 320) / 1.25);
        expect(Math.abs(betaNodeX(i) - x)).toBeLessThan(1e-4);
        expect(Math.abs(betaNodeZ(j) - z)).toBeLessThan(1e-4);
        expect(y).toBe(grid[j * STRIDE + i]); // verbatim — not a resample
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  }, 120000);
});

describe('physics consumes the same grid', () => {
  it('the heightfield the game hands CarPhysics IS the grid (Rapier layout)', () => {
    const hf = buildBetaRapierHeightfield();
    expect(hf.heights.length).toBe(grid.length);
    expect(hf.nsubdivx).toBe(BETA_ROWS);
    expect(hf.nsubdivz).toBe(BETA_COLS);
    for (let ix = 0; ix <= BETA_COLS; ix += 41) {
      for (let iz = 0; iz <= BETA_ROWS; iz += 29) {
        expect(hf.heights[ix * (BETA_ROWS + 1) + iz]).toBe(grid[iz * STRIDE + ix]);
      }
    }
    // and CarPhysics' generic builder, sampling the LIVE heightAt at
    // the nodes, lands on the same nodes (fp-exact at nodes by the
    // sampler's construction; 1e-4 leaves room for the index math)
    const sampled = buildRapierHeightfield((x, z) => heightAt(x, z));
    for (let ix = 0; ix <= BETA_COLS; ix += 113) {
      for (let iz = 0; iz <= BETA_ROWS; iz += 113) {
        expect(Math.abs(sampled.heights[ix * (BETA_ROWS + 1) + iz] - grid[iz * STRIDE + ix])).toBeLessThan(1e-4);
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
});

// ------------------------------------------------------------ end to end

function fakeVehicle(defId: string, x: number, z: number, heading = 0): Vehicle {
  const def = VEHICLE_DEFS.find((d) => d.id === defId)!;
  const group = new THREE.Group();
  // VehicleManager.spawn places the car on groundY — do the same, or
  // the car spawns inside the hill and no suspension can save it
  group.position.set(x, heightAt(x, z), z);
  return {
    uid: def.id, def, group, heading, speed: 0, fuel: 61, condition: 1,
    wheelSpin: [], wheelPivots: [], steerVis: 0, wheelSpinAngle: 0,
    suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: 0, steerAngle: 0, wheelR: 0.343,
    storage: [], upgrades: [], tiresFlat: 0,
    flatSide: 1, blewTire: false, wasClipped: false, doors: [],
  } as unknown as Vehicle;
}

async function livePhysics(): Promise<CarPhysics> {
  // exactly Game's construction: live sampler + the verbatim beta field
  return CarPhysics.create((x, z) => heightAt(x, z), buildBetaRapierHeightfield());
}

describe('the rigid body rides the same ground the player sees', () => {
  const sites: [string, number, number][] = [
    ['airbase pad (GT500 mark)', 475, -137],
    ['lighthouse grounds (player spawn)', 596, -192],
    ['Tern Rock town pad', 392, 168],
    ['Refuge pad', -30, -10],
    ['NC-12 corridor, Citadel leg', 282, -214],
  ];
  for (const [name, x, z] of sites) {
    it(`settles on the grid at ${name}`, async () => {
      const cp = await livePhysics();
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
    }, 90000);
  }

  it('drives the NC-12 Citadel leg in ground contact the whole way', async () => {
    const cp = await livePhysics();
    const sx = 268;
    const sz = -252;
    const heading = Math.atan2(296 - sx, -176 - sz);
    const v = fakeVehicle('mustang', sx, sz, heading);
    cp.spawnCar(v, [], 0);
    const dt = 1 / 60;
    let worstGap = 0;
    for (let i = 0; i < 60 * 7.5; i++) {
      const throttle = THREE.MathUtils.clamp((10 - cp.speed) * 0.25, 0, 0.7);
      cp.step(dt, { throttle, steer: 0, handbrake: false, hasFuel: true }, v, (gx, gz) => heightAt(gx, gz));
      if (i % 10 === 0) {
        const gap = Math.abs(v.group.position.y - heightAt(v.group.position.x, v.group.position.z));
        worstGap = Math.max(worstGap, gap);
      }
    }
    const along = (v.group.position.x - sx) * Math.sin(heading) + (v.group.position.z - sz) * Math.cos(heading);
    expect(along).toBeGreaterThan(45); // traveled the leg
    // the body plane rides the suspension datum over the sampler —
    // never sunk into the grid, never floating above it
    expect(worstGap).toBeLessThan(0.6);
  }, 90000);
});
