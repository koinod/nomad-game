# build_stalker_authored.py — AUTHORED FIGURES WAVE 2: the stalker.
#
# Lean and pale: a gaunt 0.35 frame at 1.95m washed to a bloodless
# grey pallor, face sunk in deep sockets — and a modeled HOOD shell
# over the skull (front window torn open), the silhouette the interim
# kit only hints at with a slim build. Dark slate clothing, long
# sleeves, long fingers: a thing built to close distance quietly.
#
# Run: blender -b -noaudio --python tools/figures/build_stalker_authored.py
import bpy, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import authored_lib as L

random.seed(2205)
bpy.ops.wm.read_factory_settings(use_empty=True)

OUT = os.path.join(L.WT, "public/figures/husk_stalker_authored.glb")

# ---- stalker rig constants (figureKit at H = 1.95, slim, gaunt .35) ----
HIP_Y = 0.936
HIP_X = 0.0922           # 0.055H * 0.86
SHOULDER_LOCAL = 0.6533  # 0.335H
ARM_X = 0.1984           # chestW .314 * .52 + .035
HEAD_WORLD = HIP_Y + 0.7313   # + 0.375H
SKULL_Y = 1.85           # HitProfile headY
ARM_S = 0.756 / 0.648
LEG_S = 0.897 / 0.828
HS = 1.95 / 1.8

mats = {
    'skin': L.principled("huskSkin", L.srgb(0x98979b), rough=0.6, sss=0.3),
    'shirt': L.principled("tornShirt", L.srgb(0x46465a), rough=0.96),
    'pants': L.principled("pantsMat", L.srgb(0x2e2e36), rough=0.97),
    'dark': L.principled("darkMat", L.srgb(0x232329), rough=0.9),
    'hair': L.principled("hairMat", L.srgb(0x2c2320), rough=1.0),
    'eyes': L.eyes_material(),
}

# -------------------------------------------------------------- torso ----
SKIN_PROFILE = [
    (0.861, 0.134, 0.091), (0.926, 0.142, 0.096), (0.991, 0.133, 0.090),
    (1.056, 0.120, 0.085), (1.121, 0.116, 0.083), (1.186, 0.122, 0.086),
    (1.251, 0.134, 0.093), (1.316, 0.145, 0.098), (1.381, 0.152, 0.101),
    (1.446, 0.154, 0.099), (1.506, 0.158, 0.093), (1.560, 0.150, 0.084),
    (1.608, 0.109, 0.069),
]
skin_clay = [L.loft_mesh("sc_loft", SKIN_PROFILE),
    L.blob("sc_trapL", (-0.090, 0.002, 1.595), (0.090, 0.068, 0.049)),
    L.blob("sc_trapR", (0.090, 0.002, 1.595), (0.090, 0.068, 0.049)),
    L.blob("sc_neckbase", (0, 0.0, 1.628), (0.057, 0.053, 0.049)),
]
torso_skin = L.finish_part(L.join_all(skin_clay, "torsoSkin"), (0, 0, HIP_Y), 0.012, mats['skin'], 6200, smooth=3)

SHIRT_PROFILE = [
    (0.900, 0.146, 0.100), (0.965, 0.153, 0.104), (1.030, 0.144, 0.099),
    (1.095, 0.131, 0.094), (1.160, 0.127, 0.092), (1.225, 0.133, 0.095),
    (1.290, 0.145, 0.102), (1.355, 0.156, 0.107), (1.420, 0.163, 0.109),
    (1.485, 0.164, 0.105), (1.545, 0.161, 0.101), (1.590, 0.152, 0.092),
]
shirt_clay = [L.loft_mesh("sh_loft", SHIRT_PROFILE),
    L.taper("sh_collar", (0, 0.0, 1.610), 0.068, 0.056, 0.06),
]
torso_mesh = L.finish_part(L.join_all(shirt_clay, "torsoMesh"), (0, 0, HIP_Y), 0.012, mats['shirt'], 7000, smooth=3)
L.jitter_hem(torso_mesh, 0.05, 0.035)

pants_clay = [
    L.blob("pp_hips", (0, 0.002, HIP_Y - 0.055), (0.162, 0.112, 0.094)),
    L.blob("pp_crotch", (0, 0.0, HIP_Y - 0.135), (0.140, 0.100, 0.05)),
]
pants_pelvis = L.finish_part(L.join_all(pants_clay, "pantsPelvis"), (0, 0, HIP_Y), 0.012, mats['pants'], 2800)

# --------------------------------------------------------------- head ----
head = L.build_head(SKULL_Y, HS, mats, gaunt=0.35, hair='none')
# The hood: a shell over the skull with the face window torn out, plus
# a fall of cloth down the back of the neck.
hood = L.finish_part(L.blob("hoodMesh", (0, 0.018, SKULL_Y + 0.018), (0.138, 0.142, 0.163)),
                     (0, 0.018, SKULL_Y + 0.018), 0.009, mats['dark'], 2600)
_me = hood.data
_kill = [p.index for p in _me.polygons
         if p.center.y < -0.052 and p.center.z < 0.062 and abs(p.center.x) < 0.115]
bpy.ops.object.select_all(action='DESELECT')
hood.select_set(True)
bpy.context.view_layer.objects.active = hood
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')
for i in _kill: _me.polygons[i].select = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='FACE')
bpy.ops.object.mode_set(mode='OBJECT')
hood_tail = L.finish_part(L.blob("hoodTail", (0, 0.105, SKULL_Y - 0.115), (0.105, 0.045, 0.135)),
                          (0, 0.105, SKULL_Y - 0.115), 0.010, mats['dark'], 900)

# --------------------------------------------------------------- arms ----
arm_l, hand_l, sleeve_l = L.build_arm(-1, -ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.45, rad=0.85, finger_len=1.3)
arm_r, hand_r, sleeve_r = L.build_arm(1, ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.45, rad=0.85, finger_len=1.3)

# --------------------------------------------------------------- legs ----
leg_l, pants_l, boot_l = L.build_leg(-1, -HIP_X, HIP_Y, LEG_S, mats, pants_len=0.58, boot=True, rad=0.9)
leg_r, pants_r, boot_r = L.build_leg(1, HIP_X, HIP_Y, LEG_S, mats, pants_len=0.58, boot=True, rad=0.9)

# -------------------------------------------------------------- grime ----
L.paint_grime(torso_skin, stains=[((0.0, -0.09, SKULL_Y - 0.16), 0.09, L.BLOOD)])
L.paint_grime(torso_mesh, stains=[
    ((0.03, -0.11, HIP_Y + 0.30), 0.10, L.DIRT),
    ((-0.04, -0.11, HIP_Y + 0.48), 0.09, L.BLOOD),
])
L.paint_grime(pants_pelvis)
L.paint_grime(hood); L.paint_grime(hood_tail)
L.paint_grime(head['skull'], stains=[
    ((0.0, -0.09, SKULL_Y - 0.085), 0.05, L.BLOOD),
    ((0.02, -0.04, SKULL_Y - 0.01), 0.09, L.DIRT),   # grime smeared across the face
])
L.paint_grime(head['jaw'], stains=[((0.0, -0.06, SKULL_Y - 0.10), 0.055, L.BLOOD)])
L.paint_grime(head['neck'])
for a in (arm_l, arm_r): L.paint_grime(a)
for h in (hand_l, hand_r): L.paint_grime(h, stains=[((h.location.x, -0.01, HIP_Y + SHOULDER_LOCAL - 0.72), 0.075, L.BLOOD)])
for s in (sleeve_l, sleeve_r): L.paint_grime(s)
for l in (leg_l, leg_r): L.paint_grime(l)
for p in (pants_l, pants_r): L.paint_grime(p)
for b in (boot_l, boot_r): L.paint_grime(b)

# ------------------------------------------------------------ assembly ---
parts = {
    'torso': [torso_skin, torso_mesh, pants_pelvis],
    'head': [head['skull'], head['neck'], head['eyes'], hood, hood_tail],
    'jaw': [head['jaw']],
    'armL': [arm_l, hand_l, sleeve_l],
    'armR': [arm_r, hand_r, sleeve_r],
    'legL': [leg_l, pants_l, boot_l],
    'legR': [leg_r, pants_r, boot_r],
}
L.assemble(HIP_Y, HEAD_WORLD, (0, -0.047, SKULL_Y - 0.070), ARM_X, SHOULDER_LOCAL, HIP_X, parts)
L.export_glb(OUT, SKULL_Y)
