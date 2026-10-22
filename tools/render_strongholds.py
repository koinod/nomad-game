#!/usr/bin/env python3
"""
NOMAD — sector stronghold contact sheets. Imports the kit-built
sectors (OBJ exported from the real TS kits via
tools/export_strongholds.ts) plus the whole ground-works layer, and
renders eye-level + overhead shots per sector with the game's midday
sun rig, as gate proof for the §3.2 build-out.

Usage:
  blender --background --python tools/render_strongholds.py -- \
      --out ~/workspace/nomad/design-refs/proof-strongholds
"""
import argparse
import json
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--only', default='', help='render only shots whose name contains this')
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

man = json.load(open('/tmp/strong_manifest.json'))

# sector id -> (pad center x, z, pad grade)
SECTORS = {
    'ridge': (-520, -185, 60.0),
    'citadel': (268, -252, 2.6),
    'lighthouse': (618, -218, 3.2),
    'refuge': (-30, -10, 4.4),
    'pier_hq': (-478, 222, 2.2),
    'tern_rock': (392, 168, 2.9),
}


def G(x, y, z):
    """game coords (x east, y up, z south) -> Blender (x, -z, y)."""
    return Vector((x, -z, y))


def srgb(hexv):
    r = ((hexv >> 16) & 0xFF) / 255.0
    g = ((hexv >> 8) & 0xFF) / 255.0
    b = (hexv & 0xFF) / 255.0

    def f(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def import_obj(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.wm.obj_import(filepath=path)
    return [o for o in bpy.context.scene.objects if o not in before]


sector_objs = {sid: import_obj(f'/tmp/strong_{sid}.obj') for sid in SECTORS}
ground_objs = import_obj('/tmp/strong_ground.obj')

# ---- ground: the sea everywhere + an earth apron per sector at grade
sea_m = bpy.data.materials.new('Sea')
sea_m.use_nodes = True
sea_m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb(0x39586B)
sea_m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.55
bpy.ops.mesh.primitive_plane_add(size=2400, location=G(0, -0.5, 0))
sea = bpy.context.object
sea.data.materials.append(sea_m)

earth_m = bpy.data.materials.new('Earth')
earth_m.use_nodes = True
earth_m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb(0x4A5548)
earth_m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
aprons = {}
for sid, (cx, cz, grade) in SECTORS.items():
    bpy.ops.mesh.primitive_plane_add(size=300, location=G(cx, grade - 0.15, cz))
    apron = bpy.context.object
    apron.data.materials.append(earth_m)
    aprons[sid] = apron

# ---- sun rig: the game's midday
world = bpy.data.worlds.new('Sky')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.45, 0.58, 0.75, 1)
bg.inputs[1].default_value = 0.85

sun_data = bpy.data.lights.new('Sun', 'SUN')
sun_data.energy = 3.2
sun_data.angle = 0.06
sun = bpy.data.objects.new('Sun', sun_data)
scene.collection.objects.link(sun)
sun.location = G(60, 160, 40)


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()


look_at(sun, G(0, 0, 0))

cam_data = bpy.data.cameras.new('Cam')
cam_data.lens = 40
cam = bpy.data.objects.new('Cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x = 1152
scene.render.resolution_y = 832
scene.view_settings.view_transform = 'Filmic'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = 0.4


def show_only(sector):
    for sid, objs in sector_objs.items():
        for o in objs:
            o.hide_render = sid != sector
    for sid, apron in aprons.items():
        apron.hide_render = sid != sector
    for o in ground_objs:
        o.hide_render = False  # world ground works belong to every shot


# (sector, name, cam, target, lens) — game coords
SHOTS = [
    ('ridge', 'ridge_bunker', (-528, 63.4, -182), (-549, 62.0, -210), 40),
    ('ridge', 'ridge_tower', (-466, 63.5, -184), (-491, 66.5, -208), 44),
    ('ridge', 'ridge_overhead', (-486, 185, -128), (-519, 60, -191), 40),
    ('citadel', 'citadel_gate', (268, 5.4, -230), (268, 4.6, -285), 40),
    ('citadel', 'citadel_yard', (284, 6.0, -180), (238, 4.0, -238), 40),
    ('citadel', 'citadel_overhead', (303, 135, -182), (250, 2.6, -240), 40),
    ('lighthouse', 'lighthouse_labs', (582, 5.6, -176), (632, 5.0, -216), 40),
    ('lighthouse', 'lighthouse_overhead', (643, 115, -173), (617, 3.2, -219), 40),
    ('refuge', 'refuge_chapel', (-14, 6.8, -6), (-31, 6.4, -33), 40),
    ('refuge', 'refuge_greenhouse', (-28, 6.6, 28), (-53, 5.6, 16), 40),
    ('refuge', 'refuge_overhead', (-8, 125, 32), (-31, 4.4, -11), 40),
    ('pier_hq', 'pier_boardwalk', (-501, 4.8, 213), (-542, 3.6, 225), 40),
    ('pier_hq', 'pier_icehouse', (-464, 4.6, 199), (-493, 4.2, 211), 40),
    ('pier_hq', 'pier_overhead', (-488, 105, 259), (-506, 2.2, 221), 40),
    ('tern_rock', 'tern_street', (396, 5.6, 138), (368, 4.6, 186), 40),
    ('tern_rock', 'tern_cottage', (411, 5.2, 175), (425, 5.6, 198), 40),
    ('tern_rock', 'tern_dock', (490, 5.0, 195), (532, 3.8, 209), 40),
    ('tern_rock', 'tern_overhead', (447, 135, 221), (419, 2.9, 174), 40),
]
for (sector, name, loc, tgt, lens) in SHOTS:
    if args.only and args.only not in name:
        continue
    show_only(sector)
    cam.location = G(*loc)
    cam_data.lens = lens
    look_at(cam, G(*tgt))
    scene.render.filepath = os.path.join(args.out, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', name)
print('STRONGHOLD SHEETS DONE')
