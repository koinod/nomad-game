// Lane 13 — unit tests for the dispatch re-enable layer: fuel burn,
// instance-keyed assignment planning, territory risk, census filtering.
// Seeded/constant rng only; the sim stays pure.
import { describe, expect, it } from 'vitest';
import {
  DISPATCH_POIS,
  DISPATCH_VEHICLE_DATA,
  FUEL_RESERVE_L,
  dispatchFuelLiters,
  dispatchPoisAvailable,
  dispatchVehicleData,
  effectiveRiskChance,
  planDispatch,
  recallFuelLiters,
  resolveDispatch,
  riskChance,
  survivorBusy,
  territoryRiskDelta,
  trailerBusy,
  vehicleBusy,
  type DispatchPlanRequest,
  type DispatchVehicleOption,
} from '../data/dispatch';
import { VEHICLE_DEFS } from '../game/Vehicles';

describe('DISPATCH_VEHICLE_DATA sync with Vehicles.ts', () => {
  it('has a row for every vehicle def, with matching tank and burn class', () => {
    for (const def of VEHICLE_DEFS) {
      const row = DISPATCH_VEHICLE_DATA[def.id];
      expect(row, `missing dispatch fuel row for def ${def.id}`).toBeDefined();
      expect(row.tankLiters).toBe(def.fuelMax);
      expect(row.burnClass).toBe(def.burnClass);
    }
  });

  it('unknown defs fall back to the default row', () => {
    expect(dispatchVehicleData('nope').tankLiters).toBeGreaterThan(0);
  });
});

describe('dispatchFuelLiters', () => {
  it('matches the hand-computed round trip for the Stallion', () => {
    // 1000 m each way = 2 km × 0.55 L/km × 1.1 burnClass = 1.21 → 1.2
    expect(dispatchFuelLiters(1000, 1.1, 'scavenge', 0)).toBe(1.2);
  });

  it('grows with distance; escort burns most, scout least', () => {
    const near = dispatchFuelLiters(300, 1.1, 'scavenge', 0);
    const far = dispatchFuelLiters(1300, 1.1, 'scavenge', 0);
    expect(far).toBeGreaterThan(near);
    expect(dispatchFuelLiters(800, 1.1, 'escort', 0)).toBeGreaterThan(dispatchFuelLiters(800, 1.1, 'scavenge', 0));
    expect(dispatchFuelLiters(800, 1.1, 'scout', 0)).toBeLessThan(dispatchFuelLiters(800, 1.1, 'scavenge', 0));
  });

  it('a skilled driver burns less, floored at −20%', () => {
    const rookie = dispatchFuelLiters(1000, 1.1, 'scavenge', 0);
    const pro = dispatchFuelLiters(1000, 1.1, 'scavenge', 10);
    const ace = dispatchFuelLiters(1000, 1.1, 'scavenge', 99);
    expect(pro).toBeLessThan(rookie);
    expect(ace).toBeCloseTo(rookie * 0.8, 1);
  });

  it('a cross-island run is a real but survivable bite of a tank', () => {
    const burn = dispatchFuelLiters(1400, 1.1, 'scavenge', 3);
    expect(burn).toBeGreaterThan(1);
    expect(burn).toBeLessThan(61 * 0.1);
  });
});

describe('recallFuelLiters', () => {
  it('never less than a quarter of the plan, never more than all of it', () => {
    expect(recallFuelLiters(2, 0)).toBe(0.5);
    expect(recallFuelLiters(2, 0.5)).toBe(1);
    expect(recallFuelLiters(2, 1)).toBe(2);
    expect(recallFuelLiters(2, 7)).toBe(2);
  });
});

describe('busy checks — instance ids vs legacy defId rows', () => {
  const optA: DispatchVehicleOption = {
    instanceId: 'veh-1', defId: 'mustang', name: 'Stallion FX',
    fuelLiters: 40, tankLiters: 61, burnClass: 1.1, conditionPct: 90,
    freeKg: 30, playerAboard: false,
  };
  const optB = { ...optA, instanceId: 'veh-2' }; // second Stallion, same def

  it('an instance-keyed row blocks only that physical vehicle', () => {
    const active = [{ survivorId: 's1', vehicleInstanceId: 'veh-1', vehicleDefId: 'mustang' }];
    expect(vehicleBusy(active, optA)).toBe(true);
    expect(vehicleBusy(active, optB)).toBe(false); // THE wave-3 limitation, fixed
  });

  it('a legacy defId-only row still blocks the model line', () => {
    const active = [{ survivorId: 's1', vehicleDefId: 'mustang' }];
    expect(vehicleBusy(active, optA)).toBe(true);
    expect(vehicleBusy(active, optB)).toBe(true);
  });

  it("today's adapter (instanceId === defId) matches legacy rows", () => {
    const active = [{ survivorId: 's1', vehicleDefId: 'mustang', trailerDefId: 'box_trailer' }];
    expect(vehicleBusy(active, { instanceId: 'mustang', defId: 'mustang' })).toBe(true);
    expect(vehicleBusy(active, { instanceId: 'gt500', defId: 'gt500' })).toBe(false);
    expect(trailerBusy(active, { instanceId: 'box_trailer', defId: 'box_trailer' })).toBe(true);
    expect(trailerBusy(active, { instanceId: 'tanker', defId: 'tanker' })).toBe(false);
  });

  it('survivor busy is a plain id match', () => {
    const active = [{ survivorId: 's1', vehicleDefId: 'mustang' }];
    expect(survivorBusy(active, 's1')).toBe(true);
    expect(survivorBusy(active, 's2')).toBe(false);
  });
});

describe('planDispatch', () => {
  const vehicle: DispatchVehicleOption = {
    instanceId: 'veh-1', defId: 'mustang', name: 'Stallion FX',
    fuelLiters: 40, tankLiters: 61, burnClass: 1.1, conditionPct: 90,
    freeKg: 30, playerAboard: false,
  };
  const req: DispatchPlanRequest = {
    survivorId: 's1', survivorHp: 80, driverSkill: 3,
    vehicle, trailer: null, task: 'scavenge', destPoiId: 'town',
    distM: 600, heat: 20, territory: null, active: [], nowMin: 1440,
  };

  it('a clean plan previews duration, risk and fuel that the sim will use', () => {
    const plan = planDispatch(req);
    expect(plan.ok).toBe(true);
    expect(plan.reasons).toEqual([]);
    expect(plan.etaMin).toBe(1440 + plan.durationMin);
    expect(plan.risk).toBeCloseTo(riskChance(600, 20, 'scavenge'), 10);
    expect(plan.fuelLiters).toBe(dispatchFuelLiters(600, 1.1, 'scavenge', 3));
    expect(plan.cargoKg).toBe(30);
    // preview parity: the resolve burns exactly the previewed liters
    const out = resolveDispatch({
      task: 'scavenge', destPoiId: 'town', distM: 600, heat: 20,
      scavenging: 5, driver: 3, combat: 2, traits: [], freeKg: 200,
      rng: () => 0.99, burnClass: 1.1,
    });
    expect(out.fuelBurnedLiters).toBe(plan.fuelLiters);
  });

  it('a trailer adds its room to the cargo preview', () => {
    const plan = planDispatch({
      ...req,
      trailer: { instanceId: 'tr-1', defId: 'box_trailer', name: 'Box Trailer', freeKg: 120, hitchedToId: 'veh-1' },
    });
    expect(plan.cargoKg).toBe(150);
  });

  it('blocks on low fuel with the reserve counted, in liters', () => {
    const thirsty = planDispatch({ ...req, vehicle: { ...vehicle, fuelLiters: 2.5 }, distM: 1300 });
    expect(thirsty.ok).toBe(false);
    expect(thirsty.reasons.join(' ')).toMatch(/Not enough fuel/);
    expect(thirsty.fuelAfterLiters).toBeLessThan(FUEL_RESERVE_L);
    // exactly enough (burn + reserve) passes
    const burn = dispatchFuelLiters(1300, 1.1, 'scavenge', 3);
    const exact = planDispatch({ ...req, vehicle: { ...vehicle, fuelLiters: burn + FUEL_RESERVE_L }, distM: 1300 });
    expect(exact.ok).toBe(true);
  });

  it('warns (not blocks) when the vehicle comes home on fumes', () => {
    const burn = dispatchFuelLiters(600, 1.1, 'scavenge', 3);
    const plan = planDispatch({ ...req, vehicle: { ...vehicle, fuelLiters: burn + FUEL_RESERVE_L + 1 } });
    expect(plan.ok).toBe(true);
    expect(plan.warnings.join(' ')).toMatch(/fumes/);
  });

  it('blocks the store-rule cases: hurt, aboard, wrecked, busy, no route', () => {
    expect(planDispatch({ ...req, survivorHp: 29 }).ok).toBe(false);
    expect(planDispatch({ ...req, vehicle: { ...vehicle, playerAboard: true } }).reasons.join(' ')).toMatch(/sitting in/);
    expect(planDispatch({ ...req, vehicle: { ...vehicle, conditionPct: 0 } }).ok).toBe(false);
    expect(planDispatch({ ...req, active: [{ survivorId: 's9', vehicleInstanceId: 'veh-1' }] }).ok).toBe(false);
    expect(planDispatch({ ...req, active: [{ survivorId: 's1', vehicleDefId: 'gt500' }] }).ok).toBe(false);
    const noRoute = planDispatch({ ...req, distM: null });
    expect(noRoute.ok).toBe(false);
    expect(noRoute.durationMin).toBe(0);
    expect(noRoute.fuelLiters).toBe(0);
  });

  it('two same-model vehicles can be out at once (instance planning)', () => {
    const active = [{ survivorId: 's1', vehicleInstanceId: 'veh-1', vehicleDefId: 'mustang' }];
    const plan = planDispatch({ ...req, survivorId: 's2', vehicle: { ...vehicle, instanceId: 'veh-2' }, active });
    expect(plan.ok).toBe(true);
  });
});

describe('territory risk', () => {
  it('orders hostile > neutral > friendly > home and keeps the clamps', () => {
    const home = { poiId: 'town', factionId: 'union', stance: 'home' as const };
    const hostile = { poiId: 'town', factionId: 'skulls', stance: 'hostile' as const };
    const neutral = riskChance(600, 20, 'scavenge');
    expect(effectiveRiskChance(600, 20, 'scavenge', hostile)).toBeGreaterThan(neutral);
    expect(effectiveRiskChance(600, 20, 'scavenge', home)).toBeLessThan(neutral);
    expect(territoryRiskDelta(null)).toBe(0);
    expect(effectiveRiskChance(0, 0, 'scout', home)).toBeGreaterThanOrEqual(0.05);
    expect(effectiveRiskChance(99999, 999, 'escort', hostile)).toBeLessThanOrEqual(0.65);
  });

  it('resolve rolls against the territory-shifted risk', () => {
    // neutral risk for (600, 20, scavenge) is 0.35; hostile is 0.43.
    // A constant 0.40 roll: quiet on neutral ground, contact on hostile.
    const baseInp = {
      task: 'scavenge' as const, destPoiId: 'town', distM: 600, heat: 20,
      scavenging: 5, driver: 3, combat: 2, traits: [] as string[], freeKg: 200,
    };
    const quiet = resolveDispatch({ ...baseInp, rng: () => 0.4 });
    expect(quiet.eventText).toBeNull();
    const hot = resolveDispatch({
      ...baseInp,
      rng: () => 0.4,
      territory: { poiId: 'town', factionId: 'skulls', stance: 'hostile' },
    });
    expect(hot.eventText).not.toBeNull();
  });

  it('escort danger pay: hostile ground adds pay the same rolls deny on neutral ground', () => {
    // scripted rolls: risk (no event), pay roll (fails → base pay 1),
    // then the danger-pay roll (0.1 succeeds only where the branch exists)
    const queue = (rolls: number[]) => () => rolls.shift() ?? 0.99;
    const baseInp = {
      task: 'escort' as const, destPoiId: 'town', distM: 600, heat: 20,
      scavenging: 5, driver: 3, combat: 2, traits: [] as string[], freeKg: 500,
    };
    const total = (o: ReturnType<typeof resolveDispatch>) =>
      o.loot.filter((l) => l.itemId === 'valuables').reduce((a, l) => a + l.qty, 0);
    const neutral = resolveDispatch({ ...baseInp, rng: queue([0.9, 0.9, 0.9, 0.9, 0.9]) });
    const hostile = resolveDispatch({
      ...baseInp,
      rng: queue([0.9, 0.9, 0.1, 0.9, 0.9, 0.9]),
      territory: { poiId: 'town', factionId: 'skulls', stance: 'hostile' },
    });
    expect(total(neutral)).toBe(1);
    expect(total(hostile)).toBe(2);
  });
});

describe('census refresh', () => {
  it('dispatchPoisAvailable keeps only routed destinations, in census order', () => {
    const avail = dispatchPoisAvailable({ town: [40, 0], marina: [-605, 80], relay_switch: [338, -34] });
    expect(avail.map((p) => p.id)).toEqual(['marina', 'town']);
  });

  it('the census still matches the world POI set (incl. the carrier hulk)', () => {
    expect(DISPATCH_POIS.map((p) => p.id)).toEqual([
      'shore_camp', 'marina', 'jonah_camp', 'wreck', 'town', 'forest_cache',
      'relay_station', 'dune_cache', 'lighthouse_base', 'airbase', 'carrier',
    ]);
  });

  it('the stripped carrier yields salvage, not an armory', () => {
    const out = resolveDispatch({
      task: 'scavenge', destPoiId: 'carrier', distM: 900, heat: 20,
      scavenging: 5, driver: 3, combat: 2, traits: [], freeKg: 500, rng: () => 0.05,
    });
    const ammo = out.loot.find((l) => l.itemId === 'ammo_rifle');
    expect(out.loot.some((l) => l.itemId === 'scrap')).toBe(true);
    expect(ammo?.qty ?? 0).toBeLessThanOrEqual(8);
  });
});
