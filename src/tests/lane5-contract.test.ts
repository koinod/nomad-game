// Lane 5 field-contract tests (parallel cycle): the optional v3 fields
// sibling lanes persist through — craftQueue (Lane 7's CraftJob[]),
// storyChoices (Lane 9), baseExt (Lane 10) — plus the store plumbing
// that owns them. Rules under test: passthrough-safe (migrate never
// drops or invents them), old saves load without crashing, new-game
// state starts empty, and the Lane 7 bridge harvests/rehydrates.
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, type RawSaveRecord } from '../systems/save';
import {
  STARTING_REP, claimsFromLegacyBase, craftQueueBridge, foldLegacyRep, useGameStore,
} from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';
import type { ClaimsState, CraftJob, SaveSnapshot } from '../store/types';

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
    equipped: emptyEquipped(),
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
const BASE_EXT = { heat: 42, siegeState: 'scouted' as const, localKillsNearBase: 7 };
const CLAIMS: ClaimsState = {
  home: {
    siteId: 'lighthouse_base', role: 'home',
    facilities: [{ defId: 'command_post', tier: 1, staffId: null, paused: false }],
    prefabs: [{ defId: 'watchtower', staffId: 'mara' }],
    stockpile: [{ itemId: 'canned_food', qty: 12 }],
  },
  outposts: [{ siteId: 'relay', role: 'outpost', facilities: [], prefabs: [], stockpile: [] }],
};
const MORALE = { idleDays: { mara: 3 }, breakingDays: { dez: 1 } };

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

  it('a v3 record carrying claims / moraleRuntime / beaconChoice migrates intact', () => {
    const rec = baseV3();
    rec.claims = CLAIMS;
    rec.moraleRuntime = MORALE;
    rec.beaconChoice = 'dark';
    const snap = migrate(rec) as SaveSnapshot;
    expect(snap.claims).toEqual(CLAIMS);
    expect(snap.moraleRuntime).toEqual(MORALE);
    expect(snap.beaconChoice).toBe('dark');
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

describe('second-batch field requests (Lanes 9 + 10 + 8)', () => {
  beforeEach(() => {
    useGameStore.setState({
      flags: {}, beaconChoice: null, toasts: [], visibility: 0,
      claims: { home: null, outposts: [] },
      moraleRuntime: { idleDays: {}, breakingDays: {} },
    });
  });

  it('foldLegacyRep: empty save rep yields exactly STARTING_REP', () => {
    expect(foldLegacyRep({})).toEqual(STARTING_REP);
  });

  it('foldLegacyRep: saved standings override, aliases fold additively', () => {
    const folded = foldLegacyRep({ union: 40, refuge: 5, skulls: -60 });
    expect(folded.union).toBe(45); // its own 40 + refuge's folded 5
    expect(folded.skulls).toBe(-60); // saved value replaces the −30 start
    expect('refuge' in folded).toBe(false);
  });

  it('claimsFromLegacyBase: null base → empty claims; unknown ids dropped', () => {
    expect(claimsFromLegacyBase(null)).toEqual({ home: null, outposts: [] });
    const claims = claimsFromLegacyBase({ poiId: 'lighthouse_base', facilities: ['mystery_box', 'garden'] });
    expect(claims.home?.facilities.map((f) => f.defId)).toEqual(['command_post', 'garden']);
  });

  it('setFlag keeps beaconChoice in sync with the beacon flags (F3)', () => {
    useGameStore.getState().setFlag('beacon_lit');
    expect(useGameStore.getState().beaconChoice).toBe('light');
    useGameStore.setState({ flags: {}, beaconChoice: null });
    useGameStore.getState().setFlag('beacon_dark');
    expect(useGameStore.getState().beaconChoice).toBe('dark');
  });

  it('addRep toast names factions from the FACTIONS table (F4)', () => {
    const s = useGameStore.getState();
    s.addRep('lighthouse', 5);
    expect(useGameStore.getState().toasts.slice(-1)[0]?.text).toContain('Lighthouse Collective rep +5');
    s.addRep('uncharted_faction', 2);
    // unknown ids fall back to the raw id rather than crashing
    expect(useGameStore.getState().toasts.slice(-1)[0]?.text).toContain('uncharted_faction rep +2');
  });

  it('setVisibility clamps to 0..1 and ignores sub-threshold jitter (Lane 8)', () => {
    const s = useGameStore.getState();
    s.setVisibility(1.7);
    expect(useGameStore.getState().visibility).toBe(1);
    s.setVisibility(0.5);
    expect(useGameStore.getState().visibility).toBe(0.5);
    s.setVisibility(0.51);
    expect(useGameStore.getState().visibility).toBe(0.5);
  });

  it('startNewGame resets claims / morale / beacon and canon rep', () => {
    const s = useGameStore.getState();
    s.setClaims(CLAIMS);
    s.setMoraleRuntime(MORALE);
    s.setBeaconChoice('dark');
    s.startNewGame('survivor');
    const st = useGameStore.getState();
    expect(st.claims).toEqual({ home: null, outposts: [] });
    expect(st.moraleRuntime).toEqual({ idleDays: {}, breakingDays: {} });
    expect(st.beaconChoice).toBeNull();
    expect(st.rep).toEqual(STARTING_REP);
  });
});

describe('inventory deck flags (Lane 5 step 2)', () => {
  beforeEach(() => {
    useGameStore.setState({ backpackOpen: false, inventoryOpen: false });
  });

  it('openInventory sets both flags (backpackOpen is the world-pause gate)', () => {
    useGameStore.getState().openInventory();
    const st = useGameStore.getState();
    expect(st.inventoryOpen).toBe(true);
    expect(st.backpackOpen).toBe(true);
  });

  it('closeInventory and closeBackpack both clear the deck', () => {
    const s = useGameStore.getState();
    s.openInventory();
    s.closeInventory();
    expect(useGameStore.getState().inventoryOpen).toBe(false);
    expect(useGameStore.getState().backpackOpen).toBe(false);
    s.openInventory();
    s.closeBackpack(); // the G-key path must not strand the deck open
    expect(useGameStore.getState().inventoryOpen).toBe(false);
    expect(useGameStore.getState().backpackOpen).toBe(false);
  });

  it('startNewGame closes the deck', () => {
    useGameStore.getState().openInventory();
    useGameStore.getState().startNewGame('survivor');
    expect(useGameStore.getState().inventoryOpen).toBe(false);
  });
});
