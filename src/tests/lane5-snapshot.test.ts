// Lane 5 snapshot round-trip: store state -> SaveSnapshot -> store state,
// with the IndexedDB layer mocked out (the real save.ts migration path is
// covered by lane5-contract.test.ts and save.test.ts). Proves saveToSlot
// writes the field-contract fields — harvesting Lane 7's live jobs
// through craftQueueBridge when registered — and loadFromSlot restores
// them (and rehydrates the bridge sink), defaulting cleanly when an
// older snapshot lacks them.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CraftJob, SaveSnapshot } from '../store/types';

const captured = vi.hoisted(() => ({
  saved: null as { slot: string; snap: SaveSnapshot } | null,
  loadResult: null as SaveSnapshot | null,
}));

vi.mock('../systems/save', () => ({
  saveGameToSlot: async (slot: string, snap: SaveSnapshot) => {
    captured.saved = { slot, snap };
  },
  loadGameFromSlot: async () => captured.loadResult,
  deleteSaveSlot: async () => undefined,
  listSaveSlots: async () => [],
}));

import { craftQueueBridge, useGameStore } from '../store/gameStore';

const JOBS: CraftJob[] = [
  { uid: 'job_1_bandage', recipeId: 'bandage', startedAtMin: 1800, bankedMin: 0, durationMin: 30, status: 'running' },
  { uid: 'job_2_ammo_9mm', recipeId: 'ammo_9mm', startedAtMin: 1700, bankedMin: 12, durationMin: 45, status: 'interrupted' },
];

function minimalSnapshot(patch: Partial<SaveSnapshot> = {}): SaveSnapshot {
  return {
    version: 3,
    savedAt: 1729000300000,
    difficulty: 'survivor',
    seed: 11,
    timeMinutes: 700,
    playSeconds: 3000,
    player: { pos: [1, 2, 3], hp: 77 },
    inventory: [],
    equipped: { melee: null, ranged: null, pack: null },
    hotbar: [null, null, null, null],
    quests: [],
    doneQuests: [],
    flags: {},
    rep: {},
    battery: 66,
    phoneUnlocked: true,
    world: { looted: [], deadHusks: [], cleared: [] },
    daysElapsed: 2,
    skills: {},
    perkPoints: 0,
    perks: [],
    survivors: [],
    base: null,
    vehicles: [],
    trailers: [],
    ...patch,
  };
}

beforeEach(() => {
  captured.saved = null;
  captured.loadResult = null;
  craftQueueBridge.read = null;
  craftQueueBridge.write = null;
  useGameStore.setState({
    craftQueue: [], storyChoices: {}, baseExt: {}, toasts: [],
    claims: { home: null, outposts: [] },
    moraleRuntime: { idleDays: {}, breakingDays: {} },
    beaconChoice: null,
  });
});

describe('store snapshot round-trip (field contract)', () => {
  it('saveToSlot writes storyChoices / baseExt and the mirrored craft queue', async () => {
    const s = useGameStore.getState();
    s.setCraftQueue(JOBS);
    s.setStoryChoice('beacon', 'lit');
    s.setBaseExt({ heat: 42, localKillsNearBase: 3 });

    const ok = await useGameStore.getState().saveToSlot('1');
    expect(ok).toBe(true);
    expect(captured.saved?.slot).toBe('1');
    expect(captured.saved?.snap.craftQueue).toEqual(JOBS);
    expect(captured.saved?.snap.storyChoices).toEqual({ beacon: 'lit' });
    expect(captured.saved?.snap.baseExt?.heat).toBe(42);
    expect(captured.saved?.snap.baseExt?.localKillsNearBase).toBe(3);
  });

  it('saveToSlot harvests Lane 7 jobs through the bridge when registered', async () => {
    craftQueueBridge.read = () => JOBS;
    const ok = await useGameStore.getState().saveToSlot('1');
    expect(ok).toBe(true);
    expect(captured.saved?.snap.craftQueue).toEqual(JOBS);
    // and the store mirror was refreshed from the harvest
    expect(useGameStore.getState().craftQueue).toEqual(JOBS);
  });

  it('loadFromSlot restores the fields and rehydrates the bridge sink', async () => {
    const sunk: CraftJob[][] = [];
    craftQueueBridge.write = (jobs) => sunk.push(jobs);
    captured.loadResult = minimalSnapshot({
      craftQueue: JOBS,
      storyChoices: { beacon: 'dark' },
      baseExt: { siegeState: 'warning', siegeNextMin: 4400 },
    });
    const ok = await useGameStore.getState().loadFromSlot('1');
    expect(ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.craftQueue).toEqual(JOBS);
    expect(st.storyChoices).toEqual({ beacon: 'dark' });
    expect(st.baseExt.siegeState).toBe('warning');
    expect(st.baseExt.siegeNextMin).toBe(4400);
    expect(sunk).toEqual([JOBS]);
  });

  it('loadFromSlot defaults Lane 13 dispatch instance ids + fuel on legacy entries', async () => {
    captured.loadResult = minimalSnapshot({
      dispatches: [
        // legacy entry: no instance ids, no fuel (pre-request save)
        {
          id: 'd1', survivorId: 'sv1', vehicleDefId: 'stallion_fx', trailerDefId: null,
          task: 'scavenge', destPoiId: 'relay_station', departMin: 100, etaMin: 400, distM: 900, status: 'out',
        },
        // stamped entry: everything present, must pass through untouched
        {
          id: 'd2', survivorId: 'sv2', vehicleDefId: 'stallion_fx', trailerDefId: 'trailer_box',
          task: 'scout', destPoiId: 'town', departMin: 200, etaMin: 500, distM: 1500, status: 'out',
          vehicleInstanceId: 'stallion_fx', trailerInstanceId: 'trailer_box', fuelLiters: 18.5,
        },
      ],
    });
    const ok = await useGameStore.getState().loadFromSlot('1');
    expect(ok).toBe(true);
    const [d1, d2] = useGameStore.getState().dispatches;
    expect(d1.vehicleInstanceId).toBe('stallion_fx');
    expect(d1.trailerInstanceId).toBeNull();
    expect(d1.fuelLiters).toBe(0);
    expect(d2.vehicleInstanceId).toBe('stallion_fx');
    expect(d2.trailerInstanceId).toBe('trailer_box');
    expect(d2.fuelLiters).toBe(18.5);
  });

  it('saveToSlot writes claims / moraleRuntime / beaconChoice', async () => {
    const s = useGameStore.getState();
    s.setClaims({
      home: {
        siteId: 'lighthouse_base', role: 'home',
        facilities: [{ defId: 'garden', tier: 2, staffId: 'mara', paused: false }],
        prefabs: [{ defId: 'palisade_wall', upgraded: true }],
        stockpile: [{ itemId: 'scrap', qty: 9 }],
      },
      outposts: [],
    });
    s.setMoraleRuntime({ idleDays: { mara: 2 }, breakingDays: {} });
    s.setBeaconChoice('light');

    const ok = await useGameStore.getState().saveToSlot('1');
    expect(ok).toBe(true);
    expect(captured.saved?.snap.claims?.home?.stockpile).toEqual([{ itemId: 'scrap', qty: 9 }]);
    expect(captured.saved?.snap.claims?.home?.facilities[0].tier).toBe(2);
    expect(captured.saved?.snap.moraleRuntime).toEqual({ idleDays: { mara: 2 }, breakingDays: {} });
    expect(captured.saved?.snap.beaconChoice).toBe('light');
  });

  it('loadFromSlot migrates a legacy base into claims (name-mapped, T1)', async () => {
    captured.loadResult = minimalSnapshot({
      base: {
        poiId: 'lighthouse_base',
        facilities: ['command_post', 'garden', 'infirmary', 'salvage_rig', 'rain_collector', 'garage_bay', 'palisade', 'watchtower', 'storage_crate'],
      },
      // no claims / moraleRuntime / beaconChoice — pre-request save
    });
    const ok = await useGameStore.getState().loadFromSlot('1');
    expect(ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.claims.home?.siteId).toBe('lighthouse_base');
    expect(st.claims.home?.role).toBe('home');
    expect(st.claims.home?.facilities).toEqual([
      { defId: 'command_post', tier: 1, staffId: null, paused: false },
      { defId: 'garden', tier: 1, staffId: null, paused: false },
      { defId: 'infirmary', tier: 1, staffId: null, paused: false },
      { defId: 'salvage_rig', tier: 1, staffId: null, paused: false },
      { defId: 'water', tier: 1, staffId: null, paused: false },
      { defId: 'garage', tier: 1, staffId: null, paused: false },
    ]);
    expect(st.claims.home?.prefabs).toEqual([
      { defId: 'palisade_wall' }, { defId: 'watchtower' }, { defId: 'storage_crate' },
    ]);
    expect(st.claims.home?.stockpile).toEqual([]);
    expect(st.claims.outposts).toEqual([]);
    expect(st.moraleRuntime).toEqual({ idleDays: {}, breakingDays: {} });
    expect(st.beaconChoice).toBeNull();
    // the legacy field itself still loads for the current consumers
    expect(st.base?.poiId).toBe('lighthouse_base');
  });

  it('loadFromSlot prefers stored claims over legacy migration', async () => {
    captured.loadResult = minimalSnapshot({
      base: { poiId: 'lighthouse_base', facilities: ['garden'] },
      claims: { home: null, outposts: [{ siteId: 'relay', role: 'outpost', facilities: [], prefabs: [], stockpile: [] }] },
      moraleRuntime: { idleDays: { dez: 1 }, breakingDays: { dez: 2 } },
    });
    const ok = await useGameStore.getState().loadFromSlot('1');
    expect(ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.claims.home).toBeNull();
    expect(st.claims.outposts).toHaveLength(1);
    expect(st.moraleRuntime.breakingDays).toEqual({ dez: 2 });
  });

  it('loadFromSlot folds legacy rep onto the canon roster (Lane 9 F1/F2)', async () => {
    captured.loadResult = minimalSnapshot({
      rep: { lighthouse: 12, pier: 30, hollow: -20 },
    });
    const ok = await useGameStore.getState().loadFromSlot('1');
    expect(ok).toBe(true);
    const { rep } = useGameStore.getState();
    expect(rep.lighthouse).toBe(12); // saved standing overrides the default
    expect(rep.union).toBe(55); // STARTING_REP 25 + pier's folded 30
    expect(rep.skulls).toBe(-50); // STARTING_REP −30 + hollow's folded −20
    expect(rep.remnants).toBe(-50);
    expect(rep.tollkeepers).toBe(0);
    expect(rep.drowned).toBe(0);
    expect('pier' in rep).toBe(false);
    expect('hollow' in rep).toBe(false);
  });

  it('loadFromSlot derives beaconChoice from flags when the field is absent (F3)', async () => {
    captured.loadResult = minimalSnapshot({ flags: { beacon_lit: true } });
    expect(await useGameStore.getState().loadFromSlot('1')).toBe(true);
    expect(useGameStore.getState().beaconChoice).toBe('light');

    captured.loadResult = minimalSnapshot({ flags: { beacon_dark: true }, beaconChoice: 'light' });
    expect(await useGameStore.getState().loadFromSlot('1')).toBe(true);
    // an explicit stored field wins over flag derivation
    expect(useGameStore.getState().beaconChoice).toBe('light');
  });

  it('loadFromSlot defaults the fields when an older snapshot lacks them', async () => {
    const sunk: CraftJob[][] = [];
    craftQueueBridge.write = (jobs) => sunk.push(jobs);
    // dirty the store first so defaults are observable, not inherited
    const s = useGameStore.getState();
    s.setCraftQueue(JOBS);
    s.setStoryChoice('beacon', 'lit');
    s.setBaseExt({ heat: 88 });

    captured.loadResult = minimalSnapshot(); // no contract fields at all
    const ok = await useGameStore.getState().loadFromSlot('2');
    expect(ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.craftQueue).toEqual([]);
    expect(st.storyChoices).toEqual({});
    expect(st.baseExt).toEqual({});
    expect(sunk).toEqual([[]]);
  });
});
