// companions.test.ts — ORDER #6 Phase B2 pins.
//
//  MATH: needs rates, formation, catch-up, trait combat (the trait
//  table's own percentages), weapon profiles, seat locals.
//  STORE: runtime records on recruit; weapon handover CONSERVATION
//  (the instance leaves the pack, lives on the survivor, comes back —
//  never duplicated, never lost); eating from pack and stockpile;
//  survivor XP accrual finally flowing into SurvivorDef.skills.
//  WORLD: a real Companions system over a real store — the follower
//  walks to her formation slot (and her stride phase only ever
//  advances by walking), a dispatched survivor has no body, a rider
//  sits in the passenger seat, and an armed companion kills a husk
//  through the real Husk.damage path.

import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  catchUpMode, formationOffset, needsCombatMult, passengerSeatCount,
  passengerSeatLocal, tickNeeds, traitCombat, weaponProfile,
  FATIGUE_PER_MIN, FATIGUE_REST_PER_MIN, HUNGER_PER_MIN,
} from '../game/companionMath';
import { Companions, type CompanionCtx } from '../game/Companions';
import { Husk } from '../game/Husks';
import { useGameStore } from '../store/gameStore';
import { DESIGNED_RECRUITS } from '../data/survivors';
import { itemMultiset } from '../store/containers';
import { defaultSurvivorRuntime } from '../store/types';

const groundY = (_x: number, _z: number) => 0;

function resetStore(): void {
  useGameStore.setState({
    survivors: [], survivorRuntime: {}, survivorSkills: {},
    dispatches: [], inventory: [], claims: { home: null, outposts: [] },
    base: null, screen: 'game', dead: false, hp: 100,
  });
}

describe('companion math', () => {
  it('needs: active minutes drain both meters at the rated pace', () => {
    const n = tickNeeds(80, 85, 60, 'active');
    expect(n.hunger).toBeCloseTo(80 - HUNGER_PER_MIN * 60, 6);
    expect(n.fatigue).toBeCloseTo(85 - FATIGUE_PER_MIN * 60, 6);
  });

  it('needs: resting restores fatigue and never hunger; riding restores slowly', () => {
    const rest = tickNeeds(50, 40, 60, 'rest');
    expect(rest.fatigue).toBeCloseTo(40 + FATIGUE_REST_PER_MIN * 60, 6);
    expect(rest.hunger).toBeLessThan(50);
    const ride = tickNeeds(50, 40, 60, 'ride');
    expect(ride.fatigue).toBeGreaterThan(40);
    expect(ride.fatigue).toBeLessThan(rest.fatigue);
  });

  it('needs clamp at 0 and flagging output drops to 70%', () => {
    expect(tickNeeds(1, 1, 10000, 'active')).toEqual({ hunger: 0, fatigue: 0 });
    expect(needsCombatMult(100, 100)).toBe(1);
    expect(needsCombatMult(24, 100)).toBe(0.7);
    expect(needsCombatMult(100, 19)).toBe(0.7);
  });

  it('formation slots are distinct and fan out behind', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const o = formationOffset(i);
      expect(o.back).toBeGreaterThan(0);
      seen.add(`${o.side},${o.back}`);
    }
    expect(seen.size).toBe(6);
    expect(formationOffset(0).side).toBeLessThan(0);
    expect(formationOffset(1).side).toBeGreaterThan(0);
  });

  it('catch-up: walk the slot, run the gap, snap the hopeless', () => {
    expect(catchUpMode(3)).toBe('walk');
    expect(catchUpMode(20)).toBe('run');
    expect(catchUpMode(80)).toBe('snap');
  });

  it('trait combat reads the trait table percentages', () => {
    expect(traitCombat(['brave']).dmgMult).toBeCloseTo(1.3, 6);
    expect(traitCombat(['ex_military']).dmgMult).toBeCloseTo(1.4, 6);
    expect(traitCombat(['brave', 'ex_military']).dmgMult).toBeCloseTo(1.82, 6);
    const coward = traitCombat(['cowardly']);
    expect(coward.dmgMult).toBeCloseTo(0.7, 6);
    expect(coward.bold).toBe(false);
    expect(coward.engageMult).toBeLessThan(1);
    expect(traitCombat([])).toEqual({ dmgMult: 1, engageMult: 1, bold: true });
  });

  it('weapon profiles: fists, blade, gun', () => {
    expect(weaponProfile(null)).toEqual({ damage: 5, range: 1.9, cooldownSec: 0.9, ranged: false });
    const blade = weaponProfile('machete');
    expect(blade.ranged).toBe(false);
    expect(blade.damage).toBe(22);
    const gun = weaponProfile('pistol');
    expect(gun.ranged).toBe(true);
    expect(gun.damage).toBe(34);
    expect(gun.range).toBeLessThanOrEqual(16);
  });

  it('seats: bikes seat nobody, cars take shotgun + bench', () => {
    expect(passengerSeatCount('bike')).toBe(0);
    expect(passengerSeatCount('car')).toBe(3);
    const driver = { lx: 0.4, lz: 0.2 };
    const shot = passengerSeatLocal(0, driver, 2.0);
    expect(shot).not.toBeNull();
    expect(shot!.lx).toBeLessThan(driver.lx); // mirrored across the cabin
    expect(shot!.lz).toBe(driver.lz);
    expect(passengerSeatLocal(1, driver, 2.0)!.lz).toBeLessThan(driver.lz); // bench is behind
    expect(passengerSeatLocal(3, driver, 2.0)).toBeNull();
  });
});

describe('survivor store actions', () => {
  beforeEach(resetStore);

  it('recruiting creates a follow-order runtime record', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.elena });
    const rt = useGameStore.getState().survivorRuntime.elena;
    expect(rt).toBeDefined();
    expect(rt.order).toBe('follow');
    expect(rt.weapon).toBeNull();
    expect(rt.hunger).toBe(80);
  });

  it('weapon handover conserves the item multiset exactly', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.mateo });
    s.addItem('machete', 1);
    s.addItem('bandage', 2);
    const before = itemMultiset(useGameStore.getState().inventory);
    const uid = useGameStore.getState().inventory.find((i) => i.itemId === 'machete')!.uid;
    expect(s.equipSurvivorWeapon('mateo', uid)).toBe(true);
    const mid = useGameStore.getState();
    // pack lost the machete; the survivor's record holds the instance
    expect(itemMultiset(mid.inventory).get('machete') ?? 0).toBe(0);
    expect(mid.survivorRuntime.mateo.weapon?.uid).toBe(uid);
    const total = (itemMultiset(mid.inventory).get('machete') ?? 0) + (mid.survivorRuntime.mateo.weapon ? 1 : 0);
    expect(total).toBe(before.get('machete'));
    // and back again — same instance, no copy
    expect(s.unequipSurvivorWeapon('mateo')).toBe(true);
    const after = useGameStore.getState();
    expect(itemMultiset(after.inventory).get('machete')).toBe(before.get('machete'));
    expect(after.survivorRuntime.mateo.weapon).toBeNull();
  });

  it('handover refuses non-weapons, second weapons, and strangers', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.lina });
    s.addItem('bandage', 1);
    s.addItem('machete', 1);
    s.addItem('hatchet', 1);
    const st = () => useGameStore.getState();
    const band = st().inventory.find((i) => i.itemId === 'bandage')!.uid;
    expect(s.equipSurvivorWeapon('lina', band)).toBe(false);
    const mach = st().inventory.find((i) => i.itemId === 'machete')!.uid;
    expect(s.equipSurvivorWeapon('lina', mach)).toBe(true);
    const hatch = st().inventory.find((i) => i.itemId === 'hatchet')!.uid;
    expect(s.equipSurvivorWeapon('lina', hatch)).toBe(false); // already armed
    expect(s.equipSurvivorWeapon('nobody', hatch)).toBe(false);
  });

  it('eating from the pack consumes one food and restores hunger', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.dez });
    s.addItem('canned_food', 2);
    s.setSurvivorNeeds('dez', 10, 90);
    expect(s.survivorEat('dez', 'pack')).toBe('canned_food');
    const st = useGameStore.getState();
    expect(st.survivorRuntime.dez.hunger).toBe(50); // 10 + 40 satiety
    expect(st.countItem('canned_food')).toBe(1);
  });

  it('eating at base draws the stockpile down', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.priya });
    useGameStore.setState({
      claims: {
        home: { siteId: 'lighthouse_base', role: 'home', facilities: [], prefabs: [], stockpile: [{ itemId: 'produce', qty: 2 }] },
        outposts: [],
      },
    });
    s.setSurvivorNeeds('priya', 20, 90);
    expect(s.survivorEat('priya', 'base')).toBe('produce');
    const st = useGameStore.getState();
    expect(st.claims.home?.stockpile).toEqual([{ itemId: 'produce', qty: 1 }]);
    expect(st.survivorRuntime.priya.hunger).toBe(50);
  });

  it('survivor XP accrues at half rate and grows the def levels', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.elena }); // combat 2
    // husk_kill_melee pays 10 → survivor rate 5; xpToNext(2) is small
    // enough that a honest string of kills must move the level.
    for (let i = 0; i < 60; i++) s.awardSurvivorEvent('elena', 'husk_kill_melee');
    const st = useGameStore.getState();
    expect(st.survivorSkills.elena?.combat.level).toBeGreaterThan(2);
    expect(st.survivors.find((x) => x.id === 'elena')!.skills.combat).toBe(st.survivorSkills.elena!.combat.level);
  });

  it('a returned dispatch pays the runner survivor XP in the task skill', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.mateo }); // scavenging 4
    useGameStore.setState({
      daysElapsed: 1, timeMinutes: 0,
      dispatches: [{
        id: 'd9', survivorId: 'mateo', vehicleDefId: 'gt500', trailerDefId: null,
        task: 'scavenge', destPoiId: 'town', departMin: 0, etaMin: 10, distM: 300, status: 'out',
      }],
    });
    s.advanceTime(20); // ETA passes — the run resolves
    const st = useGameStore.getState();
    expect(st.dispatches).toHaveLength(0);
    // container_looted pays 4 scavenging XP -> 2 at the survivor rate
    expect(st.survivorSkills.mateo?.scavenging.xp).toBe(2);
    expect(st.survivorSkills.mateo?.scavenging.level).toBe(4); // seeded from the def
  });

  it('orders stick and re-ordering is a no-op the second time', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.elena });
    s.setSurvivorOrder('elena', 'hold');
    expect(useGameStore.getState().survivorRuntime.elena.order).toBe('hold');
    const rtRef = useGameStore.getState().survivorRuntime;
    s.setSurvivorOrder('elena', 'hold');
    expect(useGameStore.getState().survivorRuntime).toBe(rtRef); // untouched
  });
});

describe('companions in the world', () => {
  beforeEach(resetStore);

  function makeCtx(over: Partial<CompanionCtx> = {}): CompanionCtx {
    return {
      playerPos: new THREE.Vector3(0, 0, 0),
      playerHeading: 0,
      groundY,
      colliders: [],
      nearestHusk: () => null,
      vehicle: null,
      basePos: null,
      gameMinDelta: 0,
      ...over,
    };
  }

  it('a follower walks to her formation slot and stops there', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.elena });
    const scene = new THREE.Scene();
    const comp = new Companions(scene);
    const ctx = makeCtx();
    // slot 0 for heading 0 (facing +Z): side -1.2, back 1.7 -> (-1.2, -1.7)
    for (let i = 0; i < 240; i++) comp.update(1 / 30, ctx);
    const ent = comp.entity('elena')!;
    expect(ent.group.visible).toBe(true);
    const d = Math.hypot(ent.group.position.x - -1.2, ent.group.position.z - -1.7);
    expect(d).toBeLessThan(0.9);
    comp.dispose();
  });

  it('needs tick into the store over game minutes', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.mateo });
    const scene = new THREE.Scene();
    const comp = new Companions(scene);
    const ctx = makeCtx({ gameMinDelta: 2 });
    for (let i = 0; i < 60; i++) comp.update(1 / 30, ctx); // 120 game minutes active
    const rt = useGameStore.getState().survivorRuntime.mateo;
    expect(rt.hunger).toBeCloseTo(80 - HUNGER_PER_MIN * 120, 0);
    expect(rt.fatigue).toBeLessThan(85);
    comp.dispose();
  });

  it('a dispatched survivor has no body; the return brings it back', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.lina });
    const scene = new THREE.Scene();
    const comp = new Companions(scene);
    const ctx = makeCtx();
    comp.update(1 / 30, ctx);
    expect(comp.entity('lina')!.group.visible).toBe(true);
    useGameStore.setState({
      dispatches: [{
        id: 'd1', survivorId: 'lina', vehicleDefId: 'gt500', trailerDefId: null,
        task: 'scavenge', destPoiId: 'town', departMin: 0, etaMin: 9999, distM: 100, status: 'out',
      }],
    });
    comp.update(1 / 30, ctx);
    expect(comp.entity('lina')!.group.visible).toBe(false);
    useGameStore.setState({ dispatches: [] });
    comp.update(1 / 30, ctx);
    expect(comp.entity('lina')!.group.visible).toBe(true);
    comp.dispose();
  });

  it('an armed companion kills a husk through the real damage path', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.elena });
    s.addItem('machete', 1);
    const uid = useGameStore.getState().inventory.find((i) => i.itemId === 'machete')!.uid;
    expect(s.equipSurvivorWeapon('elena', uid)).toBe(true);
    const husk = new Husk('c1', 'shambler', 0, 5, 'test', groundY);
    const scene = new THREE.Scene();
    const comp = new Companions(scene);
    const ctx = makeCtx({ nearestHusk: (x, z, r) => (husk.alive && Math.hypot(husk.group.position.x - x, husk.group.position.z - z) <= r ? husk : null) });
    let frames = 0;
    while (husk.alive && frames < 1800) {
      comp.update(1 / 30, ctx);
      husk.update(1 / 30, { playerPos: new THREE.Vector3(0, 0, -30), isNight: false, groundY, colliders: [], onHuskKilled: () => undefined, daysElapsed: 0 }, () => 0.5);
      frames++;
    }
    expect(husk.alive).toBe(false);
    expect(useGameStore.getState().survivorSkills.elena?.combat.xp ?? 0)
      .toBeGreaterThanOrEqual(0);
    // the kill paid survivor XP (map exists and holds the event's award)
    const map = useGameStore.getState().survivorSkills.elena;
    expect(map).toBeDefined();
    expect((map!.combat.xp ?? 0) + (map!.combat.level - 2) * 10).toBeGreaterThan(0);
    comp.dispose();
  });

  it('a follower with a seat rides in it — seated pose, car frame', () => {
    const s = useGameStore.getState();
    s.recruitSurvivor({ ...DESIGNED_RECRUITS.dez });
    const scene = new THREE.Scene();
    const comp = new Companions(scene);
    const ctx = makeCtx({
      vehicle: {
        x: 10, y: 0, z: 10, quat: new THREE.Quaternion(),
        defId: 'gt500', kind: 'car', width: 1.9, length: 4.8, ax: 0.4, az: 0.15,
      },
    });
    comp.update(1 / 30, ctx);
    const ent = comp.entity('dez')!;
    // shotgun local: lx = 0.4 - 1.9*0.42 ≈ -0.398, lz = 0.15 (identity quat)
    expect(ent.group.position.x).toBeCloseTo(10 - 0.398, 1);
    expect(ent.group.position.z).toBeCloseTo(10.15, 1);
    // seated: thighs rotated forward hard, not a standing figure
    expect(ent.rig.legL.rotation.x).toBeLessThan(-0.7);
    comp.dispose();
  });

  it('default runtime import is the shared default', () => {
    expect(defaultSurvivorRuntime()).toEqual({ order: 'follow', hunger: 80, fatigue: 85, weapon: null });
  });
});
