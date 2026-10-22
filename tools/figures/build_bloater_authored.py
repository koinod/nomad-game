# build_bloater_authored.py — AUTHORED FIGURES WAVE 2: the bloater.
#
# The belly IS the model: the torso skin loft itself distends — a gas
# sac of a gut hanging forward and down (ring centers pushed front,
# radii swollen past the heavy frame's chest), the shirt ridden up to
# the chest so the mass is bare skin, glossy pustules blistered across
# the belly and shoulders, green weep streaks below them. Arms stay
# thin and dangle at the mass (the runtime swap shifts their pivots
# outboard around it, exactly like the kit).
#
# Run: blender -b -noaudio --python tools/figures/build_bloater_authored.py
import bpy, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import authored_lib as L

random.seed(2204)
bpy.ops.wm.read_factory_settings(use_empty=True)

OUT = os.path.join(L.WT, "public/figures/husk_bloater_authored.glb")

# ---- bloater rig constants (figureKit at H = 1.85, heavy) ----
HIP_Y = 0.888
HIP_X = 0.1201           # 0.055H * 1.18
SHOULDER_LOCAL = 0.6198  # 0.335H
ARM_X = 0.2620           # chestW .437 * .52 + .035
HEAD_WORLD = HIP_Y + 0.6938   # + 0.375H
SKULL_Y = 1.76           # HitProfile headY
ARM_S = 0.666 / 0.648
LEG_S = 0.851 / 0.828
HS = 0.95                # small head on the mass

mats = {
    'skin': L.principled("huskSkin", L.srgb(0x8f8262), rough=0.5, sss=0.4),
    'shirt': L.principled("tornShirt", L.srgb(0x6a7a4a), rough=0.96),
    'pants': L.principled("pantsMat", L.srgb(0x35322c), rough=0.97),
    'dark': L.principled("darkMat", L.srgb(0x2c2c30), rough=0.9),
    'hair': L.principled("hairMat", L.srgb(0x2c2320), rough=1.0),
    'eyes': L.eyes_material(),
    'pus': L.principled("pusMat", L.srgb(0x9aa84e), rough=0.38,
                        emission=(L.srgb(0x2a3305), 0.35)),
}

# -------------------------------------------------------------- torso ----
# (z, rx, ry, yoff): the gut's rings push FORWARD (negative yoff) and
# swell — max distension just above the hip line, hanging over it.
SKIN_PROFILE = [
    (0.815, 0.185, 0.155, -0.035), (0.900, 0.225, 0.215, -0.075),
    (1.000, 0.265, 0.265, -0.105), (1.130, 0.285, 0.275, -0.105),
    (1.260, 0.275, 0.245, -0.085), (1.380, 0.250, 0.210, -0.055),
    (1.480, 0.235, 0.185, -0.028), (1.560, 0.215, 0.160, -0.012),
    (1.615, 0.165, 0.120, 0.0),
]
skin_clay = [L.loft_mesh("sc_loft", SKIN_PROFILE),
    L.blob("sc_trapL", (-0.115, 0.002, 1.575), (0.105, 0.078, 0.052)),
    L.blob("sc_trapR", (0.115, 0.002, 1.575), (0.105, 0.078, 0.052)),
    L.blob("sc_neckbase", (0, 0.0, 1.60), (0.058, 0.054, 0.046)),
]
torso_skin = L.finish_part(L.join_all(skin_clay, "torsoSkin"), (0, 0, HIP_Y), 0.012, mats['skin'], 6800, smooth=3)

# Shirt shell: chest only — the mass has outgrown it; hem rides at the
# ribs, torn ragged.
SHIRT_PROFILE = [
    (1.340, 0.262, 0.217, -0.048), (1.430, 0.252, 0.200, -0.034),
    (1.520, 0.240, 0.185, -0.020), (1.590, 0.224, 0.164, -0.008),
    (1.635, 0.188, 0.128, 0.0),
]
shirt_clay = [L.loft_mesh("sh_loft", SHIRT_PROFILE),
    L.taper("sh_collar", (0, 0.0, 1.655), 0.072, 0.060, 0.06),
]
torso_mesh = L.finish_part(L.join_all(shirt_clay, "torsoMesh"), (0, 0, HIP_Y), 0.012, mats['shirt'], 5200, smooth=3)
L.jitter_hem(torso_mesh, 0.47, 0.05)   # local hem (origin at hip line)

pants_clay = [
    L.blob("pp_hips", (0, 0.002, HIP_Y - 0.065), (0.212, 0.138, 0.098)),
    L.blob("pp_crotch", (0, 0.0, HIP_Y - 0.145), (0.180, 0.118, 0.052)),
]
pants_pelvis = L.finish_part(L.join_all(pants_clay, "pantsPelvis"), (0, 0, HIP_Y), 0.012, mats['pants'], 3000)

# Pustules: blisters IN the skin — centers sunk past the surface so
# only a dome cap breaks it, smaller and more numerous than ornaments.
PUS_SPOTS = [
    (0.13, -0.345, 1.06, 0.050), (-0.16, -0.325, 1.18, 0.042), (0.03, -0.360, 1.22, 0.038),
    (-0.05, -0.345, 0.95, 0.044), (0.20, -0.075, 1.50, 0.036), (-0.215, 0.0, 1.47, 0.033),
    (0.21, -0.190, 1.30, 0.030), (-0.24, -0.19, 1.02, 0.030), (0.09, -0.248, 1.36, 0.028),
    (-0.11, -0.252, 1.33, 0.026),
]
pustules = []
for i, (px, py, pz, pr) in enumerate(PUS_SPOTS):
    p = L.finish_part(L.blob(f"pus_{i}", (px, py, pz), (pr, pr, pr)),
                      (px, py, pz), 0.007, mats['pus'], 420)
    p.scale = (1.0, 0.72, 1.0)   # dome, not bauble (Blender y = forward)
    pustules.append(p)

# --------------------------------------------------------------- head ----
head = L.build_head(SKULL_Y, HS, mats, gaunt=0.1, jaw_scale=(1.05, 1.0, 0.95), hair='patchy')

# --------------------------------------------------------------- arms ----
arm_l, hand_l, sleeve_l = L.build_arm(-1, -ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.18, rad=0.8, finger_len=1.0, elbow=0.16)
arm_r, hand_r, sleeve_r = L.build_arm(1, ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.18, rad=0.8, finger_len=1.0, elbow=0.16)

# --------------------------------------------------------------- legs ----
leg_l, pants_l, boot_l = L.build_leg(-1, -HIP_X, HIP_Y, LEG_S, mats, pants_len=0.50, boot=True, rad=1.05, knee=0.16)
leg_r, pants_r, _ = L.build_leg(1, HIP_X, HIP_Y, LEG_S, mats, pants_len=0.42, boot=False, rad=1.05, knee=0.16)

# Joint caps (continuity pass): the shirt covers the shoulder line;
# hips ride in the pants material.
shoulder_caps = L.joint_caps("shoulderCaps", [
    ((-ARM_X, 0, HIP_Y + SHOULDER_LOCAL), (0.096, 0.094, 0.098), ARM_S * 0.8),
    (( ARM_X, 0, HIP_Y + SHOULDER_LOCAL), (0.096, 0.094, 0.098), ARM_S * 0.8),
], mats['shirt'])
hip_caps = L.joint_caps("hipCaps", [
    ((-HIP_X, 0, HIP_Y), (0.110, 0.104, 0.097), LEG_S * 1.05),
    (( HIP_X, 0, HIP_Y), (0.110, 0.104, 0.097), LEG_S * 1.05),
], mats['pants'])
L.paint_grime(shoulder_caps)
L.paint_grime(hip_caps)

# -------------------------------------------------------------- grime ----
L.paint_grime(torso_skin, stains=[
    ((0.05, -0.30, 1.10), 0.20, L.WEEP),              # weep field over the gut
    ((-0.10, -0.28, 1.30), 0.13, L.WEEP),
    ((0.0, -0.10, SKULL_Y - 0.16), 0.10, L.BLOOD),
])
L.paint_grime(torso_mesh, stains=[((0.0, -0.05, HIP_Y + 0.45), 0.14, L.WEEP)])
L.paint_grime(pants_pelvis)
for p in pustules: L.paint_grime(p)
L.paint_grime(head['skull'], stains=[
    ((0.0, -0.09, SKULL_Y - 0.085), 0.055, L.BLOOD),
    ((-0.05, -0.04, SKULL_Y + 0.01), 0.07, L.WEEP),
])
L.paint_grime(head['jaw'], stains=[((0.0, -0.06, SKULL_Y - 0.10), 0.06, L.BLOOD)])
L.paint_grime(head['neck'])
L.paint_grime(head['hair'])
for a in (arm_l, arm_r): L.paint_grime(a)
for h in (hand_l, hand_r): L.paint_grime(h)
for s in (sleeve_l, sleeve_r): L.paint_grime(s)
for l in (leg_l, leg_r): L.paint_grime(l)
for p in (pants_l, pants_r): L.paint_grime(p)
if boot_l: L.paint_grime(boot_l)

# ------------------------------------------------------------ assembly ---
parts = {
    'torso': [torso_skin, torso_mesh, pants_pelvis, shoulder_caps, hip_caps] + pustules,
    'head': [head['skull'], head['neck'], head['eyes'], head['hair']],
    'jaw': [head['jaw']],
    'armL': [arm_l, hand_l, sleeve_l],
    'armR': [arm_r, hand_r, sleeve_r],
    'legL': [leg_l, pants_l, boot_l],
    'legR': [leg_r, pants_r],
}
L.assemble(HIP_Y, HEAD_WORLD, (0, -0.041, SKULL_Y - 0.064), ARM_X, SHOULDER_LOCAL, HIP_X, parts)
L.export_glb(OUT, SKULL_Y)
