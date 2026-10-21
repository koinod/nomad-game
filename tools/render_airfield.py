#!/usr/bin/env python3
"""
NOMAD — airfield gate contact sheet. Imports the kit-built airfield
(OBJ exported from the real TS kit via tools/export_airfield.ts) and
renders exterior + interior shots with a sun rig, so the main agent can
judge materials / proportions / interiors before World wiring.

Usage:
  blender --background --python tools/render_airfield.py -- \
      --out ~/workspace/nomad/design-refs/proof-airfield
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
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

man = json.load(open('/tmp/airfield_manifest.json'))
B = {b['id']: b for b in man['buildings']}
smin = man['scene']['min']
smax = man['scene']['max']
center = [(smin[i] + smax[i]) / 2 for i in range(3)]
grade = smin[1]


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
bpy.ops.wm.obj_import(filepath='/tmp/airfield.obj')

# ground apron of earth under the plateau works
gm = bpy.data.materials.new('Ground')
gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb(0x4A5548)
gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1.0
bpy.ops.mesh.primitive_plane_add(size=600, location=G(center[0], grade - 0.15, center[2]))
ground = bpy.context.object
ground.data.materials.append(gm)

# ---- sun rig: the game's midday — directional sun + sky fill + bounce
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
sun.location = G(center[0] + 60, grade + 120, center[2] + 40)


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()


look_at(sun, G(center[0], grade, center[2]))


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

H = B['airfield_hangar']['center']
D = B['airfield_depot']['center']
T = B['airfield_tower']['center']
hmin = B['airfield_hangar']['min']
hmax = B['airfield_hangar']['max']

SHOTS = [
    # whole plateau from the SE, sun-side
    ('01_overview', (center[0] + 100, grade + 58, center[2] + 110),
     (center[0], grade + 4, center[2]), 40),
    # hangar: the great open front faces S (+z game) — shoot from SSE
    ('02_hangar_front', (H[0] + 30, grade + 6, H[2] + 46),
     (H[0], grade + 5, H[2]), 40),
    # hangar interior: in through the open front, looking to the back wall
    ('03_hangar_interior', (H[0] + 11, grade + 2.4, H[2] + 9),
     (H[0] - 8, grade + 3.2, H[2] - 10), 30),
    # depot front (bays face S too)
    ('04_depot_front', (D[0] - 22, grade + 4.5, D[2] + 32),
     (D[0], grade + 3, D[2]), 40),
    # depot interior through the open bay
    ('05_depot_interior', (D[0] - 6, grade + 2.2, D[2] + 4.5),
     (D[0] + 7, grade + 2.4, D[2] - 5), 30),
    # tower: low angle to the glazed cab
    ('06_tower', (T[0] + 17, grade + 2.2, T[2] + 23),
     (T[0], grade + 10.5, T[2]), 44),
]
for (name, loc, tgt, lens) in SHOTS:
    cam.location = G(*loc)
    cam_data.lens = lens
    look_at(cam, G(*tgt))
    scene.render.filepath = os.path.join(args.out, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', name)
print('AIRFIELD SHEET DONE')
