import { describe, expect, it } from 'vitest';
import {
  articulationOf,
  packDeckSlots,
  pointAt,
  stepTrailer,
  wrapAngle,
} from '../game/trailerPhysics';
import type { Body2 } from '../game/trailerPhysics';

describe('wrapAngle', () => {
  it('wrapAngle(3π) ≈ π (or -π, accept abs)', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 9);
  });

  it('wrapAngle(0.5) = 0.5', () => {
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 12);
  });

  it('wrapAngle(-3.5) wraps into range', () => {
    const wrapped = wrapAngle(-3.5);
    expect(wrapped).toBeGreaterThanOrEqual(-Math.PI);
    expect(wrapped).toBeLessThanOrEqual(Math.PI);
    expect(wrapped).toBeCloseTo(-3.5 + 2 * Math.PI, 12);
  });
});

describe('stepTrailer', () => {
  it('stationary hitch returns ~same body', () => {
    const body: Body2 = { x: 1, z: 2, heading: 0.7 };
    const tongueDist = 4;
    const axleDist = -1;
    const hitch = pointAt(body, tongueDist);
    const result = stepTrailer(body, hitch, tongueDist, axleDist, 1.2, body.heading);
    expect(result.x).toBeCloseTo(body.x, 6);
    expect(result.z).toBeCloseTo(body.z, 6);
    expect(wrapAngle(result.heading - body.heading)).toBeCloseTo(0, 6);
    // Also verify positions within 1e-6 as specified
    expect(Math.abs(result.x - body.x)).toBeLessThan(1e-6);
    expect(Math.abs(result.z - body.z)).toBeLessThan(1e-6);
  });

  it('straight tow convergence', () => {
    let body: Body2 = { x: 0, z: 0, heading: 0 };
    const tongueDist = 4;
    const axleDist = -1;
    const maxArticulation = 1.2;
    const towHeading = 0;
    let hitch = { x: 0, z: 4 };
    for (let i = 0; i < 240; i++) {
      hitch = { x: 0, z: hitch.z + 0.1 };
      body = stepTrailer(body, hitch, tongueDist, axleDist, maxArticulation, towHeading);
    }
    const tongue = pointAt(body, tongueDist);
    const dist = Math.hypot(tongue.x - hitch.x, tongue.z - hitch.z);
    expect(dist).toBeLessThan(0.05);
    expect(Math.abs(articulationOf(body.heading, towHeading))).toBeLessThan(0.05);
  });

  it('turn tracking: hitch follows a circle', () => {
    const radius = 12;
    const tongueDist = 4;
    const axleDist = -1;
    const maxArticulation = 1.2;
    const arcStep = 0.1;
    const dPhi = arcStep / radius;

    // Start at phi = 0: hitch at (0, 12), towHeading = phi + PI/2
    let phi = 0;
    let towHeading = phi + Math.PI / 2;
    let hitch = {
      x: radius * Math.sin(phi),
      z: radius * Math.cos(phi),
    };
    // Trailer starts aligned with the tow vehicle, tongue exactly at hitch.
    let body: Body2 = {
      x: hitch.x - Math.sin(towHeading) * tongueDist,
      z: hitch.z - Math.cos(towHeading) * tongueDist,
      heading: towHeading,
    };

    for (let i = 0; i < 300; i++) {
      phi += dPhi;
      towHeading = phi + Math.PI / 2;
      hitch = {
        x: radius * Math.sin(phi),
        z: radius * Math.cos(phi),
      };
      body = stepTrailer(body, hitch, tongueDist, axleDist, maxArticulation, towHeading);
    }

    const tongue = pointAt(body, tongueDist);
    const dist = Math.hypot(tongue.x - hitch.x, tongue.z - hitch.z);
    expect(dist).toBeLessThan(0.05);
    expect(Math.abs(articulationOf(body.heading, towHeading))).toBeLessThan(1.2);
  });

  it('jackknife clamp', () => {
    const body: Body2 = { x: 0, z: 0, heading: 2.6 };
    const tongueDist = 4;
    const axleDist = -1;
    const maxArticulation = 1.2;
    const towHeading = 0;
    const hitch = pointAt(body, tongueDist);
    const result = stepTrailer(body, hitch, tongueDist, axleDist, maxArticulation, towHeading);
    expect(Math.abs(articulationOf(result.heading, 0))).toBeLessThanOrEqual(1.2 + 1e-9);
  });

  it('reversing: articulation stays within maxArticulation', () => {
    let body: Body2 = { x: 0, z: 0, heading: 0 };
    const tongueDist = 4;
    const axleDist = -1;
    const maxArticulation = 1.2;
    const towHeading = 0;
    let hitch = { x: 0, z: 4 };
    for (let i = 0; i < 120; i++) {
      hitch = { x: hitch.x + 0.01, z: hitch.z - 0.1 };
      body = stepTrailer(body, hitch, tongueDist, axleDist, maxArticulation, towHeading);
      expect(Math.abs(articulationOf(body.heading, towHeading))).toBeLessThanOrEqual(
        maxArticulation + 1e-9,
      );
    }
  });
});

describe('packDeckSlots (HET-70 multi-bay packing)', () => {
  // lowboy pack zone: L 17.6 → frontZ = L*0.39, rearZ = -L/2 + 0.7
  const frontZ = 17.6 * 0.39;
  const rearZ = -17.6 / 2 + 0.7;

  it('packs three sedans nose-forward in load order', () => {
    const slots = packDeckSlots([4.7, 4.7, 4.7], frontZ, rearZ);
    expect(slots).not.toBeNull();
    expect(slots!).toHaveLength(3);
    expect(slots![0]).toBeGreaterThan(slots![1]);
    expect(slots![1]).toBeGreaterThan(slots![2]);
    // rearmost car still clears the rear edge of the pack zone
    expect(slots![2] - 4.7 / 2).toBeGreaterThanOrEqual(rearZ);
    // front-most car clears the front stop with the margin
    expect(slots![0] + 4.7 / 2).toBeLessThanOrEqual(frontZ);
  });

  it('a tank fits alone', () => {
    const slots = packDeckSlots([7.4], frontZ, rearZ);
    expect(slots).not.toBeNull();
    expect(slots![0] - 7.4 / 2).toBeGreaterThanOrEqual(rearZ);
  });

  it('returns null when the load overruns the deck', () => {
    expect(packDeckSlots([7.4, 7.4], frontZ, rearZ)).toBeNull();
    expect(packDeckSlots([5.3, 5.3, 5.3], frontZ, rearZ)).toBeNull(); // 3 long pickups don't
    expect(packDeckSlots([20], frontZ, rearZ)).toBeNull();
  });

  it('empty load packs to an empty slot list', () => {
    expect(packDeckSlots([], frontZ, rearZ)).toEqual([]);
  });
});
