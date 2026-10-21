#!/usr/bin/env python3
"""NOMAD Lane 2 — Seahawk proof renders.
Opens tools/seahawk/seahawk.blend, renders 6 angles + gunner + cockpit cutaway
to design-refs/proof-seahawk/.  Low-sample proofs (CPU shared with other lanes).
Run: blender -b --python tools/seahawk/render_proofs.py
"""
import bpy, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(argv)  # optional shot filenames to render this run

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
OUT = os.path.join(WT, "design-refs", "proof-seahawk")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "seahawk.blend"))

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

# world: slate studio backdrop like the reference sheet
w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.135, 0.155, 0.175, 1.0)
bg.inputs['Strength'].default_value = 1.0

def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def area(name, loc, energy, size, target=(0.5, 0, 2.0)):
    bpy.ops.object.light_add(type='AREA', location=loc)
    li = bpy.context.object; li.name = name
    li.data.energy = energy; li.data.shape = 'DISK'; li.data.size = size
    look_at(li, target)
    return li

area("Key", (20, 15, 17), 2600, 14)
area("Fill", (-16, -12, 9), 900, 12)
area("Top", (-2, -4, 24), 1500, 10)

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

# ---- standard angles, doors closed
shot("01_front34.png", (20, 15.5, 9.5), (0.3, 0, 2.0))
shot("02_rear34.png", (-20, -15, 8.5), (-0.3, 0, 2.1))
shot("03_side.png", (0.4, 26, 3.4), (0.4, 0, 2.0), lens=42)
shot("04_front.png", (26, 0.5, 2.8), (0, 0, 2.1), lens=44)
shot("05_top.png", (0.6, 0.6, 31), (0.5, 0, 1.6), lens=40)

# ---- door gunner: port door slid aft, gun swung out
door = O("DoorPivot_Port"); gun = O("GunPivot_Port")
door.location.x -= 1.04
gun.rotation_euler = (0, 0, math.radians(28))
shot("06_door_gunner.png", (8.6, 7.6, 2.6), (3.2, 1.0, 1.55), lens=52)
door.location.x += 1.04
gun.rotation_euler = (0, 0, 0)

# ---- cockpit cutaway: hide shell, camera at pilot eye
for nm in ("SH_Fuselage", "SH_AntiGlare", "SH_Doghouse", "SH_WindshieldPillar",
           "DoorPivot_Port", "DoorPivot_Stbd", "SH_DoorRailPort", "SH_DoorRailStbd"):
    ob = O(nm)
    if ob: ob.hide_render = True
shot("07_cockpit.png", (5.02, -0.62, 2.06), (7.0, -0.25, 1.88), lens=30)
print("ALL PROOFS DONE ->", OUT)
