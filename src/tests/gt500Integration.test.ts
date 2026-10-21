import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CarPhysics, geomFor, paramsForDef, suspTuneFor, clampSuspensionVisual } from '../game/CarPhysics';
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
    // The fleet appended after it (2026-10-21): nomad_prime, sprinter_van.
    expect(VEHICLE_DEFS.map((d) => d.id)).toEqual(['mustang', 'gt500', 'nomad_prime', 'sprinter_van']);
    expect(VEHICLE_DEFS[1]).toBe(GT500_DEF);
  });

  it('the GT500 spawns FIRST, on its airbase pad (Ian 2026-10-21: FX stand-in deleted; fleet respawns at the revamped airbase)', () => {
    // The mustang DEF stays registered (above) — its data feeds the
    // build sheet and the Dark Horse — but nothing spawns it. The
    // fleet spawns (Prime + Sprinter on their own airbase pads)
    // follow the GT500 in VEHICLE_SPAWNS; fleetIntegration.test.ts
    // pins those, airbase.test.ts pins spawn == pad exactly.
    expect(VEHICLE_SPAWNS.map((s) => s.id)).toEqual(['gt500', 'nomad_prime', 'sprinter_van']);
    expect(VEHICLE_SPAWNS[0]).toBe(GT500_SPAWN);
    expect(GT500_SPAWN.poi).toBe('airbase');
    expect(GT500_SPAWN.dx).toBe(7);
    expect(GT500_SPAWN.dz).toBe(-9);
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
    storage: [], upgrades: [], tiresFlat: 0,
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

// ------------------------------------------------------------ Item 3: suspension + arches

describe('GT500 suspension tune (Item 3)', () => {
  it('the tune is explicit: stiffness for its mass, real damping, its own travel', () => {
    const t = suspTuneFor('gt500');
    expect(t.stiffness).toBeGreaterThan(suspTuneFor('mustang').stiffness);
    expect(t.compression).toBeGreaterThan(0);
    expect(t.relaxation).toBeGreaterThan(0);
    expect(t.travel).toBeLessThan(0.28);
  });

  it('the arch datum is consistent for both cars: full tuck still fits the well', () => {
    for (const id of ['mustang', 'gt500']) {
      const tune = suspTuneFor(id);
      const r = paramsForDef(id, [], 0).wheelRadiusM;
      // wheel top at maximum visual rise = diameter + allowed rise
      expect(2 * r + tune.archTravelM).toBeLessThanOrEqual(tune.archTopM + 1e-9);
    }
  });

  it('clampSuspensionVisual: tuck clamps at the arch, droop at full travel', () => {
    const tune = suspTuneFor('gt500');
    const rest = 0.32;
    expect(clampSuspensionVisual(0.0, rest, tune)).toBeCloseTo(rest - tune.archTravelM, 6);
    expect(clampSuspensionVisual(-1, rest, tune)).toBeCloseTo(rest - tune.archTravelM, 6);
    expect(clampSuspensionVisual(0.9, rest, tune)).toBeCloseTo(rest + tune.travel, 6);
    expect(clampSuspensionVisual(0.27, rest, tune)).toBeCloseTo(0.27, 6);
  });

  it('settles composed: near-equal corners, laden stance', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle('gt500');
    cp.spawnCar(v, [], 0);
    for (let i = 0; i < 240; i++) {
      cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
    }
    for (const s of cp.rawSuspension) {
      expect(s).toBeGreaterThan(0.24);
      expect(s).toBeLessThan(0.30);
    }
    expect(Math.max(...cp.rawSuspension) - Math.min(...cp.rawSuspension)).toBeLessThan(0.01);
  }, 30000);

  it('a hard landing compresses deep, recovers clean, and never breaches the arch', async () => {
    // Measured character of the controller (tune sweep + force trace,
    // 2026-10-21): Rapier's raycast suspension applies a fraction of
    // its computed force per substep, so free-fall drops past ~0.25 m
    // use the whole travel and kiss the chassis — at EVERY stiffness
    // from 40 to 130. That is the shipped model's character (the
    // Mustang baseline shares it), not a tune defect; what the tune
    // must guarantee is a deep, damped compression with a clean
    // recovery and no oscillation — and the rendered wheel inside
    // its arch at every instant (asserted separately at 3 m too).
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle('gt500');
    cp.spawnCar(v, [], 0);
    for (let i = 0; i < 120; i++) cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
    const settledY = v.group.position.y;
    const settledLen = cp.rawSuspension[0];
    v.group.position.y = 0.3;
    cp.teleport(v);
    const tune = suspTuneFor('gt500');
    let minRaw = Infinity;
    const late: number[] = [];
    for (let i = 0; i < 360; i++) {
      cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
      minRaw = Math.min(minRaw, ...cp.rawSuspension);
      for (let w = 0; w < 4; w++) {
        expect(v.suspRest - v.suspension[w]).toBeLessThanOrEqual(tune.archTravelM + 1e-6);
      }
      if (i > 330) late.push(cp.rawSuspension[0]);
    }
    expect(minRaw).toBeLessThan(settledLen - 0.1); // the landing really loaded the springs
    expect(Math.abs(v.group.position.y - settledY)).toBeLessThan(0.02); // recovered to ride height
    expect(Math.max(...late) - Math.min(...late)).toBeLessThan(0.005); // no residual oscillation
  }, 30000);

  it('a 3 m drop bottoms the physics — but the RENDERED wheel never leaves the arch', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle('gt500');
    cp.spawnCar(v, [], 0);
    for (let i = 0; i < 120; i++) cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
    v.group.position.y = 3;
    cp.teleport(v);
    const tune = suspTuneFor('gt500');
    const r = paramsForDef('gt500', [], 0).wheelRadiusM;
    let sawPhysicsBottom = false;
    for (let i = 0; i < 300; i++) {
      cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
      if (Math.min(...cp.rawSuspension) <= 0.32 - tune.travel + 0.005) sawPhysicsBottom = true;
      for (let w = 0; w < 4; w++) {
        const rise = v.suspRest - v.suspension[w];
        expect(rise).toBeLessThanOrEqual(tune.archTravelM + 1e-6);
        // the Ian-facing invariant: wheel top at/below the arch lip
        expect(2 * r + rise).toBeLessThanOrEqual(tune.archTopM + 1e-6);
      }
    }
    expect(sawPhysicsBottom).toBe(true); // proves the clamp was exercised, not idle
  }, 30000);

  it('cornering squat: load transfers — outside compresses, body rolls with it (Item 4)', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle('gt500');
    cp.spawnCar(v, [], 0);
    const dt = 1 / 60;
    for (let i = 0; i < 400 && cp.speed < 8.5; i++) {
      cp.step(dt, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
      if (v.group.position.z > 250) cp.repositionKeepVelocity(v, 0, -250);
    }
    for (let i = 0; i < 200; i++) {
      cp.step(dt, { throttle: 0.55, steer: 1, handbrake: false, hasFuel: true }, v, flat);
      if (v.group.position.z > 250 || v.group.position.z < -250) cp.repositionKeepVelocity(v, 0, 0);
    }
    const e = new THREE.Euler().setFromQuaternion(v.group.quaternion, 'YXZ');
    const rollDeg = Math.abs(THREE.MathUtils.radToDeg(e.z));
    expect(rollDeg).toBeGreaterThan(1.2);
    const s = cp.rawSuspension;
    expect(Math.max(...s) - Math.min(...s)).toBeGreaterThan(0.03);
  }, 60000);
});
