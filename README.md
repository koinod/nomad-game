# NOMAD

Single-player, open-world, third-person survival game set on the Outer Banks of North Carolina,
18 months after "The Static." Runs in the browser. No accounts, no backend — saves live in your browser.

**Play it:** production deploy linked below (Vercel). Or `npm install && npm run dev`.

## v0.1.0 — vertical slice (playable end to end)

- Title → difficulty select (Story / Survivor / Hardcore — real differences in husk damage,
  damage taken, loot, carry weight, save rules, permadeath).
- Authored prologue on Tern Rock with the forced sacrifice choice at the boat.
- Open island (~1.4 x 0.6 km, compressed from the real ~200 km Outer Banks chain —
  compression is intentional): beach, dune, maritime forest, marsh, and town biomes,
  procedural from a seed, with a full day/night cycle.
- Third-person controller (WASD + mouse, pointer-lock look), stamina, sprint/dodge.
- Husks: Shamblers and Stalkers with FSM AI (Idle → Wander → Investigate → Hunt → Attack),
  sight cones, hearing (gunshots pull packs), day/night speed shifts.
- Melee + 9mm pistol combat with hit feedback, headshot bonus, ammo, durability-free v0.
- Lootable containers, inventory grid with weight and encumbrance tiers
  (heavy: no sprint · overloaded: no dodge · immobile: can't pick up).
- AppBoy phone overlay (React): LOADOUT (inventory/equip), WORLD (map rendered live from
  terrain data + quest markers), COMMAND (quests, faction rep, saves). Battery drains while open;
  recharge at campfires (rest) or slowly in daylight.
- Quest chain: prologue → First Light → Dead Air → Clear the Relay → Parts for Kowalski → The Beacon.
- Lighthouse Collective reputation gating the ending; one reachable ending — **The Lighthouse** —
  with an in-engine cutscene.
- Saves: IndexedDB, 3 slots + autosave slot, versioned schema, safe-point saves
  (Story can save anywhere from the pause menu).
- Mobile: touch joystick + look-drag + action buttons; `touch-action: none`, no rubber-banding.

## What's stubbed / cut in v0.1.0 (honest list)

- Rapier physics → custom heightmap character controller (no vehicles yet).
- No chunk streaming (single island mesh; the slice map is small enough).
- Inventory is click-select + buttons, not drag-and-drop.
- Factions beyond Lighthouse Collective / The Pier are mentioned, not interactable.
- No base building, crew, skill trees, crafting, or weather beyond clear/fog/night.
- Audio is procedural WebAudio placeholders; no voice acting (subtitles/text only).
- Anchor coordinates in the build prompt are approximate and unverified — the slice map
  is a fictional compression, recorded as such.

## Controls (desktop)

WASD move · mouse look (click canvas for pointer lock) · Shift sprint · E interact ·
F or left-click melee · Q or right-click pistol · Tab or P phone · 1-3 hotbar · Esc pause.

## Tech

Vite + TypeScript (strict) + React + Tailwind + Three.js + zustand + idb.
`npm run typecheck` · `npm test` (vitest) · `npm run build` → static `dist/`, deployed on Vercel.

## Repo layout

`src/game` engine · `src/systems` save/audio · `src/narrative` dialogue ·
`src/data` items/quests/factions · `src/ui` screens/HUD/phone · `src/store` zustand.
`INTERFACES.md` is the cross-module contract. Full build spec: `NOMAD_SWARM_BUILD_PROMPT.md`.
