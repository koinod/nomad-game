# contact_sheets.py — LANE 4 proof pipeline, step 3.
# Tiles the per-figure renders in design-refs/proof-figures/ into
# labeled contact sheets for gate review.
# Run: python3 tools/figures/contact_sheets.py
import os
from PIL import Image, ImageDraw

ROOT = os.path.expanduser("~/workspace/nomad-wt/figures")
SRC = os.path.join(ROOT, "design-refs/proof-figures")

HUSKS = ["husk_shambler", "husk_stalker", "husk_armored", "husk_screamer",
         "husk_brute", "husk_crawler", "husk_bloater", "husk_spitter"]
HUMANS = ["survivor_elena", "survivor_mateo", "survivor_lina", "survivor_dez",
          "survivor_priya", "npc_jonah", "npc_kowalski", "player_avatar"]
SPECIALS = ["husk_screamer", "husk_brute", "husk_crawler", "husk_bloater", "husk_spitter"]

def tile(names, angles, out_name, cols):
    cw, chh, label_h = 360, 450, 26
    rows = (len(names) + cols - 1) // cols
    per = len(angles)
    W = cols * cw * per // per  # one column slot per figure (angles side by side inside)
    slot_w = cw * per
    W = cols * slot_w
    H = rows * (chh + label_h)
    sheet = Image.new("RGB", (W, H), (24, 24, 26))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        cx = (i % cols) * slot_w
        cy = (i // cols) * (chh + label_h)
        for j, ang in enumerate(angles):
            p = os.path.join(SRC, f"{name}_{ang}.png")
            if not os.path.exists(p):
                print("missing", p)
                continue
            im = Image.open(p).resize((cw, chh))
            sheet.paste(im, (cx + j * cw, cy + label_h))
        d.text((cx + 8, cy + 6), name, fill=(230, 230, 230))
    sheet.save(os.path.join(SRC, out_name))
    print("wrote", out_name, sheet.size)

tile(HUSKS, ["a34"], "contact_husks.png", 4)
tile(HUMANS, ["a34"], "contact_survivors.png", 4)
for s in SPECIALS:
    tile([s], ["a34", "front", "side"], f"contact_{s}.png", 1)
print("done")
