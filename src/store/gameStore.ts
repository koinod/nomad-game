import { create } from 'zustand';
import { ITEMS, FIELD_RECIPES } from '../data/items';
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
  seed: number;
  paused: boolean;

  // player vitals (mirrored from engine at ~10Hz)
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  pos: [number, number, number];
  timeMinutes: number; // world clock, 0..1440
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
  healPlayer: (amount: number) => void;
  advanceTime: (minutes: number) => void;

  addItem: (itemId: string, qty: number, quiet?: boolean) => boolean;
  removeItem: (uid: string, qty: number) => boolean;
  countItem: (itemId: string) => number;
  equipUid: (uid: string) => void;
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
    seed: 1337,
    paused: false,

    hp: 100, maxHp: 100, stamina: 100, maxStamina: 100,
    pos: [0, 0, 0],
    timeMinutes: 480, // 08:00
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

    meleeTarget: false,
    hitmark: null,

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
      });
    },

    syncPlayer: (pos, hp, stamina) => set({ pos, hp: Math.max(0, hp), stamina }),

    damagePlayer: (amount, cause) => {
      const s = get();
      if (s.dead || s.screen !== 'game') return;
      const mult = DIFFICULTIES[s.difficulty].playerDamageTaken;
      let dealt = amount * mult;
      // blocking with a melee weapon out: 75% reduction on husk hits
      if (cause === 'husk' && input.blocking) {
        dealt *= 0.25;
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

    addItem: (itemId, qty, quiet) => {
      const def = ITEMS[itemId];
      if (!def) return false;
      const s = get();
      // weight gate: >160% of limit blocks pickup
      const addedW = def.weight * qty;
      const limit = carryLimitKg(s.equipped, s.inventory, s.difficulty);
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
        if (usedSlots(inv) + def.slots > slotLimit(s.equipped, inv)) {
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
      // picking up the AppBoy actually unlocks the phone (Tab/P)
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
      set({ equipped: { ...s.equipped, [slot]: uid } });
      s.addToast(`Equipped ${def.name}.`);
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
      const recipe = FIELD_RECIPES[recipeId];
      if (!recipe) return;
      const s = get();
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
        version: 1,
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
      if (snap.version > 1) { s.addToast('Save is from a newer version.'); return false; }
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
