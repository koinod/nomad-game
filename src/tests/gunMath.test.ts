import { describe, expect, it } from 'vitest';
import {
  armorMult, bloomAdd, bloomDecay, bloomSpread, conditionDamageMult,
  convergedDir, jamChance, kickFor, moveSpread, rangeFalloff, rayGroundDistance,
  recoveryStep, rollJam,
  staggerPower, swayOffset, applyWear, WEAR_PER_SHOT, type Vec3Like,
} from '../game/gunMath';
import { ITEMS } from '../data/items';
import { modAdsTimeMult, modRecoilMult } from '../data/mods';

describe('kickFor', () => {
  it('returns the full recoil standing at the hip', () => {
    const k = kickFor(0.02, 0, 0, false, 1, () => 0.5);
    expect(k.pitch).toBeCloseTo(0.02);
    expect(k.yaw).toBe(0);
  });
  it('ADS and a crouch brace the gun; drift stays inside the cone', () => {
    const hip = kickFor(0.02, 0.006, 0, false, 1, () => 1);
    const braced = kickFor(0.02, 0.006, 1, true, 1, () => 1);
    expect(braced.pitch).toBeLessThan(hip.pitch);
    expect(Math.abs(braced.yaw)).toBeLessThanOrEqual(0.006);
    expect(braced.yaw).toBeGreaterThan(0); // rng=1 walks right
  });
  it('a foregrip (modMult) scales the whole kick', () => {
    const bare = kickFor(0.02, 0, 0, false, 1, () => 0.5);
    const gripped = kickFor(0.02, 0, 0, false, 0.8, () => 0.5);
    expect(gripped.pitch).toBeCloseTo(bare.pitch * 0.8);
  });
});

describe('recoveryStep', () => {
  it('repays a shrinking share of the debt — fast settle, soft tail', () => {
    const first = recoveryStep(0.1, 1 / 60);
    const second = recoveryStep(0.1 - first, 1 / 60);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
  });
  it('never overpays and ignores zero dt', () => {
    expect(recoveryStep(0.05, 10)).toBe(0.05);
    expect(recoveryStep(0.05, 0)).toBe(0);
    expect(recoveryStep(0, 1)).toBe(0);
  });
});

describe('bloom', () => {
  it('stacks per shot and clamps at 1', () => {
    expect(bloomAdd(0, 0.07)).toBeCloseTo(0.07);
    expect(bloomAdd(0.95, 0.2)).toBe(1);
  });
  it('decays exponentially toward calm', () => {
    const b = bloomDecay(1, 0.5);
    expect(b).toBeGreaterThan(0.2);
    expect(b).toBeLessThan(0.4);
    expect(bloomDecay(0.4, 0)).toBeCloseTo(0.4);
  });
  it('spread follows bloom linearly', () => {
    expect(bloomSpread(0.5, 0.08)).toBeCloseTo(0.04);
    expect(bloomSpread(2, 0.08)).toBeCloseTo(0.08);
  });
});

describe('moveSpread', () => {
  it('is zero standing still and worst from the hip at speed', () => {
    expect(moveSpread(0, 0)).toBe(0);
    expect(moveSpread(1, 0)).toBeCloseTo(0.03);
    expect(moveSpread(1, 2)).toBeLessThan(moveSpread(1, 0));
  });
});

describe('swayOffset', () => {
  it('does not exist from the hip', () => {
    expect(swayOffset(3, 1, 100, false, 0)).toEqual({ x: 0, y: 0 });
  });
  it('stays inside its amplitude envelope and worsens when winded', () => {
    const fresh = swayOffset(1.7, 1, 100, false, 2);
    const gassed = swayOffset(1.7, 1, 0, false, 2);
    expect(Math.abs(fresh.x)).toBeLessThanOrEqual(0.0062);
    expect(Math.abs(fresh.y)).toBeLessThanOrEqual(0.0062);
    expect(Math.abs(gassed.x)).toBeGreaterThan(Math.abs(fresh.x));
  });
  it('a crouch and a shoulder aim both steady it', () => {
    const standing = swayOffset(0.9, 1, 100, false, 2);
    const crouched = swayOffset(0.9, 1, 100, true, 2);
    const shoulder = swayOffset(0.9, 1, 100, false, 1);
    expect(Math.abs(crouched.x)).toBeLessThan(Math.abs(standing.x));
    expect(Math.abs(shoulder.x)).toBeLessThan(Math.abs(standing.x));
  });
});

describe('condition + jam', () => {
  it('wear is 1 per 25 shots and clamps at 0', () => {
    expect(applyWear(100, WEAR_PER_SHOT * 25)).toBeCloseTo(99);
    expect(applyWear(0.01, 5)).toBe(0);
  });
  it('damage only sags below 30 condition', () => {
    expect(conditionDamageMult(100)).toBe(1);
    expect(conditionDamageMult(30)).toBe(1);
    expect(conditionDamageMult(29)).toBe(0.85);
  });
  it('a healthy gun never jams; a shot-out one jams double', () => {
    expect(jamChance(30, false)).toBe(0);
    expect(jamChance(29, false)).toBeCloseTo(0.02);
    expect(jamChance(10, false)).toBeCloseTo(0.04);
    expect(jamChance(10, true)).toBeCloseTo(0.02); // suppressor halves it
  });
  it('rollJam follows the injected rng', () => {
    expect(rollJam(20, false, () => 0.01)).toBe(true);
    expect(rollJam(20, false, () => 0.5)).toBe(false);
    expect(rollJam(90, false, () => 0)).toBe(false);
  });
});

describe('armor + falloff + stagger', () => {
  it('flesh takes everything; plate needs penetration', () => {
    expect(armorMult(0, 0)).toBe(1);
    expect(armorMult(0, 2)).toBeCloseTo(0.3);
    expect(armorMult(1, 2)).toBeCloseTo(0.65);
    expect(armorMult(2, 2)).toBe(1);
  });
  it('falloff starts past 25m and floors at half', () => {
    expect(rangeFalloff(40, 20)).toBe(40);
    expect(rangeFalloff(40, 37.5)).toBeCloseTo(30);
    expect(rangeFalloff(40, 50)).toBe(20);
    expect(rangeFalloff(40, 500)).toBe(20);
  });
  it('headshots always stagger; light hits only flinch', () => {
    expect(staggerPower(5, true)).toBe(1);
    expect(staggerPower(75, false)).toBe(0.85);
    expect(staggerPower(16, false)).toBe(0.15);
  });
});

describe('roster handling data', () => {
  const ranged = Object.values(ITEMS).filter((i) => i.category === 'weapon-ranged');
  it('every ranged weapon carries a full handling profile', () => {
    expect(ranged.length).toBeGreaterThanOrEqual(9);
    for (const w of ranged) {
      expect(w.fireMode, w.id).toBeDefined();
      expect(w.recoil, w.id).toBeGreaterThan(0);
      expect(w.bloomPerShot, w.id).toBeGreaterThan(0);
      expect(w.adsTime, w.id).toBeGreaterThan(0);
      expect(w.sway, w.id).toBeGreaterThan(0);
    }
  });
  it('no two long guns share the same kick + bloom signature', () => {
    const sig = (id: string) => `${ITEMS[id].recoil}/${ITEMS[id].bloomPerShot}/${ITEMS[id].cooldown}`;
    const ids = ['pistol', 'revolver', 'shotgun', 'hunting_rifle', 'crossbow', 'smg', 'carbine', 'dmr'];
    expect(new Set(ids.map(sig)).size).toBe(ids.length);
  });
  it('only the long guns are projectiles; ammo carries pen classes', () => {
    for (const id of ['hunting_rifle', 'dmr', 'crossbow']) {
      expect(ITEMS[id].projectileSpeed, id).toBeGreaterThan(0);
    }
    for (const id of ['pistol', 'smg', 'carbine', 'shotgun']) {
      expect(ITEMS[id].projectileSpeed, id).toBeUndefined();
    }
    expect(ITEMS.ammo_rifle.pen).toBe(2);
    expect(ITEMS.ammo_556.pen).toBe(1);
    expect(ITEMS.ammo_9mm.pen).toBe(0);
    expect(ITEMS.bolts.pen).toBe(2);
  });
  it('mod helpers price the foregrip and reflex honestly', () => {
    expect(modRecoilMult(['foregrip'])).toBeCloseTo(0.8);
    expect(modRecoilMult([])).toBe(1);
    expect(modAdsTimeMult(['reflex_sight'])).toBeCloseTo(0.7);
    expect(modAdsTimeMult(['foregrip'])).toBeCloseTo(0.9);
  });
});

// Item 6 (2026-10-21 playtest: "fix the cross hairs; gun should be
// properly pointed at the crosshair") — shots converge on the
// crosshair instead of firing parallel from an offset eye.
describe('convergedDir (Item 6)', () => {
  // third-person rig: camera behind/above, eye at the body — the eye
  // is offset from the camera ray in both axes
  const camO: Vec3Like = { x: 0.4, y: 2.6, z: -6.4 };
  const camD: Vec3Like = { x: 0, y: -0.1, z: 0.995 }; // near-level, normalized-ish
  const camDn: Vec3Like = { x: 0, y: camD.y / Math.hypot(camD.y, camD.z), z: camD.z / Math.hypot(camD.y, camD.z) };
  const eye: Vec3Like = { x: 0, y: 1.82, z: 0 };

  function crosshairMiss(eyePos: Vec3Like, dist: number): number {
    // distance from the crosshair point (camera ray at dist) to the
    // shot line fired from the eye along the converged direction
    const d = convergedDir(eyePos, camO, camDn, dist);
    const px = camO.x + camDn.x * dist - eyePos.x;
    const py = camO.y + camDn.y * dist - eyePos.y;
    const pz = camO.z + camDn.z * dist - eyePos.z;
    // |P - eye - ((P-eye).d) d|
    const t = px * d.x + py * d.y + pz * d.z;
    return Math.hypot(px - t * d.x, py - t * d.y, pz - t * d.z);
  }

  it('the shot line passes through the crosshair point at every range', () => {
    for (const dist of [3, 10, 25, 60]) {
      expect(crosshairMiss(eye, dist)).toBeLessThan(1e-9);
    }
  });

  it('an eye ON the camera ray fires exactly the camera direction', () => {
    const onRay: Vec3Like = { x: camO.x, y: camO.y, z: camO.z };
    const d = convergedDir(onRay, camO, camDn, 20);
    expect(d.x).toBeCloseTo(camDn.x, 10);
    expect(d.y).toBeCloseTo(camDn.y, 10);
    expect(d.z).toBeCloseTo(camDn.z, 10);
  });

  it('parallel fire would miss by the eye offset; convergence error shrinks with range', () => {
    // angle between the converged dir and the camera dir (what a
    // parallel shot would use) — big up close, tiny far away
    const angleAt = (dist: number) => {
      const d = convergedDir(eye, camO, camDn, dist);
      return Math.acos(Math.min(1, Math.max(-1, d.x * camDn.x + d.y * camDn.y + d.z * camDn.z)));
    };
    expect(angleAt(3)).toBeGreaterThan(angleAt(10));
    expect(angleAt(10)).toBeGreaterThan(angleAt(60));
    expect(angleAt(60)).toBeLessThan(0.02); // ~1 degree at range
    expect(angleAt(3)).toBeGreaterThan(0.1); // parallel fire at 3 m is hopeless
  });

  it('degenerate convergence (eye at the target) falls back to the camera dir', () => {
    const atTarget: Vec3Like = { x: camO.x + camDn.x * 5, y: camO.y + camDn.y * 5, z: camO.z + camDn.z * 5 };
    const d = convergedDir(atTarget, camO, camDn, 5);
    expect(d).toEqual({ x: camDn.x, y: camDn.y, z: camDn.z });
  });
});

describe('rayGroundDistance (Item 6)', () => {
  const flat = () => 0;
  it('a level ray over flat ground never lands', () => {
    expect(rayGroundDistance({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: 1 }, flat, 45)).toBeNull();
  });
  it('a downward ray lands where it meets the ground', () => {
    // 45 degrees down from 1.7 m: true contact at ~2.4 m along the
    // ray; at the 2 m step the point is still at y ~ 0.29, so the
    // first step at/below ground is 4 (2 m step granularity)
    const d = rayGroundDistance({ x: 0, y: 1.7, z: 0 }, { x: 0, y: -0.7071, z: 0.7071 }, flat, 45);
    expect(d).toBe(4);
  });
  it('rising terrain shortens the flight', () => {
    const hill = (_x: number, z: number) => z * 0.2; // ground climbs along +z
    const d = rayGroundDistance({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: 1 }, hill, 45);
    expect(d).toBe(10); // y=1.7 meets ground 0.2*z at z ~ 8.5 -> first step past is 10
  });
});
