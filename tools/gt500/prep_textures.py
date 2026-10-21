#!/usr/bin/env python3
"""GT500 texture prep (Lane 1).

Produces tools/gt500/textures/*.png — the full texture set the Blender
build (build_gt500.py) links against:

1. The working-set PNGs extracted from the free3d archive earlier live
   OUTSIDE the repo at ~/workspace/gt500-work/textures (override with
   $GT500_WORK_DIR). They are copied in verbatim.
2. Four textures exist only as .tga in the original archive
   (design-refs/external-models/mustang-gt500_free3d.rar, committed):
   tyre, wheel_lod0, vehiclelights_on (+ vehiclelights/body, whose PNG
   twins already exist / whose material is replaced by paint). The
   missing ones are extracted with bsdtar and converted with PIL.
   PIL's TGA decode is orientation-correct for this archive: converting
   vehiclelights.tga reproduces the shipped vehiclelights.png with a
   mean abs pixel diff of 0.0 (verified 2026-10-21).

Run once before build_gt500.py. Idempotent.
"""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "textures")
WORK = os.environ.get("GT500_WORK_DIR", os.path.expanduser("~/workspace/gt500-work"))
RAR = os.path.join(REPO, "design-refs", "external-models", "mustang-gt500_free3d.rar")

# Textures the MTL references as .tga that have no working-set PNG twin.
TGA_ONLY = ["tyre", "wheel_lod0", "vehiclelights_on"]


def main() -> int:
    os.makedirs(OUT, exist_ok=True)

    src_pngs = os.path.join(WORK, "textures")
    if not os.path.isdir(src_pngs):
        print(f"working set not found at {src_pngs} (set $GT500_WORK_DIR)", file=sys.stderr)
        return 1
    copied = 0
    for name in sorted(os.listdir(src_pngs)):
        if name.lower().endswith(".png"):
            dst = os.path.join(OUT, name)
            if not os.path.exists(dst):
                shutil.copy2(os.path.join(src_pngs, name), dst)
                copied += 1
    print(f"copied {copied} working-set PNGs")

    missing = [s for s in TGA_ONLY if not os.path.exists(os.path.join(OUT, s + ".png"))]
    if missing:
        if not os.path.exists(RAR):
            print(f"archive not found at {RAR}", file=sys.stderr)
            return 1
        from PIL import Image

        with tempfile.TemporaryDirectory() as tmp:
            for stem in missing:
                arc = f"Mustang_GT/Textures/{stem}.tga"
                subprocess.run(["bsdtar", "-xf", RAR, "-C", tmp, arc], check=True)
                tga = os.path.join(tmp, "Mustang_GT", "Textures", stem + ".tga")
                img = Image.open(tga)
                img.save(os.path.join(OUT, stem + ".png"))
                print(f"converted {stem}.tga -> textures/{stem}.png {img.size} {img.mode}")
    print("textures ready:", len(os.listdir(OUT)), "files in", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
