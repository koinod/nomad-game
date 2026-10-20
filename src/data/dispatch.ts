// dispatch.ts — wave 3 (P5 v1): crew dispatch math. Pure and rng-injected
// so the whole system is unit-testable: durations, husk-risk, loot rolls.
// The store owns state and side effects (engine storage, damage, morale);
// everything decided here is decided from numbers alone.

import { ITEMS } from './items';
import type { DispatchTask } from '../store/types';

export interface DispatchPoi {
  id: string;
  name: string;
}

/** Destinations the crew can be sent to (sub-locations excluded). */
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
  { id: 'carrier', name: 'The Carrier' },
];

export function poiName(id: string): string {
  return DISPATCH_POIS.find((p) => p.id === id)?.name ?? id.replace(/_/g, ' ');
}

export const DISPATCH_TASKS: { id: DispatchTask; name: string; blurb: string }[] = [
  { id: 'scavenge', name: 'Scavenge', blurb: 'Strip the destination for parts and supplies. Loot rides home in the vehicle.' },
  { id: 'scout', name: 'Scout', blurb: 'Eyes only: report what is left standing there — containers untouched vs picked clean.' },
  { id: 'escort', name: 'Escort run', blurb: 'Shepherd a trader convoy to the destination and back. Pays in valuables; husks hunt convoys.' },
];

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
  carrier: [
    { id: 'ammo_rifle', min: 8, max: 16, chance: 0.7 },
    { id: 'gun_parts', min: 2, max: 3, chance: 0.6 },
    { id: 'armor_plate', min: 1, max: 2, chance: 0.5 },
    { id: 'medkit', min: 1, max: 1, chance: 0.4 },
    { id: 'valuables', min: 1, max: 2, chance: 0.4 },
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
 *  draw attention; escort convoys are hunted (+8 pts). */
export function riskChance(distM: number, heat: number, task: DispatchTask): number {
  const base = 0.1 + distM / 3000 + heat / 400 + (task === 'escort' ? 0.08 : 0);
  return Math.max(0.08, Math.min(0.65, base));
}

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
}

export function resolveDispatch(inp: ResolveInput): ResolveOutcome {
  const rng = inp.rng;
  const out: ResolveOutcome = {
    loot: [], leftBehindKg: 0, eventText: null,
    vehicleDamage: 0, survivorHpLoss: 0, moraleDelta: 2,
  };
  const cowardly = inp.traits.includes('cowardly');
  const brave = inp.traits.includes('brave');
  const strongBack = inp.traits.includes('strong_back');

  // ---- husk-risk event ----
  const hadEvent = rng() < riskChance(inp.distM, inp.heat, inp.task);
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
