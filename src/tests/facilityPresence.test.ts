// ORDER #4 C5 — facility crafting presence signal.
//
// Before C5 the Craft UI fed CraftContext.facilities from the legacy
// flat base — globally, from anywhere on the island — and nobody ever
// set facilityStation, so facility-hosted crafting was unreachable and
// the turret's facility gate could never pass from real game state
// (neither base model ever emits 'machine_shop'/'garage_t3'; the
// tiered workbench T3 IS the Machine Shop). These tests pin the new
// signal: presence geometry on the claims system's own rings,
// ownership, the tiered→host translation, UI gating state at the
// presenceContext seam, and execution-time enforcement in the queue.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  facilityPresenceAt,
  hostedStations,
  presenceContext,
  presenceSignature,
} from '../systems/facilityPresence';
import type { BaseInstance, ClaimsState, FacilityInstance } from '../systems/baseClaims';
import {
  checkCraft,
  liveCraftContext,
  TURRET_RECIPE,
  useCraftQueue,
  type CraftContext,
} from '../systems/crafting';
import { useGameStore } from '../store/gameStore';
import { emptyEquipped } from '../store/equipment';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const fac = (defId: string, tier: number): FacilityInstance => ({ defId, tier, staffId: null, paused: false });

function baseAt(siteId: string, role: BaseInstance['role'], facilities: FacilityInstance[]): BaseInstance {
  return { siteId, role, facilities, prefabs: [], stockpile: [] };
}

const POIS: Record<string, [number, number]> = {
  shore_camp: [100, 200],
  relay_station: [500, 200],
  airbase: [900, 900],
};

// ---------------------------------------------------------------------------
// hostedStations — the tiered → host translation
// ---------------------------------------------------------------------------

describe('hostedStations (tiered facilities → station hosts)', () => {
  it('a claimed base with only a Command Post hosts nothing', () => {
    const h = hostedStations([fac('command_post', 1)]);
    expect(h.stationTiers).toEqual({});
    expect(h.facilityIds).toEqual([]);
    expect(h.turretHost).toBe(false);
  });

  it('the workbench line IS bench → workshop → machine shop', () => {
    const t1 = hostedStations([fac('workbench', 1)]);
    expect(t1.stationTiers.workbench).toBe(1);
    expect(t1.facilityIds).toEqual(['workbench']);
    const t2 = hostedStations([fac('workbench', 2)]);
    expect(t2.stationTiers.workbench).toBe(2);
    expect(t2.facilityIds).toEqual(['workbench', 'workshop']);
    const t3 = hostedStations([fac('workbench', 3)]);
    expect(t3.stationTiers.workbench).toBe(2);
    expect(t3.stationTiers.industrial).toBe(3);
    expect(t3.facilityIds).toEqual(['workbench', 'workshop', 'machine_shop']);
    expect(t3.turretHost).toBe(true);
  });

  it('infirmary hosts chemistry at T2 only (T1 is a med cot)', () => {
    expect(hostedStations([fac('infirmary', 1)]).stationTiers.chemistry).toBeUndefined();
    const t2 = hostedStations([fac('infirmary', 2)]);
    expect(t2.stationTiers.chemistry).toBe(2);
    expect(t2.facilityIds).toEqual(['infirmary']);
  });

  it('garage hosts the bay from T1; T3 is the second turret host', () => {
    const t1 = hostedStations([fac('garage', 1)]);
    expect(t1.stationTiers.garage).toBe(1);
    expect(t1.turretHost).toBe(false);
    const t3 = hostedStations([fac('garage', 3)]);
    expect(t3.facilityIds).toEqual(['garage_bay', 'garage_t3']);
    expect(t3.turretHost).toBe(true);
  });

  it('the translated ids satisfy the crafting layer\u2019s own host helpers', () => {
    // stationTierFromFacilities/hasTurretHost semantics are pinned in
    // crafting.test.ts; here the bridge output must land in that space.
    const h = hostedStations([fac('workbench', 3), fac('infirmary', 2), fac('garage', 1)]);
    expect(h.facilityIds).toContain('machine_shop');
    expect(h.facilityIds).toContain('infirmary');
    expect(h.facilityIds).toContain('garage_bay');
  });
});

// ---------------------------------------------------------------------------
// facilityPresenceAt — geometry + ownership
// ---------------------------------------------------------------------------

describe('facilityPresenceAt', () => {
  const claimed: ClaimsState = {
    home: baseAt('shore_camp', 'home', [fac('command_post', 1), fac('workbench', 3)]),
    outposts: [],
  };

  it('inside the home ring (40m) is presence; the ring edge counts', () => {
    expect(facilityPresenceAt(claimed, POIS, 100, 200)?.siteId).toBe('shore_camp');
    expect(facilityPresenceAt(claimed, POIS, 139, 200)?.siteId).toBe('shore_camp');
    expect(facilityPresenceAt(claimed, POIS, 140, 200)?.siteId).toBe('shore_camp'); // exactly on the ring
    expect(facilityPresenceAt(claimed, POIS, 141, 200)).toBeNull();
  });

  it('a claimed-but-unbuilt base is presence with no hosts', () => {
    const bare: ClaimsState = { home: baseAt('shore_camp', 'home', [fac('command_post', 1)]), outposts: [] };
    const p = facilityPresenceAt(bare, POIS, 100, 200);
    expect(p).not.toBeNull();
    expect(p?.stationTiers).toEqual({});
    expect(p?.turretHost).toBe(false);
    expect(p?.siteName).toBe('Shore Camp');
  });

  it('ownership: the same ground unclaimed — or claimed by nobody in this state — is not presence', () => {
    const none: ClaimsState = { home: null, outposts: [] };
    expect(facilityPresenceAt(none, POIS, 100, 200)).toBeNull();
    // a state holding only a different site: shore camp ground is not yours
    const other: ClaimsState = { home: null, outposts: [baseAt('relay_station', 'outpost', [fac('command_post', 1)])] };
    expect(facilityPresenceAt(other, POIS, 100, 200)).toBeNull();
    expect(facilityPresenceAt(other, POIS, 500, 200)?.siteId).toBe('relay_station');
  });

  it('outpost rings are 20m, not 40m', () => {
    const claims: ClaimsState = { home: null, outposts: [baseAt('relay_station', 'outpost', [fac('command_post', 1)])] };
    expect(facilityPresenceAt(claims, POIS, 525, 200)).toBeNull(); // 25m out: inside a home ring, outside an outpost's
    expect(facilityPresenceAt(claims, POIS, 519, 200)?.siteId).toBe('relay_station');
  });

  it('home wins when rings overlap', () => {
    const pois = { shore_camp: [0, 0] as [number, number], relay_station: [10, 0] as [number, number] };
    const claims: ClaimsState = {
      home: baseAt('shore_camp', 'home', [fac('command_post', 1)]),
      outposts: [baseAt('relay_station', 'outpost', [fac('command_post', 1)])],
    };
    expect(facilityPresenceAt(claims, pois, 5, 0)?.siteId).toBe('shore_camp');
  });

  it('military_base rides the airbase anchor (the shared fallback)', () => {
    const claims: ClaimsState = { home: baseAt('military_base', 'home', [fac('command_post', 1)]), outposts: [] };
    expect(facilityPresenceAt(claims, POIS, 910, 900)?.siteId).toBe('military_base');
    expect(facilityPresenceAt(claims, { shore_camp: [100, 200] }, 910, 900)).toBeNull(); // no anchor → no presence
  });

  it('zero-ring story ground (lighthouse) never grants presence', () => {
    const claims: ClaimsState = { home: baseAt('lighthouse_base', 'home', [fac('command_post', 1)]), outposts: [] };
    const pois = { lighthouse_base: [0, 0] as [number, number] };
    expect(facilityPresenceAt(claims, pois, 0, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// presenceContext — the UI gating seam
// ---------------------------------------------------------------------------

describe('presenceContext (Craft UI gating state)', () => {
  const claims: ClaimsState = {
    home: baseAt('shore_camp', 'home', [fac('workbench', 3), fac('infirmary', 1)]),
    outposts: [],
  };
  const at = facilityPresenceAt(claims, POIS, 100, 200);

  it('no presence → no facility context at all', () => {
    expect(presenceContext(null, 'workbench')).toEqual({ facilityStation: null, facilityIds: [], stationTier: 0 });
  });

  it('in presence, a hosted station is the context station at its tier', () => {
    const pc = presenceContext(at, 'industrial');
    expect(pc.facilityStation).toBe('industrial');
    expect(pc.stationTier).toBe(3);
    expect(pc.facilityIds).toContain('machine_shop');
  });

  it('in presence, an unhosted station stays locked but the base ids still flow (turret gate)', () => {
    const pc = presenceContext(at, 'chemistry'); // infirmary is T1 here — no hosting
    expect(pc.facilityStation).toBeNull();
    expect(pc.stationTier).toBe(0);
    expect(pc.facilityIds).toContain('machine_shop');
  });
});

// ---------------------------------------------------------------------------
// checkCraft over presence contexts
// ---------------------------------------------------------------------------

describe('checkCraft with presence-derived contexts', () => {
  const bag = { gun_parts: 6, circuit_board: 2, engine_part: 1, bp_turret: 1 };
  const ctxWith = (over: Partial<CraftContext>): CraftContext => ({
    countItem: (id) => bag[id as keyof typeof bag] ?? 0,
    nearStation: null,
    nearStationTier: 0,
    facilities: [],
    skillLevel: () => 5,
    ...over,
  });

  it('the turret passes at a machine-shop base, in presence', () => {
    const claims: ClaimsState = { home: baseAt('shore_camp', 'home', [fac('workbench', 3)]), outposts: [] };
    const at = facilityPresenceAt(claims, POIS, 100, 200);
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

  it('the same base from across the island: facility gate fails and says you must be standing there', () => {
    const pc = presenceContext(null, 'industrial');
    const check = checkCraft(TURRET_RECIPE, ctxWith({
      nearStation: 'industrial', // at the world Machine Shop instead
      nearStationTier: 3,
      facilities: pc.facilityIds,
      atBaseName: null,
    }));
    expect(check.stationOk).toBe(true);
    expect(check.facilityOk).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/standing there/);
  });

  it('at a base without the host, the reason names that base', () => {
    const claims: ClaimsState = { home: baseAt('shore_camp', 'home', [fac('command_post', 1)]), outposts: [] };
    const at = facilityPresenceAt(claims, POIS, 100, 200);
    const pc = presenceContext(at, 'industrial');
    const check = checkCraft(TURRET_RECIPE, ctxWith({
      facilityStation: pc.facilityStation,
      facilities: pc.facilityIds,
      atBaseName: at?.siteName ?? null,
    }));
    expect(check.facilityOk).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/Shore Camp/);
  });
});

// ---------------------------------------------------------------------------
// queue enforcement — execution validates live state, not the caller's ctx
// ---------------------------------------------------------------------------

describe('craft queue enforcement (live presence)', () => {
  const SHOP_HOME: ClaimsState = {
    home: baseAt('shore_camp', 'home', [fac('command_post', 1), fac('workbench', 3)]),
    outposts: [],
  };

  beforeEach(() => {
    useGameStore.setState({
      inventory: [],
      equipped: emptyEquipped(),
      nearStation: null,
      base: null,
      claims: { home: null, outposts: [] },
      poiPositions: {},
      pos: [0, 0, 0],
      atBase: null,
      toasts: [],
      daysElapsed: 0,
      timeMinutes: 600,
      dayStats: { kills: 0, crafts: 0, pickups: 0 },
    });
    useCraftQueue.setState({ jobs: [] });
  });

  /** An empty-but-honest caller ctx: knows nothing of facilities. */
  function bareCtx(): CraftContext {
    const s = useGameStore.getState();
    return {
      countItem: (id) => s.countItem(id),
      nearStation: null,
      nearStationTier: 0,
      facilities: [],
      skillLevel: () => 5,
    };
  }

  /** A stale ctx claiming the whole world — the leak C5 closes. */
  function staleCtx(): CraftContext {
    return {
      ...bareCtx(),
      nearStation: 'industrial',
      facilityStation: 'industrial',
      nearStationTier: 3,
      facilities: ['machine_shop'],
    };
  }

  function stockTurretParts() {
    const s = useGameStore.getState();
    s.addItem('gun_parts', 6, true);
    s.addItem('circuit_board', 2, true);
    s.addItem('engine_part', 1, true);
    s.addItem('bp_turret', 1, true);
  }

  it('liveCraftContext derives presence from the store, ignoring the caller\u2019s facility claims', () => {
    useGameStore.setState({ claims: SHOP_HOME, poiPositions: POIS, pos: [100, 0, 200] });
    const live = liveCraftContext(TURRET_RECIPE, staleCtx());
    expect(live.facilities).toContain('machine_shop');
    expect(live.facilityStation).toBe('industrial');
    expect(live.nearStationTier).toBe(3);
    expect(live.atBaseName).toBe('Shore Camp');
    // and away from the ring, the same stale ctx derives to nothing
    useGameStore.setState({ pos: [900, 0, 200] });
    const away = liveCraftContext(TURRET_RECIPE, staleCtx());
    expect(away.facilities).toEqual([]);
    expect(away.facilityStation).toBeNull();
    expect(away.atBaseName).toBeNull();
  });

  it('a facility craft starts in presence even when the caller ctx knows nothing', () => {
    stockTurretParts();
    useGameStore.setState({ claims: SHOP_HOME, poiPositions: POIS, pos: [110, 0, 205] });
    const refusal = useCraftQueue.getState().enqueue('r_turret', bareCtx());
    expect(refusal).toBeNull();
    expect(useCraftQueue.getState().jobs).toHaveLength(1);
    expect(useGameStore.getState().countItem('gun_parts')).toBe(0); // consumed at start
  });

  it('starting a facility craft outside presence is refused, however the ctx lies', () => {
    stockTurretParts();
    useGameStore.setState({ claims: SHOP_HOME, poiPositions: POIS, pos: [900, 0, 200] });
    const refusal = useCraftQueue.getState().enqueue('r_turret', staleCtx());
    expect(refusal).toMatch(/Machine Shop/);
    expect(useCraftQueue.getState().jobs).toHaveLength(0);
    expect(useGameStore.getState().countItem('gun_parts')).toBe(6); // nothing consumed
  });

  it('at the world shop but away from base, the turret\u2019s facility gate still refuses', () => {
    stockTurretParts();
    useGameStore.setState({
      claims: SHOP_HOME, poiPositions: POIS, pos: [900, 0, 200],
      nearStation: 'industrial', // genuinely at the marina shop
    });
    const refusal = useCraftQueue.getState().enqueue('r_turret', staleCtx());
    expect(refusal).toMatch(/standing there/);
    expect(useCraftQueue.getState().jobs).toHaveLength(0);
  });

  it('a tier-3 fabrication starts at the base\u2019s Machine Shop with no world station near', () => {
    const s = useGameStore.getState();
    s.addItem('scrap', 4, true);
    s.addItem('wire', 2, true);
    useGameStore.setState({ claims: SHOP_HOME, poiPositions: POIS, pos: [100, 0, 200] });
    expect(useGameStore.getState().nearStation).toBeNull();
    const refusal = useCraftQueue.getState().enqueue('r_engine_part', bareCtx());
    expect(refusal).toBeNull();
    expect(useCraftQueue.getState().jobs).toHaveLength(1);
  });

  it('walking away mid-queue does not strand the job (existing queue rules: enforcement is at start)', () => {
    const s = useGameStore.getState();
    s.addItem('scrap', 4, true);
    s.addItem('wire', 2, true);
    useGameStore.setState({ claims: SHOP_HOME, poiPositions: POIS, pos: [100, 0, 200] });
    expect(useCraftQueue.getState().enqueue('r_engine_part', bareCtx())).toBeNull();
    useGameStore.setState({ pos: [900, 0, 200], timeMinutes: 600 + 61 }); // left; the hour passes
    useCraftQueue.getState().tick();
    expect(useGameStore.getState().countItem('engine_part')).toBe(1);
    expect(useCraftQueue.getState().jobs).toHaveLength(0);
  });

  it('a base claimed but lacking the facility cannot fabricate', () => {
    const s = useGameStore.getState();
    s.addItem('scrap', 4, true);
    s.addItem('wire', 2, true);
    const noShop: ClaimsState = { home: baseAt('shore_camp', 'home', [fac('command_post', 1), fac('workbench', 1)]), outposts: [] };
    useGameStore.setState({ claims: noShop, poiPositions: POIS, pos: [100, 0, 200] });
    const refusal = useCraftQueue.getState().enqueue('r_engine_part', bareCtx());
    expect(refusal).toMatch(/tier 3 station|Machine Shop/);
    expect(useCraftQueue.getState().jobs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// the store mirror's guard
// ---------------------------------------------------------------------------

describe('atBase mirror (signature-guarded setter)', () => {
  const claims: ClaimsState = {
    home: baseAt('shore_camp', 'home', [fac('workbench', 3)]),
    outposts: [],
  };

  beforeEach(() => {
    useGameStore.setState({ atBase: null });
  });

  it('identical presence does not rewrite the store; a real change does', () => {
    const p1 = facilityPresenceAt(claims, POIS, 100, 200);
    useGameStore.getState().setAtBase(p1);
    const ref = useGameStore.getState().atBase;
    expect(ref).toBe(p1);
    // a fresh object with the same signature (next frame's recompute)
    useGameStore.getState().setAtBase(facilityPresenceAt(claims, POIS, 105, 200));
    expect(useGameStore.getState().atBase).toBe(ref);
    expect(presenceSignature(ref)).toBe(presenceSignature(p1));
    // leaving the ring is a change
    useGameStore.getState().setAtBase(null);
    expect(useGameStore.getState().atBase).toBeNull();
    // a facility landing mid-presence changes the signature
    const grown: ClaimsState = {
      home: baseAt('shore_camp', 'home', [fac('workbench', 3), fac('infirmary', 2)]),
      outposts: [],
    };
    useGameStore.getState().setAtBase(facilityPresenceAt(grown, POIS, 100, 200));
    expect(useGameStore.getState().atBase?.stationTiers.chemistry).toBe(2);
  });
});
