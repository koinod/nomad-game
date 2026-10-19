# NOMAD v0.1.0 — Decisions

- Plain Three.js instead of React Three Fiber: fewer moving parts, no reconciler risk in the game loop.
- No Rapier in v0.1.0: custom heightmap collision + kinematic character controller. Documented as a cut.
- Single 1400x700m island mesh (no chunk streaming): the slice map is small enough.
- Inventory interaction is click-to-select + buttons (Inspect/Equip/Use/Drop), not drag-and-drop: honest cut, noted in README.
- Prologue is an authored dialogue sequence (Tern Rock), not a 3D scene: the sacrifice choice + flags carry the weight.
- Phone pauses the world (single-player): keeps battery/time/AI consistent.
- Time scale: 1 real second = 1 game minute (full day = 24 real minutes). Faster than the spec's 1:1 so day/night is visible in a session.
