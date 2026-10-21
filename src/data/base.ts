// Base management — claim, facilities, heat, production.
// Spec: BASE_DESIGN.md ("Slots & Ghosts"), SYSTEMS_SPEC.md §7.
// Sieges (heat consequences) are Phase 3 — heat is a real computed number
// here, just not yet a siege trigger.

export interface FacilityDef {
  id: string;
  name: string;
  desc: string;
  cost: { itemId: string; qty: number }[];
  heat: number;
}

export const FACILITIES: FacilityDef[] = [
  {
    id: 'command_post', name: 'Command Post', desc: 'The flag planted. This is home — comes with the claim.',
    cost: [], heat: 5,
  },
  {
    id: 'storage_crate', name: 'Storage Crates', desc: 'A proper stockpile corner. The base feels organized.',
    cost: [{ itemId: 'wood', qty: 3 }, { itemId: 'scrap', qty: 2 }], heat: 5,
  },
  {
    id: 'rain_collector', name: 'Rain Collector', desc: '+1 water bottle a day. The sky pays rent.',
    cost: [{ itemId: 'scrap', qty: 3 }], heat: 5,
  },
  {
    id: 'garden', name: 'Garden Plot', desc: '+2 produce a day (a Farmer crew member makes it +4). Food you didn\u2019t bleed for.',
    cost: [{ itemId: 'wood', qty: 2 }, { itemId: 'scrap', qty: 2 }], heat: 10,
  },
  {
    id: 'palisade', name: 'Palisade Wall', desc: 'Sharp logs pointing out. Defense — lowers the heat footprint of everything else.',
    cost: [{ itemId: 'wood', qty: 6 }], heat: 5,
  },
  {
    id: 'watchtower', name: 'Watchtower', desc: 'Eyes over the treeline. Defense — pairs with the palisade.',
    cost: [{ itemId: 'wood', qty: 5 }, { itemId: 'scrap', qty: 2 }], heat: 10,
  },
  {
    id: 'infirmary', name: 'Infirmary Tent', desc: 'The crew heals 20 HP a day here. Smells like rubbing alcohol and hope.',
    cost: [{ itemId: 'scrap', qty: 3 }, { itemId: 'cloth', qty: 4 }], heat: 5,
  },
  {
    id: 'salvage_rig', name: 'Salvage Rig', desc: '+1 scrap a day from everything you drag home. One person\u2019s wreckage, etc.',
    cost: [{ itemId: 'scrap', qty: 4 }, { itemId: 'tool_kit', qty: 1 }], heat: 10,
  },
  {
    id: 'garage_bay', name: 'Garage Bay', desc: 'A roof and a floor jack. Vehicle repair costs 1 fewer part (min 1).',
    cost: [{ itemId: 'wood', qty: 4 }, { itemId: 'scrap', qty: 4 }], heat: 15,
  },
];

/** Wave 3 build queue: construction takes real time — a flat 45 minutes
 *  plus 20 per unit of materials in the cost. */
export function buildMinutes(f: FacilityDef): number {
  return 45 + f.cost.reduce((a, c) => a + c.qty, 0) * 20;
}

/** sodgame heat formula (BASE_DESIGN §3): stockpile×1.2 + defense×0.8 + days×0.5,
 *  thresholds 30/60/90. Stockpile is abstracted as facilities+crew until the
 *  stockpile UI ships — the number is real and monotonic, not decoration. */
export function baseHeat(facilities: readonly string[], crewCount: number, days: number): number {
  let heat = 0;
  for (const f of facilities) heat += FACILITIES.find((d) => d.id === f)?.heat ?? 0;
  heat += crewCount * 5;
  heat += days * 0.5;
  if (facilities.includes('palisade')) heat -= 10;
  if (facilities.includes('watchtower')) heat -= 5;
  return Math.max(0, Math.round(heat));
}

export function heatBand(heat: number): 'Quiet' | 'Exposed' | 'Hot' {
  if (heat >= 60) return 'Hot';
  if (heat >= 30) return 'Exposed';
  return 'Quiet';
}

export const CLAIMABLE: { poiId: string; name: string }[] = [
  // TOTAL PURGE (2026-10-20): every other claim site was demolished with
  // its buildings. The lighthouse grounds are the one claimable home.
  { poiId: 'lighthouse_base', name: 'Lighthouse Grounds' },
];

// ============================================================================
// Lane 10 — the tiered base model (BASE_DESIGN §3, SYSTEMS_SPEC §7).
// The flat FACILITIES table above is the live Wave-3 build queue's data and
// stays untouched for the current UI/store. Everything below is the full
// "Slots & Ghosts" model the Base tab (BasePanel) and the claims/morale
// systems run on; it supersedes the flat table at the Lane-5 merge.
// ============================================================================

import type { SurvivorJob } from './survivors';
import { ITEMS } from './items';

export interface ItemQty {
  itemId: string;
  qty: number;
}

// ---- Claim sites (BASE_DESIGN §3.1/§3.2) ----

export type ClaimClass = 'home' | 'outpost' | 'field' | 'never';

export interface ClaimSiteDef {
  poiId: string;
  name: string;
  klass: ClaimClass;
  /** Facility slots at this site (BASE_DESIGN §3.1). */
  facilitySlots: number;
  /** Prefab ring radius: 40m home / 20m outpost (Rust's bubble, repurposed). */
  prefabRadiusM: number;
  /** Military compound's heavy bay (box truck / semi). */
  heavyBay?: boolean;
  /** Only these sites may host the facility (e.g. Salvage Rig needs shore). */
  cost: ItemQty[];
  /** Recruited survivors required at claim time (town: 3 — big bases are earned with people). */
  survivorGate?: number;
  /** Faction-rep path to access, as an ALTERNATIVE to the war path. Band-agnostic:
   *  a raw rep floor, no tier-band semantics (rep-band ruling still open). */
  repPath?: { factionId: string; min: number };
  /** True when taking the site by force is a legitimate second path (town). */
  warPath?: boolean;
  note: string;
}

export const CLAIM_SITES: ClaimSiteDef[] = [
  {
    poiId: 'shore_camp', name: 'Shore Camp', klass: 'home', facilitySlots: 3, prefabRadiusM: 40,
    cost: [], note: 'The starter. Shore access = salvage + fish traps. The tutorial claim — free.',
  },
  {
    poiId: 'jonah_camp', name: 'Jonah\u2019s Camp', klass: 'home', facilitySlots: 4, prefabRadiusM: 40,
    cost: [{ itemId: 'scrap', qty: 15 }],
    note: 'The inland alternative — forest cover, deer, worse water. A real choice vs. shore, not an upgrade.',
  },
  {
    poiId: 'town', name: 'Cedar Shoal (Town)', klass: 'home', facilitySlots: 6, prefabRadiusM: 40,
    cost: [{ itemId: 'scrap', qty: 40 }], survivorGate: 3,
    repPath: { factionId: 'union', min: 25 }, warPath: true,
    note: 'The prize: houses, garages, loot density, highest ambient husk pressure. Two doors in — the Union\u2019s blessing (rep \u226525) or taken by force. Both are shown; neither is hidden.',
  },
  {
    poiId: 'relay_station', name: 'Relay Station', klass: 'outpost', facilitySlots: 1, prefabRadiusM: 20,
    cost: [{ itemId: 'scrap', qty: 20 }, { itemId: 'wire', qty: 10 }],
    note: 'The intel outpost. Built-in Radio Tower. You don\u2019t live here; you staff it and it watches the island.',
  },
  {
    poiId: 'forest_cache', name: 'Forest Cache', klass: 'field', facilitySlots: 0, prefabRadiusM: 20,
    cost: [{ itemId: 'scrap', qty: 10 }],
    note: 'A locker, a campfire, a fast-travel node. Storage only — no facility slot.',
  },
  {
    poiId: 'dune_cache', name: 'Dune Cache', klass: 'field', facilitySlots: 0, prefabRadiusM: 20,
    cost: [{ itemId: 'scrap', qty: 10 }],
    note: 'Same as the forest cache, east side — the D.C.-road staging instinct starts here.',
  },
  {
    poiId: 'military_base', name: 'Military Compound', klass: 'home', facilitySlots: 8, prefabRadiusM: 40,
    heavyBay: true, cost: [],
    note: 'The Phase 3 endgame base. The cost is clearing it — that\u2019s the whole price.',
  },
  {
    poiId: 'lighthouse_base', name: 'Lighthouse Grounds', klass: 'never', facilitySlots: 0, prefabRadiusM: 0,
    cost: [], note: 'Story anchor + Collective site. Sleep/fast-travel only — claiming it would bulldoze the ending\u2019s geography.',
  },
  {
    poiId: 'wreck', name: 'The Wreck', klass: 'never', facilitySlots: 0, prefabRadiusM: 0,
    cost: [], note: 'A salvage source for shore bases, not a home.',
  },
];

export function claimSite(poiId: string): ClaimSiteDef | undefined {
  return CLAIM_SITES.find((s) => s.poiId === poiId);
}

/** Outpost limit by Command Post tier (BASE_DESIGN §3.1): T1 2, +1/tier, max 4. */
export function outpostLimit(commandPostTier: number): number {
  return Math.max(0, Math.min(4, commandPostTier + 1));
}

/** Relocation salvage rate (BASE_DESIGN §3.2): facilities refund 70% of materials. */
export const RELOCATION_SALVAGE = 0.7;

// ---- Tiered facilities (BASE_DESIGN §3.3) ----

export type FacilityGate = 'solo' | 'builder' | 'builder_specialist_blueprint';

export interface FacilityTierDef {
  tier: 1 | 2 | 3;
  cost: ItemQty[];
  /** Build hours with 1 Builder on the job. Player solo = ×1.5, T1 only (§3.5). */
  buildHours: number;
  /** Power draw in kW (0 if none). */
  powerKw: number;
  gate: FacilityGate;
  /** Specialist required at the blueprint gate (T3). */
  specialistJob?: SurvivorJob;
  /** Blueprint item id required at T3 (loot-first per Decision 5). */
  blueprintId?: string;
  effectText: string;
  /** Staffed production, per hour. Unstaffed: T1 runs at 25%, T2+ produces nothing (§3.5). */
  production?: { itemId: string; perHour: number };
  production2?: { itemId: string; perHour: number };
  /** Intel per hour (Radio Tower — intel is spent, not eaten, so it is not a stockpile item). */
  intelPerHour?: number;
  stockpileCapKg?: number;
  popCap?: number;
  outpostSlots?: number;
  /** Generator tiers: power capacity provided. */
  generatorKw?: number;
  /** Generator: game hours one fuel_can runs. */
  fuelHoursPerCan?: number;
  bays?: number;
  heavyBay?: boolean;
}

export interface TieredFacilityDef {
  id: string;
  name: string;
  /** Job that staffs this facility (production gates on it at T2+). */
  staffJob?: SurvivorJob;
  /** Sites this facility may be built at (absent = anywhere with a slot). */
  siteRestriction?: string[];
  tiers: FacilityTierDef[];
}

export const TIERED_FACILITIES: TieredFacilityDef[] = [
  {
    id: 'command_post', name: 'Command Post',
    tiers: [
      { tier: 1, cost: [], buildHours: 0, powerKw: 0, gate: 'solo', popCap: 4, outpostSlots: 2, effectText: 'Base tab, 2 outpost slots. Comes with the claim.' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 20 }, { itemId: 'wire', qty: 10 }], buildHours: 3, powerKw: 0, gate: 'builder', popCap: 7, outpostSlots: 3, effectText: '+1 outpost slot, heat readout + siege warning.' },
      { tier: 3, cost: [{ itemId: 'scrap', qty: 40 }, { itemId: 'wire', qty: 20 }, { itemId: 'relay_part', qty: 1 }], buildHours: 6, powerKw: 0, gate: 'builder_specialist_blueprint', specialistJob: 'Operator', blueprintId: 'bp_command_post', popCap: 10, outpostSlots: 4, effectText: '+1 outpost slot, convoy intel (spends Radio intel).' },
    ],
  },
  {
    id: 'workbench', name: 'Workbench \u2192 Workshop \u2192 Machine Shop', staffJob: 'Mechanic',
    tiers: [
      { tier: 1, cost: [{ itemId: 'scrap', qty: 10 }, { itemId: 'wood', qty: 6 }], buildHours: 2, powerKw: 0, gate: 'solo', effectText: 'Bench recipes: ammo reload, medkit. Staffed Mechanic: +25% craft speed.' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 25 }, { itemId: 'wire', qty: 10 }], buildHours: 4, powerKw: 0, gate: 'builder', effectText: 'Weapon/armor crafting, repair kits.' },
      { tier: 3, cost: [{ itemId: 'scrap', qty: 45 }, { itemId: 'wire', qty: 15 }, { itemId: 'gun_parts', qty: 2 }], buildHours: 8, powerKw: 0, gate: 'builder_specialist_blueprint', specialistJob: 'Mechanic', blueprintId: 'bp_machine_shop', effectText: 'Fabricate gun_parts, engine_part from scrap+wire (slow). The manufacturing ceiling.' },
    ],
  },
  {
    id: 'storage', name: 'Storage Locker \u2192 Supply Depot',
    tiers: [
      { tier: 1, cost: [{ itemId: 'wood', qty: 8 }, { itemId: 'scrap', qty: 4 }], buildHours: 1, powerKw: 0, gate: 'solo', stockpileCapKg: 200, effectText: 'Stockpile cap 200kg.' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 20 }, { itemId: 'wood', qty: 10 }], buildHours: 3, powerKw: 0, gate: 'builder', stockpileCapKg: 600, effectText: 'Stockpile cap 600kg. Deposit anywhere, withdraw at home.' },
      { tier: 3, cost: [{ itemId: 'scrap', qty: 40 }, { itemId: 'wire', qty: 10 }], buildHours: 6, powerKw: 0, gate: 'builder_specialist_blueprint', blueprintId: 'bp_supply_depot', stockpileCapKg: 1500, effectText: 'Stockpile cap 1500kg.' },
    ],
  },
  {
    id: 'water', name: 'Rain Collector \u2192 Pump Station',
    tiers: [
      { tier: 1, cost: [{ itemId: 'wood', qty: 6 }, { itemId: 'cloth', qty: 4 }], buildHours: 1, powerKw: 0, gate: 'solo', production: { itemId: 'water_bottle', perHour: 0.4 }, effectText: 'water_bottle 0.4/hr. PZ\u2019s rain barrel, honestly ported.' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 15 }, { itemId: 'wire', qty: 8 }], buildHours: 3, powerKw: 0.4, gate: 'builder', production: { itemId: 'water_bottle', perHour: 1.0 }, effectText: 'water_bottle 1.0/hr. A well pump — the water table is 2m down.' },
      { tier: 3, cost: [{ itemId: 'scrap', qty: 30 }, { itemId: 'wire', qty: 12 }], buildHours: 6, powerKw: 0.8, gate: 'builder_specialist_blueprint', blueprintId: 'bp_pump_station', production: { itemId: 'water_bottle', perHour: 2.0 }, effectText: 'water_bottle 2.0/hr.' },
    ],
  },
  {
    id: 'garden', name: 'Garden \u2192 Greenhouse \u2192 Hydroponics', staffJob: 'Farmer',
    tiers: [
      { tier: 1, cost: [{ itemId: 'wood', qty: 8 }], buildHours: 2, powerKw: 0, gate: 'solo', production: { itemId: 'produce', perHour: 0.8 }, effectText: 'produce 0.8/hr.' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 20 }, { itemId: 'cloth', qty: 10 }], buildHours: 4, powerKw: 0.4, gate: 'builder', production: { itemId: 'produce', perHour: 1.6 }, effectText: 'produce 1.6/hr. Needs a Farmer staffed.' },
      { tier: 3, cost: [{ itemId: 'scrap', qty: 35 }, { itemId: 'wire', qty: 15 }], buildHours: 8, powerKw: 0.8, gate: 'builder_specialist_blueprint', specialistJob: 'Farmer', blueprintId: 'bp_hydroponics', production: { itemId: 'produce', perHour: 3.0 }, production2: { itemId: 'bandage', perHour: 0.3 }, effectText: 'produce 3.0/hr + bandage-herb trickle 0.3/hr.' },
    ],
  },
  {
    id: 'infirmary', name: 'Med Cot \u2192 Infirmary \u2192 Field Hospital', staffJob: 'Medic',
    tiers: [
      { tier: 1, cost: [{ itemId: 'cloth', qty: 10 }, { itemId: 'scrap', qty: 5 }], buildHours: 2, powerKw: 0, gate: 'solo', production: { itemId: 'bandage', perHour: 0.5 }, effectText: 'bandage 0.5/hr.' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 25 }, { itemId: 'cloth', qty: 10 }], buildHours: 4, powerKw: 0.4, gate: 'builder', production: { itemId: 'bandage', perHour: 0.5 }, effectText: 'Medkit crafting; injured survivors recover 2\u00d7. Needs a Medic staffed.' },
      { tier: 3, cost: [{ itemId: 'scrap', qty: 45 }, { itemId: 'wire', qty: 15 }], buildHours: 8, powerKw: 0.8, gate: 'builder_specialist_blueprint', specialistJob: 'Medic', blueprintId: 'bp_field_hospital', production: { itemId: 'medkit', perHour: 0.4 }, effectText: 'medkit 0.4/hr passive; recovery 3\u00d7.' },
    ],
  },
  {
    id: 'radio', name: 'Radio Tower', staffJob: 'Operator',
    tiers: [
      { tier: 1, cost: [{ itemId: 'scrap', qty: 15 }, { itemId: 'wire', qty: 12 }], buildHours: 3, powerKw: 0, gate: 'solo', intelPerHour: 0.5, effectText: 'Intel 0.5/hr (built-in at the relay station). Needs an Operator staffed.' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 25 }, { itemId: 'wire', qty: 20 }], buildHours: 6, powerKw: 0.4, gate: 'builder', intelPerHour: 1.0, effectText: 'Intel 1.0/hr. Intel is spent: convoy schedules, siege forecasts, Static-surge warnings.' },
    ],
  },
  {
    id: 'garage', name: 'Garage Bay', staffJob: 'Mechanic',
    tiers: [
      { tier: 1, cost: [{ itemId: 'scrap', qty: 20 }, { itemId: 'wood', qty: 10 }], buildHours: 4, powerKw: 0, gate: 'solo', bays: 1, effectText: '1 bay. Stored vehicles are protected; full repair at the bay (field repair caps at 60%).' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 40 }, { itemId: 'wire', qty: 15 }], buildHours: 8, powerKw: 0.4, gate: 'builder', bays: 2, effectText: '2 bays. fuel_can siphon trickle 1/hr from stored wrecks.' },
      { tier: 3, cost: [{ itemId: 'scrap', qty: 70 }, { itemId: 'engine_part', qty: 2 }], buildHours: 12, powerKw: 1.2, gate: 'builder_specialist_blueprint', specialistJob: 'Mechanic', blueprintId: 'bp_heavy_garage', bays: 3, heavyBay: true, effectText: '3 bays — the third is heavy (box truck / semi tractor). Vehicle manufacture with Machine Shop T2 + a Mechanic.' },
    ],
  },
  {
    id: 'generator', name: 'Generator',
    tiers: [
      { tier: 1, cost: [{ itemId: 'scrap', qty: 12 }, { itemId: 'wire', qty: 6 }], buildHours: 2, powerKw: 0, gate: 'solo', generatorKw: 1.5, fuelHoursPerCan: 10, effectText: '1.5 kW. Burns 1 fuel_can per 10h. The only upkeep in the game. Loud — feeds heat slightly.' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 30 }, { itemId: 'wire', qty: 12 }], buildHours: 5, powerKw: 0, gate: 'builder', generatorKw: 3.5, fuelHoursPerCan: 16, effectText: '3.5 kW. Burns 1 fuel_can per 16h (more efficient).' },
    ],
  },
  {
    id: 'salvage_rig', name: 'Salvage Rig', staffJob: 'Scavenger', siteRestriction: ['shore_camp', 'town'],
    tiers: [
      { tier: 1, cost: [{ itemId: 'scrap', qty: 12 }, { itemId: 'wood', qty: 6 }], buildHours: 3, powerKw: 0, gate: 'solo', production: { itemId: 'scrap', perHour: 1.2 }, production2: { itemId: 'wire', perHour: 0.4 }, effectText: 'scrap 1.2/hr, wire 0.4/hr, ~8%/hr a vehicle part. The wrecks are this island\u2019s ore body.' },
      { tier: 2, cost: [{ itemId: 'scrap', qty: 30 }, { itemId: 'wire', qty: 10 }], buildHours: 6, powerKw: 0, gate: 'builder', production: { itemId: 'scrap', perHour: 2.16 }, production2: { itemId: 'wire', perHour: 0.72 }, effectText: 'Dredge barge: rates \u00d71.8, part chance 12%/hr.' },
    ],
  },
  {
    id: 'fish_traps', name: 'Fish Traps / Crab Pots', siteRestriction: ['shore_camp', 'town', 'dune_cache'],
    tiers: [
      { tier: 1, cost: [{ itemId: 'wood', qty: 4 }, { itemId: 'cloth', qty: 2 }], buildHours: 0.5, powerKw: 0, gate: 'solo', production: { itemId: 'raw_meat', perHour: 0.5 }, effectText: 'raw_meat 0.5/hr — the protein line that pairs with the Garden.' },
    ],
  },
];

export function tieredFacility(id: string): TieredFacilityDef | undefined {
  return TIERED_FACILITIES.find((f) => f.id === id);
}

export function tierDef(facilityId: string, tier: number): FacilityTierDef | undefined {
  return tieredFacility(facilityId)?.tiers.find((t) => t.tier === tier);
}

// ---- Prefab kit (BASE_DESIGN §3.3b) — structures & defenses as ghosts ----

export interface PrefabDef {
  id: string;
  name: string;
  cost: ItemQty[];
  /** Build hours (×1.5 solo rule applies to labor generally; prefabs are player-buildable). */
  buildHours: number;
  hp: number;
  /** Defense score contribution (feeds heat §3.7 — a fortress is visible). */
  defense: number;
  /** Comfort contribution, 0–3 base total (Valheim's steal). */
  comfort?: number;
  /** Damage per second to husks in contact (spikes). */
  contactDps?: number;
  /** Upgrade-in-place: extra cost and resulting HP (palisade → scrap-plated). */
  upgrade?: { cost: ItemQty[]; hp: number };
  /** A staffable Guard post (watchtower). */
  guardPost?: boolean;
  /** Water trickle (rain barrel stacks with the Water facility). */
  waterPerHour?: number;
  effectText: string;
}

export const PREFAB_DEFS: PrefabDef[] = [
  { id: 'palisade_wall', name: 'Palisade Wall (3m)', cost: [{ itemId: 'wood', qty: 3 }], buildHours: 1 / 3, hp: 300, defense: 1, upgrade: { cost: [{ itemId: 'scrap', qty: 4 }], hp: 700 }, effectText: '300 HP. Upgrade-in-place: +4 scrap \u2192 700 HP scrap-plated.' },
  { id: 'gate', name: 'Gate', cost: [{ itemId: 'wood', qty: 4 }, { itemId: 'scrap', qty: 2 }], buildHours: 0.5, hp: 250, defense: 2, effectText: '250 HP, player/survivor passable, husk-proof closed. The weak point, priced honestly.' },
  { id: 'spikes', name: 'Spike Barricade', cost: [{ itemId: 'wood', qty: 2 }, { itemId: 'scrap', qty: 1 }], buildHours: 0.25, hp: 120, defense: 1, contactDps: 6, effectText: '120 HP, 6 dmg/s to husks in contact.' },
  { id: 'fence', name: 'Fence (3m)', cost: [{ itemId: 'wood', qty: 2 }], buildHours: 1 / 6, hp: 80, defense: 0, effectText: '80 HP — channeling, not stopping.' },
  { id: 'watchtower', name: 'Watchtower', cost: [{ itemId: 'wood', qty: 12 }, { itemId: 'scrap', qty: 4 }], buildHours: 2, hp: 400, defense: 8, guardPost: true, effectText: 'Climbable. A staffed Guard fires from it during sieges.' },
  { id: 'rain_barrel', name: 'Rain Barrel', cost: [{ itemId: 'wood', qty: 3 }, { itemId: 'cloth', qty: 1 }], buildHours: 0.25, hp: 60, defense: 0, waterPerHour: 0.15, effectText: '+0.15/hr water — stacks with, doesn\u2019t replace, the Water facility.' },
  { id: 'campfire_bedroll', name: 'Campfire + Bedroll Set', cost: [{ itemId: 'wood', qty: 2 }, { itemId: 'cloth', qty: 2 }], buildHours: 1 / 6, hp: 40, defense: 0, comfort: 2, effectText: 'Sleep/save point, Well Rested source. Comfort +2 (beds + a lit fire).' },
  { id: 'mess_table', name: 'Mess Table', cost: [{ itemId: 'wood', qty: 2 }], buildHours: 1 / 6, hp: 40, defense: 0, comfort: 1, effectText: 'Comfort +1. A kept base is a defended base.' },
  { id: 'storage_crate', name: 'Storage Crate', cost: [{ itemId: 'wood', qty: 4 }], buildHours: 1 / 6, hp: 80, defense: 0, effectText: 'Physical overflow storage. Loot lives in the world, not a magic menu.' },
];

export function prefabDef(id: string): PrefabDef | undefined {
  return PREFAB_DEFS.find((p) => p.id === id);
}

// ---- Heat (BASE_DESIGN §3.7 — sodgame's formula, unchanged) ----
// heat = stockpileValue ×1.2 + defenseScore ×0.8 + daysSurvived ×0.5
// (+0.2 per husk killed within 100m of base — Grounded's local-aggro modifier,
// applied by the caller through computeHeat's localKills.)

export const HEAT_VALUES: Record<string, number> = {
  scrap: 1, wood: 1, cloth: 1, wire: 2,
  canned_food: 2, produce: 2, water_bottle: 2, raw_meat: 2, cooked_meat: 2,
  bandage: 3, ammo_9mm: 1, fuel_can: 6, medkit: 8,
  tire: 10, engine_part: 10, car_battery: 10, gun_parts: 12, valuables: 15,
};

/** Heat value of one unit; unlisted items are not taxed wealth (§3.7's table is the tax roll). */
export function heatValueOf(itemId: string): number {
  return HEAT_VALUES[itemId] ?? 0;
}

export function stockpileHeatValue(items: readonly ItemQty[]): number {
  return items.reduce((a, it) => a + heatValueOf(it.itemId) * it.qty, 0);
}

export function stockpileWeightKg(items: readonly ItemQty[]): number {
  return items.reduce((a, it) => a + (ITEMS[it.itemId]?.weight ?? 0) * it.qty, 0);
}

/**
 * Defense score (§3.7): Σ prefab defense + 6 per staffed Guard (cap +18)
 * + 5 if Garage T2+ (the motor pool's shutters). Note the formula's
 * deliberate irony, kept from sodgame: defense RAISES heat — a fortress
 * is visible. Defense doesn't prevent the siege; it wins it. (The legacy
 * baseHeat() above subtracts palisade/watchtower — that discount is the
 * old abstraction and is NOT carried into this formula.)
 */
export function defenseScore(input: {
  prefabIds: readonly string[];
  staffedGuards: number;
  garageTier: number;
}): number {
  let d = 0;
  for (const id of input.prefabIds) d += prefabDef(id)?.defense ?? 0;
  d += Math.min(18, 6 * Math.max(0, input.staffedGuards));
  if (input.garageTier >= 2) d += 5;
  return d;
}

/** The §3.7 formula. localKills = husks killed within 100m of base (+0.2 each). */
export function heatV2(stockpileValue: number, defense: number, daysSurvived: number, localKills = 0): number {
  return Math.max(0, Math.round(stockpileValue * 1.2 + defense * 0.8 + daysSurvived * 0.5 + localKills * 0.2));
}

export type HeatTier = 'calm' | 'scout' | 'warning' | 'siege';

/** Thresholds (§3.7): 30 scouts · 60 warning (siege next night) · 90 siege escalates a tier. */
export function heatTier(heat: number): HeatTier {
  if (heat >= 90) return 'siege';
  if (heat >= 60) return 'warning';
  if (heat >= 30) return 'scout';
  return 'calm';
}

export const HEAT_TIER_LABEL: Record<HeatTier, string> = {
  calm: 'Calm',
  scout: 'Scout activity',
  warning: 'Siege warning',
  siege: 'Siege imminent — escalated',
};
