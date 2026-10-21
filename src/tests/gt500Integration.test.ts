import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CarPhysics, geomFor, paramsForDef } from '../game/CarPhysics';
import { VEHICLE_DEFS, VEHICLE_SPAWNS, type Vehicle } from '../game/Vehicles';
import { GT500_DEF, GT500_PARAMS, GT500_SPAWN, GT500_TORQUE } from '../game/gt500Def';
import {
  carParams,
  estimatePerformance,
  peakPowerKw,
  STOCK_TORQUE,
} from '../game/carSpec';

/**
 * Merge stage 2b — the GT500 is IN the game, not just on the lot:
 * registered def + spawn, per-def physics selection in CarPhysics,
 * and the redline cap on the build sheet's peak-power figure.
 */

describe('registration', () => {
  it('the GT500 def is in VEHICLE_DEFS (as itself, after the Mustang)', () => {
    expect(VEHICLE_DEFS.map((d) => d.id)).toEqual(['mustang', 'gt500']);
    expect(VEHICLE_DEFS[1]).toBe(GT500_DEF);
  });

  it('the GT500 spawns on the lighthouse grounds, clear of the Stallion', () => {
    const s = VEHICLE_SPAWNS.find((x) => x.id === 'gt500');
    expect(s).toBe(GT500_SPAWN);
    expect(s!.poi).toBe('lighthouse_base');
    expect(s!.dx).toBe(12);
    expect(s!.dz).toBe(20);
    const m = VEHICLE_SPAWNS.find((x) => x.id === 'mustang')!;
    expect(Math.hypot(s!.dx - m.dx, s!.dz - m.dz)).toBeGreaterThan(20);
  });
});

describe('per-def physics selection', () => {
  it('gt500 params are the period spec; cargo is real mass on top', () => {
    const p = paramsForDef('gt500', [], 0);
    expect(p.redlineRpm).toBe(6250);
    expect(p.gears).toEqual(GT500_PARAMS.gears);
    expect(p.finalDrive).toBe(3.31);
    expect(p.massKg).toBe(GT500_PARAMS.massKg);
    expect(paramsForDef('gt500', [], 20).massKg).toBe(GT500_PARAMS.massKg + 20);
  });

  it('the Stallion upgrade tree does not restamp the Shelby spec', () => {
    const p = paramsForDef('gt500', ['supercharger', 'engine_tune', 'armor'], 0);
    expect(p.massKg).toBe(GT500_PARAMS.massKg);
    expect(p.torqueCurve).toEqual(GT500_TORQUE);
  });

  it('mustang params still derive from the upgrade build state', () => {
    expect(paramsForDef('mustang', [], 0)).toEqual(carParams([], 0));
    expect(paramsForDef('mustang', ['armor'], 10).massKg).toBe(carParams(['armor'], 10).massKg);
  });

  it('chassis geometry is per def; unknown defs get the Mustang originals', () => {
    expect(geomFor('gt500').half).toEqual([0.94, 0.32, 2.39]);
    expect(geomFor('gt500').wheelZ).toBeCloseTo(1.355);
    expect(geomFor('gt500').wheelX).toBeCloseTo(0.79);
    expect(geomFor('mustang').half).toEqual([0.82, 0.3, 2.22]);
    expect(geomFor('mustang').wheelZ).toBeCloseTo(1.359);
    expect(geomFor('anything-else')).toBe(geomFor('mustang'));
  });
});

describe('peak power is capped at the engine redline', () => {
  it('the uncapped scan overstates the GT500; the cap removes it', () => {
    // torqueAt holds the last breakpoint flat, so scanning to 7600 rpm
    // invents ~603 hp from a 6250-redline engine
    expect(peakPowerKw(GT500_TORQUE)).toBeGreaterThan(430);
    const capped = peakPowerKw(GT500_TORQUE, 6250);
    expect(capped).toBeGreaterThan(355);
    expect(capped).toBeLessThan(390);
  });

  it('estimatePerformance reports the GT500 at its period figures', () => {
    const perf = estimatePerformance(GT500_PARAMS);
    expect(perf.powerKw).toBeGreaterThan(355);
    expect(perf.powerKw).toBeLessThan(390);
    expect(perf.powerToWeightKwPerTonne).toBeGreaterThan(180);
    expect(perf.powerToWeightKwPerTonne).toBeLessThan(215);
  });

  it('the Stallion figures do not move (its peak lives below its redline)', () => {
    const stock = estimatePerformance(carParams([]));
    expect(stock.powerKw).toBeCloseTo(peakPowerKw(STOCK_TORQUE), 6);
    expect(stock.powerKw).toBeGreaterThan(320);
    expect(stock.powerKw).toBeLessThan(365);
  });
});

// ------------------------------------------------------------ rigid body

function fakeVehicle(defId: string): Vehicle {
  const def = VEHICLE_DEFS.find((d) => d.id === defId)!;
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  return {
    uid: def.id, def, group, heading: 0, speed: 0, fuel: 61, condition: 1,
    wheelSpin: [], wheelPivots: [], steerVis: 0, wheelSpinAngle: 0,
    suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: 0, steerAngle: 0, wheelR: 0.343,
    bodyPitch: 0, bodyRoll: 0, suspV: 0, storage: [], upgrades: [], tiresFlat: 0,
    flatSide: 1, blewTire: false, wasClipped: false, doors: [],
  } as Vehicle;
}

const flat = () => 0;

describe('rigid-body GT500', () => {
  it('settles on its suspension without falling through the world', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle('gt500');
    cp.spawnCar(v, [], 0);
    expect(cp.boundDefId).toBe('gt500');
    expect(cp.isRigidBody).toBe(true);
    for (let i = 0; i < 240; i++) {
      cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
    }
    expect(v.group.position.y).toBeGreaterThan(-0.25);
    expect(v.group.position.y).toBeLessThan(0.35);
    for (const s of v.suspension) {
      expect(s).toBeGreaterThan(0.05);
      expect(s).toBeLessThanOrEqual(0.33);
    }
  }, 30000);

  it('full throttle runs in the period class, near the estimate', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle('gt500');
    cp.spawnCar(v, [], 0);
    const dt = 1 / 60;
    let t100 = Infinity;
    let top = 0;
    const steps = Math.round(40 / dt);
    for (let i = 0; i < steps; i++) {
      cp.step(dt, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
      if (v.group.position.z > 250) cp.repositionKeepVelocity(v, 0, -250);
      const kmh = cp.speed * 3.6;
      if (kmh > top) top = kmh;
      if (t100 === Infinity && kmh >= 100) t100 = i * dt;
    }
    const est = estimatePerformance(GT500_PARAMS);
    expect(top).toBeGreaterThan(215);
    expect(top).toBeLessThan(est.topSpeedKmh + 25);
    expect(t100).toBeGreaterThan(4.2);
    expect(t100).toBeLessThan(8);
  }, 60000);

  it('the live body rebinds: Mustang body out, GT500 body in', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const m = fakeVehicle('mustang');
    cp.spawnCar(m, [], 0);
    expect(cp.boundDefId).toBe('mustang');
    const g = fakeVehicle('gt500');
    cp.spawnCar(g, [], 0);
    expect(cp.boundDefId).toBe('gt500');
    for (let i = 0; i < 240; i++) {
      cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, g, flat);
    }
    expect(g.group.position.y).toBeGreaterThan(-0.25);
    expect(g.group.position.y).toBeLessThan(0.35);
  }, 30000);
});
