// Lane 10: base systems — claims, heat/siege math, morale/upkeep,
// production staffing rules. BASE_DESIGN §3 + SYSTEMS_SPEC §5.4/§7.
import { describe, expect, it } from 'vitest';
import {
  CLAIM_SITES, TIERED_FACILITIES, claimSite, outpostLimit, heatV2, heatTier, defenseScore,
  stockpileHeatValue, tieredFacility,
} from '../data/base';
import {
  newClaimsState, applyClaim, claimChecklist, claimReady, relocationQuote,
  applyRelocation, computeHeat, siegeForecast, planSiegeWaves, productionPerHour,
  powerBudget, stockpileView, baseSummary, jobBoard, facilityCard,
  type BaseInstance, type ClaimsState,
} from '../systems/baseClaims';
import {
  applyUpkeep, dailyMoraleTick, moraleEvent, newMoraleRuntime,
  moraleProductionMult, jobProductionMult, foodUseMult, upkeepCoverageDays,
} from '../systems/morale';
import type { SurvivorDef } from '../data/survivors';

function surv(id: string, over: Partial<SurvivorDef> = {}): SurvivorDef {
  return {
    id, name: id, age: 30, background: 'tester',
    skills: { combat: 1, mechanics: 1, medicine: 1, stealth: 1, driver: 1, scavenging: 1, leadership: 1 },
    traits: [], morale: 50, hp: 100, status: 'healthy', job: null, ...over,
  };
}

function homeBase(over: Partial<BaseInstance> = {}): BaseInstance {
  return {
    siteId: 'shore_camp', role: 'home',
    facilities: [{ defId: 'command_post', tier: 1, staffId: null, paused: false }],
    prefabs: [], stockpile: [], ...over,
  };
}

const CTX = { recruits: 0, rep: {}, husksWithin40m: 0, wallet: [] };

describe('claim sites (§3.1)', () => {
  it('the claim set matches the design table; lighthouse + wreck are NEVER', () => {
    const byId = Object.fromEntries(CLAIM_SITES.map((s) => [s.poiId, s]));
    expect(byId.shore_camp.facilitySlots).toBe(3);
    expect(byId.jonah_camp.facilitySlots).toBe(4);
    expect(byId.town.facilitySlots).toBe(6);
    expect(byId.relay_station.klass).toBe('outpost');
    expect(byId.forest_cache.klass).toBe('field');
    expect(byId.dune_cache.klass).toBe('field');
    expect(byId.military_base.heavyBay).toBe(true);
    expect(byId.lighthouse_base.klass).toBe('never');
    expect(byId.wreck.klass).toBe('never');
  });

  it('outpost limit is Command Post tier + 1, capped at 4', () => {
    expect(outpostLimit(1)).toBe(2);
    expect(outpostLimit(2)).toBe(3);
    expect(outpostLimit(3)).toBe(4);
    expect(outpostLimit(9)).toBe(4);
  });

  it('shore camp claims free and clean; a husk nearby blocks it', () => {
    const site = claimSite('shore_camp')!;
    const ok = claimChecklist(site, newClaimsState(), CTX);
    expect(claimReady(ok)).toBe(true);
    const dirty = claimChecklist(site, newClaimsState(), { ...CTX, husksWithin40m: 2 });
    expect(claimReady(dirty)).toBe(false);
  });

  it('town shows BOTH paths: rep path and war path, either satisfies', () => {
    const site = claimSite('town')!;
    const rich = { ...CTX, recruits: 3, wallet: [{ itemId: 'scrap', qty: 40 }] };
    const neither = claimChecklist(site, newClaimsState(), rich);
    expect(claimReady(neither)).toBe(false);
    expect(neither.find((c) => c.id === 'path_rep')?.ok).toBe(false);
    expect(neither.find((c) => c.id === 'path_war')?.ok).toBe(false);
    const viaRep = claimChecklist(site, newClaimsState(), { ...rich, rep: { union: 25 } });
    expect(claimReady(viaRep)).toBe(true);
    const viaWar = claimChecklist(site, newClaimsState(), { ...rich, byForce: true });
    expect(claimReady(viaWar)).toBe(true);
    // crew gate is independent of the paths
    const noCrew = claimChecklist(site, newClaimsState(), { ...rich, recruits: 2, rep: { union: 90 } });
    expect(claimReady(noCrew)).toBe(false);
  });

  it('outposts need a home and respect the slot limit', () => {
    const relay = claimSite('relay_station')!;
    const wallet = [{ itemId: 'scrap', qty: 20 }, { itemId: 'wire', qty: 10 }];
    expect(claimReady(claimChecklist(relay, newClaimsState(), { ...CTX, wallet }))).toBe(false);
    let st: ClaimsState = applyClaim(newClaimsState(), 'shore_camp');
    st = applyClaim(st, 'relay_station');
    st = applyClaim(st, 'forest_cache');
    expect(st.outposts.length).toBe(2); // CP T1 limit
    const third = claimChecklist(claimSite('dune_cache')!, st, { ...CTX, wallet: [{ itemId: 'scrap', qty: 10 }] });
    expect(claimReady(third)).toBe(false);
  });

  it('applyClaim installs Command Post T1 with the claim', () => {
    const st = applyClaim(newClaimsState(), 'jonah_camp');
    expect(st.home?.facilities).toEqual([{ defId: 'command_post', tier: 1, staffId: null, paused: false }]);
  });
});

describe('relocation (§3.2/§7.9)', () => {
  it('refunds 70% of facility + prefab materials, stockpile does not teleport', () => {
    const st: ClaimsState = {
      home: homeBase({
        facilities: [
          { defId: 'command_post', tier: 1, staffId: null, paused: false },
          { defId: 'garden', tier: 1, staffId: null, paused: false }, // 8 wood
          { defId: 'storage', tier: 2, staffId: null, paused: false }, // T1 8w4s + T2 20s10w
        ],
        prefabs: [{ defId: 'palisade_wall' }], // 3 wood
        stockpile: [{ itemId: 'scrap', qty: 10 }], // 3kg of scrap (0.3kg each)
      }),
      outposts: [],
    };
    const q = relocationQuote(st);
    const wood = q.refund.find((r) => r.itemId === 'wood');
    const scrap = q.refund.find((r) => r.itemId === 'scrap');
    // wood paid: 8 + 8 + 10 + 3 = 29 → 70% floor = 20; scrap paid: 4 + 20 = 24 → 16
    expect(wood?.qty).toBe(20);
    expect(scrap?.qty).toBe(16);
    expect(q.strandedStockpileKg).toBeCloseTo(3);
    const moved = applyRelocation(st, 'jonah_camp');
    expect(moved.state.home?.siteId).toBe('jonah_camp');
    expect(moved.state.home?.stockpile).toEqual([]);
    expect(moved.stranded).toEqual([{ itemId: 'scrap', qty: 10 }]);
  });
});

describe('heat (§3.7)', () => {
  it('the formula is sodgame\u2019s: stockpile\u00d71.2 + defense\u00d70.8 + days\u00d70.5 + kills\u00d70.2', () => {
    expect(heatV2(100, 10, 10)).toBe(133);
    expect(heatV2(0, 0, 0)).toBe(0);
    expect(heatV2(0, 0, 0, 5)).toBe(1);
  });

  it('thresholds: 30 scouts, 60 warning, 90 escalated', () => {
    expect(heatTier(29)).toBe('calm');
    expect(heatTier(30)).toBe('scout');
    expect(heatTier(59)).toBe('scout');
    expect(heatTier(60)).toBe('warning');
    expect(heatTier(89)).toBe('warning');
    expect(heatTier(90)).toBe('siege');
    expect(siegeForecast(65).state).toBe('warning');
    expect(siegeForecast(95).specials).toBe(true);
  });

  it('stockpile value uses the §3.7 tax table (valuables 15, gun_parts 12, food 2)', () => {
    expect(stockpileHeatValue([
      { itemId: 'valuables', qty: 1 }, { itemId: 'gun_parts', qty: 1 },
      { itemId: 'canned_food', qty: 2 }, { itemId: 'scrap', qty: 3 },
    ])).toBe(15 + 12 + 4 + 3);
    expect(stockpileHeatValue([{ itemId: 'rock', qty: 5 }])).toBe(0); // unlisted = untaxed
  });

  it('defense RAISES heat in this formula — and wins the siege anyway', () => {
    const bare = defenseScore({ prefabIds: [], staffedGuards: 0, garageTier: 0 });
    const fort = defenseScore({ prefabIds: ['palisade_wall', 'watchtower', 'gate'], staffedGuards: 2, garageTier: 2 });
    expect(bare).toBe(0);
    expect(fort).toBe(1 + 8 + 2 + 12 + 5);
    expect(heatV2(50, fort, 0)).toBeGreaterThan(heatV2(50, bare, 0));
    // guard contribution caps at +18
    expect(defenseScore({ prefabIds: [], staffedGuards: 9, garageTier: 0 })).toBe(18);
  });

  it('computeHeat integrates stockpile + defense + days', () => {
    const base = homeBase({ stockpile: [{ itemId: 'medkit', qty: 2 }] }); // value 16 → 19.2
    const r = computeHeat(base, [], 10);
    expect(r.stockpileValue).toBe(16);
    expect(r.heat).toBe(24); // round(19.2 + 0 + 5)
  });

  it('siege waves: none when calm, walkers at tier 1, specials at tier 2', () => {
    const rng = () => 0.99; // rng high: specials roll (needs <0.3) never fires
    expect(planSiegeWaves(siegeForecast(10), rng)).toEqual([]);
    const t1 = planSiegeWaves(siegeForecast(65), rng);
    expect(t1.length).toBe(3);
    expect(t1.every((w) => w.kinds.every((k) => k === 'shambler' || k === 'stalker'))).toBe(true);
    const t2 = planSiegeWaves(siegeForecast(95), () => 0.1);
    expect(t2.length).toBe(4);
    expect(t2.some((w) => w.kinds.some((k) => !['shambler', 'stalker'].includes(k)))).toBe(true);
  });
});

describe('morale + upkeep (§5.4/§3.5)', () => {
  it('upkeep eats 2 food + 1 water per survivor per day, perishables first', () => {
    const stock = [
      { itemId: 'canned_food', qty: 2 }, { itemId: 'produce', qty: 2 }, { itemId: 'water_bottle', qty: 2 },
    ];
    const crew = [surv('a'), surv('b')];
    const r = applyUpkeep(stock, crew);
    expect(r.fedIds).toEqual(['a', 'b']);
    expect(r.need).toEqual({ food: 4, water: 2 });
    // produce (2) eaten before canned (2): both gone; water gone
    expect(r.stockpile).toEqual([]);
  });

  it('when the pile runs dry, the end of the roster goes hungry', () => {
    const stock = [{ itemId: 'canned_food', qty: 2 }, { itemId: 'water_bottle', qty: 2 }];
    const r = applyUpkeep(stock, [surv('a'), surv('b')]);
    expect(r.fedIds).toEqual(['a']);
    expect(r.hungryIds).toEqual(['b']);
  });

  it('iron stomach genuinely eats less at crew scale; strong back more', () => {
    const is = surv('is', { traits: ['iron_stomach'] });
    const sb = surv('sb', { traits: ['strong_back'] });
    expect(foodUseMult(is)).toBeCloseTo(0.75);
    expect(foodUseMult(sb)).toBeCloseTo(1.2);
    const stock = [{ itemId: 'canned_food', qty: 3 }, { itemId: 'water_bottle', qty: 2 }];
    const r = applyUpkeep(stock, [is, surv('x')]); // need = round(1.5 + 2) = 4 > 3 in pile
    expect(r.need.food).toBe(4);
    expect(r.hungryIds.length).toBe(1);
    const pile = [{ itemId: 'canned_food', qty: 5 }];
    const backs = [sb, surv('s2', { traits: ['strong_back'] }), surv('s3', { traits: ['strong_back'] }), surv('s4', { traits: ['strong_back'] })];
    const stomachs = [is, surv('i2', { traits: ['iron_stomach'] }), surv('i3', { traits: ['iron_stomach'] }), surv('i4', { traits: ['iron_stomach'] })];
    expect(upkeepCoverageDays(pile, backs).food).toBeLessThan(upkeepCoverageDays(pile, stomachs).food);
  });

  it('daily tick: fed +2, hungry \u22124, comfort \u22652 +1, trait drift applies', () => {
    const crew = [surv('fed'), surv('hungry'), surv('opt', { traits: ['optimist'] })];
    const r = dailyMoraleTick(crew, newMoraleRuntime(), { fedIds: ['fed', 'opt'], comfort: 2 });
    const byId = Object.fromEntries(r.survivors.map((s) => [s.id, s.morale]));
    expect(byId.fed).toBe(53); // 50 + 2 + 1
    expect(byId.hungry).toBe(47); // 50 − 4 + 1
    expect(byId.opt).toBe(54); // 50 + 2 + 1 + 1 drift
  });

  it('idle + hungry: the idle penalty lands at day 3, and 3 Breaking days walks', () => {
    let rt = newMoraleRuntime();
    let crew = [surv('idle', { morale: 15 })]; // no job, never fed: −4/day
    const path: number[] = [];
    let left: string[] = [];
    for (let d = 0; d < 3; d++) {
      const r = dailyMoraleTick(crew, rt, { fedIds: [], comfort: 0 });
      crew = r.survivors; rt = r.runtime; left = r.leftIds;
      if (crew[0]) path.push(crew[0].morale);
    }
    // day1: 15−4=11 (idle day 1, no penalty) · day2: 7 (idle day 2) ·
    // day3: −4 −1 idle = 2, third consecutive Breaking day → walks.
    expect(path).toEqual([11, 7]);
    expect(left).toEqual(['idle']);
    expect(crew).toEqual([]);
  });

  it('climbing out of Breaking before the third day resets the fuse', () => {
    let rt = newMoraleRuntime();
    let crew = [surv('down', { morale: 19, job: 'Builder' })];
    for (let d = 0; d < 3; d++) {
      const r = dailyMoraleTick(crew, rt, { fedIds: ['down'], comfort: 2 }); // +2 fed +1 comfort
      crew = r.survivors; rt = r.runtime;
      expect(r.leftIds).toEqual([]);
    }
    expect(crew[0].morale).toBe(28); // 19 + 3×3 — out of Breaking on day 1, fuse reset
    expect(rt.breakingDays['down']).toBe(0);
  });

  it('morale events: siege win +3, loss −6, death −10, recruit +2', () => {
    const crew = [surv('a', { morale: 50 })];
    expect(moraleEvent(crew, 'siegeWin')[0].morale).toBe(53);
    expect(moraleEvent(crew, 'siegeLoss')[0].morale).toBe(44);
    expect(moraleEvent(crew, 'death')[0].morale).toBe(40);
    expect(moraleEvent(crew, 'recruit')[0].morale).toBe(52);
  });

  it('production mult bands: Content 1.1, Neutral 1.0, Unhappy 0.75, Breaking 0.5', () => {
    expect(moraleProductionMult(80)).toBe(1.1);
    expect(moraleProductionMult(50)).toBe(1.0);
    expect(moraleProductionMult(30)).toBe(0.75);
    expect(moraleProductionMult(10)).toBe(0.5);
    expect(jobProductionMult(surv('f', { traits: ['green_thumb'] }), 'Farmer')).toBeCloseTo(1.3);
    expect(jobProductionMult(surv('f', { traits: ['green_thumb'] }), 'Medic')).toBe(1);
  });
});

describe('facilities: power + production (§3.3/§3.5)', () => {
  it('power budget: generator capacity vs draws; overdraw stalls production', () => {
    const base = homeBase({
      facilities: [
        { defId: 'command_post', tier: 1, staffId: null, paused: false },
        { defId: 'generator', tier: 1, staffId: null, paused: false }, // 1.5 kW
        { defId: 'water', tier: 3, staffId: null, paused: false }, // 0.8 kW, 2.0/hr
        { defId: 'garden', tier: 3, staffId: 'f1', paused: false }, // 0.8 kW → total 1.6 > 1.5
      ],
    });
    expect(powerBudget(base).ok).toBe(false);
    expect(productionPerHour(base, [surv('f1', { job: 'Farmer' })]).produce).toBeUndefined();
  });

  it('staffing tax: unstaffed T1 trickles at 25%, unstaffed T2+ produces nothing', () => {
    const t1 = homeBase({ facilities: [{ defId: 'garden', tier: 1, staffId: null, paused: false }] });
    expect(productionPerHour(t1, []).produce).toBeCloseTo(0.8 * 0.25);
    const t2 = homeBase({
      facilities: [
        { defId: 'generator', tier: 2, staffId: null, paused: false }, // power for the 0.4kW draw
        { defId: 'garden', tier: 2, staffId: null, paused: false },
      ],
    });
    expect(productionPerHour(t2, []).produce).toBeUndefined();
    const staffed = homeBase({
      facilities: [
        { defId: 'generator', tier: 2, staffId: null, paused: false },
        { defId: 'garden', tier: 2, staffId: 'f1', paused: false },
      ],
    });
    const farmer = surv('f1', { job: 'Farmer', traits: ['green_thumb'] });
    expect(productionPerHour(staffed, [farmer]).produce).toBeCloseTo(1.6 * 1.3);
  });

  it('a sick staffer pauses production; a paused facility produces nothing', () => {
    const base = homeBase({ facilities: [{ defId: 'garden', tier: 1, staffId: 'f1', paused: false }] });
    expect(productionPerHour(base, [surv('f1', { job: 'Farmer', status: 'sick' })]).produce).toBeUndefined();
    const paused = homeBase({ facilities: [{ defId: 'garden', tier: 1, staffId: 'f1', paused: true }] });
    expect(productionPerHour(paused, [surv('f1', { job: 'Farmer' })]).produce).toBeUndefined();
  });

  it('facility cards carry honest gates (§7.3)', () => {
    const base = homeBase();
    const t2 = facilityCard('shore_camp', base, 'garden', { builders: 0, jobsPresent: [], blueprints: [] });
    expect(t2?.tier).toBe(1); // first build is T1 (solo)
    expect(t2?.gate).toBe('solo');
    const withGarden = homeBase({ facilities: [{ defId: 'garden', tier: 1, staffId: null, paused: false }] });
    const up = facilityCard('shore_camp', withGarden, 'garden', { builders: 0, jobsPresent: [], blueprints: [] });
    expect(up?.tier).toBe(2);
    expect(up?.gateMet).toBe(false);
    expect(up?.gateText).toContain('Builder');
    const upOk = facilityCard('shore_camp', withGarden, 'garden', { builders: 1, jobsPresent: [], blueprints: [] });
    expect(upOk?.gateMet).toBe(true);
    // salvage rig refuses inland sites
    expect(facilityCard('jonah_camp', base, 'salvage_rig', { builders: 1, jobsPresent: [], blueprints: [] })?.siteAllowed).toBe(false);
  });

  it('every tiered facility tier is costed, gated, effected; every T3 is the blueprint chase (§3.5)', () => {
    for (const def of TIERED_FACILITIES) {
      expect(def.tiers.length).toBeGreaterThan(0);
      for (const t of def.tiers) {
        expect(t.buildHours).toBeGreaterThanOrEqual(0);
        expect(t.effectText.length).toBeGreaterThan(4);
        if (t.tier === 3) {
          expect(t.gate).toBe('builder_specialist_blueprint');
          expect(t.blueprintId).toBeTruthy();
        }
      }
    }
    expect(tieredFacility('salvage_rig')?.siteRestriction).toEqual(['shore_camp', 'town']);
  });

  it('stockpile view groups by category with per-item heat and a real cap', () => {
    const base = homeBase({ stockpile: [{ itemId: 'scrap', qty: 10 }, { itemId: 'medkit', qty: 1 }] });
    const v = stockpileView(base);
    expect(v.capKg).toBe(100); // no Storage yet — pile by the flag
    expect(v.totalHeatValue).toBe(10 + 8);
    expect(v.categories.flatMap((c) => c.items).length).toBe(2);
  });

  it('summary alerts fire on unstaffed T2+, missing water, siege warning', () => {
    const base = homeBase({
      facilities: [
        { defId: 'command_post', tier: 1, staffId: null, paused: false },
        { defId: 'garden', tier: 2, staffId: null, paused: false },
      ],
      stockpile: [{ itemId: 'valuables', qty: 6 }], // value 90 → heat ≥ 108 + days
    });
    const s = baseSummary(base, [surv('a')], 5);
    expect(s.alerts.some((a) => a.includes('unstaffed'))).toBe(true);
    expect(s.alerts.some((a) => a.includes('no water'))).toBe(true);
    expect(s.alerts.some((a) => a.includes('Siege'))).toBe(true);
    expect(s.heatTier).toBe('siege');
  });

  it('job board readiness: guards + ammo + defense make the verdict', () => {
    const oneGuard = [surv('g1', { job: 'Guard' })];
    const base = homeBase({
      prefabs: [{ defId: 'watchtower', staffId: 'g1' }],
      stockpile: [{ itemId: 'ammo_9mm', qty: 50 }],
    });
    const heat = computeHeat(base, oneGuard, 0);
    expect(heat.defense).toBe(14); // tower 8 + one distinct guard 6 (posted ≠ double-counted)
    const thin = jobBoard(base, oneGuard, heat);
    expect(thin.guardPosts[0].staffed).toBe(true);
    expect(thin.siegeReadiness.projectedBurn).toBe(40);
    expect(thin.siegeReadiness.verdict).toBe('thin'); // defense 14 < 15
    const twoGuards = [surv('g1', { job: 'Guard' }), surv('g2', { job: 'Guard' })];
    const rich = homeBase({
      prefabs: [{ defId: 'watchtower', staffId: 'g1' }],
      stockpile: [{ itemId: 'ammo_9mm', qty: 90 }],
    });
    const ready = jobBoard(rich, twoGuards, computeHeat(rich, twoGuards, 0));
    expect(ready.siegeReadiness.verdict).toBe('ready'); // defense 20, ammo 90 ≥ burn 80
    const naked = jobBoard(homeBase(), [], computeHeat(homeBase(), [], 0));
    expect(naked.siegeReadiness.verdict).toBe('exposed');
  });
});
