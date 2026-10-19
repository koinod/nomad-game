# NOMAD UI Design Tokens

Dark tactical palette. No phosphor green, no neon. Flat fills, thin borders,
amber used sparingly for the one thing that matters on screen.

| Token   | Hex       | Use                                     |
|---------|-----------|-----------------------------------------|
| Void    | `#0b0e12` | App background, canvas backdrop         |
| Panel   | `#12161c` | Panels, cards, phone, menus             |
| Line    | `#232b36` | Borders, dividers                       |
| Text    | `#d7dde5` | Primary text, crosshair                 |
| Dim     | `#8a94a3` | Secondary text, labels, hints           |
| Signal  | `#e8b34b` | Amber accent — primary actions, quest titles, speaker names, map marker, focus rings |

Supporting state hues (used only where meaning requires them, same CSS vars as `src/index.css`):

| Token  | Hex       | Use                        |
|--------|-----------|----------------------------|
| Danger | `#d9534f` | Health-critical, destructive actions |
| Verdant| `#5aa469` | Health, success checks, weight OK  |

Buttons are sentence case with active-voice verbs ("New game", "Resume", "Save").
Focus rings are `2px solid Signal` via the global `:focus-visible` rule.
