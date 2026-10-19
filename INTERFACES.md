# NOMAD v0.1.0 — Module Interfaces

Single source of truth for cross-module contracts. If you need something not listed here,
add it to this file AND to `OPEN_QUESTIONS.md`, then use the simplest option and continue.

## World layout (engine-owned, `src/game/`)

Island along the X axis, x in [-700, 700], z in [-320, 320]. Water plane at y=0.
POI ids the engine MUST register via `store.setPoiPositions({...})` on init
(id -> [x, z]):

| POI id | Place | Purpose |
|---|---|---|
| `shore_camp` | south beach campfire | player spawn, q_prologue step 2, safe point, rest |
| `jonah_camp` | campfire | npc:jonah stands here, safe point |
| `wreck` | beached wreck | container holding the `phone` (q2) |
| `relay_station` | relay ruin | 5 husks spawn zone (q3) |
| `relay_switch` | relay station panel | interactable switch (q3 step 2) |
| `town` | ruined town | loot containers, husks |
| `lighthouse_base` | lighthouse door | npc:kowalski stands here, safe point |
| `lighthouse_top` | lamp room | beacon choice (q5) |
| `forest_cache` | forest clearing | containers with relay parts |
| `dune_cache` | dunes | containers with relay parts |

NPC positions must also be registered: `npc:jonah` -> same as `jonah_camp`,
`npc:kowalski` -> same as `lighthouse_base`.

Suggested x positions (z wherever terrain fits): shore_camp x=-560, jonah_camp x=-380,
wreck x=-220, town x=-40..120, forest_cache x=180, relay_station x=330,
dune_cache x=470, lighthouse_base x=600, lighthouse_top x=600.

## Store API (`src/store/gameStore.ts`)

UI and engine import `useGameStore` from `../store/gameStore` (engine: `../../store/gameStore`).
Inside the engine tick, prefer `useGameStore.getState()` (no subscriptions in the loop).

### Engine -> store (call these)

- `syncPlayer(pos: [x,y,z], hp: number, stamina: number)` — call at ~10Hz.
- `damagePlayer(amount: number, cause: string)` — amount is pre-difficulty raw damage;
  the store applies the difficulty `playerDamageTaken` multiplier.
- `healPlayer(amount: number)`
- `advanceTime(minutes: number)`
- `addItem(itemId: string, qty: number, quiet?: boolean): boolean` — engine MUST apply
  `DIFFICULTIES[difficulty].resourceMult` to loot qty before calling. Returns false if
  blocked (weight/slots); do not mark the container looted when false.
- `questEvent(type: 'reach'|'kill'|'collect'|'talk'|'interact'|'choice', target: string, count?: number)`
  - kill target for husks is the literal string `'husk'`.
  - `collect` is fired automatically by `addItem` — engine must NOT double-fire it.
- `setFlag(flag: string)`
- `addRep(faction: string, amount: number)`
- `addToast(text: string)`
- `setInteractPrompt(label: string | null)` — call every tick with the current prompt or null.
- `openDialogue(source: 'npc:jonah' | 'npc:kowalski', nodeId: string)` — engine pauses while
  `getState().dialogue != null` (check in the tick; also pause husks/combat).
- `drainBattery(amount: number)` / `chargeBattery(amount: number)`
- `die(cause: string)`
- `triggerEnding(choice: 'light' | 'dark')`
- `setPoiPositions(map: Record<string, [number, number]>)`
- `setCutsceneLine(i: number)`
- `autosave(): Promise<void>` — call on safe-point interact, rest, quest completion
  (quest completion already autosaves inside the store).

### UI -> store

- `setScreen(s)`, `startNewGame(d)`, `setPaused(p)`
- `openPhone(tab?)`, `closePhone()`, `setPhoneTab(t)`
- `equipUid(uid)`, `unequipSlot(slot)`, `useItemUid(uid)`, `dropUid(uid)`
- `assignHotbar(index, uid)`, `useHotbar(index)`
- `saveToSlot(slot)`, `loadFromSlot(slot)`, `deleteSlot(slot)`, `refreshSlots()`
- `respawn()`
- `countItem(itemId)`

### Store state reads

`hp, maxHp, stamina, maxStamina, pos, timeMinutes, playSeconds, inventory, equipped,
hotbar, quests, doneQuests, flags, rep, phoneOpen, phoneTab, phoneUnlocked, battery,
dialogue, interactPrompt, poiPositions, toasts, dead, deathCause, endingChoice,
cutsceneLine, pendingSnapshot, saveSlots, screen, difficulty, seed, paused`.

### Inventory math (`src/store/inventoryUtils.ts`)

`totalWeightKg(inv)`, `usedSlots(inv)`, `carryLimitKg(equipped, inv, difficulty)`,
`slotLimit(equipped, inv)`, `encumbranceTier(weight, limit)` -> 'ok'|'heavy'|'overloaded'|'immobile'.
Sprint allowed only when tier is 'ok' (engine enforces via stamina/move speed).

## Game class (`src/game/Game.ts`, engine agent owns)

```ts
export class Game {
  constructor(canvas: HTMLCanvasElement);
  init(opts: { seed: number; difficulty: DifficultyId; snapshot?: SaveSnapshot | null }): Promise<void>;
  start(): void;                 // begins rAF loop
  setPaused(p: boolean): void;
  dispose(): void;               // cancel rAF, remove listeners, dispose renderer
  getPlayerSnapshot(): { pos: [number,number,number]; hp: number };
  getWorldDiff(): WorldDiff;     // { looted, deadHusks, cleared }
  getHeightAt(x: number, z: number): number;
  getBiomeAt(x: number, z: number): BiomeId; // 'beach'|'dune'|'forest'|'town'|'marsh'|'water'
  respawnAtSafePoint(): void;
  rest(): void;                  // campfire rest: +8h time, heal to full, battery=100, autosave
  playEndingCutscene(): Promise<void>; // camera path ~18s, calls setCutsceneLine(i), then setScreen('ending')
}
```

- Engine pauses when `store.paused`, `store.dialogue != null`, `store.phoneOpen` (phone pauses world, single-player),
  `store.dead`, or screen != 'game'. Husks freeze; render continues.
- Death: engine detects hp<=0 via store OR calls `die(cause)` itself; on `respawn()` the engine
  moves the player to the last safe point. Track `lastSafe: [x,z]` internally; update on safe-point interact.
- Keyboard: WASD/arrows move, Shift sprint, E interact, F or LMB melee, Q or RMB pistol,
  Tab or P phone, 1-3 hotbar, Esc pause. Write into `src/game/input.ts` `input` object;
  pointer-lock mouse-look on canvas click (desktop only). All edge triggers cleared by the
  controller each tick via `resetEdgeTriggers()`.
- Noise: gunshot emits noise radius 60m, sprint 14m, walk 6m, melee 8m, flare 30m.
  Husks in radius switch to Investigate.
- Husk cap: 14 active. Day speed 0.7x / night 1.4x for shambler + stalker.
- Husks drop loot on death (call `addItem` directly to player if close? No — spawn a small
  loot spark the player picks up with E: simplest honest approach is auto-add with quiet=false
  only if within 3m, else skip). Simpler: on husk death, 40% chance: `addItem('scrap'|'cloth'|'ammo_9mm', qty, true)` + toast.
- Containers: id, pos, loot table `[{id, qty:[min,max], chance}]`, once looted -> world.looted.
  Apply difficulty resourceMult to qty (round, min 1).
- Interactables: campfire (Rest), relay_switch (quest), beacon (lighthouse_top: if rep.lighthouse>=50
  open choice UI via `openDialogue('npc:kowalski', 'beacon_choice')` else toast the rep requirement),
  NPCs (E -> openDialogue).
- Cutscene: disable player input, animate camera on a path around the lighthouse for ~18s,
  advancing `setCutsceneLine(i)` through `ENDING_LINES.length` lines, then `setScreen('ending')`.

## Audio (`src/systems/audio.ts`, systems agent owns)

```ts
export const sfx: {
  play(name: 'swing'|'shot'|'hit'|'hurt'|'pickup'|'ui'|'step'|'quest'|'eat'|'phone'|'switch'|'beacon', opts?: { volume?: number }): void;
  setMuted(m: boolean): void;
};
export const ambience: {
  start(): void; stop(): void;
  setNight(isNight: boolean): void;
  setDanger(level: 0|1|2): void; // 0 calm, 1 husks near, 2 combat
};
```
All procedural WebAudio, no assets. Lazy-init AudioContext on first user gesture.

## Save (`src/systems/save.ts`, systems agent owns)

```ts
export function saveGameToSlot(slot: string, snap: SaveSnapshot): Promise<void>;
export function loadGameFromSlot(slot: string): Promise<SaveSnapshot | null>;
export function listSaveSlots(): Promise<SaveMeta[]>;
export function deleteSaveSlot(slot: string): Promise<void>;
```
IndexedDB via `idb`, db `nomad`, store `saves`, key = slot. Slot ids: '1','2','3','auto'.
Migrations: if `snap.version < 1` migrate forward (v1 is current; write `migrate()` anyway).
Refuse `version > 1` is handled by the store.

## Dialogue data (`src/narrative/dialogue.ts`, systems agent owns)

```ts
export const PROLOGUE_SCRIPT: Record<string, DialogueNode>;
export const PROLOGUE_START = 'start';
export const NPC_DIALOGUES: Record<'npc:jonah' | 'npc:kowalski', { start: string; nodes: Record<string, DialogueNode> }>;
export const ENDING_LINES: string[]; // ~8 lines, shown during the lighthouse cutscene
```
- Prologue must include a `boat` node with two choices: ids `sacrifice_cal` and `leave_cal`.
  Each choice sets flags (`sacrificed_cal` / `left_cal`) AND the UI calls
  `questEvent('choice', 'boat_choice', 1)` when either is picked (the UI agent handles this:
  prologue dialogue choices with id starting `sacrifice_`/`leave_` map to the quest event).
  Simpler: give the choice node `questEvent: { type: 'choice', target: 'boat_choice', count: 1 }`
  on the node AFTER the choice, or on both choice `next` nodes. Systems agent: put
  `questEvent` on the node that follows the boat choice.
- `npc:kowalski` dialogues must include a node id `beacon_choice` with two choices:
  ids `light_beacon` and `dark_beacon`. The UI agent: on `light_beacon` call
  `questEvent('choice', 'beacon_choice', 1)` then `triggerEnding('light')`;
  on `dark_beacon` call `questEvent('choice', 'beacon_choice', 1)` then `triggerEnding('dark')`.

## UI (`src/ui/`, ui agent owns)

- `TitleScreen`, `DifficultyScreen`, `PrologueScreen`, `GameView`, `EndingScreen`
  (already referenced by `src/App.tsx` — exact default exports required).
- `GameView`: mounts `<canvas>`, constructs `Game`, `setGame`, `await game.init(...)`,
  `game.start()`; on unmount `game.dispose(); setGame(null)`.
  Init opts: `{ seed, difficulty, snapshot: pendingSnapshot }` from store; after init,
  clear via... store has no clear action — UI can ignore; `loadFromSlot` sets it, and
  `GameView` reads it once on mount. New games have `pendingSnapshot: null`.
  Contains: HUD, Phone, TouchControls, PauseMenu, DialogueOverlay, DeathOverlay.
- Phone map: sample `getGame().getHeightAt(x,z)` / `getBiomeAt(x,z)` on a 2D canvas;
  overlay POIs from `store.poiPositions`, player arrow from `store.pos`,
  quest target marker for the current step (`target` starting with `poi:` or `npc:`).
- Mobile: `TouchControls` writes to `input` (left joystick -> moveX/moveY,
  right-side drag -> lookDX/lookDY, buttons set edge triggers). Show only on
  touch devices (`'ontouchstart' in window`). Container `touch-action: none`.
- Design tokens: write `DESIGN_TOKENS.md` (4-6 named hex, dark tactical, no Fallout green).
  Sentence case, active-voice buttons matching toast text ("Equip" -> "Equipped").

## Input (`src/game/input.ts`, already written)

Keyboard/mouse handlers live in the engine (Game.ts or player module).
TouchControls writes the same `input` object. Controller consumes + `resetEdgeTriggers()`.

## Rules

- No new cross-module imports beyond what this file describes.
- `npm run typecheck` must pass before you report done.
- Append a short entry to `PROGRESS.md` when finished.
