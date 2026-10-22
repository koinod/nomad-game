# render_authored2_proofs.py — gate proofs for the wave-2 authored husks.
#
# Rebuilds the class via its build script (runpy, same session), poses
# the RIG EMPTIES with the runtime's own base-pose parameters (the
# values applyAuthoredPose / poseSlump write in Husks.ts/figureKit.ts),
# and renders front / side / 3-4 + a side-by-side vs the interim kit GLB
# at identical framing into design-refs/proof-figures-authored-2/.
#
# Blender mapping (wave 1): three rotation.x -> Blender euler.x (same
# sign); three rotation.z -> Blender euler.y (negated); three position
# (x, up, fwd) -> Blender (x, -fwd, up); three scale (x, up, fwd) ->
# Blender (x, fwd, up).
#
# Run: blender -b -noaudio --python tools/figures/render_authored2_proofs.py -- <kind>
import bpy, math, os, runpy, sys
from mathutils import Vector

WT = os.path.expanduser("~/workspace/nomad-wt/figures-authored-2")
KIND = sys.argv[sys.argv.index('--') + 1]

runpy.run_path(os.path.join(WT, "tools/figures", f"build_{KIND}_authored.py"))

OUT = os.path.join(WT, "design-refs/proof-figures-authored-2")
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.02
scene.cycles.use_denoising = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.13, 0.13, 0.14, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9

bpy.ops.object.light_add(type='SUN', location=(4, -6, 9))
sun = bpy.context.active_object
sun.data.energy = 3.4
sun.rotation_euler = (math.radians(38), math.radians(8), math.radians(-28))
bpy.ops.object.light_add(type='SUN', location=(-6, 5, 4))
fill = bpy.context.active_object
fill.data.energy = 1.2
fill.rotation_euler = (math.radians(55), math.radians(-15), math.radians(140))

bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.001))
g = bpy.context.active_object
g.name = "proofGround"
gm = bpy.data.materials.new("ground"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.09, 0.1, 1)
gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
g.data.materials.append(gm)

bpy.ops.object.camera_add()
cam = bpy.context.active_object
scene.camera = cam
cam.data.lens = 42

O = bpy.data.objects
P = {n: O[n] for n in ('figureRoot', 'torso', 'head', 'jaw', 'armL', 'armR', 'legL', 'legR')}

def slump(torso_x):
    """poseSlump mid-values (wave-1 proof convention)."""
    P['torso'].rotation_euler.x = torso_x
    P['head'].rotation_euler.x = 0.08
    P['head'].rotation_euler.y = -0.20     # the loll (three rotation.z)
    P['armL'].rotation_euler.x = -0.595
    P['armR'].rotation_euler.x = -0.455
    P['armL'].rotation_euler.y = -0.10     # three rotation.z = +0.10
    P['armR'].rotation_euler.y = 0.10

def pose():
    if KIND == 'crawler':
        P['torso'].location = (0, 0, 0.4)
        P['torso'].rotation_euler.x = 1.35
        P['head'].rotation_euler.x = -1.1
        P['armL'].rotation_euler.x = -1.85
        P['armR'].rotation_euler.x = -1.75
        P['legL'].location = (-0.17, 0.2, 0.44)
        P['legR'].location = (0.17, 0.2, 0.44)
        P['legL'].rotation_euler.x = 0.95
        P['legR'].rotation_euler.x = 0.88
        P['figureRoot'].scale = (1, 1, 0.96)
    elif KIND == 'brute':
        P['figureRoot'].scale = (1.22, 1.12, 1)
        P['torso'].rotation_euler.x = 0.24
        P['head'].rotation_euler.x = 0.28
        P['armL'].rotation_euler.x = -0.3
        P['armR'].rotation_euler.x = -0.3
    elif KIND == 'screamer':
        P['torso'].rotation_euler.x = 0.06
        P['head'].rotation_euler.x = -0.25
        P['armL'].rotation_euler.x = -0.42
        P['armR'].rotation_euler.x = -0.34
    elif KIND == 'bloater':
        slump(0.10)
        # no outboard pivot shift — matches applyAuthoredPose after the
        # joint-continuity pass (the shift floated the arms detached)
        P['armL'].rotation_euler.y = -0.38   # three rotation.z = +0.38
        P['armR'].rotation_euler.y = 0.38
    elif KIND == 'stalker':
        slump(0.20)
    else:  # armored, spitter
        slump(0.14)
    bpy.context.view_layer.update()

# framing per kind: (front pos, front tgt, side pos, a34 pos, a34 tgt, res)
FRAMING = {
    'crawler':  ((0, -3.6, 0.8), (0, -0.1, 0.45), (3.6, 0, 0.75), (2.3, -2.7, 1.15), (0, 0, 0.42), (880, 660)),
    'spitter':  ((0, -3.2, 1.08), (0, 0, 0.95), (3.2, 0, 1.08), (1.8, -2.4, 1.55), (0, 0, 0.93), (640, 800)),
    'screamer': ((0, -3.6, 1.2), (0, 0, 1.05), (3.6, 0, 1.2), (2.0, -2.7, 1.7), (0, 0, 1.02), (640, 840)),
    'bloater':  ((0, -3.3, 1.08), (0, 0, 0.95), (3.3, 0, 1.08), (1.85, -2.45, 1.55), (0, 0, 0.93), (660, 800)),
    'stalker':  ((0, -3.35, 1.12), (0, 0, 0.98), (3.35, 0, 1.12), (1.9, -2.5, 1.6), (0, 0, 0.96), (640, 820)),
    'armored':  ((0, -3.3, 1.1), (0, 0, 0.97), (3.3, 0, 1.1), (1.85, -2.45, 1.58), (0, 0, 0.95), (640, 820)),
    'brute':    ((0, -4.1, 1.35), (0, 0, 1.2), (4.1, 0, 1.35), (2.3, -3.0, 1.9), (0, 0, 1.15), (680, 860)),
}
FRONT, FTGT, SIDE, A34, ATGT, RES = FRAMING[KIND]

def shoot(name, pos, target):
    cam.location = Vector(pos)
    cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name, flush=True)

pose()
scene.render.resolution_x, scene.render.resolution_y = RES
shoot(f"{KIND}_front.png", FRONT, FTGT)
shoot(f"{KIND}_side.png", SIDE, FTGT)
shoot(f"{KIND}_a34.png", A34, ATGT)

# ---- side-by-side vs the interim kit mesh (identical framing) ----
K = 1.3 if KIND == 'crawler' else 1.0
bpy.ops.object.select_all(action='SELECT')
O['proofGround'].select_set(False)
bpy.ops.transform.translate(value=(-0.68 * K, 0, 0))
bpy.ops.import_scene.gltf(filepath=os.path.join(WT, "public/figures", f"husk_{KIND}.glb"))
imp = [o for o in bpy.context.selected_objects]
for o in list(imp):
    if o.name.startswith('Plane'):
        bpy.data.objects.remove(o, do_unlink=True)
        imp.remove(o)
bpy.ops.object.select_all(action='DESELECT')
for o in imp: o.select_set(True)
bpy.ops.transform.translate(value=(0.68 * K, 0, 0))
scene.render.resolution_x = 1150
scene.render.resolution_y = 760
shoot(f"{KIND}_side_by_side.png", (1.55 * K, -3.3 * K, 1.35), (0, 0, FTGT[2]))
print("ALL DONE")
