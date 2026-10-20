# CRAFT WAVE BRIEF — vehicles + movement (fires when the airbase wave lands)

Ian's program order (2026-10-20 16:03): features first — (1) vehicles + movement,
(2) combat + weapons, (3) inventory + sat phone/management, (4) upgrades +
customization + character/mob design. Map/houses/story/loot-placement/progression
come AFTER the features work. V4 houses live in that later map phase — NOT here.

## The standard (researched, Ian-approved 2026-10-20)
- Proportions first: wheels placed at true wheelbase/track/diameter BEFORE the shell
  (BeamNG workflow). No model may read as stacked primitives.
- Bodies LOFTED from profile cross-sections (custom BufferGeometry hulls): sloped
  hoods, tapered cabins, roofline curves; BEVELED edges that catch light.
- HIGHER POLY THE BETTER (Ian, verbatim) — smoothness beats poly economy everywhere.
  Fidelity benchmark: the Sea Hawk render (design-refs/airbase/04-mh60s-seahawk.png).
- Wheel arches + dark inner tubs; panel gaps; hood/doors/trunk as separate pieces
  with hinge-correct pivots; wheels as separate centered-pivot meshes; tires with
  real tread mass, not discs.
- FULL INTERIORS: cabin tub, dash + driver gauge cluster, seats, door cards,
  steering wheel that TURNS with steering input.
- Glass: tinted, transparent, slightly reflective. The seated PLAYER AVATAR must be
  VISIBLE inside from third person; first-person = driver's-eye view over the dash.
- DELETE the old builders. Every existing vehicle model is rejected (Ian: "boxes,
  not actual models"), including the Dark Horse.

## Order of work
1. **THE STALLION — PINNED, first, THREE variants** (Ian, 2026-10-20 16:04; sheets
   in design-refs/stallion/). The Mustang rebuild is a family:
   - **Base Model** (03-base-model.png): matte slate charcoal, stock, dark wheels,
     clean unarmored body — the standard spawn.
   - **FX Package** (01-fx-package-asset-sheet.png = multi-view proportions source;
     02-fx-package-hero.png): metallic Adriatic teal, white multi-hole rally wheels,
     hood vent, glass roof panel, tri-bar tails — a distinct hero variant spawn.
   - **Convoy Combat Edition** (04-convoy-combat-edition.png): the UPGRADED form —
     matte armor plate + rust-orange edge trim, ballistic louvers over windshield /
     side glass / rear window, exposed supercharger cowl, spiked ram bullbar,
     riveted door plates, off-road tires, roof pintle MG. NOT a separate spawn:
     this is what a Stallion BECOMES as the player installs the existing upgrade
     tree — armor tiers add plates + louvers progressively, bullbar adds the ram
     bar, mg_mount adds the roof gun. Upgrades must READ on the model.
   All three share the lofted shell (one geometry family, variant shells/details on
   top) + full interior + visible driver standard. This sets the bar for the fleet.
2. The rest of the ground fleet, worst-first: box truck, van, sedan, semi (both
   cabs), pickup, F-250 dually, Bronco, Sprinter, V-03, Goliath (6x6, weapon mounts
   preserved), tank (weapons preserved), ATV, Marsh Buggy, bikes (sportbike,
   motocross), skiff + tug (hulls shaped, not slab-sided).
3. Trailers get the same treatment where they're boxy (box trailer shell shaping,
   tanker cylinder is already honest; lowboy is new — refine to standard).
4. **Physics upgrade pass (fleet-wide):** per-class mass + inertia feel, traction
   curves, weight transfer (pitch under braking/accel, roll in corners) building on
   the 4-corner suspension, collision response (crumple = condition loss scaled by
   impact energy, bounce), trailer physics polish (swing damping), heli model
   untouched systems-wise but verify against new masses if shared code moves.
5. **Movement (on foot):** locomotion feel pass — accel/decel curves, sprint FOV
   kick + head-bob subtlety, crouch/prone transitions, lean smoothness, swim/wade
   drag, camera collision polish. Keep every existing system (ADS, stamina, noise).

Acceptance: tsc clean, full vitest green + new tests for physics helpers, build
green; per-vehicle report with deviations from refs FLAGGED, not hidden. No visual
QA possible agent-side — models built to measured proportions from the refs.
