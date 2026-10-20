// Pure unit tests for the save migration path (no DOM / no IndexedDB).
import { describe, expect, it } from 'vitest';
import { migrate, type RawSaveRecord } from '../systems/save';
import type { SaveSnapshot } from '../store/types';

function v0Snapshot(): RawSaveRecord {
  // A v0 save: predates battery / phoneUnlocked / hotbar / equipped / seed.
  return {
    version: 0,
    slot: '1',
    savedAt: 1729000000000,
    difficulty: 'survivor',
    timeMinutes: 130,
    playSeconds: 3600,
    player: { pos: [-560, 2, 40], hp: 88 },
    inventory: [{ uid: 'a1', itemId: 'scrap', qty: 5 }],
    quests: [],
    doneQuests: [],
    flags: { met_jonah: true },
    rep: { lighthouse: 10 },
    world: { looted: ['c1'], deadHusks: [], cleared: [] },
  };
}

function fullV2Snapshot(): SaveSnapshot {
  return {
    version: 3,
    savedAt: 1729000100000,
    difficulty: 'story',
    seed: 42,
    timeMinutes: 200,
    playSeconds: 7200,
    player: { pos: [600, 10, 30], hp: 100 },
    inventory: [{ uid: 'b2', itemId: 'bandage', qty: 2 }],
    equipped: { melee: 'b2', ranged: null, pack: null },
    hotbar: ['b2', null, null],
    quests: [],
    doneQuests: ['q_prologue'],
    flags: { left_cal: true },
    rep: {},
    battery: 75,
    phoneUnlocked: true,
    world: { looted: [], deadHusks: ['h1'], cleared: [] },
    daysElapsed: 3,
    skills: {
      combat: { level: 2, xp: 40 },
      mechanics: { level: 0, xp: 0 },
      medicine: { level: 0, xp: 0 },
      stealth: { level: 0, xp: 0 },
      driver: { level: 1, xp: 5 },
      scavenging: { level: 0, xp: 0 },
      leadership: { level: 0, xp: 0 },
    },
    perkPoints: 1,
    perks: ['br_heavy'],
    survivors: [],
    base: { poiId: 'shore_camp', facilities: ['command_post'] },
    vehicles: [
      { defId: 'pickup', x: -550, y: 3, z: 20, heading: 1.2, fuel: 22, condition: 0.5 },
    ],
    trailers: [],
  };
}

describe('migrate()', () => {
  it('migrates a v0 snapshot to v3 with sane defaults', () => {
    const out = migrate(v0Snapshot());
    expect(out.version).toBe(3);
    expect(out.battery).toBe(100);
    expect(out.phoneUnlocked).toBe(false);
    expect(out.hotbar).toEqual([null, null, null]);
    expect(out.equipped).toEqual({ melee: null, ranged: null, pack: null });
    expect(out.seed).toBe(0);
    expect(out.trailers).toEqual([]);
  });

  it('preserves all existing v0 fields through migration', () => {
    const v0 = v0Snapshot();
    const out = migrate(v0);
    expect(out.savedAt).toBe(v0.savedAt);
    expect(out.difficulty).toBe(v0.difficulty);
    expect(out.timeMinutes).toBe(v0.timeMinutes);
    expect(out.playSeconds).toBe(v0.playSeconds);
    expect(out.player).toEqual(v0.player);
    expect(out.inventory).toEqual(v0.inventory);
    expect(out.flags).toEqual(v0.flags);
    expect(out.rep).toEqual(v0.rep);
    expect(out.world).toEqual(v0.world);
  });

  it('passes a current v3 snapshot through unchanged', () => {
    const v3 = fullV2Snapshot();
    const out = migrate({ ...v3, slot: '2' });
    expect(out).toEqual(v3);
    expect(out.battery).toBe(75);
    expect(out.hotbar).toEqual(['b2', null, null]);
    expect(out.vehicles[0].defId).toBe('pickup');
  });

  it('migrates a v2 snapshot to v3: trailers spawn fresh, vehicles gain v3 state', () => {
    const v3 = fullV2Snapshot();
    const { trailers: _t, ...rest } = v3;
    const v2: RawSaveRecord = { ...rest, version: 2, slot: '4' };
    const out = migrate(v2);
    expect(out.version).toBe(3);
    expect(out.trailers).toEqual([]);
    // the v2 vehicle entry gains storage / upgrades / flat defaults
    expect(out.vehicles[0].storage).toEqual([]);
    expect(out.vehicles[0].upgrades).toEqual([]);
    expect(out.vehicles[0].tiresFlat).toBe(0);
    // and everything it actually held survives
    expect(out.vehicles[0].fuel).toBe(22);
    expect(out.player).toEqual(v3.player);
  });

  it('migrates a v1 snapshot to v3 with fresh run-length state', () => {
    const v2 = fullV2Snapshot();
    const { daysElapsed: _d, skills: _s, perkPoints: _pp, perks: _p, survivors: _sv, base: _b, vehicles: _v, trailers: _t2, ...rest } = v2;
    const v1: RawSaveRecord = { ...rest, version: 1, slot: '3' };
    const out = migrate(v1);
    expect(out.version).toBe(3);
    expect(out.daysElapsed).toBe(0);
    expect(out.skills.combat).toEqual({ level: 0, xp: 0 });
    expect(out.skills.leadership).toEqual({ level: 0, xp: 0 });
    expect(out.perkPoints).toBe(0);
    expect(out.perks).toEqual([]);
    expect(out.survivors).toEqual([]);
    expect(out.base).toBeNull();
    expect(out.vehicles).toEqual([]);
    // everything the v1 save actually held survives
    expect(out.battery).toBe(75);
    expect(out.player).toEqual(v2.player);
  });

  it('strips the slot key field from the migrated snapshot', () => {
    const out = migrate(v0Snapshot());
    expect('slot' in out).toBe(false);
  });

  it('passes wave-3 fields (dispatches / journal / scouted / baseQueue) through unchanged', () => {
    const v3 = fullV2Snapshot();
    const withWave3 = {
      ...v3,
      dispatches: [{
        id: 'd1', survivorId: 'elena', vehicleDefId: 'pickup', trailerDefId: null,
        task: 'scavenge' as const, destPoiId: 'town', departMin: 500, etaMin: 900,
        distM: 640, status: 'out' as const,
      }],
      journal: [{ id: 'j1', atMin: 480, title: 'Day 1', lines: ['Washed ashore.'] }],
      scouted: { town: { poiId: 'town', atMin: 700, containers: 9, looted: 2 } },
      baseQueue: [{ facilityId: 'garden', readyMin: 1500 }],
      // and a grid-placed inventory stack rides along untouched
      inventory: [{ uid: 'g1', itemId: 'dmr', qty: 1, gx: 0, gy: 0, rot: false }],
    };
    const out = migrate({ ...withWave3, slot: '2' });
    expect(out).toEqual(withWave3);
  });

  it('leaves wave-3 fields absent on an older v3 save (store defaults them)', () => {
    const out = migrate({ ...fullV2Snapshot(), slot: '1' });
    expect(out.dispatches).toBeUndefined();
    expect(out.journal).toBeUndefined();
    expect(out.baseQueue).toBeUndefined();
  });

  it('passes the wave-4 appearance through unchanged, absent stays absent', () => {
    const appearance = { skinTone: 4, hairStyle: 'hawk' as const, hairColor: 3, build: 'heavy' as const };
    const out = migrate({ ...fullV2Snapshot(), appearance, slot: '3' });
    expect(out.appearance).toEqual(appearance);
    const older = migrate({ ...fullV2Snapshot(), slot: '1' });
    expect(older.appearance).toBeUndefined();
  });

  it('round-trips: v0 -> v3 -> migrate again is stable', () => {
    const once = migrate(v0Snapshot());
    const twice = migrate({ ...once, slot: '1' });
    expect(twice).toEqual(once);
  });

  it('throws on an unknown save version', () => {
    expect(() => migrate({ version: 99, slot: '1' })).toThrow(/unknown save version/);
  });
});
