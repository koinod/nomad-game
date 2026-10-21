// Morale + upkeep engine — SYSTEMS_SPEC §5.4, trait effects §5.3,
// BASE_DESIGN §3.5 ("Upkeep of people"). Pure functions over SurvivorDef
// (Lane 4's data, consumed read-only) and a plain {itemId, qty} stockpile.
// The daily order of operations at integration: applyUpkeep() at the day
// tick → dailyMoraleTick() with who actually ate → leavers resolved.

import type { SurvivorDef, SurvivorJob } from '../data/survivors';
import { TRAITS } from '../data/survivors';

export interface StockItem {
  itemId: string;
  qty: number;
}

/** BASE_DESIGN §3.5: each survivor eats 2 food-units + 1 water per day. */
export const FOOD_PER_DAY = 2;
export const WATER_PER_DAY = 1;

/** Food items in the order they're eaten: perishables before shelf-stable. */
export const FOOD_ITEMS = ['produce', 'raw_meat', 'cooked_meat', 'canned_food'];
export const WATER_ITEMS = ['water_bottle'];

// ---- Trait math (§5.3 — the code's TraitDef only carries moraleDrift;
// the production/upkeep multipliers live here, keyed by trait id) ----

/** strong_back eats +20%, iron_stomach −25%. Multiplicative if both. */
export function foodUseMult(s: SurvivorDef): number {
  let m = 1;
  if (s.traits.includes('strong_back')) m *= 1.2;
  if (s.traits.includes('iron_stomach')) m *= 0.75;
  return m;
}

/** Per-job production multipliers from traits (§5.3). Shift traits
 * (night_owl/early_bird) need shift data the roster doesn't carry yet —
 * deliberately not faked here. */
export function jobProductionMult(s: SurvivorDef, job: SurvivorJob): number {
  let m = 1;
  if (job === 'Farmer' && s.traits.includes('green_thumb')) m *= 1.3;
  if (job === 'Mechanic' && s.traits.includes('quick_hands')) m *= 1.25;
  if (job === 'Guard' && s.traits.includes('ex_military')) m *= 1.3;
  if (job === 'Scavenger' && s.traits.includes('strong_back')) m *= 1.25;
  return m;
}

/** §5.4 morale bands → production. Content ×1.1 · Neutral ×1.0 ·
 * Unhappy ×0.75 · Breaking ×0.5 (the spec prices Unhappy; Breaking is
 * priced at half — a survivor packing a bag is not working). */
export function moraleProductionMult(morale: number): number {
  if (morale >= 75) return 1.1;
  if (morale >= 40) return 1.0;
  if (morale >= 20) return 0.75;
  return 0.5;
}

/** Daily trait drift (§5.3/§5.4): TRAITS.moraleDrift (optimist/pessimist)
 * plus the crew-size conditionals the data table can't express —
 * loner +1 at ≤3 crew / −1 at ≥6; social is the inverse. */
export function traitDrift(s: SurvivorDef, crewSize: number): number {
  let d = 0;
  for (const t of s.traits) d += TRAITS.find((x) => x.id === t)?.moraleDrift ?? 0;
  if (s.traits.includes('loner')) d += crewSize <= 3 ? 1 : crewSize >= 6 ? -1 : 0;
  if (s.traits.includes('social')) d += crewSize >= 6 ? 1 : crewSize <= 3 ? -1 : 0;
  return d;
}

// ---- Upkeep: the stockpile feeds the crew (§3.5) ----

export interface UpkeepResult {
  /** Stockpile after consumption (input not mutated). */
  stockpile: StockItem[];
  consumed: StockItem[];
  /** Survivor ids who got a full meal (food AND water). */
  fedIds: string[];
  /** Missing food (partial or none). */
  hungryIds: string[];
  /** Missing water. */
  thirstyIds: string[];
  /** Total units the crew needed today (for UI burn-rate display). */
  need: { food: number; water: number };
}

function takeFrom(stock: StockItem[], itemIds: string[], units: number): number {
  let remaining = units;
  for (const id of itemIds) {
    if (remaining <= 0) break;
    const entry = stock.find((e) => e.itemId === id && e.qty > 0);
    if (!entry) continue;
    const take = Math.min(entry.qty, remaining);
    entry.qty -= take;
    remaining -= take;
  }
  return units - remaining;
}

/**
 * Feed the crew from the stockpile. Food need is pooled across the crew
 * (Σ 2 × foodUseMult, rounded) so iron_stomach genuinely saves food,
 * then survivors eat in roster order — when the pile runs dry, the end
 * of the roster goes hungry. Stakes you can read in the roster order.
 */
export function applyUpkeep(stockpile: readonly StockItem[], survivors: readonly SurvivorDef[]): UpkeepResult {
  const stock: StockItem[] = stockpile.map((e) => ({ ...e })).filter((e) => e.qty > 0);
  const before = new Map(stock.map((e) => [e.itemId, e.qty]));
  const totalFood = Math.round(survivors.reduce((a, s) => a + FOOD_PER_DAY * foodUseMult(s), 0));
  const totalWater = survivors.length * WATER_PER_DAY;
  const fedIds: string[] = [];
  const hungryIds: string[] = [];
  const thirstyIds: string[] = [];
  let foodPool = totalFood;
  let waterPool = totalWater;
  for (const s of survivors) {
    // Each survivor's share of the pool: their proportional daily need,
    // floored at 1 unit so a partial pile still feeds the front of the roster.
    const share = Math.max(1, Math.round(FOOD_PER_DAY * foodUseMult(s)));
    const want = Math.min(share, foodPool);
    const got = takeFrom(stock, FOOD_ITEMS, want);
    foodPool -= got;
    const fed = got >= share;
    if (!fed) hungryIds.push(s.id);
    const gotWater = takeFrom(stock, WATER_ITEMS, Math.min(WATER_PER_DAY, waterPool));
    waterPool -= gotWater;
    const watered = gotWater >= WATER_PER_DAY;
    if (!watered) thirstyIds.push(s.id);
    if (fed && watered) fedIds.push(s.id);
  }
  const consumed: StockItem[] = [];
  for (const e of stock) {
    const used = (before.get(e.itemId) ?? 0) - e.qty;
    if (used > 0) consumed.push({ itemId: e.itemId, qty: used });
  }
  return {
    stockpile: stock.filter((e) => e.qty > 0),
    consumed,
    fedIds,
    hungryIds,
    thirstyIds,
    need: { food: totalFood, water: totalWater },
  };
}

/** Days of upkeep the stockpile covers for this crew (UI: "no water" alerts). */
export function upkeepCoverageDays(stockpile: readonly StockItem[], survivors: readonly SurvivorDef[]): { food: number; water: number } {
  if (survivors.length === 0) return { food: Infinity, water: Infinity };
  const foodUnits = stockpile.filter((e) => FOOD_ITEMS.includes(e.itemId)).reduce((a, e) => a + e.qty, 0);
  const waterUnits = stockpile.filter((e) => WATER_ITEMS.includes(e.itemId)).reduce((a, e) => a + e.qty, 0);
  const foodNeed = Math.max(1, Math.round(survivors.reduce((a, s) => a + FOOD_PER_DAY * foodUseMult(s), 0)));
  return { food: foodUnits / foodNeed, water: waterUnits / survivors.length };
}

// ---- The daily morale tick (§5.4) ----

/** Runtime morale state the store must persist alongside SurvivorDef —
 * SurvivorDef itself is Lane 4's shape and carries no counters. */
export interface MoraleRuntime {
  /** Consecutive days with no job (idle −1/day starts at 3+). */
  idleDays: Record<string, number>;
  /** Consecutive days spent Breaking (<20). 3 → the survivor leaves. */
  breakingDays: Record<string, number>;
}

export function newMoraleRuntime(): MoraleRuntime {
  return { idleDays: {}, breakingDays: {} };
}

export interface MoraleTickResult {
  survivors: SurvivorDef[];
  runtime: MoraleRuntime;
  /** Survivors who left this tick (Breaking 3 days — §5.4/§3.5's softened
   * rule: they leave alive, re-recruitable once, bitter — morale 30). */
  leftIds: string[];
  /** Per-survivor delta breakdown for the UI's "morale drivers" list. */
  drivers: Record<string, { label: string; delta: number }[]>;
}

/**
 * The 06:00 tick (§5.4): fed+watered +2 · hungry −4 · comfort ≥2 +1 ·
 * idle 3+ days −1/day · trait drift. Event deltas (siege/death/recruit)
 * go through moraleEvent() at the moment they happen, not here.
 */
export function dailyMoraleTick(
  survivors: readonly SurvivorDef[],
  runtime: MoraleRuntime,
  ctx: { fedIds: readonly string[]; comfort: number },
): MoraleTickResult {
  const fed = new Set(ctx.fedIds);
  const rt: MoraleRuntime = {
    idleDays: { ...runtime.idleDays },
    breakingDays: { ...runtime.breakingDays },
  };
  const drivers: Record<string, { label: string; delta: number }[]> = {};
  const leftIds: string[] = [];
  const out: SurvivorDef[] = [];
  for (const s of survivors) {
    const rows: { label: string; delta: number }[] = [];
    let delta = 0;
    if (fed.has(s.id)) {
      delta += 2;
      rows.push({ label: 'Fed + watered', delta: 2 });
    } else {
      delta -= 4;
      rows.push({ label: 'Went hungry', delta: -4 });
    }
    if (ctx.comfort >= 2) {
      delta += 1;
      rows.push({ label: 'A kept base (comfort)', delta: 1 });
    }
    const idle = !s.job || s.job === 'Idle';
    rt.idleDays[s.id] = idle ? (rt.idleDays[s.id] ?? 0) + 1 : 0;
    if (idle && rt.idleDays[s.id] >= 3) {
      delta -= 1;
      rows.push({ label: 'Idle too long', delta: -1 });
    }
    const drift = traitDrift(s, survivors.length);
    if (drift !== 0) {
      delta += drift;
      rows.push({ label: 'Temperament', delta: drift });
    }
    drivers[s.id] = rows;
    const morale = Math.max(0, Math.min(100, s.morale + delta));
    rt.breakingDays[s.id] = morale < 20 ? (rt.breakingDays[s.id] ?? 0) + 1 : 0;
    if (rt.breakingDays[s.id] >= 3) {
      leftIds.push(s.id);
      delete rt.idleDays[s.id];
      delete rt.breakingDays[s.id];
      continue; // they walk — alive, and they don't take the stockpile with them
    }
    out.push({ ...s, morale });
  }
  return { survivors: out, runtime: rt, leftIds, drivers };
}

/** Event deltas (§5.4): siege survived +3 win / −6 lost · a death −10 to
 * everyone at base · a new recruit joining +2. Applied to the whole crew. */
export function moraleEvent(
  survivors: readonly SurvivorDef[],
  kind: 'siegeWin' | 'siegeLoss' | 'death' | 'recruit',
): SurvivorDef[] {
  const delta = kind === 'siegeWin' ? 3 : kind === 'siegeLoss' ? -6 : kind === 'death' ? -10 : 2;
  return survivors.map((s) => ({ ...s, morale: Math.max(0, Math.min(100, s.morale + delta)) }));
}
