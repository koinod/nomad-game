import type { ItemDef } from '../store/types';

export const ITEMS: Record<string, ItemDef> = {
  pipe: {
    id: 'pipe', name: 'Lead pipe', category: 'weapon-melee', weight: 1.2, slots: 2, stack: 1,
    desc: 'Heavy plumbing pipe. Slow, but it ends arguments.', damage: 14,
  },
  machete: {
    id: 'machete', name: 'Machete', category: 'weapon-melee', weight: 0.9, slots: 2, stack: 1,
    desc: 'Brush blade, still sharp. Fast swings.', damage: 22,
  },
  hatchet: {
    id: 'hatchet', name: 'Hatchet', category: 'weapon-melee', weight: 1.0, slots: 2, stack: 1,
    desc: 'Camp hatchet. Balanced and reliable.', damage: 18,
  },
  pistol: {
    id: 'pistol', name: '9mm pistol', category: 'weapon-ranged', weight: 1.1, slots: 2, stack: 1,
    desc: 'Old service pistol. Loud — everything hears it.', damage: 34, range: 45, ammoId: 'ammo_9mm',
  },
  ammo_9mm: {
    id: 'ammo_9mm', name: '9mm rounds', category: 'ammo', weight: 0.02, slots: 1, stack: 60,
    desc: 'Brass-cased 9mm cartridges.',
  },
  bandage: {
    id: 'bandage', name: 'Bandage', category: 'medical', weight: 0.1, slots: 1, stack: 8,
    desc: 'Clean gauze and tape. Stops the bleeding.', heal: 35,
  },
  medkit: {
    id: 'medkit', name: 'Trauma kit', category: 'medical', weight: 0.6, slots: 2, stack: 3,
    desc: 'Field trauma kit. Puts you back together.', heal: 85,
  },
  canned_food: {
    id: 'canned_food', name: 'Canned beans', category: 'food', weight: 0.4, slots: 1, stack: 6,
    desc: 'Cold beans. Better than nothing.', heal: 15,
  },
  raw_meat: {
    id: 'raw_meat', name: 'Raw meat', category: 'food', weight: 0.5, slots: 1, stack: 6,
    desc: 'Fresh from the island. Eat it raw and regret it.', heal: 6,
  },
  cooked_meat: {
    id: 'cooked_meat', name: 'Cooked meat', category: 'food', weight: 0.4, slots: 1, stack: 6,
    desc: 'Seared over a fire. Real food.', heal: 45,
  },
  water_bottle: {
    id: 'water_bottle', name: 'Water bottle', category: 'food', weight: 0.5, slots: 1, stack: 4,
    desc: 'Sealed bottle. Drinkable.', heal: 8,
  },
  scrap: {
    id: 'scrap', name: 'Scrap metal', category: 'material', weight: 0.3, slots: 1, stack: 20,
    desc: 'Useful metal bits. The Collective pays for these.',
  },
  wire: {
    id: 'wire', name: 'Copper wire', category: 'material', weight: 0.2, slots: 1, stack: 10,
    desc: 'Stripped copper wire. Radio work needs this.',
  },
  cloth: {
    id: 'cloth', name: 'Cloth strips', category: 'material', weight: 0.1, slots: 1, stack: 10,
    desc: 'Torn fabric. Bandages, filters, patches.',
  },
  phone: {
    id: 'phone', name: 'Sat Phone', category: 'key', weight: 0.2, slots: 1, stack: 1,
    desc: 'A ruggedized handset. The screen flickers awake when you hold it.',
  },
  relay_part: {
    id: 'relay_part', name: 'Relay capacitor', category: 'key', weight: 0.8, slots: 1, stack: 3,
    desc: 'A scorched capacitor from the relay station. Kowalski can use these.',
  },
  beacon_cell: {
    id: 'beacon_cell', name: 'Beacon power cell', category: 'key', weight: 0.5, slots: 1, stack: 1,
    desc: 'The lighthouse beacon’s power cell. Heavy with intent.',
  },
  pack_t1: {
    id: 'pack_t1', name: 'Day pack', category: 'pack', weight: 0.8, slots: 2, stack: 1,
    desc: 'A sturdy day pack.', carryBonus: 8, packSlots: 4,
  },
  pack_t2: {
    id: 'pack_t2', name: 'Rigger pack', category: 'pack', weight: 1.2, slots: 2, stack: 1,
    desc: 'A rigger’s pack with a reinforced frame.', carryBonus: 15, packSlots: 8,
  },
  flare: {
    id: 'flare', name: 'Road flare', category: 'tool', weight: 0.3, slots: 1, stack: 4,
    desc: 'Burns bright and hisses. Husks turn toward the noise.',
  },
  baseball_bat: {
    id: 'baseball_bat', name: 'Baseball bat', category: 'weapon-melee', weight: 1.0, slots: 2, stack: 1,
    desc: 'Ash bat. Wide swing, sends things flying.', damage: 16,
  },
  combat_knife: {
    id: 'combat_knife', name: 'Combat knife', category: 'weapon-melee', weight: 0.4, slots: 1, stack: 1,
    desc: 'Short, silent, personal. Very fast.', damage: 15,
  },
  sledgehammer: {
    id: 'sledgehammer', name: 'Sledgehammer', category: 'weapon-melee', weight: 2.6, slots: 3, stack: 1,
    desc: 'Eight pounds of verdict. Slow — but nothing argues back.', damage: 30,
  },
  shotgun: {
    id: 'shotgun', name: 'Pump shotgun', category: 'weapon-ranged', weight: 3.2, slots: 3, stack: 1,
    desc: 'Six pellets of room-clearing certainty. Devastating up close.', damage: 11, range: 24, ammoId: 'shells', pellets: 6, spread: 0.055,
  },
  hunting_rifle: {
    id: 'hunting_rifle', name: 'Hunting rifle', category: 'weapon-ranged', weight: 3.6, slots: 3, stack: 1,
    desc: 'Bolt-action, scoped. One careful shot ends most problems.', damage: 58, range: 95, ammoId: 'ammo_rifle',
  },
  shells: {
    id: 'shells', name: 'Shotgun shells', category: 'ammo', weight: 0.05, slots: 1, stack: 24,
    desc: '12-gauge shells.',
  },
  ammo_rifle: {
    id: 'ammo_rifle', name: 'Rifle rounds', category: 'ammo', weight: 0.04, slots: 1, stack: 30,
    desc: 'High-velocity rifle cartridges.',
  },
  chemicals: {
    id: 'chemicals', name: 'Chemicals', category: 'material', weight: 0.4, slots: 1, stack: 6,
    desc: 'Solvents and reagents. Handle like they bite.',
  },
  fuel_can: {
    id: 'fuel_can', name: 'Fuel can', category: 'material', weight: 4.0, slots: 2, stack: 1,
    desc: 'Five gallons of go. Vehicles drink this.',
  },
  tire: {
    id: 'tire', name: 'Tire', category: 'material', weight: 6.0, slots: 2, stack: 2,
    desc: 'Vehicle tire, decent tread. Machine Shop work.',
  },
  engine_part: {
    id: 'engine_part', name: 'Engine part', category: 'material', weight: 3.0, slots: 2, stack: 2,
    desc: 'Machined engine component. Machine Shop work.',
  },
  car_battery: {
    id: 'car_battery', name: 'Car battery', category: 'material', weight: 7.0, slots: 2, stack: 1,
    desc: 'Holds a charge. Vehicles and bases both want these.',
  },
  torch: {
    id: 'torch', name: 'Torch', category: 'tool', weight: 0.4, slots: 1, stack: 2,
    desc: 'Cloth-wrapped branch, soaked in fuel. Light for the dark places.',
  },
  fire_starter: {
    id: 'fire_starter', name: 'Fire starter', category: 'tool', weight: 0.2, slots: 1, stack: 3,
    desc: 'Scrap striker and tinder. Every campfire starts somewhere.',
  },
};

// Husk corpse loot, keyed by spawn zone — Skyrim-style: what they were is
// what they carried. A drowned fisherman and a relay tech drop different kits.
export interface HuskLootEntry {
  id: string;
  min: number;
  max: number;
  chance: number;
}

export const HUSK_LOOT: Record<string, HuskLootEntry[]> = {
  forest: [
    { id: 'cloth', min: 1, max: 2, chance: 0.6 },
    { id: 'bandage', min: 1, max: 1, chance: 0.25 },
    { id: 'canned_food', min: 1, max: 2, chance: 0.3 },
    { id: 'flare', min: 1, max: 1, chance: 0.15 },
    { id: 'scrap', min: 1, max: 2, chance: 0.2 },
  ],
  town: [
    { id: 'canned_food', min: 1, max: 2, chance: 0.35 },
    { id: 'water_bottle', min: 1, max: 1, chance: 0.3 },
    { id: 'scrap', min: 1, max: 3, chance: 0.3 },
    { id: 'cloth', min: 1, max: 2, chance: 0.25 },
    { id: 'ammo_9mm', min: 2, max: 5, chance: 0.12 },
  ],
  relay: [
    { id: 'wire', min: 1, max: 3, chance: 0.4 },
    { id: 'scrap', min: 1, max: 2, chance: 0.35 },
    { id: 'flare', min: 1, max: 1, chance: 0.2 },
    { id: 'cloth', min: 1, max: 1, chance: 0.15 },
    { id: 'chemicals', min: 1, max: 1, chance: 0.2 },
  ],
  dunes: [
    { id: 'water_bottle', min: 1, max: 2, chance: 0.35 },
    { id: 'bandage', min: 1, max: 1, chance: 0.25 },
    { id: 'canned_food', min: 1, max: 1, chance: 0.25 },
    { id: 'cloth', min: 1, max: 2, chance: 0.2 },
  ],
  default: [
    { id: 'cloth', min: 1, max: 2, chance: 0.3 },
    { id: 'scrap', min: 1, max: 2, chance: 0.25 },
  ],
};

// Crafting — everything starts in the sat phone (field recipes). Serious
// work — weapons, chemicals, vehicle/industrial parts — needs the matching
// workstation, Fallout-style (Weapons Bench / Chemistry Station / Machine Shop).
export type StationId = 'workbench' | 'chemistry' | 'industrial';

export const STATION_LABEL: Record<StationId, string> = {
  workbench: 'Weapons Bench',
  chemistry: 'Chemistry Station',
  industrial: 'Machine Shop',
};

export interface FieldRecipe {
  id: string;
  name: string;
  components: { itemId: string; qty: number }[];
  resultId: string;
  resultQty: number;
  station?: StationId; // undefined = craftable anywhere from the phone
}

export const FIELD_RECIPES: Record<string, FieldRecipe> = {
  r_bandage: {
    id: 'r_bandage', name: 'Bandage',
    components: [{ itemId: 'cloth', qty: 2 }],
    resultId: 'bandage', resultQty: 1,
  },
  r_torch: {
    id: 'r_torch', name: 'Torch',
    components: [{ itemId: 'cloth', qty: 1 }, { itemId: 'scrap', qty: 1 }],
    resultId: 'torch', resultQty: 1,
  },
  r_fire_starter: {
    id: 'r_fire_starter', name: 'Fire starter',
    components: [{ itemId: 'scrap', qty: 2 }],
    resultId: 'fire_starter', resultQty: 1,
  },
  r_flare: {
    id: 'r_flare', name: 'Road flare',
    components: [{ itemId: 'wire', qty: 1 }, { itemId: 'scrap', qty: 1 }],
    resultId: 'flare', resultQty: 1,
  },
  r_cooked_meat: {
    id: 'r_cooked_meat', name: 'Cooked meat',
    components: [{ itemId: 'raw_meat', qty: 1 }],
    resultId: 'cooked_meat', resultQty: 1,
  },
};

// Workstation recipes — need the matching station and must be close to it.
export const STATION_RECIPES: Record<string, FieldRecipe> = {
  // --- Weapons Bench ---
  r_reload_9mm: {
    id: 'r_reload_9mm', name: 'Reload 9mm', station: 'workbench',
    components: [{ itemId: 'scrap', qty: 2 }, { itemId: 'wire', qty: 1 }],
    resultId: 'ammo_9mm', resultQty: 6,
  },
  r_bat: {
    id: 'r_bat', name: 'Baseball bat', station: 'workbench',
    components: [{ itemId: 'scrap', qty: 1 }, { itemId: 'cloth', qty: 1 }],
    resultId: 'baseball_bat', resultQty: 1,
  },
  r_combat_knife: {
    id: 'r_combat_knife', name: 'Combat knife', station: 'workbench',
    components: [{ itemId: 'scrap', qty: 2 }],
    resultId: 'combat_knife', resultQty: 1,
  },
  r_reload_shells: {
    id: 'r_reload_shells', name: 'Reload shells', station: 'workbench',
    components: [{ itemId: 'scrap', qty: 2 }],
    resultId: 'shells', resultQty: 4,
  },
  // --- Chemistry Station ---
  r_medkit: {
    id: 'r_medkit', name: 'Medkit', station: 'chemistry',
    components: [{ itemId: 'bandage', qty: 2 }, { itemId: 'chemicals', qty: 1 }],
    resultId: 'medkit', resultQty: 1,
  },
  r_fuel_can: {
    id: 'r_fuel_can', name: 'Fuel can', station: 'chemistry',
    components: [{ itemId: 'chemicals', qty: 2 }],
    resultId: 'fuel_can', resultQty: 1,
  },
  // --- Machine Shop ---
  r_tire: {
    id: 'r_tire', name: 'Tire', station: 'industrial',
    components: [{ itemId: 'scrap', qty: 3 }, { itemId: 'cloth', qty: 1 }],
    resultId: 'tire', resultQty: 1,
  },
  r_engine_part: {
    id: 'r_engine_part', name: 'Engine part', station: 'industrial',
    components: [{ itemId: 'scrap', qty: 4 }, { itemId: 'wire', qty: 2 }],
    resultId: 'engine_part', resultQty: 1,
  },
  r_car_battery: {
    id: 'r_car_battery', name: 'Car battery', station: 'industrial',
    components: [{ itemId: 'scrap', qty: 2 }, { itemId: 'wire', qty: 1 }, { itemId: 'chemicals', qty: 1 }],
    resultId: 'car_battery', resultQty: 1,
  },
};

export const BASE_CARRY_KG = 20;
export const BASE_SLOTS = 12;

// Furniture loot, keyed by furniture kind then house tier — what a room is
// for is what you find in it (sodgame's POI-template lesson).
// Tier 'suburban' includes camp kinds (crate/barrel/cooler) at richer tables.
export const FURNITURE_LOOT: Record<string, Record<'camp' | 'suburban', HuskLootEntry[]>> = {
  fridge: {
    camp: [
      { id: 'canned_food', min: 1, max: 2, chance: 0.7 },
      { id: 'water_bottle', min: 1, max: 1, chance: 0.5 },
    ],
    suburban: [
      { id: 'canned_food', min: 1, max: 3, chance: 0.85 },
      { id: 'water_bottle', min: 1, max: 2, chance: 0.65 },
      { id: 'cooked_meat', min: 1, max: 1, chance: 0.25 },
    ],
  },
  cabinets: {
    camp: [
      { id: 'canned_food', min: 1, max: 1, chance: 0.5 },
      { id: 'cloth', min: 1, max: 1, chance: 0.4 },
    ],
    suburban: [
      { id: 'canned_food', min: 1, max: 2, chance: 0.7 },
      { id: 'bandage', min: 1, max: 2, chance: 0.45 },
      { id: 'cloth', min: 1, max: 2, chance: 0.4 },
    ],
  },
  dresser: {
    camp: [
      { id: 'cloth', min: 1, max: 2, chance: 0.6 },
      { id: 'bandage', min: 1, max: 1, chance: 0.3 },
    ],
    suburban: [
      { id: 'cloth', min: 1, max: 3, chance: 0.75 },
      { id: 'bandage', min: 1, max: 2, chance: 0.4 },
      { id: 'ammo_9mm', min: 2, max: 6, chance: 0.2 },
    ],
  },
  bookshelf: {
    camp: [
      { id: 'wire', min: 1, max: 1, chance: 0.4 },
    ],
    suburban: [
      { id: 'wire', min: 1, max: 2, chance: 0.5 },
      { id: 'scrap', min: 1, max: 2, chance: 0.4 },
      { id: 'flare', min: 1, max: 1, chance: 0.2 },
    ],
  },
  cooler: {
    camp: [
      { id: 'canned_food', min: 1, max: 2, chance: 0.75 },
      { id: 'water_bottle', min: 1, max: 2, chance: 0.6 },
    ],
    suburban: [
      { id: 'canned_food', min: 1, max: 2, chance: 0.8 },
      { id: 'water_bottle', min: 1, max: 2, chance: 0.7 },
    ],
  },
  crate: {
    camp: [
      { id: 'scrap', min: 1, max: 3, chance: 0.8 },
      { id: 'cloth', min: 1, max: 2, chance: 0.5 },
    ],
    suburban: [
      { id: 'scrap', min: 2, max: 4, chance: 0.85 },
      { id: 'wire', min: 1, max: 2, chance: 0.5 },
      { id: 'cloth', min: 1, max: 2, chance: 0.45 },
    ],
  },
  barrel: {
    camp: [
      { id: 'scrap', min: 1, max: 2, chance: 0.7 },
      { id: 'fire_starter', min: 1, max: 1, chance: 0.2 },
    ],
    suburban: [
      { id: 'scrap', min: 1, max: 3, chance: 0.75 },
      { id: 'water_bottle', min: 1, max: 1, chance: 0.3 },
    ],
  },
  toolbox: {
    camp: [
      { id: 'scrap', min: 1, max: 3, chance: 0.8 },
      { id: 'wire', min: 1, max: 2, chance: 0.5 },
    ],
    suburban: [
      { id: 'scrap', min: 2, max: 4, chance: 0.85 },
      { id: 'wire', min: 1, max: 3, chance: 0.6 },
      { id: 'fire_starter', min: 1, max: 1, chance: 0.25 },
    ],
  },
};
