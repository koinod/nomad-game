// Lane 5 field-contract tests (parallel cycle): the optional v3 fields
// sibling lanes persist through — craftQueue (Lane 7's CraftJob[]),
// storyChoices (Lane 9), baseExt (Lane 10) — plus the store plumbing
// that owns them. Rules under test: passthrough-safe (migrate never
// drops or invents them), old saves load without crashing, new-game
// state starts empty, and the Lane 7 bridge harvests/rehydrates.
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, type RawSaveRecord } from '../systems/save';
import { craftQueueBridge, useGameStore } from '../store/gameStore';
import type { CraftJob, SaveSnapshot } from '../store/types';

function baseV3(): RawSaveRecord {
  return {
    version: 3,
    slot: '1',
    savedAt: 1729000200000,
    difficulty: 'survivor',
    seed: 7,
    timeMinutes: 600,
    playSeconds: 1200,
    player: { pos: [10, 3, -20], hp: 90 },
    inventory: [{ uid: 'x1', itemId: 'bandage', qty: 1 }],
    equipped: { melee: null, ranged: null, pack: null },
    hotbar: [null, null, null, null],
    quests: [],
    doneQuests: [],
    flags: {},
    rep: {},
    battery: 80,
    phoneUnlocked: true,
    world: { looted: [], deadHusks: [], cleared: [] },
    daysElapsed: 1,
    skills: {},
    perkPoints: 0,
    perks: [],
    survivors: [],
    base: null,
    vehicles: [],
    trailers: [],
  };
}

// Lane 7's engine shape (src/systems/crafting.ts CraftJob): segment-based,
// so an interrupted job's banked progress must survive the round trip.
const CRAFT: CraftJob[] = [
  { uid: 'job_1_bandage', recipeId: 'bandage', startedAtMin: 1800, bankedMin: 0, durationMin: 30, status: 'running' },
  { uid: 'job_2_ammo_9mm', recipeId: 'ammo_9mm', startedAtMin: 1700, bankedMin: 12, durationMin: 45, status: 'interrupted' },
];
const CHOICES = { beacon: 'lit', ending_path: 'leave' };
const BASE_EXT = {
  heat: 42,
  siegeState: 'scouted' as const,
  outposts: [{ poiId: 'dune_camp', facilities: ['watch_post'] }],
  stockpile: [{ uid: 's1', itemId: 'scrap', qty: 9 }],
};

describe('field-contract fields survive the save migration path', () => {
  it('a v3 record carrying them migrates with every field intact', () => {
    const rec = baseV3();
    rec.craftQueue = CRAFT;
    rec.storyChoices = CHOICES;
    rec.baseExt = BASE_EXT;
    const snap = migrate(rec) as SaveSnapshot;
    expect(snap.version).toBe(3);
    expect(snap.craftQueue).toEqual(CRAFT);
    expect(snap.storyChoices).toEqual(CHOICES);
    expect(snap.baseExt).toEqual(BASE_EXT);
  });

  it('a v3 record without them migrates untouched (store defaults on load)', () => {
    const snap = migrate(baseV3()) as SaveSnapshot;
    expect(snap.craftQueue).toBeUndefined();
    expect(snap.storyChoices).toBeUndefined();
    expect(snap.baseExt).toBeUndefined();
  });

  it('a v0 record still migrates to v3 and simply lacks the new fields', () => {
    const rec = baseV3();
    rec.version = 0;
    delete rec.battery;
    delete rec.phoneUnlocked;
    const snap = migrate(rec) as SaveSnapshot;
    expect(snap.version).toBe(3);
    expect(snap.craftQueue).toBeUndefined();
    expect(snap.baseExt).toBeUndefined();
  });
});

describe('field-contract store plumbing', () => {
  beforeEach(() => {
    craftQueueBridge.read = null;
    craftQueueBridge.write = null;
    useGameStore.setState({ craftQueue: [], storyChoices: {}, baseExt: {} });
  });

  it('setCraftQueue replaces the persisted mirror', () => {
    useGameStore.getState().setCraftQueue(CRAFT);
    expect(useGameStore.getState().craftQueue).toEqual(CRAFT);
    useGameStore.getState().setCraftQueue([]);
    expect(useGameStore.getState().craftQueue).toEqual([]);
  });

  it('setStoryChoice records string choices the boolean flags cannot hold', () => {
    useGameStore.getState().setStoryChoice('beacon', 'lit');
    useGameStore.getState().setStoryChoice('beacon', 'dark');
    expect(useGameStore.getState().storyChoices).toEqual({ beacon: 'dark' });
  });

  it('setBaseExt merges patches without dropping sibling fields', () => {
    const s = useGameStore.getState();
    s.setBaseExt({ heat: 10 });
    s.setBaseExt({ siegeState: 'warning', siegeNextMin: 5000 });
    expect(useGameStore.getState().baseExt).toEqual({ heat: 10, siegeState: 'warning', siegeNextMin: 5000 });
  });

  it('startNewGame resets all three contract fields and clears the bridge sink', () => {
    const cleared: CraftJob[][] = [];
    craftQueueBridge.write = (jobs) => cleared.push(jobs);
    const s = useGameStore.getState();
    s.setCraftQueue(CRAFT);
    s.setStoryChoice('beacon', 'lit');
    s.setBaseExt({ heat: 99 });
    s.startNewGame('survivor');
    const st = useGameStore.getState();
    expect(st.craftQueue).toEqual([]);
    expect(st.storyChoices).toEqual({});
    expect(st.baseExt).toEqual({});
    expect(cleared).toEqual([[]]);
  });
});
