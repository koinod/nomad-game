// Lane 5 field-contract tests (parallel cycle): the optional v3 fields
// sibling lanes persist through — craftQueue (Lane 7), storyChoices
// (Lane 9), baseExt (Lane 10) — plus the store verbs that own them.
// Rules under test: passthrough-safe (migrate never drops or invents
// them), old saves load without crashing, new-game state starts empty.
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, type RawSaveRecord } from '../systems/save';
import { useGameStore } from '../store/gameStore';
import type { SaveSnapshot } from '../store/types';

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

const CRAFT = [
  { id: 'c1', recipeId: 'bandage', stationId: null, qty: 2, readyMin: 1900 },
  { id: 'c2', recipeId: 'ammo_9mm', stationId: 'workbench', qty: 1, readyMin: 2100 },
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

describe('field-contract store verbs', () => {
  beforeEach(() => {
    useGameStore.setState({ craftQueue: [], storyChoices: {}, baseExt: {} });
  });

  it('enqueueCraft appends with a generated id; cancel/remove take it out', () => {
    const s = useGameStore.getState();
    const id = s.enqueueCraft({ recipeId: 'bandage', stationId: null, qty: 1, readyMin: 1500 });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    let q = useGameStore.getState().craftQueue;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ recipeId: 'bandage', qty: 1, readyMin: 1500 });
    useGameStore.getState().cancelCraft(id);
    expect(useGameStore.getState().craftQueue).toHaveLength(0);

    const id2 = useGameStore.getState().enqueueCraft({ recipeId: 'stew', stationId: 'chemistry', qty: 3, readyMin: 1600 });
    useGameStore.getState().removeCraft(id2);
    q = useGameStore.getState().craftQueue;
    expect(q).toHaveLength(0);
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

  it('startNewGame resets all three contract fields', () => {
    const s = useGameStore.getState();
    s.enqueueCraft({ recipeId: 'bandage', stationId: null, qty: 1, readyMin: 1 });
    s.setStoryChoice('beacon', 'lit');
    s.setBaseExt({ heat: 99 });
    s.startNewGame('survivor');
    const st = useGameStore.getState();
    expect(st.craftQueue).toEqual([]);
    expect(st.storyChoices).toEqual({});
    expect(st.baseExt).toEqual({});
  });
});
