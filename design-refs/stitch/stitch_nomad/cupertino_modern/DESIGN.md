# Design System Documentation

## 1. Overview & Creative North Star: "Precision Silence"

This design system is not a set of components; it is a philosophy of restraint. The Creative North Star is **Precision Silence**. In a world of digital noise, this system seeks to vanish, leaving only the product and the user’s intent. We achieve a "premium" feel not through decoration, but through the obsessive calibration of whitespace, typographic rhythm, and tonal depth.

To break the "template" look, we move away from rigid, boxed-in grids. Instead, we embrace **Intentional Asymmetry**—placing elements with editorial purpose, allowing images to bleed off the canvas, and using "active" whitespace to guide the eye. This system is designed to feel like an art gallery: the walls (UI) are secondary to the masterpieces (content).

---

## 2. Colors & Tonal Architecture

Our palette is rooted in a monochromatic foundation, punctuated by a single, high-energy accent (`primary`). This creates an environment of authority and focus.

### The "No-Line" Rule
Explicitly prohibited: 1px solid borders for sectioning or containment. Traditional lines create visual clutter. Boundaries must be defined solely through background color shifts or subtle tonal transitions. For example, a `surface-container-low` section should sit directly against a `background` without a stroke to define its start.

### Surface Hierarchy & Nesting
We treat the UI as a series of physical layers—stacked sheets of fine paper. 
- **Base Layer:** `background` (#f9f9fb).
- **Secondary Layer:** `surface-container-low` (#f3f3f5) for large content blocks.
- **Interaction Layer:** `surface-container-highest` (#e2e2e4) for hovered elements or distinct functional zones.

### The "Glass & Gradient" Rule
To elevate the experience beyond flat design:
- **Glassmorphism:** For floating navigation or modal overlays, use semi-transparent `surface` colors with a high `backdrop-blur` (20px+). This allows the content behind to bleed through, creating a sense of environmental continuity.
- **Signature Textures:** Main CTAs and Hero backgrounds should use a subtle linear gradient (from `primary` #004e9f to `primary_container` #0066cc). This provides a "soul" and professional polish that prevents the interface from feeling sterile.

---

## 3. Typography: The Editorial Voice

Typography is our primary tool for brand expression. We utilize a high-contrast scale to create an editorial feel.

- **Display & Headline (SF Pro Display / Inter):** These are your "vocal" levels. Use `display-lg` (3.5rem) and `headline-lg` (2rem) to anchor a page. The goal is to convey authority through generous letter-spacing and substantial vertical "breathing room."
- **Body & Label (SF Pro Text / Inter):** These are your "functional" levels. `body-lg` (1rem) is the workhorse. It must always prioritize legibility with a line-height of at least 1.5x to maintain the minimalist aesthetic.
- **Hierarchy of Intent:** We use scale, not just weight, to show importance. A large `display-sm` headline in a lighter weight often feels more premium than a small, bold `title-md`.

---

## 4. Elevation & Depth: Tonal Layering

We reject traditional shadows in favor of **Tonal Layering**. Depth is a result of light and material, not "drop shadow" effects.

- **The Layering Principle:** Place a `surface-container-lowest` card (#ffffff) on a `surface-container-low` (#f3f3f5) background. The delta in lightness creates a soft, natural lift that mimics high-end stationery.
- **Ambient Shadows:** If a floating effect is required (e.g., for a top-level menu), shadows must be extra-diffused. Use a blur of 30px–60px and an opacity of 4%–8%. The shadow color must be a tinted version of `on-surface`, never a neutral grey.
- **The "Ghost Border" Fallback:** If a container absolutely requires a boundary for accessibility, use the `outline-variant` token at 10%–20% opacity. Forbid 100% opaque, high-contrast borders.

---

## 5. Components

### Buttons
- **Primary:** Rounded (`full`), utilizing the signature `primary` to `primary_container` gradient. No border.
- **Secondary:** `surface-container-high` background with `on-surface` text. This feels integrated, not "pasted on."
- **Tertiary:** Text-only with an icon, using `primary` color. High padding (12px 24px) ensures a large hit target despite the minimal footprint.

### Input Fields
Avoid the "boxed" look. Use a `surface-container-lowest` background with a `Ghost Border` (15% `outline-variant`). On focus, transition the border to a 1px `primary` stroke and add a subtle `primary_fixed` outer glow.

### Cards & Lists
**Strict Rule:** No divider lines. Separate list items using vertical white space (at least 24px) or subtle background shifts. For cards, use the `surface-container-lowest` token to create a clean, elevated surface. 

### Chips
Use `secondary_container` for the background with `on_secondary_container` for text. Shapes should be `full` rounded to mimic the smooth pebble-like aesthetic of premium hardware.

---

## 6. Do's and Don'ts

### Do:
- **Embrace Asymmetry:** Center-aligned text is safe; asymmetrical layouts are intentional. Try offsetting images from text blocks to create a "pacing" effect.
- **Prioritize the Content:** If a UI element (like a button or a menu) is competing with the product image, reduce the UI's visual weight.
- **Use "Active" Whitespace:** Use whitespace to group elements. If two items are related, keep them close; if they are different topics, provide a massive gap (e.g., 120px+).

### Don't:
- **Don't use 1px Dividers:** Use color blocks or space. Dividers are the "crutch" of a cluttered layout.
- **Don't use Generic Shadows:** Avoid "Box Shadows" that look like 2010-era web design. If it doesn't look like ambient light, don't use it.
- **Don't Over-crowd:** If you feel the need to "fill the space," stop. Minimalist luxury is defined by what you leave out.
- **Don't mix Corner Radii:** Stick strictly to the Roundedness Scale. Mixing `sm` and `xl` on the same screen breaks the visual harmony.