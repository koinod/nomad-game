// Build-order lane — the tiered facility build-order path (C5 residual).
//
// C5 made BUILT tiered facilities craft-live through the presence
// signal, but the tiered build path itself was phone-blocked: Phone's
// onBuild toasted "built on site, not from the phone — yet" for every
// tier-only facility (workbench, storage, radio, generator, fish
// traps). These tests pin the order path that closes the gap, end to
// end at the store level: order → pay the tier def's declared cost
// from the pack → timed queue (the legacy build queue's contract) →
// the facility lands in ClaimsState → presence / production / stockpile
// consumers pick it up with no extra wiring — including the C5 turret
// scenario, now reachable through the phone path alone.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  saved: null as { slot: string; snap: SaveSnapshot } | null,
  loadResult: null as SaveSnapshot | null,
}));

// Same IndexedDB mock-out as lane5-snapshot.test.ts: capture what
// saveToSlot writes, feed loadFromSlot what the test stages.
vi.mock('../systems/save', () => ({
  saveGameToSlot: async (slot: string, snap: SaveSnapshot) => {
    captured.saved = { slot, snap };
  },
  loadGameFromSlot: async () => captured.loadResult,
  deleteSaveSlot: async () => undefined,
  listSaveSlots: async () => [],
}));

import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';
import type { SaveSnapshot } from '../store/types';
import {
  applyClaim,
  applyTieredBuild,
  facilityTier,
  newClaimsState,
  stockpileCapKg,
  type BaseInstance,
} from '../systems/baseClaims';
import { facilityPresenceAt, presenceContext } from '../systems/facilityPresence';
import { checkCraft, TURRET_RECIPE, type CraftContext } from '../systems/crafting';
import { DESIGNED_RECRUITS, type SurvivorDef } from '../data/survivors';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const POIS: Record<string, [number, number]> = { shore_camp: [100, 200], jonah_camp: [900, 900] };

function resetStore(): void {
  captured.saved = null;
  captured.loadResult = null;
  useGameStore.setState({
    survivors: [], inventory: [], equipped: emptyEquipped(), hotbar: [null, null, null, null],
    claims: { home: null, outposts: [] }, base: null,
    baseQueue: [], claimsQueue: [], toasts: [],
    daysElapsed: 0, timeMinutes: 0, poiPositions: { ...POIS },
    screen: 'game', dead: false, hp: 100,
  });
}

function claimHome(siteId = 'shore_camp'): void {
  useGameStore.getState().setClaims(applyClaim(newClaimsState(), siteId));
}

let uidN = 0;
function seedPack(items: Record<string, number>): void {
  const inv = Object.entries(items).map(([itemId, qty]) => ({ uid: `seed${++uidN}`, itemId, qty }));
  useGameStore.setState({ inventory: inv });
}

function addPackItem(itemId: string, qty: number): void {
  const s = useGameStore.getState();
  useGameStore.setState({ inventory: [...s.inventory, { uid: `seed${++uidN}`, itemId, qty }] });
}

function crewMember(id: string, job: SurvivorDef['job']): SurvivorDef {
  const baseDef = Object.values(DESIGNED_RECRUITS)[0];
  return { ...baseDef, id, name: id, job, status: 'healthy' };
}

/** Move game time forward, rolling days the way the game loop does:
 *  advanceTime wraps the clock at midnight without turning the date,
 *  so a pass is stepped to midnight, advanceDay turns the date, and a
 *  final zero-step advance runs the queues' tick at the new date. */
function passTime(totalMin: number): void {
  let left = totalMin;
  while (left > 0) {
    const nowMin = useGameStore.getState().timeMinutes;
    const toMidnight = 1440 - nowMin;
    const step = Math.min(left, toMidnight);
    useGameStore.getState().advanceTime(step);
    left -= step;
    if (step === toMidnight) useGameStore.getState().advanceDay();
  }
  useGameStore.getState().advanceTime(0);
}

const store = () => useGameStore.getState();
const queue = () => store().claimsQueue;
const homeTier = (facilityId: string) => facilityTier(store().claims.home!, facilityId);
const count = (itemId: string) => store().countItem(itemId);

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
    equipped: emptyEquipped(),
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

beforeEach(resetStore);

// ---------------------------------------------------------------------------
// applyTieredBuild — the pure landing
// ---------------------------------------------------------------------------

describe('applyTieredBuild', () => {
  const bare = (): BaseInstance => ({
    siteId: 'shore_camp', role: 'home',
    facilities: [{ defId: 'command_post', tier: 1, staffId: null, paused: false }],
    prefabs: [], stockpile: [],
  });

  it('appends a new facility at its tier, unstaffed and unpaused', () => {
    const next = applyTieredBuild(bare(), 'workbench', 1);
    expect(facilityTier(next, 'workbench')).toBe(1);
    expect(next.facilities.find((f) => f.defId === 'workbench'))
      .toEqual({ defId: 'workbench', tier: 1, staffId: null, paused: false });
  });

  it('an upgrade raises the tier and preserves staffing / paused state', () => {
    const staffed: BaseInstance = {
      ...bare(),
      facilities: [
        { defId: 'command_post', tier: 1, staffId: null, paused: false },
        { defId: 'workbench', tier: 2, staffId: 'sv_1', paused: true },
      ],
    };
    const next = applyTieredBuild(staffed, 'workbench', 3);
    expect(next.facilities.find((f) => f.defId === 'workbench'))
      .toEqual({ defId: 'workbench', tier: 3, staffId: 'sv_1', paused: true });
    // input untouched (the store swaps state, never mutates it)
    expect(facilityTier(staffed, 'workbench')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// The full loop: order → queue → land → C5 presence makes the turret live
// ---------------------------------------------------------------------------

describe('tiered build orders — the full loop', () => {
  beforeEach(() => {
    claimHome('shore_camp');
    seedPack({ scrap: 200, wood: 100, wire: 100, gun_parts: 10 });
  });

  it('T1 workbench: cost is committed up front, the tier lands when the timer runs out', () => {
    store().orderTieredBuild('shore_camp', 'workbench');
    expect(queue()).toHaveLength(1);
    expect(queue()[0]).toMatchObject({ siteId: 'shore_camp', facilityId: 'workbench', tier: 1 });
    // tier def's declared T1 cost (10 scrap + 6 wood), paid from the pack
    expect(count('scrap')).toBe(190);
    expect(count('wood')).toBe(94);
    // not built yet — construction is timed, like the legacy queue
    expect(homeTier('workbench')).toBe(0);
    passTime(queue()[0].readyMin - store().timeMinutes + 1);
    expect(queue()).toHaveLength(0);
    expect(homeTier('workbench')).toBe(1);
  });

  it('T2 is crew-gated: refused without a Builder, ordered with one', () => {
    store().orderTieredBuild('shore_camp', 'workbench');
    passTime(24 * 60);
    expect(homeTier('workbench')).toBe(1);
    const scrapBefore = count('scrap');
    store().orderTieredBuild('shore_camp', 'workbench'); // gate: builder
    expect(queue()).toHaveLength(0);
    expect(count('scrap')).toBe(scrapBefore); // a refused order never charges
    useGameStore.setState({ survivors: [crewMember('sv_builder', 'Builder')] });
    store().orderTieredBuild('shore_camp', 'workbench');
    expect(queue()).toHaveLength(1);
    expect(queue()[0].tier).toBe(2);
    passTime(24 * 60);
    expect(homeTier('workbench')).toBe(2);
  });

  it('the C5 scenario, reachable by phone: a phone-ordered T3 Machine Shop makes the turret craftable in presence', () => {
    useGameStore.setState({
      survivors: [crewMember('sv_builder', 'Builder'), crewMember('sv_mech', 'Mechanic')],
    });
    // T1 + T2 through the order path
    store().orderTieredBuild('shore_camp', 'workbench');
    passTime(24 * 60);
    store().orderTieredBuild('shore_camp', 'workbench');
    passTime(24 * 60);
    expect(homeTier('workbench')).toBe(2);

    // At T2 the base is NOT a turret host — the C5 gate still fails.
    const bag = { gun_parts: 6, circuit_board: 2, engine_part: 1, bp_turret: 1 };
    const ctxWith = (over: Partial<CraftContext>): CraftContext => ({
      countItem: (id) => bag[id as keyof typeof bag] ?? 0,
      nearStation: null,
      nearStationTier: 0,
      facilities: [],
      skillLevel: () => 5,
      ...over,
    });
    const atT2 = facilityPresenceAt(store().claims, POIS, 100, 200);
    expect(atT2?.turretHost).toBe(false);
    const pcT2 = presenceContext(atT2, 'industrial');
    expect(checkCraft(TURRET_RECIPE, ctxWith({
      facilityStation: pcT2.facilityStation,
      nearStationTier: pcT2.stationTier,
      facilities: pcT2.facilityIds,
      atBaseName: atT2?.siteName ?? null,
    })).facilityOk).toBe(false);

    // T3 needs the blueprint in the pack on top of Builder + Mechanic.
    store().orderTieredBuild('shore_camp', 'workbench');
    expect(queue()).toHaveLength(0); // refused: no bp_machine_shop yet
    addPackItem('bp_machine_shop', 1);
    store().orderTieredBuild('shore_camp', 'workbench');
    expect(queue()).toHaveLength(1);
    expect(queue()[0].tier).toBe(3);
    passTime(24 * 60);
    expect(homeTier('workbench')).toBe(3);

    // Standing at the base, the turret gate now passes — the exact C5
    // assertions, with the facility reached through the order path.
    const at = facilityPresenceAt(store().claims, POIS, 100, 200);
    expect(at?.turretHost).toBe(true);
    const pc = presenceContext(at, 'industrial');
    const check = checkCraft(TURRET_RECIPE, ctxWith({
      facilityStation: pc.facilityStation,
      nearStationTier: pc.stationTier,
      facilities: pc.facilityIds,
      atBaseName: at?.siteName ?? null,
    }));
    expect(check.facilityOk).toBe(true);
    expect(check.stationOk).toBe(true);
    expect(check.ok).toBe(true);
  });

  it('max tier: a fourth workbench order is refused', () => {
    useGameStore.setState({
      survivors: [crewMember('sv_builder', 'Builder'), crewMember('sv_mech', 'Mechanic')],
    });
    addPackItem('bp_machine_shop', 1);
    for (let t = 0; t < 3; t++) {
      store().orderTieredBuild('shore_camp', 'workbench');
      passTime(24 * 60);
    }
    expect(homeTier('workbench')).toBe(3);
    store().orderTieredBuild('shore_camp', 'workbench');
    expect(queue()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe('tiered build orders — guards', () => {
  it('an unclaimed site refuses the order', () => {
    seedPack({ scrap: 50, wood: 50 });
    store().orderTieredBuild('shore_camp', 'workbench');
    expect(queue()).toHaveLength(0);
    expect(count('scrap')).toBe(50);
  });

  it('insufficient resources refuse the order and charge nothing', () => {
    claimHome('shore_camp');
    seedPack({ scrap: 3 }); // workbench T1 wants 10 scrap + 6 wood
    store().orderTieredBuild('shore_camp', 'workbench');
    expect(queue()).toHaveLength(0);
    expect(count('scrap')).toBe(3);
  });

  it('a duplicate order is refused and charged once', () => {
    claimHome('shore_camp');
    seedPack({ scrap: 100, wood: 100 });
    store().orderTieredBuild('shore_camp', 'workbench');
    store().orderTieredBuild('shore_camp', 'workbench');
    expect(queue()).toHaveLength(1);
    expect(count('scrap')).toBe(90);
  });

  it('site restrictions hold: fish traps cannot be ordered at Jonah\u2019s Camp', () => {
    claimHome('jonah_camp');
    seedPack({ scrap: 100, wood: 100, wire: 100 });
    store().orderTieredBuild('jonah_camp', 'fish_traps');
    expect(queue()).toHaveLength(0);
  });

  it('facility slots hold: a fourth new facility at Shore Camp (3 slots) is refused', () => {
    claimHome('shore_camp');
    seedPack({ scrap: 200, wood: 200, wire: 100 });
    for (const f of ['storage', 'workbench', 'garden']) {
      store().orderTieredBuild('shore_camp', f);
      passTime(24 * 60);
    }
    expect(store().claims.home!.facilities.length).toBe(4); // command post + 3
    const scrapBefore = count('scrap');
    store().orderTieredBuild('shore_camp', 'radio');
    expect(queue()).toHaveLength(0);
    expect(count('scrap')).toBe(scrapBefore);
  });

  it('cancel refunds the committed cost in full', () => {
    claimHome('shore_camp');
    // light pack: the refund rides addItem, whose carry gate (the same
    // one the legacy cancel answers to) refuses an immobile pack
    seedPack({ scrap: 10, wood: 10 });
    store().orderTieredBuild('shore_camp', 'storage'); // T1: 8 wood + 4 scrap
    expect(count('wood')).toBe(2);
    expect(count('scrap')).toBe(6);
    store().cancelTieredBuild('shore_camp', 'storage');
    expect(queue()).toHaveLength(0);
    expect(count('wood')).toBe(10);
    expect(count('scrap')).toBe(10);
    expect(homeTier('storage')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Consumers read phone-ordered facilities with no extra wiring
// ---------------------------------------------------------------------------

describe('tiered build orders — consumers', () => {
  it('a phone-ordered Storage T1 raises the stockpile cap (100 → 200)', () => {
    claimHome('shore_camp');
    seedPack({ scrap: 50, wood: 50 });
    expect(stockpileCapKg(store().claims.home!)).toBe(100);
    store().orderTieredBuild('shore_camp', 'storage');
    passTime(24 * 60);
    expect(homeTier('storage')).toBe(1);
    expect(stockpileCapKg(store().claims.home!)).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Persistence: in-progress and completed builds survive save/load
// ---------------------------------------------------------------------------

describe('tiered build orders — persistence', () => {
  it('an in-progress order rides the snapshot and still lands after load', async () => {
    claimHome('shore_camp');
    seedPack({ scrap: 100, wood: 100 });
    store().orderTieredBuild('shore_camp', 'workbench');
    const order = queue()[0];

    const ok = await store().saveToSlot('1');
    expect(ok).toBe(true);
    expect(captured.saved?.snap.claimsQueue).toEqual([order]);

    // wipe the run state, then load the snapshot back
    const savedSnap = captured.saved!.snap;
    resetStore();
    expect(queue()).toHaveLength(0);
    captured.loadResult = savedSnap;
    const loaded = await store().loadFromSlot('1');
    expect(loaded).toBe(true);
    expect(queue()).toEqual([order]);
    expect(homeTier('workbench')).toBe(0); // still under construction

    passTime(48 * 60);
    expect(queue()).toHaveLength(0);
    expect(homeTier('workbench')).toBe(1); // landed after the load
  });

  it('a snapshot without claimsQueue (older save) defaults to an empty queue', async () => {
    captured.loadResult = minimalSnapshot();
    const loaded = await store().loadFromSlot('1');
    expect(loaded).toBe(true);
    expect(queue()).toEqual([]);
  });
});
