import { create } from 'zustand';
import { ITEMS, FIELD_RECIPES, STATION_RECIPES, STATION_LABEL } from '../data/items';
import { PERKS as PERKS_ALL } from '../data/skills';
import { FINISHES, MODS as MODS_ALL, magSizeOf } from '../data/mods';
import { UPGRADES as UPGRADE_DEFS } from '../data/upgrades';
import { FACILITIES as FACILITY_DEFS, baseHeat, buildMinutes, claimSite } from '../data/base';
import { dispatchDurationMin, poiName, resolveDispatch } from '../data/dispatch';
import { TRAITS as TRAIT_DEFS } from '../data/survivors';
import { QUESTS } from '../data/quests';
import { FACTIONS, STARTING_REP, LEGACY_REP_ALIAS } from '../data/factions';
import { ENCLAVE_RADIO_BURST } from '../data/worldWiring';
import { applyUpkeep, dailyMoraleTick, moraleEvent, FOOD_ITEMS, WATER_ITEMS } from '../systems/morale';
import {
  comfortScore, claimChecklist, claimReady, applyClaim, applyRelocation, powerBudget,
} from '../systems/baseClaims';
import { presenceSignature, type FacilityPresence } from '../systems/facilityPresence';
import { DEFAULT_APPEARANCE, DIFFICULTIES, defaultSurvivorRuntime } from './types';
import type {
  Appearance, DifficultyId, Equipped, FleetEntry, InvItem, NearbyEntry, PhoneTab, QuestProgress, QuestStepType,
  SaveMeta, SaveSnapshot, Screen, SlotId, ToastMsg, TrailerFleetEntry, WeaponSlotId,
  Dispatch, JournalEntry, ScoutReport, BaseBuildOrder, CraftJob, BaseExt,
  ClaimsState, MoraleRuntime, BaseInstance,
} from './types';
import {
  carryLimitKg, encumbranceTier, totalWeightKg,
} from './inventoryUtils';
import {
  ALL_SLOTS, emptyEquipped, equipSlotForDef, heldWeaponUid,
  isWeaponSlot, migrateEquipped, slotOfUid,
  syncWeaponProjections, WEAPON_SLOTS,
} from './equipment';
import {
  addToCarried, countCarried, findCarried, fitInDest, hasPhoneCarried,
  insertIntoDest, itemWeightKg, listInDest, normalizeCarried, POCKETS, receiveDests,
  removeCarried, specForDest, transferCarried, updateCarried, walkCarried,
  type CarriedDest,
} from './containers';
import { arrangeItems as arrangeGridItems } from './gridUtils';
import { applyXp, awardEvent, canBuyPerk, meetsSkillReq, skillReqLabel, SKILL_IDS, XP_EVENTS, type XpEventId } from '../systems/skills';
import { blockThroughFactor, carryBonusKg, disassemblyYields, fieldRepairCap, heavyShiftKg, modPartCost, vehicleRepairCost } from '../systems/perkEffects';
import { deleteSaveSlot, listSaveSlots, loadGameFromSlot, saveGameToSlot } from '../systems/save';
import { sfx } from '../systems/audio';
import { getGame } from '../game/instance';
import { sanitizeBase } from '../game/saveMigration';
import { input } from '../game/input';

let uidCounter = 1;
const newUid = () => `i${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

function sameDest(a: CarriedDest, b: CarriedDest): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'container' && b.type === 'container') return a.uid === b.uid;
  return true; // pockets / loose are singletons
}
let toastCounter = 1;

export interface DialogueState {
  source: string; // 'prologue' | 'npc:jonah' | 'npc:kowalski'
  nodeId: string;
}

interface GameState {
  screen: Screen;
  difficulty: DifficultyId;
  bodyType: 'male' | 'female'; // avatar variant, chosen on the run setup screen
  setBodyType: (b: 'male' | 'female') => void;
  /** Wave 4: character appearance (Character app) — rides the v3 save. */
  appearance: Appearance;
  appearanceCustomized: boolean; // session flag: setBodyType stops restyling hair once true
  setAppearance: (patch: Partial<Appearance>) => void;
  seed: number;
  paused: boolean;
  /** Audio settings — client-level (localStorage 'nomad-audio'), not
   *  per-save: your ears don't change between slots. */
  audioMuted: boolean;
  audioVolume: number; // 0..1
  setAudioMuted: (m: boolean) => void;
  setAudioVolume: (v: number) => void;

  // player vitals (mirrored from engine at ~10Hz)
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  pos: [number, number, number];
  timeMinutes: number; // world clock, 0..1440
  daysElapsed: number;
  advanceDay: () => void;
  playSeconds: number;

  // inventory
  inventory: InvItem[];
  equipped: Equipped;
  hotbar: (string | null)[];

  // quests / narrative
  quests: QuestProgress[];
  doneQuests: string[];
  flags: Record<string, boolean>;
  rep: Record<string, number>;

  // phone
  phoneOpen: boolean;
  phoneTab: PhoneTab;
  phoneUnlocked: boolean;
  battery: number; // 0..100

  // backpack overlay (works with a dead phone — it's your bag, not an app)
  backpackOpen: boolean;
  // full inventory deck (InventoryOverlay, KeyB): the phone-free
  // management surface. Opening it also sets backpackOpen — the flag
  // Game.ts's worldPaused already honors — so the world pauses with
  // no Game.ts change; closing either surface clears both.
  inventoryOpen: boolean;
  openInventory: () => void;
  closeInventory: () => void;
  // sleep dialog (Skyrim-style rest at campfires)
  sleepOpen: boolean;
  restedMinutesLeft: number; // well-rested buff countdown (game minutes)

  // dialogue / interaction
  dialogue: DialogueState | null;
  interactPrompt: string | null;

  // crosshair feedback
  meleeTarget: boolean;
  hitmark: { kind: 'hit' | 'kill' | 'headshot'; at: number } | null;
  setMeleeTarget: (b: boolean) => void;
  setHitmark: (kind: 'hit' | 'kill' | 'headshot') => void;

  // crafting stations: which workstation the player is standing at (if any)
  nearStation: import('../data/items').StationId | null;
  /** Live weather (Environment wave): state + road wetness (0..20). */
  weatherNow: { state: string; wetPct: number };
  setWeatherNow: (w: { state: string; wetPct: number }) => void;
  setNearStation: (s: import('../data/items').StationId | null) => void;
  /** ORDER #4 C5: the claimed base the player is standing in and the
   *  stations it hosts (systems/facilityPresence), mirrored by Game
   *  beside nearStation. Runtime-only — never persisted. */
  atBase: FacilityPresence | null;
  setAtBase: (p: FacilityPresence | null) => void;

  // noise: loudest recent noise radius at the player (0–100, decays). HUD meter.
  noiseLevel: number;
  setNoiseLevel: (n: number) => void;

  // visibility: how exposed the player is right now (0..1, Lane 8's
  // visibility engine computes it per frame; Lane 11's LightIndicator
  // reads it for the HUD). Runtime-only — never persisted.
  visibility: number;
  setVisibility: (v: number) => void;

  // skills & archetypes (SYSTEMS_SPEC §6)
  skills: Record<import('../data/skills').SkillId, { level: number; xp: number }>;
  perkPoints: number;
  perks: string[];
  secondWindDay: number;
  addSkillXp: (skill: import('../data/skills').SkillId, amt: number) => void;
  buyPerk: (perkId: string) => void;
  hasPerk: (perkId: string) => boolean;

  // survivors (SYSTEMS_SPEC §5)
  survivors: import('../data/survivors').SurvivorDef[];
  recruitSurvivor: (def: import('../data/survivors').SurvivorDef) => void;
  assignJob: (id: string, job: import('../data/survivors').SurvivorJob) => void;
  moraleTick: () => void;
  /** Lane 10's daily upkeep + morale pass (Stage 4 step 4b). */
  baseDailyTick: () => void;
  /** §5.4 morale events over the whole crew (stage 7: siege outcomes). */
  applyMoraleEvent: (kind: 'siegeWin' | 'siegeLoss' | 'death' | 'recruit') => void;

  // base management (BASE_DESIGN)
  base: { poiId: string; facilities: string[] } | null;
  claimBase: (poiId: string) => void;
  buildFacility: (facilityId: string) => void;
  baseTick: () => void;
  /** Stage 7: the tiered claim flow — Lane 10's §7.2 checklist gates,
   *  applyClaim/applyRelocation land it. Supersedes claimBase for
   *  CLAIM_SITES; the legacy lighthouse claim stays for old saves.
   *  Returns the relocation fallout so the world can strand the old
   *  home's stockpile as a lootable stash. */
  claimClaimSite: (siteId: string, ctx: { husksWithin40m: number; byForce?: boolean }) =>
    { ok: boolean; relocatedFrom?: string; stranded?: { itemId: string; qty: number }[] };
  /** Live husk counts within 40m of each claim site, published by Game
   *  (~1Hz) so the phone Base tab can run the §7.2 checklist. Runtime
   *  only — never saved. */
  claimHostiles: Record<string, number>;
  setClaimHostiles: (counts: Record<string, number>) => void;
  /** Stage 7 (item 6): emplace a crafted turret at a held claim —
   *  consumes one `turret` item, appends the prefab to the base
   *  instance (persisted). Power is enforced live by the turret system
   *  against powerBudget; placement ahead of the grid is allowed and
   *  the turret simply stays offline. */
  deployTurret: (siteId: string) => boolean;
  /** Remove up to qty of an item from a held base's stockpile; returns
   *  how many were actually taken (turret magazines reload this way). */
  takeFromStockpile: (siteId: string, itemId: string, qty: number) => number;

  // wave 3: team dispatch (P5 v1), phone journal, scout intel, build queue
  dispatches: Dispatch[];
  journal: JournalEntry[];
  scouted: Record<string, ScoutReport>;
  baseQueue: BaseBuildOrder[];

  // parallel cycle — Lane 5 field contract state (see types.ts). The
  // craft queue is Lane 7's job array, mirrored here for persistence and
  // synced with their useCraftQueue store through craftQueueBridge
  // (below); Lane 9 records story choices; Lane 10 patches base
  // extensions. All default empty and ride the v3 save as optional fields.
  craftQueue: CraftJob[];
  setCraftQueue: (jobs: CraftJob[]) => void;
  storyChoices: Record<string, string>;
  setStoryChoice: (key: string, value: string) => void;
  baseExt: BaseExt;
  setBaseExt: (patch: Partial<BaseExt>) => void;
  // second batch: Lane 10's claims model + morale counters (persisted;
  // legacy `base` above stays readable and migrates into claims on
  // load), Lane 9's explicit beacon ending state (derived from the
  // beacon_lit / beacon_dark flags by setFlag + on load).
  claims: ClaimsState;
  setClaims: (claims: ClaimsState) => void;
  moraleRuntime: MoraleRuntime;
  setMoraleRuntime: (m: MoraleRuntime) => void;
  // ORDER #6: per-survivor runtime (orders / needs / carried weapon)
  // and per-survivor skill maps (order #5's survivor XP, fed at last).
  survivorRuntime: Record<string, import('./types').SurvivorRuntime>;
  survivorSkills: Record<string, Record<string, { level: number; xp: number }>>;
  setSurvivorOrder: (id: string, order: import('./types').SurvivorOrder) => void;
  /** Hand a pack weapon to a survivor (the instance leaves the pack). */
  equipSurvivorWeapon: (id: string, invUid: string) => boolean;
  /** Take a survivor's weapon back into the pack (refused if no room). */
  unequipSurvivorWeapon: (id: string) => boolean;
  setSurvivorNeeds: (id: string, hunger: number, fatigue: number) => void;
  /** A companion eats one food item; returns its id, or null if none. */
  survivorEat: (id: string, from: 'pack' | 'base') => string | null;
  /** Feed a §6.1 event into a survivor's own skill map (half rate). */
  awardSurvivorEvent: (id: string, event: XpEventId) => void;
  beaconChoice: 'light' | 'dark' | null;
  setBeaconChoice: (c: 'light' | 'dark' | null) => void;
  dayStats: { kills: number; crafts: number; pickups: number };
  addJournal: (title: string, lines: string[]) => void;
  startDispatch: (
    survivorId: string,
    vehicleDefId: string,
    trailerDefId: string | null,
    task: import('./types').DispatchTask,
    destPoiId: string,
  ) => void;
  recallDispatch: (id: string) => void;
  cancelBuild: (facilityId: string) => void;
  treatSurvivor: (survivorId: string) => void;
  moveInvItem: (uid: string, gx: number, gy: number, rot: boolean) => void;
  arrangeInventory: (order: 'size' | 'category') => void;
  arrangeContainer: (dest: CarriedDest, order: 'size' | 'category') => void;
  moveStorageItem: (index: number, gx: number, gy: number, rot: boolean) => void;

  // inventory v2: NEARBY storage (world containers + vehicle storage
  // within interaction radius), refreshed by the deck while it is open
  nearby: NearbyEntry[];
  refreshNearby: () => void;

  // hold-to-search: active search of a container / corpse / safe
  search: { id: string; label: string; frac: number } | null;
  setSearch: (s: { id: string; label: string; frac: number } | null) => void;

  // world
  poiPositions: Record<string, [number, number]>; // id -> [x, z]

  // meta
  toasts: ToastMsg[];
  dead: boolean;
  deathCause: string | null;
  endingChoice: string | null;
  cutsceneLine: number;
  pendingSnapshot: SaveSnapshot | null;
  saveSlots: SaveMeta[];

  // ---- actions ----
  setScreen: (s: Screen) => void;
  startNewGame: (d: DifficultyId) => void;
  setPaused: (p: boolean) => void;
  // (audio setting actions are declared with their state fields above)

  syncPlayer: (pos: [number, number, number], hp: number, stamina: number) => void;
  damagePlayer: (amount: number, cause: string, opts?: { blockBreak?: boolean }) => void;
  vehicle: {
    uid: string; name: string; speedKmh: number; fuelPct: number; condPct: number;
    storageUsedKg: number; storageCapKg: number; tiresFlat: number; upgrades: string[];
    kind?: string;
  } | null;
  fleet: FleetEntry[];
  trailerFleet: TrailerFleetEntry[];
  setVehicle: (v: GameState['vehicle']) => void;
  setFleet: (f: FleetEntry[]) => void;
  setTrailerFleet: (f: TrailerFleetEntry[]) => void;

  // vehicle/trailer storage panel (T near a vehicle, or the phone)
  storageOpen: { kind: 'vehicle' | 'trailer' | 'crate'; uid: string; label: string } | null;
  storageItems: InvItem[];
  openStorage: (kind: 'vehicle' | 'trailer' | 'crate', uid: string, label: string) => void;
  closeStorage: () => void;
  refreshStorage: () => void;
  storagePut: (invUid: string) => void;
  storageTake: (index: number) => void;

  // workshop actions driven from the phone, applied by the engine
  atWorkshop: () => boolean;
  repairVehicle: (uid: string, kind: 'tire' | 'engine' | 'battery' | 'scrap') => void;
  installUpgrade: (uid: string, upgradeId: string) => void;
  healPlayer: (amount: number) => void;
  advanceTime: (minutes: number) => void;

  addItem: (itemId: string, qty: number, quiet?: boolean, opts?: { found?: boolean }) => boolean;
  removeItem: (uid: string, qty: number) => boolean;
  countItem: (itemId: string) => number;
  equipUid: (uid: string) => void;
  setLoaded: (uid: string, n: number) => void;
  setCondition: (uid: string, n: number) => void;
  setJammed: (uid: string, b: boolean) => void;
  repairWeapon: (uid: string) => void;
  disassemble: (uid: string) => void;
  attachMod: (weaponUid: string, modUid: string) => void;
  applyFinish: (weaponUid: string, finishUid: string) => void;
  detachMod: (weaponUid: string, modId: string) => void;
  unequipSlot: (slot: SlotId | 'melee' | 'ranged' | 'pack') => void;
  selectWeaponSlot: (slot: WeaponSlotId) => void;
  /** Move one carried instance into a carried destination grid
   *  (pockets, or a container instance's contents — worn garments
   *  included). Vehicle storage goes through storagePut/storageTake. */
  transferItem: (uid: string, dest: CarriedDest) => void;
  useItemUid: (uid: string) => void;
  dropUid: (uid: string) => void;
  assignHotbar: (index: number, uid: string | null) => void;
  useHotbar: (index: number) => void;

  setFlag: (flag: string) => void;
  addRep: (faction: string, amount: number) => void;
  questEvent: (type: QuestStepType, target: string, count?: number) => void;
  checkQuestStarts: () => void;

  openDialogue: (source: string, nodeId: string) => void;
  closeDialogue: () => void;
  setInteractPrompt: (label: string | null) => void;

  openPhone: (tab?: PhoneTab) => void;
  closePhone: () => void;
  setPhoneTab: (t: PhoneTab) => void;
  drainBattery: (amount: number) => void;
  chargeBattery: (amount: number) => void;

  openBackpack: () => void;
  closeBackpack: () => void;
  sortInventory: () => void;
  craftRecipe: (recipeId: string) => void;

  openSleep: () => void;
  closeSleep: () => void;
  setWellRested: (minutes: number) => void;

  // loot preview (E on a container shows contents before taking)
  lootOpenId: string | null;
  lootStash: Record<string, { itemId: string; qty: number }[]>;
  stageContainerLoot: (containerId: string, items: { itemId: string; qty: number }[]) => void;
  openStagedLoot: (containerId: string) => void;
  takeLootIndex: (containerId: string, index: number) => void;
  takeAllLoot: (containerId: string) => void;
  closeLoot: () => void;

  addToast: (text: string) => void;
  dismissToast: (id: number) => void;

  setPoiPositions: (map: Record<string, [number, number]>) => void;

  die: (cause: string) => void;
  respawn: () => void;
  triggerEnding: (choice: string) => void;
  setCutsceneLine: (i: number) => void;

  saveToSlot: (slot: string) => Promise<boolean>;
  loadFromSlot: (slot: string) => Promise<boolean>;
  deleteSlot: (slot: string) => Promise<void>;
  refreshSlots: () => Promise<void>;
  autosave: () => Promise<void>;
}

const initialEquipped: Equipped = emptyEquipped();

/**
 * Craft-queue persistence bridge (Lane 5 field contract, Lane 7 request).
 * Lane 7's engine keeps its jobs in its own zustand store (useCraftQueue
 * in src/systems/crafting.ts), which this module must not import — that
 * file imports this store, so a static import back would close a cycle.
 * Instead Lane 7 registers its store here at merge time (two lines in
 * crafting.ts):
 *
 *   craftQueueBridge.read = () => useCraftQueue.getState().jobs;
 *   craftQueueBridge.write = (jobs) => useCraftQueue.setState({ jobs: [...jobs] });
 *
 * Until registered (and in every test that doesn't), read/write are null
 * and persistence falls back to the store's own craftQueue mirror.
 * saveToSlot harvests bridge-first and refreshes the mirror; loadFromSlot
 * and startNewGame push the restored/cleared array into the bridge.
 */
export const craftQueueBridge: {
  read: (() => CraftJob[]) | null;
  write: ((jobs: CraftJob[]) => void) | null;
} = { read: null, write: null };

/**
 * Faction canon (Lane 9 field requests F1/F2) — SINGLE SOURCE since the
 * Stage 4 merge: STARTING_REP / LEGACY_REP_ALIAS are imported from
 * src/data/factions.ts (easymode-era startRep values; folds from
 * FACTION_FOLDS) and re-exported here so existing store consumers and
 * tests keep their import path. Values are unchanged by the swap:
 * remnants −50, union +25, skulls −30, tollkeepers/drowned/lighthouse 0;
 * pier→union, refuge→union, hollow→skulls.
 */
export { STARTING_REP, LEGACY_REP_ALIAS };

/** Fold a loaded save's rep onto the canon roster (Lane 9, F2): start
 *  from STARTING_REP, let saved standings override, then add any legacy
 *  folded-faction standing into its absorbing faction (the pier crew IS
 *  the Union now — standing earned with them carries, on top of the
 *  Union's starting goodwill). Alias keys never survive the fold. */
export function foldLegacyRep(saved: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...STARTING_REP };
  for (const [id, value] of Object.entries(saved)) {
    if (!(id in LEGACY_REP_ALIAS)) out[id] = value;
  }
  for (const [oldId, newId] of Object.entries(LEGACY_REP_ALIAS)) {
    if (oldId in saved) out[newId] = (out[newId] ?? 0) + saved[oldId];
  }
  return out;
}

/** Legacy facility → Lane 10 tiered facility defId, matched by NAME
 *  (Lane 10's migration rule): the flat list's Rain Collector is the
 *  tiered 'water' line, Garage Bay is 'garage'. Tier 1 on migration. */
const LEGACY_FACILITY_MAP: Record<string, string> = {
  command_post: 'command_post',
  garden: 'garden',
  infirmary: 'infirmary',
  salvage_rig: 'salvage_rig',
  rain_collector: 'water',
  garage_bay: 'garage',
};
/** Legacy flat facilities that are PREFABS in Lane 10's model. */
const LEGACY_PREFAB_MAP: Record<string, string> = {
  palisade: 'palisade_wall',
  watchtower: 'watchtower',
  storage_crate: 'storage_crate',
};

/** Migrate a legacy `base: { poiId, facilities }` snapshot value into
 *  Lane 10's ClaimsState (their migration rule): the old base becomes
 *  the home BaseInstance with a Command Post at tier 1 (the claim always
 *  included it) plus every legacy facility mapped by name at tier 1;
 *  defense/storage flat facilities become prefabs. Ids in neither map
 *  are dropped — none exist in the shipped flat list. Stockpile starts
 *  empty (the legacy model had none). */
export function claimsFromLegacyBase(
  base: { poiId: string; facilities: string[] } | null,
): ClaimsState {
  if (!base) return { home: null, outposts: [] };
  const facilities: BaseInstance['facilities'] = [
    { defId: 'command_post', tier: 1, staffId: null, paused: false },
  ];
  const prefabs: BaseInstance['prefabs'] = [];
  for (const id of base.facilities) {
    if (id === 'command_post') continue;
    const tiered = LEGACY_FACILITY_MAP[id];
    if (tiered) {
      facilities.push({ defId: tiered, tier: 1, staffId: null, paused: false });
      continue;
    }
    const prefab = LEGACY_PREFAB_MAP[id];
    if (prefab) prefabs.push({ defId: prefab });
  }
  const home: BaseInstance = {
    siteId: base.poiId, role: 'home', facilities, prefabs, stockpile: [],
  };
  return { home, outposts: [] };
}

/** Audio settings live outside the save system (localStorage, same
 *  pattern as 'nomad-body'): they describe the player's client, not
 *  the run. Defaults: unmuted, full volume. */
const AUDIO_SETTINGS_KEY = 'nomad-audio';
function readAudioSettings(): { muted: boolean; volume: number } {
  try {
    if (typeof localStorage === 'undefined') return { muted: false, volume: 1 };
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return { muted: false, volume: 1 };
    const parsed = JSON.parse(raw) as { muted?: unknown; volume?: unknown };
    return {
      muted: parsed.muted === true,
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 1,
    };
  } catch {
    return { muted: false, volume: 1 };
  }
}
function persistAudioSettings(muted: boolean, volume: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ muted, volume }));
  } catch { /* private mode */ }
}

export const useGameStore = create<GameState>()((set, get) => {
  /** Wave 3: settle every dispatch whose ETA has passed. Runs off
   *  advanceTime, so it ticks while playing, fast-forwarding, or sleeping.
   *  Side effects (loot into the returning vehicle's storage, condition
   *  damage, survivor injury) go through the engine/store like any other. */
  const resolveDueDispatches = () => {
    const s = get();
    if (s.dispatches.length === 0) return;
    const now = s.daysElapsed * 1440 + s.timeMinutes;
    const due = s.dispatches.filter((d) => now >= d.etaMin);
    if (due.length === 0) return;
    set({ dispatches: s.dispatches.filter((d) => now < d.etaMin) });
    for (const d of due) {
      const st = get();
      const sv = st.survivors.find((x) => x.id === d.survivorId);
      if (!sv) continue;
      const eng = getGame();
      const vehName = st.fleet.find((f) => f.defId === d.vehicleDefId)?.name ?? d.vehicleDefId;
      const heat = st.base ? baseHeat(st.base.facilities, st.survivors.length, st.daysElapsed) : 0;
      const veh = st.fleet.find((f) => f.defId === d.vehicleDefId);
      const freeKg = Math.max(0, (veh?.storageCapKg ?? 60) - (veh?.storageUsedKg ?? 0));
      const out = resolveDispatch({
        task: d.task,
        destPoiId: d.destPoiId,
        distM: d.distM,
        heat,
        scavenging: sv.skills.scavenging ?? 0,
        driver: sv.skills.driver ?? 0,
        combat: sv.skills.combat ?? 0,
        traits: sv.traits,
        freeKg,
        rng: Math.random,
      });
      const lines: string[] = [];
      if (out.eventText) lines.push(out.eventText);

      if (d.task === 'scout') {
        const census = eng?.scoutPoi(d.destPoiId);
        if (census) {
          set({ scouted: { ...get().scouted, [d.destPoiId]: { poiId: d.destPoiId, atMin: now, containers: census.total, looted: census.looted } } });
          const verdict =
            census.total === 0 ? 'Nothing searchable stands there.'
            : census.looted >= census.total ? 'Picked clean — every container is empty.'
            : census.looted / census.total > 0.5 ? 'Picked over — the easy finds are gone.'
            : 'Rich pickings — most of it is still there.';
          lines.push(`${poiName(d.destPoiId)}: ${census.total} containers standing, ${census.looted} already emptied. ${verdict}`);
        } else {
          lines.push('The scout report came back garbled — no usable intel.');
        }
      }

      // loot delivery: vehicle storage first, then the trailer's, then
      // the player's own pack; whatever fits nowhere stayed behind
      let leftKg = out.leftBehindKg;
      const brought: string[] = [];
      for (const stack of out.loot) {
        let placed = false;
        if (eng) {
          placed = !eng.storagePutItem('vehicle', d.vehicleDefId, { uid: newUid(), itemId: stack.itemId, qty: stack.qty });
        }
        if (!placed) placed = st.addItem(stack.itemId, stack.qty, true);
        if (placed) brought.push(`${stack.qty}× ${ITEMS[stack.itemId]?.name ?? stack.itemId}`);
        else leftKg += (ITEMS[stack.itemId]?.weight ?? 1) * stack.qty;
      }
      if (d.task !== 'scout') {
        lines.push(
          brought.length > 0
            ? `Brought back: ${brought.join(', ')} — loaded into the ${vehName}.`
            : 'Came back empty-handed.',
        );
      }
      if (leftKg > 0.05) lines.push(`Left behind ≈${leftKg.toFixed(1)} kg that would not fit.`);

      // vehicle wear + survivor hurt
      if (out.vehicleDamage > 0 && eng) {
        const tireLine = eng.damageVehicle(d.vehicleDefId, out.vehicleDamage);
        lines.push(`The ${vehName} took a beating (−${Math.round(out.vehicleDamage * 100)}% condition).`);
        if (tireLine) lines.push(tireLine);
      }
      if (out.survivorHpLoss > 0) lines.push(`${sv.name} came back hurt (−${out.survivorHpLoss} HP).`);
      set({
        survivors: get().survivors.map((x) => {
          if (x.id !== sv.id) return x;
          const hp = Math.max(5, x.hp - out.survivorHpLoss);
          return {
            ...x,
            hp,
            status: hp < 45 && x.status === 'healthy' ? ('injured' as const) : x.status,
            morale: Math.max(0, Math.min(100, x.morale + out.moraleDelta)),
          };
        }),
      });
      const taskName = d.task === 'scavenge' ? 'Scavenge' : d.task === 'scout' ? 'Scout' : 'Escort run';
      get().addJournal(`${taskName} — ${poiName(d.destPoiId)}`, lines);
      get().addToast(`${sv.name} is back from ${poiName(d.destPoiId)}. Report in the Log.`);
      get().addSkillXp('leadership', 4);
      // ORDER #6: the run itself taught the runner — scavenge pays
      // scavenging, scout pays stealth, escort pays combat (convoys
      // get hunted; coming back IS the fight story).
      get().awardSurvivorEvent(
        sv.id,
        d.task === 'scavenge' ? 'container_looted' : d.task === 'scout' ? 'search_undetected' : 'husk_kill_ranged',
      );
    }
  };

  /** Wave 3: finish any base construction whose timer has run out. */
  const tickBaseQueue = () => {
    const s = get();
    if (s.baseQueue.length === 0 || !s.base) return;
    const now = s.daysElapsed * 1440 + s.timeMinutes;
    const done = s.baseQueue.filter((q) => now >= q.readyMin);
    if (done.length === 0) return;
    const b = s.base;
    const facilities = [...b.facilities];
    for (const q of done) {
      if (!facilities.includes(q.facilityId)) facilities.push(q.facilityId);
    }
    set({
      base: { ...b, facilities },
      baseQueue: s.baseQueue.filter((q) => now < q.readyMin),
    });
    for (const q of done) {
      const def = FACILITY_DEFS.find((f) => f.id === q.facilityId);
      get().addJournal(`Built — ${def?.name ?? q.facilityId}`, [
        `Construction finished at the base. ${def?.desc ?? ''}`,
      ]);
      get().addToast(`Built: ${def?.name ?? q.facilityId}.`);
    }
    sfx.play('quest', { volume: 0.5 });
  };

  const api: GameState = {
    screen: 'title',
    difficulty: 'survivor',
    bodyType: (typeof localStorage !== 'undefined' && localStorage.getItem('nomad-body') === 'female'
      ? 'female'
      : 'male') as 'male' | 'female',
    setBodyType: (b) => {
      set({ bodyType: b });
      // until the player styles themselves, the hair default follows the frame
      if (!get().appearanceCustomized) {
        set({ appearance: { ...get().appearance, hairStyle: b === 'female' ? 'long' : 'crop' } });
      }
      try { localStorage.setItem('nomad-body', b); } catch { /* private mode */ }
    },
    appearance: {
      ...DEFAULT_APPEARANCE,
      hairStyle: (typeof localStorage !== 'undefined' && localStorage.getItem('nomad-body') === 'female'
        ? 'long'
        : 'crop') as Appearance['hairStyle'],
    },
    appearanceCustomized: false,
    setAppearance: (patch) => {
      set({ appearance: { ...get().appearance, ...patch }, appearanceCustomized: true });
      sfx.play('ui', { volume: 0.4 });
    },
    seed: 1337,
    paused: false,
    audioMuted: readAudioSettings().muted,
    audioVolume: readAudioSettings().volume,
    setAudioMuted: (m) => {
      set({ audioMuted: m });
      persistAudioSettings(m, get().audioVolume);
      sfx.setMuted(m);
    },
    setAudioVolume: (v) => {
      const vol = Math.max(0, Math.min(1, v));
      set({ audioVolume: vol });
      persistAudioSettings(get().audioMuted, vol);
      sfx.setVolume(vol);
    },

    hp: 100, maxHp: 100, stamina: 100, maxStamina: 100,
    pos: [0, 0, 0],
    timeMinutes: 480, // 08:00
    daysElapsed: 0,
    playSeconds: 0,

    inventory: [],
    equipped: { ...initialEquipped },
    hotbar: [null, null, null, null],

    quests: [],
    doneQuests: [],
    flags: {},
    rep: { ...STARTING_REP },

    phoneOpen: false,
    phoneTab: 'home',
    phoneUnlocked: false,
    battery: 100,

    backpackOpen: false,
    inventoryOpen: false,
    sleepOpen: false,
    restedMinutesLeft: 0,
    lootOpenId: null,
    lootStash: {},

    dialogue: null,
    interactPrompt: null,

    noiseLevel: 0,
    visibility: 0,
    search: null,

    meleeTarget: false,
    hitmark: null,
    nearStation: null,
    atBase: null,
    weatherNow: { state: 'clear', wetPct: 0 },
    setWeatherNow: (weatherNow) => set({ weatherNow }),

    poiPositions: {},

    nearby: [],
    refreshNearby: () => {
      const eng = getGame();
      if (!eng) return;
      set({ nearby: eng.getNearbyStorage() });
    },

    toasts: [],
    dead: false,
    deathCause: null,
    endingChoice: null,
    cutsceneLine: 0,
    pendingSnapshot: null,
    saveSlots: [],

    setScreen: (s) => set({ screen: s, paused: false, dialogue: null, phoneOpen: false, backpackOpen: false, inventoryOpen: false, sleepOpen: false, lootOpenId: null, lootStash: {} }),
    setPaused: (p) => set({ paused: p }),

    startNewGame: (d) => {
      const seed = Math.floor(Math.random() * 1_000_000_000);
      set({
        screen: 'prologue',
        difficulty: d,
        seed,
        paused: false,
        hp: 100, stamina: 100,
        timeMinutes: 480,
        daysElapsed: 0,
        playSeconds: 0,
        // inventory v2 (Ian 2026-10-21): you SPAWN with the sat phone
        // as an item — in your pockets — so the interface is in hand
        // from minute zero. The deck follows the item from here on.
        inventory: [{ uid: newUid(), itemId: 'phone', qty: 1, loc: 'pockets' }],
        equipped: { ...initialEquipped }, hotbar: [null, null, null, null],
        quests: [{ id: 'q_prologue', stepIndex: 0, progress: 0 }],
        doneQuests: [],
        flags: {},
        rep: { ...STARTING_REP },
        phoneOpen: false, phoneTab: 'home', phoneUnlocked: true, battery: 100,
        nearby: [],
        backpackOpen: false, inventoryOpen: false, sleepOpen: false, restedMinutesLeft: 0, lootOpenId: null, lootStash: {},
        storageOpen: null, storageItems: [], vehicle: null, fleet: [], trailerFleet: [],
        dialogue: { source: 'prologue', nodeId: 'start' },
        interactPrompt: null,
        poiPositions: {},
        dead: false, deathCause: null, endingChoice: null, cutsceneLine: 0,
        pendingSnapshot: null,
        skills: {
          combat: { level: 0, xp: 0 },
          mechanics: { level: 0, xp: 0 },
          medicine: { level: 0, xp: 0 },
          stealth: { level: 0, xp: 0 },
          driver: { level: 0, xp: 0 },
          scavenging: { level: 0, xp: 0 },
          leadership: { level: 0, xp: 0 },
        },
        perkPoints: 0,
        perks: [],
        secondWindDay: -1,
        survivors: [],
        base: null,
        dispatches: [], journal: [], scouted: {}, baseQueue: [],
        craftQueue: [], storyChoices: {}, baseExt: {},
        claims: { home: null, outposts: [] },
        claimHostiles: {},
        moraleRuntime: { idleDays: {}, breakingDays: {} },
        beaconChoice: null,
        survivorRuntime: {},
        survivorSkills: {},
        dayStats: { kills: 0, crafts: 0, pickups: 0 },
      });
      // a new run starts with an empty bench — clear Lane 7's store too
      craftQueueBridge.write?.([]);
    },

    syncPlayer: (pos, hp, stamina) => set({ pos, hp: Math.max(0, hp), stamina }),

    vehicle: null,
    setVehicle: (v) => set({ vehicle: v }),
    fleet: [],
    setFleet: (f) => set({ fleet: f }),
    trailerFleet: [],
    setTrailerFleet: (f) => set({ trailerFleet: f }),

    storageOpen: null,
    storageItems: [],
    openStorage: (kind, uid, label) => {
      const eng = getGame();
      if (!eng) return;
      const items = eng.getStorageItems(kind, uid);
      if (!items) { get().addToast('Nothing to open here.'); return; }
      set({ storageOpen: { kind, uid, label }, storageItems: items });
      if (document.pointerLockElement) document.exitPointerLock();
    },
    closeStorage: () => set({ storageOpen: null, storageItems: [] }),
    refreshStorage: () => {
      const s = get();
      if (!s.storageOpen) return;
      const eng = getGame();
      const items = eng?.getStorageItems(s.storageOpen.kind, s.storageOpen.uid);
      if (items) set({ storageItems: items });
    },
    storagePut: (invUid) => {
      const s = get();
      if (!s.storageOpen) return;
      const eng = getGame();
      if (!eng) return;
      const found = findCarried(s.inventory, invUid);
      if (!found) return;
      const inv = found.item;
      // never store something you're wearing/holding — it would strand the slot
      if (slotOfUid(s.equipped, invUid) || s.hotbar.includes(invUid)) {
        s.addToast('Unequip it first.');
        return;
      }
      // vehicle storage stacks by itemId (the engine merges) — a
      // container carrying contents would lose them in the merge.
      // Empty it first; an EMPTY container stores fine.
      if ((inv.contents?.length ?? 0) > 0) {
        s.addToast(`Empty the ${ITEMS[inv.itemId]?.name ?? 'container'} first — storage stacks by kind.`);
        return;
      }
      // trial the carried-side removal before the engine takes it, so
      // a refused removal never strands the item between worlds
      const trial = removeCarried(s.inventory, invUid, inv.qty);
      if (!trial.ok) { s.addToast('Can’t store that.'); return; }
      const err = eng.storagePutItem(s.storageOpen.kind, s.storageOpen.uid, { ...inv });
      if (err) { s.addToast(err); return; }
      set({ inventory: trial.inventory });
      // the deck follows the phone: stored in a trunk = not on you
      if (get().phoneOpen && !hasPhoneCarried(trial.inventory)) set({ phoneOpen: false });
      s.refreshStorage();
      sfx.play('pickup', { volume: 0.4 });
    },
    storageTake: (index) => {
      const s = get();
      if (!s.storageOpen) return;
      const eng = getGame();
      if (!eng) return;
      const peek = eng.getStorageItems(s.storageOpen.kind, s.storageOpen.uid)?.[index];
      if (!peek) return;
      // pack feasibility first (same gates addItem uses), so nothing vanishes
      const def = ITEMS[peek.itemId];
      if (!def) return;
      const limit = carryLimitKg(s.equipped, s.inventory, s.difficulty, carryBonusKg(s.perks));
      if (encumbranceTier(totalWeightKg(s.inventory) + def.weight * peek.qty, limit, heavyShiftKg(s.perks)) === 'immobile') {
        s.addToast('Too heavy — drop something first.');
        return;
      }
      const taken = eng.storageTakeItem(s.storageOpen.kind, s.storageOpen.uid, index);
      if (!taken) return;
      if (!s.addItem(taken.itemId, taken.qty, true, { found: true })) {
        eng.storagePutItem(s.storageOpen.kind, s.storageOpen.uid, taken); // hand it back
        s.addToast('No room in the pack.');
        return;
      }
      s.refreshStorage();
      sfx.play('pickup', { volume: 0.5 });
    },

    repairVehicle: (uid, kind) => {
      const s = get();
      const eng = getGame();
      if (!eng) return;
      const row = s.fleet.find((f) => f.defId === uid);
      if (!row || row.dist > 9) { s.addToast('Get closer to the vehicle to work on it.'); return; }
      // garage bay discount: scrap patch costs 1 at your own base garage
      const atGarage = s.atWorkshop();
      const baseCost: { itemId: string; qty: number } =
        kind === 'tire' ? { itemId: 'tire', qty: 1 }
        : kind === 'engine' ? { itemId: 'engine_part', qty: 1 }
        : kind === 'battery' ? { itemId: 'car_battery', qty: 1 }
        : { itemId: 'scrap', qty: atGarage ? 1 : 2 };
      // me_grease: vehicle repairs cost 1 fewer part (min 1)
      const cost = { ...baseCost, qty: vehicleRepairCost(baseCost.qty, s.perks) };
      if (kind === 'tire' && row.tiresFlat <= 0) { s.addToast('No flat tires on it.'); return; }
      if (kind !== 'tire' && row.condPct >= 99) { s.addToast('It\u2019s already in fine shape.'); return; }
      if (s.countItem(cost.itemId) < cost.qty) {
        s.addToast(`Needs ${cost.qty}× ${ITEMS[cost.itemId]?.name ?? cost.itemId}.`);
        return;
      }
      const it = walkCarried(s.inventory).find((i) => i.itemId === cost.itemId);
      if (!it || !s.removeItem(it.uid, cost.qty)) return;
      const condBefore = row.condPct;
      // me_juryrig: field repairs (away from a workshop/garage) cap at
      // 60% condition — 80% with Jury-Rig. At a workshop the cap is 1.
      const cap = atGarage ? 1 : fieldRepairCap(s.perks);
      const msg = eng.applyRepair(uid, kind, cap);
      // Lane 8 vehicle_repaired_full: a repair that tops the vehicle off
      // at 100% condition pays the driver award
      const condAfter = eng.getVehicleStates().find((v) => v.defId === uid)?.condition;
      if (condBefore < 100 && condAfter !== undefined && condAfter >= 1) {
        s.addSkillXp(XP_EVENTS.vehicle_repaired_full.skill, XP_EVENTS.vehicle_repaired_full.xp);
      }
      s.addToast(msg);
      sfx.play('craft', { volume: 0.6 });
      s.refreshStorage();
    },

    installUpgrade: (uid, upgradeId) => {
      const s = get();
      const eng = getGame();
      if (!eng) return;
      if (!s.atWorkshop()) { s.addToast('Upgrades need the marina Machine Shop or a base Garage Bay.'); return; }
      const def = UPGRADE_DEFS.find((u) => u.id === upgradeId);
      if (!def) return;
      for (const c of def.cost) {
        if (s.countItem(c.itemId) < c.qty) {
          s.addToast(`Needs ${c.qty}× ${ITEMS[c.itemId]?.name ?? c.itemId}.`);
          return;
        }
      }
      if (!eng.canTakeUpgrade(uid, upgradeId)) { s.addToast('That vehicle can\u2019t take this upgrade.'); return; }
      for (const c of def.cost) {
        const it = walkCarried(s.inventory).find((i) => i.itemId === c.itemId);
        if (it) s.removeItem(it.uid, c.qty);
      }
      eng.applyUpgrade(uid, upgradeId);
      s.addToast(`${def.name} installed.`);
      sfx.play('craft', { volume: 0.7 });
    },




    atWorkshop: () => {
      const s = get();
      if (s.nearStation === 'industrial') return true;
      if (s.base?.facilities.includes('garage_bay')) {
        const p = s.poiPositions[s.base.poiId];
        if (p && Math.hypot(p[0] - s.pos[0], p[1] - s.pos[2]) < 30) return true;
      }
      return false;
    },

    damagePlayer: (amount, cause, opts) => {
      const s = get();
      if (s.dead || s.screen !== 'game') return;
      const mult = DIFFICULTIES[s.difficulty].playerDamageTaken;
      let dealt = amount * mult;
      // inside a vehicle: the steel takes most of it
      if (cause === 'husk' && s.vehicle) {
        dealt *= 0.3;
      }
      // blocking with a melee weapon out: 75% reduction on husk hits —
      // br_blocker deepens it to 85% (blockThroughFactor). A brute's
      // hit (blockBreak) ignores the guard entirely unless the
      // br_juggernaut capstone holds it.
      if (cause === 'husk' && input.blocking) {
        const broken = opts?.blockBreak && !s.perks.includes('br_juggernaut');
        if (!broken) dealt *= blockThroughFactor(s.perks);
      }
      // armor carried still protects (plates in a vest you own) —
      // inventory v2: counted across the whole carried forest
      if (cause === 'husk' || cause === 'explosion') {
        let prot = 0;
        for (const it of walkCarried(s.inventory)) {
          const def = ITEMS[it.itemId];
          if (def?.armor) prot += def.armor * it.qty;
        }
        if (s.perks.includes('br_thickskin')) prot += 0.05;
        dealt *= Math.max(0.5, 1 - Math.min(prot, 0.5));
      }
      const hp = Math.max(0, s.hp - dealt);
      // br_secondwind: once per day, a lethal hit leaves you at 1 HP.
      if (hp <= 0 && s.perks.includes('br_secondwind') && (s.secondWindDay ?? -1) !== s.daysElapsed) {
        set({ hp: 1, secondWindDay: s.daysElapsed });
        s.addToast('Second wind — you refuse to fall. (Once today.)');
        sfx.play('quest', { volume: 0.7 });
        return;
      }
      set({ hp });
      if (hp <= 0) s.die(cause);
    },

    healPlayer: (amount) => {
      const s = get();
      set({ hp: Math.min(s.maxHp, s.hp + amount) });
    },

    advanceTime: (minutes) => {
      const s = get();
      const rested = Math.max(0, s.restedMinutesLeft - minutes);
      if (s.restedMinutesLeft > 0 && rested === 0) s.addToast('The well-rested feeling fades.');
      set({ timeMinutes: (s.timeMinutes + minutes) % 1440, restedMinutesLeft: rested });
      resolveDueDispatches();
      tickBaseQueue();
    },

    advanceDay: () => {
      const s = get();
      // wave 3 day journal: close out the day that just ended before the
      // counter resets — kills, crafts, and loot, only when something happened
      const st = s.dayStats;
      if (st.kills > 0 || st.crafts > 0 || st.pickups > 0) {
        const lines: string[] = [];
        if (st.kills > 0) lines.push(`Put down ${st.kills} husk${st.kills === 1 ? '' : 's'}.`);
        if (st.pickups > 0) lines.push(`Hauled in ${st.pickups} item${st.pickups === 1 ? '' : 's'} from the island's leavings.`);
        if (st.crafts > 0) lines.push(`Crafted ${st.crafts} thing${st.crafts === 1 ? '' : 's'} worth having.`);
        const entry: JournalEntry = {
          id: `j${Date.now().toString(36)}${(uidCounter++).toString(36)}`,
          // end of the day being recorded (23:59), not the next midnight —
          // the Log renders entries by their own day's clock
          atMin: s.daysElapsed * 1440 + 1439,
          title: `Day ${s.daysElapsed + 1} — the record`,
          lines,
        };
        set({ journal: [entry, ...s.journal].slice(0, 60) });
      }
      set({ daysElapsed: s.daysElapsed + 1, dayStats: { kills: 0, crafts: 0, pickups: 0 } });
      // Order #5 day_survived: survival time itself teaches scavenging —
      // one award per day rollover (the §6.1 table has no such row; this
      // is the lane's documented addition, see skills-audit.md).
      const ev = XP_EVENTS.day_survived;
      get().addSkillXp(ev.skill, ev.xp);
    },

    addItem: (itemId, qty, quiet, opts) => {
      const def = ITEMS[itemId];
      if (!def) return false;
      const s = get();
      // weight gate: >160% of limit blocks pickup (unchanged rule;
      // the weight itself is the recursive forest weight now)
      const addedW = def.weight * qty;
      const limit = carryLimitKg(s.equipped, s.inventory, s.difficulty, carryBonusKg(s.perks));
      if (encumbranceTier(totalWeightKg(s.inventory) + addedW, limit, heavyShiftKg(s.perks)) === 'immobile') {
        if (!quiet) s.addToast('Too heavy — drop something first.');
        return false;
      }
      let inv = s.inventory;
      let remaining = qty;
      // 1) top up existing stacks anywhere in the forest (walk order),
      //    respecting the holding container's own weight cap
      for (const stack of walkCarried(inv)) {
        if (remaining <= 0) break;
        if (stack.itemId !== itemId) continue;
        const space = def.stack - stack.qty;
        if (space <= 0) continue;
        const holderUid = findCarried(inv, stack.uid)?.containerUid ?? null;
        if (holderUid) {
          const spec = specForDest(inv, { type: 'container', uid: holderUid });
          if (spec) {
            const holder = findCarried(inv, holderUid)?.item;
            const contentsKg = (holder?.contents ?? []).reduce((a, c) => a + itemWeightKg(c), 0);
            const room = Math.max(0, Math.floor((spec.kg - contentsKg) / Math.max(def.weight, 0.0001)));
            if (room <= 0) continue;
            const take = Math.min(space, remaining, room);
            if (take <= 0) continue;
            inv = updateCarried(inv, stack.uid, (i) => ({ ...i, qty: i.qty + take }));
            remaining -= take;
            continue;
          }
        }
        const take = Math.min(space, remaining);
        inv = updateCarried(inv, stack.uid, (i) => ({ ...i, qty: i.qty + take }));
        remaining -= take;
      }
      // 2) fresh stacks land in the receive grids (worn backpack →
      //    pockets → jacket → vest → pants), first fit that holds them
      while (remaining > 0) {
        const take = Math.min(def.stack, remaining);
        const fresh: InvItem = { uid: newUid(), itemId, qty: take };
        // a weapon found in the world has lived a life: condition 35–85.
        // Crafted and granted weapons arrive pristine (no opts.found).
        if (opts?.found && (def.category === 'weapon-ranged' || def.category === 'weapon-melee')) {
          fresh.condition = 35 + Math.floor(Math.random() * 51);
        }
        const placed = addToCarried(inv, s.equipped, fresh, s.perks);
        if (!placed) {
          if (!quiet) s.addToast('No room — every grid is full.');
          break;
        }
        inv = placed;
        remaining -= take;
      }
      const added = qty - remaining;
      if (added <= 0) return false;
      const patch: { inventory: InvItem[]; phoneUnlocked?: boolean } = { inventory: inv };
      // picking up the sat phone actually unlocks it (Tab/P)
      if (itemId === 'phone' && !s.phoneUnlocked) {
        patch.phoneUnlocked = true;
      }
      set(patch);
      if (!quiet) {
        s.addToast(`Picked up ${added > 1 ? `${added}x ` : ''}${def.name}`);
        if (itemId === 'phone') s.addToast('Phone unlocked — press Tab or P to open it.');
        // collect-type quest steps
        s.questEvent('collect', itemId, added);
      }
      return true;
    },

    removeItem: (uid, qty) => {
      const s = get();
      // deep removal: the instance may live in any grid or container.
      // A non-empty container refuses (empty it first) — see
      // containers.removeCarried; dropUid is the whole-bag path.
      const res = removeCarried(s.inventory, uid, qty);
      if (!res.ok) return false;
      const inv = res.inventory;
      // clear dangling references across every slot + the hotbar
      const alive = (u: string | null) => (u && findCarried(inv, u) ? u : null);
      const eq: Equipped = { ...s.equipped };
      for (const slot of ALL_SLOTS) eq[slot] = alive(eq[slot]);
      set({
        inventory: inv,
        equipped: syncWeaponProjections(eq, inv),
        hotbar: s.hotbar.map((h) => alive(h)),
      });
      // the deck follows the phone item
      if (get().phoneOpen && !hasPhoneCarried(inv)) set({ phoneOpen: false });
      return true;
    },

    countItem: (itemId) => countCarried(get().inventory, itemId),

    equipUid: (uid) => {
      const s = get();
      const found0 = findCarried(s.inventory, uid);
      const def = found0 ? ITEMS[found0.item.itemId] : undefined;
      if (!found0 || !def) return;
      // ONE equipment model: weapons route to their weapon slot,
      // garments/armor to their garment slot (equipment.ts routing).
      const slot = equipSlotForDef(def);
      if (!slot) { s.addToast(`${def.name} can't be equipped.`); return; }
      if (s.equipped[slot] === uid) return; // already wearing/holding it
      let inv = s.inventory;
      // a freshly equipped gun starts with a full magazine
      if (def.category === 'weapon-ranged' && def.magSize != null && found0.item.loaded === undefined) {
        inv = updateCarried(inv, uid, (i) => ({ ...i, loaded: magSizeOf(def.magSize!, i.mods ?? []) }));
      }
      const found = findCarried(inv, uid);
      if (!found) return;
      const item = found.item;
      const occupantUid = s.equipped[slot];
      let eq: Equipped = { ...s.equipped, [slot]: uid };
      if (isWeaponSlot(slot)) eq = { ...eq, activeWeapon: slot };
      if (occupantUid && occupantUid !== uid) {
        // SWAP (a first-class op): the item leaves its grid for the
        // slot; the occupant returns to the grid the item came from —
        // or the first receive grid that fits. Nowhere fits → refuse,
        // nothing moves (conservation by construction).
        const occFound = findCarried(inv, occupantUid);
        if (!occFound) return;
        const r1 = removeCarried(inv, uid, item.qty, { allowContents: true });
        if (!r1.ok) return;
        const r2 = removeCarried(r1.inventory, occupantUid, occFound.item.qty, { allowContents: true });
        if (!r2.ok) return;
        const base = r2.inventory;
        const candidates: CarriedDest[] = [];
        if (found.containerUid) candidates.push({ type: 'container', uid: found.containerUid });
        else if (item.loc === 'pockets') candidates.push(POCKETS);
        for (const d of receiveDests(base, eq)) {
          if (!candidates.some((c) => sameDest(c, d))) candidates.push(d);
        }
        let placedInv: InvItem[] | null = null;
        for (const d of candidates) {
          if (fitInDest(base, d, r2.removed, eq, s.perks)) { placedInv = insertIntoDest(base, d, r2.removed, eq, s.perks); break; }
        }
        if (!placedInv) {
          s.addToast(`No room to swap the ${ITEMS[r2.removed.itemId]?.name ?? 'item'} out.`);
          return;
        }
        inv = [...placedInv, r1.removed];
      } else {
        // simple equip: lift the instance out of its grid to top
        // level — slotted/worn items live in their slot, in no grid.
        // A garment's contents ride with it (they ARE its grid).
        const r = removeCarried(inv, uid, item.qty, { allowContents: true });
        if (!r.ok) return;
        inv = [...r.inventory, r.removed];
      }
      eq = syncWeaponProjections(eq, inv);
      set({ inventory: inv, equipped: eq });
      s.addToast(`Equipped ${def.name}.`);
    },

    setLoaded: (uid, n) => {
      const s = get();
      set({ inventory: updateCarried(s.inventory, uid, (i) => ({ ...i, loaded: n })) });
    },

    setCondition: (uid, n) => {
      const s = get();
      const v = Math.round(Math.max(0, Math.min(100, n)) * 100) / 100;
      set({ inventory: updateCarried(s.inventory, uid, (i) => ({ ...i, condition: v })) });
    },

    setJammed: (uid, b) => {
      const s = get();
      set({ inventory: updateCarried(s.inventory, uid, (i) => ({ ...i, jammed: b })) });
    },

    /** Bench repair: gun_parts (ranged) or scrap (melee), 1 per 40 missing. */
    repairWeapon: (uid) => {
      const s = get();
      if (s.nearStation !== 'workbench') {
        s.addToast('Repairs happen at a Weapons Bench.');
        return;
      }
      const w = findCarried(s.inventory, uid)?.item;
      const def = w ? ITEMS[w.itemId] : undefined;
      if (!w || !def) return;
      const cond = w.condition ?? 100;
      const missing = 100 - cond;
      if (missing <= 0.5) {
        s.addToast(`${def.name} is already in full working order.`);
        return;
      }
      const costId = def.category === 'weapon-ranged' ? 'gun_parts' : 'scrap';
      const units = Math.ceil(missing / 40);
      if (s.countItem(costId) < units) {
        s.addToast(`Repair needs ${units}× ${ITEMS[costId].name}.`);
        return;
      }
      let left = units;
      while (left > 0) {
        const stack = walkCarried(get().inventory).find((i) => i.itemId === costId && i.qty > 0);
        if (!stack) break;
        const take = Math.min(stack.qty, left);
        get().removeItem(stack.uid, take);
        left -= take;
      }
      get().setCondition(uid, 100);
      if (w.jammed) get().setJammed(uid, false);
      // Lane 8 repair event: a completed bench repair pays mechanics XP
      get().addSkillXp(XP_EVENTS.repair.skill, XP_EVENTS.repair.xp);
      s.addToast(`${def.name} stripped, cleaned and rebuilt — good as new.`);
    },

    /** Strip a weapon/armor at the bench into its disassembly yield. */
    disassemble: (uid) => {
      const s = get();
      if (s.nearStation !== 'workbench') {
        s.addToast('Stripping for parts happens at a Weapons Bench.');
        return;
      }
      const w = findCarried(s.inventory, uid)?.item;
      const def = w ? ITEMS[w.itemId] : undefined;
      if (!w || !def?.disassembly) return;
      // a slotted/worn piece comes off the body first
      const wornSlot = slotOfUid(s.equipped, uid);
      if (wornSlot) s.unequipSlot(wornSlot);
      if ((w.contents?.length ?? 0) > 0) {
        s.addToast(`Empty the ${def.name} before stripping it.`);
        return;
      }
      // attached mods and loaded rounds come back off before the strip
      for (const modId of w.mods ?? []) get().addItem(modId, 1, true);
      if ((w.loaded ?? 0) > 0 && def.ammoId) get().addItem(def.ammoId, w.loaded!, true);
      get().removeItem(uid, 1);
      const got: string[] = [];
      // Order #5: Salvager (+1 first material) and Scrounger (+1 gun
      // part) ride the one derivation — yields are computed, not verbatim.
      for (const y of disassemblyYields(def.disassembly, s.perks)) {
        if (get().addItem(y.itemId, y.qty, true)) got.push(`${y.qty}× ${ITEMS[y.itemId]?.name ?? y.itemId}`);
      }
      s.addToast(`Stripped the ${def.name}: ${got.join(', ') || 'nothing salvageable'}.`);
    },

    attachMod: (weaponUid, modUid) => {
      const s = get();
      if (s.nearStation !== 'workbench') {
        s.addToast('Attachments are fitted at a Weapons Bench.');
        return;
      }
      const w = findCarried(s.inventory, weaponUid)?.item;
      const m = findCarried(s.inventory, modUid)?.item;
      const wdef = w ? ITEMS[w.itemId] : undefined;
      const mdef = m ? MODS_ALL[m.itemId] : undefined;
      if (!w || !m || !wdef || !mdef) return;
      if (!wdef.modSlots?.includes(mdef.slot)) {
        s.addToast(`The ${wdef.name} has no ${mdef.slot} mount.`);
        return;
      }
      const cur = w.mods ?? [];
      if (cur.some((id) => MODS_ALL[id]?.slot === mdef.slot)) {
        s.addToast(`The ${mdef.slot} mount is taken — detach the current one first.`);
        return;
      }
      const cost = modPartCost(mdef.gunPartsCost, s.perks);
      if (s.countItem('gun_parts') < cost) {
        s.addToast(`Fitting costs ${cost} gun parts.`);
        return;
      }
      // pay in gun parts (tail stacks first), consume the mod item, attach
      let left = cost;
      while (left > 0) {
        const gp = [...get().inventory].reverse().find((i) => i.itemId === 'gun_parts');
        if (!gp) break;
        const take = Math.min(gp.qty, left);
        s.removeItem(gp.uid, take);
        left -= take;
      }
      s.removeItem(modUid, 1);
      set({
        inventory: updateCarried(get().inventory, weaponUid, (i) => ({ ...i, mods: [...(i.mods ?? []), m.itemId] })),
      });
      s.addToast(`Fitted the ${mdef.name} to the ${wdef.name}.`);
      s.addSkillXp('mechanics', 5);
      sfx.play('craft', { volume: 0.5 });
    },

    detachMod: (weaponUid, modId) => {
      const s = get();
      if (s.nearStation !== 'workbench') {
        s.addToast('Attachments come off at a Weapons Bench.');
        return;
      }
      const w = findCarried(s.inventory, weaponUid)?.item;
      if (!w?.mods?.includes(modId)) return;
      set({
        inventory: updateCarried(s.inventory, weaponUid, (i) => ({ ...i, mods: (i.mods ?? []).filter((x) => x !== modId) })),
      });
      s.addItem(modId, 1, true);
      // me_gunsmith ("detach returns the cost too" — the spec's
      // deliberate double-dip): the fitting cost comes back in gun
      // parts, computed by the same formula attach charges.
      const refund = modPartCost(MODS_ALL[modId]?.gunPartsCost ?? 0, s.perks);
      if (refund > 0) s.addItem('gun_parts', refund, true);
      s.addToast(`Removed the ${MODS_ALL[modId]?.name ?? modId}${refund > 0 ? ` — ${refund} gun parts back` : ''}.`);
      sfx.play('ui', { volume: 0.4 });
    },

    /** Wave 4: apply a finish kit to a weapon at the bench. The kit is
     *  consumed; re-finishing replaces the old coat (the old kit is gone —
     *  paint is paint). Purely cosmetic; the gun never shoots different. */
    applyFinish: (weaponUid, finishUid) => {
      const s = get();
      if (s.nearStation !== 'workbench') {
        s.addToast('Finishes are applied at a Weapons Bench.');
        return;
      }
      const w = findCarried(s.inventory, weaponUid)?.item;
      const kit = findCarried(s.inventory, finishUid)?.item;
      const wdef = w ? ITEMS[w.itemId] : undefined;
      const fdef = kit ? FINISHES[kit.itemId] : undefined;
      if (!w || !kit || !wdef || !fdef) return;
      if (wdef.category !== 'weapon-ranged' && wdef.category !== 'weapon-melee') {
        s.addToast('Finishes go on weapons.');
        return;
      }
      if (w.finish === fdef.id) {
        s.addToast(`The ${wdef.name} already wears ${fdef.name}.`);
        return;
      }
      s.removeItem(finishUid, 1);
      set({
        inventory: updateCarried(get().inventory, weaponUid, (i) => ({ ...i, finish: fdef.id })),
      });
      s.addToast(`Refinished the ${wdef.name}: ${fdef.name}.`);
      s.addSkillXp('mechanics', 3);
      sfx.play('craft', { volume: 0.5 });
    },

    unequipSlot: (slot) => {
      const s = get();
      // legacy slot names map onto the unified model
      let target: SlotId | null = null;
      if (slot === 'melee') target = slotOfUid(s.equipped, s.equipped.melee);
      else if (slot === 'ranged') target = slotOfUid(s.equipped, s.equipped.ranged);
      else if (slot === 'pack') target = 'backpack';
      else target = slot;
      if (!target) return;
      const uid = s.equipped[target];
      if (!uid) return;
      const found = findCarried(s.inventory, uid);
      if (!found) {
        set({ equipped: syncWeaponProjections({ ...s.equipped, [target]: null }, s.inventory) });
        return;
      }
      // The item leaves its slot for a grid (receive order). A worn
      // garment's contents travel with it — unequipping never spills.
      // No grid fits → it stays on (refused, nothing moves).
      const eqNext: Equipped = { ...s.equipped, [target]: null };
      const removed = removeCarried(s.inventory, uid, found.item.qty, { allowContents: true });
      if (!removed.ok) return;
      let placed: InvItem[] | null = null;
      for (const d of receiveDests(removed.inventory, eqNext)) {
        if (fitInDest(removed.inventory, d, removed.removed, eqNext, s.perks)) {
          placed = insertIntoDest(removed.inventory, d, removed.removed, eqNext, s.perks);
          break;
        }
      }
      if (!placed) {
        s.addToast(`No room to take off the ${ITEMS[found.item.itemId]?.name ?? 'item'}.`);
        return;
      }
      set({ inventory: placed, equipped: syncWeaponProjections(eqNext, placed) });
    },

    selectWeaponSlot: (slot) => {
      const s = get();
      if (s.equipped.activeWeapon === slot) return;
      set({ equipped: { ...s.equipped, activeWeapon: slot } });
    },

    transferItem: (uid, dest) => {
      const s = get();
      const res = transferCarried(s.inventory, s.equipped, uid, dest, s.perks);
      if (!res.ok) {
        const msgs: Record<string, string> = {
          'cycle': 'A container can’t go inside itself.',
          'too-deep': 'That’s nested too deep.',
          'no-fit': 'No room there.',
          'slotted': 'Unequip it first.',
          'not-a-container': 'That doesn’t open.',
          'no-such-container': 'That container is gone.',
          'not-carried': 'That item is gone.',
        };
        s.addToast(msgs[res.reason] ?? 'Can’t move that there.');
        return;
      }
      set({ inventory: res.inventory });
      sfx.play('pickup', { volume: 0.35 });
    },

    useItemUid: (uid) => {
      const s = get();
      const it = findCarried(s.inventory, uid)?.item;
      const def = it ? ITEMS[it.itemId] : undefined;
      if (!it || !def) return;
      if ((def.category === 'food' || def.category === 'medical') && def.heal) {
        if (s.hp >= s.maxHp) { s.addToast('Already at full health.'); return; }
        s.healPlayer(def.heal);
        s.removeItem(uid, 1);
        s.addToast(`Used ${def.name} (+${def.heal} HP).`);
        if (def.category === 'medical') s.addSkillXp('medicine', 4);
      } else if (it.itemId === 'cleaning_kit' || it.itemId === 'gun_oil') {
        // field weapon care, applied to the held weapon (else a slotted one)
        const targetUid = heldWeaponUid(s.equipped) ?? s.equipped.ranged ?? s.equipped.melee;
        const target = targetUid ? findCarried(s.inventory, targetUid)?.item : undefined;
        const tdef = target ? ITEMS[target.itemId] : undefined;
        if (!target || !tdef) { s.addToast('Equip a weapon to maintain it.'); return; }
        const cond = target.condition ?? 100;
        if (it.itemId === 'cleaning_kit') {
          if (cond >= 60) { s.addToast(`${tdef.name} is already cleaner than a field kit gets it.`); return; }
          s.setCondition(target.uid, 60);
          s.removeItem(uid, 1);
          s.addToast(`Field-stripped the ${tdef.name} — condition 60. The bench does better.`);
        } else {
          if (cond >= 100) { s.addToast(`${tdef.name} is already slick.`); return; }
          s.setCondition(target.uid, Math.min(100, cond + 25));
          s.removeItem(uid, 1);
          s.addToast(`Oiled the ${tdef.name} — condition ${Math.round(Math.min(100, cond + 25))}.`);
        }
      } else if (equipSlotForDef(def)) {
        // weapons slot, garments/packs/armor wear (one model)
        s.equipUid(uid);
      } else {
        s.addToast(`${def.name}: no use action here.`);
      }
    },

    dropUid: (uid) => {
      const s = get();
      const found = findCarried(s.inventory, uid);
      if (!found) return;
      if (slotOfUid(s.equipped, uid) || s.hotbar.includes(uid)) {
        s.addToast('Unequip it first.');
        return;
      }
      // dropping a container drops the whole bag — contents and all
      const res = removeCarried(s.inventory, uid, found.item.qty, { allowContents: true });
      if (!res.ok) return;
      set({ inventory: res.inventory });
      // the deck follows the phone: it isn't on you, it isn't open
      if (get().phoneOpen && !hasPhoneCarried(res.inventory)) set({ phoneOpen: false });
      s.addToast(`Dropped ${ITEMS[found.item.itemId]?.name ?? 'item'}.`);
    },

    assignHotbar: (index, uid) => {
      const s = get();
      const hb = [...s.hotbar];
      hb[index] = uid;
      set({ hotbar: hb });
    },

    useHotbar: (index) => {
      const s = get();
      // inventory v2: keys 1/2/3 ARE the weapon slots (the existing
      // hotkey set — Digit1..4 already land here from Game's input).
      // Selecting a slot makes it the held weapon. Key 4 keeps the
      // legacy quick-use item.
      if (index >= 0 && index < WEAPON_SLOTS.length) {
        s.selectWeaponSlot(WEAPON_SLOTS[index]);
        return;
      }
      const uid = s.hotbar[index];
      if (uid) s.useItemUid(uid);
    },

    setFlag: (flag) => {
      const s = get();
      if (s.flags[flag]) return;
      const patch: Record<string, unknown> = { flags: { ...s.flags, [flag]: true } };
      if (flag === 'phone_unlocked') patch.phoneUnlocked = true;
      // Lane 9 (F3): the beacon ending is explicit state, kept in sync
      // with the flags at the moment they land — consumers read
      // beaconChoice, never scrape flags.
      if (flag === 'beacon_lit') patch.beaconChoice = 'light';
      if (flag === 'beacon_dark') patch.beaconChoice = 'dark';
      set(patch);
      get().checkQuestStarts();
      // Lane 9 (W7, store level): the moment the relay first comes online,
      // the dead frequency answers once. The burst lands in the journal
      // (the Log surface) and sets enclave_burst_heard, which starts
      // q_enclave_burst via the checkQuestStarts inside the nested setFlag.
      // setFlag early-returns on already-set flags, so this fires once.
      if (flag === ENCLAVE_RADIO_BURST.requiresFlag) {
        get().addJournal(ENCLAVE_RADIO_BURST.speaker, [...ENCLAVE_RADIO_BURST.lines]);
        get().addToast('A voice on a dead frequency — check the Log.');
        get().setFlag(ENCLAVE_RADIO_BURST.flag);
      }
    },

    addRep: (faction, amount) => {
      const s = get();
      const next = (s.rep[faction] ?? 0) + amount;
      set({ rep: { ...s.rep, [faction]: next } });
      // Lane 9 (F4): display names come from the FACTIONS table for
      // every faction, not a lighthouse special case. Unknown ids fall
      // back to the raw id. Post-merge this reads Lane 9's canon table.
      const name = FACTIONS.find((f) => f.id === faction)?.name ?? faction;
      s.addToast(`${name} rep ${amount >= 0 ? '+' : ''}${amount} (${next})`);
    },

    questEvent: (type, target, count = 1) => {
      const s = get();
      // wave 3: husk kills feed the day journal's tally
      if (type === 'kill' && target === 'husk') {
        set({ dayStats: { ...s.dayStats, kills: s.dayStats.kills + count } });
      }
      let changed = false;
      const quests: QuestProgress[] = s.quests.map((q) => ({ ...q }));
      const doneQuests = [...s.doneQuests];
      for (const q of quests) {
        const def = QUESTS.find((d) => d.id === q.id);
        if (!def) continue;
        const step = def.steps[q.stepIndex];
        if (!step) continue;
        if (step.type === type && step.target === target) {
          q.progress += count;
          changed = true;
          if (q.progress >= step.count) {
            q.stepIndex += 1;
            q.progress = 0;
            if (q.stepIndex >= def.steps.length) {
              // quest complete
              const qi = quests.indexOf(q);
              quests.splice(qi, 1);
              doneQuests.push(def.id);
              for (const r of def.rewards.rep ?? []) get().addRep(r.faction, r.amount);
              for (const it of def.rewards.items ?? []) get().addItem(it.id, it.qty);
              for (const f of def.rewards.flags ?? []) get().setFlag(f);
              get().addToast(`Quest complete: ${def.title}`);
            } else {
              get().addToast(`Quest updated: ${def.title}`);
            }
          }
        }
      }
      if (changed) {
        set({ quests, doneQuests });
        get().checkQuestStarts();
        void get().autosave();
      }
    },

    checkQuestStarts: () => {
      const s = get();
      const active = new Set(s.quests.map((q) => q.id));
      const done = new Set(s.doneQuests);
      const toAdd: QuestProgress[] = [];
      for (const def of QUESTS) {
        if (active.has(def.id) || done.has(def.id) || def.id === 'q_prologue') continue;
        const sw = def.startsWhen;
        if (!sw) continue;
        const okFlag = !sw.flag || s.flags[sw.flag];
        const okQuest = !sw.questDone || done.has(sw.questDone);
        if (okFlag && okQuest) toAdd.push({ id: def.id, stepIndex: 0, progress: 0 });
      }
      if (toAdd.length > 0) {
        set({ quests: [...get().quests, ...toAdd] });
        for (const q of toAdd) {
          const def = QUESTS.find((d) => d.id === q.id);
          if (def) get().addToast(`New quest: ${def.title}`);
        }
      }
    },

    openDialogue: (source, nodeId) => set({ dialogue: { source, nodeId }, phoneOpen: false }),
    closeDialogue: () => set({ dialogue: null }),
    setInteractPrompt: (label) => {
      if (get().interactPrompt !== label) set({ interactPrompt: label });
    },
    setMeleeTarget: (b) => {
      if (get().meleeTarget !== b) set({ meleeTarget: b });
    },
    setHitmark: (kind) => set({ hitmark: { kind, at: Date.now() } }),
    setNearStation: (s) => {
      if (get().nearStation !== s) set({ nearStation: s });
    },
    setAtBase: (p) => {
      // guarded like setNearStation: Game recomputes every frame, the
      // store only writes when the presence signature actually changes
      if (presenceSignature(get().atBase) !== presenceSignature(p)) set({ atBase: p });
    },
    setNoiseLevel: (n) => {
      const v = Math.max(0, Math.min(100, n));
      if (Math.abs(get().noiseLevel - v) > 0.5) set({ noiseLevel: v });
    },
    setVisibility: (v) => {
      const c = Math.max(0, Math.min(1, v));
      if (Math.abs(get().visibility - c) > 0.02) set({ visibility: c });
    },
    setSearch: (s) => set({ search: s }),

    skills: {
      combat: { level: 0, xp: 0 },
      mechanics: { level: 0, xp: 0 },
      medicine: { level: 0, xp: 0 },
      stealth: { level: 0, xp: 0 },
      driver: { level: 0, xp: 0 },
      scavenging: { level: 0, xp: 0 },
      leadership: { level: 0, xp: 0 },
    },
    perkPoints: 0,
    perks: [],
    secondWindDay: -1,
    addSkillXp: (skill, amt) => {
      // Lane 8 engine adoption: level math lives in systems/skills.applyXp
      // (semantically identical to the old inline copy — cap 10, overflow
      // carries, 1 perk point per level). Toast/sfx stay here in the store.
      const s = get();
      const cur = s.skills[skill];
      if (!cur) return;
      const r = applyXp(cur, amt);
      if (r.state === cur) return;
      set({
        skills: { ...s.skills, [skill]: r.state },
        perkPoints: s.perkPoints + r.levelsGained,
      });
      if (r.levelsGained > 0) {
        const label = skill[0].toUpperCase() + skill.slice(1);
        get().addToast(`${label} level ${r.state.level} — +${r.levelsGained} perk point${r.levelsGained > 1 ? 's' : ''}.`);
        sfx.play('quest', { volume: 0.5 });
      }
    },
    buyPerk: (perkId) => {
      // Gate delegated to Lane 8's canBuyPerk (tier chain + §6.2 requires
      // chains + capstone rules); its reason is the player-facing denial.
      const s = get();
      const def = PERKS_ALL.find((p) => p.id === perkId);
      if (!def) return;
      const check = canBuyPerk(s.perks, s.perkPoints, perkId);
      if (!check.ok) {
        s.addToast(check.reason);
        return;
      }
      set({ perks: [...s.perks, perkId], perkPoints: s.perkPoints - 1 });
      s.addToast(`Perk learned: ${def.name}.`);
      sfx.play('quest', { volume: 0.6 });
    },
    hasPerk: (perkId) => get().perks.includes(perkId),

    survivors: [],
    recruitSurvivor: (def) => {
      const s = get();
      if (s.survivors.some((x) => x.id === def.id)) return;
      // ORDER #6: a recruit gets a runtime record — they walk with you
      // (order 'follow') from the moment they join.
      if (!s.survivorRuntime[def.id]) {
        set({ survivorRuntime: { ...s.survivorRuntime, [def.id]: defaultSurvivorRuntime() } });
      }
      // a new recruit lifts the whole crew (+2 morale, spec driver)
      const crew = s.survivors.map((x) => ({ ...x, morale: Math.min(100, x.morale + 2) }));
      set({ survivors: [...crew, def] });
      s.addToast(`${def.name} joined your crew.`);
      s.addSkillXp('leadership', 15);
      sfx.play('quest', { volume: 0.6 });
    },
    assignJob: (id, job) => {
      const s = get();
      set({ survivors: s.survivors.map((x) => (x.id === id ? { ...x, job } : x)) });
      s.addSkillXp('leadership', 2);
    },
    applyMoraleEvent: (kind) => {
      const s = get();
      if (s.survivors.length === 0) return;
      set({ survivors: moraleEvent(s.survivors, kind) });
    },

    moraleTick: () => {
      const s = get();
      if (s.survivors.length === 0) return;
      const next = s.survivors.map((x) => {
        let d = 2; // fed + watered baseline (stockpile abstraction, v1)
        for (const tid of x.traits) {
          const t = TRAIT_DEFS.find((td) => td.id === tid);
          if (t?.moraleDrift) d += t.moraleDrift;
        }
        if (x.traits.includes('loner')) d += s.survivors.length <= 3 ? 1 : -1;
        if (x.traits.includes('social')) d += s.survivors.length >= 6 ? 1 : -1;
        return { ...x, morale: Math.max(0, Math.min(100, x.morale + d)) };
      });
      set({ survivors: next });
    },
    baseDailyTick: () => {
      const s = get();
      const home = s.claims.home;
      // No tiered home claimed: the legacy abstraction settles morale
      // (Lane 10's engine runs on a real stockpile; without a home there
      // is no pile to eat from and no crew economy to simulate).
      if (!home || s.survivors.length === 0) {
        get().moraleTick();
        return;
      }
      // Upkeep (§3.5): the crew eats from the home stockpile first. Until
      // a stockpile-deposit path exists in the world, the player's pack
      // is the fallback larder — anyone the pile couldn't feed eats from
      // the pack (consumed via the store's removeItem, uid stacks).
      const upkeep = applyUpkeep(home.stockpile, s.survivors);
      const fed = new Set(upkeep.fedIds);
      const unfed = s.survivors.filter((x) => !fed.has(x.id));
      let packConsumed: { itemId: string; qty: number }[] = [];
      if (unfed.length > 0) {
        const packStock = s.inventory
          .filter((i) => FOOD_ITEMS.includes(i.itemId) || WATER_ITEMS.includes(i.itemId))
          .map((i) => ({ itemId: i.itemId, qty: i.qty }));
        const packUpkeep = applyUpkeep(packStock, unfed);
        packConsumed = packUpkeep.consumed;
        for (const id of packUpkeep.fedIds) fed.add(id);
        for (const c of packUpkeep.consumed) {
          let remaining = c.qty;
          while (remaining > 0) {
            const stack = walkCarried(get().inventory).find((i) => i.itemId === c.itemId);
            if (!stack) break;
            const take = Math.min(remaining, stack.qty);
            if (!get().removeItem(stack.uid, take)) break;
            remaining -= take;
          }
        }
      }
      const tick = dailyMoraleTick(s.survivors, s.moraleRuntime, {
        fedIds: [...fed],
        comfort: comfortScore(home),
      });
      set({
        claims: { ...s.claims, home: { ...home, stockpile: upkeep.stockpile } },
        survivors: tick.survivors,
        moraleRuntime: tick.runtime,
      });
      const nameOf = (id: string) => s.survivors.find((x) => x.id === id)?.name ?? id;
      const lines: string[] = [];
      const eaten = [...upkeep.consumed, ...packConsumed];
      if (eaten.length > 0) {
        lines.push(`Upkeep: ${eaten.map((c) => `${c.qty}× ${ITEMS[c.itemId]?.name ?? c.itemId}`).join(', ')} eaten by the crew.`);
      }
      const hungry = s.survivors.filter((x) => !fed.has(x.id)).map((x) => x.name);
      if (hungry.length > 0) lines.push(`Went hungry: ${hungry.join(', ')}. Morale suffers — stock the base.`);
      for (const id of tick.leftIds) {
        lines.push(`${nameOf(id)} walked away. Three days Breaking was enough — they're alive out there, and bitter.`);
        get().addToast(`${nameOf(id)} has left the base.`);
      }
      if (lines.length > 0) get().addJournal('Base upkeep', lines);
    },

    base: null,
    claimBase: (poiId) => {
      const s = get();
      // TOTAL PURGE: only the lighthouse grounds can be claimed — every
      // other claim site was demolished with its buildings.
      if (poiId !== 'lighthouse_base') {
        s.addToast('That ground can\u2019t be claimed — the buildings are gone. The lighthouse grounds are home now.');
        return;
      }
      if (s.base) {
        s.addToast('You already hold a home base. (Relocating comes later.)');
        return;
      }
      set({ base: { poiId, facilities: ['command_post'] } });
      s.setFlag('base_claimed');
      s.addToast('Base claimed. Build it up from the sat phone → Command.');
      s.addJournal(`Base claimed — ${poiName(poiId)}`, [
        'The flag is planted and the Command Post is up. This is home now — build it before the island notices.',
      ]);
      s.addSkillXp('leadership', 10);
      sfx.play('quest', { volume: 0.6 });
    },

    claimClaimSite: (siteId, ctx) => {
      const s = get();
      const site = claimSite(siteId);
      if (!site || site.klass === 'never') {
        s.addToast('That ground can\u2019t be claimed.');
        return { ok: false };
      }
      if (s.claims.home?.siteId === siteId || s.claims.outposts.some((o) => o.siteId === siteId)) {
        s.addToast(`You already hold ${site.name}.`);
        return { ok: false };
      }
      // the checklist's wallet: player pack + home stockpile, merged
      const walletMap = new Map<string, number>();
      for (const it of s.inventory) walletMap.set(it.itemId, (walletMap.get(it.itemId) ?? 0) + it.qty);
      if (s.claims.home) {
        for (const st of s.claims.home.stockpile) walletMap.set(st.itemId, (walletMap.get(st.itemId) ?? 0) + st.qty);
      }
      const wallet = [...walletMap.entries()].map(([itemId, qty]) => ({ itemId, qty }));
      const checks = claimChecklist(site, s.claims, {
        recruits: s.survivors.length,
        rep: { ...s.rep },
        husksWithin40m: ctx.husksWithin40m,
        wallet,
        byForce: ctx.byForce,
      });
      if (!claimReady(checks)) {
        const failing = checks.filter((c) => !c.ok && c.id !== 'access' && !c.id.startsWith('path_'));
        const access = checks.find((c) => c.id === 'access');
        const first = failing[0]?.detail ?? (access && !access.ok ? access.detail : undefined);
        s.addToast(first ? `Not yet — ${first}` : 'Not ready to claim.');
        return { ok: false };
      }
      // pay the site cost: pack first, then the home stockpile
      let claims = s.claims;
      for (const cost of site.cost) {
        let left = cost.qty;
        while (left > 0) {
          const stack = [...get().inventory].reverse().find((i) => i.itemId === cost.itemId && i.qty > 0);
          if (!stack) break;
          const take = Math.min(stack.qty, left);
          get().removeItem(stack.uid, take);
          left -= take;
        }
        if (left > 0 && claims.home) {
          const home = claims.home;
          claims = {
            ...claims,
            home: {
              ...home,
              stockpile: home.stockpile
                .map((st) => (st.itemId === cost.itemId ? { ...st, qty: st.qty - left } : st))
                .filter((st) => st.qty > 0),
            },
          };
        }
      }
      const isHomeClass = site.klass === 'home';
      const relocating = isHomeClass && claims.home !== null && claims.home.siteId !== siteId;
      if (relocating) {
        const from = claims.home!.siteId;
        const res = applyRelocation(claims, siteId);
        set({ claims: res.state, base: { poiId: siteId, facilities: ['command_post'] } });
        for (const r of res.quote.refund) get().addItem(r.itemId, r.qty, true);
        s.setFlag('base_claimed');
        s.addToast(`Home relocated to ${site.name}. Salvage refunded; the old stockpile stays behind as a stash.`);
        s.addJournal(`Home relocated — ${site.name}`, [
          `The flag moves from ${poiName(from)}. Salvage came back at seventy cents on the dollar; what was stockpiled at the old ground stays there, in a stash, until someone hauls it.`,
        ]);
        s.addSkillXp('leadership', 10);
        sfx.play('quest', { volume: 0.6 });
        return { ok: true, relocatedFrom: from, stranded: res.stranded.map((st) => ({ itemId: st.itemId, qty: st.qty })) };
      }
      set({ claims: applyClaim(claims, siteId) });
      if (isHomeClass) {
        set({ base: { poiId: siteId, facilities: ['command_post'] } });
        s.setFlag('base_claimed');
        s.addToast(`${site.name} claimed. Build it up from the sat phone → Base.`);
        s.addJournal(`Base claimed — ${site.name}`, [
          'The flag is planted and the Command Post is up. This is home now — build it before the island notices.',
        ]);
        s.addSkillXp('leadership', 10);
      } else {
        s.addToast(`${site.name} held as an outpost.`);
        s.addJournal(`Outpost claimed — ${site.name}`, [
          'A flag, a post, a promise to come back. The island keeps score of ground held.',
        ]);
      }
      sfx.play('quest', { volume: 0.6 });
      return { ok: true };
    },

    deployTurret: (siteId) => {
      const s = get();
      const isHome = s.claims.home?.siteId === siteId;
      const base = isHome ? s.claims.home : s.claims.outposts.find((o) => o.siteId === siteId);
      if (!base) {
        s.addToast('Turrets deploy at a base you hold.');
        return false;
      }
      const stack = [...s.inventory].reverse().find((i) => i.itemId === 'turret' && i.qty > 0);
      if (!stack) {
        s.addToast('No crafted turret in your pack. The Machine Shop builds them (blueprint: bp_turret).');
        return false;
      }
      s.removeItem(stack.uid, 1);
      const next = { ...base, prefabs: [...base.prefabs, { defId: 'turret' }] };
      set({
        claims: isHome
          ? { ...s.claims, home: next }
          : { ...s.claims, outposts: s.claims.outposts.map((o) => (o.siteId === siteId ? next : o)) },
      });
      const budget = powerBudget(next);
      s.addToast(budget.ok
        ? 'Turret emplaced and on the grid.'
        : 'Turret emplaced — but the grid can\u2019t carry it yet. It stays dark until power does.');
      sfx.play('quest', { volume: 0.5 });
      return true;
    },

    takeFromStockpile: (siteId, itemId, qty) => {
      const s = get();
      const isHome = s.claims.home?.siteId === siteId;
      const base = isHome ? s.claims.home : s.claims.outposts.find((o) => o.siteId === siteId);
      if (!base || qty <= 0) return 0;
      const entry = base.stockpile.find((st) => st.itemId === itemId);
      if (!entry) return 0;
      const taken = Math.min(entry.qty, qty);
      const next = {
        ...base,
        stockpile: base.stockpile
          .map((st) => (st.itemId === itemId ? { ...st, qty: st.qty - taken } : st))
          .filter((st) => st.qty > 0),
      };
      set({
        claims: isHome
          ? { ...s.claims, home: next }
          : { ...s.claims, outposts: s.claims.outposts.map((o) => (o.siteId === siteId ? next : o)) },
      });
      return taken;
    },
    buildFacility: (facilityId) => {
      const s = get();
      const b = s.base;
      if (!b) return;
      const def = FACILITY_DEFS.find((f) => f.id === facilityId);
      if (!def || b.facilities.includes(facilityId)) return;
      // wave 3: construction is queued work with a timer, not an instant —
      // materials are committed up front, the facility lands when ready
      if (s.baseQueue.some((q) => q.facilityId === facilityId)) {
        s.addToast(`${def.name} is already under construction.`);
        return;
      }
      for (const c of def.cost) {
        if (s.countItem(c.itemId) < c.qty) {
          s.addToast(`Needs ${c.qty}× ${ITEMS[c.itemId]?.name ?? c.itemId}.`);
          return;
        }
      }
      for (const c of def.cost) {
        let left = c.qty;
        while (left > 0) {
          const it = [...get().inventory].reverse().find((i) => i.itemId === c.itemId);
          if (!it) break;
          const take = Math.min(it.qty, left);
          s.removeItem(it.uid, take);
          left -= take;
        }
      }
      const mins = buildMinutes(def);
      const readyMin = s.daysElapsed * 1440 + s.timeMinutes + mins;
      set({ baseQueue: [...s.baseQueue, { facilityId, readyMin }] });
      s.addToast(`Construction started: ${def.name} — ready in ~${Math.round(mins / 60 * 10) / 10}h of game time.`);
      s.addSkillXp('leadership', 2);
      sfx.play('craft', { volume: 0.5 });
    },

    cancelBuild: (facilityId) => {
      const s = get();
      const order = s.baseQueue.find((q) => q.facilityId === facilityId);
      if (!order) return;
      const def = FACILITY_DEFS.find((f) => f.id === facilityId);
      set({ baseQueue: s.baseQueue.filter((q) => q.facilityId !== facilityId) });
      // materials come back (the crew had not cut into them yet)
      let refunded = true;
      for (const c of def?.cost ?? []) {
        if (!s.addItem(c.itemId, c.qty, true)) refunded = false;
      }
      s.addToast(
        refunded
          ? `Construction cancelled: ${def?.name ?? facilityId} — materials returned.`
          : `Construction cancelled: ${def?.name ?? facilityId} — some materials would not fit back in the pack.`,
      );
    },

    treatSurvivor: (survivorId) => {
      const s = get();
      const sv = s.survivors.find((x) => x.id === survivorId);
      if (!sv) return;
      const maxHp = sv.traits.includes('tough') ? 130 : 100;
      if (sv.hp >= maxHp) {
        s.addToast(`${sv.name} is already at full health.`);
        return;
      }
      // best kit for the wound: medkit for serious hurt, bandage otherwise;
      // fall back to whatever medical is actually in the pack
      const missing = maxHp - sv.hp;
      const want = missing >= 35 ? ['medkit', 'bandage'] : ['bandage', 'medkit'];
      let used: string | null = null;
      for (const id of want) {
        const it = walkCarried(s.inventory).find((i) => i.itemId === id);
        if (it) { used = id; s.removeItem(it.uid, 1); break; }
      }
      if (!used) {
        s.addToast('No bandages or medkits in the pack to treat with.');
        return;
      }
      const heal = ITEMS[used]?.heal ?? 0;
      const hp = Math.min(maxHp, sv.hp + heal);
      // Lane 8: treatment that flips an injured survivor back to healthy
      // pays survivor_recovered INSTEAD of the plain heal award
      const recovered = sv.status === 'injured' && hp >= 60;
      set({
        survivors: s.survivors.map((x) =>
          x.id === survivorId
            ? { ...x, hp, status: x.status === 'injured' && hp >= 60 ? ('healthy' as const) : x.status }
            : x,
        ),
      });
      s.addToast(`${sv.name} treated with a ${ITEMS[used]?.name ?? used} (+${heal} HP).`);
      const ev = recovered ? XP_EVENTS.survivor_recovered : XP_EVENTS.heal;
      s.addSkillXp(ev.skill, ev.xp);
      sfx.play('craft', { volume: 0.4 });
    },
    baseTick: () => {
      const s = get();
      const b = s.base;
      if (!b) return;
      const made: string[] = [];
      const f = b.facilities;
      if (f.includes('rain_collector')) {
        s.addItem('water_bottle', 1, true);
        made.push('1 water');
      }
      if (f.includes('garden')) {
        const qty = s.survivors.some((x) => x.job === 'Farmer') ? 4 : 2;
        s.addItem('produce', qty, true);
        made.push(`${qty} produce`);
      }
      if (f.includes('salvage_rig')) {
        s.addItem('scrap', 1, true);
        made.push('1 scrap');
      }
      if (f.includes('infirmary') && s.survivors.length > 0) {
        set({
          survivors: get().survivors.map((x) => ({ ...x, hp: Math.min(130, x.hp + 20) })),
        });
      }
      if (made.length > 0) s.addToast(`Base produced: ${made.join(', ')}.`);
    },

    // ---- wave 3 state: dispatch / journal / scout / build queue / grids ----
    dispatches: [],
    journal: [],
    scouted: {},
    baseQueue: [],
    dayStats: { kills: 0, crafts: 0, pickups: 0 },

    // ---- parallel cycle: Lane 5 field-contract state ----
    craftQueue: [],
    storyChoices: {},
    baseExt: {},
    setCraftQueue: (jobs) => set({ craftQueue: [...jobs] }),
    setStoryChoice: (key, value) => {
      set({ storyChoices: { ...get().storyChoices, [key]: value } });
    },
    setBaseExt: (patch) => {
      set({ baseExt: { ...get().baseExt, ...patch } });
    },
    claims: { home: null, outposts: [] },
    claimHostiles: {},
    setClaimHostiles: (counts) => set({ claimHostiles: counts }),
    moraleRuntime: { idleDays: {}, breakingDays: {} },
    beaconChoice: null,
    setClaims: (claims) => set({ claims }),
    setMoraleRuntime: (moraleRuntime) => set({ moraleRuntime }),
    setBeaconChoice: (beaconChoice) => set({ beaconChoice }),
    survivorRuntime: {},
    survivorSkills: {},

    setSurvivorOrder: (id, order) => {
      const s = get();
      const cur = s.survivorRuntime[id] ?? defaultSurvivorRuntime();
      if (cur.order === order || !s.survivors.some((x) => x.id === id)) return;
      set({ survivorRuntime: { ...s.survivorRuntime, [id]: { ...cur, order } } });
      // an order given is a leadership act (§6.1 has the event for it)
      const ev = XP_EVENTS.order_given;
      s.addSkillXp(ev.skill, ev.xp);
    },
    equipSurvivorWeapon: (id, invUid) => {
      const s = get();
      if (!s.survivors.some((x) => x.id === id)) return false;
      const rt = s.survivorRuntime[id] ?? defaultSurvivorRuntime();
      if (rt.weapon) return false; // one weapon per survivor — unequip first
      const found = findCarried(s.inventory, invUid);
      if (!found || found.item.qty !== 1) return false;
      const def = ITEMS[found.item.itemId];
      if (!def || def.damage == null) return false; // weapons only
      if (slotOfUid(s.equipped, invUid) || s.hotbar.includes(invUid)) return false;
      const rem = removeCarried(s.inventory, invUid, 1);
      if (!rem.ok || !rem.removed) return false;
      set({
        inventory: rem.inventory,
        survivorRuntime: { ...s.survivorRuntime, [id]: { ...rt, weapon: rem.removed } },
      });
      return true;
    },
    unequipSurvivorWeapon: (id) => {
      const s = get();
      const rt = s.survivorRuntime[id];
      if (!rt?.weapon) return false;
      const back = addToCarried(s.inventory, s.equipped, rt.weapon, s.perks);
      if (!back) {
        s.addToast('No room in the pack for it.');
        return false;
      }
      set({
        inventory: back,
        survivorRuntime: { ...s.survivorRuntime, [id]: { ...rt, weapon: null } },
      });
      return true;
    },
    setSurvivorNeeds: (id, hunger, fatigue) => {
      const s = get();
      const rt = s.survivorRuntime[id] ?? defaultSurvivorRuntime();
      const h = Math.max(0, Math.min(100, hunger));
      const f = Math.max(0, Math.min(100, fatigue));
      if (Math.abs(h - rt.hunger) < 0.05 && Math.abs(f - rt.fatigue) < 0.05) return;
      set({ survivorRuntime: { ...s.survivorRuntime, [id]: { ...rt, hunger: h, fatigue: f } } });
    },
    survivorEat: (id, from) => {
      const s = get();
      const rt = s.survivorRuntime[id] ?? defaultSurvivorRuntime();
      const satiety: Record<string, number> = { produce: 30, raw_meat: 25, cooked_meat: 45, canned_food: 40 };
      const fedWith = (itemId: string) => {
        set({
          survivorRuntime: {
            ...get().survivorRuntime,
            [id]: { ...(get().survivorRuntime[id] ?? rt), hunger: Math.min(100, rt.hunger + (satiety[itemId] ?? 30)) },
          },
        });
        return itemId;
      };
      if (from === 'base') {
        const home = s.claims.home;
        if (!home) return null;
        const stock = [...home.stockpile];
        for (const fid of FOOD_ITEMS) {
          const ix = stock.findIndex((i) => i.itemId === fid && i.qty > 0);
          if (ix < 0) continue;
          stock[ix] = { ...stock[ix], qty: stock[ix].qty - 1 };
          set({ claims: { ...s.claims, home: { ...home, stockpile: stock.filter((i) => i.qty > 0) } } });
          return fedWith(fid);
        }
        return null;
      }
      for (const fid of FOOD_ITEMS) {
        const inst = walkCarried(s.inventory).find((i) => i.itemId === fid && i.qty > 0);
        if (!inst) continue;
        if (!s.removeItem(inst.uid, 1)) continue;
        return fedWith(fid);
      }
      return null;
    },
    awardSurvivorEvent: (id, event) => {
      const s = get();
      const def = s.survivors.find((x) => x.id === id);
      if (!def) return;
      // seed the map from the def's authored levels the first time —
      // SurvivorDef.skills stays the levels record production reads,
      // and every award writes the grown levels back into it.
      const cur = s.survivorSkills[id] ?? Object.fromEntries(
        SKILL_IDS.map((k) => [k, { level: def.skills[k] ?? 0, xp: 0 }]),
      );
      const r = awardEvent(cur as import('../systems/skills').SkillMap, event, { survivor: true });
      const levels = Object.fromEntries(SKILL_IDS.map((k) => [k, r.map[k]?.level ?? def.skills[k] ?? 0]));
      set({
        survivorSkills: { ...s.survivorSkills, [id]: r.map },
        survivors: s.survivors.map((x) => (x.id === id ? { ...x, skills: levels as typeof x.skills } : x)),
      });
      if (r.levelsGained > 0) {
        s.addToast(`${def.name}'s ${r.skill} rose to ${r.map[r.skill].level}.`);
      }
    },

    addJournal: (title, lines) => {
      const s = get();
      const atMin = s.daysElapsed * 1440 + s.timeMinutes;
      const entry: JournalEntry = {
        id: `j${Date.now().toString(36)}${(uidCounter++).toString(36)}`,
        atMin, title, lines,
      };
      set({ journal: [entry, ...s.journal].slice(0, 60) });
    },

    startDispatch: (survivorId, vehicleDefId, trailerDefId, task, destPoiId) => {
      const s = get();
      const sv = s.survivors.find((x) => x.id === survivorId);
      if (!sv) return;
      if (s.dispatches.some((d) => d.survivorId === survivorId)) {
        s.addToast(`${sv.name} is already out.`);
        return;
      }
      if (s.dispatches.some((d) => d.vehicleDefId === vehicleDefId)) {
        s.addToast('That vehicle is already out on a dispatch.');
        return;
      }
      if (trailerDefId && s.dispatches.some((d) => d.trailerDefId === trailerDefId)) {
        s.addToast('That trailer is already out on a dispatch.');
        return;
      }
      if (sv.hp < 30) {
        s.addToast(`${sv.name} is too hurt to send out (HP ${Math.round(sv.hp)}).`);
        return;
      }
      if (s.vehicle?.uid === vehicleDefId) {
        s.addToast('You are sitting in that one.');
        return;
      }
      const dest = s.poiPositions[destPoiId];
      if (!dest) {
        s.addToast('No route plotted there yet.');
        return;
      }
      const origin = (s.base && s.poiPositions[s.base.poiId]) || [s.pos[0], s.pos[2]];
      const distM = Math.round(Math.hypot(dest[0] - origin[0], dest[1] - origin[1]));
      const now = s.daysElapsed * 1440 + s.timeMinutes;
      const etaMin = now + dispatchDurationMin(distM, sv.skills.driver ?? 0, task);
      const d: Dispatch = {
        id: `d${Date.now().toString(36)}${(uidCounter++).toString(36)}`,
        survivorId, vehicleDefId, trailerDefId, task, destPoiId,
        departMin: now, etaMin, distM, status: 'out',
        // Lane 13: instance ids := def ids (one instance per def today);
        // fuel accounting (burn on dispatch) lands with their integration
        vehicleInstanceId: vehicleDefId,
        trailerInstanceId: trailerDefId,
        fuelLiters: 0,
      };
      set({ dispatches: [...s.dispatches, d] });
      const vehName = s.fleet.find((f) => f.defId === vehicleDefId)?.name ?? vehicleDefId;
      const taskName = task === 'scavenge' ? 'Scavenge' : task === 'scout' ? 'Scout' : 'Escort run';
      s.addJournal(`Dispatch — ${taskName} to ${poiName(destPoiId)}`, [
        `${sv.name} rolled out in the ${vehName}${trailerDefId ? ' with a trailer in tow' : ''}. ${distM} m each way.`,
      ]);
      s.addToast(`${sv.name} dispatched to ${poiName(destPoiId)}.`);
      sfx.play('quest', { volume: 0.5 });
    },

    recallDispatch: (id) => {
      const s = get();
      const d = s.dispatches.find((x) => x.id === id);
      if (!d) return;
      const sv = s.survivors.find((x) => x.id === d.survivorId);
      set({ dispatches: s.dispatches.filter((x) => x.id !== id) });
      s.addJournal(`Recalled — ${poiName(d.destPoiId)}`, [
        `${sv?.name ?? 'The crew'} turned around and came home early. Nothing to show for the fuel.`,
      ]);
      s.addToast(`${sv?.name ?? 'Crew'} recalled.`);
    },

    moveInvItem: (uid, gx, gy, rot) => {
      const s = get();
      set({ inventory: updateCarried(s.inventory, uid, (i) => ({ ...i, gx, gy, rot })) });
    },

    arrangeContainer: (dest, order) => {
      const s = get();
      const spec = specForDest(s.inventory, dest, s.perks);
      if (!spec) return;
      const items = listInDest(s.inventory, dest, s.equipped);
      const { placed } = arrangeGridItems(items, spec.cols, spec.rows, order);
      let inv = s.inventory;
      for (const it of items) {
        const p = placed.get(it.uid);
        inv = updateCarried(inv, it.uid, (i) => (p
          ? { ...i, gx: p.gx, gy: p.gy, rot: p.rot }
          : { ...i, gx: undefined, gy: undefined, rot: undefined }));
      }
      set({ inventory: inv });
      s.addToast(order === 'size' ? 'Arranged by size.' : 'Sorted by category.');
    },

    arrangeInventory: (order) => {
      const s = get();
      // the classic pack arrange now targets the worn backpack's grid
      if (!s.equipped.backpack) { s.addToast('No backpack to arrange.'); return; }
      s.arrangeContainer({ type: 'container', uid: s.equipped.backpack }, order);
    },

    moveStorageItem: (index, gx, gy, rot) => {
      const s = get();
      if (!s.storageOpen) return;
      const cur = s.storageItems[index];
      if (!cur) return;
      const eng = getGame();
      if (!eng) return;
      const err = eng.storageSetItem(s.storageOpen.kind, s.storageOpen.uid, index, { ...cur, gx, gy, rot });
      if (!err) {
        set({ storageItems: s.storageItems.map((it, i) => (i === index ? { ...it, gx, gy, rot } : it)) });
      }
    },

    openPhone: (tab) => {
      const s = get();
      // PHONE RULE (inventory v2, explicit): the deck follows the
      // ITEM. The phone UI opens only while the sat phone is carried
      // on your person — pockets, a worn grid, or nested in a carried
      // container. Drop it or trunk it and the deck is gone; the
      // phone-free inventory overlay always works.
      if (!hasPhoneCarried(s.inventory)) { s.addToast('Your sat phone isn’t on you.'); return; }
      if (s.battery <= 0) { s.addToast('Phone battery is dead.'); return; }
      set({ phoneOpen: true, phoneTab: tab ?? s.phoneTab });
    },
    closePhone: () => set({ phoneOpen: false }),
    setPhoneTab: (t) => set({ phoneTab: t }),
    drainBattery: (amount) => {
      const s = get();
      const battery = Math.max(0, s.battery - amount);
      set({ battery });
      if (battery <= 0 && s.phoneOpen) {
        set({ phoneOpen: false });
        s.addToast('Phone battery died.');
      }
    },
    chargeBattery: (amount) => {
      const s = get();
      set({ battery: Math.min(100, s.battery + amount) });
    },

    openBackpack: () => set({ backpackOpen: true }),
    closeBackpack: () => set({ backpackOpen: false, inventoryOpen: false }),
    openInventory: () => set({ inventoryOpen: true, backpackOpen: true }),
    closeInventory: () => set({ inventoryOpen: false, backpackOpen: false }),

    sortInventory: () => {
      const s = get();
      const inv = [...s.inventory].sort((a, b) => {
        const da = ITEMS[a.itemId];
        const db = ITEMS[b.itemId];
        const ca = da?.category ?? '';
        const cb = db?.category ?? '';
        if (ca !== cb) return ca < cb ? -1 : 1;
        return (da?.name ?? '') < (db?.name ?? '') ? -1 : 1;
      });
      set({ inventory: inv });
      s.addToast('Pack organized.');
    },

    craftRecipe: (recipeId) => {
      const recipe = FIELD_RECIPES[recipeId] ?? STATION_RECIPES[recipeId];
      if (!recipe) return;
      const s = get();
      // workstation gate: the recipe's station must be within reach
      if (recipe.station && s.nearStation !== recipe.station) {
        s.addToast(`Needs a ${STATION_LABEL[recipe.station]}.`);
        return;
      }
      // Order #5 gate unification: the instant path enforces the
      // recipe's declared skillReq through the SAME reader the queue
      // path and the phone's tree use — systems/skills.meetsSkillReq
      // over the store's skills map (previously this path ignored
      // skill gates entirely; see skills-audit.md).
      const req = recipe.skillReq as { skill: import('../data/skills').SkillId; level: number } | undefined;
      if (req && !meetsSkillReq(s, req)) {
        s.addToast(`Needs ${skillReqLabel(req)}.`);
        return;
      }
      for (const c of recipe.components) {
        if (s.countItem(c.itemId) < c.qty) {
          s.addToast(`Missing ${c.qty}× ${ITEMS[c.itemId]?.name ?? c.itemId}.`);
          return;
        }
      }
      // consume components (from the tail so partial stacks stay tidy)
      for (const c of recipe.components) {
        let left = c.qty;
        while (left > 0) {
          const it = [...walkCarried(s.inventory)].reverse().find((i) => i.itemId === c.itemId);
          if (!it) break;
          const take = Math.min(it.qty, left);
          s.removeItem(it.uid, take);
          left -= take;
        }
      }
      s.addItem(recipe.resultId, recipe.resultQty, true);
      set({ dayStats: { ...get().dayStats, crafts: get().dayStats.crafts + 1 } });
      s.addToast(`Crafted ${recipe.resultQty > 1 ? `${recipe.resultQty}× ` : ''}${ITEMS[recipe.resultId]?.name ?? recipe.resultId}.`);
      // Lane 8 station_craft_gated: recipes gated at skillReq level 3+
      // (Lane 6/7 data on the recipe) pay the higher station award
      const craftEv = (recipe.skillReq?.level ?? 0) >= 3 ? XP_EVENTS.station_craft_gated : XP_EVENTS.station_craft;
      s.addSkillXp(craftEv.skill, craftEv.xp);
      // Efficient Hands: one in five crafts comes back with a spare part
      if (s.perks.includes('me_efficient') && recipe.components.length > 0 && Math.random() < 0.2) {
        s.addItem(recipe.components[0].itemId, 1, true);
        s.addToast('Efficient hands — one component came back.');
      }
    },

    openSleep: () => set({ sleepOpen: true }),
    closeSleep: () => set({ sleepOpen: false }),
    setWellRested: (minutes) => set({ restedMinutesLeft: minutes }),

    stageContainerLoot: (containerId, items) =>
      set((s) => ({ lootStash: { ...s.lootStash, [containerId]: [...items] } })),
    openStagedLoot: (containerId) => set({ lootOpenId: containerId }),
    closeLoot: () => set({ lootOpenId: null }),
    takeLootIndex: (containerId, index) => {
      const s = get();
      const items = s.lootStash[containerId];
      const entry = items?.[index];
      if (!entry) return;
      if (!s.addItem(entry.itemId, entry.qty, true, { found: true })) {
        s.addToast('Pack full — no room for that.');
        return;
      }
      set({ dayStats: { ...get().dayStats, pickups: get().dayStats.pickups + entry.qty } });
      s.questEvent('collect', entry.itemId, entry.qty);
      const rest = items.filter((_, i) => i !== index);
      if (rest.length === 0) {
        const stash = { ...s.lootStash };
        delete stash[containerId];
        set({ lootStash: stash, lootOpenId: null });
        getGame()?.completeContainerLoot(containerId);
      } else {
        set({ lootStash: { ...s.lootStash, [containerId]: rest } });
      }
    },
    takeAllLoot: (containerId) => {
      let guard = 0;
      while ((get().lootStash[containerId]?.length ?? 0) > 0 && guard++ < 40) {
        const before = get().lootStash[containerId].length;
        get().takeLootIndex(containerId, 0);
        if ((get().lootStash[containerId]?.length ?? 0) === before) break; // pack full
      }
    },

    addToast: (text) => {
      const id = toastCounter++;
      set({ toasts: [...get().toasts.slice(-4), { id, text }] });
      setTimeout(() => get().dismissToast(id), 4200);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    setPoiPositions: (map) => set({ poiPositions: map }),

    die: (cause) => {
      const s = get();
      if (s.dead) return;
      if (DIFFICULTIES[s.difficulty].permadeath) {
        void deleteSaveSlot('auto');
      }
      set({ dead: true, deathCause: cause, dialogue: null, phoneOpen: false });
    },

    respawn: () => {
      const s = get();
      set({ dead: false, deathCause: null, hp: Math.ceil(s.maxHp * 0.5), stamina: s.maxStamina });
      getGame()?.respawnAtSafePoint();
    },

    triggerEnding: (choice) => {
      set({ endingChoice: choice, dialogue: null, phoneOpen: false, interactPrompt: null });
      void getGame()?.playEndingCutscene();
    },
    setCutsceneLine: (i) => set({ cutsceneLine: i }),

    saveToSlot: async (slot) => {
      const s = get();
      const eng = getGame();
      // Lane 7 bridge: their live job array wins over the mirror; either
      // way the mirror is refreshed so state readers see the truth.
      const craftJobs = craftQueueBridge.read ? craftQueueBridge.read() : s.craftQueue;
      if (craftJobs !== s.craftQueue) set({ craftQueue: [...craftJobs] });
      const snapshot: SaveSnapshot = {
        version: 3,
        savedAt: Date.now(),
        difficulty: s.difficulty,
        seed: s.seed,
        timeMinutes: s.timeMinutes,
        playSeconds: s.playSeconds,
        player: eng ? eng.getPlayerSnapshot() : { pos: s.pos, hp: s.hp },
        inventory: s.inventory,
        equipped: s.equipped,
        hotbar: s.hotbar,
        quests: s.quests,
        doneQuests: s.doneQuests,
        flags: s.flags,
        rep: s.rep,
        battery: s.battery,
        phoneUnlocked: s.phoneUnlocked,
        world: eng ? eng.getWorldDiff() : { looted: [], deadHusks: [], cleared: [] },
        daysElapsed: s.daysElapsed,
        skills: s.skills,
        perkPoints: s.perkPoints,
        perks: s.perks,
        secondWindDay: s.secondWindDay ?? -1,
        survivors: s.survivors,
        base: s.base,
        vehicles: eng ? eng.getVehicleStates() : [],
        trailers: eng ? eng.getTrailerStates() : [],
        dispatches: s.dispatches,
        journal: s.journal,
        scouted: s.scouted,
        baseQueue: s.baseQueue,
        appearance: s.appearance,
        craftQueue: [...craftJobs],
        storyChoices: s.storyChoices,
        baseExt: s.baseExt,
        claims: s.claims,
        moraleRuntime: s.moraleRuntime,
        beaconChoice: s.beaconChoice,
        survivorRuntime: s.survivorRuntime,
        survivorSkills: s.survivorSkills,
      };
      try {
        await saveGameToSlot(slot, snapshot);
        await get().refreshSlots();
        if (slot !== 'auto') get().addToast(`Saved to slot ${slot}.`);
        return true;
      } catch {
        get().addToast('Save failed.');
        return false;
      }
    },

    loadFromSlot: async (slot) => {
      const snap = await loadGameFromSlot(slot);
      const s = get();
      if (!snap) { s.addToast('No save in that slot.'); return false; }
      if (snap.version > 3) { s.addToast('Save is from a newer version.'); return false; }
      const cleanBase = sanitizeBase(snap.base);
      // inventory v2 load migration (Ian 2026-10-21): unify the
      // equipped record onto weapon slots + worn garments, land the
      // legacy flat pack inside the backpack container, and grant the
      // sat phone (into pockets) when the save predates carrying one.
      const migratedEq = migrateEquipped(snap.equipped, snap.inventory);
      const norm = normalizeCarried(snap.inventory, migratedEq, newUid);
      set({
        screen: 'game',
        difficulty: snap.difficulty,
        seed: snap.seed,
        paused: false,
        hp: snap.player.hp, stamina: 100,
        pos: snap.player.pos,
        timeMinutes: snap.timeMinutes,
        playSeconds: snap.playSeconds,
        inventory: norm.inventory,
        equipped: syncWeaponProjections(norm.equipped, norm.inventory),
        // wave 3: quick-use row is 4 slots; older saves carry 3 — pad
        hotbar: [...snap.hotbar, null, null, null, null].slice(0, 4),
        quests: snap.quests,
        doneQuests: snap.doneQuests,
        flags: snap.flags,
        // Lane 9 (F1/F2): fold onto the canon roster — legacy folded
        // factions (pier/refuge/hollow) land in their absorbing faction
        // and missing canon factions take their STARTING_REP values.
        rep: foldLegacyRep(snap.rep),
        phoneOpen: false, phoneTab: 'home', phoneUnlocked: snap.phoneUnlocked || norm.phoneGranted, battery: snap.battery,
        dialogue: null, interactPrompt: null,
        dead: false, deathCause: null, endingChoice: null, cutsceneLine: 0,
        nearby: [],
        daysElapsed: snap.daysElapsed,
        skills: snap.skills as GameState['skills'],
        perkPoints: snap.perkPoints,
        perks: snap.perks,
        secondWindDay: snap.secondWindDay ?? -1,
        survivors: snap.survivors,
        base: cleanBase,
        // wave 3 fields: absent on older v3 saves — default them here.
        // Lane 13: legacy dispatch entries predate instance ids + fuel —
        // default per entry (instance := def, fuel := 0 unaccounted).
        dispatches: (snap.dispatches ?? []).map((d) => ({
          ...d,
          vehicleInstanceId: d.vehicleInstanceId ?? d.vehicleDefId,
          trailerInstanceId: d.trailerInstanceId ?? d.trailerDefId,
          fuelLiters: d.fuelLiters ?? 0,
        })),
        journal: snap.journal ?? [],
        scouted: snap.scouted ?? {},
        baseQueue: snap.baseQueue ?? [],
        // wave 4: appearance — absent on older v3 saves, keep the current look
        appearance: snap.appearance ?? get().appearance,
        appearanceCustomized: snap.appearance !== undefined,
        // parallel cycle: field-contract state — absent on older v3 saves
        craftQueue: snap.craftQueue ?? [],
        storyChoices: snap.storyChoices ?? {},
        baseExt: snap.baseExt ?? {},
        // Lane 10: claims absent on legacy saves — migrate the old
        // single base into a home BaseInstance (name-mapped facilities).
        claims: snap.claims ?? claimsFromLegacyBase(cleanBase),
        moraleRuntime: snap.moraleRuntime ?? { idleDays: {}, breakingDays: {} },
        // ORDER #6: absent on older v3 saves — everyone defaults to
        // following, fed and rested, unarmed (defaultSurvivorRuntime
        // is applied lazily wherever a record is read).
        survivorRuntime: snap.survivorRuntime ?? {},
        survivorSkills: snap.survivorSkills ?? {},
        // Lane 9 (F3): derive the beacon state from the flags when the
        // save predates the explicit field.
        beaconChoice: snap.beaconChoice
          ?? (snap.flags.beacon_lit ? 'light' : snap.flags.beacon_dark ? 'dark' : null),
        dayStats: { kills: 0, crafts: 0, pickups: 0 },
        pendingSnapshot: snap,
      });
      // Lane 7 bridge: rehydrate their queue store with the loaded jobs
      craftQueueBridge.write?.(snap.craftQueue ?? []);
      return true;
    },

    deleteSlot: async (slot) => {
      await deleteSaveSlot(slot);
      await get().refreshSlots();
    },

    refreshSlots: async () => {
      const slots = await listSaveSlots();
      set({ saveSlots: slots });
    },

    autosave: async () => {
      const s = get();
      if (s.screen !== 'game' || s.dead) return;
      await s.saveToSlot('auto');
    },
  };

  return api;
});

// Push the persisted audio settings into the engine once, at load —
// before any UI interaction can play a sound.
{
  const s = useGameStore.getState();
  sfx.setMuted(s.audioMuted);
  sfx.setVolume(s.audioVolume);
}

// Re-export for engine convenience
export type { QuestStepType };
