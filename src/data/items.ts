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
    magSize: 12, reloadSec: 1.4, modSlots: ['muzzle', 'magazine', 'underbarrel'],
    fireMode: 'semi', recoil: 0.011, recoilDrift: 0.004, bloomPerShot: 0.16, bloomMax: 0.05, adsTime: 0.22, sway: 0.5,
  },
  ammo_9mm: {
    id: 'ammo_9mm', name: '9mm rounds', category: 'ammo', weight: 0.02, slots: 1, stack: 60,
    desc: 'Brass-cased 9mm cartridges.', pen: 0,
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
    magSize: 6, reloadSec: 2.2, modSlots: ['magazine', 'underbarrel'],
    fireMode: 'pump', recoil: 0.034, recoilDrift: 0.008, bloomPerShot: 0.3, bloomMax: 0.04, adsTime: 0.28, sway: 0.7,
  },
  hunting_rifle: {
    id: 'hunting_rifle', name: 'Hunting rifle', category: 'weapon-ranged', weight: 3.6, slots: 3, stack: 1,
    desc: 'Bolt-action, scoped. One careful shot ends most problems.', damage: 58, range: 95, ammoId: 'ammo_rifle',
    magSize: 5, reloadSec: 2.4, modSlots: ['optic', 'muzzle', 'magazine', 'underbarrel'],
    fireMode: 'bolt', projectileSpeed: 150, recoil: 0.03, recoilDrift: 0.003, bloomPerShot: 0.4, bloomMax: 0.02, adsTime: 0.38, sway: 1.0,
  },
  shells: {
    id: 'shells', name: 'Shotgun shells', category: 'ammo', weight: 0.05, slots: 1, stack: 24,
    desc: '12-gauge shells.', pen: 0,
  },
  ammo_rifle: {
    id: 'ammo_rifle', name: 'Rifle rounds', category: 'ammo', weight: 0.04, slots: 1, stack: 30,
    desc: 'High-velocity rifle cartridges.', pen: 2,
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
  armor_plate: {
    id: 'armor_plate', name: 'Armor plate', category: 'material', weight: 4.0, slots: 2, stack: 2,
    desc: 'Cut steel plate, drilled for bolting. Vehicle armor work.',
  },
  torch: {
    id: 'torch', name: 'Torch', category: 'tool', weight: 0.4, slots: 1, stack: 2,
    desc: 'Cloth-wrapped branch, soaked in fuel. Light for the dark places.',
  },
  fire_starter: {
    id: 'fire_starter', name: 'Fire starter', category: 'tool', weight: 0.2, slots: 1, stack: 3,
    desc: 'Scrap striker and tinder. Every campfire starts somewhere.',
  },
  wood: {
    id: 'wood', name: 'Wood', category: 'material', weight: 1.2, slots: 1, stack: 10,
    desc: 'Salvaged lumber and solid logs. Building material, fuel, and barricades.',
  },
  gun_parts: {
    id: 'gun_parts', name: 'Gun parts', category: 'material', weight: 0.5, slots: 1, stack: 8,
    desc: 'Springs, pins, a trigger group. Weapon maintenance and mods.',
  },
  valuables: {
    id: 'valuables', name: 'Valuables', category: 'material', weight: 0.3, slots: 1, stack: 10,
    desc: 'Jewelry, cash, and pre-Static shine. Traders still want it.',
  },
  produce: {
    id: 'produce', name: 'Wild produce', category: 'food', weight: 0.3, slots: 1, stack: 6,
    desc: 'Berries and greens off the land. Eat raw or cook it down.', heal: 12,
  },
  lockpick: {
    id: 'lockpick', name: 'Lockpick', category: 'material', weight: 0.05, slots: 1, stack: 5,
    desc: 'Opens safes and lockers quietly. One use, one shot.',
  },
  tool_kit: {
    id: 'tool_kit', name: 'Tool kit', category: 'material', weight: 2.2, slots: 2, stack: 1,
    desc: 'Wrenches, drivers, a pry bar. Repairs and machine work go faster with this.',
  },
  cleaning_kit: {
    id: 'cleaning_kit', name: 'Cleaning kit', category: 'tool', weight: 0.4, slots: 1, stack: 3,
    desc: 'Rods, brushes, patches. Field-strips a weapon back to 60 condition. Use it on your equipped gun.',
  },
  gun_oil: {
    id: 'gun_oil', name: 'Gun oil', category: 'tool', weight: 0.2, slots: 1, stack: 5,
    desc: 'A squeeze bottle of the good stuff. +25 condition to your equipped weapon, anywhere.',
  },
  frag: {
    id: 'frag', name: 'Frag grenade', category: 'weapon-melee', weight: 0.4, slots: 1, stack: 3,
    desc: 'Pull, throw, duck. Equip and left-click to throw.', damage: 0, thrown: { aoe: 5.5, dmg: 70, fuse: 1.6 },
  },
  crowbar: {
    id: 'crowbar', name: 'Crowbar', category: 'weapon-melee', weight: 1.4, slots: 2, stack: 1,
    desc: 'Opens doors, skulls, and everything in between.', damage: 17,
  },
  fire_axe: {
    id: 'fire_axe', name: 'Fire axe', category: 'weapon-melee', weight: 2.6, slots: 3, stack: 1,
    desc: 'Slow, heavy, and final.', damage: 34,
  },
  spear: {
    id: 'spear', name: 'Boar spear', category: 'weapon-melee', weight: 1.6, slots: 2, stack: 1,
    desc: 'Keeps them at arm\u2019s length. And then some.', damage: 20,
  },
  riot_baton: {
    id: 'riot_baton', name: 'Riot baton', category: 'weapon-melee', weight: 0.9, slots: 1, stack: 1,
    desc: 'Fast hands. Low damage, high dissuasion.', damage: 12,
  },
  flare_gun: {
    id: 'flare_gun', name: 'Flare gun', category: 'weapon-ranged', weight: 0.7, slots: 2, stack: 1,
    desc: 'Burns bright. So does everything it hits.', damage: 30, range: 35, ammoId: 'flare',
    spread: 0.03, cooldown: 1.2, noiseRadius: 45,
    magSize: 1, reloadSec: 1.0, modSlots: [],
    fireMode: 'single', recoil: 0.012, recoilDrift: 0.004, bloomPerShot: 0.2, bloomMax: 0.03, adsTime: 0.22, sway: 0.5,
  },
  revolver: {
    id: 'revolver', name: 'Revolver', category: 'weapon-ranged', weight: 1.0, slots: 2, stack: 1,
    desc: 'Six chambers of argument.', damage: 42, range: 40, ammoId: 'ammo_9mm',
    spread: 0.05, cooldown: 0.65, noiseRadius: 80,
    magSize: 6, reloadSec: 2.0, modSlots: [],
    fireMode: 'single', recoil: 0.02, recoilDrift: 0.006, bloomPerShot: 0.22, bloomMax: 0.05, adsTime: 0.25, sway: 0.55,
  },
  crossbow: {
    id: 'crossbow', name: 'Crossbow', category: 'weapon-ranged', weight: 2.4, slots: 3, stack: 1,
    desc: 'Whispers. Reloads like it means it.', damage: 60, range: 55, ammoId: 'bolts',
    spread: 0.015, cooldown: 1.6, noiseRadius: 12,
    magSize: 1, reloadSec: 1.6, modSlots: [],
    fireMode: 'single', projectileSpeed: 55, recoil: 0.008, recoilDrift: 0.002, bloomPerShot: 0.3, bloomMax: 0.015, adsTime: 0.3, sway: 0.8,
  },
  smg: {
    id: 'smg', name: 'SMG', category: 'weapon-ranged', weight: 2.0, slots: 3, stack: 1,
    desc: 'Eats 9mm for breakfast.', damage: 16, range: 38, ammoId: 'ammo_9mm',
    spread: 0.09, cooldown: 0.22, noiseRadius: 80,
    magSize: 30, reloadSec: 2.2, modSlots: ['optic', 'muzzle', 'magazine', 'underbarrel'],
    fireMode: 'auto', recoil: 0.007, recoilDrift: 0.005, bloomPerShot: 0.07, bloomMax: 0.085, adsTime: 0.2, sway: 0.6,
  },
  carbine: {
    id: 'carbine', name: 'Carbine', category: 'weapon-ranged', weight: 2.6, slots: 3, stack: 1,
    desc: 'The middle of every argument.', damage: 34, range: 70, ammoId: 'ammo_556',
    spread: 0.04, cooldown: 0.35, noiseRadius: 80,
    magSize: 20, reloadSec: 2.0, modSlots: ['optic', 'muzzle', 'magazine', 'underbarrel'],
    fireMode: 'auto', recoil: 0.011, recoilDrift: 0.004, bloomPerShot: 0.09, bloomMax: 0.06, adsTime: 0.26, sway: 0.75,
  },
  dmr: {
    id: 'dmr', name: 'DMR', category: 'weapon-ranged', weight: 4.2, slots: 4, stack: 1,
    desc: 'Reaches out and reminds them.', damage: 75, range: 110, ammoId: 'ammo_556',
    spread: 0.02, cooldown: 1.1, noiseRadius: 80,
    magSize: 10, reloadSec: 2.2, modSlots: ['optic', 'muzzle', 'magazine', 'underbarrel'],
    fireMode: 'bolt', projectileSpeed: 170, recoil: 0.026, recoilDrift: 0.003, bloomPerShot: 0.35, bloomMax: 0.02, adsTime: 0.4, sway: 1.05,
  },
  ammo_556: {
    id: 'ammo_556', name: '5.56 rounds', category: 'ammo', weight: 0.02, slots: 1, stack: 60,
    desc: 'Rifle cartridges. The good kind of argument.', pen: 1,
  },
  bolts: {
    id: 'bolts', name: 'Bolts', category: 'ammo', weight: 0.03, slots: 1, stack: 40,
    desc: 'Short, heavy, silent.', pen: 2,
  },
  smoke: {
    id: 'smoke', name: 'Smoke grenade', category: 'weapon-melee', weight: 0.4, slots: 1, stack: 3,
    desc: 'Equip and throw: a gray curtain that blinds what\u2019s inside.', damage: 0,
    thrown: { aoe: 7, dmg: 0, fuse: 0.4, blind: 4, smoke: true },
  },
  rock: {
    id: 'rock', name: 'Rock', category: 'weapon-melee', weight: 0.3, slots: 1, stack: 5,
    desc: 'Equip and throw: lands with a clatter that pulls attention.', damage: 2,
    thrown: { aoe: 0, dmg: 0, fuse: 0.05, lure: 14 },
  },
  boombox: {
    id: 'boombox', name: 'Boombox', category: 'weapon-melee', weight: 3.5, slots: 3, stack: 1,
    desc: 'Equip and throw: plays for 20 seconds. Everything hears it.', damage: 0,
    thrown: { aoe: 0, dmg: 0, fuse: 0.1, decoySec: 20 },
  },
  // --- weapon attachments (SYSTEMS_SPEC §3): bench-crafted, bench-attached ---
  reflex_sight: {
    id: 'reflex_sight', name: 'Reflex sight', category: 'mod', weight: 0.2, slots: 1, stack: 3,
    desc: 'An optic: mounts on rifles and pistols. Down-sights cone −30%.',
  },
  suppressor: {
    id: 'suppressor', name: 'Suppressor', category: 'mod', weight: 0.4, slots: 1, stack: 3,
    desc: 'Threads onto the muzzle. 80m of noise becomes 25m.',
  },
  extended_mag: {
    id: 'extended_mag', name: 'Extended magazine', category: 'mod', weight: 0.3, slots: 1, stack: 3,
    desc: 'Magazine capacity ×1.5 for the gun it\u2019s fitted to.',
  },
  foregrip: {
    id: 'foregrip', name: 'Foregrip', category: 'mod', weight: 0.3, slots: 1, stack: 3,
    desc: 'Underbarrel grip: spread ×0.75 at every stance.',
  },
  laser_sight: {
    id: 'laser_sight', name: 'Laser sight', category: 'mod', weight: 0.2, slots: 1, stack: 3,
    desc: 'Underbarrel laser: hip-fire tightens up.',
  },
  molotov: {
    id: 'molotov', name: 'Molotov', category: 'weapon-melee', weight: 0.5, slots: 1, stack: 3,
    desc: 'A bottle of bad decisions. Equip and left-click to throw.', damage: 0, thrown: { aoe: 4, dmg: 25, fuse: 0, fire: true },
  },
  flashbang: {
    id: 'flashbang', name: 'Flashbang', category: 'weapon-melee', weight: 0.3, slots: 1, stack: 3,
    desc: 'Light and noise. Husks lose you for a while. Equip and left-click to throw.', damage: 0, thrown: { aoe: 12, dmg: 0, fuse: 0.8, blind: 6 },
  },
  armored_vest: {
    id: 'armored_vest', name: 'Armored vest', category: 'material', weight: 2.4, slots: 2, stack: 1,
    desc: 'Kevlar panels under worn leather. Mitigates 25% of damage while carried.', armor: 0.25,
  },
  riot_helmet: {
    id: 'riot_helmet', name: 'Riot helmet', category: 'material', weight: 1.1, slots: 1, stack: 1,
    desc: 'Hard shell, cracked visor. Mitigates 15% of damage while carried.', armor: 0.15,
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

// Wave 4: corpse loot keyed by KIND, rolled in addition to the zone table —
// what it WAS decides the bonus. A brute carried for a crew; a bloater is
// a chemistry set that walks.
export const HUSK_KIND_LOOT: Record<string, HuskLootEntry[]> = {
  screamer: [
    { id: 'cloth', min: 2, max: 3, chance: 0.6 },
    { id: 'flare', min: 1, max: 1, chance: 0.3 },
    { id: 'chemicals', min: 1, max: 1, chance: 0.2 },
  ],
  brute: [
    { id: 'scrap', min: 2, max: 4, chance: 0.7 },
    { id: 'canned_food', min: 1, max: 2, chance: 0.4 },
    { id: 'armor_plate', min: 1, max: 1, chance: 0.18 },
    { id: 'ammo_556', min: 3, max: 6, chance: 0.25 },
  ],
  crawler: [
    { id: 'cloth', min: 1, max: 2, chance: 0.5 },
    { id: 'raw_meat', min: 1, max: 2, chance: 0.35 },
    { id: 'wire', min: 1, max: 2, chance: 0.2 },
  ],
  bloater: [
    { id: 'chemicals', min: 1, max: 3, chance: 0.75 },
    { id: 'cloth', min: 1, max: 2, chance: 0.4 },
  ],
  spitter: [
    { id: 'chemicals', min: 1, max: 2, chance: 0.6 },
    { id: 'bandage', min: 1, max: 1, chance: 0.3 },
    { id: 'water_bottle', min: 1, max: 1, chance: 0.25 },
  ],
};

export const HUSK_LOOT: Record<string, HuskLootEntry[]> = {
  // the carrier's armored guard pack drops military salvage
  carrier: [
    { id: 'ammo_556', min: 3, max: 8, chance: 0.55 },
    { id: 'gun_parts', min: 1, max: 2, chance: 0.35 },
    { id: 'armor_plate', min: 1, max: 1, chance: 0.22 },
    { id: 'bandage', min: 1, max: 1, chance: 0.4 },
    { id: 'ammo_9mm', min: 4, max: 9, chance: 0.3 },
  ],
  forest: [
    { id: 'cloth', min: 1, max: 2, chance: 0.6 },
    { id: 'bandage', min: 1, max: 1, chance: 0.25 },
    { id: 'canned_food', min: 1, max: 2, chance: 0.3 },
    { id: 'flare', min: 1, max: 1, chance: 0.15 },
    { id: 'scrap', min: 1, max: 2, chance: 0.2 },
    { id: 'rock', min: 1, max: 2, chance: 0.25 },
  ],
  town: [
    { id: 'canned_food', min: 1, max: 2, chance: 0.35 },
    { id: 'water_bottle', min: 1, max: 1, chance: 0.3 },
    { id: 'scrap', min: 1, max: 3, chance: 0.3 },
    { id: 'cloth', min: 1, max: 2, chance: 0.25 },
    { id: 'ammo_9mm', min: 2, max: 5, chance: 0.12 },
    { id: 'armor_plate', min: 1, max: 1, chance: 0.05 },
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
  r_reflex: {
    id: 'r_reflex', name: 'Reflex sight', station: 'workbench',
    components: [{ itemId: 'gun_parts', qty: 2 }, { itemId: 'scrap', qty: 1 }],
    resultId: 'reflex_sight', resultQty: 1,
  },
  r_suppressor: {
    id: 'r_suppressor', name: 'Suppressor', station: 'workbench',
    components: [{ itemId: 'gun_parts', qty: 3 }],
    resultId: 'suppressor', resultQty: 1,
  },
  r_extmag: {
    id: 'r_extmag', name: 'Extended magazine', station: 'workbench',
    components: [{ itemId: 'gun_parts', qty: 2 }],
    resultId: 'extended_mag', resultQty: 1,
  },
  r_foregrip: {
    id: 'r_foregrip', name: 'Foregrip', station: 'workbench',
    components: [{ itemId: 'gun_parts', qty: 1 }, { itemId: 'wood', qty: 1 }],
    resultId: 'foregrip', resultQty: 1,
  },
  r_laser: {
    id: 'r_laser', name: 'Laser sight', station: 'workbench',
    components: [{ itemId: 'gun_parts', qty: 2 }, { itemId: 'wire', qty: 1 }],
    resultId: 'laser_sight', resultQty: 1,
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
  r_armor_plate: {
    id: 'r_armor_plate', name: 'Armor plate', station: 'industrial',
    components: [{ itemId: 'scrap', qty: 3 }, { itemId: 'gun_parts', qty: 1 }],
    resultId: 'armor_plate', resultQty: 1,
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
      { id: 'chemicals', min: 1, max: 1, chance: 0.15 },
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
      { id: 'gun_oil', min: 1, max: 1, chance: 0.18 },
    ],
    suburban: [
      { id: 'scrap', min: 2, max: 4, chance: 0.85 },
      { id: 'wire', min: 1, max: 2, chance: 0.5 },
      { id: 'cloth', min: 1, max: 2, chance: 0.45 },
      { id: 'cleaning_kit', min: 1, max: 1, chance: 0.16 },
      { id: 'gun_oil', min: 1, max: 2, chance: 0.22 },
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
      { id: 'engine_part', min: 1, max: 1, chance: 0.2 },
      { id: 'armor_plate', min: 1, max: 1, chance: 0.08 },
    ],
  },
};

/** Safes: locked, expensive to open, worth it. Rolled on suburban houses (20%). */
export const SAFE_LOOT: HuskLootEntry[] = [
  { id: 'valuables', min: 2, max: 5, chance: 0.9 },
  { id: 'gun_parts', min: 1, max: 3, chance: 0.6 },
  { id: 'ammo_9mm', min: 4, max: 10, chance: 0.5 },
  { id: 'medkit', min: 1, max: 1, chance: 0.3 },
  { id: 'lockpick', min: 1, max: 2, chance: 0.35 },
];

/** Harvest nodes in the wild: fallen logs give wood, berry bushes give produce. */
export const LOG_LOOT: HuskLootEntry[] = [
  { id: 'wood', min: 2, max: 4, chance: 1 },
  { id: 'fire_starter', min: 1, max: 1, chance: 0.2 },
];

export const BUSH_LOOT: HuskLootEntry[] = [
  { id: 'produce', min: 1, max: 3, chance: 1 },
  { id: 'cloth', min: 1, max: 1, chance: 0.25 },
];

// Bench disassembly yields (≈50% of build value — spec §3.4), assigned
// after the table so the table itself stays a pure stat sheet. Weapons
// stripped at the workbench feed the gun_parts mod economy.
const DISASSEMBLY: Record<string, { itemId: string; qty: number }[]> = {
  pistol: [{ itemId: 'gun_parts', qty: 2 }, { itemId: 'scrap', qty: 1 }],
  revolver: [{ itemId: 'gun_parts', qty: 2 }, { itemId: 'scrap', qty: 1 }],
  flare_gun: [{ itemId: 'gun_parts', qty: 1 }, { itemId: 'scrap', qty: 1 }],
  shotgun: [{ itemId: 'gun_parts', qty: 2 }, { itemId: 'scrap', qty: 2 }],
  hunting_rifle: [{ itemId: 'gun_parts', qty: 3 }, { itemId: 'scrap', qty: 1 }],
  crossbow: [{ itemId: 'gun_parts', qty: 1 }, { itemId: 'scrap', qty: 2 }, { itemId: 'wire', qty: 1 }],
  smg: [{ itemId: 'gun_parts', qty: 3 }, { itemId: 'scrap', qty: 1 }],
  carbine: [{ itemId: 'gun_parts', qty: 3 }, { itemId: 'scrap', qty: 2 }],
  dmr: [{ itemId: 'gun_parts', qty: 4 }, { itemId: 'scrap', qty: 1 }],
  machete: [{ itemId: 'scrap', qty: 2 }],
  hatchet: [{ itemId: 'scrap', qty: 1 }, { itemId: 'wood', qty: 1 }],
  pipe: [{ itemId: 'scrap', qty: 1 }],
  baseball_bat: [{ itemId: 'wood', qty: 2 }],
  combat_knife: [{ itemId: 'scrap', qty: 1 }],
  sledgehammer: [{ itemId: 'scrap', qty: 2 }, { itemId: 'wood', qty: 1 }],
  crowbar: [{ itemId: 'scrap', qty: 2 }],
  fire_axe: [{ itemId: 'scrap', qty: 2 }, { itemId: 'wood', qty: 1 }],
  spear: [{ itemId: 'wood', qty: 1 }, { itemId: 'scrap', qty: 1 }],
  riot_baton: [{ itemId: 'scrap', qty: 1 }],
  torch: [{ itemId: 'wood', qty: 1 }, { itemId: 'cloth', qty: 1 }],
  armored_vest: [{ itemId: 'cloth', qty: 3 }, { itemId: 'gun_parts', qty: 1 }],
};
for (const [id, yields] of Object.entries(DISASSEMBLY)) {
  if (ITEMS[id]) ITEMS[id].disassembly = yields;
}

// Grid footprints (wave 3, Tarkov-style pack grid), assigned after the table
// for the same reason as disassembly: the table stays a pure stat sheet.
// Long guns run 5×2, handguns 2×2, trauma kit 2×2, small goods 1×1. A stack
// occupies ONE footprint regardless of qty (the count rides as a badge).
const FOOTPRINTS: Record<string, [number, number]> = {
  // long guns
  hunting_rifle: [5, 2], dmr: [5, 2], carbine: [5, 2], shotgun: [5, 2],
  smg: [4, 2], crossbow: [4, 2],
  // handguns
  pistol: [2, 2], revolver: [2, 2], flare_gun: [2, 1],
  // melee
  pipe: [3, 1], machete: [3, 1], hatchet: [2, 1], baseball_bat: [3, 1],
  combat_knife: [2, 1], sledgehammer: [4, 1], crowbar: [3, 1], fire_axe: [4, 1],
  spear: [5, 1], riot_baton: [2, 1], boombox: [2, 2],
  frag: [1, 1], smoke: [1, 1], molotov: [1, 1], flashbang: [1, 1], rock: [1, 1],
  // medical / food
  bandage: [1, 1], medkit: [2, 2], canned_food: [1, 1], raw_meat: [1, 1],
  cooked_meat: [1, 1], water_bottle: [1, 1], produce: [1, 1],
  // ammo + small goods
  ammo_9mm: [1, 1], shells: [1, 1], ammo_rifle: [1, 1], ammo_556: [1, 1], bolts: [1, 1],
  scrap: [1, 1], wire: [1, 1], cloth: [1, 1], chemicals: [1, 1], gun_parts: [1, 1],
  valuables: [1, 1], lockpick: [1, 1], phone: [1, 1], relay_part: [1, 1], beacon_cell: [1, 1],
  flare: [1, 1], fire_starter: [1, 1], gun_oil: [1, 1], cleaning_kit: [1, 1],
  reflex_sight: [1, 1], suppressor: [1, 1], extended_mag: [1, 1], foregrip: [1, 1], laser_sight: [1, 1],
  // bulky goods
  fuel_can: [2, 2], tire: [2, 2], engine_part: [2, 2], armor_plate: [2, 2], tool_kit: [2, 2],
  car_battery: [2, 1], wood: [2, 1], torch: [2, 1], riot_helmet: [2, 1],
  armored_vest: [2, 2], pack_t1: [2, 2], pack_t2: [3, 2],
};
for (const [id, [w, h]] of Object.entries(FOOTPRINTS)) {
  if (ITEMS[id]) {
    ITEMS[id].w = w;
    ITEMS[id].h = h;
  }
}
