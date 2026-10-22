# render_joint_proofs.py — JOINT CONTINUITY gate proofs (2026-10-21).
#
# Per authored kind: rebuild via runpy, pose the rig at BASE, at the
# WALK extreme (max swing) and at a DEEP REACH (attack wind-up), and
# render closeups framed on the joint subtrees — shoulders from the
# front (the historic detachment site), legs from the side (hip + knee
# profile). Output: design-refs/proof-figures-joints/.
#
# Run: blender -b -noaudio --python tools/figures/render_joint_proofs.py -- <kind|all>
import bpy, math, os, runpy, sys
from mathutils import Vector

WT = os.path.expanduser("~/workspace/nomad-wt/figures-authored-2")
WHICH = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'all'
KINDS = ['shambler', 'crawler', 'spitter', 'screamer', 'bloater', 'stalker', 'armored', 'brute']
OUT = os.path.join(WT, "design-refs/proof-figures-joints")
os.makedirs(OUT, exist_ok=True)


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.03
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 560
    scene.render.resolution_y = 560
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
    return cam


def slump(P, tx):
    P['torso'].rotation_euler.x = tx
    P['head'].rotation_euler.x = 0.08
    P['head'].rotation_euler.y = -0.20
    P['armL'].rotation_euler.x = -0.595
    P['armR'].rotation_euler.x = -0.455
    P['armL'].rotation_euler.y = -0.10
    P['armR'].rotation_euler.y = 0.10


def apply_pose(kind, P, variant):
    # ---- base (mirrors applyAuthoredPose / poseSlump mid-values) ----
    if kind == 'crawler':
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
    elif kind == 'brute':
        P['figureRoot'].scale = (1.22, 1.12, 1)
        P['torso'].rotation_euler.x = 0.24
        P['head'].rotation_euler.x = 0.28
        P['armL'].rotation_euler.x = -0.3
        P['armR'].rotation_euler.x = -0.3
    elif kind == 'screamer':
        P['torso'].rotation_euler.x = 0.06
        P['head'].rotation_euler.x = -0.25
        P['armL'].rotation_euler.x = -0.42
        P['armR'].rotation_euler.x = -0.34
    elif kind == 'bloater':
        slump(P, 0.10)
        P['armL'].rotation_euler.y = -0.38
        P['armR'].rotation_euler.y = 0.38
    elif kind == 'stalker':
        slump(P, 0.20)
    else:  # shambler, spitter, armored
        slump(P, 0.14)
    # ---- variants ----
    if variant == 'walk':
        if kind == 'crawler':
            P['legL'].rotation_euler.x = 1.25
            P['legR'].rotation_euler.x = 0.58
            P['armL'].rotation_euler.x = -1.55
            P['armR'].rotation_euler.x = -2.05
        else:
            sw = 0.2 if kind == 'brute' else 0.36
            P['legL'].rotation_euler.x += sw
            P['legR'].rotation_euler.x -= sw
            P['armL'].rotation_euler.x -= 0.23
            P['armR'].rotation_euler.x += 0.23
    elif variant == 'reach':
        if kind == 'crawler':
            P['armL'].rotation_euler.x = -2.3
        else:
            P['armL'].rotation_euler.x = -1.25
    bpy.context.view_layer.update()


def subtree_bbox(roots):
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for root in roots:
        for o in [root] + list(root.children_recursive):
            if o.type != 'MESH':
                continue
            ev = o.evaluated_get(dg)
            for c in ev.bound_box:
                w = ev.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi


def frame(cam, P, shot):
    if shot == 'shoulders_front':
        lo, hi = subtree_bbox([P['armL'], P['armR'], P['torso']])
        # crop to the shoulder band (top 45% of the union box)
        hi2 = hi.copy(); lo2 = lo.copy()
        lo2.z = hi.z - (hi.z - lo.z) * 0.45
        target = (lo2 + hi2) / 2
        r = max(hi2.x - lo2.x, hi2.z - lo2.z)
        dist = r * 1.15 + 0.30
        cam.location = target + Vector((0, -dist, dist * 0.10))
    else:  # legs_side
        lo, hi = subtree_bbox([P['legL'], P['legR']])
        tlo, thi = subtree_bbox([P['torso']])
        lo.z = min(lo.z, thi.z - (thi.z - tlo.z) * 0.35)  # include the hip band
        target = (lo + hi) / 2
        r = max(hi.y - lo.y, hi.z - lo.z)
        dist = r * 1.05 + 0.30
        cam.location = target + Vector((dist, 0, dist * 0.08))
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()


for kind in (KINDS if WHICH == 'all' else [WHICH]):
    for variant in ('base', 'walk', 'reach'):
        runpy.run_path(os.path.join(WT, "tools/figures", f"build_{kind}_authored.py"))
        cam = setup_scene()
        O = bpy.data.objects
        P = {n: O[n] for n in ('figureRoot', 'torso', 'head', 'jaw', 'armL', 'armR', 'legL', 'legR')}
        apply_pose(kind, P, variant)
        for shot in ('shoulders_front', 'legs_side'):
            frame(cam, P, shot)
            bpy.context.scene.render.filepath = os.path.join(OUT, f"{kind}_{variant}_{shot}.png")
            bpy.ops.render.render(write_still=True)
            print("RENDERED", kind, variant, shot)
print("JOINT PROOFS DONE")
