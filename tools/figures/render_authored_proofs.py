# render_authored_proofs.py — gate proofs for the authored shambler.
#
# Rebuilds the figure via build_shambler_authored.py (same session), then
# poses the RIG EMPTIES with the runtime's own pose parameters — the
# poseSlump bases and the Husks.update walk-swing / attack values — and
# renders the gate set to design-refs/proof-figures-authored/. Poses are
# applied to the pivot nodes, never by re-posing loose geometry.
#
# Pose parameter sources (verbatim from the game):
#  - idle slump: figureKit poseSlump(rig, 0.14, vrnd): torso.x .14,
#    head loll z .20 (Blender: about the forward axis), head.x .08,
#    armL.x -.595, armR.x -.455 (hang mids of the vrnd ranges).
#  - walk extreme: Husks.update hunt swing, swAmp .36: legL.x = +.36,
#    legR.x = -.36, armL.x = pose - .36*.65, armR.x = pose + .36*.65.
#  - lunge: attack read — torso pitched +.35 over its slump, arms
#    reaching (-1.9 / -1.7), jaw open .6 (the jaw travel Husks writes).
#
# Run: blender -b -noaudio --python tools/figures/render_authored_proofs.py
import bpy, math, os
from mathutils import Vector

ROOT = os.path.expanduser("~/workspace/nomad-wt/figures-authored")

exec(compile(open(os.path.join(ROOT, "tools/figures/build_shambler_authored.py")).read(),
             "build_shambler_authored", "exec"))

OUT = os.path.join(ROOT, "design-refs/proof-figures-authored")  # after exec: build's OUT is the GLB path
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.02
scene.cycles.use_denoising = False
scene.render.resolution_x = 640
scene.render.resolution_y = 800
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

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.001))
g = bpy.context.active_object
gm = bpy.data.materials.new("ground"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.09, 0.1, 1)
gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
g.data.materials.append(gm)

bpy.ops.object.camera_add()
cam = bpy.context.active_object
scene.camera = cam
cam.data.lens = 42

O = bpy.data.objects
PIVOTS = {n: O[n] for n in ('torso', 'head', 'jaw', 'armL', 'armR', 'legL', 'legR')}

def pose_idle():
    for p in PIVOTS.values(): p.rotation_euler = (0, 0, 0)
    PIVOTS['torso'].rotation_euler.x = 0.14
    PIVOTS['head'].rotation_euler.x = 0.08
    PIVOTS['head'].rotation_euler.y = -0.20   # the loll (forward-axis roll)
    PIVOTS['armL'].rotation_euler.x = -0.595
    PIVOTS['armR'].rotation_euler.x = -0.455
    bpy.context.view_layer.update()

def pose_walk():
    pose_idle()
    PIVOTS['legL'].rotation_euler.x = 0.36
    PIVOTS['legR'].rotation_euler.x = -0.36
    PIVOTS['armL'].rotation_euler.x = -0.595 - 0.36 * 0.65
    PIVOTS['armR'].rotation_euler.x = -0.455 + 0.36 * 0.65
    bpy.context.view_layer.update()

def pose_lunge():
    pose_idle()
    PIVOTS['torso'].rotation_euler.x = 0.14 + 0.35
    PIVOTS['armL'].rotation_euler.x = -1.9
    PIVOTS['armR'].rotation_euler.x = -1.7
    PIVOTS['head'].rotation_euler.x = -0.2
    PIVOTS['jaw'].rotation_euler.x = 0.6
    bpy.context.view_layer.update()

def shoot(name, pos, target, lens=42):
    cam.data.lens = lens
    cam.location = Vector(pos)
    cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name, flush=True)

pose_idle()
shoot("shambler_front.png", (0, -3.1, 1.05), (0, 0, 0.92))
shoot("shambler_side.png", (3.1, 0, 1.05), (0, 0, 0.92))
shoot("shambler_a34.png", (1.75, -2.35, 1.5), (0, 0, 0.9))
shoot("shambler_head.png", (0.28, -0.62, 1.74), (0, -0.03, 1.70), lens=55)
pose_walk()
shoot("shambler_pose_walk.png", (1.75, -2.35, 1.5), (0, 0, 0.9))
pose_lunge()
shoot("shambler_pose_lunge.png", (1.75, -2.35, 1.5), (0, 0, 0.9))

# ---- side-by-side vs the interim kit mesh (identical framing) ----
pose_idle()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.transform.translate(value=(-0.62, 0, 0))
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "public/figures/husk_shambler.glb"))
imp = [o for o in bpy.context.selected_objects]
bpy.ops.transform.translate(value=(0.62, 0, 0))
scene.render.resolution_x = 1150
scene.render.resolution_y = 760
shoot("side_by_side.png", (1.55, -3.1, 1.35), (0, 0, 0.9))
print("ALL DONE")
