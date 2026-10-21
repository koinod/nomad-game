# render_proofs.py — LANE 4 proof pipeline, step 2.
# Imports each figure OBJ from tools/figures/obj/, renders 3 angles to
# design-refs/proof-figures/, and exports a posed GLB to public/figures/.
# Run: blender -b -noaudio --python tools/figures/render_proofs.py
import bpy, math, os, sys
from mathutils import Vector

ROOT = os.path.expanduser("~/workspace/nomad-wt/figures")
OBJ_DIR = os.path.join(ROOT, "tools/figures/obj")
OUT = os.path.join(ROOT, "design-refs/proof-figures")
GLB_DIR = os.path.join(ROOT, "public/figures")
os.makedirs(OUT, exist_ok=True)
os.makedirs(GLB_DIR, exist_ok=True)

NAMES = sorted(f[:-4] for f in os.listdir(OBJ_DIR) if f.endswith(".obj"))
if "--" in sys.argv:  # optional: render only the named figures
    want = sys.argv[sys.argv.index("--") + 1:]
    if want:
        NAMES = [n for n in NAMES if n in want]
print("FIGURES:", NAMES)

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 10
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.03
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 480
    scene.render.resolution_y = 600
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.14, 0.14, 0.15, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    bpy.ops.object.light_add(type='SUN', location=(4, -6, 9))
    sun = bpy.context.active_object
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(38), math.radians(8), math.radians(-28))
    bpy.ops.object.light_add(type='SUN', location=(-6, 5, 4))
    fill = bpy.context.active_object
    fill.data.energy = 1.1
    fill.rotation_euler = (math.radians(55), math.radians(-15), math.radians(140))
    return scene

def bbox_of(objs):
    mins = Vector((1e9, 1e9, 1e9)); maxs = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mins = Vector(map(min, mins, w)); maxs = Vector(map(max, maxs, w))
    return mins, maxs

for name in NAMES:
    clear()
    scene = setup_scene()
    bpy.ops.wm.obj_import(filepath=os.path.join(OBJ_DIR, name + ".obj"))
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    mins, maxs = bbox_of(objs)
    size = maxs - mins
    center = (maxs + mins) / 2
    # ground
    bpy.ops.mesh.primitive_plane_add(size=max(size.x, size.y) * 10, location=(center.x, center.y, mins.z - 0.001))
    g = bpy.context.active_object
    gm = bpy.data.materials.new("ground"); gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.09, 0.1, 1)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
    g.data.materials.append(gm)
    # GLB export (posed proof mesh — rig lives in figureKit code)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(GLB_DIR, name + ".glb"),
                              export_format='GLB', use_selection=True)
    # cameras: figure faces -Y in Blender space (OBJ NEGATIVE_Z forward)
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    scene.camera = cam
    cam.data.lens = 40
    H = size.z
    dist = max(size.x, size.y, H) * 1.55
    target = Vector((center.x, center.y, mins.z + H * 0.48))
    shots = {
        "a34": (center.x + dist * 0.62, center.y - dist * 0.78, mins.z + H * 0.62),
        "front": (center.x, center.y - dist, mins.z + H * 0.55),
        "side": (center.x + dist, center.y, mins.z + H * 0.55),
    }
    want_angles = os.environ.get("FIG_ANGLES", "").split(",") if os.environ.get("FIG_ANGLES") else None
    if want_angles:
        shots = {k: v for k, v in shots.items() if k in want_angles}
    for tag, pos in shots.items():
        cam.location = Vector(pos)
        cam.rotation_euler = (target - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(OUT, f"{name}_{tag}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", name, tag, flush=True)
print("ALL DONE")
