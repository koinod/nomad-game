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
    id: 'phone', name: 'AppBoy phone', category: 'key', weight: 0.2, slots: 1, stack: 1,
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

// Field crafting — no workbench needed, done from the backpack.
export interface FieldRecipe {
  id: string;
  name: string;
  components: { itemId: string; qty: number }[];
  resultId: string;
  resultQty: number;
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
};

export const BASE_CARRY_KG = 20;
export const BASE_SLOTS = 12;
