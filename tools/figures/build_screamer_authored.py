# build_screamer_authored.py — AUTHORED FIGURES WAVE 2: the screamer.
#
# All ribs and throat: a gaunt 0.85 frame stretched to 2.1m, an
# elliptical bone ribcage riding PROUD of the chest (the kit's rings,
# authored as hugging ellipses instead of floating circles), a long
# neck column, and a head built for the scream — elongated skull,
# carved-open mouth, an oversized hinge jaw. Arms nearly at the knees.
# The runtime pose (head thrown back) deepens what the clay starts.
#
# Run: blender -b -noaudio --python tools/figures/build_screamer_authored.py
import bpy, math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import authored_lib as L

random.seed(2203)
bpy.ops.wm.read_factory_settings(use_empty=True)

OUT = os.path.join(L.WT, "public/figures/husk_screamer_authored.glb")

# ---- screamer rig constants (figureKit at H = 2.1, slim, gaunt .85) ----
HIP_Y = 1.008
HIP_X = 0.0993           # 0.055H * 0.86
SHOULDER_LOCAL = 0.7035  # 0.335H
ARM_X = 0.1941           # chestW .306 * .52 + .035
HEAD_WORLD = HIP_Y + 0.7875   # + 0.375H
SKULL_Y = 2.00           # HitProfile headY
ARM_S = 0.897 / 0.648
LEG_S = 0.966 / 0.828
HS = 2.1 / 1.8

mats = {
    'skin': L.principled("huskSkin", L.srgb(0x8d8291), rough=0.62, sss=0.3),
    'shirt': L.principled("tornShirt", L.srgb(0x6e5a6e), rough=0.97),
    'pants': L.principled("pantsMat", L.srgb(0x35322c), rough=0.97),
    'dark': L.principled("darkMat", L.srgb(0x2c2c30), rough=0.9),
    'hair': L.principled("hairMat", L.srgb(0x2c2320), rough=1.0),
    'eyes': L.eyes_material(),
    'bone': L.principled("boneMat", L.srgb(0xb8ab90), rough=0.85),
}

# -------------------------------------------------------------- torso ----
SKIN_PROFILE = [
    (0.928, 0.123, 0.085), (0.998, 0.130, 0.090), (1.068, 0.122, 0.084),
    (1.138, 0.110, 0.079), (1.208, 0.107, 0.078), (1.278, 0.112, 0.080),
    (1.348, 0.123, 0.086), (1.418, 0.133, 0.091), (1.488, 0.140, 0.094),
    (1.558, 0.141, 0.092), (1.622, 0.145, 0.086), (1.680, 0.137, 0.078),
    (1.732, 0.100, 0.064),
]
skin_clay = [L.loft_mesh("sc_loft", SKIN_PROFILE),
    L.blob("sc_trapL", (-0.092, 0.002, 1.716), (0.092, 0.070, 0.050)),
    L.blob("sc_trapR", (0.092, 0.002, 1.716), (0.092, 0.070, 0.050)),
    L.blob("sc_neckbase", (0, 0.0, 1.756), (0.058, 0.054, 0.050)),
]
torso_skin = L.finish_part(L.join_all(skin_clay, "torsoSkin"), (0, 0, HIP_Y), 0.012, mats['skin'], 6200, smooth=3)

SHIRT_PROFILE = [
    (0.995, 0.134, 0.094), (1.065, 0.141, 0.098), (1.135, 0.133, 0.093),
    (1.205, 0.121, 0.088), (1.275, 0.118, 0.087), (1.345, 0.123, 0.089),
    (1.415, 0.134, 0.095), (1.485, 0.144, 0.100), (1.555, 0.151, 0.103),
    (1.625, 0.152, 0.099), (1.687, 0.150, 0.094), (1.730, 0.142, 0.086),
]
shirt_clay = [L.loft_mesh("sh_loft", SHIRT_PROFILE),
    L.taper("sh_collar", (0, 0.0, 1.763), 0.068, 0.056, 0.06),
]
torso_mesh = L.finish_part(L.join_all(shirt_clay, "torsoMesh"), (0, 0, HIP_Y), 0.012, mats['shirt'], 7000, smooth=3)
# the shirt is SHREDDED over the cage — tear the front open so the ribs
# show through the garment, not just over it.
_me = torso_mesh.data
_tear_c = (0.0, -0.105, 0.42)   # torso-local (origin at the hip line)
_kill = [p.index for p in _me.polygons
         if (L.Vector(p.center) - L.Vector(_tear_c)).length < 0.21
         and p.center.y < -0.055 and random.random() < 0.82]
bpy.ops.object.select_all(action='DESELECT')
torso_mesh.select_set(True)
bpy.context.view_layer.objects.active = torso_mesh
# wave-1 dance: remesh leaves every face flagged selected — clear the
# selection in EDIT mode first or the delete takes the whole shell
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')
for i in _kill: _me.polygons[i].select = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='FACE')
bpy.ops.object.mode_set(mode='OBJECT')
L.jitter_hem(torso_mesh, 0.05, 0.045)

pants_clay = [
    L.blob("pp_hips", (0, 0.002, HIP_Y - 0.055), (0.160, 0.110, 0.094)),
    L.blob("pp_crotch", (0, 0.0, HIP_Y - 0.135), (0.138, 0.098, 0.05)),
]
pants_pelvis = L.finish_part(L.join_all(pants_clay, "pantsPelvis"), (0, 0, HIP_Y), 0.012, mats['pants'], 2800)

# Ribcage: three elliptical bone rings hugging the loft, proud of it.
ribs = []
for i in range(3):
    z = HIP_Y + 2.1 * (0.15 + i * 0.045)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.176 - i * 0.010, minor_radius=0.021,
                                     major_segments=24, minor_segments=8, location=(0, 0, z))
    rib = bpy.context.active_object
    rib.name = f"rib_{i}"
    rib.scale = (1.0, 0.64, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ribs.append(L.finish_part(rib, (0, 0, z), 0.008, mats['bone'], 1100))

# --------------------------------------------------------------- head ----
head = L.build_head(SKULL_Y, HS, mats, gaunt=0.6, elongate=0.55, mouth=0.85,
                    jaw_scale=(1.08, 1.05, 1.5), neck_depth=0.26,
                    neck_r=(0.046, 0.040), hair='none')

# --------------------------------------------------------------- arms ----
arm_l, hand_l, sleeve_l = L.build_arm(-1, -ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.42, rad=0.78, finger_len=1.35, elbow=0.22)
arm_r, hand_r, sleeve_r = L.build_arm(1, ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.42, rad=0.78, finger_len=1.35, elbow=0.22)

# --------------------------------------------------------------- legs ----
leg_l, pants_l, _ = L.build_leg(-1, -HIP_X, HIP_Y, LEG_S, mats, pants_len=0.55, boot=False, rad=0.85, knee=0.12)
leg_r, pants_r, _ = L.build_leg(1, HIP_X, HIP_Y, LEG_S, mats, pants_len=0.55, boot=False, rad=0.85, knee=0.12)

# Joint caps (continuity pass): the shirt covers the shoulder line;
# hips ride in the pants material.
shoulder_caps = L.joint_caps("shoulderCaps", [
    ((-ARM_X, 0, HIP_Y + SHOULDER_LOCAL), (0.096, 0.094, 0.098), ARM_S * 0.78),
    (( ARM_X, 0, HIP_Y + SHOULDER_LOCAL), (0.096, 0.094, 0.098), ARM_S * 0.78),
], mats['shirt'])
hip_caps = L.joint_caps("hipCaps", [
    ((-HIP_X, 0, HIP_Y), (0.110, 0.104, 0.097), LEG_S * 0.85),
    (( HIP_X, 0, HIP_Y), (0.110, 0.104, 0.097), LEG_S * 0.85),
], mats['pants'])
L.paint_grime(shoulder_caps)
L.paint_grime(hip_caps)

# -------------------------------------------------------------- grime ----
L.paint_grime(torso_skin, stains=[
    ((0.0, -0.09, SKULL_Y - 0.30), 0.13, L.BLOOD),   # scream-spatter chest
    ((0.0, -0.10, HIP_Y + 0.42), 0.14, L.BLOOD),
])
L.paint_grime(torso_mesh, stains=[((0.0, -0.10, HIP_Y + 0.40), 0.15, L.BLOOD)])
L.paint_grime(pants_pelvis)
for r in ribs: L.paint_grime(r, stains=[((0.0, -0.10, HIP_Y + 0.40), 0.13, L.BLOOD)])
L.paint_grime(head['skull'], stains=[
    ((0.0, -0.10, SKULL_Y - 0.10), 0.075, L.BLOOD),  # the mouth
    ((0.03, -0.05, SKULL_Y + 0.02), 0.08, L.DIRT),
])
L.paint_grime(head['jaw'], stains=[((0.0, -0.07, SKULL_Y - 0.13), 0.08, L.BLOOD)])
L.paint_grime(head['neck'], stains=[((0.0, -0.05, SKULL_Y - 0.20), 0.09, L.BLOOD)])
for a in (arm_l, arm_r): L.paint_grime(a)
for h in (hand_l, hand_r): L.paint_grime(h)
for s in (sleeve_l, sleeve_r): L.paint_grime(s)
for l in (leg_l, leg_r): L.paint_grime(l)
for p in (pants_l, pants_r): L.paint_grime(p)

# ------------------------------------------------------------ assembly ---
parts = {
    'torso': [torso_skin, torso_mesh, pants_pelvis, shoulder_caps, hip_caps] + ribs,
    'head': [head['skull'], head['neck'], head['eyes']],
    'jaw': [head['jaw']],
    'armL': [arm_l, hand_l, sleeve_l],
    'armR': [arm_r, hand_r, sleeve_r],
    'legL': [leg_l, pants_l],
    'legR': [leg_r, pants_r],
}
L.assemble(HIP_Y, HEAD_WORLD, (0, -0.050, SKULL_Y - 0.075), ARM_X, SHOULDER_LOCAL, HIP_X, parts)
L.export_glb(OUT, SKULL_Y)
