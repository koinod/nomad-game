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
    storage: [], upgrades: [], tiresFlat: 0,
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

  // Item 4 (2026-10-21): lean is the BODY's, never scripted. The mesh
  // group copies the rigid body's quaternion in syncVisual; the old
  // smoothed bodyPitch/bodyRoll fields were dead and are deleted.
  // Evidence: no lean without lateral load, real lean with it — read
  // straight off the body-driven group quaternion.
  it('gravity lean: upright in a straight line, rolled by the body in a corner', async () => {
    const cp = await CarPhysics.create({ onImpact: () => undefined }, flat, []);
    const v = fakeVehicle();
    cp.spawnCar(v, [], 0);
    const dt = 1 / 60;
    const rollDeg = () => Math.abs(THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(v.group.quaternion, 'YXZ').z));
    // straight line at speed: nothing leans
    for (let i = 0; i < 300; i++) {
      cp.step(dt, { throttle: 0.8, steer: 0, handbrake: false, hasFuel: true }, v, flat);
      if (v.group.position.z > 250) cp.repositionKeepVelocity(v, 0, -250);
    }
    expect(cp.speed).toBeGreaterThan(10);
    expect(rollDeg()).toBeLessThan(0.4);
    // sustained corner: the BODY rolls and the corners disagree
    for (let i = 0; i < 200; i++) {
      cp.step(dt, { throttle: 0.55, steer: 1, handbrake: false, hasFuel: true }, v, flat);
      if (Math.abs(v.group.position.z) > 250 || Math.abs(v.group.position.x) > 250) cp.repositionKeepVelocity(v, 0, 0);
    }
    expect(rollDeg()).toBeGreaterThan(1.0);
    const s = cp.rawSuspension;
    expect(Math.max(...s) - Math.min(...s)).toBeGreaterThan(0.025);
  }, 60000);
});
