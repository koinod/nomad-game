#!/usr/bin/env python3
"""GT500 build pipeline (Lane 1) — run with Blender's Python:

  blender -b -noaudio --python tools/gt500/build_gt500.py -- --mode all

Modes: build (OBJ -> public/gt500.glb, verified) | render (proof renders
from the exported GLB) | all.

What it does to the raw free3d rip (~/workspace/gt500-work, read-only):
  * relinks every texture to tools/gt500/textures/*.png (the MTL points
    at .tga names that were never extracted; prep_textures.py converts
    them — tyre/vehiclelights_on/wheel_lod0 — and copies the PNG set)
  * lays the Z-up OBJ flat and re-frames it to the game's GLB
    convention (nose +X, driver's left +Y, up +Z — same frame as
    tools/build_mustang.py), recenters, scales x0.0438 to real S197
    metres (4.79 m long, 2.71 m wheelbase)
  * separates the four wheels into rig-ready objects named
    WheelFL/FR/RL/RR with origins at the axle centres (the game's
    attachMustangGlb rig looks these names up)
  * replaces the body* materials (whose texture is the garbled baked
    NFS livery — the source of the rear-quarter decal bleed) with a
    clean Torch-Red clearcoat paint material
  * exports public/gt500.glb, re-imports it, and asserts the rig
    contract (names, dims, nose direction) before any render is made
"""
import math
import os
import re
import sys

import bpy
from mathutils import Matrix, Vector

SCALE = 0.0438  # OBJ units -> metres (109.26 u long -> 4.79 m)

TYRE_MATS = {"mustang_tyre", "mustang_tyre0", "mustang_tyre1", "mustang_tyre2"}
WHEEL_MATS = TYRE_MATS | {
    "Matte__FFA0A0A0__spec_", "Matte__FFA0A0A0__spec_0",
    "Matte__FFA0A0A0__spec_1", "Matte__FFA0A0A0__spec_2",
    "Matte__FF0000FF__spec_", "Matte__FF0000FF__spec_0",
    "Matte__FF0000FF__spec_1", "Matte__FF0000FF__spec_2",
    "brembo_spt2__spec_", "nodamage_lod0__spec_1",
}


def argv() -> dict:
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {"mode": "all"}
    for i, a in enumerate(args):
        if a.startswith("--"):
            out[a[2:]] = args[i + 1] if i + 1 < len(args) and not args[i + 1].startswith("--") else "1"
    return out


ARGS = argv()
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
TEX_DIR = ARGS.get("tex", os.path.join(HERE, "textures"))
SRC_OBJ = ARGS.get("obj", os.path.expanduser("~/workspace/gt500-work/obj/mustang_GT.obj"))
OUT_GLB = ARGS.get("glb", os.path.join(REPO, "public", "gt500.glb"))
RENDER_DIR = ARGS.get("renders", os.path.join(REPO, "design-refs", "proof-gt500"))


# ---------------------------------------------------------------- build
def relink_images() -> list[str]:
    """Point every TEX_IMAGE node at the lane's PNG set; return the
    names of images that still have no pixels afterwards.

    NB: repointing + reload() on the importer's datablocks leaves them
    empty in headless Blender (size stays 0) — freshly loaded datablocks
    swapped into the nodes work, so that's what this does."""
    def target_for(img) -> str | None:
        base = os.path.basename(img.filepath)
        stem, ext = os.path.splitext(base)
        if ext.lower() == ".tga":
            p = os.path.join(TEX_DIR, stem + ".png")
            if os.path.exists(p):
                return p
        p = os.path.join(TEX_DIR, base)
        return p if os.path.exists(p) else None

    cache: dict[str, bpy.types.Image] = {}
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                tgt = target_for(node.image)
                if tgt:
                    if tgt not in cache:
                        cache[tgt] = bpy.data.images.load(tgt, check_existing=True)
                    node.image = cache[tgt]

    missing: list[str] = []
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and node.image.size[0] == 0:
                b = os.path.basename(node.image.filepath)
                if b not in missing:
                    missing.append(b)
    return missing


def make_paint() -> bpy.types.Material:
    m = bpy.data.materials.get("GT500_Paint")
    if m:
        return m
    m = bpy.data.materials.new("GT500_Paint")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    # Torch Red, clearcoat over a whisper of metallic flake
    bsdf.inputs["Base Color"].default_value = (0.32, 0.008, 0.006, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.15
    bsdf.inputs["Roughness"].default_value = 0.34
    bsdf.inputs["Coat Weight"].default_value = 1.0
    bsdf.inputs["Coat Roughness"].default_value = 0.08
    return m


def build() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=SRC_OBJ)
    obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")

    missing = relink_images()
    print("MISSING IMAGES AFTER RELINK:", missing)

    # Lay flat (Rx -90) + reframe to nose +X / left +Y (Rz -90), apply.
    m = Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Rotation(math.radians(-90), 4, "X")
    obj.matrix_world = m @ obj.matrix_world
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Recenter: plan centre to origin, floor to z=0, then real scale.
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
    cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
    cz = min(v.z for v in bb)
    obj.location = (-cx, -cy, -cz)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.scale = (SCALE, SCALE, SCALE)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    dims = tuple(round(max(v[i] for v in bb) - min(v[i] for v in bb), 3) for i in range(3))
    print("BODY DIMS (m) LxWxH:", dims)

    # --- wheel centres from tyre-face centroids, one cluster per corner
    mesh = obj.data
    mat_names = [m.name if m else "" for m in mesh.materials]
    centres: dict[str, Vector] = {}
    sums: dict[str, list] = {}
    for poly in mesh.polygons:
        if mat_names[poly.material_index] in TYRE_MATS:
            key = ("F" if poly.center.x > 0 else "R") + ("L" if poly.center.y > 0 else "R")
            s = sums.setdefault(key, [Vector((0, 0, 0)), 0])
            s[0] += poly.center
            s[1] += 1
    for key, (acc, n) in sums.items():
        centres["Wheel" + key] = acc / n
    print("WHEEL CENTRES:", {k: tuple(round(c, 3) for c in v) for k, v in centres.items()})
    assert len(centres) == 4, f"expected 4 tyre clusters, got {list(centres)}"

    # --- separate each corner's wheel (tyre + rim + brake) into its own
    # object; membership is material + cylinder test, index-independent.
    for name, c in sorted(centres.items()):
        for o in bpy.context.scene.objects:
            o.select_set(False)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        marked = []
        for poly in mesh.polygons:
            if mat_names[poly.material_index] not in WHEEL_MATS:
                marked.append(False)
                continue
            dx = poly.center.x - c.x
            dz = poly.center.z - c.z
            near = (dx * dx + dz * dz) <= 0.44 ** 2 and abs(poly.center.y - c.y) <= 0.34
            same_corner = (poly.center.x > 0) == (c.x > 0) and (poly.center.y > 0) == (c.y > 0)
            marked.append(bool(near and same_corner))
        if not any(marked):
            raise RuntimeError(f"no faces marked for {name}")
        for poly, sel in zip(mesh.polygons, marked):
            poly.select = sel
        before = set(bpy.context.scene.objects)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.separate(type="SELECTED")
        bpy.ops.object.mode_set(mode="OBJECT")
        new = next(o for o in bpy.context.scene.objects if o not in before)
        new.name = name
        bpy.context.scene.cursor.location = centres[name]
        for o in bpy.context.scene.objects:
            o.select_set(o is new)
        bpy.context.view_layer.objects.active = new
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR", center="MEDIAN")
        print(f"SEPARATED {name}: {len(new.data.polygons)} polys, origin {tuple(round(v,3) for v in new.location)}")

    # --- paint: body* slots -> clean paint material (kills the baked
    # livery and its rear-quarter decal bleed in one move)
    paint = make_paint()
    body = obj
    body.name = "GT500_Body"
    swapped = []
    for i, m in enumerate(body.data.materials):
        if m and re.fullmatch(r"body\d*", m.name):
            body.data.materials[i] = paint
            swapped.append(m.name)
    print("PAINT SLOTS SWAPPED:", len(swapped))

    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_apply=True)
    print("EXPORTED", OUT_GLB, os.path.getsize(OUT_GLB), "bytes")


def verify() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=OUT_GLB)
    names = sorted(o.name for o in bpy.context.scene.objects if o.type == "MESH")
    print("GLB OBJECTS:", names)
    need = {"GT500_Body", "WheelFL", "WheelFR", "WheelRL", "WheelRR"}
    assert need.issubset(set(names)), f"missing rig objects: {need - set(names)}"
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        xs = (min(v.x for v in bb), max(v.x for v in bb))
        ys = (min(v.y for v in bb), max(v.y for v in bb))
        zs = (min(v.z for v in bb), max(v.z for v in bb))
        print(f"  {o.name}: x[{xs[0]:.2f},{xs[1]:.2f}] y[{ys[0]:.2f},{ys[1]:.2f}] z[{zs[0]:.2f},{zs[1]:.2f}] origin={tuple(round(v,3) for v in o.location)}")
        if o.name.startswith("WheelF"):
            assert o.location.x > 0.9, f"{o.name} should sit at the nose (+X)"
    allbb = [o.matrix_world @ Vector(c) for o in bpy.context.scene.objects if o.type == "MESH" for c in o.bound_box]
    L = max(v.x for v in allbb) - min(v.x for v in allbb)
    W = max(v.y for v in allbb) - min(v.y for v in allbb)
    H = max(v.z for v in allbb) - min(v.z for v in allbb)
    print(f"GLB OVERALL L={L:.2f} W={W:.2f} H={H:.2f}")
    assert 4.6 < L < 5.0 and 1.8 < W < 2.1 and 1.3 < H < 1.55, "dims off S197 spec"
    print("VERIFY_OK")


# ---------------------------------------------------------------- render
SHOTS = [
    ("01_front34.png", (4.9, 3.4, 1.5), (0, 0, 0.55)),
    ("02_rear34.png", (-4.9, 3.4, 1.6), (0, 0, 0.55)),
    ("03_side.png", (0.1, 6.6, 0.85), (0, 0, 0.55)),
    ("04_front.png", (6.4, 0, 0.75), (0, 0, 0.55)),
    ("05_rear.png", (-6.4, 0.4, 0.9), (0, 0, 0.55)),
    ("06_top34.png", (3.2, -3.4, 4.4), (0, 0, 0.4)),
    ("07_interior.png", (-0.38, 0.38, 1.06), (0.95, 0.28, 0.78)),
]


def render() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=OUT_GLB)
    scene = bpy.context.scene

    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, -0.01))
    g = bpy.context.active_object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.07, 0.07, 0.08, 1)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
    g.data.materials.append(gm)

    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.10, 0.10, 0.11, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9

    bpy.ops.object.light_add(type="SUN", location=(30, -40, 80))
    sun = bpy.context.active_object
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(35), math.radians(10), math.radians(-30))
    bpy.ops.object.light_add(type="AREA", location=(5, 5, 7))
    key = bpy.context.active_object
    key.data.energy = 900
    key.data.size = 6
    key.rotation_euler = (Vector((5, 5, 7))).to_track_quat("Z", "Y").to_euler()

    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.05
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 900
    scene.render.resolution_y = 675
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"

    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    scene.camera = cam
    cam.data.lens = 42

    os.makedirs(RENDER_DIR, exist_ok=True)
    for name, pos, tgt in SHOTS:
        if name == "07_interior.png":
            bpy.ops.object.light_add(type="POINT", location=(0.1, 0, 1.15))
            bpy.context.active_object.data.energy = 6
        cam.location = pos
        cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(RENDER_DIR, name)
        bpy.ops.render.render(write_still=True)
        print("RENDERED", name, flush=True)
    print("RENDERS_DONE")


if __name__ == "__main__":
    mode = ARGS.get("mode", "all")
    if mode in ("build", "all"):
        build()
        verify()
    if mode in ("render", "all"):
        render()
