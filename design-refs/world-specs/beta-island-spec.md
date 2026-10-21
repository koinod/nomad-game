# NOMAD Master World Environment Specification: Beta Island Archipelago
# Dropped by Ian 2026-10-21 (Stitch project 8315385372052040679, screens e29534f6 / f3893dad)
# Reference image: beta-island-aerial.png (same folder) — CANONICAL macro-environment reference.
# NOTE: spec targets UE5; our build is the browser stack — the LAYOUT, sectors, and biome
# reads are canon; engine-specific rendering features translate to our lighting/terrain law.
Document ID: SPEC-ENV-MAP-BETA-ISLAND-AAA-v1.0
Visual Style: Photorealistic Post-Apocalyptic Maritime (TLOU II meets SnowRunner)

## Geographic layout
- Atlantic shoreline (EAST): sapphire water, surf, white quartz beaches, foredunes.
- Sound littoral & marsh flats (WEST/interior): shallow turquoise shoals, sandbars, tidal estuaries, salt-marsh grass.
- Maritime forest spine: live oak / loblolly pine / wax myrtle canopy as occlusion between sectors.
- Inland granite foothills (NORTHWEST): rock bluffs, granite ledges to +180m.

## Sector map
- INLAND NORTHWEST — The Ridge Protocol Redoubt: bunker portal in granite bluff + helipad + comms watchtower; heavy 6x6 ops. Inland highway spur.
- NORTHERN SPAN — The Convoy Citadel: bridge causeway fortress; stacked 40ft containers (3 tiers), hydraulic gate, heavy truck lifts, diesel refinery. Chokepoint to Act 2 mainland.
- NORTHEAST SPIT — The Lighthouse Collective: brick lighthouse, radar arrays, container labs. (Our lighthouse + spawn stay the anchor here.)
- CENTRAL ISLAND — The Refuge (Pea Island Sanctuary): stone chapel infirmary, hydroponic greenhouses, timber palisades, water filtration. Neutral safe zone.
- SOUTHWEST SOUND — The Pier HQ (Hatteras Harbor): heavy-timber pilings, icehouses, net cranes, workboat slips, palisade. Maritime fleet hub.
- SOUTHEAST BEACH — Tern Rock Coastal Town: stilted cottages, general store, marine garage, fuel dock. Early-game scavenging + starter base.

## Infrastructure
- NC Route 12 corridor: cracked asphalt spline, sand drifts, washouts — the island's road spine linking sectors.
- Dredged sound channels with daymarkers/beacons for the Salt Skiff and the Heavy Logistics Carrier.

## Terrain law carried from Ian's 2026-10-21 order ("restart the map")
The baked-heightfield topos system is DELETED. New foundation: ONE authored height
grid designed from this reference; the visible mesh and the Rapier physics field are
built from the same grid at the same resolution; roads are graded flat INTO the grid;
vehicles plant by their physics raycasts against that single surface — no third copy,
no interpolation gap, no float.
