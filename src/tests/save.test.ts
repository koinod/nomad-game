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

function fullV1Snapshot(): SaveSnapshot {
  return {
    version: 1,
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
  };
}

describe('migrate()', () => {
  it('migrates a v0 snapshot to v1 with sane defaults', () => {
    const out = migrate(v0Snapshot());
    expect(out.version).toBe(1);
    expect(out.battery).toBe(100);
    expect(out.phoneUnlocked).toBe(false);
    expect(out.hotbar).toEqual([null, null, null]);
    expect(out.equipped).toEqual({ melee: null, ranged: null, pack: null });
    expect(out.seed).toBe(0);
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

  it('passes a current v1 snapshot through unchanged', () => {
    const v1 = fullV1Snapshot();
    const out = migrate({ ...v1, slot: '2' });
    expect(out).toEqual(v1);
    expect(out.battery).toBe(75);
    expect(out.hotbar).toEqual(['b2', null, null]);
  });

  it('strips the slot key field from the migrated snapshot', () => {
    const out = migrate(v0Snapshot());
    expect('slot' in out).toBe(false);
  });

  it('round-trips: v0 -> v1 -> migrate again is stable', () => {
    const once = migrate(v0Snapshot());
    const twice = migrate({ ...once, slot: '1' });
    expect(twice).toEqual(once);
  });

  it('throws on an unknown save version', () => {
    expect(() => migrate({ version: 99, slot: '1' })).toThrow(/unknown save version/);
  });
});
