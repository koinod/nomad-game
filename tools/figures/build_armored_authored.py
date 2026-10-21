# build_armored_authored.py — AUTHORED FIGURES WAVE 2: the armored.
#
# Ship-security plate, modeled as GEAR over the body (the kit's vest +
# helmet + shoulder pads, authored): a beveled front/back plate pair
# on straps over a uniform, a cummerbund band, steel shoulder pads
# riding the arm pivots, knee pads, and a helmet bowl with a dark
# visor — the face still visible beneath it, husk-pale. Heavy frame
# underneath; the armor is hard-surface PBR (metalness in the GLB).
#
# Run: blender -b -noaudio --python tools/figures/build_armored_authored.py
import bpy, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import authored_lib as L

random.seed(2206)
bpy.ops.wm.read_factory_settings(use_empty=True)

OUT = os.path.join(L.WT, "public/figures/husk_armored_authored.glb")

# ---- armored rig constants (figureKit at H = 1.92, heavy) ----
HIP_Y = 0.9216
HIP_X = 0.1246           # 0.055H * 1.18
SHOULDER_LOCAL = 0.6432  # 0.335H
ARM_X = 0.2706           # chestW .453 * .52 + .035
HEAD_WORLD = HIP_Y + 0.72     # + 0.375H
SKULL_Y = 1.82           # HitProfile headY
ARM_S = 0.691 / 0.648
LEG_S = 0.883 / 0.828
HS = 1.92 / 1.8

mats = {
    'skin': L.principled("huskSkin", L.srgb(0x8a7a68), rough=0.58, sss=0.35),
    'shirt': L.principled("uniformMat", L.srgb(0x4a4f45), rough=0.97),
    'pants': L.principled("pantsMat", L.srgb(0x33383e), rough=0.97),
    'dark': L.principled("darkMat", L.srgb(0x24262a), rough=0.9),
    'hair': L.principled("hairMat", L.srgb(0x2c2320), rough=1.0),
    'eyes': L.eyes_material(),
    'armor': L.principled("armorMat", L.srgb(0x3f4750), rough=0.48, metal=0.55, use_grime=True),
    'visor': L.principled("visorMat", L.srgb(0x14181d), rough=0.15, metal=0.3, use_grime=False),
}

# -------------------------------------------------------------- torso ----
SKIN_PROFILE = [
    (0.848, 0.174, 0.117), (0.912, 0.184, 0.124), (0.976, 0.172, 0.116),
    (1.040, 0.155, 0.109), (1.104, 0.151, 0.107), (1.168, 0.157, 0.110),
    (1.232, 0.174, 0.119), (1.296, 0.188, 0.126), (1.360, 0.197, 0.129),
    (1.424, 0.199, 0.127), (1.482, 0.205, 0.119), (1.536, 0.194, 0.108),
    (1.584, 0.141, 0.088),
]
skin_clay = [L.loft_mesh("sc_loft", SKIN_PROFILE),
    L.blob("sc_trapL", (-0.108, 0.002, 1.571), (0.108, 0.082, 0.057)),
    L.blob("sc_trapR", (0.108, 0.002, 1.571), (0.108, 0.082, 0.057)),
    L.blob("sc_neckbase", (0, 0.0, 1.606), (0.066, 0.061, 0.053)),
]
torso_skin = L.finish_part(L.join_all(skin_clay, "torsoSkin"), (0, 0, HIP_Y), 0.012, mats['skin'], 6500, smooth=3)

SHIRT_PROFILE = [
    (0.885, 0.186, 0.126), (0.949, 0.196, 0.131), (1.013, 0.184, 0.125),
    (1.077, 0.167, 0.118), (1.141, 0.162, 0.116), (1.205, 0.168, 0.119),
    (1.269, 0.185, 0.128), (1.333, 0.199, 0.135), (1.397, 0.208, 0.138),
    (1.461, 0.210, 0.134), (1.519, 0.211, 0.128), (1.568, 0.198, 0.114),
]
shirt_clay = [L.loft_mesh("sh_loft", SHIRT_PROFILE),
    L.taper("sh_collar", (0, 0.0, 1.578), 0.075, 0.062, 0.06),
]
torso_mesh = L.finish_part(L.join_all(shirt_clay, "torsoMesh"), (0, 0, HIP_Y), 0.012, mats['shirt'], 7200, smooth=3)
L.jitter_hem(torso_mesh, 0.05, 0.03)

pants_clay = [
    L.blob("pp_hips", (0, 0.002, HIP_Y - 0.055), (0.194, 0.130, 0.100)),
    L.blob("pp_crotch", (0, 0.0, HIP_Y - 0.135), (0.165, 0.116, 0.052)),
]
pants_pelvis = L.finish_part(L.join_all(pants_clay, "pantsPelvis"), (0, 0, HIP_Y), 0.012, mats['pants'], 3000)

# The plate carrier: front + back plates on shoulder straps, a
# cummerbund band at the waist. Hard-surface boxes, beveled.
plate_f = L.finish_part(L.box("plateFront", (0, -0.148, HIP_Y + 0.44), (0.160, 0.027, 0.170), bevel=0.018),
                        (0, -0.148, HIP_Y + 0.44), 0.012, mats['armor'], 700)
plate_b = L.finish_part(L.box("plateBack", (0, 0.146, HIP_Y + 0.44), (0.160, 0.027, 0.170), bevel=0.018),
                        (0, 0.146, HIP_Y + 0.44), 0.012, mats['armor'], 700)
band = L.finish_part(L.box("cummerbund", (0, 0, HIP_Y + 0.155), (0.198, 0.140, 0.105), bevel=0.012),
                     (0, 0, HIP_Y + 0.155), 0.012, mats['dark'], 600)
straps = []
for sx in (-1, 1):
    st = L.finish_part(L.box(f"strap_{sx}", (sx * 0.105, -0.005, HIP_Y + 0.565), (0.046, 0.115, 0.028), bevel=0.008),
                       (sx * 0.105, -0.005, HIP_Y + 0.565), 0.012, mats['dark'], 300)
    straps.append(st)

# --------------------------------------------------------------- head ----
head = L.build_head(SKULL_Y, HS, mats, gaunt=0.15, hair='none')
# Helmet bowl: sphere shell with the lower-front quadrant cut away.
helm = L.finish_part(L.blob("helmetMesh", (0, 0.006, SKULL_Y + 0.028), (0.148, 0.152, 0.158)),
                     (0, 0.006, SKULL_Y + 0.028), 0.009, mats['armor'], 2400)
_me = helm.data
_kill = [p.index for p in _me.polygons
         if p.center.z < -0.045 and p.center.y < 0.01]
bpy.ops.object.select_all(action='DESELECT')
helm.select_set(True)
bpy.context.view_layer.objects.active = helm
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')
for i in _kill: _me.polygons[i].select = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='FACE')
bpy.ops.object.mode_set(mode='OBJECT')
visor = L.finish_part(L.box("visorMesh", (0, -0.140, SKULL_Y + 0.012), (0.092, 0.013, 0.030), bevel=0.006),
                      (0, -0.140, SKULL_Y + 0.012), 0.012, mats['visor'], 200)

# --------------------------------------------------------------- arms ----
arm_l, hand_l, sleeve_l = L.build_arm(-1, -ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.50, rad=1.02, finger_len=1.0, sleeve_mat_key='shirt')
arm_r, hand_r, sleeve_r = L.build_arm(1, ARM_X, HIP_Y + SHOULDER_LOCAL, ARM_S, mats,
                                      sleeve_len=0.50, rad=1.02, finger_len=1.0, sleeve_mat_key='shirt')
# Steel shoulder pads ride the arm pivots (they swing with the arms).
pad_l = L.finish_part(L.box("padL", (-ARM_X, 0, HIP_Y + SHOULDER_LOCAL - 0.09), (0.105, 0.125, 0.048), bevel=0.014),
                      (-ARM_X, 0, HIP_Y + SHOULDER_LOCAL - 0.09), 0.012, mats['armor'], 400)
pad_r = L.finish_part(L.box("padR", (ARM_X, 0, HIP_Y + SHOULDER_LOCAL - 0.09), (0.105, 0.125, 0.048), bevel=0.014),
                      (ARM_X, 0, HIP_Y + SHOULDER_LOCAL - 0.09), 0.012, mats['armor'], 400)

# --------------------------------------------------------------- legs ----
leg_l, pants_l, boot_l = L.build_leg(-1, -HIP_X, HIP_Y, LEG_S, mats, pants_len=0.58, boot=True, rad=1.02)
leg_r, pants_r, boot_r = L.build_leg(1, HIP_X, HIP_Y, LEG_S, mats, pants_len=0.58, boot=True, rad=1.02)
knee_l = L.finish_part(L.box("kneeL", (-HIP_X, -0.068, HIP_Y - 0.464), (0.058, 0.022, 0.062), bevel=0.010),
                       (-HIP_X, -0.068, HIP_Y - 0.464), 0.012, mats['armor'], 300)
knee_r = L.finish_part(L.box("kneeR", (HIP_X, -0.068, HIP_Y - 0.464), (0.058, 0.022, 0.062), bevel=0.010),
                       (HIP_X, -0.068, HIP_Y - 0.464), 0.012, mats['armor'], 300)

# -------------------------------------------------------------- grime ----
L.paint_grime(torso_skin, stains=[((0.0, -0.10, SKULL_Y - 0.17), 0.10, L.BLOOD)])
L.paint_grime(torso_mesh, stains=[((0.0, 0.0, HIP_Y + 0.02), 0.26, L.DIRT)])
L.paint_grime(pants_pelvis)
for p in (plate_f, plate_b, pad_l, pad_r, knee_l, knee_r, helm):
    L.paint_grime(p, stains=[((0.05, -0.15, HIP_Y + 0.46), 0.10, L.BLOOD)] if p is plate_f else [])
L.paint_grime(band)
for s in straps: L.paint_grime(s)
L.paint_grime(head['skull'], stains=[
    ((0.0, -0.095, SKULL_Y - 0.085), 0.055, L.BLOOD),
    ((0.04, -0.05, SKULL_Y + 0.02), 0.07, L.DIRT),
])
L.paint_grime(head['jaw'], stains=[((0.0, -0.06, SKULL_Y - 0.10), 0.06, L.BLOOD)])
L.paint_grime(head['neck'])
for a in (arm_l, arm_r): L.paint_grime(a)
for h in (hand_l, hand_r): L.paint_grime(h)
for s in (sleeve_l, sleeve_r): L.paint_grime(s)
for l in (leg_l, leg_r): L.paint_grime(l)
for p in (pants_l, pants_r): L.paint_grime(p)
for b in (boot_l, boot_r): L.paint_grime(b)

# ------------------------------------------------------------ assembly ---
parts = {
    'torso': [torso_skin, torso_mesh, pants_pelvis, plate_f, plate_b, band] + straps,
    'head': [head['skull'], head['neck'], head['eyes'], helm, visor],
    'jaw': [head['jaw']],
    'armL': [arm_l, hand_l, sleeve_l, pad_l],
    'armR': [arm_r, hand_r, sleeve_r, pad_r],
    'legL': [leg_l, pants_l, boot_l, knee_l],
    'legR': [leg_r, pants_r, boot_r, knee_r],
}
L.assemble(HIP_Y, HEAD_WORLD, (0, -0.049, SKULL_Y - 0.072), ARM_X, SHOULDER_LOCAL, HIP_X, parts)
L.export_glb(OUT, SKULL_Y)
