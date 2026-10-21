// Base claims, facilities, heat & siege logic — BASE_DESIGN §3,
// SYSTEMS_SPEC §7. Pure functions over plain data (BaseInstance /
// ClaimsState); the store wiring (Lane 5) persists these shapes and the
// world wiring (main agent) places claim posts + prefab ghosts.
// BUILDINGS ARE PARKED: this ships the data, the logic and the view
// models. No geometry lives here.

import {
  claimSite, outpostLimit, RELOCATION_SALVAGE,
  TIERED_FACILITIES, tieredFacility, tierDef, prefabDef,
  stockpileHeatValue, stockpileWeightKg, defenseScore, heatV2, heatTier,
  HEAT_TIER_LABEL,
  type ClaimSiteDef, type FacilityGate, type HeatTier, type ItemQty,
} from '../data/base';
import { ITEMS } from '../data/items';
import type { SurvivorDef } from '../data/survivors';
import { jobProductionMult, moraleProductionMult, upkeepCoverageDays, type StockItem } from './morale';

// ---- State shapes (FIELD REQUEST to Lane 5: persist these) ----

export interface FacilityInstance {
  defId: string;
  tier: number;
  /** Survivor id staffing this facility, or null. */
  staffId: string | null;
  /** Production paused (injured staff, siege prep — §7.4). */
  paused: boolean;
}

export interface PrefabInstance {
  defId: string;
  /** Palisade scrap-plating (§3.3b upgrade-in-place). */
  upgraded?: boolean;
  /** Survivor id posted here (watchtower guard posts). */
  staffId?: string | null;
}

export interface BaseInstance {
  siteId: string;
  role: 'home' | 'outpost' | 'field';
  facilities: FacilityInstance[];
  prefabs: PrefabInstance[];
  stockpile: StockItem[];
}

export interface ClaimsState {
  home: BaseInstance | null;
  outposts: BaseInstance[];
}

export function newClaimsState(): ClaimsState {
  return { home: null, outposts: [] };
}

export function allBases(state: ClaimsState): BaseInstance[] {
  return [...(state.home ? [state.home] : []), ...state.outposts];
}

export function facilityAt(base: BaseInstance, defId: string): FacilityInstance | undefined {
  return base.facilities.find((f) => f.defId === defId);
}

export function facilityTier(base: BaseInstance, defId: string): number {
  return facilityAt(base, defId)?.tier ?? 0;
}

/** Command Post tier of a base (built-in on claim — a claimed base always has ≥T1). */
export function commandPostTier(base: BaseInstance): number {
  return Math.max(1, facilityTier(base, 'command_post'));
}

/** Survivor headcount ceiling from Command Post tier (§5.6): 4 / 7 / 10. */
export function popCap(base: BaseInstance): number {
  return tierDef('command_post', commandPostTier(base))?.popCap ?? 4;
}

/** Comfort 0–3 (§3.3b): Σ prefab/facility comfort contributions, capped. */
export function comfortScore(base: BaseInstance): number {
  let c = 0;
  for (const p of base.prefabs) c += prefabDef(p.defId)?.comfort ?? 0;
  return Math.min(3, c);
}

// ---- Claiming (§3.2, §7.2) ----

export interface ClaimCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface ClaimContext {
  /** Recruited survivors on the roster. */
  recruits: number;
  /** Faction rep by faction id (Lane 9's data). */
  rep: Record<string, number>;
  /** Live husks within 40m of the claim post (world check at integration). */
  husksWithin40m: number;
  /** Materials available to pay with (player pack + home stockpile, caller's merge). */
  wallet: readonly ItemQty[];
  /** The player is taking this site by force (town's war path). */
  byForce?: boolean;
}

export function canAfford(wallet: readonly ItemQty[], cost: readonly ItemQty[]): boolean {
  return cost.every((c) => (wallet.find((w) => w.itemId === c.itemId)?.qty ?? 0) >= c.qty);
}

export function claimChecklist(site: ClaimSiteDef, state: ClaimsState, ctx: ClaimContext): ClaimCheck[] {
  const checks: ClaimCheck[] = [];
  if (site.klass === 'never') {
    checks.push({ id: 'claimable', label: 'Claimable', ok: false, detail: 'Never claimable — story/salvage ground.' });
    return checks;
  }
  const isOutpostRole = site.klass === 'outpost' || site.klass === 'field';
  if (!isOutpostRole && state.home && state.home.siteId !== site.poiId) {
    checks.push({
      id: 'relocation', label: 'Relocation', ok: true,
      detail: `You already hold a home. Claiming here relocates it — 70% salvage, stockpile does not teleport (see relocationQuote).`,
    });
  }
  if (isOutpostRole) {
    const limit = state.home ? outpostLimit(commandPostTier(state.home)) : 0;
    checks.push({
      id: 'outpost_slots', label: 'Outpost slots', ok: !!state.home && state.outposts.length < limit,
      detail: state.home
        ? `${state.outposts.length}/${limit} outposts used (Command Post T${commandPostTier(state.home)}).`
        : 'Outposts need a home base first.',
    });
  }
  checks.push({
    id: 'clear', label: 'Area clear', ok: ctx.husksWithin40m === 0,
    detail: ctx.husksWithin40m === 0 ? 'No live husks within 40m.' : `${ctx.husksWithin40m} husks within 40m — clear them first.`,
  });
  if (site.cost.length > 0) {
    checks.push({
      id: 'cost', label: 'Cost', ok: canAfford(ctx.wallet, site.cost),
      detail: site.cost.map((c) => `${c.qty} ${ITEMS[c.itemId]?.name ?? c.itemId}`).join(' + '),
    });
  } else {
    checks.push({ id: 'cost', label: 'Cost', ok: true, detail: site.poiId === 'military_base' ? 'Clear it. That\u2019s the cost.' : 'Free.' });
  }
  if (site.survivorGate) {
    checks.push({
      id: 'crew', label: 'Crew', ok: ctx.recruits >= site.survivorGate,
      detail: `${ctx.recruits}/${site.survivorGate} recruited survivors — big bases are earned with people.`,
    });
  }
  if (site.repPath || site.warPath) {
    // Town's two doors (§7.2's resolution): shown as two explicit paths,
    // either satisfies. Rep is a raw floor — band-agnostic by design.
    const repOk = site.repPath ? (ctx.rep[site.repPath.factionId] ?? 0) >= site.repPath.min : false;
    const warOk = !!ctx.byForce;
    if (site.repPath) {
      checks.push({
        id: 'path_rep', label: 'Path A — the Union\u2019s blessing', ok: repOk,
        detail: `${site.repPath.factionId} rep ≥${site.repPath.min} (now ${ctx.rep[site.repPath.factionId] ?? 0}).`,
      });
    }
    if (site.warPath) {
      checks.push({
        id: 'path_war', label: 'Path B — taken by force', ok: warOk,
        detail: 'Clear the town and hold it. The Union will remember which door you used.',
      });
    }
    checks.push({
      id: 'access', label: 'Access (either path)', ok: repOk || warOk,
      detail: repOk ? 'Path A open.' : warOk ? 'Path B open.' : 'Neither path is open yet.',
    });
  }
  return checks;
}

export function claimReady(checks: readonly ClaimCheck[]): boolean {
  // When a site has alternative access paths (town), the path_* rows are
  // the two doors shown to the player; the combined 'access' row is the
  // actual gate — either door satisfies it.
  const hasAccessGate = checks.some((c) => c.id === 'access');
  return checks.every((c) => (hasAccessGate && c.id.startsWith('path_') ? true : c.ok));
}

/** Apply a successful claim: Command Post T1 comes with it (§3.3). */
export function applyClaim(state: ClaimsState, siteId: string): ClaimsState {
  const site = claimSite(siteId);
  if (!site || site.klass === 'never') return state;
  const base: BaseInstance = {
    siteId,
    role: site.klass === 'home' ? 'home' : site.klass,
    facilities: [{ defId: 'command_post', tier: 1, staffId: null, paused: false }],
    prefabs: [],
    stockpile: [],
  };
  if (site.klass === 'home') return { home: base, outposts: state.outposts };
  return { home: state.home, outposts: [...state.outposts, base] };
}

// ---- Relocation (§3.2, §7.9) ----

export interface RelocationQuote {
  /** 70% salvage of every built facility tier + prefab, itemized. */
  refund: ItemQty[];
  /** The stockpile stays behind — it does not teleport. */
  strandedStockpileKg: number;
  strandedAtSiteId: string | null;
  outpostsKept: number;
}

function mergeQty(list: ItemQty[], add: readonly ItemQty[], scale = 1): void {
  for (const c of add) {
    const qty = Math.floor(c.qty * scale);
    if (qty <= 0) continue;
    const ex = list.find((e) => e.itemId === c.itemId);
    if (ex) ex.qty += qty;
    else list.push({ itemId: c.itemId, qty });
  }
}

export function relocationQuote(state: ClaimsState): RelocationQuote {
  const paid: ItemQty[] = [];
  const home = state.home;
  if (home) {
    for (const f of home.facilities) {
      if (f.defId === 'command_post') continue; // the flag moves with you
      const def = tieredFacility(f.defId);
      if (!def) continue;
      for (const t of def.tiers) if (t.tier <= f.tier) mergeQty(paid, t.cost);
    }
    for (const p of home.prefabs) {
      const def = prefabDef(p.defId);
      if (!def) continue;
      mergeQty(paid, def.cost);
      if (p.upgraded && def.upgrade) mergeQty(paid, def.upgrade.cost);
    }
  }
  // 70% of everything that was paid in, floored once per item.
  const refund: ItemQty[] = paid
    .map((e) => ({ itemId: e.itemId, qty: Math.floor(e.qty * RELOCATION_SALVAGE) }))
    .filter((e) => e.qty > 0);
  return {
    refund,
    strandedStockpileKg: home ? stockpileWeightKg(home.stockpile) : 0,
    strandedAtSiteId: home?.siteId ?? null,
    outpostsKept: state.outposts.length,
  };
}

/** Relocate home to a new site: old facilities salvage out (quote's
 * refund), the old stockpile is stranded at the old site (returned so
 * the caller can leave it as a world container — haul it or lose it),
 * outposts persist untouched. */
export function applyRelocation(state: ClaimsState, newSiteId: string): { state: ClaimsState; quote: RelocationQuote; stranded: StockItem[] } {
  const quote = relocationQuote(state);
  const stranded = state.home ? state.home.stockpile : [];
  const claimed = applyClaim({ home: null, outposts: state.outposts }, newSiteId);
  return { state: claimed, quote, stranded };
}

// ---- Facilities: cards, power, production (§7.3/§7.4) ----

export interface CrewContext {
  builders: number;
  /** Jobs present on the roster (for specialist gates). */
  jobsPresent: readonly string[];
  /** Blueprint item ids owned. */
  blueprints: readonly string[];
}

export interface FacilityCard {
  facilityId: string;
  name: string;
  /** The tier this build/upgrade lands. */
  tier: number;
  cost: ItemQty[];
  buildHours: number;
  /** Player-solo time: ×1.5, and solo is legal at T1 only (§3.5). */
  buildHoursSolo: number;
  powerKw: number;
  gate: FacilityGate;
  gateText: string;
  gateMet: boolean;
  effectText: string;
  siteAllowed: boolean;
}

export function gateText(gate: FacilityGate, specialistJob?: string): string {
  if (gate === 'solo') return 'You can build this yourself (slowly).';
  if (gate === 'builder') return 'Needs a Builder on the crew.';
  return `Needs a Builder + ${specialistJob ?? 'the facility specialist'} + the blueprint.`;
}

export function facilityCard(siteId: string, base: BaseInstance, facilityId: string, crew: CrewContext): FacilityCard | null {
  const def = tieredFacility(facilityId);
  if (!def) return null;
  const nextTier = facilityTier(base, facilityId) + 1;
  const td = def.tiers.find((t) => t.tier === nextTier);
  if (!td) return null; // maxed
  let gateMet = true;
  if (td.gate === 'builder') gateMet = crew.builders >= 1;
  if (td.gate === 'builder_specialist_blueprint') {
    gateMet = crew.builders >= 1
      && (!td.specialistJob || crew.jobsPresent.includes(td.specialistJob))
      && (!td.blueprintId || crew.blueprints.includes(td.blueprintId));
  }
  return {
    facilityId,
    name: def.name,
    tier: nextTier,
    cost: td.cost,
    buildHours: td.buildHours,
    buildHoursSolo: Math.round(td.buildHours * 1.5 * 10) / 10,
    powerKw: td.powerKw,
    gate: td.gate,
    gateText: gateMet ? gateText(td.gate, td.specialistJob) : `Blocked — ${gateText(td.gate, td.specialistJob)}`,
    gateMet,
    effectText: td.effectText,
    siteAllowed: !def.siteRestriction || def.siteRestriction.includes(siteId),
  };
}

/** Every buildable card for a base (§7.3's build menu), site-filtered. */
export function buildMenu(siteId: string, base: BaseInstance, crew: CrewContext): FacilityCard[] {
  const used = base.facilities.length;
  const slots = claimSite(siteId)?.facilitySlots ?? 0;
  return TIERED_FACILITIES
    .filter((d) => d.id !== 'command_post')
    .map((d) => facilityCard(siteId, base, d.id, crew))
    .filter((c): c is FacilityCard => !!c && c.siteAllowed)
    .map((c) => (facilityTier(base, c.facilityId) === 0 && used - 1 >= slots
      ? { ...c, gateMet: false, gateText: `Blocked — no facility slots left (${slots} at this site). Upgrades still fit.` }
      : c));
}

export interface PowerBudget {
  capacityKw: number;
  usedKw: number;
  /** Facilities drawing more than the grid has: production stalls (logic flag for the tick). */
  ok: boolean;
}

export function powerBudget(base: BaseInstance): PowerBudget {
  let capacityKw = 0;
  let usedKw = 0;
  for (const f of base.facilities) {
    const td = tierDef(f.defId, f.tier);
    if (!td) continue;
    capacityKw += td.generatorKw ?? 0;
    usedKw += td.powerKw;
  }
  return { capacityKw, usedKw, ok: usedKw <= capacityKw };
}

/**
 * Staffed production per hour (§3.3/§3.5). Rules, honestly applied:
 * - paused facility, or a staffer who is sick/injured → 0 (it pauses, §2 verdict 2)
 * - unstaffed: T1 trickles at 25%, T2+ produces nothing — staffing is the tax on tier
 * - staffed: rate × trait mult (§5.3) × morale band mult (§5.4)
 * - power draw beyond generator capacity → the whole grid stalls to 0
 */
export function productionPerHour(base: BaseInstance, survivors: readonly SurvivorDef[]): Record<string, number> {
  const out: Record<string, number> = {};
  const power = powerBudget(base);
  const add = (itemId: string, qty: number) => { out[itemId] = (out[itemId] ?? 0) + qty; };
  for (const f of base.facilities) {
    const def = tieredFacility(f.defId);
    const td = tierDef(f.defId, f.tier);
    if (!def || !td || f.paused) continue;
    const rates: { itemId: string; perHour: number }[] = [];
    if (td.production) rates.push(td.production);
    if (td.production2) rates.push(td.production2);
    if (rates.length === 0) continue;
    if (td.powerKw > 0 && !power.ok) continue;
    const staffer = f.staffId ? survivors.find((s) => s.id === f.staffId) : undefined;
    let mult: number;
    if (!def.staffJob) {
      mult = 1; // unstaffable trickle facilities (rain collector, fish traps)
    } else if (!staffer) {
      mult = f.tier <= 1 ? 0.25 : 0;
    } else if (staffer.status !== 'healthy') {
      mult = 0;
    } else {
      mult = jobProductionMult(staffer, def.staffJob) * moraleProductionMult(staffer.morale);
    }
    if (mult <= 0) continue;
    for (const r of rates) add(r.itemId, r.perHour * mult);
  }
  // Rain barrels: unstaffable water trickle, stacks with the Water facility.
  for (const p of base.prefabs) {
    const w = prefabDef(p.defId)?.waterPerHour;
    if (w) add('water_bottle', w);
  }
  return out;
}

/** Why a facility isn't producing — §7.4's production-log honesty. */
export function facilityStatus(base: BaseInstance, facilityId: string, survivors: readonly SurvivorDef[]): string {
  const f = facilityAt(base, facilityId);
  if (!f) return 'Not built.';
  const def = tieredFacility(facilityId);
  const td = tierDef(facilityId, f.tier);
  if (!def || !td) return 'Unknown facility.';
  if (f.paused) return 'Paused.';
  if (!td.production && !td.production2 && !td.intelPerHour) return td.effectText;
  if (td.powerKw > 0 && !powerBudget(base).ok) return 'No power — the grid is overdrawn.';
  if (!def.staffJob) return 'Running (no staff needed).';
  const staffer = f.staffId ? survivors.find((s) => s.id === f.staffId) : undefined;
  if (!staffer) return f.tier <= 1 ? 'Unstaffed — trickling at 25%.' : 'Unstaffed — T2+ produces nothing. Assign a ' + def.staffJob + '.';
  if (staffer.status !== 'healthy') return `${staffer.name} is ${staffer.status} — production paused.`;
  return `Staffed by ${staffer.name}.`;
}

// ---- Stockpile view (§7.5) ----

export interface StockpileView {
  capKg: number;
  usedKg: number;
  overCap: boolean;
  categories: { id: string; items: { itemId: string; name: string; qty: number; heatValue: number }[] }[];
  totalHeatValue: number;
}

/** Stockpile capacity: the Storage facility's tiers (§3.3). No Storage
 * yet → 100kg "pile by the flag" (the claim's own working pile). */
export function stockpileCapKg(base: BaseInstance): number {
  const t = facilityTier(base, 'storage');
  if (t === 0) return 100;
  return tierDef('storage', t)?.stockpileCapKg ?? 100;
}

export function stockpileView(base: BaseInstance): StockpileView {
  const byCat = new Map<string, { itemId: string; name: string; qty: number; heatValue: number }[]>();
  for (const e of base.stockpile) {
    if (e.qty <= 0) continue;
    const def = ITEMS[e.itemId];
    const cat = def?.category ?? 'misc';
    const row = { itemId: e.itemId, name: def?.name ?? e.itemId, qty: e.qty, heatValue: (stockpileHeatValue([e]) / e.qty) || 0 };
    byCat.set(cat, [...(byCat.get(cat) ?? []), row]);
  }
  const usedKg = stockpileWeightKg(base.stockpile);
  const capKg = stockpileCapKg(base);
  return {
    capKg,
    usedKg,
    overCap: usedKg > capKg,
    categories: [...byCat.entries()].map(([id, items]) => ({ id, items })),
    totalHeatValue: stockpileHeatValue(base.stockpile),
  };
}

// ---- Heat & siege (§3.7) ----

export interface HeatReport {
  heat: number;
  tier: HeatTier;
  tierLabel: string;
  stockpileValue: number;
  defense: number;
  daysTerm: number;
  localKillTerm: number;
}

export function computeHeat(base: BaseInstance, survivors: readonly SurvivorDef[], daysSurvived: number, localKills = 0): HeatReport {
  const stockpileValue = stockpileHeatValue(base.stockpile);
  // Distinct people only: a Guard posted at the tower is one guard, not two.
  const guardIds = new Set<string>();
  for (const s of survivors) if (s.job === 'Guard') guardIds.add(s.id);
  for (const p of base.prefabs) if (p.staffId && prefabDef(p.defId)?.guardPost) guardIds.add(p.staffId);
  const defense = defenseScore({
    prefabIds: base.prefabs.map((p) => p.defId),
    staffedGuards: guardIds.size,
    garageTier: facilityTier(base, 'garage'),
  });
  const heat = heatV2(stockpileValue, defense, daysSurvived, localKills);
  const tier = heatTier(heat);
  return {
    heat, tier, tierLabel: HEAT_TIER_LABEL[tier], stockpileValue, defense,
    daysTerm: daysSurvived * 0.5, localKillTerm: localKills * 0.2,
  };
}

export interface SiegeForecast {
  /** 0 none · 1 standard siege · 2 escalated (specials join, §3.7). */
  tier: 0 | 1 | 2;
  state: 'none' | 'scouts' | 'warning' | 'siege-night';
  specials: boolean;
  note: string;
}

/**
 * The siege contract (§3.7): heat ≥30 → scouts sniff the perimeter ·
 * ≥60 → warning, next night is a siege night (announced a day ahead) ·
 * ≥90 → the siege escalates a tier. Sieges only fire on a night the
 * player is at/near base — if they're away, the warning waits (the
 * caller's job to hold it; the forecast just reads the number).
 */
export function siegeForecast(heat: number): SiegeForecast {
  const tier = heatTier(heat);
  if (tier === 'calm') return { tier: 0, state: 'none', specials: false, note: 'Quiet. Nothing has noticed this place yet.' };
  if (tier === 'scout') return { tier: 0, state: 'scouts', specials: false, note: 'Scout activity — things are sniffing the perimeter. The Radio Operator will mention it.' };
  if (tier === 'warning') return { tier: 1, state: 'warning', specials: false, note: 'Warning: the next night at base is a siege night. Announced a full day ahead — prepare.' };
  return { tier: 2, state: 'siege-night', specials: true, note: 'Escalated siege: specials join the waves. (Raider variant unlocks with Phase 3 factions.)' };
}

// ---- Siege execution: the Lane-4 seam ----
// Husks.ts is Lane 4's file and HuskManager has no public siege-spawn
// entry today (addHusk is private). This lane ships the wave PLANS and
// the spawner contract; the adapter (a public HuskManager.spawnSiegeWave
// or a Game-side bridge) is an enumerated integration step + a Lane-4
// API dependency in the report. Nothing here imports Husks.ts.

export type SiegeHuskKind = 'shambler' | 'stalker' | 'armored' | 'screamer' | 'brute' | 'crawler' | 'bloater' | 'spitter';

export interface SiegeWavePlan {
  wave: number;
  count: number;
  kinds: SiegeHuskKind[];
}

export interface SiegeWaveRequest extends SiegeWavePlan {
  siteId: string;
  /** Siege origin point (world wiring supplies the perimeter point). */
  x: number;
  z: number;
  /** Husks path to gates/storage first (existing door-seeking behavior). */
  target: 'gates' | 'storage';
}

export interface SiegeSpawner {
  spawnSiegeWave(req: SiegeWaveRequest): number;
}

/** Wave composition by siege tier. Tier 1: three waves of walkers.
 * Tier 2 (heat ≥90): more of them, specials mixed in (§3.7). */
export function planSiegeWaves(forecast: SiegeForecast, rng: () => number): SiegeWavePlan[] {
  if (forecast.tier === 0) return [];
  const base: SiegeHuskKind[] = ['shambler', 'shambler', 'stalker'];
  const specialPool: SiegeHuskKind[] = ['screamer', 'crawler', 'bloater', 'spitter', 'brute'];
  const waves: SiegeWavePlan[] = [];
  const nWaves = forecast.tier === 2 ? 4 : 3;
  for (let w = 0; w < nWaves; w++) {
    const count = 4 + w * 2 + (forecast.tier === 2 ? 2 : 0);
    const kinds: SiegeHuskKind[] = [];
    for (let i = 0; i < count; i++) {
      if (forecast.specials && i > 0 && rng() < 0.3) kinds.push(specialPool[Math.floor(rng() * specialPool.length)]);
      else kinds.push(base[Math.floor(rng() * base.length)]);
    }
    waves.push({ wave: w + 1, count, kinds });
  }
  return waves;
}

// ---- Jobs / garrison board (§7.7) + siege readiness ----

/** Projected 9mm burn for one siege: ~40 rounds per posted guard (§7.7). */
export const SIEGE_AMMO_PER_GUARD = 40;

export interface JobBoard {
  assignments: { job: string; survivorId: string | null; facilityId?: string; postId?: string }[];
  guardPosts: { postId: string; staffed: boolean; ammoStock: number }[];
  unassigned: number;
  siegeReadiness: { defense: number; guards: number; ammo: number; projectedBurn: number; verdict: 'ready' | 'thin' | 'exposed' };
}

export function jobBoard(base: BaseInstance, survivors: readonly SurvivorDef[], heat: HeatReport): JobBoard {
  const assignments: JobBoard['assignments'] = [];
  for (const f of base.facilities) {
    const def = tieredFacility(f.defId);
    if (def?.staffJob) assignments.push({ job: def.staffJob, survivorId: f.staffId, facilityId: f.defId });
  }
  const ammo = base.stockpile.find((e) => e.itemId === 'ammo_9mm')?.qty ?? 0;
  const guardPosts = base.prefabs
    .filter((p) => prefabDef(p.defId)?.guardPost)
    .map((p, i) => ({ postId: `${p.defId}_${i}`, staffed: !!p.staffId, ammoStock: ammo }));
  const guards = survivors.filter((s) => s.job === 'Guard').length;
  const projectedBurn = guards * SIEGE_AMMO_PER_GUARD;
  const verdict: 'ready' | 'thin' | 'exposed' =
    guards >= 1 && ammo >= projectedBurn && heat.defense >= 15 ? 'ready'
      : guards >= 1 || heat.defense >= 8 ? 'thin'
        : 'exposed';
  const assignedIds = new Set([
    ...base.facilities.map((f) => f.staffId),
    ...base.prefabs.map((p) => p.staffId),
  ].filter(Boolean));
  return {
    assignments,
    guardPosts,
    unassigned: survivors.filter((s) => !assignedIds.has(s.id) && (!s.job || s.job === 'Idle')).length,
    siegeReadiness: { defense: heat.defense, guards, ammo, projectedBurn, verdict },
  };
}

// ---- Overview (§7.1) ----

export interface BaseSummary {
  baseId: string;
  name: string;
  role: BaseInstance['role'];
  slots: { total: number; used: number };
  stockpileKg: number;
  stockpileCapKg: number;
  heat: number;
  heatTier: HeatTier;
  heatTierLabel: string;
  forecast: SiegeForecast;
  comfort: number;
  power: PowerBudget;
  population: number;
  popCap: number;
  alerts: string[];
}

export function baseSummary(
  base: BaseInstance,
  survivors: readonly SurvivorDef[],
  daysSurvived: number,
  localKills = 0,
): BaseSummary {
  const site = claimSite(base.siteId);
  const heat = computeHeat(base, survivors, daysSurvived, localKills);
  const forecast = siegeForecast(heat.heat);
  const view = stockpileView(base);
  const alerts: string[] = [];
  if (forecast.state === 'warning' || forecast.state === 'siege-night') alerts.push('Siege tomorrow night — the warning is out.');
  else if (forecast.state === 'scouts') alerts.push('Scout activity at the perimeter.');
  const atBase = survivors; // caller passes the base's roster slice
  const coverage = upkeepCoverageDays(base.stockpile, atBase);
  if (atBase.length > 0 && coverage.water < 1) alerts.push('Stockpile: no water for tomorrow\u2019s upkeep.');
  if (atBase.length > 0 && coverage.food < 1) alerts.push('Stockpile: food runs out before tomorrow\u2019s upkeep.');
  for (const f of base.facilities) {
    const def = tieredFacility(f.defId);
    if (def?.staffJob && f.tier >= 2 && !f.staffId) alerts.push(`${def.name} unstaffed — T2+ produces nothing.`);
  }
  for (const p of base.prefabs) {
    if (prefabDef(p.defId)?.guardPost && !p.staffId) alerts.push('Guard post unstaffed.');
  }
  const power = powerBudget(base);
  if (!power.ok) alerts.push('Power overdrawn — production stalled. Build a bigger generator.');
  if (view.overCap) alerts.push('Stockpile over capacity.');
  return {
    baseId: base.siteId,
    name: site?.name ?? base.siteId,
    role: base.role,
    slots: { total: site?.facilitySlots ?? 0, used: Math.max(0, base.facilities.length - 1) },
    stockpileKg: Math.round(view.usedKg),
    stockpileCapKg: view.capKg,
    heat: heat.heat,
    heatTier: heat.tier,
    heatTierLabel: heat.tierLabel,
    forecast,
    comfort: comfortScore(base),
    power,
    population: atBase.length,
    popCap: popCap(base),
    alerts,
  };
}

// ---- Garage view (§7.8) ----

/** Vehicle input shape — the garage screen consumes fleet data; the
 * fleet itself is Vehicles.ts/Lane 1+3 territory, passed in plainly. */
export interface GarageVehicleInput {
  id: string;
  kind: string;
  condition: number;
  fuelL: number;
  fuelCap: number;
  upgrades: string[];
  trailerId?: string | null;
  storageKg: number;
  storageCapKg: number;
}

export interface ManufactureRecipe {
  vehicleKind: string;
  name: string;
  cost: ItemQty[];
  buildHours: number;
  note: string;
}

/** §3.4 manufacture list — Garage T3 + Machine Shop T2 + Mechanic.
 * Box trucks and semis are NEVER manufacturable (found and repaired only). */
export const MANUFACTURE_RECIPES: ManufactureRecipe[] = [
  { vehicleKind: 'atv', name: 'ATV', cost: [{ itemId: 'scrap', qty: 20 }, { itemId: 'tire', qty: 2 }, { itemId: 'engine_part', qty: 1 }, { itemId: 'car_battery', qty: 1 }], buildHours: 6, note: 'Rebuilt from parts.' },
  { vehicleKind: 'sedan', name: 'Sedan', cost: [{ itemId: 'scrap', qty: 35 }, { itemId: 'tire', qty: 4 }, { itemId: 'engine_part', qty: 1 }, { itemId: 'car_battery', qty: 1 }], buildHours: 10, note: 'Rebuilt from parts.' },
  { vehicleKind: 'skiff', name: 'Skiff', cost: [{ itemId: 'scrap', qty: 25 }, { itemId: 'engine_part', qty: 1 }, { itemId: 'wood', qty: 6 }], buildHours: 8, note: 'Hull patch — shore bases only.' },
];

export interface GarageView {
  bays: number;
  heavyBay: boolean;
  cards: ({ vehicle: GarageVehicleInput; stored: boolean } | { vehicle: null })[];
  manufacture: ManufactureRecipe[] | null;
}

export function garageView(base: BaseInstance, vehicles: readonly GarageVehicleInput[], storedIds: readonly string[]): GarageView {
  const gt = facilityTier(base, 'garage');
  const bays = tierDef('garage', gt)?.bays ?? 0;
  const heavyBay = (tierDef('garage', gt)?.heavyBay ?? false) || (claimSite(base.siteId)?.heavyBay ?? false);
  const cards: GarageView['cards'] = [];
  for (let i = 0; i < bays; i++) {
    const v = vehicles[i];
    cards.push(v ? { vehicle: v, stored: storedIds.includes(v.id) } : { vehicle: null });
  }
  const canManufacture = gt >= 3 && facilityTier(base, 'workbench') >= 2;
  return { bays, heavyBay, cards, manufacture: canManufacture ? MANUFACTURE_RECIPES : null };
}
