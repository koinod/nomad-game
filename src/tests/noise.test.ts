// Lane 11 (3): the noise-class table, completed and pinned.
// The table is the stealth contract: 11 classes, one radius each, and
// the §0.1 ruling that an unsuppressed gunshot is 80m (the old 60m
// figure was a bug). The suppressor is verified END TO END — a real
// tryRanged through Combat with a mocked world — not just as data.
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../systems/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../systems/audio')>();
  return {
    ...actual,
    // silence the one-shots; everything else (gunClassForItem, the
    // store's setMuted/setVolume init calls) stays real
    sfx: { ...actual.sfx, play: () => undefined, gunshot: () => undefined },
  };
});

import { tryMelee, tryRanged, type CombatHooks } from '../game/Combat';
import {
  NOISE_CLASSES, gunshotRadius, meterLevel, noiseClassRadius,
} from '../game/noise';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';
import type { InvItem } from '../store/types';

describe('the 11-class table', () => {
  it('has exactly the 11 canonical classes', () => {
    expect(Object.keys(NOISE_CLASSES).sort()).toEqual([
      'alarm', 'crouch_step', 'explosion', 'forced_entry', 'gunshot',
      'melee_swing', 'sprint_step', 'vehicle_crash', 'vehicle_drive',
      'vehicle_idle', 'walk_step',
    ]);
  });

  it('carries the ruled radii (ROADMAP W3 / SPEC §0.1 / §4.4 / GAP)', () => {
    expect(noiseClassRadius('crouch_step')).toBe(2);
    expect(noiseClassRadius('sprint_step')).toBe(14);
    expect(noiseClassRadius('gunshot')).toBe(80); // §0.1: 80m wins, 60m was the bug
    expect(noiseClassRadius('forced_entry')).toBe(45);
    expect(noiseClassRadius('alarm')).toBe(60);
    expect(noiseClassRadius('vehicle_idle')).toBe(30);
    expect(noiseClassRadius('vehicle_crash')).toBe(150);
    expect(noiseClassRadius('explosion')).toBe(200);
    // shipped-emitter values (code wins where the docs never ruled)
    expect(noiseClassRadius('walk_step')).toBe(6);
    expect(noiseClassRadius('melee_swing')).toBe(8);
    expect(noiseClassRadius('vehicle_drive')).toBe(55);
  });

  it('every class radius is positive and sane', () => {
    for (const c of Object.values(NOISE_CLASSES)) {
      expect(c.radius).toBeGreaterThan(0);
      expect(c.radius).toBeLessThanOrEqual(200);
      expect(c.id).toBeTruthy();
      expect(c.label.length).toBeGreaterThan(2);
    }
  });
});

describe('gunshot radius math', () => {
  it('defaults to the 80m class when the weapon def is silent', () => {
    expect(gunshotRadius(undefined, [])).toBe(80);
  });

  it('honors per-weapon noiseRadius overrides (crossbow whispers)', () => {
    expect(gunshotRadius(12, [])).toBe(12);
    expect(gunshotRadius(45, [])).toBe(45);
  });

  it('suppressor: 80m × 0.31 ≈ 25m — the spec’s worked example', () => {
    expect(gunshotRadius(80, ['suppressor'])).toBeCloseTo(24.8, 6);
    expect(gunshotRadius(undefined, ['suppressor'])).toBeCloseTo(24.8, 6);
  });

  it('unrelated mods never touch the radius', () => {
    expect(gunshotRadius(80, ['reflex_sight', 'extended_mag', 'foregrip'])).toBe(80);
  });
});

describe('HUD meter calibration', () => {
  it('a gunshot pegs the meter; quieter classes read proportionally', () => {
    expect(meterLevel(80)).toBe(100);
    expect(meterLevel(40)).toBe(50);
    expect(meterLevel(2)).toBeCloseTo(2.5, 6);
    expect(meterLevel(200)).toBe(100); // explosions clamp, not overflow
    expect(meterLevel(0)).toBe(0);
  });
});

// ------------------------------------------------------- end to end ---
// A pistol (no noiseRadius on its def → the class default rules) fired
// through the real Combat path. The ONLY thing that changes between the
// two shots is the suppressor on the instance — and the emitted radius
// must move by exactly the suppressor multiplier.

function hooks(capture: { radius: number }): CombatHooks {
  return {
    husks: {
      meleeSweep: () => [],
      raycastShot: () => null,
    } as unknown as CombatHooks['husks'],
    emitNoise: (_x, _z, r) => { capture.radius = r; },
    playerPos: new THREE.Vector3(0, 0, 0),
    playerYaw: 0,
    aimDir: new THREE.Vector3(0, 0, 1),
    eyePos: new THREE.Vector3(0, 1.6, 0),
    flashMuzzle: () => undefined,
    aimLevel: 0,
  };
}

function equipPistol(mods: string[]): void {
  const inst: InvItem = {
    uid: 'gun1', itemId: 'pistol', qty: 1, loaded: 12, condition: 100, mods,
  };
  useGameStore.setState({
    inventory: [inst],
    equipped: { ...emptyEquipped(), primary: 'gun1', ranged: 'gun1', activeWeapon: 'primary' as const },
    perks: [],
  });
}

describe('Combat emits by the table (integration)', () => {
  beforeEach(() => {
    useGameStore.setState({ inventory: [], equipped: emptyEquipped(), perks: [] });
  });

  it('an unsuppressed pistol shot emits the 80m class radius', () => {
    equipPistol([]);
    const capture = { radius: -1 };
    const res = tryRanged(hooks(capture));
    expect(res.fired).toBe(true);
    expect(capture.radius).toBe(80);
  });

  it('the same pistol, suppressed, emits ≈24.8m — not a cosmetic mult', () => {
    equipPistol(['suppressor']);
    const capture = { radius: -1 };
    const res = tryRanged(hooks(capture));
    expect(res.fired).toBe(true);
    expect(capture.radius).toBeCloseTo(24.8, 6);
  });

  it('a melee swing emits the melee_swing class', () => {
    const capture = { radius: -1 };
    const res = tryMelee(hooks(capture));
    expect(res.swung).toBe(true);
    expect(capture.radius).toBe(noiseClassRadius('melee_swing'));
  });
});
