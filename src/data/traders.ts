// traders.ts — the canon trader roster (FACTIONS_CANON §2) as barter data.
//
// There is no currency in NOMAD: every offer is an item-for-item barter
// resolved against the store's public countItem/addItem/removeItem API.
// Prices are hand-set exchange rates until Lane 6's ItemDef.barterValue
// lands; then offers can be VALUE-DERIVED instead of hand-set (see the
// note in TraderPanel). Gates use RAW rep numbers / story flags only —
// never repTier() names — so the rep-band contradiction (factions.ts ⚠)
// cannot change trader behavior.
//
// Skulls trader is NULL BY DESIGN (canon §2.4): no entry here, ever.
// Listeners likewise (canon §3.3).

import { ALLIED_DEEP_GATE } from './factions';

export interface BarterStack { itemId: string; qty: number }

export interface BarterOffer {
  give: BarterStack[];
  get: BarterStack;
  note?: string;
}

export type TraderGate =
  | { kind: 'none' }
  | { kind: 'rep'; faction: string; min: number }
  | { kind: 'flag'; flag: string };

export interface TraderDef {
  id: string;
  name: string;
  faction: string;
  /** NPC placement key in worldWiring.NPC_PLACEMENTS. */
  npcKey: string;
  era: 'easymode' | 'hardmode';
  gate: TraderGate;
  /** Player-facing line when the gate refuses. */
  gateText: string;
  greeting: string;
  offers: BarterOffer[];
}

export function traderAccess(
  trader: TraderDef,
  rep: Record<string, number>,
  flags: Record<string, boolean>,
): { ok: boolean; reason?: string } {
  const g = trader.gate;
  if (g.kind === 'none') return { ok: true };
  if (g.kind === 'flag') {
    return flags[g.flag]
      ? { ok: true }
      : { ok: false, reason: trader.gateText };
  }
  const cur = rep[g.faction] ?? 0;
  return cur >= g.min
    ? { ok: true }
    : { ok: false, reason: `${trader.gateText} (standing ${cur}/${g.min})` };
}

const S = (itemId: string, qty: number): BarterStack => ({ itemId, qty });

export const TRADERS: TraderDef[] = [
  {
    id: 'quartermaster', name: 'The Quartermaster', faction: 'remnants',
    npcKey: 'quartermaster', era: 'easymode',
    gate: { kind: 'rep', faction: 'remnants', min: ALLIED_DEEP_GATE },
    gateText: 'The quartermaster looks through you. “Civilians don’t draw from this armory. Earn the Chain’s trust — seventy-five points of it — then come back.”',
    greeting: 'Ledger’s open. Military grade, military prices. Don’t waste my count.',
    offers: [
      { give: [S('valuables', 2)], get: S('ammo_rifle', 20), note: '5.56 by the box' },
      { give: [S('valuables', 2)], get: S('ammo_556', 20) },
      { give: [S('valuables', 1), S('scrap', 6)], get: S('shells', 12) },
      { give: [S('valuables', 3)], get: S('armor_plate', 1), note: 'Real plate. Stops what cloth won’t.' },
      { give: [S('valuables', 4)], get: S('armored_vest', 1) },
      { give: [S('valuables', 3)], get: S('riot_helmet', 1) },
      { give: [S('valuables', 5), S('gun_parts', 2)], get: S('carbine', 1), note: 'Service carbine, armory-checked' },
      { give: [S('valuables', 8), S('gun_parts', 3)], get: S('dmr', 1), note: 'The best rifle on the island' },
      { give: [S('valuables', 3)], get: S('suppressor', 1) },
      { give: [S('valuables', 2)], get: S('extended_mag', 1) },
      { give: [S('gun_parts', 1)], get: S('ammo_9mm', 24), note: 'Parts-for-pistol-ammo, armory rate' },
      // the Chain BUYS military salvage
      { give: [S('gun_parts', 2)], get: S('valuables', 1), note: 'They buy gun parts' },
      { give: [S('engine_part', 1)], get: S('valuables', 1), note: 'They buy engine parts' },
    ],
  },
  {
    id: 'union_medic', name: 'Sister Mariah’s Clinic', faction: 'union',
    npcKey: 'okonkwo', era: 'easymode',
    gate: { kind: 'rep', faction: 'union', min: 25 },
    gateText: 'Mariah shakes her head gently. “The clinic treats the town first, friend. Help the Union a little — then we’ll talk.”',
    greeting: 'Sit if you’re bleeding. The clinic trades fair: food and care, no coin but kindness and scrap.',
    offers: [
      { give: [S('scrap', 2)], get: S('bandage', 2) },
      { give: [S('cloth', 2), S('scrap', 2)], get: S('medkit', 1) },
      { give: [S('scrap', 2)], get: S('canned_food', 2) },
      { give: [S('produce', 2)], get: S('cooked_meat', 2), note: 'The kitchen cooks your produce' },
      { give: [S('raw_meat', 2)], get: S('cooked_meat', 2), note: 'Cooked while you wait' },
      { give: [S('scrap', 1)], get: S('water_bottle', 2) },
      { give: [S('canned_food', 3)], get: S('medkit', 1), note: 'Food-for-care, clinic rate' },
      // the clinic BUYS medicine inputs
      { give: [S('chemicals', 1)], get: S('bandage', 3), note: 'They buy chemicals for antiseptic' },
      { give: [S('produce', 3)], get: S('scrap', 2), note: 'The garden buys surplus produce' },
    ],
  },
  {
    id: 'kowalski_bench', name: 'Kowalski’s Bench', faction: 'lighthouse',
    npcKey: 'kowalski', era: 'easymode',
    gate: { kind: 'flag', flag: 'kowalski_helped' },
    gateText: 'The bench is covered in relay guts. “Help me get this tower talking first,” Kowalski says, not looking up. “Then the bench is yours.”',
    greeting: 'Bench is open. Tech, mods, and things that hum. Mind the solder.',
    offers: [
      { give: [S('components', 2)], get: S('relay_part', 1), note: 'Capacitors, rebuilt by hand' },
      { give: [S('valuables', 2)], get: S('beacon_cell', 1) },
      { give: [S('scrap', 4), S('wire', 2)], get: S('components', 1) },
      { give: [S('valuables', 2)], get: S('reflex_sight', 1) },
      { give: [S('valuables', 2)], get: S('laser_sight', 1) },
      { give: [S('valuables', 1), S('scrap', 3)], get: S('tool_kit', 1) },
      { give: [S('scrap', 2)], get: S('cleaning_kit', 1) },
      { give: [S('scrap', 2)], get: S('gun_oil', 1) },
      // the bench BUYS tech
      { give: [S('relay_part', 1)], get: S('valuables', 1), note: 'She buys relay parts back' },
      { give: [S('components', 2)], get: S('valuables', 1) },
    ],
  },
  {
    id: 'toll_exchange', name: 'The Toll Exchange', faction: 'tollkeepers',
    npcKey: 'wraith', era: 'easymode',
    gate: { kind: 'none' },
    gateText: '',
    greeting: 'Wraith doesn’t look up from the ledger. “Schedule’s on the post. Prices are the schedule. The schedule is the price.”',
    offers: [
      { give: [S('valuables', 1)], get: S('fuel_can', 1), note: 'Toll schedule: fuel' },
      { give: [S('valuables', 2)], get: S('tire', 1), note: 'Toll schedule: rubber' },
      { give: [S('valuables', 3)], get: S('engine_part', 1) },
      { give: [S('valuables', 2)], get: S('car_battery', 1) },
      { give: [S('scrap', 3)], get: S('water_bottle', 1) },
      { give: [S('scrap', 4)], get: S('canned_food', 1) },
      // the booth BUYS vehicle salvage at schedule rates
      { give: [S('tire', 1)], get: S('valuables', 1), note: 'They buy tires, no questions' },
      { give: [S('car_battery', 1)], get: S('valuables', 1) },
    ],
  },
  {
    id: 'chandlery', name: 'Vesper’s Chandlery', faction: 'drowned',
    npcKey: 'vesper', era: 'easymode',
    gate: { kind: 'none' },
    gateText: '',
    greeting: 'Selene Vesper prices salvage by eye and weather. “The Sound provides. I just take a handling fee.”',
    offers: [
      { give: [S('valuables', 1)], get: S('fuel_can', 1), note: 'Cheaper than the bridge — the Drowned way' },
      { give: [S('scrap', 3)], get: S('wire', 2) },
      { give: [S('scrap', 3)], get: S('cloth', 2) },
      { give: [S('valuables', 1)], get: S('flare', 2) },
      { give: [S('valuables', 2)], get: S('flare_gun', 1), note: 'Every boat should carry one' },
      { give: [S('valuables', 2), S('scrap', 4)], get: S('components', 1) },
      { give: [S('valuables', 2)], get: S('engine_part', 1), note: 'Outboard-grade, mostly' },
      // the flotilla BUYS salvage — their whole economy
      { give: [S('valuables', 1)], get: S('scrap', 6), note: 'They sell scrap by the armload' },
      { give: [S('engine_part', 1)], get: S('valuables', 1), note: 'They buy anything off a wreck' },
      { give: [S('car_battery', 1)], get: S('valuables', 1) },
    ],
  },
  // — hardmode roster (data-complete; era-gated until hardmode ships) —
  {
    id: 'licensed_quartermaster', name: 'Licensed Quartermaster', faction: 'authority',
    npcKey: 'authority_qm', era: 'hardmode',
    gate: { kind: 'flag', flag: 'hardmode_active' },
    gateText: '“No license on file. No trade.” The stamp comes down: DENIED.',
    greeting: 'Permits in order? Then we can do business. Authority standard, Authority prices.',
    offers: [
      { give: [S('valuables', 6)], get: S('armored_vest', 1), note: 'Authority-issue armor' },
      { give: [S('valuables', 4)], get: S('ammo_556', 30) },
      { give: [S('valuables', 5)], get: S('carbine', 1), note: 'Standardized, registered, serialized' },
    ],
  },
  {
    id: 'breakers_exchange', name: 'The Breaker’s Exchange', faction: 'boneyard',
    npcKey: 'boneyard_foreman', era: 'hardmode',
    gate: { kind: 'flag', flag: 'hardmode_active' },
    gateText: 'The foreman jerks a thumb at the yard. “We ain’t cutting yet.”',
    greeting: 'Ship steel, yard rates. If it floated, we can price it.',
    offers: [
      { give: [S('valuables', 5)], get: S('armor_plate', 2), note: 'APC-scale plate, torch-cut to order' },
      { give: [S('valuables', 3)], get: S('engine_part', 1), note: 'Marine diesel parts' },
      { give: [S('scrap', 10)], get: S('valuables', 1), note: 'They buy scrap by weight — the yard always eats' },
    ],
  },
];

export function traderById(id: string): TraderDef | undefined {
  return TRADERS.find((t) => t.id === id);
}

export function traderForFaction(factionId: string): TraderDef | undefined {
  return TRADERS.find((t) => t.faction === factionId);
}
