// Shared types for the zustand store, game data modules, and save system.
// Data modules (src/data/*) implement the *Def interfaces declared here.

export type DifficultyId = 'story' | 'survivor' | 'hardcore';
export type Screen = 'title' | 'difficulty' | 'prologue' | 'game' | 'ending';
export type PhoneTab = 'loadout' | 'world' | 'command';

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

// ---------- inventory ----------
export type ItemCategory =
  | 'weapon-melee' | 'weapon-ranged' | 'ammo' | 'food' | 'medical'
  | 'material' | 'tool' | 'key' | 'pack';

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
  carryBonus?: number; // packs: extra kg
  packSlots?: number; // packs: extra slots
}

export interface InvItem {
  uid: string;
  itemId: string;
  qty: number;
}

export interface Equipped {
  melee: string | null; // uid
  ranged: string | null; // uid
  pack: string | null; // uid
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

export interface SaveSnapshot {
  version: 1;
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
