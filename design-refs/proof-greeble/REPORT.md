# Greeble pass — proof report (lane/greeble @ c80f6ff base)

Additive surface dressing over the Spec §3.2 sector kits + light
airbase dressing. No structure, layout, station, or loot-logic
changes; solid props collide through the existing kit-obstacle /
ground-collider paths; lootable props ride the shared container
registry (zero duplicate ids, pinned). Emissive fixtures only —
no new light sources.

## Before / after (eye-level, tools/render_greeble.py)

- `before/citadel_yard.png` → `after/citadel_yard.png` — truck
  hall mouth: tire stack + workbench read through the opening.
- `before/refuge_chapel_interior.png` → `after/…` — pews,
  curtains at the bay mouths, flanking infirmary shelves.
- `before/tern_porch.png` → `after/…` — deck chairs, crate table,
  rail lanterns, lantern post at the stair foot.
- `before/pier_boardwalk.png` → `after/…` — net bundles, buoys,
  fish table on the boardwalk run.

## Per-sector gains

- **Citadel** — container office (bunk, shelf run, ledgers,
  kettle, door lantern), container store (crate stack, drum
  pair, shelf tins/sacks), truck hall (2 rolling tool chests,
  north workbench, tire stack, FREIGHT beam sign), gate towers
  (roof floodlight fixtures, door lanterns, toolboxes), fortress
  crown floodlight fixtures, freight-yard clutter (drum cluster,
  pallet stack, tire pile), refinery drum yard.
- **Ridge** — bunker map table + comms rack + bunks + dresser,
  watchtower cab desk + ground toolbox, mast guy wires (3,
  anchored) + 2 yagi arrays, sandbag-line stock, helipad asphalt
  patch wear.
- **Lighthouse** — lab gas tanks + sample jars + shelf reagents,
  radar watch console (3 glowing scopes, stools), shore-shed
  tool wall, gear-shed net reel + buoys + crate stack.
- **Refuge** — chapel pews ×4, infirmary curtains at both bay
  mouths, supply shelves flanking the door, greenhouse planted
  rows (40 tufts/house) + irrigation lines + header tank,
  palisade fighting platforms ×2 + gate lanterns ×4.
- **Pier HQ** — icehouse fish table + crate stack, boardwalk net
  bundles + buoys + fish table, slip fenders (12) + mooring
  lines.
- **Tern Rock** — cottage porches (chairs, crate tables, rail
  lanterns, stair lantern posts, under-house stacks), store
  counter scale/register + name sign + door lanterns + produce
  crates, garage workbench + oil drums + tire stack, fuel dock
  fenders + hose coil + end lantern + toolbox.
- **Airbase (light)** — depot parts shelf 2 + pallet stack,
  hangar workbench + tire stack, 20 pad corner markers.

## Cost (tools/export_strongholds.ts accounting)

| sector | kits before | kits after | Δ |
|---|---|---|---|
| ridge | 2,584 | 3,220 | +636 |
| citadel | 4,336 | 5,906 | +1,570 |
| lighthouse | 3,508 | 4,492 | +984 |
| refuge | 3,378 | 5,098 | +1,720 |
| pier_hq | 1,622 | 2,838 | +1,216 |
| tern_rock | 5,778 | 9,512 | +3,734 |
| ground works | 6,586 | 11,778 | +5,192 |
| **total** | **27,792** | **42,844** | **+15,052** |

Airbase ground works: 780 → 1,020 tris (+240 markers). Airfield
kits ≈ +1.3k (shelf, pallets, bench, tires). Draw calls: props
are individual kit meshes like the base kits (no new materials
beyond shared emissive/standard set); the pass adds a few hundred
small meshes worst case, all within existing kit groups.

Budget verdict: +15,052 tris total vs the brief's <60k target —
25% of budget. Pinned in src/tests/greeble.test.ts (per-sector
ceilings, 20k added cap).

## Gate

- tsc clean; vitest 1035/1035 (66 files; +10 greeble pins);
  production build green.
- kitQa over all 24 sector buildings + lighthouse + airfield:
  0 failures (door-leaf rest strips and door openings were the
  binding constraint — four placements moved during the pass).

## Residuals

- Dressing is untextured flat-color like the base kits (the
  kits' material pass is a separate layer); emissive faces read
  at dusk/night, fixtures are props by day.
- Greenhouse crops are stylized tuft blocks, not leaf geometry —
  reads as planted rows at gameplay distance.
- Guy wires / mooring lines are thin cylinders (no catenary sag).
- Boat slips still have no walkable boat hulls (unchanged from
  the strongholds lane's residual).
- Palisade platform decks have post colliders but no floor
  rects — they read as fighting platforms; making them standable
  is a floors change, out of this pass's additive scope.
