// Lane 5 snapshot round-trip: store state -> SaveSnapshot -> store state,
// with the IndexedDB layer mocked out (the real save.ts migration path is
// covered by lane5-contract.test.ts and save.test.ts). Proves saveToSlot
// writes the field-contract fields and loadFromSlot restores them — and
// that a snapshot WITHOUT them loads with empty defaults, never a crash.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveSnapshot } from '../store/types';

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

import { useGameStore } from '../store/gameStore';

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
  useGameStore.setState({ craftQueue: [], storyChoices: {}, baseExt: {}, toasts: [] });
});

describe('store snapshot round-trip (field contract)', () => {
  it('saveToSlot writes craftQueue / storyChoices / baseExt into the snapshot', async () => {
    const s = useGameStore.getState();
    const id = s.enqueueCraft({ recipeId: 'bandage', stationId: null, qty: 2, readyMin: 1900 });
    s.setStoryChoice('beacon', 'lit');
    s.setBaseExt({ heat: 42, stockpile: [{ uid: 's1', itemId: 'scrap', qty: 9 }] });

    const ok = await useGameStore.getState().saveToSlot('1');
    expect(ok).toBe(true);
    expect(captured.saved?.slot).toBe('1');
    expect(captured.saved?.snap.craftQueue).toEqual([
      { id, recipeId: 'bandage', stationId: null, qty: 2, readyMin: 1900 },
    ]);
    expect(captured.saved?.snap.storyChoices).toEqual({ beacon: 'lit' });
    expect(captured.saved?.snap.baseExt?.heat).toBe(42);
    expect(captured.saved?.snap.baseExt?.stockpile).toHaveLength(1);
  });

  it('loadFromSlot restores the fields from a snapshot that carries them', async () => {
    captured.loadResult = minimalSnapshot({
      craftQueue: [{ id: 'c9', recipeId: 'stew', stationId: 'chemistry', qty: 1, readyMin: 3000 }],
      storyChoices: { beacon: 'dark' },
      baseExt: { siegeState: 'warning', siegeNextMin: 4400 },
    });
    const ok = await useGameStore.getState().loadFromSlot('1');
    expect(ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.craftQueue).toHaveLength(1);
    expect(st.craftQueue[0].recipeId).toBe('stew');
    expect(st.storyChoices).toEqual({ beacon: 'dark' });
    expect(st.baseExt.siegeState).toBe('warning');
    expect(st.baseExt.siegeNextMin).toBe(4400);
  });

  it('loadFromSlot defaults the fields when an older snapshot lacks them', async () => {
    // dirty the store first so defaults are observable, not inherited
    const s = useGameStore.getState();
    s.enqueueCraft({ recipeId: 'bandage', stationId: null, qty: 1, readyMin: 1 });
    s.setStoryChoice('beacon', 'lit');
    s.setBaseExt({ heat: 88 });

    captured.loadResult = minimalSnapshot(); // no contract fields at all
    const ok = await useGameStore.getState().loadFromSlot('2');
    expect(ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.craftQueue).toEqual([]);
    expect(st.storyChoices).toEqual({});
    expect(st.baseExt).toEqual({});
  });
});
