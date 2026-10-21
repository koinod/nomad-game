// dispatch.ts — wave 3 (P5 v1) crew dispatch math, extended by Lane 13
// (dispatch re-enable): fuel burn, vehicle-INSTANCE assignment planning,
// territory-aware risk, and the journal report voice. Pure and rng-injected
// so the whole system is unit-testable: durations, husk-risk, loot rolls,
// fuel, and feasibility are all decided here from numbers alone. The store
// owns state and side effects (engine storage, damage, morale, fuel tanks).

import { ITEMS } from './items';
import type { DispatchTask } from '../store/types';

export interface DispatchPoi {
  id: string;
  name: string;
  /** Status note shown in the dispatch UI (post-purge world state). */
  note?: string;
}

/** Destinations the crew can be sent to (sub-locations excluded).
 *  Census verified against World.ts POI_DEFS (the live poiPositions
 *  source): relay_switch and lighthouse_top are sub-locations of
 *  relay_station / lighthouse_base and stay excluded, as before. */
export const DISPATCH_POIS: DispatchPoi[] = [
  { id: 'shore_camp', name: 'Shore Camp' },
  { id: 'marina', name: 'The Marina' },
  { id: 'jonah_camp', name: "Jonah's Camp" },
  { id: 'wreck', name: 'The Wreck' },
  { id: 'town', name: 'Town' },
  { id: 'forest_cache', name: 'Forest Cache' },
  { id: 'relay_station', name: 'Relay Station' },
  { id: 'dune_cache', name: 'Dune Cache' },
  { id: 'lighthouse_base', name: 'The Lighthouse' },
  { id: 'airbase', name: 'The Depot' },
  { id: 'carrier', name: 'The Carrier', note: 'Stripped hulk — salvage only since the purge.' },
];

/** The census filtered to POIs a positions map (the store's poiPositions)
 *  actually knows — a destination with no plotted route is not offered. */
export function dispatchPoisAvailable(positions: Record<string, unknown>): DispatchPoi[] {
  return DISPATCH_POIS.filter((p) => positions[p.id] != null);
}

export function poiName(id: string): string {
  return DISPATCH_POIS.find((p) => p.id === id)?.name ?? id.replace(/_/g, ' ');
}

export const DISPATCH_TASKS: { id: DispatchTask; name: string; blurb: string }[] = [
  { id: 'scavenge', name: 'Scavenge', blurb: 'Strip the destination for parts and supplies. Loot rides home in the vehicle.' },
  { id: 'scout', name: 'Scout', blurb: 'Eyes only: report what is left standing there — containers untouched vs picked clean.' },
  { id: 'escort', name: 'Escort run', blurb: 'Shepherd a trader convoy to the destination and back. Pays in valuables; husks hunt convoys.' },
];

export function taskName(task: DispatchTask): string {
  return DISPATCH_TASKS.find((t) => t.id === task)?.name ?? task;
}

// ---------------------------------------------------------------------------
// Territory (Lane 9's data, consumed structurally — the sim never imports
// the territory module, so it works before/without it: absence = neutral).
// ---------------------------------------------------------------------------

export type TerritoryStance = 'home' | 'friendly' | 'neutral' | 'hostile';

export interface TerritoryInfo {
  poiId: string;
  /** Controlling faction id, null when unclaimed/contested. */
  factionId: string | null;
  stance: TerritoryStance;
}

/** Risk shift from whose ground the run crosses/works on. Home turf is
 *  patrolled and known; hostile ground is watched. */
export function territoryRiskDelta(t?: TerritoryInfo | null): number {
  switch (t?.stance) {
    case 'home': return -0.05;
    case 'friendly': return -0.02;
    case 'hostile': return 0.08;
    default: return 0;
  }
}

interface LootEntry {
  id: string;
  min: number;
  max: number;
  chance: number;
}

/** What a scavenging crew can physically find at each destination. */
const SCAVENGE_TABLES: Record<string, LootEntry[]> = {
  town: [
    { id: 'scrap', min: 2, max: 5, chance: 0.9 },
    { id: 'wire', min: 1, max: 3, chance: 0.7 },
    { id: 'cloth', min: 1, max: 3, chance: 0.7 },
    { id: 'canned_food', min: 1, max: 3, chance: 0.6 },
    { id: 'ammo_9mm', min: 4, max: 10, chance: 0.5 },
    { id: 'valuables', min: 1, max: 1, chance: 0.25 },
  ],
  marina: [
    { id: 'fuel_can', min: 1, max: 1, chance: 0.6 },
    { id: 'car_battery', min: 1, max: 1, chance: 0.5 },
    { id: 'scrap', min: 1, max: 4, chance: 0.8 },
    { id: 'tool_kit', min: 1, max: 1, chance: 0.2 },
  ],
  wreck: [
    { id: 'engine_part', min: 1, max: 1, chance: 0.6 },
    { id: 'tire', min: 1, max: 2, chance: 0.6 },
    { id: 'scrap', min: 2, max: 4, chance: 0.9 },
    { id: 'car_battery', min: 1, max: 1, chance: 0.4 },
  ],
  forest_cache: [
    { id: 'wood', min: 2, max: 5, chance: 0.9 },
    { id: 'produce', min: 1, max: 3, chance: 0.6 },
    { id: 'cloth', min: 1, max: 2, chance: 0.5 },
    { id: 'bandage', min: 1, max: 2, chance: 0.4 },
  ],
  relay_station: [
    { id: 'wire', min: 2, max: 4, chance: 0.8 },
    { id: 'scrap', min: 1, max: 3, chance: 0.8 },
    { id: 'ammo_9mm', min: 4, max: 8, chance: 0.5 },
    { id: 'gun_parts', min: 1, max: 2, chance: 0.35 },
  ],
  dune_cache: [
    { id: 'cloth', min: 1, max: 3, chance: 0.7 },
    { id: 'canned_food', min: 1, max: 2, chance: 0.6 },
    { id: 'water_bottle', min: 1, max: 2, chance: 0.6 },
    { id: 'valuables', min: 1, max: 1, chance: 0.3 },
  ],
  shore_camp: [
    { id: 'canned_food', min: 1, max: 2, chance: 0.8 },
    { id: 'water_bottle', min: 1, max: 2, chance: 0.7 },
    { id: 'wood', min: 1, max: 3, chance: 0.7 },
    { id: 'cloth', min: 1, max: 2, chance: 0.5 },
  ],
  jonah_camp: [
    { id: 'produce', min: 2, max: 4, chance: 0.8 },
    { id: 'canned_food', min: 1, max: 2, chance: 0.6 },
    { id: 'wood', min: 1, max: 3, chance: 0.6 },
    { id: 'cloth', min: 1, max: 2, chance: 0.5 },
  ],
  lighthouse_base: [
    { id: 'bandage', min: 1, max: 2, chance: 0.7 },
    { id: 'medkit', min: 1, max: 1, chance: 0.3 },
    { id: 'armor_plate', min: 1, max: 1, chance: 0.4 },
    { id: 'gun_parts', min: 1, max: 2, chance: 0.4 },
  ],
  airbase: [
    { id: 'gun_parts', min: 1, max: 3, chance: 0.7 },
    { id: 'ammo_rifle', min: 6, max: 14, chance: 0.6 },
    { id: 'armor_plate', min: 1, max: 2, chance: 0.5 },
    { id: 'engine_part', min: 1, max: 1, chance: 0.4 },
    { id: 'tool_kit', min: 1, max: 1, chance: 0.25 },
  ],
  // The purge stripped the carrier's structure; the hulk still yields
  // salvage, but it is no longer the armory it was in wave 3.
  carrier: [
    { id: 'scrap', min: 2, max: 5, chance: 0.9 },
    { id: 'engine_part', min: 1, max: 1, chance: 0.5 },
    { id: 'car_battery', min: 1, max: 1, chance: 0.5 },
    { id: 'tire', min: 1, max: 2, chance: 0.5 },
    { id: 'gun_parts', min: 1, max: 2, chance: 0.35 },
    { id: 'ammo_rifle', min: 4, max: 8, chance: 0.3 },
  ],
};

const SCAVENGE_DEFAULT: LootEntry[] = [
  { id: 'scrap', min: 1, max: 3, chance: 0.8 },
  { id: 'cloth', min: 1, max: 2, chance: 0.6 },
  { id: 'canned_food', min: 1, max: 2, chance: 0.5 },
];

/** Round-trip minutes: an off-road effective speed (driver skill helps),
 *  plus on-site work time. Clamped to a sane 40 min – 12 h window. */
export function dispatchDurationMin(distM: number, driverSkill: number, task: DispatchTask): number {
  const speed = 45 + driverSkill * 4; // meters per game-minute, effective
  const onSite = task === 'scout' ? 15 : task === 'escort' ? 35 : 45;
  return Math.max(40, Math.min(720, Math.round((distM * 2) / speed) + onSite));
}

/** Chance (0..1) of a husk-risk event on the run: distance and base heat
 *  draw attention; escort convoys are hunted (+8 pts). Territory shifts it
 *  further when the caller knows whose ground the destination is. */
export function riskChance(distM: number, heat: number, task: DispatchTask): number {
  return effectiveRiskChance(distM, heat, task, null);
}

export function effectiveRiskChance(
  distM: number,
  heat: number,
  task: DispatchTask,
  territory?: TerritoryInfo | null,
): number {
  const base = 0.1 + distM / 3000 + heat / 400 + (task === 'escort' ? 0.08 : 0) + territoryRiskDelta(territory);
  return Math.max(0.05, Math.min(0.65, base));
}

/** Human band for a risk probability (panel + journal share the words). */
export function riskBand(risk: number): 'low' | 'moderate' | 'high' | 'severe' {
  if (risk < 0.2) return 'low';
  if (risk < 0.35) return 'moderate';
  if (risk < 0.5) return 'high';
  return 'severe';
}

// ---------------------------------------------------------------------------
// Fuel — the wave-3 gap Lane 13 closes: dispatches burn real liters from
// the assigned vehicle's tank. Calibration: the engine's driving burn
// (Vehicles.ts burnClass-scaled) is deliberately thirsty; a dispatch is a
// loaded off-road round trip, priced at 0.55 L/km × burnClass, with the
// task/driver adjustments below. On this island (≤ ~1.4 km legs) a long
// run costs ~1.5–2.5 L of a 61 L tank — small per run, real over a week
// of runs, and it makes fuel_can loot matter to the crew economy.
// ---------------------------------------------------------------------------

/** Liters that must remain in the tank after a run (get-home reserve). */
export const FUEL_RESERVE_L = 2;

/** Per-def fuel data the sim needs, keyed by vehicle defId. Guarded by a
 *  sync test against Vehicles.ts VEHICLE_DEFS (fuelMax/burnClass) — adding
 *  a vehicle def without a row here fails that test loudly at integration.
 *  Unknown defs fall back to DISPATCH_VEHICLE_DEFAULT. */
export interface DispatchVehicleData {
  tankLiters: number;
  burnClass: number;
}

export const DISPATCH_VEHICLE_DATA: Record<string, DispatchVehicleData> = {
  mustang: { tankLiters: 61, burnClass: 1.1 }, // Stallion FX
};

export const DISPATCH_VEHICLE_DEFAULT: DispatchVehicleData = { tankLiters: 60, burnClass: 1 };

export function dispatchVehicleData(defId: string): DispatchVehicleData {
  return DISPATCH_VEHICLE_DATA[defId] ?? DISPATCH_VEHICLE_DEFAULT;
}

/** Round-trip liters for a dispatch: both legs at loaded off-road rates.
 *  Escort convoys run heavy and slow (+25%); a scout travels light (−10%).
 *  A skilled driver works the engine less (up to −20%). Deterministic —
 *  the preview IS the charge; there is no second roll at resolve time. */
export function dispatchFuelLiters(
  distM: number,
  burnClass: number,
  task: DispatchTask,
  driverSkill: number,
): number {
  const km = (distM * 2) / 1000;
  const taskFactor = task === 'escort' ? 1.25 : task === 'scout' ? 0.9 : 1;
  const driverFactor = Math.max(0.8, 1 - 0.02 * driverSkill);
  return Math.round(km * 0.55 * burnClass * taskFactor * driverFactor * 10) / 10;
}

/** Fuel actually burned by a run recalled partway: the crew drove out and
 *  back over the ground covered, and never less than a quarter of the
 *  plan (they at least left the yard and turned around somewhere). */
export function recallFuelLiters(plannedLiters: number, elapsedFrac: number): number {
  const frac = Math.max(0, Math.min(1, elapsedFrac));
  return Math.round(plannedLiters * Math.max(0.25, frac) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Assignment planning — by vehicle INSTANCE id, not defId. Wave 3 keyed
// everything on defId, which collapses the moment the fleet holds two of
// the same model. The planner takes instance-keyed options and matches
// busy-state tolerantly: a legacy dispatch row that only knows a defId
// still blocks that model line, an instance-keyed row blocks exactly one
// physical vehicle.
// ---------------------------------------------------------------------------

export interface DispatchVehicleOption {
  /** Unique per physical vehicle. (Today's fleet rows have no instance
   *  ids yet — callers pass defId as the instance id until Lane 5's
   *  FleetEntry.instanceId lands; the planner cannot tell the difference,
   *  which is the point.) */
  instanceId: string;
  defId: string;
  name: string;
  fuelLiters: number;
  tankLiters: number;
  burnClass: number;
  /** 0..100. */
  conditionPct: number;
  /** Free kilograms in this vehicle's own storage right now. */
  freeKg: number;
  /** The player is currently sitting in / driving this one. */
  playerAboard: boolean;
}

export interface DispatchTrailerOption {
  instanceId: string;
  defId: string;
  name: string;
  freeKg: number;
  /** Instance id (or legacy defId) of the vehicle towing it, if any. */
  hitchedToId: string | null;
}

/** Structural minimum of a Dispatch row for busy checks — accepts both
 *  legacy rows (defId only) and instance-keyed rows. */
export interface DispatchBusyRow {
  survivorId: string;
  vehicleDefId?: string;
  vehicleInstanceId?: string;
  trailerDefId?: string | null;
  trailerInstanceId?: string | null;
}

export function survivorBusy(active: readonly DispatchBusyRow[], survivorId: string): boolean {
  return active.some((d) => d.survivorId === survivorId);
}

export function vehicleBusy(
  active: readonly DispatchBusyRow[],
  opt: Pick<DispatchVehicleOption, 'instanceId' | 'defId'>,
): boolean {
  return active.some((d) => {
    if (d.vehicleInstanceId != null) return d.vehicleInstanceId === opt.instanceId;
    // legacy row: blocks by model — the one instance of that def, or (in a
    // multi-instance world) the whole line until the row is migrated
    return d.vehicleDefId === opt.defId || d.vehicleDefId === opt.instanceId;
  });
}

export function trailerBusy(
  active: readonly DispatchBusyRow[],
  opt: Pick<DispatchTrailerOption, 'instanceId' | 'defId'>,
): boolean {
  return active.some((d) => {
    if (d.trailerInstanceId != null) return d.trailerInstanceId === opt.instanceId;
    return d.trailerDefId != null && (d.trailerDefId === opt.defId || d.trailerDefId === opt.instanceId);
  });
}

export interface DispatchPlanRequest {
  survivorId: string;
  survivorHp: number;
  driverSkill: number;
  vehicle: DispatchVehicleOption;
  trailer?: DispatchTrailerOption | null;
  task: DispatchTask;
  destPoiId: string;
  /** One-way meters to the destination; null when no route is plotted. */
  distM: number | null;
  heat: number;
  territory?: TerritoryInfo | null;
  active: readonly DispatchBusyRow[];
  nowMin: number;
}

export interface DispatchPlan {
  ok: boolean;
  /** Blocking reasons, worded as the store's toasts word them. */
  reasons: string[];
  /** Non-blocking cautions worth showing before sending. */
  warnings: string[];
  durationMin: number;
  etaMin: number;
  /** 0..1 — the same number resolveDispatch rolls against. */
  risk: number;
  fuelLiters: number;
  fuelAfterLiters: number;
  cargoKg: number;
}

/** The single feasibility + preview computation. The phone panel renders
 *  it, and (at integration) startDispatch enforces it, so what the player
 *  is shown is exactly what the run will cost: same duration the store
 *  schedules, same risk the resolve rolls, same liters the tank loses. */
export function planDispatch(req: DispatchPlanRequest): DispatchPlan {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const { vehicle, trailer, task } = req;

  if (survivorBusy(req.active, req.survivorId)) reasons.push('That survivor is already out.');
  if (vehicleBusy(req.active, vehicle)) reasons.push('That vehicle is already out on a dispatch.');
  if (trailer && trailerBusy(req.active, trailer)) reasons.push('That trailer is already out on a dispatch.');
  if (req.survivorHp < 30) reasons.push(`Too hurt to send out (HP ${Math.round(req.survivorHp)} — needs 30+).`);
  if (vehicle.playerAboard) reasons.push('You are sitting in that one.');
  if (vehicle.conditionPct <= 0) reasons.push(`The ${vehicle.name} is a wreck — it needs repairs before it rolls.`);
  if (req.distM == null) reasons.push('No route plotted there yet.');

  const distM = req.distM ?? 0;
  const durationMin = req.distM == null ? 0 : dispatchDurationMin(distM, req.driverSkill, task);
  const risk = effectiveRiskChance(distM, req.heat, task, req.territory);
  const fuelLiters = req.distM == null ? 0 : dispatchFuelLiters(distM, vehicle.burnClass, task, req.driverSkill);
  const fuelAfterLiters = Math.round((vehicle.fuelLiters - fuelLiters) * 10) / 10;

  if (req.distM != null && fuelAfterLiters < FUEL_RESERVE_L) {
    reasons.push(
      `Not enough fuel — the run needs ≈${fuelLiters.toFixed(1)} L plus a ${FUEL_RESERVE_L} L reserve; the ${vehicle.name} has ${vehicle.fuelLiters.toFixed(1)} L.`,
    );
  } else if (req.distM != null && fuelAfterLiters < vehicle.tankLiters * 0.25) {
    warnings.push(`The ${vehicle.name} comes home on fumes (≈${fuelAfterLiters.toFixed(1)} L left).`);
  }
  if (risk >= 0.45) warnings.push(`Husk risk is ${riskBand(risk)} (${Math.round(risk * 100)}%) — send combat skill or expect damage.`);

  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
    durationMin,
    etaMin: req.nowMin + durationMin,
    risk,
    fuelLiters,
    fuelAfterLiters,
    cargoKg: vehicle.freeKg + (trailer?.freeKg ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Resolve — what happened out there.
// ---------------------------------------------------------------------------

export interface ResolveInput {
  task: DispatchTask;
  destPoiId: string;
  distM: number;
  heat: number;
  scavenging: number;
  driver: number;
  combat: number;
  traits: string[];
  /** Free kilograms in the returning vehicle (+ trailer) right now. */
  freeKg: number;
  rng: () => number;
  /** Whose ground the destination is (Lane 9 data); absent = neutral. */
  territory?: TerritoryInfo | null;
  /** Vehicle def burn class; when given, the outcome reports the fuel the
   *  run burned (the same deterministic number planDispatch previewed). */
  burnClass?: number;
}

export interface ResolveOutcome {
  /** Loot loaded for the ride home (already weight-capped). */
  loot: { itemId: string; qty: number }[];
  /** Kilograms of rolled loot that would not fit and stayed behind. */
  leftBehindKg: number;
  /** Husk-risk event narration, null when the run was quiet. */
  eventText: string | null;
  /** Vehicle condition fraction lost (0 when quiet). */
  vehicleDamage: number;
  /** Survivor HP lost (0 when quiet; crew always make it home in v1). */
  survivorHpLoss: number;
  /** Morale delta from the run as a whole. */
  moraleDelta: number;
  /** Liters burned by the run (0 when the caller passed no burnClass). */
  fuelBurnedLiters: number;
}

export function resolveDispatch(inp: ResolveInput): ResolveOutcome {
  const rng = inp.rng;
  const out: ResolveOutcome = {
    loot: [], leftBehindKg: 0, eventText: null,
    vehicleDamage: 0, survivorHpLoss: 0, moraleDelta: 2, fuelBurnedLiters: 0,
  };
  if (inp.burnClass != null) {
    out.fuelBurnedLiters = dispatchFuelLiters(inp.distM, inp.burnClass, inp.task, inp.driver);
  }
  const cowardly = inp.traits.includes('cowardly');
  const brave = inp.traits.includes('brave');
  const strongBack = inp.traits.includes('strong_back');

  // ---- husk-risk event ----
  const hadEvent = rng() < effectiveRiskChance(inp.distM, inp.heat, inp.task, inp.territory);
  if (hadEvent) {
    const heavy = rng() < 0.4;
    let dmg = heavy ? 0.2 + rng() * 0.12 : 0.06 + rng() * 0.06;
    let hp = heavy ? 24 + Math.round(rng() * 20) : 8 + Math.round(rng() * 12);
    if (cowardly) {
      // runs, doesn't fight: keeps their skin, loses cargo and paint
      hp = 0;
      dmg *= 0.6;
      out.eventText = heavy
        ? 'A pack found them at the destination. They ran for it — cargo shaken loose, paint traded for distance.'
        : 'Husks on the road — they floored it and never stopped to look back.';
    } else {
      if (brave) { dmg *= 0.6; hp = Math.round(hp * 0.7); }
      hp = Math.round(hp * (1 - inp.combat * 0.05));
      out.eventText = heavy
        ? 'A husk pack hit the vehicle hard. They fought clear — it cost blood and bodywork.'
        : 'Husks on the road out. A short, ugly fight and they were through.';
    }
    out.vehicleDamage = Math.round(dmg * 100) / 100;
    out.survivorHpLoss = hp;
    out.moraleDelta = cowardly ? -2 : -6;
  }

  if (inp.task === 'scout') {
    out.moraleDelta = hadEvent ? out.moraleDelta : 1;
    return out; // census is the engine's job (real container state)
  }

  // ---- yield ----
  let mult = 0.55 + inp.scavenging * 0.09;
  if (strongBack) mult *= 1.25;
  if (hadEvent && cowardly) mult *= 0.7;

  const rolled: { itemId: string; qty: number }[] = [];
  if (inp.task === 'escort') {
    // the convoy pays in trade goods; driver skill keeps the schedule
    const pay = 1 + (rng() < 0.5 + inp.driver * 0.03 ? 1 : 0);
    rolled.push({ itemId: 'valuables', qty: pay });
    // danger pay: shepherding a convoy onto hostile ground pays extra
    if (inp.territory?.stance === 'hostile' && rng() < 0.35) {
      rolled.push({ itemId: 'valuables', qty: 1 });
    }
    if (rng() < 0.6) rolled.push({ itemId: 'canned_food', qty: 1 + Math.round(rng() * 2) });
    if (rng() < 0.4) rolled.push({ itemId: 'ammo_9mm', qty: 4 + Math.round(rng() * 6) });
    if (rng() < 0.3) rolled.push({ itemId: 'fuel_can', qty: 1 });
  } else {
    const table = SCAVENGE_TABLES[inp.destPoiId] ?? SCAVENGE_DEFAULT;
    for (const e of table) {
      if (rng() > e.chance) continue;
      const qty = Math.max(1, Math.round((e.min + rng() * (e.max - e.min)) * mult));
      rolled.push({ itemId: e.id, qty });
    }
  }

  // ---- weight cap: load what fits, the rest stays behind ----
  let room = inp.freeKg;
  for (const r of rolled) {
    const unit = ITEMS[r.itemId]?.weight ?? 1;
    const fitQty = Math.max(0, Math.min(r.qty, Math.floor(room / unit)));
    if (fitQty > 0) out.loot.push({ itemId: r.itemId, qty: fitQty });
    const leftKg = (r.qty - fitQty) * unit;
    if (leftKg > 0) out.leftBehindKg += Math.round(leftKg * 10) / 10;
    room -= fitQty * unit;
  }
  if (out.loot.length > 0 && !hadEvent) out.moraleDelta = 3;
  return out;
}

// ---------------------------------------------------------------------------
// Journal voice — departure, report, recall. The store used to inline
// these strings; they live here now so the panel preview and the journal
// can never drift apart, and so the writing is unit-testable.
// ---------------------------------------------------------------------------

/** Absolute game minutes → "Day 2 · 06:40" (the phone's house format). */
export function fmtClock(absMin: number): string {
  const day = Math.floor(absMin / 1440) + 1;
  const m = Math.floor(absMin % 1440);
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `Day ${day} · ${hh}:${mm}`;
}

/** A run length in words: "45 min", "2 h 05 min". */
export function fmtRunDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export interface JournalText {
  title: string;
  lines: string[];
}

export function formatDispatchDeparture(args: {
  survivorName: string;
  vehicleName: string;
  trailerName?: string | null;
  task: DispatchTask;
  destPoiId: string;
  distM: number;
  plan: Pick<DispatchPlan, 'etaMin' | 'fuelLiters' | 'risk'>;
}): JournalText {
  const title = `Dispatch — ${taskName(args.task)} to ${poiName(args.destPoiId)}`;
  const lines = [
    `${args.survivorName} rolled out in the ${args.vehicleName}${args.trailerName ? ` with the ${args.trailerName} in tow` : ''}. ${args.distM} m each way, back by ${fmtClock(args.plan.etaMin)}.`,
    `Tank math: ≈${args.plan.fuelLiters.toFixed(1)} L for the round trip. Husk risk ${riskBand(args.plan.risk)} (${Math.round(args.plan.risk * 100)}%).`,
  ];
  return { title, lines };
}

export function formatDispatchReport(args: {
  survivorName: string;
  vehicleName: string;
  task: DispatchTask;
  destPoiId: string;
  /** Actual game minutes the run took (eta − depart, or now − depart). */
  elapsedMin: number;
  outcome: ResolveOutcome;
  /** Loot the engine actually placed (vehicle/trailer/pack), in order. */
  placedLoot: { itemId: string; qty: number }[];
  /** Kilograms that fit nowhere and stayed behind (rolled cap + unplaced). */
  unplacedKg: number;
  /** Engine scout census for scout runs. */
  scoutCensus?: { total: number; looted: number } | null;
  /** Extra engine note (e.g. a blown tire line from damageVehicle). */
  tireNote?: string | null;
}): JournalText {
  const o = args.outcome;
  const contact = o.eventText != null;
  const title = `Dispatch report — ${taskName(args.task)} · ${poiName(args.destPoiId)}${contact ? ' (contact)' : ''}`;
  const lines: string[] = [];

  lines.push(
    `${args.survivorName} is back from ${poiName(args.destPoiId)} in the ${args.vehicleName}. ${fmtRunDuration(args.elapsedMin)} on the road${o.fuelBurnedLiters > 0 ? `, ≈${o.fuelBurnedLiters.toFixed(1)} L burned` : ''}.`,
  );
  if (o.eventText) lines.push(o.eventText);

  if (args.task === 'scout') {
    if (args.scoutCensus) {
      const c = args.scoutCensus;
      const verdict =
        c.total === 0 ? 'Nothing searchable stands there.'
        : c.looted >= c.total ? 'Picked clean — every container is empty.'
        : c.looted / c.total > 0.5 ? 'Picked over — the easy finds are gone.'
        : 'Rich pickings — most of it is still there.';
      lines.push(`${poiName(args.destPoiId)}: ${c.total} containers standing, ${c.looted} already emptied. ${verdict}`);
    } else {
      lines.push('The scout report came back garbled — no usable intel.');
    }
  } else if (args.placedLoot.length > 0) {
    const parts = args.placedLoot.map(
      (l) => `${l.qty}× ${ITEMS[l.itemId]?.name ?? l.itemId} (${((ITEMS[l.itemId]?.weight ?? 1) * l.qty).toFixed(1)} kg)`,
    );
    const totalKg = args.placedLoot.reduce((a, l) => a + (ITEMS[l.itemId]?.weight ?? 1) * l.qty, 0);
    lines.push(`Brought back: ${parts.join(', ')} — ${totalKg.toFixed(1)} kg loaded into the ${args.vehicleName}.`);
  } else {
    lines.push('Came back empty-handed.');
  }

  if (args.unplacedKg > 0.05) {
    lines.push(`Left behind ≈${args.unplacedKg.toFixed(1)} kg that would not fit.`);
  }
  if (o.vehicleDamage > 0) {
    lines.push(`The ${args.vehicleName} took a beating (−${Math.round(o.vehicleDamage * 100)}% condition).`);
    if (args.tireNote) lines.push(args.tireNote);
  }
  if (o.survivorHpLoss > 0) {
    lines.push(`${args.survivorName} came back hurt (−${o.survivorHpLoss} HP).`);
  }
  if (o.moraleDelta <= -4) lines.push("The crew's morale took a hit.");
  else if (o.moraleDelta >= 3 && args.placedLoot.length > 0) lines.push('A good haul — morale is up.');

  return { title, lines };
}

export function formatDispatchRecall(args: {
  survivorName: string;
  vehicleName: string;
  destPoiId: string;
  /** Liters burned before the recall; null when the run predates fuel
   *  tracking (legacy saves) — the line then stays generic. */
  fuelBurnedLiters: number | null;
}): JournalText {
  const title = `Recalled — ${poiName(args.destPoiId)}`;
  const lines = [
    `${args.survivorName} turned around and brought the ${args.vehicleName} home early.`,
    args.fuelBurnedLiters != null
      ? `≈${args.fuelBurnedLiters.toFixed(1)} L burned for nothing but road.`
      : 'Nothing to show for the fuel.',
  ];
  return { title, lines };
}
