// Lane 7 — crafting depth (SYSTEMS_SPEC §4): station tiers, gate evaluation,
// the game-time timer engine (interrupt / resume / sleep-through), turret
// contract, and the queue store end-to-end against the real game store.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FACILITY_STATION_HOSTS,
  hasTurretHost,
  insideAnyClaim,
  reachableStationTier,
  stationTierFromFacilities,
  WORLD_STATION_PLACEMENTS,
} from '../data/stations';
import { FIELD_RECIPES, STATION_RECIPES } from '../data/items';
import {
  ALL_RECIPES,
  checkCraft,
  craftXpAward,
  efficientHandsRefund,
  formatDurationMin,
  interruptJob,
  isInstant,
  isJobDone,
  jobProgress,
  recipeDurationMin,
  recipeMeta,
  resumeJob,
  startJob,
  tickJobs,
  TURRET_DEF,
  TURRET_GHOST_SPEC,
  TURRET_RECIPE,
  useCraftQueue,
  type CraftContext,
} from '../systems/crafting';
import { useGameStore } from '../store/gameStore';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function ctxWith(over: Partial<CraftContext> & { bag?: Record<string, number> } = {}): CraftContext {
  const bag = over.bag ?? {};
  return {
    countItem: (id) => bag[id] ?? 0,
    nearStation: null,
    nearStationTier: 0,
    facilities: [],
    skillLevel: () => undefined, // substrate absent → gates inert
    ...over,
  };
}

// ---------------------------------------------------------------------------
// stations (§4.1)
// ---------------------------------------------------------------------------

describe('station tiers & facility hosts', () => {
  it('world placements cover all three stations incl. the marina Machine Shop', () => {
    const stations = WORLD_STATION_PLACEMENTS.map((p) => p.station);
    expect(stations).toContain('workbench');
    expect(stations).toContain('chemistry');
    expect(stations).toContain('industrial');
    const shop = WORLD_STATION_PLACEMENTS.find((p) => p.station === 'industrial');
    expect(shop?.poiId).toBe('marina');
  });

  it('facility hosts resolve tiers per §4.1', () => {
    expect(stationTierFromFacilities([], 'workbench')).toBe(0);
    expect(stationTierFromFacilities(['workbench'], 'workbench')).toBe(1);
    expect(stationTierFromFacilities(['workbench', 'workshop'], 'workbench')).toBe(2);
    expect(stationTierFromFacilities(['machine_shop'], 'industrial')).toBe(3);
    expect(stationTierFromFacilities(['infirmary'], 'chemistry')).toBe(2);
    expect(stationTierFromFacilities(['garage_bay'], 'garage')).toBe(1);
    // every declared host maps to a real station def tier ≤ 3
    for (const h of FACILITY_STATION_HOSTS) expect(h.tier).toBeLessThanOrEqual(3);
  });

  it('reachable tier takes the max of world and facility', () => {
    expect(reachableStationTier('industrial', { atWorldStation: true, facilities: [] })).toBe(3);
    expect(reachableStationTier('workbench', { atWorldStation: false, facilities: ['workshop'] })).toBe(2);
    expect(reachableStationTier('garage', { atWorldStation: true, facilities: [] })).toBe(0);
  });

  it('turret host = T3 machine shop or T3 garage', () => {
    expect(hasTurretHost(['machine_shop'])).toBe(true);
    expect(hasTurretHost(['garage_t3'])).toBe(true);
    expect(hasTurretHost(['garage_bay'])).toBe(false);
    expect(hasTurretHost([])).toBe(false);
  });

  it('claim-radius deploy validation', () => {
    const claims = [{ x: 100, z: -50, radius: 30 }];
    expect(insideAnyClaim(110, -40, claims)).toBe(true);
    expect(insideAnyClaim(200, -50, claims)).toBe(false);
    expect(insideAnyClaim(100, -50, [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recipe meta + gates (§4.1/§4.2/§6.1)
// ---------------------------------------------------------------------------

describe('recipe meta overlay', () => {
  it('field recipes stay instant; station recipes gain timers', () => {
    for (const r of Object.values(FIELD_RECIPES)) expect(isInstant(r)).toBe(true);
    expect(isInstant(STATION_RECIPES.r_reload_9mm)).toBe(false);
    expect(recipeDurationMin(STATION_RECIPES.r_reload_9mm)).toBe(1);
    expect(recipeMeta(TURRET_RECIPE).timeSec).toBe(10 * 3600);
  });

  it('turret def matches §4.3 exactly', () => {
    expect(TURRET_DEF.cost).toEqual([
      { itemId: 'gun_parts', qty: 6 },
      { itemId: 'circuit_board', qty: 2 },
      { itemId: 'engine_part', qty: 1 },
    ]);
    expect(TURRET_DEF.blueprint).toBe('bp_turret');
    expect(TURRET_DEF.buildHours).toBe(10);
    expect(TURRET_DEF.stats).toMatchObject({ damage: 20, range: 30, rpm: 120, ammo: 'ammo_9mm', power: 0.8, mag: 100 });
    expect(TURRET_GHOST_SPEC.powerKw).toBe(0.8);
    expect(ALL_RECIPES.r_turret).toBe(TURRET_RECIPE);
  });
});

describe('checkCraft gates', () => {
  const suppressor = STATION_RECIPES.r_suppressor;
  const richBag = { gun_parts: 3 };

  it('passes at the bench with parts (skill gate inert without substrate)', () => {
    const check = checkCraft(suppressor, ctxWith({ bag: richBag, nearStation: 'workbench', nearStationTier: 1 }));
    expect(check.ok).toBe(true);
    expect(check.skillGate).toMatchObject({ skill: 'mechanics', need: 2, inert: true });
  });

  it('blocks on missing components, wrong station, low skill', () => {
    expect(checkCraft(suppressor, ctxWith({ bag: {}, nearStation: 'workbench', nearStationTier: 1 })).ok).toBe(false);
    const wrongStation = checkCraft(suppressor, ctxWith({ bag: richBag, nearStation: 'chemistry', nearStationTier: 1 }));
    expect(wrongStation.stationOk).toBe(false);
    const lowSkill = checkCraft(
      suppressor,
      ctxWith({ bag: richBag, nearStation: 'workbench', nearStationTier: 1, skillLevel: () => 1 }),
    );
    expect(lowSkill.skillOk).toBe(false);
    expect(lowSkill.skillGate).toMatchObject({ have: 1, inert: false });
    const metSkill = checkCraft(
      suppressor,
      ctxWith({ bag: richBag, nearStation: 'workbench', nearStationTier: 1, skillLevel: () => 2 }),
    );
    expect(metSkill.ok).toBe(true);
  });

  it('fabrication requires a tier-3 station', () => {
    const enginePart = STATION_RECIPES.r_engine_part;
    const bag = { scrap: 4, wire: 2 };
    const low = checkCraft(enginePart, ctxWith({ bag, nearStation: 'industrial', nearStationTier: 1 }));
    expect(low.tierOk).toBe(false);
    expect(low.ok).toBe(false);
    const full = checkCraft(enginePart, ctxWith({ bag, nearStation: 'industrial', nearStationTier: 3 }));
    expect(full.ok).toBe(true);
  });

  it('turret stacks every gate: blueprint, facility, skill, known item', () => {
    const bag = { gun_parts: 6, circuit_board: 2, engine_part: 1, bp_turret: 1 };
    const check = checkCraft(
      TURRET_RECIPE,
      ctxWith({
        bag,
        nearStation: 'industrial',
        nearStationTier: 3,
        facilities: ['machine_shop'],
        skillLevel: () => 5,
      }),
    );
    expect(check.blueprintOk).toBe(true);
    expect(check.facilityOk).toBe(true);
    expect(check.skillOk).toBe(true);
    // The turret item is Lane 6 data; it landed in merge stage 1, so the
    // result is known and the full gate stack passes. (On Lane 7's branch
    // this asserted resultKnown=false — that premise expired at the merge.)
    expect(check.resultKnown).toBe(true);
    expect(check.ok).toBe(true);

    const bare = checkCraft(TURRET_RECIPE, ctxWith({ nearStation: 'industrial', nearStationTier: 3 }));
    expect(bare.blueprintOk).toBe(false);
    expect(bare.facilityOk).toBe(false);
  });

  it('field recipes need no station', () => {
    const check = checkCraft(FIELD_RECIPES.r_bandage, ctxWith({ bag: { cloth: 2 } }));
    expect(check.ok).toBe(true);
  });
});

describe('xp + efficient hands (§6.1 parity)', () => {
  it('station craft pays 6 mechanics xp, +4 when the gate is ≥3', () => {
    expect(craftXpAward(STATION_RECIPES.r_reload_9mm)).toBe(6);
    expect(craftXpAward(TURRET_RECIPE)).toBe(10);
  });

  it('efficient hands refunds the first component on a <0.2 roll', () => {
    const r = STATION_RECIPES.r_reload_9mm;
    expect(efficientHandsRefund(r, ['me_efficient'], 0.1)).toBe('scrap');
    expect(efficientHandsRefund(r, ['me_efficient'], 0.5)).toBeNull();
    expect(efficientHandsRefund(r, [], 0.1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// timer engine
// ---------------------------------------------------------------------------

describe('timer engine (game-time)', () => {
  it('progress accrues and completes on schedule', () => {
    const job = startJob('r_engine_part', 60, 1000, 'j1');
    expect(jobProgress(job, 1000)).toBe(0);
    expect(jobProgress(job, 1030)).toBe(0.5);
    expect(isJobDone(job, 1059)).toBe(false);
    expect(isJobDone(job, 1060)).toBe(true);
    expect(jobProgress(job, 5000)).toBe(1); // clamps
  });

  it('combat interrupt banks progress; resume loses nothing', () => {
    let job = startJob('r_tire', 15, 0, 'j2');
    job = interruptJob(job, 6);
    expect(job.status).toBe('interrupted');
    expect(jobProgress(job, 9999)).toBeCloseTo(6 / 15); // frozen while interrupted
    job = resumeJob(job, 2000);
    expect(isJobDone(job, 2008)).toBe(false);
    expect(isJobDone(job, 2009)).toBe(true);
  });

  it('sleeping through a craft completes it (absolute-minute math)', () => {
    const job = startJob('r_medkit', 5, 1430, 'j3'); // starts 23:50 day 0
    const { completed } = tickJobs([job], 1440 + 480); // wake 08:00 day 1
    expect(completed).toHaveLength(1);
  });

  it('tickJobs partitions done from active', () => {
    const a = startJob('r_bat', 2, 0, 'a');
    const b = startJob('r_tire', 15, 0, 'b');
    const { active, completed } = tickJobs([a, b], 10);
    expect(completed.map((j) => j.uid)).toEqual(['a']);
    expect(active.map((j) => j.uid)).toEqual(['b']);
  });

  it('formatDurationMin reads as game time', () => {
    expect(formatDurationMin(0.5)).toBe('30s');
    expect(formatDurationMin(15)).toBe('15m');
    expect(formatDurationMin(600)).toBe('10h');
  });
});

// ---------------------------------------------------------------------------
// queue store end-to-end
// ---------------------------------------------------------------------------

describe('craft queue store', () => {
  beforeEach(() => {
    useGameStore.setState({
      inventory: [],
      equipped: { melee: null, ranged: null, pack: null },
      nearStation: null,
      toasts: [],
      daysElapsed: 0,
      timeMinutes: 600,
      dayStats: { kills: 0, crafts: 0, pickups: 0 },
    });
    useCraftQueue.setState({ jobs: [] });
  });

  function storeCtx(): CraftContext {
    const s = useGameStore.getState();
    return {
      countItem: (id) => s.countItem(id),
      nearStation: s.nearStation,
      nearStationTier: s.nearStation === 'industrial' ? 3 : 1,
      facilities: s.base?.facilities ?? [],
      skillLevel: () => undefined,
    };
  }

  it('enqueue consumes, tick grants on schedule', () => {
    const s = useGameStore.getState();
    s.addItem('scrap', 2, true);
    s.addItem('wire', 1, true);
    useGameStore.setState({ nearStation: 'workbench' });

    const refusal = useCraftQueue.getState().enqueue('r_reload_9mm', storeCtx());
    expect(refusal).toBeNull();
    expect(useGameStore.getState().countItem('scrap')).toBe(0);
    expect(useCraftQueue.getState().jobs).toHaveLength(1);

    useCraftQueue.getState().tick(); // same minute: not done
    expect(useGameStore.getState().countItem('ammo_9mm')).toBe(0);

    useGameStore.setState({ timeMinutes: 601 }); // +1 game minute = recipe time
    useCraftQueue.getState().tick();
    expect(useGameStore.getState().countItem('ammo_9mm')).toBe(6);
    expect(useCraftQueue.getState().jobs).toHaveLength(0);
    expect(useGameStore.getState().dayStats.crafts).toBe(1);
  });

  it('enqueue refuses when components are missing', () => {
    useGameStore.setState({ nearStation: 'workbench' });
    const refusal = useCraftQueue.getState().enqueue('r_reload_9mm', storeCtx());
    expect(refusal).toMatch(/Missing/);
    expect(useCraftQueue.getState().jobs).toHaveLength(0);
  });

  it('cancel refunds components in full', () => {
    const s = useGameStore.getState();
    s.addItem('scrap', 2, true);
    s.addItem('wire', 1, true);
    useGameStore.setState({ nearStation: 'workbench' });
    useCraftQueue.getState().enqueue('r_reload_9mm', storeCtx());
    const job = useCraftQueue.getState().jobs[0];
    useCraftQueue.getState().cancel(job.uid);
    expect(useGameStore.getState().countItem('scrap')).toBe(2);
    expect(useGameStore.getState().countItem('wire')).toBe(1);
  });

  it('interruptAll freezes jobs against the clock', () => {
    const s = useGameStore.getState();
    s.addItem('scrap', 2, true);
    s.addItem('wire', 1, true);
    useGameStore.setState({ nearStation: 'workbench' });
    useCraftQueue.getState().enqueue('r_reload_9mm', storeCtx());
    useCraftQueue.getState().interruptAll();
    useGameStore.setState({ timeMinutes: 700 }); // long past duration
    useCraftQueue.getState().tick();
    expect(useGameStore.getState().countItem('ammo_9mm')).toBe(0); // still frozen
    const job = useCraftQueue.getState().jobs[0];
    useCraftQueue.getState().resume(job.uid);
    // resume re-bases at 700 with the full minute still to run
    useGameStore.setState({ timeMinutes: 701 });
    useCraftQueue.getState().tick();
    expect(useGameStore.getState().countItem('ammo_9mm')).toBe(6);
  });
});
