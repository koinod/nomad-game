import { create } from 'zustand';
import { ITEMS, FIELD_RECIPES, STATION_RECIPES, STATION_LABEL } from '../data/items';
import { PERKS as PERKS_ALL } from '../data/skills';
import { MODS as MODS_ALL, magSizeOf } from '../data/mods';
import { FACILITIES as FACILITY_DEFS } from '../data/base';
import { TRAITS as TRAIT_DEFS } from '../data/survivors';
import { QUESTS } from '../data/quests';
import { DIFFICULTIES } from './types';
import type {
  DifficultyId, Equipped, InvItem, PhoneTab, QuestProgress, QuestStepType,
  SaveMeta, SaveSnapshot, Screen, ToastMsg,
} from './types';
import {
  carryLimitKg, encumbranceTier, slotLimit, totalWeightKg, usedSlots,
} from './inventoryUtils';
import { deleteSaveSlot, listSaveSlots, loadGameFromSlot, saveGameToSlot } from '../systems/save';
import { sfx } from '../systems/audio';
import { getGame } from '../game/instance';
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
  // sleep dialog (Skyrim-style rest at campfires)
  sleepOpen: boolean;
  restedMinutesLeft: number; // well-rested buff countdown (game minutes)

  // dialogue / interaction
  dialogue: DialogueState | null;
  interactPrompt: string | null;

  // crosshair feedback
  meleeTarget: boolean;
  hitmark: { kind: 'hit' | 'kill'; at: number } | null;
  setMeleeTarget: (b: boolean) => void;
  setHitmark: (kind: 'hit' | 'kill') => void;

  // crafting stations: which workstation the player is standing at (if any)
  nearStation: import('../data/items').StationId | null;
  setNearStation: (s: import('../data/items').StationId | null) => void;

  // noise: loudest recent noise radius at the player (0–100, decays). HUD meter.
  noiseLevel: number;
  setNoiseLevel: (n: number) => void;

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
  vehicle: { name: string; speedKmh: number; fuelPct: number; condPct: number } | null;
  setVehicle: (v: { name: string; speedKmh: number; fuelPct: number; condPct: number } | null) => void;
  healPlayer: (amount: number) => void;
  advanceTime: (minutes: number) => void;

  addItem: (itemId: string, qty: number, quiet?: boolean) => boolean;
  removeItem: (uid: string, qty: number) => boolean;
  countItem: (itemId: string) => number;
  equipUid: (uid: string) => void;
  setLoaded: (uid: string, n: number) => void;
  attachMod: (weaponUid: string, modUid: string) => void;
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

export const useGameStore = create<GameState>()((set, get) => {
  const api: GameState = {
    screen: 'title',
    difficulty: 'survivor',
    bodyType: (typeof localStorage !== 'undefined' && localStorage.getItem('nomad-body') === 'female'
      ? 'female'
      : 'male') as 'male' | 'female',
    setBodyType: (b) => {
      set({ bodyType: b });
      try { localStorage.setItem('nomad-body', b); } catch { /* private mode */ }
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
    hotbar: [null, null, null],

    quests: [],
    doneQuests: [],
    flags: {},
    rep: { lighthouse: 0, pier: 0 },

    phoneOpen: false,
    phoneTab: 'loadout',
    phoneUnlocked: false,
    battery: 100,

    backpackOpen: false,
    sleepOpen: false,
    restedMinutesLeft: 0,
    lootOpenId: null,
    lootStash: {},

    dialogue: null,
    interactPrompt: null,

    noiseLevel: 0,
    search: null,

    meleeTarget: false,
    hitmark: null,
    nearStation: null,

    poiPositions: {},

    toasts: [],
    dead: false,
    deathCause: null,
    endingChoice: null,
    cutsceneLine: 0,
    pendingSnapshot: null,
    saveSlots: [],

    setScreen: (s) => set({ screen: s, paused: false, dialogue: null, phoneOpen: false, backpackOpen: false, sleepOpen: false, lootOpenId: null, lootStash: {} }),
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
        inventory: [], equipped: { ...initialEquipped }, hotbar: [null, null, null],
        quests: [{ id: 'q_prologue', stepIndex: 0, progress: 0 }],
        doneQuests: [],
        flags: {},
        rep: { lighthouse: 0, pier: 0 },
        phoneOpen: false, phoneTab: 'loadout', phoneUnlocked: false, battery: 100,
        backpackOpen: false, sleepOpen: false, restedMinutesLeft: 0, lootOpenId: null, lootStash: {},
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
      });
    },

    syncPlayer: (pos, hp, stamina) => set({ pos, hp: Math.max(0, hp), stamina }),

    vehicle: null,
    setVehicle: (v) => set({ vehicle: v }),

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
    },

    advanceDay: () => set((s) => ({ daysElapsed: s.daysElapsed + 1 })),

    addItem: (itemId, qty, quiet) => {
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
        inv.push({ uid: newUid(), itemId, qty: take });
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
      set(patch);
      get().checkQuestStarts();
    },

    addRep: (faction, amount) => {
      const s = get();
      const next = (s.rep[faction] ?? 0) + amount;
      set({ rep: { ...s.rep, [faction]: next } });
      s.addToast(`${faction === 'lighthouse' ? 'Lighthouse Collective' : faction} rep ${amount >= 0 ? '+' : ''}${amount} (${next})`);
    },

    questEvent: (type, target, count = 1) => {
      const s = get();
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
      const s = get();
      const cur = s.skills[skill];
      if (!cur || cur.level >= 10) return;
      let { level, xp } = cur;
      xp += amt;
      let gained = 0;
      while (level < 10 && xp >= 80 + 40 * level) {
        xp -= 80 + 40 * level;
        level++;
        gained++;
      }
      if (level >= 10) xp = 0;
      set({
        skills: { ...s.skills, [skill]: { level, xp } },
        perkPoints: s.perkPoints + gained,
      });
      if (gained > 0) {
        const label = skill[0].toUpperCase() + skill.slice(1);
        get().addToast(`${label} level ${level} — +${gained} perk point${gained > 1 ? 's' : ''}.`);
        sfx.play('quest', { volume: 0.5 });
      }
    },
    buyPerk: (perkId) => {
      const s = get();
      const def = PERKS_ALL.find((p) => p.id === perkId);
      if (!def || s.perks.includes(perkId)) return;
      if (s.perkPoints < 1) {
        s.addToast('No perk points — earn skill levels first.');
        return;
      }
      const tree = PERKS_ALL.filter((p) => p.tree === def.tree && s.perks.includes(p.id));
      if (def.tier === 4) {
        if (tree.length < 4) {
          s.addToast('A capstone needs 4 perks in its tree first.');
          return;
        }
        if (PERKS_ALL.some((p) => p.tier === 4 && s.perks.includes(p.id))) {
          s.addToast('One capstone per run — this is who you are now.');
          return;
        }
      } else if (def.tier > 1 && !tree.some((p) => p.tier === def.tier - 1)) {
        s.addToast(`Learn a tier ${def.tier - 1} perk in this tree first.`);
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
      if (s.base) {
        s.addToast('You already hold a home base. (Relocating comes later.)');
        return;
      }
      set({ base: { poiId, facilities: ['command_post'] } });
      s.setFlag('base_claimed');
      s.addToast('Base claimed. Build it up from the sat phone → Command.');
      s.addSkillXp('leadership', 10);
      sfx.play('quest', { volume: 0.6 });
    },
    buildFacility: (facilityId) => {
      const s = get();
      const b = s.base;
      if (!b) return;
      const def = FACILITY_DEFS.find((f) => f.id === facilityId);
      if (!def || b.facilities.includes(facilityId)) return;
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
      set({ base: { ...b, facilities: [...b.facilities, facilityId] } });
      s.addToast(`Built: ${def.name}.`);
      s.addSkillXp('leadership', 2);
      sfx.play('craft', { volume: 0.5 });
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
    closeBackpack: () => set({ backpackOpen: false }),

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
      s.addToast(`Crafted ${recipe.resultQty > 1 ? `${recipe.resultQty}× ` : ''}${ITEMS[recipe.resultId]?.name ?? recipe.resultId}.`);
      s.addSkillXp('mechanics', 6);
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
      if (!s.addItem(entry.itemId, entry.qty, true)) {
        s.addToast('Pack full — no room for that.');
        return;
      }
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
      const snapshot: SaveSnapshot = {
        version: 2,
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
      if (snap.version > 2) { s.addToast('Save is from a newer version.'); return false; }
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
        hotbar: snap.hotbar,
        quests: snap.quests,
        doneQuests: snap.doneQuests,
        flags: snap.flags,
        rep: snap.rep,
        phoneOpen: false, phoneTab: 'loadout', phoneUnlocked: snap.phoneUnlocked, battery: snap.battery,
        dialogue: null, interactPrompt: null,
        dead: false, deathCause: null, endingChoice: null, cutsceneLine: 0,
        daysElapsed: snap.daysElapsed,
        skills: snap.skills as GameState['skills'],
        perkPoints: snap.perkPoints,
        perks: snap.perks,
        survivors: snap.survivors,
        base: snap.base,
        pendingSnapshot: snap,
      });
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
