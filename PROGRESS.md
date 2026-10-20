# NOMAD v0.1.0 — Progress Log

## 2026-10-19 — Coordinator: scaffold + contracts (m0/scaffold)
- Repo scaffolded at `~/workspace/nomad/`: Vite + React 18 + TS strict + Tailwind v4 + three + zustand + idb.
- Wrote: store types, zustand store (inventory/weight/quests/factions/save wiring), item/quest/faction data,
  inventory utils, App shell, game instance/input singletons, vercel.json, CI workflow.
- `INTERFACES.md` is the cross-module contract. Subagents fanned out next:
  - A (engine): `src/game/` — Game, world gen, player controller, husks, combat, interact.
  - B (systems): `src/systems/` (save, audio) + `src/narrative/dialogue.ts` + unit tests.
  - C (UI): `src/ui/` — all screens, HUD, phone, touch controls, tokens.

## 2026-10-19 — Systems+Narrative agent (B): save, audio, dialogue, tests
- `src/systems/save.ts`: IndexedDB via `idb` (db `nomad`, store `saves`, keyPath `slot`); `saveGameToSlot`/`loadGameFromSlot`/`listSaveSlots`/`deleteSaveSlot` with exact contract signatures; `listSaveSlots` returns `SaveMeta[]` newest-first with labels like `Slot 1 — 42 min — Survivor`. Real `migrate()` with a switch (v0→v1 fills battery/phoneUnlocked/hotbar/equipped/seed defaults; unknown versions throw). All wrapped in try/catch, rethrown with clear messages.
- `src/systems/audio.ts`: procedural WebAudio, zero assets, lazy AudioContext on first `play()` (auto-resumes pre-gesture). 12 sfx (swing/shot/hit/hurt/pickup/ui/step/quest/eat/phone/switch/beacon) + ambience (looping filtered-noise wind, distant rumble timer, night crossfade with sparse cricket ticks, danger levels 0/1/2 layering pulse + dissonance). `setMuted` via master gain. All non-fatal.
- `src/narrative/dialogue.ts`: full content. Prologue (7 nodes, Tern Rock, Cal Vega): `boat` node has exactly the two required choices (`sacrifice_cal`/`leave_cal`, flags `sacrificed_cal`/`left_cal`); the node after each choice carries `questEvent {type:'choice', target:'boat_choice', count:1}`; ends `next:null`. `npc:jonah` (4 nodes, `talk`/`npc:jonah` questEvent, points to wreck phone, Kowalski, lighthouse). `npc:kowalski` (3 nodes, `beacon_choice` with exactly `light_beacon`/`dark_beacon`, both `next:null`). `ENDING_LINES`: 8 quiet voiceover lines. Tone: sharp, spare, sentence case.
- `src/tests/save.test.ts` (6) + `src/tests/inventory.test.ts` (18): migrate v0→v1 round-trip/field-preservation/defaults/unknown-version-throw; encumbrance tier boundaries at 100/130/160%; carryLimitKg story +20% and pack bonuses; usedSlots stack math. All pure, no DOM.
- VERIFY: `npm test` → 24/24 pass. `npm run typecheck` → clean for all my files; remaining errors are `src/ui/{DifficultyScreen,PrologueScreen,GameView,EndingScreen}` not yet landed by the UI agent (out of my lane — do not touch).

## 2026-10-19 — UI agent: all screens and HUD shipped (ui agent)

Created `src/ui/` (13 files) plus `DESIGN_TOKENS.md`. `npm run typecheck` passes.

- **TitleScreen.tsx** — NOMAD title, New game → difficulty, Continue → refreshSlots + slot list (loadFromSlot, delete), How-to-play overlay with controls.
- **DifficultyScreen.tsx** — three cards from DIFFICULTIES (label, tagline, key diffs) → startNewGame.
- **PrologueScreen.tsx** — renders prologue dialogue; boat choice ids `sacrifice_cal`/`leave_cal` fire `questEvent('choice','boat_choice',1)`; end → setScreen('game').
- **GameView.tsx** — mounts canvas, constructs Game, setGame, async init with `{seed, difficulty, snapshot: pendingSnapshot}`, start; cleanup dispose + setGame(null) + ambience.stop. StrictMode double-mount guarded with an `alive` flag. Renders HUD, Phone, TouchControls, PauseMenu, DialogueOverlay, DeathOverlay, and an inline CutsceneOverlay (ENDING_LINES[cutsceneLine] while endingChoice != null). Engine pause flag synced from store.paused.
- **HUD.tsx** — health/stamina bars, hotbar 1-3 (click = useHotbar), quest tracker (first active quest + step objective + progress), HH:MM clock with day/night glyph, toasts bottom-left, interact prompt ("E" key cap + label) center-bottom, crosshair dot, low-hp red vignette, battery icon when phoneUnlocked.
- **Phone.tsx** — right-side AppBoy panel, tabs LOADOUT (inventory select + Inspect/Equip/Unequip/Use/Drop, equipped slots, weight meter with encumbrance label, battery) / WORLD (2D canvas map sampling getHeightAt/getBiomeAt over x −700..700, z −320..320, POI dots + labels, player triangle, quest target ring for poi:/npc: targets) / COMMAND (active + done quests, faction rep with repTier, save slots 1-3 gated on difficulty.saveAnywhere with "Save at campfires" hint otherwise, battery + charge hint). Scrim tap closes.
- **TouchControls.tsx** — touch-only (`'ontouchstart' in window`): joystick writes input.moveX/moveY, right-half drag writes lookDX/lookDY, ATK/FIRE/E/phone buttons set edge triggers. `touch-action: none` everywhere.
- **PauseMenu.tsx** — Resume, slot save picker (saveAnywhere only), Quit to title. Rendered when store.paused.
- **DialogueOverlay.tsx** — generic NPC renderer; kowalski `beacon_choice`: `light_beacon` → questEvent('choice','beacon_choice',1) + triggerEnding('light'), `dark_beacon` → same + triggerEnding('dark').
- **DeathOverlay.tsx** — "You died — {deathCause}"; permadeath → "Run over" → title, else Respawn → respawn().
- **EndingScreen.tsx** — "THE LIGHTHOUSE" / "THE DARK", ENDING_LINES recap, stats (time survived, quests done, lighthouse rep), New game → title.
- **DialoguePanel.tsx** (extra internal helper) — shared renderer for PrologueScreen + DialogueOverlay: applies node-level setFlags/questEvent on landing, choice-level setFlags/rep on pick.
- **DESIGN_TOKENS.md** — 6 named tokens (Void #0b0e12, Panel #12161c, Line #232b36, Text #d7dde5, Dim #8a94a3, Signal #e8b34b) + two supporting state hues (Danger #d9534f, Verdant #5aa469).

Deviations/notes:
- Prologue fires the boat quest event both on the special-cased choice ids AND via node-level questEvent on landing (per INTERFACES: systems agent puts questEvent on the follow-up node). Double-fire is harmless — q_prologue step 1 completes either way (progress caps at step advance).
- Keyboard handlers stay engine-owned per contract; the UI writes no key listeners, so no double-fire when the engine lands.
- GameView init catches the stub Game's throw; real engine replaces it with the same API.

## 2026-10-19 — Engine agent: Game engine implemented (A/engine)
- Replaced `src/game/Game.ts` stub with the full engine; added `rng.ts` (mulberry32 + value-noise fbm),
  `World.ts` (deterministic island: 256x128 terrain mesh with per-biome vertex colors, water plane,
  day/night sun+sky+fog+stars, lighthouse with rotating beam, relay ruin, town shells, campfires,
  wreck, instanced trees/rocks), `Husks.ts` (Shambler/Stalker FSM: idle/wander/investigate/hunt/attack/return,
  110deg/25m sight cone, night speed 1.4x/day 0.7x, cap 14, tip-over+fade death, 40% salvage drops),
  `Combat.ts` (melee arc, pistol hitscan with headshot x2 + falloff past 25m, ammo consume, noise 60m),
  `Player.ts` (low-poly humanoid, third-person orbit camera, pointer-lock mouse-look, stamina,
  encumbrance-gated sprint via inventoryUtils), `Interact.ts` (12 loot containers incl. phone at the wreck
  and 3 relay parts, campfire rest/safe-points, relay switch one-shot, Jonah/Kowalski NPCs, beacon
  rep-50 gate).
- Contract notes: all 10 POI ids + `npc:jonah`/`npc:kowalski` registered via `setPoiPositions` on init;
  `reach` steps checked per tick (<6m); engine pauses on paused/dialogue/phone/dead/screen!=game while
  still rendering; `rest()` = +8h, full heal, battery 100, autosave; `playEndingCutscene` = 18s lighthouse
  orbit with `setCutsceneLine` across `ENDING_LINES`, then `setScreen('ending')`; snapshot applies
  player pos + looted/deadHusks/cleared skips; audio hooks (`sfx`/`ambience`) wired throughout.
- `npm run typecheck` passes. Terrain smoke-tested (throwaway vitest, since removed): all POIs on land,
  all 6 biomes present, town/flat + forest/raised verified, seed-deterministic. One fix landed:
  town flatten mask was leaking into the forest cache (shrunk 170->130).
- Open: husk attack uses `damagePlayer` (store applies difficulty mult — per contract); player spawn is
  offset ~20m from shore_camp so q_prologue step 2 requires walking in; no per-frame allocations in the
  hot loop (sky updates throttled to 4Hz, shared geometries/materials).

## 2026-10-20 — Mobile UI revamp wave SHIPPED + deployed + verified live
- Commits on main: 07bdc47 (mobile UI revamp) + b9523c1 (attachments wave, gun customization + magazines/reload).
  NOTE: two coordinators worked the same tree concurrently; 07bdc47 swept the
  mobile-UI uncommitted edits (HUD.tsx/TouchControls.tsx) and b9523c1 swept
  Game.ts/audio.ts — final tree verified coherent: tsc clean, vitest 24/24, vite build green.
- Touch changes:
  - WeaponBar: third "Throw" slot — shows equipped throwable + qty (or first grenade in pack); tap auto-equips a grenade into the melee slot if needed, then throws via the normal melee→onThrow projectile path (frag/molotov/flashbang).
  - Hold-to-search: tapping interact (F desktop / USE touch) while searching now cancels it (press consumed so the search doesn't restart); HUD progress bar gets an explicit Cancel button; "Pick safe (locked)" renders "Picking …".
  - Noise meter extracted to a component: desktop unchanged in vitals; touch gets a compact top-center pill (LOUD/audible/quiet).
  - Interact prompt: adaptive key cap (USE on touch, F desktop); on touch it sits above the USE button instead of under the weapon bar.
  - Hotbar on touch = right-edge vertical strip for the right thumb (bottom-center is the weapon bar's zone).
  - Safe-area insets on HUD + TouchControls roots; slimmer weapon slots (h-12 w-24).
  - Sibling's ammo counter shipped in the same wave: HUD magazine loaded/reserve readout for the equipped gun.
- Safe/lockpick touch flow: USE on a locked safe without a lockpick → "Locked. You need a lockpick." toast (engine); with one → 4s pick with progress + cancel; lockpick consumed on completion (engine, unchanged).
- Incidental fix: 'craft' sfx name added to SfxName + synthesized ratchet sound (tsc was failing on attachMod's sfx.play('craft')).
- Deploy: push to origin main AUTO-DEPLOYED (the "no auto-deploy on push" note from m1/deploy is now stale — Vercel picked up the push).
- Verified live: https://nomad-game-koinocapital-7163s-projects.vercel.app → 200, serves index-DiBGEFCf.js (912,851 bytes), bundle contains the revamp's "Search cancelled" string.

## 2026-10-19 — Coordinator: deploy v0.1.0 (m1/deploy)
- Pushed `main` to github.com/koinod/nomad-game (gh OAuth token lacks `workflow` scope, so
  `.github/workflows/ci.yml` could not be pushed — neither via gh nor the GitHub App API;
  re-add via Vercel dashboard or `gh auth refresh -s workflow`).
- Vercel project `nomad-game` (prj_KnJrWyBAKWnJCvQCsw5hkxO4Mq6c) created in personal scope.
  `create_git_project` is blocked (requires teamId; the only resolvable id maps to the
  koinocapital team scope which 403s), so no auto-deploy on push yet — redeploys via
  create_deployment with gitSource.
- Production deploy dpl_CKYqJNYAsSzWxJzPZuXJm4PVfd4U from main@396f24a — READY.
  Disabled SSO protection (was 302-gating the public URL).
- Verified: https://nomad-game-koinocapital-7163s-projects.vercel.app → 200, title NOMAD,
  JS bundle 734,885 bytes + CSS 200.
- Bug fixed in review: Esc/pointer-lock double-toggle (Game.ts handleLockChange).
