import { create } from 'zustand';
import { ITEMS, FIELD_RECIPES, STATION_RECIPES, STATION_LABEL } from '../data/items';
import { PERKS as PERKS_ALL } from '../data/skills';
import { FINISHES, MODS as MODS_ALL, magSizeOf } from '../data/mods';
import { UPGRADES as UPGRADE_DEFS } from '../data/upgrades';
import { FACILITIES as FACILITY_DEFS, baseHeat, buildMinutes } from '../data/base';
import { dispatchDurationMin, poiName, resolveDispatch } from '../data/dispatch';
import { TRAITS as TRAIT_DEFS } from '../data/survivors';
import { QUESTS } from '../data/quests';
import { FACTIONS, STARTING_REP, LEGACY_REP_ALIAS } from '../data/factions';
import { DEFAULT_APPEARANCE, DIFFICULTIES } from './types';
import type {
  Appearance, DifficultyId, Equipped, FleetEntry, InvItem, PhoneTab, QuestProgress, QuestStepType,
  SaveMeta, SaveSnapshot, Screen, ToastMsg, TrailerFleetEntry,
  Dispatch, JournalEntry, ScoutReport, BaseBuildOrder, CraftJob, BaseExt,
  ClaimsState, MoraleRuntime, BaseInstance,
} from './types';
import {
  carryLimitKg, encumbranceTier, slotLimit, totalWeightKg, usedSlots,
} from './inventoryUtils';
import { arrangeItems as arrangeGridItems, packGridDims } from './gridUtils';
import { applyXp, canBuyPerk, XP_EVENTS } from '../systems/skills';
import { deleteSaveSlot, listSaveSlots, loadGameFromSlot, saveGameToSlot } from '../systems/save';
import { sfx } from '../systems/audio';
import { getGame } from '../game/instance';
import { sanitizeBase } from '../game/saveMigration';
import { input } from '../game/input';

let uidCounter = 1;
const newUid = () => `i${Date.now().toString(36)}${(uidCounter++).toString(36)}`;
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
  addSkillXp: (skill: import('../data/skills').SkillId, amt: number) => void;
  buyPerk: (perkId: string) => void;
  hasPerk: (perkId: string) => boolean;

  // survivors (SYSTEMS_SPEC §5)
  survivors: import('../data/survivors').SurvivorDef[];
  recruitSurvivor: (def: import('../data/survivors').SurvivorDef) => void;
  assignJob: (id: string, job: import('../data/survivors').SurvivorJob) => void;
  moraleTick: () => void;

  // base management (BASE_DESIGN)
  base: { poiId: string; facilities: string[] } | null;
  claimBase: (poiId: string) => void;
  buildFacility: (facilityId: string) => void;
  baseTick: () => void;

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
  moveStorageItem: (index: number, gx: number, gy: number, rot: boolean) => void;

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

  syncPlayer: (pos: [number, number, number], hp: number, stamina: number) => void;
  damagePlayer: (amount: number, cause: string) => void;
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
  unequipSlot: (slot: keyof Equipped) => void;
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

const initialEquipped: Equipped = { melee: null, ranged: null, pack: null };

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
    weatherNow: { state: 'clear', wetPct: 0 },
    setWeatherNow: (weatherNow) => set({ weatherNow }),

    poiPositions: {},

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
        inventory: [], equipped: { ...initialEquipped }, hotbar: [null, null, null, null],
        quests: [{ id: 'q_prologue', stepIndex: 0, progress: 0 }],
        doneQuests: [],
        flags: {},
        rep: { ...STARTING_REP },
        phoneOpen: false, phoneTab: 'home', phoneUnlocked: false, battery: 100,
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
        survivors: [],
        base: null,
        dispatches: [], journal: [], scouted: {}, baseQueue: [],
        craftQueue: [], storyChoices: {}, baseExt: {},
        claims: { home: null, outposts: [] },
        moraleRuntime: { idleDays: {}, breakingDays: {} },
        beaconChoice: null,
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
      const inv = s.inventory.find((i) => i.uid === invUid);
      if (!inv) return;
      // never store something you're wearing/holding — it would strand the slot
      if (invUid === s.equipped.melee || invUid === s.equipped.ranged || invUid === s.equipped.pack
        || s.hotbar.includes(invUid)) {
        s.addToast('Unequip it first.');
        return;
      }
      const err = eng.storagePutItem(s.storageOpen.kind, s.storageOpen.uid, { uid: inv.uid, itemId: inv.itemId, qty: inv.qty });
      if (err) { s.addToast(err); return; }
      s.removeItem(invUid, inv.qty);
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
      const limit = carryLimitKg(s.equipped, s.inventory, s.difficulty, s.perks.includes('sc_packmule') ? 8 : 0);
      if (encumbranceTier(totalWeightKg(s.inventory) + def.weight * peek.qty, limit) === 'immobile') {
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
      const cost: { itemId: string; qty: number } =
        kind === 'tire' ? { itemId: 'tire', qty: 1 }
        : kind === 'engine' ? { itemId: 'engine_part', qty: 1 }
        : kind === 'battery' ? { itemId: 'car_battery', qty: 1 }
        : { itemId: 'scrap', qty: atGarage ? 1 : 2 };
      if (kind === 'tire' && row.tiresFlat <= 0) { s.addToast('No flat tires on it.'); return; }
      if (kind !== 'tire' && row.condPct >= 99) { s.addToast('It\u2019s already in fine shape.'); return; }
      if (s.countItem(cost.itemId) < cost.qty) {
        s.addToast(`Needs ${cost.qty}× ${ITEMS[cost.itemId]?.name ?? cost.itemId}.`);
        return;
      }
      const it = s.inventory.find((i) => i.itemId === cost.itemId);
      if (!it || !s.removeItem(it.uid, cost.qty)) return;
      const condBefore = row.condPct;
      const msg = eng.applyRepair(uid, kind);
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
        const it = s.inventory.find((i) => i.itemId === c.itemId);
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

    damagePlayer: (amount, cause) => {
      const s = get();
      if (s.dead || s.screen !== 'game') return;
      const mult = DIFFICULTIES[s.difficulty].playerDamageTaken;
      let dealt = amount * mult;
      // inside a vehicle: the steel takes most of it
      if (cause === 'husk' && s.vehicle) {
        dealt *= 0.3;
      }
      // blocking with a melee weapon out: 75% reduction on husk hits
      if (cause === 'husk' && input.blocking) {
        dealt *= 0.25;
      }
      // armor carried in the pack still protects (plates in a vest you own)
      if (cause === 'husk' || cause === 'explosion') {
        let prot = 0;
        for (const it of s.inventory) {
          const def = ITEMS[it.itemId];
          if (def?.armor) prot += def.armor * it.qty;
        }
        if (s.perks.includes('br_thickskin')) prot += 0.05;
        dealt *= Math.max(0.5, 1 - Math.min(prot, 0.5));
      }
      const hp = Math.max(0, s.hp - dealt);
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
    },

    addItem: (itemId, qty, quiet, opts) => {
      const def = ITEMS[itemId];
      if (!def) return false;
      const s = get();
      // weight gate: >160% of limit blocks pickup
      const addedW = def.weight * qty;
      const limit = carryLimitKg(s.equipped, s.inventory, s.difficulty, s.perks.includes('sc_packmule') ? 8 : 0);
      if (encumbranceTier(totalWeightKg(s.inventory) + addedW, limit) === 'immobile') {
        if (!quiet) s.addToast('Too heavy — drop something first.');
        return false;
      }
      const inv = s.inventory.map((i) => ({ ...i }));
      let remaining = qty;
      for (const it of inv) {
        if (it.itemId === itemId && remaining > 0) {
          const space = def.stack - it.qty;
          const take = Math.min(space, remaining);
          it.qty += take;
          remaining -= take;
        }
      }
      while (remaining > 0) {
        if (usedSlots(inv) + def.slots > slotLimit(s.equipped, inv, s.perks.includes('sc_pockets') ? 4 : 0)) {
          if (!quiet) s.addToast('No pack space left.');
          break;
        }
        const take = Math.min(def.stack, remaining);
        const fresh: InvItem = { uid: newUid(), itemId, qty: take };
        // a weapon found in the world has lived a life: condition 35–85.
        // Crafted and granted weapons arrive pristine (no opts.found).
        if (opts?.found && (def.category === 'weapon-ranged' || def.category === 'weapon-melee')) {
          fresh.condition = 35 + Math.floor(Math.random() * 51);
        }
        inv.push(fresh);
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
      const inv = s.inventory.map((i) => ({ ...i }));
      const idx = inv.findIndex((i) => i.uid === uid);
      if (idx < 0) return false;
      inv[idx].qty -= qty;
      if (inv[idx].qty <= 0) inv.splice(idx, 1);
      // clear dangling references
      const gone = (u: string | null) => (u === uid && !inv.some((i) => i.uid === uid) ? null : u);
      set({
        inventory: inv,
        equipped: {
          melee: gone(s.equipped.melee), ranged: gone(s.equipped.ranged), pack: gone(s.equipped.pack),
        },
        hotbar: s.hotbar.map((h) => gone(h)),
      });
      return true;
    },

    countItem: (itemId) => {
      const s = get();
      return s.inventory.filter((i) => i.itemId === itemId).reduce((a, i) => a + i.qty, 0);
    },

    equipUid: (uid) => {
      const s = get();
      const it = s.inventory.find((i) => i.uid === uid);
      const def = it ? ITEMS[it.itemId] : undefined;
      if (!it || !def) return;
      const slot: keyof Equipped | null =
        def.category === 'weapon-melee' ? 'melee'
        : def.category === 'weapon-ranged' ? 'ranged'
        : def.category === 'pack' ? 'pack' : null;
      if (!slot) { s.addToast(`${def.name} can't be equipped.`); return; }
      // a freshly equipped gun starts with a full magazine
      if (slot === 'ranged' && def.magSize != null && it.loaded === undefined) {
        set({
          inventory: s.inventory.map((i) =>
            i.uid === uid ? { ...i, loaded: magSizeOf(def.magSize!, i.mods ?? []) } : i,
          ),
        });
      }
      set({ equipped: { ...get().equipped, [slot]: uid } });
      s.addToast(`Equipped ${def.name}.`);
    },

    setLoaded: (uid, n) => {
      const s = get();
      set({ inventory: s.inventory.map((i) => (i.uid === uid ? { ...i, loaded: n } : i)) });
    },

    setCondition: (uid, n) => {
      const s = get();
      const v = Math.round(Math.max(0, Math.min(100, n)) * 100) / 100;
      set({ inventory: s.inventory.map((i) => (i.uid === uid ? { ...i, condition: v } : i)) });
    },

    setJammed: (uid, b) => {
      const s = get();
      set({ inventory: s.inventory.map((i) => (i.uid === uid ? { ...i, jammed: b } : i)) });
    },

    /** Bench repair: gun_parts (ranged) or scrap (melee), 1 per 40 missing. */
    repairWeapon: (uid) => {
      const s = get();
      if (s.nearStation !== 'workbench') {
        s.addToast('Repairs happen at a Weapons Bench.');
        return;
      }
      const w = s.inventory.find((i) => i.uid === uid);
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
        const stack = get().inventory.find((i) => i.itemId === costId && i.qty > 0);
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
      const w = s.inventory.find((i) => i.uid === uid);
      const def = w ? ITEMS[w.itemId] : undefined;
      if (!w || !def?.disassembly) return;
      // an equipped piece comes off the body first
      if (s.equipped.melee === uid) s.unequipSlot('melee');
      if (s.equipped.ranged === uid) s.unequipSlot('ranged');
      // attached mods and loaded rounds come back off before the strip
      for (const modId of w.mods ?? []) get().addItem(modId, 1, true);
      if ((w.loaded ?? 0) > 0 && def.ammoId) get().addItem(def.ammoId, w.loaded!, true);
      get().removeItem(uid, 1);
      const got: string[] = [];
      for (const y of def.disassembly) {
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
      const w = s.inventory.find((i) => i.uid === weaponUid);
      const m = s.inventory.find((i) => i.uid === modUid);
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
      let cost = mdef.gunPartsCost;
      if (s.perks.includes('me_gunsmith')) cost = Math.max(1, Math.ceil(cost * 0.5));
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
        inventory: get().inventory.map((i) =>
          i.uid === weaponUid ? { ...i, mods: [...(i.mods ?? []), m.itemId] } : i,
        ),
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
      const w = s.inventory.find((i) => i.uid === weaponUid);
      if (!w?.mods?.includes(modId)) return;
      set({
        inventory: s.inventory.map((i) =>
          i.uid === weaponUid ? { ...i, mods: (i.mods ?? []).filter((x) => x !== modId) } : i,
        ),
      });
      s.addItem(modId, 1, true);
      s.addToast(`Removed the ${MODS_ALL[modId]?.name ?? modId}.`);
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
      const w = s.inventory.find((i) => i.uid === weaponUid);
      const kit = s.inventory.find((i) => i.uid === finishUid);
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
        inventory: get().inventory.map((i) =>
          i.uid === weaponUid ? { ...i, finish: fdef.id } : i,
        ),
      });
      s.addToast(`Refinished the ${wdef.name}: ${fdef.name}.`);
      s.addSkillXp('mechanics', 3);
      sfx.play('craft', { volume: 0.5 });
    },

    unequipSlot: (slot) => {
      const s = get();
      set({ equipped: { ...s.equipped, [slot]: null } });
    },

    useItemUid: (uid) => {
      const s = get();
      const it = s.inventory.find((i) => i.uid === uid);
      const def = it ? ITEMS[it.itemId] : undefined;
      if (!it || !def) return;
      if ((def.category === 'food' || def.category === 'medical') && def.heal) {
        if (s.hp >= s.maxHp) { s.addToast('Already at full health.'); return; }
        s.healPlayer(def.heal);
        s.removeItem(uid, 1);
        s.addToast(`Used ${def.name} (+${def.heal} HP).`);
        if (def.category === 'medical') s.addSkillXp('medicine', 4);
      } else if (it.itemId === 'cleaning_kit' || it.itemId === 'gun_oil') {
        // field weapon care, applied to the gun in hand (else the melee)
        const targetUid = s.equipped.ranged ?? s.equipped.melee;
        const target = targetUid ? s.inventory.find((i) => i.uid === targetUid) : undefined;
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
      } else if (def.category === 'weapon-melee' || def.category === 'weapon-ranged' || def.category === 'pack') {
        s.equipUid(uid);
      } else {
        s.addToast(`${def.name}: no use action here.`);
      }
    },

    dropUid: (uid) => {
      const s = get();
      const it = s.inventory.find((i) => i.uid === uid);
      if (!it) return;
      s.removeItem(uid, it.qty);
      s.addToast(`Dropped ${ITEMS[it.itemId]?.name ?? 'item'}.`);
    },

    assignHotbar: (index, uid) => {
      const s = get();
      const hb = [...s.hotbar];
      hb[index] = uid;
      set({ hotbar: hb });
    },

    useHotbar: (index) => {
      const s = get();
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
        const it = s.inventory.find((i) => i.itemId === id);
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
    moraleRuntime: { idleDays: {}, breakingDays: {} },
    beaconChoice: null,
    setClaims: (claims) => set({ claims }),
    setMoraleRuntime: (moraleRuntime) => set({ moraleRuntime }),
    setBeaconChoice: (beaconChoice) => set({ beaconChoice }),

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
      set({
        inventory: s.inventory.map((i) => (i.uid === uid ? { ...i, gx, gy, rot } : i)),
      });
    },

    arrangeInventory: (order) => {
      const s = get();
      const packItem = s.inventory.find((i) => i.uid === s.equipped.pack);
      const dims = packGridDims(packItem?.itemId);
      const { placed } = arrangeGridItems(s.inventory, dims.cols, dims.rows, order);
      set({
        inventory: s.inventory.map((i) => {
          const p = placed.get(i.uid);
          return p ? { ...i, gx: p.gx, gy: p.gy, rot: p.rot } : { ...i, gx: undefined, gy: undefined, rot: undefined };
        }),
      });
      s.addToast(order === 'size' ? 'Pack arranged by size.' : 'Pack sorted by category.');
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
      if (!s.phoneUnlocked) { s.addToast('You don’t have a phone yet.'); return; }
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
          const it = [...s.inventory].reverse().find((i) => i.itemId === c.itemId);
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
      set({
        screen: 'game',
        difficulty: snap.difficulty,
        seed: snap.seed,
        paused: false,
        hp: snap.player.hp, stamina: 100,
        pos: snap.player.pos,
        timeMinutes: snap.timeMinutes,
        playSeconds: snap.playSeconds,
        inventory: snap.inventory,
        equipped: snap.equipped,
        // wave 3: quick-use row is 4 slots; older saves carry 3 — pad
        hotbar: [...snap.hotbar, null, null, null, null].slice(0, 4),
        quests: snap.quests,
        doneQuests: snap.doneQuests,
        flags: snap.flags,
        // Lane 9 (F1/F2): fold onto the canon roster — legacy folded
        // factions (pier/refuge/hollow) land in their absorbing faction
        // and missing canon factions take their STARTING_REP values.
        rep: foldLegacyRep(snap.rep),
        phoneOpen: false, phoneTab: 'home', phoneUnlocked: snap.phoneUnlocked, battery: snap.battery,
        dialogue: null, interactPrompt: null,
        dead: false, deathCause: null, endingChoice: null, cutsceneLine: 0,
        daysElapsed: snap.daysElapsed,
        skills: snap.skills as GameState['skills'],
        perkPoints: snap.perkPoints,
        perks: snap.perks,
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

// Re-export for engine convenience
export type { QuestStepType };
