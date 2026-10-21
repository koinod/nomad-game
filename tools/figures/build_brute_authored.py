# build_brute_authored.py — AUTHORED FIGURES WAVE 2: the brute.
#
# Mass first, inside the pinned envelope (H=2.4, skull on 2.26; the
# runtime adds its 1.22/1.12 group breadth): the torso loft carries a
# hump of muscle over the upper back (ring centers pushed rearward at
# shoulder height), trapezius masses rise beside a sunk skull, arms
# are wrecking bars ending in club fists (no fingers), legs like
# pylons in torn-off pants. Bare chest — the shirt survives only as a
# waist remnant (still the torsoMesh flash seam).
#
# Run: blender -b -noaudio --python tools/figures/build_brute_authored.py
import bpy, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import authored_lib as L

random.seed(2207)
bpy.ops.wm.read_factory_settings(use_empty=True)

OUT = os.path.join(L.WT, "public/figures/husk_brute_authored.glb")

# ---- brute rig constants (figureKit at H = 2.4, heavy) ----
HIP_Y = 1.152
HIP_X = 0.1558           # 0.055H * 1.18
SHOULDER_LOCAL = 0.804   # 0.335H
ARM_X = 0.3295           # chestW .566 * .52 + .035
HEAD_WORLD = HIP_Y + 0.90     # + 0.375H
SKULL_Y = 2.26           # HitProfile headY
ARM_S = 0.864 / 0.648
LEG_S = 1.104 / 0.828
HS = (2.4 / 1.8) * 1.05

mats = {
    'skin': L.principled("huskSkin", L.srgb(0x84684c), rough=0.55, sss=0.4),
    'shirt': L.principled("tornShirt", L.srgb(0x5a4632), rough=0.97),
    'pants': L.principled("pantsMat", L.srgb(0x4a3b2c), rough=0.97),
    'dark': L.principled("darkMat", L.srgb(0x2c2c30), rough=0.9),
    'hair': L.principled("hairMat", L.srgb(0x241c16), rough=1.0),
    'eyes': L.eyes_material(),
}

# -------------------------------------------------------------- torso ----
# (z, rx, ry, yoff): yoff pushes the upper rings BACK — the hump.
SKIN_PROFILE = [
    (1.060, 0.245, 0.154, 0.0), (1.140, 0.259, 0.162, 0.0),
    (1.220, 0.242, 0.152, 0.0), (1.300, 0.219, 0.144, 0.0),
    (1.380, 0.212, 0.141, 0.0), (1.460, 0.222, 0.145, 0.004),
    (1.540, 0.245, 0.157, 0.012), (1.620, 0.265, 0.165, 0.030),
    (1.700, 0.290, 0.178, 0.052), (1.780, 0.295, 0.175, 0.068),
    (1.850, 0.300, 0.165, 0.072), (1.920, 0.273, 0.142, 0.058),
    (1.980, 0.198, 0.116, 0.030),
]
skin_clay = [L.loft_mesh("sc_loft", SKIN_PROFILE),
    L.blob("sc_trapL", (-0.145, 0.035, 1.985), (0.145, 0.115, 0.095)),
    L.blob("sc_trapR", (0.145, 0.035, 1.985), (0.145, 0.115, 0.095)),
    L.blob("sc_neckbase", (0, 0.01, 2.03), (0.085, 0.078, 0.065)),
]
torso_skin = L.finish_part(L.join_all(skin_clay, "torsoSkin"), (0, 0, HIP_Y), 0.013, mats['skin'], 7500, smooth=3)

# Shirt remnant: a torn waist shell — the chest is bare.
SHIRT_PROFILE = [
    (1.095, 0.257, 0.165, 0.0), (1.175, 0.271, 0.173, 0.0),
    (1.255, 0.254, 0.163, 0.0), (1.335, 0.231, 0.155, 0.0),
    (1.415, 0.224, 0.152, 0.002), (1.495, 0.234, 0.157, 0.006),
]
shirt_clay = [L.loft_mesh("sh_loft", SHIRT_PROFILE)]
torso_mesh = L.finish_part(L.join_all(shirt_clay, "torsoMesh"), (0, 0, HIP_Y), 0.013, mats['shirt'], 4200, smooth=3)
L.jitter_hem(torso_mesh, 0.36, 0.06)   # local top hem (origin at hip line)

pants_clay = [
    L.blob("pp_hips", (0, 0.002, HIP_Y - 0.06), (0.265, 0.175, 0.115)),
    L.blob("pp_crotch", (0, 0.0, HIP_Y - 0.15), (0.225, 0.150, 0.06)),
]
pants_pelvis = L.finish_part(L.join_all(pants_clay, "pantsPelvis"), (0, 0, HIP_Y), 0.013, mats['pants'], 3400)

# --------------------------------------------------------------- head ----
head = L.build_head(SKULL_Y, HS, mats, gaunt=0.1,
                    jaw_scale=(1.18, 1.12, 1.08), hair='none',
                    neck_depth=0.15, neck_r=(0.082, 0.070))

# --------------------------------------------------------------- arms ----
arm_l, hand_l, _ = L.build_arm(-1, -ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                               sleeve_len=0.0, rad=1.55, fist=1.5)
arm_r, hand_r, _ = L.build_arm(1, ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                               sleeve_len=0.0, rad=1.55, fist=1.5)

# --------------------------------------------------------------- legs ----
leg_l, pants_l, _ = L.build_leg(-1, -HIP_X, HIP_Y, LEG_S, mats, pants_len=0.34, boot=False, rad=1.45)
leg_r, pants_r, _ = L.build_leg(1, HIP_X, HIP_Y, LEG_S, mats, pants_len=0.34, boot=False, rad=1.45)

# -------------------------------------------------------------- grime ----
L.paint_grime(torso_skin, stains=[
    ((0.06, -0.16, 1.86), 0.11, L.BLOOD),   # scar-blood down the chest
    ((-0.04, -0.155, 1.62), 0.10, L.BLOOD),
    ((0.02, -0.14, 1.40), 0.09, L.BLOOD),
    ((0.0, 0.16, 1.85), 0.16, L.DIRT),      # the hump gathers dust
])
L.paint_grime(torso_mesh, stains=[((0.0, 0.0, HIP_Y + 0.05), 0.3, L.DIRT)])
L.paint_grime(pants_pelvis)
L.paint_grime(head['skull'], stains=[
    ((0.0, -0.115, SKULL_Y - 0.11), 0.07, L.BLOOD),
    ((0.05, -0.06, SKULL_Y + 0.03), 0.09, L.DIRT),
])
L.paint_grime(head['jaw'], stains=[((0.0, -0.08, SKULL_Y - 0.13), 0.075, L.BLOOD)])
L.paint_grime(head['neck'])
if head.get('hair'): L.paint_grime(head['hair'])
for a in (arm_l, arm_r): L.paint_grime(a, stains=[((a.location.x, -0.02, HIP_Y + SHOULDER_LOCAL - 0.80), 0.13, L.BLOOD)])
for h in (hand_l, hand_r): L.paint_grime(h, stains=[((h.location.x, -0.02, HIP_Y + SHOULDER_LOCAL - 0.88), 0.12, L.BLOOD)])
for l in (leg_l, leg_r): L.paint_grime(l)
for p in (pants_l, pants_r): L.paint_grime(p)

# ------------------------------------------------------------ assembly ---
parts = {
    'torso': [torso_skin, torso_mesh, pants_pelvis],
    'head': [head['skull'], head['neck'], head['eyes']],
    'jaw': [head['jaw']],
    'armL': [arm_l, hand_l],
    'armR': [arm_r, hand_r],
    'legL': [leg_l, pants_l],
    'legR': [leg_r, pants_r],
}
L.assemble(HIP_Y, HEAD_WORLD, (0, -0.058, SKULL_Y - 0.088), ARM_X, SHOULDER_LOCAL, HIP_X, parts)
L.export_glb(OUT, SKULL_Y)
