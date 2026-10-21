import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CarPhysics } from '../game/CarPhysics';
import { VEHICLE_DEFS, type Vehicle } from '../game/Vehicles';
import { estimatePerformance, carParams } from '../game/carSpec';

/**
 * Piece 3: the RIGID BODY must hit the same figures the math promises.
 * Full-throttle runs on a flat heightfield, measured from the body —
 * stock clears 220 km/h in the metal, not just on paper.
 */

function fakeVehicle(x = 0, z = 0, heading = 0): Vehicle {
  const def = VEHICLE_DEFS[0];
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  return {
    uid: 'mustang', def, group, heading, speed: 0, fuel: 61, condition: 1,
    wheelSpin: [], wheelPivots: [], steerVis: 0, wheelSpinAngle: 0,
    suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: 0, steerAngle: 0, wheelR: 0.345,
    bodyPitch: 0, bodyRoll: 0, suspV: 0, storage: [], upgrades: [], tiresFlat: 0,
    flatSide: 1, blewTire: false, wasClipped: false, doors: [],
  } as Vehicle;
}

const flat = () => 0;

async function runFullThrottle(upgrades: string[], seconds: number) {
  const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
  const v = fakeVehicle();
  cp.spawnCar(v, upgrades, 0);
  expect(cp.isRigidBody).toBe(true);
  const dt = 1 / 60;
  let t100 = Infinity;
  let top = 0;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    cp.step(dt, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
    // runway wrap: the island is finite — recycle it, keep the speed
    if (v.group.position.z > 250) cp.repositionKeepVelocity(v, 0, -250);
    const kmh = cp.speed * 3.6;
    if (kmh > top) top = kmh;
    if (t100 === Infinity && kmh >= 100) t100 = i * dt;
  }
  return { t100, top, cp, v };
}

describe('Rapier rigid-body Mustang', () => {
  it('settles on its suspension without falling through the world', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle();
    cp.spawnCar(v, [], 0);
    for (let i = 0; i < 240; i++) {
      cp.step(1 / 60, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
    }
    // group origin at ground level: settled ride height near zero, not sunk
    expect(v.group.position.y).toBeGreaterThan(-0.25);
    expect(v.group.position.y).toBeLessThan(0.35);
    for (const s of v.suspension) {
      expect(s).toBeGreaterThan(0.05);
      expect(s).toBeLessThanOrEqual(0.33);
    }
  }, 30000);

  it('stock: full throttle reaches >= 220 km/h in the rigid body', async () => {
    const { top, t100 } = await runFullThrottle([], 40);
    const est = estimatePerformance(carParams([]));
    expect(top).toBeGreaterThanOrEqual(220);
    expect(top).toBeLessThan(est.topSpeedKmh + 25);
    expect(t100).toBeGreaterThan(3.5);
    expect(t100).toBeLessThan(7.5);
  }, 60000);

  it('max build: faster than stock in the rigid body too', async () => {
    const stock = await runFullThrottle([], 40);
    const max = await runFullThrottle(
      ['engine_tune', 'supercharger', 'weight_reduction', 'grip_tires', 'final_drive'], 40);
    expect(max.top).toBeGreaterThan(stock.top + 12);
    expect(max.t100).toBeLessThan(stock.t100 - 0.5);
  }, 120000);

  it('steering right yaws the car right', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle();
    cp.spawnCar(v, [], 0);
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 3; i++) {
      cp.step(dt, { throttle: 0.7, steer: 1, handbrake: false, hasFuel: true }, v, flat);
    }
    // heading convention: forward = (sin h, cos h); turning right = h decreases
    // (or the car has circled — either way it must not have gone LEFT)
    expect(v.heading).toBeLessThan(0.15);
    expect(cp.speed).toBeGreaterThan(5);
  }, 60000);
});
