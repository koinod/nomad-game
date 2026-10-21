#!/usr/bin/env python3
"""NOMAD Fleet — V-04 Sprinter proof renders.
Opens tools/sprinter/sprinter.blend, renders 7 angles to
design-refs/proof-sprinter/.  07_interior slides the door open first.
Run: blender -b --python tools/sprinter/render_proofs.py -- [shot.png ...]
"""
import bpy, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(argv)

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
OUT = os.path.join(WT, "design-refs", "proof-sprinter")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "sprinter.blend"))

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.03
scene.cycles.threads = 6
scene.render.resolution_x = 1152
scene.render.resolution_y = 720
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -0.3

w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.135, 0.155, 0.175, 1.0)
bg.inputs['Strength'].default_value = 1.0

def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def area(name, loc, energy, size, target=(0, 0, 1.4)):
    bpy.ops.object.light_add(type='AREA', location=loc)
    li = bpy.context.object; li.name = name
    li.data.energy = energy; li.data.shape = 'DISK'; li.data.size = size
    look_at(li, target)
    return li

area("Key", (16, 12, 15), 2400, 12)
area("Fill", (-13, -10, 8), 850, 11)
area("Top", (-1, -3, 20), 1400, 9)

bpy.ops.mesh.primitive_plane_add(size=140, location=(0, 0, -0.01))
gp = bpy.context.object; gp.name = "StudioFloor"
gm = bpy.data.materials.new("floor_mat"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.115, 0.125, 0.135, 1.0)
gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
gp.data.materials.append(gm)

bpy.ops.object.camera_add()
cam = bpy.context.object; scene.camera = cam

def shot(fname, loc, target, lens=38):
    if ONLY and fname not in ONLY:
        print("SKIP", fname); return
    cam.location = loc; cam.data.lens = lens
    look_at(cam, target)
    scene.render.filepath = os.path.join(OUT, fname)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", fname)

def O(name): return bpy.data.objects.get(name)

T = (0, 0, 1.35)
shot("01_front34.png", (11.2, 8.8, 5.6), T)
shot("02_rear34.png", (-11.2, 8.8, 5.2), (0, 0, 1.4))
shot("03_side.png", (0, 17.5, 2.4), (0, 0, 1.3), lens=42)
shot("04_front.png", (13.2, 0.5, 2.1), (0, 0, 1.4), lens=44)
shot("05_rear.png", (-13.2, 0.5, 2.1), (0, 0, 1.4), lens=44)
shot("06_top.png", (0.5, 0.5, 23), (0, 0, 1.0), lens=40)

# ---- 07 interior: slide the port door aft, camera looks in through the aperture
door = O("SlidingSideDoor")
if door:
    door.location.x -= 1.32
    for lx in (-0.2, -2.4):
        bpy.ops.object.light_add(type='POINT', location=(lx, 0.0, 2.0))
        fill = bpy.context.object; fill.name = "CabinFill"; fill.data.energy = 30
        fill.data.color = (1.0, 0.88, 0.72)
# close + wide: the sightline must cross the door plane INSIDE the aperture
shot("07_interior.png", (1.6, 2.7, 1.55), (-1.4, -0.2, 1.1), lens=26)
if door:
    door.location.x += 1.32
print("ALL PROOFS DONE ->", OUT)
