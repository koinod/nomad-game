import type { SurvivorDef } from '../data/survivors';
import type { SkillId } from '../data/skills';
// Shared types for the zustand store, game data modules, and save system.
// Data modules (src/data/*) implement the *Def interfaces declared here.

export type DifficultyId = 'story' | 'survivor' | 'hardcore';
export type Screen = 'title' | 'difficulty' | 'prologue' | 'game' | 'ending';
export type PhoneTab =
  | 'home' | 'pack' | 'character' | 'craft' | 'world'
  | 'base' | 'team' | 'vehicles' | 'log';

/** One fleet row for the phone's Vehicles app (published by the engine). */
export interface FleetEntry {
  defId: string;
  name: string;
  fuelPct: number;
  condPct: number;
  dist: number;
  storageUsedKg: number;
  storageCapKg: number;
  upgrades: string[];
  tiresFlat: number;
  hitchedTrailer: string | null; // trailer defId being towed
  loc: string; // wave 3: human location label ("At the depot", "Carrier deck", coords)
}

/** One trailer row for the phone's Vehicles app. */
export interface TrailerFleetEntry {
  defId: string;
  name: string;
  dist: number;
  hitchedTo: string | null; // vehicle defId
  module: string; // 'none' | ModuleId
  storageUsedKg: number;
  storageCapKg: number;
  fuelLiters: number; // tanker only, else 0
  beaconMode: 'off' | 'sat' | 'horde';
  loadedVehicle: string | null; // vehicle name riding the deck
}

export interface DifficultyDef {
  id: DifficultyId;
  label: string;
  tagline: string;
  huskDamage: number; // multiplier on husk attack damage
  playerDamageTaken: number; // multiplier on damage the player takes
  resourceMult: number; // multiplier on loot quantities
  carryBonus: number; // additive fraction on carry limit (0.2 = +20%)
  saveAnywhere: boolean;
  permadeath: boolean;
  firstPersonOnly: boolean; // hardcore: no third-person crutch
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  story: {
    id: 'story', label: 'Story', tagline: 'For the journey. Husks hit softer, supplies are plentiful, save anywhere.',
    huskDamage: 0.6, playerDamageTaken: 0.6, resourceMult: 1.3, carryBonus: 0.2, saveAnywhere: true, permadeath: false, firstPersonOnly: false,
  },
  survivor: {
    id: 'survivor', label: 'Survivor', tagline: 'The intended balance. Save at campfires only.',
    huskDamage: 1.0, playerDamageTaken: 1.0, resourceMult: 1.0, carryBonus: 0, saveAnywhere: false, permadeath: false, firstPersonOnly: false,
  },
  hardcore: {
    id: 'hardcore', label: 'Hardcore', tagline: 'Scarce supplies, brutal husks. First person only. Death ends the run.',
    huskDamage: 1.4, playerDamageTaken: 1.5, resourceMult: 0.7, carryBonus: 0, saveAnywhere: false, permadeath: true, firstPersonOnly: true,
  },
};

// ---------- appearance (wave 4: character design v1) ----------

export type HairStyle = 'crop' | 'long' | 'hawk' | 'bald';
export type BuildType = 'slim' | 'standard' | 'heavy';

export interface Appearance {
  skinTone: number; // index into SKIN_TONES
  hairStyle: HairStyle;
  hairColor: number; // index into HAIR_COLORS
  build: BuildType;
}

export const SKIN_TONES = [0x8a5a3b, 0xa8785a, 0xc9a180, 0xe0bfa0, 0x6e4530, 0x54331f];
export const HAIR_COLORS = [0x2a1e16, 0x4a3220, 0x8a6a42, 0xb8b0a4, 0x7a2e1e, 0x22252a];

export const DEFAULT_APPEARANCE: Appearance = {
  skinTone: 2,
  hairStyle: 'crop',
  hairColor: 0,
  build: 'standard',
};

// ---------- inventory ----------
export type ItemCategory =
  | 'weapon-melee' | 'weapon-ranged' | 'ammo' | 'food' | 'medical'
  | 'material' | 'tool' | 'key' | 'pack' | 'mod'
  // parallel cycle (Lane 5 field contract, SYSTEMS_SPEC §1.1): worn
  // mitigation gets its own category, and blueprint unlock items theirs.
  // Lane 6 codes its catalog re-categorization against these.
  | 'armor' | 'blueprint';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  weight: number; // kg per unit
  slots: number; // grid slots per stack
  stack: number; // max units per stack
  desc: string;
  damage?: number; // weapons
  range?: number; // ranged weapons (m)
  heal?: number; // food / medical
  ammoId?: string; // ranged weapons
  pellets?: number; // >1 = spread weapon (shotgun)
  spread?: number; // radians of pellet jitter
  carryBonus?: number; // packs: extra kg
  packSlots?: number; // packs: extra slots
  w?: number; // grid footprint, cells wide (unrotated) — wave 3 Tarkov grid
  h?: number; // grid footprint, cells tall (unrotated)
  armor?: number; // fraction of damage mitigated while carried (vests, plates)
  thrown?: { aoe: number; dmg: number; fuse: number; fire?: boolean; blind?: number; smoke?: boolean; lure?: number; decoySec?: number }; // grenades
  cooldown?: number; // ranged: seconds between shots
  noiseRadius?: number; // ranged: gunshot noise in meters (default 80)
  magSize?: number; // ranged: magazine capacity (rounds loaded at once)
  reloadSec?: number; // ranged: seconds to reload
  modSlots?: ('optic' | 'muzzle' | 'magazine' | 'underbarrel')[]; // ranged: attachable slots
  // ---- wave 2: weapon handling + ballistics (see src/game/gunMath.ts) ----
  fireMode?: 'semi' | 'auto' | 'bolt' | 'pump' | 'single'; // ranged: trigger behavior
  recoil?: number; // ranged: camera pitch kick per shot, radians
  recoilDrift?: number; // ranged: max horizontal kick per shot, radians (random walk)
  bloomPerShot?: number; // ranged: bloom added per shot (0..1 scale)
  bloomMax?: number; // ranged: extra spread (radians) at full bloom
  adsTime?: number; // ranged: seconds for the hip -> sights transition
  sway?: number; // ranged: ADS sway amplitude class (scaled in gunMath)
  projectileSpeed?: number; // ranged: m/s — set = true projectile with drop, unset = hitscan
  pen?: number; // ammo: armor penetration class 0..2 (vs armored husks)
  disassembly?: { itemId: string; qty: number }[]; // bench yield when stripped for parts
  // ---- parallel cycle field contract (SYSTEMS_SPEC §1.2) — all optional,
  // authored by Lane 6 (items) / gated by Lane 7 (crafting) + Lane 8
  // (skills). Declared here so every lane compiles against one shape. ----
  tier?: 1 | 2 | 3; // weapons + mods: loot/power tier
  swingSec?: number; // melee: full swing duration
  staminaCost?: number; // melee: stamina per swing
  blockPct?: number; // melee: damage blocked while blocking (0..1)
  reach?: number; // melee: reach in meters
  armorSlot?: 'head' | 'torso' | 'legs'; // armor: body slot it protects
  barterValue?: number; // trader price in "value" units (Lane 6 §3.5 anchors)
  skillReq?: { skill: SkillId; level: number }; // crafting gate (§4.2/§6.1)
}

export interface InvItem {
  uid: string;
  itemId: string;
  qty: number;
  mods?: string[]; // attached mod itemIds (ranged weapons, per instance)
  finish?: string; // wave 4: applied finish id (data/mods FINISHES), cosmetic
  loaded?: number; // rounds currently in the magazine (ranged weapons)
  condition?: number; // weapons: 0..100, undefined = pristine (wave 2 wear)
  jammed?: boolean; // weapons: action jammed — R works it clear
  // wave 3 grid placement (optional: absent = auto-arranged on render).
  // Rides the v3 save untouched — IndexedDB stores the instances as-is.
  gx?: number; // grid column
  gy?: number; // grid row
  rot?: boolean; // footprint rotated 90°
}

export interface Equipped {
  melee: string | null; // uid
  ranged: string | null; // uid
  pack: string | null; // uid
  // parallel cycle field contract (SYSTEMS_SPEC §1.3): worn-armor slots.
  // OPTIONAL so every pre-cycle save and literal stays valid untouched;
  // undefined and null both mean "nothing worn there".
  armorHead?: string | null; // uid
  armorTorso?: string | null; // uid
  armorLegs?: string | null; // uid
}

// ---------- quests ----------
export type QuestStepType = 'reach' | 'kill' | 'collect' | 'talk' | 'interact' | 'choice';

export interface QuestStep {
  id: string;
  objective: string; // player-facing text
  type: QuestStepType;
  target: string; // e.g. 'poi:relay_station', 'husk', 'npc:jonah', 'boat_choice'
  count: number;
}

export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  brief: string;
  steps: QuestStep[];
  rewards: {
    rep?: { faction: string; amount: number }[];
    items?: { id: string; qty: number }[];
    flags?: string[];
  };
  startsWhen?: { flag?: string; questDone?: string };
}

export interface QuestProgress {
  id: string;
  stepIndex: number;
  progress: number;
}

// ---------- factions ----------
export interface FactionDef {
  id: string;
  name: string;
  leader: string;
  role: string;
  desc: string;
  inSlice: boolean; // false = mentioned only, not interactable in v0.1.0
}

// ---------- dialogue ----------
export interface DialogueChoice {
  id: string;
  label: string;
  setFlags?: string[];
  rep?: { faction: string; amount: number }[];
  next: string | null; // null ends the dialogue
}

export interface DialogueNode {
  id: string;
  speaker: string;
  lines: string[];
  choices?: DialogueChoice[];
  next?: string | null; // linear advance when no choices
  setFlags?: string[];
  questEvent?: { type: QuestStepType; target: string; count?: number };
}

// ---------- save ----------
export interface WorldDiff {
  looted: string[]; // container ids looted
  deadHusks: string[]; // husk spawn ids killed
  cleared: string[]; // one-shot interactable ids used (switches etc.)
}

export interface VehicleSave {
  defId: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  fuel: number;
  condition: number;
  // v3: what the run did to this vehicle (v2 saves migrate with defaults)
  storage?: InvItem[];
  upgrades?: string[];
  tiresFlat?: number;
  colorPick?: number;
  cargoCrates?: number;
  variant?: string; // model variant of one def (the Stallion 'fx')
}

/** A trailer's persisted state (v3). */
export interface TrailerSave {
  defId: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  hitchedTo: string | null; // vehicle defId (uids are def ids — one of each)
  module: string; // 'none' | ModuleId
  storage: InvItem[];
  fuelLiters: number; // tanker only
  doorOpen: boolean;
  loadedVehicleDefId: string | null;
  /** Additional deck loads beyond the first (HET-70 multi-bay), load order. */
  extraLoadedDefIds?: string[];
  beaconMode: 'off' | 'sat' | 'horde';
  cargoCrates?: number;
  rampDown?: boolean;
}


// ---- wave 3: team dispatch, phone journal, scout intel, base build queue ----

export type DispatchTask = 'scavenge' | 'scout' | 'escort';

export interface Dispatch {
  id: string;
  survivorId: string;
  vehicleDefId: string;
  trailerDefId: string | null;
  task: DispatchTask;
  destPoiId: string;
  /** Absolute game minutes (daysElapsed * 1440 + timeMinutes). */
  departMin: number;
  /** Absolute game minutes when the crew rolls back in. */
  etaMin: number;
  distM: number;
  status: 'out';
}

export interface JournalEntry {
  id: string;
  /** Absolute game minutes when the entry was written. */
  atMin: number;
  title: string;
  lines: string[];
}

export interface ScoutReport {
  poiId: string;
  atMin: number;
  containers: number; // searchable containers standing near the POI
  looted: number; // ...of which already emptied
}

export interface BaseBuildOrder {
  facilityId: string;
  /** Absolute game minutes when construction completes. */
  readyMin: number;
}

// ---- parallel cycle: Lane 5 field contract ----
// These shapes are the published schema sibling lanes code against.
// All are OPTIONAL on the v3 snapshot (passthrough-safe, see save.ts):
// older saves lack them, the store defaults them on load, no version bump.

/** One timed station-craft order (Lane 7's timer engine owns the logic;
 *  Lane 5 owns persistence). Times are absolute game minutes, the same
 *  clock as Dispatch/BaseBuildOrder. */
export interface CraftOrder {
  id: string;
  recipeId: string; // FIELD_RECIPES / STATION_RECIPES id (data/items)
  stationId: string | null; // StationId, null = field craft
  qty: number; // units of the result to produce
  /** Absolute game minutes when the order completes. */
  readyMin: number;
}

/** Base-state extensions (Lane 10 owns the logic: claims, heat, siege,
 *  stockpile; Lane 5 owns persistence). Every field optional — a run
 *  with no base extensions saves and loads exactly as before. The home
 *  base itself stays `SaveSnapshot.base`; this is everything around it. */
export interface BaseExt {
  /** Secondary claimed sites (home base is `base`, never repeated here). */
  outposts?: { poiId: string; facilities: string[] }[];
  /** Last computed base heat (Lane 10's heat math owns the value). */
  heat?: number;
  /** Siege-loop state (Lane 10): absent = the loop has never stirred. */
  siegeState?: 'calm' | 'scouted' | 'warning' | 'siege';
  /** Absolute game minutes of the next scheduled siege beat, if any. */
  siegeNextMin?: number;
  /** Base shelves (SYSTEMS_SPEC §7.5 stockpile screen), distinct from
   *  vehicle storage — items physically left at the home base. */
  stockpile?: InvItem[];
}

export interface SaveSnapshot {
  version: 3;
  savedAt: number;
  difficulty: DifficultyId;
  seed: number;
  timeMinutes: number;
  playSeconds: number;
  player: { pos: [number, number, number]; hp: number };
  inventory: InvItem[];
  equipped: Equipped;
  hotbar: (string | null)[];
  quests: QuestProgress[];
  doneQuests: string[];
  flags: Record<string, boolean>;
  rep: Record<string, number>;
  battery: number;
  phoneUnlocked: boolean;
  world: WorldDiff;
  // v2: the run's long tail — days, build-out, crew, and every vehicle
  daysElapsed: number;
  skills: Record<string, { level: number; xp: number }>;
  perkPoints: number;
  perks: string[];
  survivors: SurvivorDef[];
  base: { poiId: string; facilities: string[] } | null;
  vehicles: VehicleSave[];
  // v3: trailers — where they lie, what they're hitched to, what's inside
  trailers: TrailerSave[];
  // wave 3 additions — OPTIONAL on the v3 snapshot: IndexedDB passthrough
  // keeps them, older v3 saves simply lack them and the store defaults
  // them on load. No version bump (same pattern as InvItem grid fields).
  dispatches?: Dispatch[];
  journal?: JournalEntry[];
  scouted?: Record<string, ScoutReport>;
  baseQueue?: BaseBuildOrder[];
  // wave 4: character appearance — optional on v3, store defaults on load
  appearance?: Appearance;
  // parallel cycle (Lane 5 field contract) — optional on v3, same rule:
  // absent on older saves, store defaults them on load. Lane 7 persists
  // its timed craft queue here; Lane 9 records string-valued story
  // choices the boolean `flags` map cannot hold (e.g. beacon: 'lit');
  // Lane 10 persists base extensions here.
  craftQueue?: CraftOrder[];
  storyChoices?: Record<string, string>;
  baseExt?: BaseExt;
}

export interface SaveMeta {
  slot: string; // '1' | '2' | '3' | 'auto'
  label: string;
  savedAt: number;
  playMinutes: number;
  difficulty: DifficultyId;
}

export interface ToastMsg {
  id: number;
  text: string;
}
