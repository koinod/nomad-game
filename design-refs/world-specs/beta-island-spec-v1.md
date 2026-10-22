# NOMAD Master World Environment Specification: Beta Island Archipelago (AAA High-Poly)

**Document ID:** `SPEC-ENV-MAP-BETA-ISLAND-AAA-v1.0`
**Target Engine & Pipeline:** Unreal Engine 5.4+ (Nanite / World Partition / Lumen Raytracing / Chaos Physics)
**Visual Style:** Photorealistic Post-Apocalyptic Maritime (The Last of Us Part II meets SnowRunner)
**Reference Map Asset:** `beta-island-aerial-v2.png` (this directory; Ian, 2026-10-21 — supersedes beta-island-aerial.png as the canonical macro reference)
**Stitch screens:** web application/stitch/projects/8315385372052040679/screens/e29534f6c0694324a576fbac67743842 · web application/stitch/projects/8315385372052040679/screens/f3893dad19304d5480bbe57615e1eaa0

---

## 1. Executive Summary & Geographic Layout

The **Beta Island** map render provides the canonical macro-environment reference for NOMAD's high-poly AAA development sprint. It establishes the spatial layout, biome transitions, elevation deltas, transport routes, and faction footholds across the entire starting and mid-game archipelago.

### 1.1 World Partition & Landscape Metrics
* **Total Map Footprint:** 16 km² (4 km x 4 km World Partition Grid in Unreal Engine 5).
* **Grid Cell Size:** 64m x 64m streaming HLOD clusters.
* **Biome Palette:**
  * **Atlantic Shoreline (East):** Deep Atlantic sapphire water, dynamic ocean surf, high-energy wave breaks, pale white quartz sand beaches, and wind-sculpted foredunes.
  * **Sound Littoral & Marsh Flats (West/Interior):** Shallow turquoise shoals, sandbars, navigable tidal estuaries, black needle rush (*Juncus roemerianus*), and salt-marsh grass (*Spartina alterniflora*).
  * **Maritime Forest Spine:** Dense maritime live oak (*Quercus virginiana*), loblolly pine, wax myrtle, and Spanish moss canopies acting as natural occlusion barriers between sectors.
  * **Inland Granite Foothills (Northwest):** Elevated rock bluffs and exposed granite ledges rising to +180m elevation.

---

## 2. Master Faction Stronghold & POI Spatial Coordinates

```text
                                [INLAND NORTHWEST]
                           The Ridge Protocol Redoubt
                          (Bunker Portal & Helipad)
                                      │
                                      ▼ (Inland Highway Spur)
      [NORTHERN SPAN] ───────────────────────────────── [NORTHEAST SPIT]
  The Convoy Citadel                               The Lighthouse Collective
 (Oregon Inlet Toll Fortress)                     (Bodie Island Signal Station)
              │                                                │
              └───────────────────────┬────────────────────────┘
                                      │
                                      ▼ (NC Route 12 Corridor)
                              [CENTRAL ISLAND]
                                 The Refuge
                          (Pea Island Sanctuary)
                                      │
              ┌───────────────────────┴────────────────────────┐
              ▼                                                ▼
     [SOUTHWEST SOUND]                                  [SOUTHEAST BEACH]
        The Pier HQ                                   Tern Rock Coastal Town
 (Hatteras Harbor Settlement)                       (Stilted Cottages & Marina)
```

### Detailed Sector Breakdown:

| Faction / POI | Coordinates | Structural Focus | Tactical Role |
| :--- | :--- | :--- | :--- |
| **The Convoy Citadel** | Northern Bridge Causeway | Stacked 40ft sea containers (3 tiers), hydraulic gate, heavy truck lifts, diesel refinery. | Northern chokepoint controlling access to Act 2 mainland freight routes. |
| **The Lighthouse Collective** | Northeast Coastal Dune Spit | Historic brick lighthouse with steel seismic bracing, parabolic radar arrays, container labs. | High-gain radio relay, AppBoy decryption firmware, long-range radar tracking. |
| **The Refuge** | Central Island Dunes | Stone chapel infirmary, multi-span hydroponic greenhouses, timber palisades, water filtration. | Agrarian food production, medical trauma care, neutral safe zone. |
| **The Pier HQ** | Southwest Sound Shoreline | Heavy-timber pilings, marine icehouses, net crane hoists, workboat slips, perimeter palisade. | Maritime fleet hub, skiff repairs, sound salvage operations, fish trade. |
| **The Ridge Redoubt** | Northwest Mountain Bluffs | Subterranean blast portal in sheer granite, tactical helipad, comms watchtower, pine canopy. | Federal continuity research, heavy 6x6 vehicle operations, clandestine technology. |
| **Tern Rock Coastal Town** | Southeast Beachfront | Stilted beach houses (`house_beach_2br`), general store, marine garage, fuel dock. | Early-game scavenging, starter base, civilian vehicle recovery. |

---

## 3. High-Poly 3D Asset Sprint Roadmap

With the macro-geography locked in the reference render, the production pipeline transitions to building out each individual component:

1. **Landscape & Nanite Terrain:**
   * Procedural erosion baking (Slippage, Flow, and Deposition masks).
   * Physical sand deformation and wet mud trails under heavy tire loads (Chaos Vehicles).
2. **Faction Strongholds (Nanite SubD Modular Kits):**
   * Converting the sector references into modular kit pieces (piers, container walls, greenhouses, blast doors).
3. **Transport Infrastructure:**
   * NC Route 12 highway spline with cracked asphalt, sand drifts, and washouts.
   * Dredged sound navigation channels marked with daymarkers and navigation beacons for the **Salt Skiff** and **Heavy Logistics Carrier**.
