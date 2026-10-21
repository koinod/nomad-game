import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CarPhysics, geomFor, paramsForDef, suspTuneFor } from '../game/CarPhysics';
import { VEHICLE_DEFS, VEHICLE_SPAWNS, type Vehicle } from '../game/Vehicles';
import {
  PRIME_DEF, PRIME_PARAMS, PRIME_SPAWN, PRIME_TORQUE, PRIME_WHEEL_RIG,
} from '../game/primeDef';
import {
  SPRINTER_DEF, SPRINTER_PARAMS, SPRINTER_SPAWN, SPRINTER_TORQUE, SPRINTER_WHEEL_RIG,
} from '../game/sprinterDef';
import { estimatePerformance, peakPowerKw } from '../game/carSpec';

/**
 * Fleet integration (2026-10-21) — the Nomad Prime semi + V-04
 * Sprinter, from Ian's dropped spec sheets (design-refs/fleet-specs/,
 * approved as-is). Registered defs + spawns, per-def diesel physics
 * on the shared rigid-body stack, spec-class performance measured in
 * the body — the same evidentiary pattern as gt500Integration.
 */

describe('registration', () => {
  it('both defs are in VEHICLE_DEFS, after the GT500', () => {
    expect(VEHICLE_DEFS[2]).toBe(PRIME_DEF);
    expect(VEHICLE_DEFS[3]).toBe(SPRINTER_DEF);
  });

  it('the defs carry Ian’s spec sheet figures', () => {
    expect(PRIME_DEF.fuelMax).toBe(950);
    expect(PRIME_DEF.noiseDrive).toBe(105);
    expect(PRIME_DEF.hitch).toBe('fifth_wheel');
    expect(PRIME_DEF.maxTowKg).toBe(48000);
    expect(PRIME_DEF.storageKg).toBeGreaterThan(0);
    expect(SPRINTER_DEF.fuelMax).toBe(110);
    expect(SPRINTER_DEF.noiseDrive).toBe(55);
    expect(SPRINTER_DEF.hitch).toBe('bumper_ball');
    expect(SPRINTER_DEF.maxTowKg).toBe(4500);
    expect(SPRINTER_DEF.storageKg).toBeGreaterThan(0);
  });

  it('spawns: the whole fleet works the airbase pads (fleet respawn, Ian 2026-10-21)', () => {
    expect(VEHICLE_SPAWNS[1]).toBe(PRIME_SPAWN);
    expect(PRIME_SPAWN.poi).toBe('airbase');
    // east of the Seahawk pad (462,-118) on the same graded line,
    // clear of the hangar footprint (x 444..480)
    expect(PRIME_SPAWN.dx).toBe(36);
    expect(PRIME_SPAWN.dz).toBe(-12);
    expect(VEHICLE_SPAWNS[2]).toBe(SPRINTER_SPAWN);
    expect(SPRINTER_SPAWN.poi).toBe('airbase');
    // on the pads row, west of the Prime: clear of the tower (+52/+18)
    // and of the Quartermaster's counter in the ops building (-25/+22.6)
    expect(Math.hypot(SPRINTER_SPAWN.dx - 52, SPRINTER_SPAWN.dz - 18)).toBeGreaterThan(15);
    expect(Math.hypot(SPRINTER_SPAWN.dx + 25, SPRINTER_SPAWN.dz - 22.6)).toBeGreaterThan(15);
  });
});

describe('wheel rigs', () => {
  it('the Prime maps TEN visual wheels onto the 4-corner rig', () => {
    expect(PRIME_WHEEL_RIG).toHaveLength(10);
    expect(new Set(PRIME_WHEEL_RIG.map((w) => w.name)).size).toBe(10);
    const byCorner = (i: number) => PRIME_WHEEL_RIG.filter((w) => w.wheelIdx === i);
    expect(byCorner(0).map((w) => w.name)).toEqual(['Wheel_Steer_Right']);
    expect(byCorner(1).map((w) => w.name)).toEqual(['Wheel_Steer_Left']);
    expect(byCorner(2)).toHaveLength(4); // tandem duals, right
    expect(byCorner(3)).toHaveLength(4); // tandem duals, left
    expect(PRIME_WHEEL_RIG.filter((w) => w.steer).map((w) => w.wheelIdx)).toEqual([0, 1]);
  });

  it('the Sprinter rig is four direct pivots', () => {
    expect(SPRINTER_WHEEL_RIG.map((w) => [w.name, w.wheelIdx])).toEqual([
      ['Wheel_FR', 0], ['Wheel_FL', 1], ['Wheel_RR', 2], ['Wheel_RL', 3],
    ]);
    expect(SPRINTER_WHEEL_RIG.filter((w) => w.steer)).toHaveLength(2);
  });
});

describe('per-def diesel physics selection', () => {
  it('params are the fixed spec sheets; cargo is real mass on top', () => {
    const p = paramsForDef('nomad_prime', [], 0);
    expect(p.redlineRpm).toBe(2100);
    expect(p.idleRpm).toBe(600);
    expect(p.gears).toEqual(PRIME_PARAMS.gears);
    expect(p.massKg).toBe(PRIME_PARAMS.massKg);
    expect(paramsForDef('nomad_prime', [], 500).massKg).toBe(PRIME_PARAMS.massKg + 500);
    const s = paramsForDef('sprinter_van', [], 0);
    expect(s.redlineRpm).toBe(4200);
    expect(s.torqueCurve).toEqual(SPRINTER_TORQUE);
    expect(paramsForDef('sprinter_van', [], 40).massKg).toBe(SPRINTER_PARAMS.massKg + 40);
  });

  it('the Stallion upgrade tree does not restamp the diesel specs', () => {
    const p = paramsForDef('nomad_prime', ['supercharger', 'engine_tune', 'armor'], 0);
    expect(p.massKg).toBe(PRIME_PARAMS.massKg);
    expect(p.torqueCurve).toEqual(PRIME_TORQUE);
    const s = paramsForDef('sprinter_van', ['lift_kit'], 0);
    expect(s.torqueCurve).toEqual(SPRINTER_TORQUE);
  });

  it('peak power reads in class: 600 hp truck, ~190 hp van', () => {
    expect(peakPowerKw(PRIME_TORQUE, 2100)).toBeGreaterThan(430);
    expect(peakPowerKw(PRIME_TORQUE, 2100)).toBeLessThan(470);
    expect(peakPowerKw(SPRINTER_TORQUE, 4200)).toBeGreaterThan(125);
    expect(peakPowerKw(SPRINTER_TORQUE, 4200)).toBeLessThan(150);
  });

  it('estimates land on the spec sheets: heavy and slow, capped tops', () => {
    const p = estimatePerformance(PRIME_PARAMS);
    expect(p.topSpeedKmh).toBeGreaterThan(135);
    expect(p.topSpeedKmh).toBeLessThan(152); // spec: 145
    expect(p.zeroToHundredSec).toBeGreaterThan(10);
    expect(p.zeroToHundredSec).toBeLessThan(25);
    expect(p.massKg).toBe(9833);
    const s = estimatePerformance(SPRINTER_PARAMS);
    expect(s.topSpeedKmh).toBeGreaterThan(115);
    expect(s.topSpeedKmh).toBeLessThan(133); // spec: 125
    expect(s.zeroToHundredSec).toBeGreaterThan(14);
    expect(s.zeroToHundredSec).toBeLessThan(26);
  });

  it('chassis geometry + arch datum are per def and consistent', () => {
    expect(geomFor('nomad_prime').half).toEqual([1.27, 0.45, 4.3]);
    expect(geomFor('sprinter_van').half).toEqual([1.01, 0.35, 3.49]);
    for (const id of ['nomad_prime', 'sprinter_van']) {
      const tune = suspTuneFor(id);
      const r = paramsForDef(id, [], 0).wheelRadiusM;
      // the Ian-facing invariant: wheel top at max visual rise stays
      // at/below the arch lip measured from the vehicle's own GLB
      expect(2 * r + tune.archTravelM).toBeLessThanOrEqual(tune.archTopM + 1e-9);
      // heavy defs must lift Rapier's default suspension-force cap
      // (~car mass per wheel), with headroom over the static corner
      // load for landing spikes
      const cornerN = (paramsForDef(id, [], 0).massKg * 9.81) / 4;
      expect(tune.maxForceN).toBeGreaterThan(cornerN * 2);
    }
    // the cars keep the engine default — their tuned, Ian-approved
    // behavior (incl. drop bottoming) is pinned elsewhere and must
    // not move
    expect(suspTuneFor('mustang').maxForceN).toBeUndefined();
    expect(suspTuneFor('gt500').maxForceN).toBeUndefined();
  });

  it('the Sprinter rig matches the POLISHED GLB (c9071da), re-measured', () => {
    // wheel pivots unchanged (+2.32/-2.00 long, ±0.86 lat -> geom
    // above), but the polish fitted 0.44R tires (pivot height 0.44)
    // and tightened the flares: lip top 1.020, so visual tuck is
    // 1.02 - 0.88 = 0.14 exactly at the invariant's edge
    expect(SPRINTER_PARAMS.wheelRadiusM).toBe(0.44);
    const tune = suspTuneFor('sprinter_van');
    expect(tune.archTopM).toBe(1.02);
    expect(tune.archTravelM).toBe(0.14);
    // seat datum re-measured on the polished GLB: cushion top 0.98,
    // cab floor top 0.63, driver_seat marker unmoved — CAR_SEATS
    // (seatPose.test.ts) stands as-is
    expect(SPRINTER_DEF.length).toBe(6.97);
  });
});

// ------------------------------------------------------------ rigid body

function fakeVehicle(defId: string): Vehicle {
  const def = VEHICLE_DEFS.find((d) => d.id === defId)!;
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  return {
    uid: def.id, def, group, heading: 0, speed: 0, fuel: def.fuelMax, condition: 1,
    wheelSpin: [], wheelPivots: [], steerVis: 0, wheelSpinAngle: 0,
    suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: 0, steerAngle: 0, wheelR: 0.5,
    storage: [], upgrades: [], tiresFlat: 0,
    flatSide: 1, blewTire: false, wasClipped: false, doors: [],
  } as Vehicle;
}

const flat = () => 0;

async function settle(defId: string): Promise<{ cp: CarPhysics; v: Vehicle }> {
  const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
  const v = fakeVehicle(defId);
  cp.spawnCar(v, [], 0);
  expect(cp.boundDefId).toBe(defId);
  expect(cp.isRigidBody).toBe(true);
  for (let i = 0; i < 240; i++) {
    cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
  }
  return { cp, v };
}

describe('rigid-body fleet', () => {
  it('the Prime settles on its suspension without falling through the world', async () => {
    const { cp, v } = await settle('nomad_prime');
    expect(v.group.position.y).toBeGreaterThan(-0.25);
    expect(v.group.position.y).toBeLessThan(0.35);
    for (const s of v.suspension) {
      expect(s).toBeGreaterThan(0.05);
      expect(s).toBeLessThanOrEqual(0.33);
    }
    // the RAW lengths are the real assertion (the clamped visual
    // band above passes vacuously on a bottomed truck): laden
    // stance in the upper travel, composed across corners. This is
    // the test that pins the maxSuspensionForce fix — at the
    // engine's default cap this vehicle reads 0.02, fully bottomed.
    for (const s of cp.rawSuspension) {
      expect(s).toBeGreaterThan(0.26);
      expect(s).toBeLessThan(0.32);
    }
    expect(Math.max(...cp.rawSuspension) - Math.min(...cp.rawSuspension)).toBeLessThan(0.02);
  }, 30000);

  it('the Sprinter settles on its suspension without falling through the world', async () => {
    const { cp, v } = await settle('sprinter_van');
    expect(v.group.position.y).toBeGreaterThan(-0.25);
    expect(v.group.position.y).toBeLessThan(0.35);
    for (const s of v.suspension) {
      expect(s).toBeGreaterThan(0.05);
      expect(s).toBeLessThanOrEqual(0.33);
    }
    for (const s of cp.rawSuspension) {
      expect(s).toBeGreaterThan(0.24);
      expect(s).toBeLessThan(0.31);
    }
    expect(Math.max(...cp.rawSuspension) - Math.min(...cp.rawSuspension)).toBeLessThan(0.02);
  }, 30000);

  it('the live body rebinds across the fleet: car out, truck in, van in', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const g = fakeVehicle('gt500');
    cp.spawnCar(g, [], 0);
    expect(cp.boundDefId).toBe('gt500');
    const p = fakeVehicle('nomad_prime');
    cp.spawnCar(p, [], 0);
    expect(cp.boundDefId).toBe('nomad_prime');
    const s = fakeVehicle('sprinter_van');
    cp.spawnCar(s, [], 0);
    expect(cp.boundDefId).toBe('sprinter_van');
    for (let i = 0; i < 240; i++) {
      cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, s, flat);
    }
    expect(s.group.position.y).toBeGreaterThan(-0.25);
    expect(s.group.position.y).toBeLessThan(0.35);
  }, 30000);

  it('the Sprinter runs full throttle in its class, near the estimate', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle('sprinter_van');
    cp.spawnCar(v, [], 0);
    const dt = 1 / 60;
    let t100 = Infinity;
    let top = 0;
    const steps = Math.round(45 / dt);
    for (let i = 0; i < steps; i++) {
      cp.step(dt, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
      if (v.group.position.z > 250) cp.repositionKeepVelocity(v, 0, -250);
      const kmh = cp.speed * 3.6;
      if (kmh > top) top = kmh;
      if (t100 === Infinity && kmh >= 100) t100 = i * dt;
    }
    const est = estimatePerformance(SPRINTER_PARAMS);
    expect(top).toBeGreaterThan(105);
    expect(top).toBeLessThan(est.topSpeedKmh + 25);
    expect(t100).toBeGreaterThan(13);
    expect(t100).toBeLessThan(28);
  }, 90000);

  it('the Prime hauls to highway speed like 9.8 t of diesel should', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle('nomad_prime');
    cp.spawnCar(v, [], 0);
    const dt = 1 / 60;
    let t100 = Infinity;
    let top = 0;
    const steps = Math.round(60 / dt);
    for (let i = 0; i < steps; i++) {
      cp.step(dt, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
      if (v.group.position.z > 250) cp.repositionKeepVelocity(v, 0, -250);
      const kmh = cp.speed * 3.6;
      if (kmh > top) top = kmh;
      if (t100 === Infinity && kmh >= 100) t100 = i * dt;
    }
    const est = estimatePerformance(PRIME_PARAMS);
    expect(t100).toBeGreaterThan(10);
    expect(t100).toBeLessThan(28);
    expect(top).toBeGreaterThan(120);
    expect(top).toBeLessThan(est.topSpeedKmh + 25);
  }, 120000);
});
