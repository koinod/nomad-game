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
