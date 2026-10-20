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
  { poiId: 'shore_camp', name: 'Shore Camp' },
  { poiId: 'jonah_camp', name: 'Jonah\u2019s Camp' },
  { poiId: 'lighthouse_base', name: 'Lighthouse Grounds' },
  // the carrier is a base of sorts: clear its guard pack, plant the flag
  { poiId: 'carrier', name: 'Heavy Logistics Carrier' },
];
