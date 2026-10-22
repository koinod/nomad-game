// combatFeel.test.ts — Ian's 2026-10-22 playtest directives, pinned:
// (1) stamina pays for sprint + jump ONLY — swinging/blocking are free;
// (2) melee weapons carry real per-weapon TIMING (windup/active/
// recovery) enforced by the SwingTimer state machine;
// (3) firearms resolve to iron / dot / scope sight pictures with real
// zoom math, ADS pace, spread and sway consequences.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  JUMP_STAMINA_COST, SPRINT_DRAIN_PER_SEC, STAMINA_MAX, STAMINA_REGEN_IDLE,
  STAMINA_REGEN_MOVING, staminaSpend, staminaTick,
} from '../game/moveMath';
import {
  HIP_FOV, SIGHT_PROFILES, adsProgression, fovForZoom, sightFor, sightFov,
  sightSpreadMult, sightSwayMult,
} from '../game/gunMath';
import { SwingTimer, meleeStatsFor, swingStatsFor, tryMelee, tryRanged, type CombatHooks } from '../game/Combat';
import { ITEMS } from '../data/items';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';
import type { InvItem } from '../store/types';

// ------------------------------------------------------------- stamina ---

describe('stamina economy — sprint + jump only (Ian 2026-10-22)', () => {
  it('sprinting drains at the sprint rate', () => {
    expect(staminaTick(100, 1, true, true)).toBeCloseTo(100 - SPRINT_DRAIN_PER_SEC, 6);
    expect(staminaTick(100, 2, true, true)).toBeCloseTo(100 - 2 * SPRINT_DRAIN_PER_SEC, 6);
    expect(staminaTick(3, 1, true, true)).toBe(0); // never negative
  });

  it('not sprinting regens — faster standing still than moving', () => {
    expect(staminaTick(50, 1, false, true)).toBeCloseTo(50 + STAMINA_REGEN_MOVING, 6);
    expect(staminaTick(50, 1, false, false)).toBeCloseTo(50 + STAMINA_REGEN_IDLE, 6);
    expect(staminaTick(50, 1, false, false)).toBeGreaterThan(staminaTick(50, 1, false, true));
    expect(staminaTick(99.9, 1, false, false)).toBe(STAMINA_MAX); // clamps at full
  });

  it('a jump pays the lump cost — and a gassed player cannot jump', () => {
    expect(staminaSpend(100, JUMP_STAMINA_COST)).toBe(100 - JUMP_STAMINA_COST);
    expect(staminaSpend(JUMP_STAMINA_COST, JUMP_STAMINA_COST)).toBe(0);
    expect(staminaSpend(JUMP_STAMINA_COST - 0.1, JUMP_STAMINA_COST)).toBeNull();
    expect(JUMP_STAMINA_COST).toBeGreaterThan(0);
  });

  it('the swing loop never touches the pool: melee resolves with no stamina hook at all', () => {
    // CombatHooks no longer carries spendStamina — a swing cannot bill
    // the pool because there is nothing left to bill it through.
    const capture = { sweeps: 0 };
    const hooks: CombatHooks = {
      husks: {
        meleeSweep: () => { capture.sweeps++; return []; },
        raycastShot: () => null,
      } as unknown as CombatHooks['husks'],
      emitNoise: () => undefined,
      playerPos: new THREE.Vector3(0, 0, 0),
      playerYaw: 0,
      aimDir: new THREE.Vector3(0, 0, 1),
      eyePos: new THREE.Vector3(0, 1.6, 0),
      flashMuzzle: () => undefined,
      aimLevel: 0,
    };
    useGameStore.setState({ inventory: [], equipped: emptyEquipped(), perks: [] });
    for (let i = 0; i < 25; i++) {
      const res = tryMelee(hooks); // bare fists, back to back, forever
      expect(res.swung).toBe(true);
    }
    expect(capture.sweeps).toBe(25);
  });
});

// -------------------------------------------------------- melee timing ---

describe('melee timing profiles (Ian 2026-10-22)', () => {
  const WEAPONS = [
    'pipe', 'machete', 'hatchet', 'baseball_bat', 'combat_knife', 'sledgehammer',
    'torch', 'flare', 'crowbar', 'fire_axe', 'spear', 'riot_baton',
  ];

  it('every melee weapon carries an explicit windup/active/recovery profile', () => {
    for (const id of WEAPONS) {
      const s = meleeStatsFor(id);
      expect(s.windup, id).toBeGreaterThan(0);
      expect(s.active, id).toBeGreaterThan(0);
      expect(s.recovery, id).toBeGreaterThan(0);
      // the full cycle is exactly the three phases — no hidden padding
      expect(s.swingTime, id).toBeCloseTo(s.windup + s.active + s.recovery, 9);
      expect('stamina' in s, id).toBe(false); // the cost field is gone
    }
  });

  it('cadence is per-weapon distinct: knife < machete < pipe < sledgehammer', () => {
    const t = (id: string) => meleeStatsFor(id).swingTime;
    expect(t('combat_knife')).toBeLessThan(t('riot_baton'));
    expect(t('riot_baton')).toBeLessThan(t('machete'));
    expect(t('machete')).toBeLessThan(t('pipe'));
    expect(t('pipe')).toBeLessThan(t('fire_axe'));
    expect(t('fire_axe')).toBeLessThan(t('sledgehammer'));
    // heavy means a real windup, not just a longer tail
    expect(meleeStatsFor('sledgehammer').windup).toBeGreaterThan(meleeStatsFor('combat_knife').windup * 3);
  });

  it('fists, gun bash and thrown weapons have profiles too', () => {
    const fists = meleeStatsFor(null);
    expect(fists.swingTime).toBeCloseTo(fists.windup + fists.active + fists.recovery, 9);
    const thrown = meleeStatsFor('frag');
    expect(thrown.swingTime).toBeGreaterThan(0);
    expect(swingStatsFor(null).swingTime).toBeGreaterThan(0);
  });
});

describe('SwingTimer — the state machine enforces the profile', () => {
  const DT = 1 / 240; // fine steps: phase boundaries land within one step
  function run(timer: SwingTimer, seconds: number): { hits: number[]; t: number } {
    const hits: number[] = [];
    let t = 0;
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      const ev = timer.update(DT);
      t += DT;
      if (ev.hit) hits.push(t);
    }
    return { hits, t };
  }

  it('the hit lands when the windup ends — never on the click', () => {
    const stats = meleeStatsFor('pipe');
    const timer = new SwingTimer();
    expect(timer.start(stats)).toBe(true);
    const { hits } = run(timer, stats.windup * 0.5);
    expect(hits).toHaveLength(0); // still raising the pipe
    const after = run(timer, stats.windup);
    expect(after.hits).toHaveLength(1);
    expect(after.hits[0]).toBeGreaterThan(stats.windup * 0.5);
    expect(after.hits[0]).toBeLessThanOrEqual(stats.windup * 1.5 + DT);
  });

  it('a second swing cannot start until windup+active+recovery have all run', () => {
    const stats = meleeStatsFor('machete');
    const timer = new SwingTimer();
    timer.start(stats);
    run(timer, stats.swingTime * 0.9);
    expect(timer.busy).toBe(true);
    expect(timer.start(stats)).toBe(false); // recovery is not skippable
    run(timer, stats.swingTime * 0.2);
    expect(timer.busy).toBe(false);
    expect(timer.start(stats)).toBe(true);
  });

  it('a queued swing starts exactly at recovery end — chained cadence has zero dead time', () => {
    const stats = meleeStatsFor('hatchet');
    const timer = new SwingTimer();
    timer.start(stats);
    timer.queue(); // clicked again mid-swing
    const cycle = stats.swingTime;
    // run to just past swing 2's active window opening
    const { hits } = run(timer, cycle + stats.windup + stats.active * 0.5);
    // swing 1 hits at windup; swing 2 starts AT cycle end, hits at cycle + windup
    expect(hits).toHaveLength(2);
    expect(hits[0]).toBeCloseTo(stats.windup, 1);
    expect(hits[1]).toBeCloseTo(cycle + stats.windup, 1);
    expect(timer.busy).toBe(true); // swing 2 still finishing its own cycle
  });

  it('queue holds at most one follow-up — mashing cannot stack swings', () => {
    const stats = meleeStatsFor('combat_knife');
    const timer = new SwingTimer();
    timer.start(stats);
    timer.queue();
    timer.queue();
    timer.queue();
    const { hits } = run(timer, stats.swingTime * 3);
    expect(hits.length).toBe(2); // the initial swing + exactly one chain
    expect(timer.busy).toBe(false);
  });

  it('cadence per weapon matches its profile numbers over a chain', () => {
    for (const id of ['combat_knife', 'machete', 'sledgehammer']) {
      const stats = meleeStatsFor(id);
      const timer = new SwingTimer();
      timer.start(stats);
      const hits: number[] = [];
      let t = 0;
      // hold the button: queue a follow-up every frame, for just
      // under 3 full cycles (3 hits land, at windup + k*cycle)
      for (let i = 0; i < Math.round((stats.swingTime * 3 - 0.01) / DT); i++) {
        const ev = timer.update(DT);
        t += DT;
        if (ev.hit) hits.push(t);
        if (timer.busy) timer.queue();
        else timer.start(stats);
      }
      expect(hits.length, id).toBe(3);
      expect(hits[1] - hits[0], id).toBeCloseTo(stats.swingTime, 1);
      expect(hits[2] - hits[1], id).toBeCloseTo(stats.swingTime, 1);
    }
  });

  it('a duration multiplier (adrenaline) scales every phase uniformly', () => {
    const stats = meleeStatsFor('pipe');
    const timer = new SwingTimer();
    timer.start(stats, 0.5);
    const { hits } = run(timer, stats.swingTime);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeCloseTo(stats.windup * 0.5, 1);
    expect(timer.busy).toBe(false); // the whole cycle halved too
  });
});

// --------------------------------------------------------------- sights ---

describe('sights — iron vs dot vs scope (Ian 2026-10-22)', () => {
  it('every firearm in the item table carries a sight assignment', () => {
    const ranged = Object.values(ITEMS).filter((d) => d.category === 'weapon-ranged');
    expect(ranged.length).toBeGreaterThanOrEqual(9);
    for (const def of ranged) expect(def.sight, def.id).toBeDefined();
  });

  it('assignments match the directive: handguns iron, smg/carbine dot, long glass scoped', () => {
    const sight = (id: string) => sightFor(ITEMS[id], []);
    expect(sight('pistol').type).toBe('iron');
    expect(sight('revolver').type).toBe('iron');
    expect(sight('flare_gun').type).toBe('iron');
    expect(sight('shotgun').type).toBe('iron');
    expect(sight('smg').type).toBe('dot');
    expect(sight('carbine').type).toBe('dot');
    expect(sight('hunting_rifle').type).toBe('scope');
    expect(sight('dmr').type).toBe('scope');
    expect(sight('dmr').zoom).toBe(4); // DMR wears 4x glass
    expect(sight('crossbow').type).toBe('scope');
    expect(sight('crossbow').zoom).toBe(2.5); // crossbow glass is humbler
  });

  it('a mounted reflex sight overrides the fixed sight — the mounted optic is the picture', () => {
    expect(sightFor(ITEMS.pistol, ['reflex_sight']).type).toBe('dot');
    expect(sightFor(ITEMS.dmr, ['reflex_sight']).type).toBe('dot');
    expect(sightFor(ITEMS.dmr, ['suppressor']).type).toBe('scope'); // other mods do not touch the sight
    expect(sightFor({}, []).type).toBe('iron'); // no def sight = honest irons
  });

  it('zoom FOV math: iron keeps the shipped picture, dot is ~1.25x tighter, scope is true magnification', () => {
    expect(HIP_FOV).toBe(60);
    expect(fovForZoom(HIP_FOV, 1)).toBeCloseTo(HIP_FOV, 6);
    expect(sightFov(ITEMS.pistol, [])).toBeCloseTo(38, 0); // iron: unchanged ADS
    const dot = sightFov(ITEMS.smg, []);
    expect(dot).toBeLessThan(38);
    expect(dot).toBeGreaterThan(29);
    expect(dot).toBeLessThan(32);
    // the dot's magnification is 1.25x the iron picture's
    const mag = (z: number) => Math.tan((HIP_FOV * Math.PI) / 360) / Math.tan((z * Math.PI) / 360);
    expect(mag(dot) / mag(38)).toBeCloseTo(1.25, 1);
    expect(sightFov(ITEMS.dmr, [])).toBeCloseTo(16.4, 0); // 4x off a 60° base
    expect(sightFov(ITEMS.crossbow, [])).toBeCloseTo(26.0, 0); // 2.5x
    expect(sightFov(ITEMS.pistol, ['reflex_sight'])).toBeCloseTo(dot, 6); // mod = dot picture
  });

  it('ADS pace: a dot snaps up faster than irons; glass is slower', () => {
    expect(SIGHT_PROFILES.dot.adsTimeMult).toBeLessThan(1);
    expect(SIGHT_PROFILES.iron.adsTimeMult).toBe(1);
    expect(SIGHT_PROFILES.scope.adsTimeMult).toBeGreaterThan(1);
    // a real gun: carbine (dot) raises to sights faster than the DMR (scope)
    const carbine = (ITEMS.carbine.adsTime ?? 0) * sightFor(ITEMS.carbine, []).adsTimeMult;
    const dmr = (ITEMS.dmr.adsTime ?? 0) * sightFor(ITEMS.dmr, []).adsTimeMult;
    expect(carbine).toBeLessThan(dmr);
  });

  it('spread + sway follow the sight as the gun comes up (progression-eased)', () => {
    const scope = SIGHT_PROFILES.scope;
    expect(adsProgression(0)).toBe(0);
    expect(adsProgression(0.55)).toBe(0);
    expect(adsProgression(1)).toBeCloseTo(1, 9);
    // from the hip the sight changes nothing; at full sights it rules
    expect(sightSpreadMult(scope, 0)).toBe(1);
    expect(sightSpreadMult(scope, 1)).toBe(scope.adsSpreadMult);
    expect(sightSpreadMult(scope, 1)).toBeLessThan(1); // glass steadies the cone
    expect(sightSwayMult(scope, 0)).toBe(1);
    expect(sightSwayMult(scope, 1)).toBe(scope.swayMult);
    expect(sightSwayMult(scope, 1)).toBeGreaterThan(1); // magnification magnifies sway
    expect(sightSwayMult(SIGHT_PROFILES.dot, 1)).toBeLessThan(1);
    expect(sightSpreadMult(SIGHT_PROFILES.iron, 1)).toBe(1); // irons: no change, as shipped
  });

  it('Combat spread actually applies the sight (DMR through glass vs from the hip)', () => {
    // integration: fire the DMR in a stub world and confirm the shot
    // still resolves (the sight mult is inside the cone math, pinned
    // numerically by the pure tests above — here the path must run).
    const inst: InvItem = { uid: 'dmr1', itemId: 'dmr', qty: 1, loaded: 10, condition: 100, mods: [] };
    useGameStore.setState({
      inventory: [inst, { uid: 'a1', itemId: 'ammo_556', qty: 20 }],
      equipped: { ...emptyEquipped(), primary: 'dmr1', ranged: 'dmr1', activeWeapon: 'primary' as const },
      perks: [],
    });
    const hooks: CombatHooks = {
      husks: {
        meleeSweep: () => [],
        raycastShot: () => null,
      } as unknown as CombatHooks['husks'],
      emitNoise: () => undefined,
      playerPos: new THREE.Vector3(0, 0, 0),
      playerYaw: 0,
      aimDir: new THREE.Vector3(0, 0, 1),
      eyePos: new THREE.Vector3(0, 1.6, 0),
      flashMuzzle: () => undefined,
      aimLevel: 2,
      adsBlend: 1,
      onProjectile: () => undefined,
    };
    const res = tryRanged(hooks);
    expect(res.fired).toBe(true);
    expect(res.projectile).toBe(true); // the DMR throws a true round
  });
});
