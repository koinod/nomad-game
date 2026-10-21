# build_spitter_authored.py — AUTHORED FIGURES WAVE 2: the spitter.
#
# The class IS its throat: a distended acid sac slung from jaw to chest,
# a swollen jaw and cheeks, nozzle lips at the mouth. The sac is built
# as lumpy sphere-proportioned clay named `sac` with the node scale
# (0.9, 1.25, 0.9) the runtime writes (Husks.ts telegraph sets it
# absolutely), parented to the torso exactly where the kit hangs its
# sac — so the telegraph swell animates the authored organ identically.
# Gaunt 0.3 frame underneath: ribs under a torn shirt, rangy limbs.
#
# Run: blender -b -noaudio --python tools/figures/build_spitter_authored.py
import bpy, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import authored_lib as L

random.seed(2202)
bpy.ops.wm.read_factory_settings(use_empty=True)

OUT = os.path.join(L.WT, "public/figures/husk_spitter_authored.glb")

# ---- spitter rig constants (figureKit at H = 1.85, slim, gaunt .3) ----
HIP_Y = 0.888
HIP_X = 0.0875           # 0.055H * 0.86
SHOULDER_LOCAL = 0.6198  # 0.335H
ARM_X = 0.1915           # chestW .301 * .52 + .035
HEAD_WORLD = HIP_Y + 0.6938   # + 0.375H
SKULL_Y = 1.76           # HitProfile headY
ARM_S = 0.710 / 0.648
LEG_S = 0.851 / 0.828
HS = 1.85 / 1.8

mats = {
    'skin': L.principled("huskSkin", L.srgb(0x8a7d68), rough=0.58, sss=0.35),
    'shirt': L.principled("tornShirt", L.srgb(0x59684a), rough=0.96),
    'pants': L.principled("pantsMat", L.srgb(0x35322c), rough=0.97),
    'dark': L.principled("darkMat", L.srgb(0x2c2c30), rough=0.9),
    'hair': L.principled("hairMat", L.srgb(0x2c2320), rough=1.0),
    'eyes': L.eyes_material(),
    'sac': L.principled("acidSac", L.srgb(0x7d9b3a), rough=0.24, sss=0.45,
                        emission=(L.srgb(0x33450a), 0.55)),
}

# -------------------------------------------------------------- torso ----
SKIN_PROFILE = [
    (0.817, 0.130, 0.089), (0.879, 0.137, 0.094), (0.941, 0.128, 0.088),
    (1.002, 0.116, 0.083), (1.064, 0.112, 0.081), (1.125, 0.117, 0.084),
    (1.187, 0.130, 0.091), (1.248, 0.140, 0.096), (1.310, 0.147, 0.098),
    (1.372, 0.148, 0.097), (1.429, 0.152, 0.091), (1.480, 0.144, 0.082),
    (1.526, 0.105, 0.067),
]
skin_clay = [L.loft_mesh("sc_loft", SKIN_PROFILE),
    L.blob("sc_trapL", (-0.088, 0.002, 1.514), (0.088, 0.066, 0.048)),
    L.blob("sc_trapR", (0.088, 0.002, 1.514), (0.088, 0.066, 0.048)),
    L.blob("sc_neckbase", (0, 0.0, 1.548), (0.056, 0.052, 0.048)),
]
torso_skin = L.finish_part(L.join_all(skin_clay, "torsoSkin"), (0, 0, HIP_Y), 0.012, mats['skin'], 6200, smooth=3)

SHIRT_PROFILE = [
    (0.853, 0.141, 0.098), (0.915, 0.148, 0.102), (0.977, 0.139, 0.097),
    (1.038, 0.127, 0.092), (1.100, 0.123, 0.090), (1.161, 0.128, 0.093),
    (1.223, 0.141, 0.100), (1.284, 0.151, 0.105), (1.346, 0.158, 0.107),
    (1.407, 0.159, 0.103), (1.459, 0.156, 0.098), (1.496, 0.148, 0.089),
]
shirt_clay = [L.loft_mesh("sh_loft", SHIRT_PROFILE),
    L.taper("sh_collar", (0, 0.0, 1.518), 0.066, 0.055, 0.06),
]
torso_mesh = L.finish_part(L.join_all(shirt_clay, "torsoMesh"), (0, 0, HIP_Y), 0.012, mats['shirt'], 7000, smooth=3)
L.jitter_hem(torso_mesh, 0.05, 0.04)

pants_clay = [
    L.blob("pp_hips", (0, 0.002, HIP_Y - 0.055), (0.158, 0.108, 0.092)),
    L.blob("pp_crotch", (0, 0.0, HIP_Y - 0.135), (0.136, 0.096, 0.05)),
]
pants_pelvis = L.finish_part(L.join_all(pants_clay, "pantsPelvis"), (0, 0, HIP_Y), 0.012, mats['pants'], 2800)

# The sac: lumpy merged clay, sphere-proportioned (the node scale does
# the kit's 0.9/1.25/0.9 shaping). Center = the kit's torso-local
# (0.02, H*.325 up, H*.085 fwd) in world coords.
SAC_C = (0.02, -0.157, HIP_Y + 0.601)
sac_clay = [
    L.blob("sa_core", SAC_C, (0.142, 0.138, 0.146)),
    L.blob("sa_l1", (SAC_C[0] - 0.07, SAC_C[1] - 0.03, SAC_C[2] + 0.05), (0.075, 0.07, 0.08)),
    L.blob("sa_l2", (SAC_C[0] + 0.075, SAC_C[1] - 0.02, SAC_C[2] - 0.03), (0.07, 0.068, 0.085)),
    L.blob("sa_l3", (SAC_C[0] + 0.01, SAC_C[1] - 0.055, SAC_C[2] - 0.095), (0.068, 0.06, 0.07)),
    L.blob("sa_l4", (SAC_C[0] - 0.03, SAC_C[1] + 0.01, SAC_C[2] + 0.105), (0.062, 0.06, 0.062)),
]
sac = L.finish_part(L.join_all(sac_clay, "sac"), SAC_C, 0.007, mats['sac'], 5200)
sac.scale = (0.9, 0.9, 1.25)   # Blender (x, fwd, up) == three (0.9, 1.25, 0.9)

# Throat column: jaw-to-sac skin so the organ hangs off the body.
throat = L.finish_part(
    L.taper("throatMesh", (0.012, -0.098, 1.615), 0.082, 0.052, 0.24),
    (0.012, -0.098, 1.615), 0.010, mats['skin'], 1200)

# --------------------------------------------------------------- head ----
head = L.build_head(SKULL_Y, HS, mats, gaunt=0.3,
                    jaw_scale=(1.28, 1.18, 1.12), hair='patchy')
# swollen cheeks + nozzle lips ride the head pivot
cheek_l = L.finish_part(L.blob("ch_l", (-0.078, -0.072, SKULL_Y - 0.052), (0.046, 0.042, 0.052)),
                        (-0.078, -0.072, SKULL_Y - 0.052), 0.008, mats['skin'], 700)
cheek_r = L.finish_part(L.blob("ch_r", (0.078, -0.072, SKULL_Y - 0.052), (0.046, 0.042, 0.052)),
                        (0.078, -0.072, SKULL_Y - 0.052), 0.008, mats['skin'], 700)
nozzle = L.finish_part(L.blob("nozzleMesh", (0.02, -0.118, SKULL_Y + 0.033), (0.047, 0.032, 0.036)),
                       (0.02, -0.118, SKULL_Y + 0.033), 0.008, mats['dark'], 600)

# --------------------------------------------------------------- arms ----
arm_l, hand_l, sleeve_l = L.build_arm(-1, -ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.30, rad=0.9, finger_len=1.15)
arm_r, hand_r, sleeve_r = L.build_arm(1, ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.11, rad=0.9, finger_len=1.15)

# --------------------------------------------------------------- legs ----
leg_l, pants_l, boot_l = L.build_leg(-1, -HIP_X, HIP_Y, LEG_S, mats, pants_len=0.52, boot=True, rad=0.92)
leg_r, pants_r, _ = L.build_leg(1, HIP_X, HIP_Y, LEG_S, mats, pants_len=0.34, boot=False, rad=0.92)

# -------------------------------------------------------------- grime ----
L.paint_grime(torso_skin, stains=[
    ((0.0, -0.11, SKULL_Y - 0.14), 0.12, L.ACID),     # acid weep down the chest
    ((0.02, -0.15, HIP_Y + 0.55), 0.10, L.ACID),
])
L.paint_grime(torso_mesh, stains=[
    ((0.02, -0.13, HIP_Y + 0.58), 0.11, L.ACID),
    ((0.0, 0.0, HIP_Y + 0.02), 0.28, L.DIRT),
])
L.paint_grime(pants_pelvis)
L.paint_grime(sac, stains=[((SAC_C[0], SAC_C[1] - 0.10, SAC_C[2] + 0.08), 0.09, L.ACID)])
L.paint_grime(throat, stains=[((0.0, -0.10, SKULL_Y - 0.10), 0.09, L.ACID)])
L.paint_grime(head['skull'], stains=[
    ((0.0, -0.10, SKULL_Y - 0.08), 0.06, L.ACID),     # mouth burn
    ((0.03, -0.05, SKULL_Y + 0.02), 0.07, L.DIRT),
])
L.paint_grime(head['jaw'], stains=[((0.0, -0.07, SKULL_Y - 0.10), 0.07, L.ACID)])
L.paint_grime(head['neck'], stains=[((0.0, -0.08, SKULL_Y - 0.15), 0.08, L.ACID)])
L.paint_grime(head['hair'])
L.paint_grime(cheek_l); L.paint_grime(cheek_r); L.paint_grime(nozzle)
for a in (arm_l, arm_r): L.paint_grime(a)
for h in (hand_l, hand_r): L.paint_grime(h, stains=[((h.location.x, -0.01, HIP_Y + SHOULDER_LOCAL - 0.68), 0.07, L.ACID)])
for s in (sleeve_l, sleeve_r): L.paint_grime(s)
for l in (leg_l, leg_r): L.paint_grime(l)
for p in (pants_l, pants_r): L.paint_grime(p)
if boot_l: L.paint_grime(boot_l)

# ------------------------------------------------------------ assembly ---
parts = {
    'torso': [torso_skin, torso_mesh, pants_pelvis, sac, throat],
    'head': [head['skull'], head['neck'], head['eyes'], head['hair'], cheek_l, cheek_r, nozzle],
    'jaw': [head['jaw']],
    'armL': [arm_l, hand_l, sleeve_l],
    'armR': [arm_r, hand_r, sleeve_r],
    'legL': [leg_l, pants_l, boot_l],
    'legR': [leg_r, pants_r],
}
L.assemble(HIP_Y, HEAD_WORLD, (0, -0.046, SKULL_Y - 0.070), ARM_X, SHOULDER_LOCAL, HIP_X, parts)
L.export_glb(OUT, SKULL_Y)
