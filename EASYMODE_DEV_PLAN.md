# NOMAD — Easymode Critical Dev Plan (2026-10-20, Ian's direction)

Target: make the island chapter genuinely great. Order of operations, then
proposed changes per system. Critical items ship first; each ships as a
playable deployed build.

## Order of operations

1. **Preexisting issues** — fix the contradictions + bugs the audit found.
2. **Resources & items** — every item works and makes sense; harvesting exists.
3. **Buildings** — improve the models (Stitch designs, newest per segment),
   houses v2 (garages, rich tier, safes), new POI shells (strip mall, marina,
   gas station, warehouse, school, barn), faction takeover branding.
4. **Combat systems** — noise meter + hold-to-search, grenades, husk specials
   (screamer/brute/crawler/bloater), military husks, player animation/UI polish,
   AI raiders (faction combat, Phase 3 side).
5. **Guns & gun customization** — mods as real items (reflex, suppressor,
   extended mag), workbench attach/detach, ammo components, weapon wear.
6. **Crafting trees** — depth: tiered benches, recipe chains, crafting that
   gates progress (you NEED it, not just want it).
7. **Vehicles** — Stitch models as placed beaters → drive physics (arcade-honest,
   not sim) → trailers, bike loading, fuel/condition/repair.
8. **Mobs then special mobs** — base husk roster solid → specials → military.
9. **Skill trees / archetypes** — Scavenger/Brawler/Mechanic/Ghost, XP-by-use
   feeding perk trees, mutually exclusive capstones.
10. **Bases** — claim, build, siege (BASE_DESIGN.md; sieges arrive Phase 3).
11. **Side quests** — pinned, not built.
12. **Regions** — OBX → Norfolk/Va Beach → D.C.; cure → hardmode (govt + new
    factions, Mercenaries 2 / Terraria pattern).

## 1. Preexisting issues (fix first)

- Faction set reconciled: merged canon = Military Remnants, Survivors Union,
  Rust Skulls, Lighthouse Collective, Tollkeepers, the Drowned (+ Enclave
  TBD). Details ironed out later; no Phase 3 work until then.
- Gunshot noise number: unify on 80m (audit found 60m in one place).
- House variant list/dimensions: single source in Houses.ts VARIANTS.
- AppBoy naming: fully gone (done). cabinets/chemicals loot: verify landed.
- GAP_AUDIT.md §C contradictions: clear or mark resolved as we touch each.

## 2. Resources & items (Phase A — shipping now)

New items: `wood`, `valuables`, `gun_parts`, `produce`, `lockpick`, `tool_kit`,
grenades (frag, molotov, flashbang), armor pieces (head/chest/legs — first
real mitigation category).
New sources: fallen-log harvest → wood; bushes → produce (new harvest-node
interactables); safes (suburban 20%, rich 45%) → valuables/gun_parts;
military husks → ammo/gun_parts.
Grenades: equippable, LMB throw arc, 3s fuse, AoE + noise. Molotov = area
denial fire. Flashbang = staggers husks' senses.
Armor: mitigation % per piece, condition wears on hits.

## 3. Buildings (Phase A/B — Stitch models + improvements)

Improve all 7 current variants against the Stitch newest-per-segment designs:
roof join quality, wall/door correctness, interior dressing, no overlays.
Houses v2: rich tier + lighthouse keeper's house, garage rooms (vehicle parts,
vehicle spawn rolls), safes (lockpick or forced-entry, noisy), stairs/ramps +
2nd floors + basements where Stitch supports them.
New POI shells: strip mall, marina/boatyard, gas station, warehouse, school,
barn, faction outposts — simple at first, dressed by the takeover kit.
Takeover kit (7 layers: banner, paint band, perimeter, lights, patrol posts,
signature prop, audio) — physical, readable from 50m, reverts on respawn clock.

## 4. Combat systems

- **Noise meter + 11-class noise table** (HUD meter, decays).
- **Hold-to-search** (2–4s, interruptable, loud).
- **Lockpick + forced entry** (quiet pick vs loud smash; smash draws husks).
- **Husk specials**: screamer (horde-call), brute (armor-break, breaks blocks),
  crawler (ankle-grab), bloater (toxic explosion + gas).
- **Military husks** at military POIs — armored, drop ammo/gun_parts.
- **AI raiders / faction combat** (Phase 3): patrols, camps, aggro rules.
- **Player**: animation polish (locomotion v2), UI (combat HUD states), hit
  feedback, stamina tuning.

## 5. Guns & gun customization

Mods as items: reflex sight (aim speed/FOV), suppressor (noise class down),
extended mag (capacity), plus gun_parts economy. Workbench attach/detach —
mods physically swap the gun model. Ammo components (casing/powder/primer)
feed the reloading recipes. Weapon wear + maintenance (oil/clean) or jams.

## 6. Crafting trees (depth)

Tiered: phone field recipes → workbench → chemistry → machine shop → garage
forge (Phase 3). Recipe chains: scrap → parts → assemblies → gear. Skill_req
gates after the XP-by-use vs archetype decision lands. Crafting must gate
progress: ammo, armor, mods, vehicle parts, base facilities all need it.

## 7. Vehicles (Stitch models)

Placed beaters first (13-vehicle roster from POIS_FACTIONS_VEHICLES.md),
then: enter/exit, arcade-honest driving (no sim), island road network,
fuel/condition/wear/repair, trailers + hitch matrix, bike snap-in slots
(pickup 1, van 2, box 2, flatbed 2, carrier 4).

## 8. Mobs → special mobs

Base roster polish (shambler/stalker + the revamp visuals) → specials →
military → hardmode enemies (post-cure: government units, new factions).

## 9. Skill trees / archetypes

Scavenger / Brawler / Mechanic / Ghost. XP-by-use feeds perk trees;
mutually-exclusive capstones. Decision needed: XP-by-use vs archetype XP —
resolve before recipe skill_req fields are written.

## 10. Bases (per BASE_DESIGN.md — "Slots & Ghosts")

Claim POIs, blueprint ghosts survivors build, one home + outposts, heat →
telegraphed sieges (Phase 3), salvage rig instead of mines, semi trucks
parkable never manufacturable.

## 11. Side quests — pinned, not built.

## 12. Regions → D.C. → cure → hardmode — Phase 4.

---

First build (Phase A, this wave): preexisting fixes + resources/items +
grenades + safes/lockpick + noise meter + hold-to-search. Deploy, playtest,
then Phase B (buildings v2 + new POI shells + Stitch improvements).
