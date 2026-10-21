# build_crawler_authored.py — AUTHORED FIGURES WAVE 2: the crawler.
#
# The kit builds this kind standing (H=1.8, skull 1.62) and re-poses it
# quadruped at runtime; the authored GLB is built to the SAME unposed
# contract so the identical pose (applyAuthoredPose in Husks.ts) lands
# it on the same low hit window. What the authored tier adds: a gaunt
# continuous-anatomy frame (gaunt 0.4 proportions), dorsal spine ridges
# modeled down the back (the kit's cones, grown into the clay),
# knuckle-dragger hands with long fingers, a forward-jutting head, and
# nothing but rags — torn vest, shorts, bare feet in the dirt.
#
# Run: blender -b -noaudio --python tools/figures/build_crawler_authored.py
import bpy, math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector
import authored_lib as L

random.seed(2201)  # deterministic build — same GLB every run
bpy.ops.wm.read_factory_settings(use_empty=True)

OUT = os.path.join(L.WT, "public/figures/husk_crawler_authored.glb")

# ---- crawler rig constants (figureKit at build H = 1.8, slim, gaunt .4) ----
HIP_Y = 0.864
HIP_X = 0.0851           # 0.055H * 0.86
SHOULDER_LOCAL = 0.603
ARM_X = 0.184            # chestW .287 * .52 + .035
HEAD_WORLD = HIP_Y + 0.675
SKULL_Y = 1.62           # the kit build's headCenterY for this kind
ARM_S = 0.705 / 0.648    # arm-length scale (gaunt-lengthened arms)

mats = {
    'skin': L.principled("huskSkin", L.srgb(0x7f7466), rough=0.6, sss=0.3),
    'shirt': L.principled("tornShirt", L.srgb(0x4e5a48), rough=0.97),
    'pants': L.principled("pantsMat", L.srgb(0x3a3f36), rough=0.97),
    'dark': L.principled("darkMat", L.srgb(0x2c2c30), rough=0.9),
    'hair': L.principled("hairMat", L.srgb(0x23201c), rough=1.0),
    'eyes': L.eyes_material(),
}

# -------------------------------------------------------------- torso ----
# Gaunt loft: wave-1 stations at 0.80 width / 0.84 depth.
SKIN_PROFILE = [
    (0.795, 0.126, 0.089), (0.855, 0.134, 0.094), (0.915, 0.125, 0.088),
    (0.975, 0.113, 0.083), (1.035, 0.110, 0.081), (1.095, 0.114, 0.084),
    (1.155, 0.126, 0.091), (1.215, 0.137, 0.096), (1.275, 0.143, 0.098),
    (1.335, 0.145, 0.097), (1.390, 0.149, 0.091), (1.440, 0.141, 0.082),
    (1.485, 0.102, 0.067),
]
skin_clay = [L.loft_mesh("sc_loft", SKIN_PROFILE),
    L.blob("sc_trapL", (-0.080, 0.002, 1.472), (0.080, 0.062, 0.046)),
    L.blob("sc_trapR", (0.080, 0.002, 1.472), (0.080, 0.062, 0.046)),
    L.blob("sc_neckbase", (0, 0.0, 1.505), (0.054, 0.050, 0.046)),
]
torso_skin = L.finish_part(L.join_all(skin_clay, "torsoSkin"), (0, 0, HIP_Y), 0.012, mats['skin'], 6000, smooth=3)

# Vest remnant: the shell stops at the ribs — a crawler wears scraps.
SHIRT_PROFILE = [
    (1.045, 0.128, 0.090), (1.105, 0.122, 0.087), (1.165, 0.131, 0.091),
    (1.225, 0.143, 0.097), (1.285, 0.152, 0.101), (1.345, 0.155, 0.100),
    (1.405, 0.157, 0.095), (1.455, 0.148, 0.086),
]
shirt_clay = [L.loft_mesh("sh_loft", SHIRT_PROFILE),
    L.taper("sh_collar", (0, 0.0, 1.475), 0.062, 0.052, 0.06),
]
torso_mesh = L.finish_part(L.join_all(shirt_clay, "torsoMesh"), (0, 0, HIP_Y), 0.012, mats['shirt'], 6000, smooth=3)
L.jitter_hem(torso_mesh, 0.185, 0.05)   # local hem (origin at hip line)

pants_clay = [
    L.blob("pp_hips", (0, 0.002, HIP_Y - 0.055), (0.150, 0.102, 0.088)),
    L.blob("pp_crotch", (0, 0.0, HIP_Y - 0.135), (0.128, 0.092, 0.048)),
]
pants_pelvis = L.finish_part(L.join_all(pants_clay, "pantsPelvis"), (0, 0, HIP_Y), 0.012, mats['pants'], 2600)

# Dorsal ridges: bone spikes down the back — they read on the flat
# quadruped back once the runtime pose pitches the torso over.
ridges = []
for i in range(4):
    z = HIP_Y + 0.13 + i * 0.145
    r = L.taper(f"rg_{i}", (0, 0.085, z), 0.046, 0.004, 0.14)
    r.rotation_euler = (math.radians(-90), 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    r.select_set(True)
    bpy.context.view_layer.objects.active = r
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    ridges.append(L.finish_part(r, (0, 0.085, z), 0.009, mats['dark'], 260))

# --------------------------------------------------------------- head ----
head = L.build_head(SKULL_Y, 1.0, mats, gaunt=0.4, jut=0.055,
                    jaw_scale=(1.18, 1.05, 1.0), hair='patchy')

# --------------------------------------------------------------- arms ----
arm_l, hand_l, sleeve_l = L.build_arm(-1, -ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.12, rad=0.85, finger_len=1.55)
arm_r, hand_r, sleeve_r = L.build_arm(1, ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.12, rad=0.85, finger_len=1.55)

# --------------------------------------------------------------- legs ----
leg_l, pants_l, _ = L.build_leg(-1, -HIP_X, HIP_Y, 1.0, mats, pants_len=0.30, boot=False, rad=0.88)
leg_r, pants_r, _ = L.build_leg(1, HIP_X, HIP_Y, 1.0, mats, pants_len=0.30, boot=False, rad=0.88)

# -------------------------------------------------------------- grime ----
L.paint_grime(torso_skin, stains=[((0.0, -0.09, SKULL_Y - 0.18), 0.09, L.BLOOD)])
L.paint_grime(torso_mesh, stains=[((0.0, 0.10, HIP_Y + 0.30), 0.16, L.DIRT)])
L.paint_grime(pants_pelvis)
L.paint_grime(head['skull'], stains=[((0.0, -0.09, SKULL_Y - 0.085), 0.055, L.BLOOD),
                                     ((0.02, 0.06, SKULL_Y + 0.03), 0.08, L.DIRT)])
L.paint_grime(head['jaw'], stains=[((0.0, -0.06, SKULL_Y - 0.10), 0.06, L.BLOOD)])
L.paint_grime(head['neck'])
L.paint_grime(head['hair'])
for a in (arm_l, arm_r): L.paint_grime(a, stains=[((a.location.x, -0.01, HIP_Y + SHOULDER_LOCAL - 0.66), 0.10, L.DIRT)])
for h in (hand_l, hand_r): L.paint_grime(h, stains=[((h.location.x, -0.01, HIP_Y + SHOULDER_LOCAL - 0.70), 0.09, L.BLOOD)])
for s in (sleeve_l, sleeve_r): L.paint_grime(s)
for l in (leg_l, leg_r): L.paint_grime(l, stains=[((l.location.x, 0.0, 0.35), 0.22, L.DIRT)])
for p in (pants_l, pants_r): L.paint_grime(p)
for r in ridges: L.paint_grime(r)

# ------------------------------------------------------------ assembly ---
parts = {
    'torso': [torso_skin, torso_mesh, pants_pelvis] + ridges,
    'head': [head['skull'], head['neck'], head['eyes'], head['hair']],
    'jaw': [head['jaw']],
    'armL': [arm_l, hand_l, sleeve_l],
    'armR': [arm_r, hand_r, sleeve_r],
    'legL': [leg_l, pants_l],
    'legR': [leg_r, pants_r],
}
L.assemble(HIP_Y, HEAD_WORLD, (0, -0.043, SKULL_Y - 0.067), ARM_X, SHOULDER_LOCAL, HIP_X, parts)
L.export_glb(OUT, SKULL_Y)
