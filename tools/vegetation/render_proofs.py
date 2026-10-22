#!/usr/bin/env python3
"""Vegetation proof renders: before (retired cone/blob scatter) vs
after (modeled GLBs) at eye level, in three dioramas — forest stand,
marsh waterline, dune ridge. Identical layout arrays drive both
versions, so the comparison is the geometry, nothing else.

Run: blender -b --python tools/vegetation/render_proofs.py
Out: design-refs/proof-vegetation/{forest,marsh,dune}_{before,after}.png
"""
import bpy
import os
import random
from math import cos, sin, pi
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
MODELS = os.path.join(WT, "public", "models")
OUT = os.path.join(WT, "design-refs", "proof-vegetation")
os.makedirs(OUT, exist_ok=True)


def srgb(c):
    """hex int -> linear RGBA tuple for Principled base color."""
    def f(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255
    return (f(r), f(g), f(b), 1.0)


def flat_mat(name, hexcolor, rough=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = srgb(hexcolor)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = rough
    return m


TRUNK = None
PINE_GREEN = None
LEAF_GREEN = None
BUSH_GREEN = None
TUFT_GREEN = None


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_world():
    global TRUNK, PINE_GREEN, LEAF_GREEN, BUSH_GREEN, TUFT_GREEN
    TRUNK = flat_mat("trunk", 0x4a3826)
    PINE_GREEN = flat_mat("pine", 0x2c5230)
    LEAF_GREEN = flat_mat("leaf", 0x3a6a34)
    BUSH_GREEN = flat_mat("bush", 0x2a4a2c)
    TUFT_GREEN = flat_mat("tuft", 0x55702e)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 64
    sc.cycles.use_denoising = False
    sc.render.resolution_x = 960
    sc.render.resolution_y = 540
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.45, 0.58, 0.72, 1.0)
    bg.inputs[1].default_value = 0.85
    sc.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", 'SUN'))
    sun.data.energy = 3.2
    sun.rotation_euler = (0.9, 0.2, -0.6)
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 34
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def ground_plane(size, hexcolor, jitter=0.0, ridge_y=None, seed=7):
    rng = random.Random(seed)
    bpy.ops.mesh.primitive_plane_add(size=size)
    p = bpy.context.active_object
    p.data.materials.append(flat_mat(f"g{hexcolor}", hexcolor))
    if jitter or ridge_y is not None:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.subdivide(number_cuts=28)
        bpy.ops.object.mode_set(mode='OBJECT')
        for v in p.data.vertices:
            z = rng.uniform(-jitter, jitter)
            if ridge_y is not None:
                d = (v.co.y - ridge_y) / 3.2
                z += 1.05 * pow(2.71828, -(d * d))
            v.co.z += z
    return p


def water_plane(y_from, size=60):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, y_from + size / 2, -0.04))
    w = bpy.context.active_object
    m = flat_mat("water", 0x1d4e4a, rough=0.25)
    w.data.materials.append(m)
    return w


# ─── before: the retired primitives (World.buildScatter/buildGrass, ────────
# ─── pre-vegetation numbers, same transforms the game used) ─────────────────


def before_pine(x, y, s, rot):
    g = bpy.data.objects.new("pine", None)
    bpy.context.collection.objects.link(g)
    g.location = (x, y, 0)
    g.rotation_euler = (0, 0, rot)
    g.scale = (s, s, s)
    for geo, mat, loc, scl in (
        ("cyl", TRUNK, (0, 0, 1.8), (0.31, 0.31, 1.8)),
        ("cone_lo", PINE_GREEN, (0, 0, 6.2), (2.5, 2.5, 2.6)),
        ("cone_hi", PINE_GREEN, (0, 0, 10.9), (1.7, 1.7, 2.1)),
    ):
        if geo == "cyl":
            bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=2, vertices=5)
        else:
            bpy.ops.mesh.primitive_cone_add(radius1=1, depth=2, vertices=7)
        o = bpy.context.active_object
        o.data.materials.append(mat)
        o.parent = g
        o.location = loc
        o.scale = scl
    return g


def before_leaf(x, y, s, rot):
    g = bpy.data.objects.new("leaf", None)
    bpy.context.collection.objects.link(g)
    g.location = (x, y, 0)
    g.rotation_euler = (0, 0, rot)
    g.scale = (s, s, s)
    bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=2, vertices=5)
    t = bpy.context.active_object
    t.data.materials.append(TRUNK)
    t.parent = g
    t.location = (0, 0, 1.3)
    t.scale = (0.33, 0.33, 1.3)
    for loc, scl in (((0, 0, 3.4), (1.6, 1.6, 1.44)), ((1.1, 0.4, 4.3), (1.12, 1.12, 1.04)),
                     ((-1.0, -0.5, 4.1), (1.04, 1.04, 0.96))):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=1, subdivisions=1)
        o = bpy.context.active_object
        o.data.materials.append(LEAF_GREEN)
        o.parent = g
        o.location = loc
        o.scale = scl
    return g


def before_bush(x, y, s, rot):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.7, subdivisions=1, location=(x, y, 0.3 * s))
    o = bpy.context.active_object
    o.data.materials.append(BUSH_GREEN)
    o.scale = (s, s * 0.7, s)
    o.rotation_euler = (0, 0, rot)
    return o


def before_tuft(x, y, s, rot):
    bpy.ops.mesh.primitive_cone_add(radius1=0.16, depth=0.9, vertices=4, location=(x, y, 0.45 * s))
    o = bpy.context.active_object
    o.data.materials.append(TUFT_GREEN)
    o.scale = (s, s, s)
    o.rotation_euler = (0, 0, rot)
    return o


# ─── after: the modeled GLBs ─────────────────────────────────────────────────

TEMPLATES = {}


def template(cls):
    if cls in TEMPLATES:
        return TEMPLATES[cls]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, f"veg-{cls.replace('_', '-')}.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    tpl = None
    for o in new:
        if o.type == 'MESH' and o.name.startswith('LOD0'):
            tpl = o
        elif o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    tpl.location = (0, 0, -200)
    tpl.hide_render = True
    TEMPLATES[cls] = tpl
    return tpl


def after_instance(cls, x, y, s, rot):
    tpl = template(cls)
    o = tpl.copy()
    bpy.context.collection.objects.link(o)
    o.location = (x, y, 0)
    o.scale = (s, s, s)
    o.rotation_euler = (0, 0, rot)
    o.hide_render = False
    return o


# ─── dioramas (one layout per scene drives before + after) ──────────────────

FOREST = []
_rng = random.Random(42)
for _ in range(7):
    FOREST.append(('loblolly', _rng.uniform(-11, 11), _rng.uniform(2, 16), _rng.uniform(0.85, 1.4), _rng.uniform(0, 6.3)))
for _ in range(5):
    FOREST.append(('live_oak', _rng.uniform(-10, 10), _rng.uniform(3, 14), _rng.uniform(0.9, 1.35), _rng.uniform(0, 6.3)))
for _ in range(8):
    FOREST.append(('wax_myrtle', _rng.uniform(-9, 9), _rng.uniform(0.5, 10), _rng.uniform(0.8, 1.4), _rng.uniform(0, 6.3)))

MARSH = []
for _ in range(22):
    MARSH.append(('needle_rush', _rng.uniform(-11, 11), _rng.uniform(2.2, 4.6), _rng.uniform(0.85, 1.3), _rng.uniform(0, 6.3)))
for _ in range(22):
    MARSH.append(('spartina', _rng.uniform(-11, 11), _rng.uniform(0.4, 3.0), _rng.uniform(0.85, 1.35), _rng.uniform(0, 6.3)))

DUNE = []
for _ in range(34):
    DUNE.append(('dune_grass', _rng.uniform(-12, 12), _rng.uniform(0.5, 6.5), _rng.uniform(0.8, 1.3), _rng.uniform(0, 6.3)))

BEFORE_FN = {'loblolly': before_pine, 'live_oak': before_leaf, 'wax_myrtle': before_bush}


def render_scene(name, layout, ground_fn, cam_pos, cam_target, before_map):
    for version in ('before', 'after'):
        clear_scene()
        cam = setup_world()
        ground_fn()
        for cls, x, y, s, rot in layout:
            if version == 'before':
                fn = before_map.get(cls, before_tuft)
                fn(x, y, s, rot)
            else:
                after_instance(cls, x, y, s, rot)
        cam.location = cam_pos
        d = Vector(cam_target) - Vector(cam_pos)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.render.filepath = os.path.join(OUT, f"{name}_{version}.png")
        bpy.ops.render.render(write_still=True)
        print(f"RENDERED {name}_{version}.png")
        TEMPLATES.clear()


def main():
    render_scene(
        'forest', FOREST,
        lambda: ground_plane(70, 0x39512c, jitter=0.12),
        (0, -8.5, 1.7), (0, 8, 2.2), BEFORE_FN)
    render_scene(
        'marsh', MARSH,
        lambda: (ground_plane(70, 0x4c5a34, jitter=0.05), water_plane(3.2)),
        (0, -6.5, 1.7), (0, 6, 0.6), {})
    render_scene(
        'dune', DUNE,
        lambda: ground_plane(70, 0xc2b280, jitter=0.05, ridge_y=2.0),
        (0, -7.5, 1.7), (0, 6, 1.6), {})


if __name__ == "__main__":
    main()
