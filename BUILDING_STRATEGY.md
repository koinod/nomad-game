# NOMAD BUILDING STRATEGY — how buildings get built here (researched 2026-10-20)

Commissioned by Ian after the lighthouse verdict: lamp room disconnected from the
tower body, a walk-through shell with no doors or real walls, and an NPC conversation
staged inside it. His order: "we need new rules/methods to make buildings properly…
create a strategy so the agents can make really good shit."

Sources: modular-kit environment practice (gamedeveloper.com modular art guide,
Polycount modular advice, Leartes modularity workflow, kit-bashing/blockout method)
+ real architectural assembly discipline (The Witness / Mirror's Edge detailing).

## The core shift: KITS, not improvisations
Games don't sculpt each building freehand. They build a small library of tested
pieces on one grid, then ASSEMBLE. Every NOMAD building from V4 on is assembled
from the kit below — a new piece enters the kit once, tested, and is reused;
nobody invents one-off geometry per building ever again.

## The grid (non-negotiable)
- Base grid **1.0 m**. All wall lengths, room dimensions, and placements are whole
  multiples of 1 m (0.5 m allowed for trim/props only).
- Standard wall height **3.0 m** per story (min ceiling 2.7 m). Second story sits
  exactly on the first story's top plate.
- Rotations: 0/90/180/270 only for structural pieces. A 89.999° piece is a defect —
  gaps compound with every added piece.
- Player is 1.96 m. Scale constants: door leaf 2.1 h × 0.95 w; window sill 0.9 m,
  head 2.4 m; stair riser ≤ 0.19 m, tread ≥ 0.28 m; corridor ≥ 1.2 m wide.

## The kit (procedural generators, one per piece)
- `wallSolid(len)` · `wallDoor(len, at)` — opening CUT into the segment, framed,
  with a door leaf whose pivot is at the jamb, swinging IN the wall's plane
- `wallWindow(len, at)` · `wallCorner` · `wallGableEnd(h)` — the gable triangle is
  part of the WALL piece, on the ridge-axis face, never a separate floating cap
- `floorSlab(w, d)` · `floorSlabStairwell(w, d, opening)` — the stair opening is a
  hole in the slab with trimmer beams around it; stairs pass THROUGH the opening
- `stairs(rise, run)` — a single run piece whose top lands flush on the slab edge
- `roofPanel` / `roofRidge` — endpoint-exact panels whose top edges MEET at the
  ridge (the Houses V3 rule, now kit law); roof bears on the top plate, overhang
  0.3 m, never hovering above the walls
- `post` / `beam` — every upper floor and balcony shows its support path: posts or
  bearing walls reaching the floor/foundation below
- `foundation(w, d)` — stem wall to terrain; the building's weight chain reads
  foundation → sill → walls → top plate → roof

## The laws (every building, every time)
1. **CONNECTIVITY.** Every structural piece physically meets or overlaps its
   neighbors. No floating pieces — not a floor, not a roof, not a lamp room.
   A tower's top is part of the tower: shaft walls continue into it or a collar
   beam ties them. (Exhibit A: the lighthouse.)
2. **WALLS ARE WALLS.** Every exterior wall segment emits a collider. No
   walk-through shells. You enter through a door opening, never through a wall.
3. **OPENINGS ARE CUTS, NOT GAPS.** Doors/windows are openings inside wall
   segments with frames; the wall continues above (lintel) and beside (jambs)
   every opening. A doorway rotated out of its wall's plane is a build failure.
4. **FLOORS HAVE HOLES WHERE STAIRS ARE.** No stair may clip a solid slab.
5. **SUPPORT READS.** If a floor, balcony, or roof cantilevers, its beams/posts
   are modeled. Structure you can't trace is structure that's wrong.
6. **INTERIORS ARE REAL ROOMS.** Interior walls, door swings that don't clip
   furniture, reachable loot. NPCs/conversations stage ONLY inside finished,
   enclosed, door-reachable spaces — never in a shell.
7. **ASSEMBLY ORDER.** Blockout the whole building from kit pieces first
   (proportions, room flow, door path from outside to every room), THEN detail
   (trim, props, greebles). Detail never rescues a broken blockout.
8. **VARIATION COMES FROM ARRANGEMENT + MATERIALS**, not new geometry: kit
   pieces recombine; siding/roof/palette variants differentiate buildings.

## The QA gate (per building, before it ships)
- [ ] Connectivity audit: part list walked; every piece's bounds touch/overlap a
      neighbor's — zero floaters (assert in code where the builder allows)
- [ ] Collider audit: every exterior wall segment has collision; door openings
      are the ONLY gaps in the perimeter
- [ ] Door audit: every leaf in-plane, hinge at jamb, swings clear
- [ ] Stair audit: every stair meets a slab opening, top step flush
- [ ] Scale audit: doors/ceilings/stairs against the constants above
- [ ] Reachability audit: every room + every NPC/loot point reachable through
      door openings from outside
- [ ] Roof audit: panels meet at ridge, gable ends on ridge-axis faces, roof
      seated on top plate
Failing any line = the building does not ship. Ian's screenshot is the final gate,
but it should never be the first one that catches these.

## Known defect backlog this strategy governs (map phase)
- **Lighthouse**: lamp room disconnected from shaft; shell is walk-through (no
  door, walls don't block); Keeper conversation staged inside the broken shell.
  Rebuild on kit: shaft + collar + lamp room as connected assembly, real door,
  interior stair/ladderwell with slab openings, conversation in the finished
  watch room.
- **All preexisting houses**: deleted and rebuilt on kit in the map phase (Ian's
  V4 order). Houses.ts builders are legacy — do not extend them; the kit
  replaces them.
- Gas station redo; warehouse shell check (Jonah's camp structures too).
