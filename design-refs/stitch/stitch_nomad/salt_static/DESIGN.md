# Design System Strategy: Tactical Nautical

## 1. Overview & Creative North Star
The Creative North Star for this system is **"The Submerged Terminal."** 

This isn't just a game UI; it is a high-functioning, professional-grade tactical overlay struggling against environmental decay. We are blending the cold, utilitarian precision of a naval heads-up display with the entropic grit of "Coastal Horror." 

To break the "standard game UI" look, we avoid perfectly centered, symmetrical layouts. Instead, we utilize **intentional asymmetry**—offsetting data readouts and using "cracked" masking effects to suggest a screen that has seen trauma. The interface should feel like an expensive piece of hardware that has been dropped in salt water, dried in the wind, and forced back into service.

## 2. Colors & Tonal Depth
The palette is rooted in the "Abyssal Zone"—deep blacks and desaturated teals, punctured by high-visibility "Survival Orange" for critical data.

### Surface Hierarchy & Nesting
We reject the flat grid. Depth is achieved through a "Stacked Lens" approach:
*   **The Foundation:** `background` (#0f1417) represents the deep ocean/dead screen.
*   **The Housing:** `surface-container-low` (#171c1f) defines the primary HUD areas.
*   **The Critical Focus:** `surface-container-high` (#262b2e) is used for active equipment slots or hovering data modules.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to define sections. Instead, use background shifts. A weapon slot is defined by being `surface-container-highest` against a `surface-container-low` dock. 
*   *Exception:* If a boundary is needed for "tactical" feel, use a **Ghost Border**: `outline-variant` at 15% opacity.

### The "Glass & Gradient" Rule
Use `surface` colors with a 60-80% opacity and a heavy `backdrop-blur` (12px+) for all HUD elements. This creates the "Tactical Overlay" effect, allowing the world's movement to be dimly visible through the UI. Use a subtle linear gradient from `primary` to `primary-container` on high-value progress bars (like Oxygen) to give them a "liquid crystal" glow.

## 3. Typography
We use **Space Grotesk** exclusively. Its monospaced-adjacent proportions evoke digital terminals while remaining highly legible under stress.

*   **Display (The Warning):** `display-sm` to `display-lg`. Used for "CRITICAL FAILURE" or location headers. High-tracking (letter-spacing: 0.1em) to feel like a radar readout.
*   **Headline (The Tool):** `headline-sm`. Used for item names in the inventory. Always uppercase.
*   **Body (The Intel):** `body-md`. Used for lore and item descriptions. Tight line-height for a "data-dense" feel.
*   **Label (The Spec):** `label-sm`. Used for ammo counts and durability percentages. Use `secondary` (Orange) for these to ensure they pop against the teal environment.

## 4. Elevation & Depth: Tonal Layering
In a "Tactical Nautical" environment, traditional shadows feel out of place. We replace them with **Environmental Occlusion.**

*   **The Layering Principle:** To "lift" a component (like a loot pop-up), place a `surface-container-highest` element over a `surface-dim` backdrop. 
*   **Ambient Glow:** Instead of a drop shadow, use a subtle outer glow for active elements. A 4px blur of `surface-tint` at 10% opacity mimics the light bleed of a cracked screen.
*   **Tactical Scratches:** Overlay a "salt-corroded" texture mask (5% opacity) over all `surface` containers to break the "perfect digital" feel.

## 5. Components

### Clean Equipment HUD (The Dock)
*   **Architecture:** Bottom-anchored, horizontal grid.
*   **Slots:** 64x64px squares using `surface-container-lowest`. 
*   **Active State:** When a weapon is selected, the slot gains a `primary` "Ghost Border" and a subtle `surface-tint` inner glow.
*   **Vitals:** Vertical bars to the left of the dock. Health uses `error_container`, Oxygen uses `primary_container`. No borders—only color fills.

### Tactical Buttons
*   **Primary:** Solid `primary` background with `on_primary` text. Sharp 0px corners.
*   **Secondary:** `surface-container-high` background. No border.
*   **States:** On hover, the button should "glitch"—a rapid 0.1s shift to `primary-fixed` and back.

### Input Fields & Terminal Text
*   **Style:** `surface-container-lowest` background with a `primary` underline (2px) instead of a full box.
*   **Error State:** The underline shifts to `error`, and the text jitters 2px horizontally.

### Cards & Lists
*   **Rule:** Forbid divider lines.
*   **Separation:** Use a 12px vertical gap. Items in a list alternate between `surface-container-low` and `surface-container-highest` to create a "zebra-stripe" hierarchy without clutter.

### Additional Component: The "Integrity Gauge"
A circular or semi-circular progress ring for armor/cracked screen health. Use `secondary` (Orange) for the stroke. As integrity drops, add "Static" particles—small 1x1px squares of `on_surface` that flicker near the gauge.

## 6. Do's and Don'ts

*   **DO:** Use `secondary_fixed_dim` (Orange) for all life-threatening information.
*   **DO:** Maintain a "Sharp" profile. All corners must be `0px` to maintain the industrial, professional HUD aesthetic.
*   **DON'T:** Use rounded corners or soft "friendly" shapes. 
*   **DON'T:** Use pure white (#FFFFFF). All "white" text should be `on_surface` (#dfe3e7) to feel like a back-lit screen.
*   **DO:** Lean into "Digital Decay." If an element is disabled, reduce its opacity to 20% and apply a 1px offset to the text to simulate a ghosting monitor.