#!/usr/bin/env python3
"""NOMAD Fleet — Nomad Prime proof renders.
Opens tools/nomad_prime/nomad_prime.blend, renders the 7-angle gate set to
design-refs/proof-nomad-prime/.  Low-sample proofs (CPU shared with sibling
asset builds).  Optional: pass shot filenames after -- to render a subset.
Run: blender -b --python tools/nomad_prime/render_proofs.py [-- 01_front34.png]
"""
import bpy, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = set(argv)

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
OUT = os.path.join(WT, "design-refs", "proof-nomad-prime")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "nomad_prime.blend"))

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.03
scene.cycles.threads = 4
scene.render.resolution_x = 1152
scene.render.resolution_y = 720
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -0.25

# world: slate studio backdrop like the reference sheet
w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.115, 0.135, 0.155, 1.0)
bg.inputs['Strength'].default_value = 1.0

def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def area(name, loc, energy, size, target=(-0.2, 0, 1.6)):
    bpy.ops.object.light_add(type='AREA', location=loc)
    li = bpy.context.object; li.name = name
    li.data.energy = energy; li.data.shape = 'DISK'; li.data.size = size
    look_at(li, target)
    return li

STUDIO_LIGHTS = [
    area("Key", (10, 12, 14), 3200, 12),
    area("Fill", (-12, -9, 8), 1100, 11),
    area("Top", (-1, -3, 20), 900, 10),
]

bpy.ops.mesh.primitive_plane_add(size=160, location=(0, 0, -0.01))
gp = bpy.context.object; gp.name = "StudioFloor"
gm = bpy.data.materials.new("floor_mat"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.095, 0.105, 0.115, 1.0)
gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
gp.data.materials.append(gm)

bpy.ops.object.camera_add()
cam = bpy.context.object; scene.camera = cam
cam.data.clip_start = 0.05

# interior practicals — the cab is a closed shell, so the exterior studio
# rig never reaches it; two soft points light ONLY the interior shot
INT_LIGHTS = []
for nm, loc, energy in (("IntCab", (0.85, 0.25, 2.15), 42), ("IntSleeper", (-1.20, 0, 2.90), 32)):
    bpy.ops.object.light_add(type='POINT', location=loc)
    li = bpy.context.object; li.name = nm
    li.data.energy = energy; li.data.shadow_soft_size = 0.45
    li.hide_render = True
    INT_LIGHTS.append(li)

def shot(fname, loc, target, lens=40):
    if ONLY and fname not in ONLY:
        print("SKIP", fname); return
    for li in INT_LIGHTS:
        li.hide_render = (fname != "07_interior.png")
    # studio area disks glare through the windshield in the interior shot
    for li in STUDIO_LIGHTS:
        li.hide_render = (fname == "07_interior.png")
    scene.view_settings.exposure = 0.55 if fname == "07_interior.png" else -0.25
    cam.location = loc; cam.data.lens = lens
    look_at(cam, target)
    scene.render.filepath = os.path.join(OUT, fname)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", fname)

# truck spans x -4.25..+4.21, height 3.92; aim mid-body
shot("01_front34.png", (11.5, 8.2, 5.4), (-0.2, 0, 1.5), lens=40)
shot("02_rear34.png", (-11.5, -7.6, 5.2), (-0.1, 0, 1.45), lens=40)
shot("03_side.png", (-0.1, 15.5, 2.0), (-0.1, 0, 1.65), lens=46)
shot("04_front.png", (13.2, 0.4, 2.1), (0.6, 0, 1.55), lens=42)
shot("05_rear.png", (-13.2, 0.4, 2.3), (-0.6, 0, 1.5), lens=42)
shot("06_top.png", (-0.1, 0.9, 19.0), (-0.1, 0, 1.0), lens=40)
# interior: diagonal from the sleeper's passenger corner — bunk foreground,
# both chairs, steering wheel past the driver's seat, dash + screen beyond
shot("07_interior.png", (-1.72, -0.78, 2.12), (1.05, 0.38, 1.52), lens=27)
print("PROOFS DONE")
