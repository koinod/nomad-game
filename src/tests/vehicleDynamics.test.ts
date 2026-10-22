import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CarPhysics, paramsForDef, geomFor, brakeTorques, BRAKE_GRIP_FRACTION,
} from '../game/CarPhysics';
import { VEHICLE_DEFS, type Vehicle } from '../game/Vehicles';

/**
 * VEHICLE DYNAMICS GATE — Ian's playtest verdict (2026-10-22):
 * "unrealistic movement and swaying front to back — take that out,
 * just have real braking and speed... not floating on the ground
 * but adjusting to the boundary of the slope/ground properly."
 *
 * BEFORE this pass (probed): a hard stop porpoised at 20–28 deg of
 * dive with the rear wheels airborne (the flat 26,000 N·m brake
 * acted through the controller's ~123x brake-path gain as ~15 g
 * of decel; the front suspension then saturated Rapier's DEFAULT
 * max-force cap and sank to the collider). AFTER: every assertion
 * below is the measured behavior of the fixed system, with margin.
 *
 * The three root causes, each pinned by a test here:
 *  1. brakes sized by the tire (brakeTorques) + pressure ramp,
 *  2. explicit per-def max suspension force (~3x corner load),
 *  3. damping set on every def (the Mustang ran Rapier defaults).
 * Ground conformance is pinned parked AND driving, on slopes,
 * with the exact contact-point math (connection + chassis-down x
 * (len + radius) vs the ground field under that point).
 */

const DEFS = ['mustang', 'gt500', 'dark_horse', 'nomad_prime', 'sprinter_van'] as const;
const flat = () => 0;

function fakeVehicle(defId: string, x = 0, z = 0, heading = 0): Vehicle {
  const def = VEHICLE_DEFS.find((d) => d.id === defId)!;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  return {
    uid: defId, def, group, heading, speed: 0, fuel: 61, condition: 1,
    wheelSpin: [], wheelPivots: [], steerVis: 0, wheelSpinAngle: 0,
    suspension: [0.32, 0.32, 0.32, 0.32], suspRest: 0.32, bobT: 0, steerAngle: 0, wheelR: 0.345,
    storage: [], upgrades: [], tiresFlat: 0,
    flatSide: 1, blewTire: false, wasClipped: false, doors: [],
  } as Vehicle;
}

const pitchDeg = (v: Vehicle) => THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(v.group.quaternion, 'YXZ').x);
const rollDeg = (v: Vehicle) => THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(v.group.quaternion, 'YXZ').z);

/** Spawn high enough that every wheel's ray reaches its ground on
 *  a slope (group y from the HIGHEST wheel's ground). */
function spawnOnSlope(cp: CarPhysics, v: Vehicle, groundY: (x: number, z: number) => number): void {
  const geom = geomFor(v.def.id);
  const p = paramsForDef(v.def.id, [], 0);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, v.heading, 0));
  let maxG = -Infinity;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Vector3(sx * geom.wheelX, 0, sz * geom.wheelZ).applyQuaternion(q).add(v.group.position);
    maxG = Math.max(maxG, groundY(w.x, w.z));
  }
  v.group.position.y = maxG + 0.32 + p.wheelRadiusM - 0.57 - 0.03;
  cp.spawnCar(v, [], 0);
}

/** Exact per-wheel visual gap (m): contact point = connection +
 *  chassis-down x (visual suspension len + radius); gap = its
 *  height over the ground field at its own (x, z). + = floating,
 *  - = sunk. This is the number the GLB rig renders from. */
function wheelGapsExact(v: Vehicle, groundY: (x: number, z: number) => number): number[] {
  const geom = geomFor(v.def.id);
  const p = paramsForDef(v.def.id, [], 0);
  const bodyPos = v.group.position.clone(); bodyPos.y += 0.55;
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(v.group.quaternion);
  const pts: [number, number, number][] = [
    [-geom.wheelX, 0.02, geom.wheelZ], [geom.wheelX, 0.02, geom.wheelZ],
    [-geom.wheelX, 0.02, -geom.wheelZ], [geom.wheelX, 0.02, -geom.wheelZ],
  ];
  return pts.map(([lx, ly, lz], i) => {
    const conn = new THREE.Vector3(lx, ly, lz).applyQuaternion(v.group.quaternion).add(bodyPos);
    const contact = conn.clone().addScaledVector(down, v.suspension[i] + p.wheelRadiusM);
    return contact.y - groundY(contact.x, contact.z);
  });
}

interface StopResult {
  meanDecel: number;
  peakDecel: number;
  diveAtStop: number;
  env05: number;
  env1: number;
  crossings: number;
  rearAirborneSteps: number;
  stopDist: number;
}

/** Settle parked, launch to v0, brake hard to a stop, park, watch
 *  the pitch settle for 3 s. The porpoise signature this hunts:
 *  big dive, envelope still open at 1 s, repeated zero crossings. */
async function brakeStop(defId: string, v0: number): Promise<StopResult> {
  const cp = await CarPhysics.create(flat);
  const v = fakeVehicle(defId, 0, -120);
  cp.spawnCar(v, [], 0);
  const dt = 1 / 60;
  for (let i = 0; i < 120; i++) cp.step(dt, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
  for (let i = 0; i < 60 * 40 && cp.speed < v0; i++) {
    cp.step(dt, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
  }
  const startZ = v.group.position.z;
  let prev = cp.speed;
  let peakDecel = 0;
  let decelSum = 0;
  let decelN = 0;
  let stopped = false;
  let stopIdx = -1;
  let diveAtStop = 0;
  let rearAirborneSteps = 0;
  const samples: number[] = [];
  for (let i = 0; i < 60 * 12; i++) {
    const inp = stopped
      ? { throttle: 0, steer: 0, handbrake: true, hasFuel: true }
      : { throttle: -1, steer: 0, handbrake: false, hasFuel: true };
    cp.step(dt, inp, v, flat);
    const d = (prev - cp.speed) / dt;
    prev = cp.speed;
    if (!stopped) {
      if (cp.speed > 1 && cp.speed < v0 - 1) { peakDecel = Math.max(peakDecel, d); decelSum += d; decelN++; }
      if (cp.rawSuspension[2] >= 0.318 && cp.rawSuspension[3] >= 0.318 && cp.speed > 2) rearAirborneSteps++;
    }
    samples.push(pitchDeg(v));
    if (!stopped && Math.abs(cp.speed) < 0.3 && i > 30) {
      stopped = true;
      stopIdx = samples.length - 1;
      diveAtStop = pitchDeg(v);
    }
    if (stopped && samples.length - stopIdx > 60 * 3.2) break;
  }
  // settle metrics relative to the stop moment, against the final
  // parked pitch: envelope at +0.5 s / +1 s, and zero crossings of
  // the residual over the 2.5 s after the stop
  const after = stopIdx >= 0 ? samples.slice(stopIdx) : samples;
  const fin = after[after.length - 1];
  const env = (s: number) => {
    const idx = Math.min(after.length - 1, Math.round(s * 60));
    let m = 0;
    for (let k = Math.max(0, idx - 6); k <= Math.min(after.length - 1, idx + 6); k++) m = Math.max(m, Math.abs(after[k] - fin));
    return m;
  };
  let crossings = 0;
  for (let k = 1; k < Math.min(after.length, 150); k++) {
    if (Math.sign(after[k] - fin) !== Math.sign(after[k - 1] - fin) && Math.abs(after[k] - fin) > 0.02) crossings++;
  }
  return {
    meanDecel: decelN ? decelSum / decelN : 0,
    peakDecel,
    diveAtStop,
    env05: env(0.5),
    env1: env(1),
    crossings,
    rearAirborneSteps,
    stopDist: Math.abs(v.group.position.z - startZ),
  };
}

describe('brake sizing is real (pure math pins)', () => {
  for (const defId of DEFS) {
    it(`${defId}: capacity = 0.92 x tire limit, front-biased by transfer`, () => {
      const p = paramsForDef(defId, [], 0);
      const geom = geomFor(defId);
      const b = brakeTorques(p, defId, geom);
      // total patch force the torques represent == the sized capacity
      const totalN = (2 * b.front + 2 * b.rear) / p.wheelRadiusM;
      const expectN = BRAKE_GRIP_FRACTION * p.tireMu * p.massKg * 9.81;
      expect(Math.abs(totalN - expectN) / expectN).toBeLessThan(0.02);
      // front axle carries the larger share under braking transfer
      expect(b.front).toBeGreaterThan(b.rear);
      // the handbrake is exactly the rear axle's lock torque
      const handExpect = p.tireMu * ((p.massKg * 9.81 * p.rearLoadFrac) / 2) * p.wheelRadiusM;
      expect(Math.abs(b.handRear - handExpect) / handExpect).toBeLessThan(0.02);
    });
  }
});

describe('hard brake stop: no porpoise, no stoppie, tire-limited decel', () => {
  for (const defId of DEFS) {
    it(defId, async () => {
      const p = paramsForDef(defId, [], 0);
      const v0 = defId === 'nomad_prime' || defId === 'sprinter_van' ? 14 : 20;
      const r = await brakeStop(defId, v0);
      const target = BRAKE_GRIP_FRACTION * p.tireMu * 9.81;
      // decel rides the tire: mean within band, no spike steps
      expect(r.meanDecel).toBeGreaterThan(target * 0.8);
      expect(r.meanDecel).toBeLessThan(target * 1.15);
      expect(r.peakDecel).toBeLessThan(target * 1.45);
      // dive is weight transfer, not a collapse: ~1 deg, and it
      // settles ONCE (envelope closed by 1 s, no oscillation)
      expect(Math.abs(r.diveAtStop)).toBeLessThan(1.6);
      expect(r.env1).toBeLessThan(0.35);
      expect(r.crossings).toBeLessThanOrEqual(1);
      // the rear wheels never leave the ground in a service stop
      expect(r.rearAirborneSteps).toBe(0);
      // stopping distance agrees with the decel (v^2 / 2a + ramp)
      const ideal = (v0 * v0) / (2 * target);
      expect(r.stopDist).toBeGreaterThan(ideal * 0.75);
      expect(r.stopDist).toBeLessThan(ideal * 1.5);
    }, 180000);
  }
});

describe('bump at speed: one response, then settled', () => {
  const bumpH = 0.25, bumpZ = 40, sigma = 3;
  const bump = (_x: number, z: number) => bumpH * Math.exp(-((z - bumpZ) ** 2) / (2 * sigma * sigma));
  for (const defId of DEFS) {
    it(defId, async () => {
      const cp = await CarPhysics.create(bump);
      const v = fakeVehicle(defId, 0, -60);
      cp.spawnCar(v, [], 0);
      const dt = 1 / 60;
      for (let i = 0; i < 120; i++) cp.step(dt, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, bump);
      const samples: number[] = [];
      let crossedAt = -1;
      for (let i = 0; i < 60 * 14; i++) {
        const th = cp.speed < 11 ? 0.7 : 0.25;
        cp.step(dt, { throttle: th, steer: 0, handbrake: false, hasFuel: true }, v, bump);
        if (crossedAt < 0 && v.group.position.z > bumpZ) crossedAt = i;
        if (crossedAt > 0) samples.push(pitchDeg(v));
        if (crossedAt > 0 && i > crossedAt + 60 * 3.5) break;
      }
      const base = samples[samples.length - 1];
      let peak = 0;
      for (const s of samples) peak = Math.max(peak, Math.abs(s - base));
      const envAt = (sec: number) => {
        let m = 0;
        const from = Math.round(sec * 60);
        for (let k = from; k < Math.min(samples.length, from + 18); k++) m = Math.max(m, Math.abs(samples[k] - base));
        return m;
      };
      let crossings = 0;
      for (let k = 1; k < samples.length; k++) {
        if (Math.sign(samples[k] - base) !== Math.sign(samples[k - 1] - base) && Math.abs(samples[k] - base) > 0.02) crossings++;
      }
      // a 25 cm bump kicks a few degrees, ONCE (front axle, then
      // rear) — the porpoise signature was 5-7 crossings and an
      // envelope still open at 3 s
      expect(peak).toBeLessThan(4.5);
      expect(envAt(2)).toBeLessThan(0.35);
      expect(crossings).toBeLessThanOrEqual(3);
    }, 180000);
  }
});

describe('slope conformance: parked, planted, no hover', () => {
  const slopeDeg = 10;
  // fields sit on a +30 m base so the test ground is dry land —
  // below sea level the sim (correctly) treats the car as drowned
  const upSlope = (_x: number, z: number) => 30 + Math.tan(THREE.MathUtils.degToRad(slopeDeg)) * z;
  const sideSlope = (x: number, _z: number) => 30 + Math.tan(THREE.MathUtils.degToRad(slopeDeg)) * x;
  for (const defId of DEFS) {
    it(`${defId} facing uphill`, async () => {
      const cp = await CarPhysics.create(upSlope);
      const v = fakeVehicle(defId, 0, 0, 0);
      spawnOnSlope(cp, v, upSlope);
      const dt = 1 / 60;
      for (let i = 0; i < 180; i++) cp.step(dt, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, upSlope);
      const pMid = v.group.position.clone();
      for (let i = 0; i < 180; i++) cp.step(dt, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, upSlope);
      const gaps = wheelGapsExact(v, upSlope);
      for (const g of gaps) expect(Math.abs(g)).toBeLessThan(0.008);
      // body attitude follows the terrain plane
      expect(Math.abs(Math.abs(pitchDeg(v)) - slopeDeg)).toBeLessThan(1.2);
      // the downhill (rear) axle carries the slope transfer: its
      // suspension sits SHORTER than the front's
      expect(cp.rawSuspension[2]).toBeLessThan(cp.rawSuspension[0]);
      expect(cp.rawSuspension[3]).toBeLessThan(cp.rawSuspension[1]);
      // parked means parked: after the settle, no creep (the first
      // half absorbs the spawn drop and is not measured)
      expect(Math.abs(v.group.position.z - pMid.z)).toBeLessThan(0.05);
      expect(Math.abs(v.group.position.x - pMid.x)).toBeLessThan(0.05);
    }, 120000);
    it(`${defId} across a side slope`, async () => {
      const cp = await CarPhysics.create(sideSlope);
      const v = fakeVehicle(defId, 0, 0, 0);
      spawnOnSlope(cp, v, sideSlope);
      const dt = 1 / 60;
      for (let i = 0; i < 360; i++) cp.step(dt, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, sideSlope);
      const gaps = wheelGapsExact(v, sideSlope);
      for (const g of gaps) expect(Math.abs(g)).toBeLessThan(0.008);
      expect(Math.abs(Math.abs(rollDeg(v)) - slopeDeg)).toBeLessThan(1.2);
      // downhill side (+X is up here, so the -X wheels are the
      // loaded ones): left corners (0, 2) sit shorter
      expect(cp.rawSuspension[0]).toBeLessThan(cp.rawSuspension[1]);
      expect(cp.rawSuspension[2]).toBeLessThan(cp.rawSuspension[3]);
    }, 120000);
  }
});

describe('slope conformance: driving, wheels glued', () => {
  const slopeDeg = 10;
  const upSlope = (_x: number, z: number) => 30 + Math.tan(THREE.MathUtils.degToRad(slopeDeg)) * z;
  for (const defId of ['mustang', 'nomad_prime'] as const) {
    it(`${defId} climbs the slope on its wheels`, async () => {
      const cp = await CarPhysics.create(upSlope);
      const v = fakeVehicle(defId, 0, -40, 0);
      spawnOnSlope(cp, v, upSlope);
      const dt = 1 / 60;
      for (let i = 0; i < 120; i++) cp.step(dt, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, upSlope);
      let maxGap = 0;
      let minGap = 0;
      let maxPitchErr = 0;
      for (let i = 0; i < 60 * 7; i++) {
        const th = cp.speed < 7 ? 0.85 : 0.45;
        cp.step(dt, { throttle: th, steer: 0, handbrake: false, hasFuel: true }, v, upSlope);
        if (i > 120) { // settled into the climb
          for (const g of wheelGapsExact(v, upSlope)) {
            maxGap = Math.max(maxGap, g);
            minGap = Math.min(minGap, g);
          }
          maxPitchErr = Math.max(maxPitchErr, Math.abs(Math.abs(pitchDeg(v)) - slopeDeg));
        }
      }
      expect(cp.speed).toBeGreaterThan(4); // it really climbed
      expect(maxGap).toBeLessThan(0.035); // never floats
      expect(minGap).toBeGreaterThan(-0.035); // never sinks
      expect(maxPitchErr).toBeLessThan(2.5); // body rides the plane
    }, 180000);
  }
});

describe('reverse: geared, limited, sane', () => {
  for (const defId of DEFS) {
    it(defId, async () => {
      const cp = await CarPhysics.create(flat);
      const v = fakeVehicle(defId);
      cp.spawnCar(v, [], 0);
      const p = paramsForDef(defId, [], 0);
      const dt = 1 / 60;
      for (let i = 0; i < 120; i++) cp.step(dt, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
      let peakRev = 0;
      for (let i = 0; i < 60 * 5; i++) {
        cp.step(dt, { throttle: -1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
        peakRev = Math.max(peakRev, -cp.speed);
      }
      const gearedMax = ((p.redlineRpm + 400) / (p.gears[0] * p.finalDrive)) * (2 * Math.PI * p.wheelRadiusM) / 60;
      expect(peakRev).toBeGreaterThan(0.8); // reverse works
      expect(peakRev).toBeLessThan(gearedMax * 1.15 + 0.3); // and stops where the gearing says
    }, 120000);
  }
});

describe('handbrake: rear-axle tool, not a catapult', () => {
  it('mustang handbrake stop from 14 m/s', async () => {
    const cp = await CarPhysics.create(flat);
    const v = fakeVehicle('mustang', 0, -80);
    cp.spawnCar(v, [], 0);
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) cp.step(dt, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
    for (let i = 0; i < 60 * 30 && cp.speed < 14; i++) {
      cp.step(dt, { throttle: 1, steer: 0, handbrake: false, hasFuel: true }, v, flat);
    }
    let prev = cp.speed;
    let decelSum = 0;
    let decelN = 0;
    let peakPitch = 0;
    let stopped = false;
    for (let i = 0; i < 60 * 12 && !stopped; i++) {
      cp.step(dt, { throttle: 0, steer: 0, handbrake: true, hasFuel: true }, v, flat);
      const d = (prev - cp.speed) / dt;
      prev = cp.speed;
      if (cp.speed > 1 && cp.speed < 13) { decelSum += d; decelN++; }
      peakPitch = Math.max(peakPitch, Math.abs(pitchDeg(v)));
      if (Math.abs(cp.speed) < 0.1 && i > 30) stopped = true;
    }
    expect(stopped).toBe(true);
    // rear axle alone can only spend its own load: ~mu x rearFrac
    // of g, plus drag — never the service brake's number
    const meanDecel = decelSum / Math.max(1, decelN);
    expect(meanDecel).toBeGreaterThan(1.5);
    expect(meanDecel).toBeLessThan(6.5);
    expect(peakPitch).toBeLessThan(3.5);
  }, 180000);
});
