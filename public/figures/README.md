# public/figures — Lane 4 figure GLBs

These `.glb` files are **posed proof meshes** exported from the live
figureKit builders (`src/game/figureKit.ts`) via
`tools/figures/export_figures.ts` + `tools/figures/render_proofs.py`.

- **Source of truth is the code rig**, not these files: the game builds
  figures procedurally on the figureKit joint-pivot rig so behavior
  code (flinch, wind-ups, telegraphs, walk swing) can pose them.
- These GLBs exist as gate/review artifacts and as proportion
  references for future authored models. They are **not rigged** and
  the game does not load them.
- An authored Blender GLB that follows the node contract
  (`torso`, `head`, `jaw`, `armL`, `armR`, `legL`, `legR`, optional
  `sac`, eye material on `eyes`, torso material on `torsoMesh`) can be
  bound at runtime with `bindFigureGLB()` from figureKit — that is the
  upgrade path when hero figures are authored.

## Exception: `husk_<kind>_authored.glb` files ARE runtime-loaded

Authored Figures Wave 1 (2026-10-21): the standard husk's authored
model (built by `tools/figures/build_shambler_authored.py`, gate proofs
in `design-refs/proof-figures-authored/`) is the first figure GLB the
game actually loads. `HuskManager` loads it once, binds each shambler
through `bindFigureGLB` + the kit's `poseSlump`, and keeps the
procedural kit mesh as the standing fallback (load failure changes
nothing but the mesh tier).

Authored Figures Wave 2 extends the same mechanism to the remaining
husk classes, one class per commit (proofs in
`design-refs/proof-figures-authored-2/`, builds in
`tools/figures/build_<kind>_authored.py` on the shared
`authored_lib.py` clay kit). The swap is generalized: each kind's
authored rig receives the exact base pose its procedural builder
applies (`applyAuthoredPose` in `src/game/Husks.ts`). Runtime-loaded
authored classes: shambler (wave 1) and ALL seven remaining husk
classes (wave 2) — crawler, spitter, screamer, bloater, stalker,
armored, brute. Every husk class now spawns authored; the procedural
kit mesh remains the standing fallback for all of them.
