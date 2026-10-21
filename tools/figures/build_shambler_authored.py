# build_shambler_authored.py — AUTHORED FIGURES WAVE 1: the standard husk.
#
# Builds ONE authored Blender shambler bound to the figureKit rig contract
# (src/game/figureKit.ts FIGURE_GLB_NODES): pivot empties named torso /
# head / jaw / armL / armR / legL / legR, geometry hanging -Y from the limb
# pivots, origin at the feet, skull center on the shambler HitProfile
# headY (1.71). Clothing remnants are modeled geometry; grime is vertex
# color; the eyes material is true unlit (KHR_materials_unlit) so
# bindFigureGLB finds a MeshBasicMaterial named on the `eyes` mesh, and
# the shirt mesh is named `torsoMesh` so it becomes the damage-flash
# bodyMat — exactly the seams the procedural kit exposes.
#
# Method: per-part clay (tapered segments + joint balls) -> join -> voxel
# remesh for continuous anatomy (no assembled-from-parts seams) -> head
# feature displacement (brow / sunken sockets / cheek hollows / jaw
# taper) -> seeded grime paint -> export GLB.
#
# Blender space: Z-up, figure faces -Y (exports to +Z in glTF/three).
# Runtime pose params map 1:1 in sign for rotation.x on the pivots.
#
# Run: blender -b -noaudio --python tools/figures/build_shambler_authored.py
import bpy, math, os, random, struct, json
from mathutils import Vector

random.seed(1407)  # deterministic build — same GLB every run

OUT = os.path.expanduser("~/workspace/nomad-wt/figures-authored/public/figures/husk_shambler_authored.glb")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# ---- shambler rig constants (figureKit proportions at H = 1.8) ----
HIP_Y = 0.864            # hip line / torso pivot height
HIP_X = 0.099            # leg pivot half-width (Item-8 anatomy pin)
SHOULDER_LOCAL = 0.603   # torso-local shoulder height
ARM_X = 0.222            # shoulder pivot |x|
HEAD_LOCAL = 0.675       # torso-local head pivot height
HEAD_WORLD = HIP_Y + HEAD_LOCAL          # 1.539
SKULL_Y = 1.71           # HitProfile headY — skull center MUST land here
ARM_LEN = 0.648

bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------------------------------------------------------------- mats ---
def principled(name, base, rough=0.9, sss=0.0, use_grime=True):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if sss > 0:
        bsdf.inputs["Subsurface Weight"].default_value = sss
        bsdf.inputs["Subsurface Radius"].default_value = (0.6, 0.25, 0.12)
    if use_grime:
        attr = nt.nodes.new("ShaderNodeAttribute")
        attr.attribute_name = "grime"
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        rgb = nt.nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = (*base, 1)
        nt.links.new(rgb.outputs[0], mix.inputs[1])
        nt.links.new(attr.outputs["Color"], mix.inputs[2])
        nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    return m

def srgb(hexv):
    """Kit palette hex (sRGB, as three.js reads it) -> linear for Blender."""
    out = []
    for shift in (16, 8, 0):
        c = ((hexv >> shift) & 0xFF) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)

SKIN = principled("huskSkin", srgb(0x8a7a68), rough=0.58, sss=0.35)
SHIRT = principled("tornShirt", srgb(0x5a4632), rough=0.96)
PANTS = principled("pantsMat", srgb(0x35322c), rough=0.97)
DARK = principled("darkMat", srgb(0x2c2c30), rough=0.9)
HAIR = principled("hairMat", srgb(0x2c2320), rough=1.0)

EYES = bpy.data.materials.new("eyesMat")
EYES.use_nodes = True
_ent = EYES.node_tree
_em = _ent.nodes.new("ShaderNodeEmission")
_em.inputs["Color"].default_value = (1.0, 0.72, 0.22, 1)
_em.inputs["Strength"].default_value = 2.6
_ent.links.new(_em.outputs[0], _ent.nodes["Material Output"].inputs["Surface"])

# ------------------------------------------------------------ clay kit ---
def blob(name, loc, scale, mat=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat: o.data.materials.append(mat)
    return o

def taper(name, loc, r_bottom, r_top, depth, mat=None):
    """Tapered segment along Z; loc is its center."""
    bpy.ops.mesh.primitive_cone_add(vertices=18, radius1=r_bottom, radius2=r_top,
                                    depth=depth, location=loc)
    o = bpy.context.active_object
    o.name = name
    if mat: o.data.materials.append(mat)
    return o

def join_all(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o

def set_origin(obj, point):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.context.scene.cursor.location = Vector(point)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR', center='MEDIAN')

TRI_BUDGET = {}  # part name prefix -> target triangle count after decimate

def finish_part(obj, origin, voxel=0.011, mat=None, tris=None, smooth=0):
    """Origin to pivot, voxel-remesh for continuous mass, smooth shade,
    then decimate to the part's triangle budget (voxel output is dense;
    the remesh buys surface continuity, not the final density).
    `smooth` = Laplacian-smooth iterations: chain-lofted parts keep a
    station ripple from the sphere silhouettes (visible as banding);
    a few passes erase it without moving the form."""
    set_origin(obj, origin)
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    obj.data.remesh_voxel_size = voxel
    obj.data.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.voxel_remesh()
    bpy.ops.object.shade_smooth()
    if smooth:
        mod = obj.modifiers.new("relax", 'LAPLACIANSMOOTH')
        mod.lambda_factor = 0.32
        mod.iterations = smooth
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if tris:
        cur = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        if cur > tris:
            mod = obj.modifiers.new("dec", 'DECIMATE')
            mod.ratio = max(0.05, tris / cur)
            bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def jitter_hem(obj, z_max, amount=0.028):
    """Tear a hem: verts below local z_max get seeded ragged z offsets."""
    me = obj.data
    for v in me.vertices:
        if v.co.z < z_max:
            k = (z_max - v.co.z) / max(0.001, abs(z_max) + 0.04)
            v.co.z += random.uniform(0, amount) * min(1.0, k + 0.35)
    me.update()

# ------------------------------------------------------------- grime -----
def paint_grime(obj, world_z_floor=0.0, stains=()):
    """Seeded vertex-color grime: mottling, low-body dirt, downward-face
    dust, plus named stain boxes ((center, radius, tint)) for story dirt
    (mouth blood, filthy hands). Color MULTIPLIES the material base."""
    me = obj.data
    if not me.color_attributes:
        me.color_attributes.new(name="grime", type='FLOAT_COLOR', domain='POINT')
    attr = me.color_attributes["grime"]
    mw = obj.matrix_world
    for i, v in enumerate(me.vertices):
        w = mw @ v.co
        n = random.uniform(0.82, 1.0)                      # mottle
        low = 1.0 - 0.34 * max(0.0, min(1.0, (0.75 - w.z) / 0.75))   # ground-in dirt
        rim = 1.0 - 0.16 * max(0.0, min(1.0, (0.25 - w.y) / 0.5))     # back/shadow dusting
        r = g = b = n * low * rim
        for (c, rad, tint) in stains:
            d = (w - Vector(c)).length
            if d < rad:
                k = (1 - d / rad) * 0.75
                r = r * (1 - k) + tint[0] * k
                g = g * (1 - k) + tint[1] * k
                b = b * (1 - k) + tint[2] * k
        attr.data[i].color = (r, g, b, 1.0)
    me.update()

BLOOD = (0.30, 0.13, 0.09)
DIRT = (0.42, 0.36, 0.28)

# -------------------------------------------------------------- torso ----
# Skin under-layer: the body itself (visible at tears, neck, hem). Built
# as a dense loft stack — stations every ~6cm with fat z-radii so the
# voxel remesh reads ONE continuous form, not stacked lobes (round-1
# defect: sparse blobs remeshed into a donut stack).
def loft_mesh(name, profile, yoff=0.0, seg=20):
    """A true loft: elliptical rings interpolated through the profile
    stations (z, rx, ry). Sphere chains ripple ~6mm between stations
    (visible as banding after remesh); a loft is smooth by construction
    and the remesh only has to fuse it to the trap/neck blobs."""
    rings = []
    for i in range(len(profile) - 1):
        (z0, x0, y0), (z1, x1, y1) = profile[i], profile[i + 1]
        rings.append((z0, x0, y0))
        rings.append(((z0 + z1) / 2, (x0 + x1) / 2, (y0 + y1) / 2))
    rings.append(profile[-1])
    verts, faces = [], []
    for (z, rx, ry) in rings:
        for j in range(seg):
            a = (j / seg) * math.tau
            verts.append((math.cos(a) * rx, yoff + math.sin(a) * ry, z))
    for ri in range(len(rings) - 1):
        for j in range(seg):
            a = ri * seg + j
            b = ri * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    # caps: fans to a center point just past each end ring
    zb, rb = rings[0][0], len(verts)
    verts.append((0, yoff, zb - 0.012))
    for j in range(seg):
        faces.append((rb, (j + 1) % seg, j))
    zt, rt = rings[-1][0], len(verts)
    top0 = (len(rings) - 1) * seg
    verts.append((0, yoff, zt + 0.008))
    for j in range(seg):
        faces.append((rt, top0 + j, top0 + (j + 1) % seg))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o

SKIN_PROFILE = [
    (0.795, 0.158, 0.106), (0.855, 0.167, 0.112), (0.915, 0.156, 0.105),
    (0.975, 0.141, 0.099), (1.035, 0.137, 0.097), (1.095, 0.143, 0.100),
    (1.155, 0.158, 0.108), (1.215, 0.171, 0.114), (1.275, 0.179, 0.117),
    (1.335, 0.181, 0.115), (1.390, 0.186, 0.108), (1.440, 0.176, 0.098),
    (1.485, 0.128, 0.080),
]
skin_clay = [loft_mesh("sc_loft", SKIN_PROFILE, -0.002),
    blob("sc_trapL", (-0.098, 0.002, 1.472), (0.098, 0.074, 0.052)),
    blob("sc_trapR", (0.098, 0.002, 1.472), (0.098, 0.074, 0.052)),
    blob("sc_neckbase", (0, 0.0, 1.505), (0.062, 0.057, 0.05)),
]
torso_skin = finish_part(join_all(skin_clay, "torsoSkin"), (0, 0, HIP_Y), 0.012, SKIN, 6500, smooth=3)

# Shirt shell: the same loft +0.011 proud in x/y, collar to torn hem.
SHIRT_PROFILE = [
    (0.830, 0.172, 0.117), (0.890, 0.178, 0.119), (0.950, 0.167, 0.112),
    (1.010, 0.152, 0.106), (1.070, 0.148, 0.104), (1.130, 0.154, 0.107),
    (1.190, 0.169, 0.115), (1.250, 0.182, 0.121), (1.310, 0.190, 0.124),
    (1.370, 0.192, 0.122), (1.420, 0.193, 0.114), (1.455, 0.180, 0.102),
]
shirt_clay = [loft_mesh("sh_loft", SHIRT_PROFILE, -0.002),
    taper("sh_collar", (0, 0.0, 1.475), 0.070, 0.058, 0.06),
]
torso_mesh = finish_part(join_all(shirt_clay, "torsoMesh"), (0, 0, HIP_Y), 0.012, SHIRT, 7500, smooth=3)
# the tear: a hole in the belly's left-front (viewer right at spawn) —
# faces removed, skin layer shows through; hem torn ragged.
_me = torso_mesh.data
_tear_c = Vector((0.085, -0.115, 0.155))
_kill = [p.index for p in _me.polygons
         if (Vector(p.center) - _tear_c).length < 0.052
         or ((Vector(p.center) - _tear_c).length < 0.078 and random.random() < 0.45)]
bpy.ops.object.select_all(action='DESELECT')
torso_mesh.select_set(True)
bpy.context.view_layer.objects.active = torso_mesh
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')
for i in _kill: _me.polygons[i].select = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='FACE')
bpy.ops.object.mode_set(mode='OBJECT')
jitter_hem(torso_mesh, 0.055, 0.045)

# Pants pelvis: covers the hips over the skin layer, under the shirt hem.
pants_clay = [
    blob("pp_hips", (0, 0.002, HIP_Y - 0.055), (0.176, 0.118, 0.095)),
    blob("pp_crotch", (0, 0.0, HIP_Y - 0.135), (0.150, 0.105, 0.05)),
]
pants_pelvis = finish_part(join_all(pants_clay, "pantsPelvis"), (0, 0, HIP_Y), 0.012, PANTS, 3000)

# ---------------------------------------------------------------- head ---
# Skull clay: cranium + nose + ears; features displaced after remesh.
skull_clay = [
    blob("sk_main", (0, -0.004, SKULL_Y), (0.104, 0.112, 0.128)),
    blob("sk_face", (0, -0.052, SKULL_Y - 0.045), (0.082, 0.072, 0.085)),
    blob("sk_nose", (0, -0.118, SKULL_Y - 0.028), (0.018, 0.024, 0.032)),
    blob("sk_earL", (-0.102, 0.002, SKULL_Y - 0.002), (0.011, 0.024, 0.030)),
    blob("sk_earR", (0.102, 0.002, SKULL_Y - 0.002), (0.011, 0.024, 0.030)),
]
skull = finish_part(join_all(skull_clay, "skull"), (0, -0.004, SKULL_Y), 0.006, SKIN, 11000)
# Face sculpt (local coords, origin at skull center; front = -Y):
_me = skull.data
for v in _me.vertices:
    p = v.co
    # brow ridge: push the brow band forward
    if 0.005 < p.z < 0.05 and p.y < -0.062:
        p.y -= 0.008 * (1 - abs(p.z - 0.027) / 0.03)
    # sunken eye sockets: pull verts near each socket toward the core
    for sx in (-1, 1):
        c = Vector((sx * 0.037, -0.088, 0.006))
        d = (p - c).length
        if d < 0.034:
            v.co = p + (c - p) * 0.42 * (1 - d / 0.034)
            p = v.co
    # hollow cheeks
    for sx in (-1, 1):
        c = Vector((sx * 0.070, -0.062, -0.052))
        d = (p - c).length
        if d < 0.036:
            v.co = p + (Vector((sx * 0.03, -0.02, -0.03)) - p) * 0.30 * (1 - d / 0.036)
            p = v.co
    # jaw-line taper: lower skull narrows
    if p.z < -0.02:
        k = min(1.0, (-p.z - 0.02) / 0.09)
        v.co.x = p.x * (1 - 0.20 * k)
    # flatter crown
    if p.z > 0.10:
        v.co.z = 0.10 + (p.z - 0.10) * 0.82
_me.update()

# Neck: child of the head (rides the flinch like the kit's neckBase).
# Short and thick, tucked into the trapezius — round 1's long stalk
# floated the head off the shoulder line.
neck = finish_part(
    taper("neckMesh", (0, 0.004, 1.532), 0.060, 0.052, 0.13),
    (0, 0.004, 1.532), 0.010, SKIN, 1000)

# Jaw: hinge empty at the skull's front-low; mesh = chin + jaw body.
jaw_clay = [
    blob("jw_body", (0, -0.048, SKULL_Y - 0.105), (0.058, 0.058, 0.042)),
    blob("jw_chin", (0, -0.082, SKULL_Y - 0.118), (0.042, 0.034, 0.032)),
]
jaw_mesh = finish_part(join_all(jaw_clay, "jawMesh"),
                       (0, -0.050, SKULL_Y - 0.068), 0.008, SKIN, 1800)

# Eyes: two pits of light, set deep in the sockets; one mesh, unlit mat.
eye_l = blob("tmpEyeL", (-0.037, -0.096, SKULL_Y + 0.004), (0.0135, 0.010, 0.0135))
eye_r = blob("tmpEyeR", (0.037, -0.096, SKULL_Y + 0.004), (0.0135, 0.010, 0.0135))
eyes = join_all([eye_l, eye_r], "eyes")
eyes.data.materials.clear()
eyes.data.materials.append(EYES)
set_origin(eyes, (0, -0.096, SKULL_Y + 0.004))

# Hair: patchy tufts clinging to the crown and back — husk-wrong hair.
hair_clay = [
    blob("hr_top", (0.012, 0.022, SKULL_Y + 0.112), (0.072, 0.076, 0.030)),
    blob("hr_back", (-0.008, 0.058, SKULL_Y + 0.050), (0.078, 0.042, 0.062)),
    blob("hr_side", (-0.078, 0.024, SKULL_Y + 0.050), (0.026, 0.052, 0.052)),
]
hair = finish_part(join_all(hair_clay, "hairMesh"), (0, 0.01, SKULL_Y + 0.06), 0.010, HAIR, 2000)

# --------------------------------------------------------------- arms ----
def build_hand(side, px, pz):
    """Its own part at a finer voxel — fingers merged into the palm at
    arm resolution in round 1 and read as a paddle."""
    clay = [
        blob("h_wr", (px, 0.004, pz - 0.575), (0.036, 0.034, 0.034)),
        blob("h_pa", (px, 0.006, pz - 0.628), (0.043, 0.021, 0.058)),
    ]
    for fi, fx in enumerate((-0.030, -0.010, 0.010, 0.030)):
        clay.append(taper(f"h_f{fi}", (px + fx, 0.002 - fi * 0.0015, pz - 0.70),
                          0.0068, 0.0078, 0.058))
    clay.append(taper("h_th", (px - side * 0.040, -0.010, pz - 0.615),
                      0.0075, 0.0088, 0.048))
    return finish_part(join_all(clay, "handMesh"), (px, 0, pz), 0.006, SKIN, 1500)

def build_arm(side, sleeve_len):
    """side: -1 = figure's left (-X). Returns (armMesh, handMesh,
    sleeveMesh) with origins at the shoulder pivot. Clay hangs -Z."""
    px = side * ARM_X
    pz = HIP_Y + SHOULDER_LOCAL
    clay = [
        blob("a_sh", (px, 0, pz), (0.070, 0.068, 0.072)),
        taper("a_up", (px, 0, pz - 0.155), 0.046, 0.058, 0.27),
        blob("a_el", (px, 0.002, pz - 0.305), (0.045, 0.044, 0.050)),
        taper("a_fo", (px, 0.004, pz - 0.435), 0.031, 0.041, 0.23),
        taper("a_wr", (px, 0.004, pz - 0.545), 0.027, 0.030, 0.06),
    ]
    arm = finish_part(join_all(clay, "armMesh"), (px, 0, pz), 0.0085, SKIN, 3600)
    hand = build_hand(side, px, pz)
    sl_clay = [
        blob("s_sh", (px, 0, pz + 0.01), (0.074, 0.072, 0.058)),
        taper("s_up", (px, 0, pz - sleeve_len / 2), 0.052, 0.066, sleeve_len),
    ]
    sleeve = finish_part(join_all(sl_clay, "sleeveMesh"), (px, 0, pz), 0.0095, SHIRT, 2000)
    jitter_hem_local(sleeve, -sleeve_len - 0.01, 0.03)
    return arm, hand, sleeve

def jitter_hem_local(obj, z_above, amount):
    me = obj.data
    for v in me.vertices:
        if v.co.z < z_above + 0.05:
            v.co.z -= random.uniform(0, amount)
    me.update()

arm_l, hand_l, sleeve_l = build_arm(-1, 0.30)   # left sleeve: torn at the elbow
arm_r, hand_r, sleeve_r = build_arm(1, 0.11)    # right sleeve: torn at the shoulder

# --------------------------------------------------------------- legs ----
def build_leg(side, pants_len, boot):
    px = side * HIP_X
    pz = HIP_Y
    clay = [
        blob("l_hip", (px, 0, pz - 0.01), (0.088, 0.082, 0.075)),
        taper("l_th", (px, 0, pz - 0.225), 0.058, 0.084, 0.37),
        blob("l_kn", (px, -0.006, pz - 0.435), (0.057, 0.056, 0.058)),
        taper("l_sn", (px, 0, pz - 0.63), 0.036, 0.052, 0.35),
        blob("l_ank", (px, 0, pz - 0.815), (0.042, 0.042, 0.038)),
        blob("l_ft", (px, -0.048, pz - 0.845), (0.047, 0.088, 0.030)),
    ]
    leg = finish_part(join_all(clay, "legMesh"), (px, 0, pz), 0.0095, SKIN, 4500)
    p_clay = [
        blob("p_hip", (px, 0, pz - 0.005), (0.096, 0.090, 0.082)),
        taper("p_th", (px, 0, pz - pants_len / 2 - 0.01),
              0.062 + (0.088 - 0.062) * (1 - pants_len / 0.62), 0.092, pants_len),
    ]
    pants = finish_part(join_all(p_clay, "pantsMesh"), (px, 0, pz), 0.0105, PANTS, 2400)
    jitter_hem_local(pants, -pants_len - 0.01, 0.035)
    boot_mesh = None
    if boot:
        b_clay = [
            taper("b_sh", (px, 0, pz - 0.775), 0.052, 0.058, 0.13),
            blob("b_ft", (px, -0.052, pz - 0.85), (0.055, 0.098, 0.036)),
            blob("b_toe", (px, -0.115, pz - 0.855), (0.052, 0.045, 0.030)),
        ]
        boot_mesh = finish_part(join_all(b_clay, "bootMesh"), (px, 0, pz), 0.0095, DARK, 1800)
    return leg, pants, boot_mesh

leg_l, pants_l, boot_l = build_leg(-1, 0.52, True)    # left: pants to mid-shin, booted
leg_r, pants_r, _ = build_leg(1, 0.30, False)         # right: torn at knee, bare foot

# ------------------------------------------------------------- grime -----
paint_grime(torso_skin, stains=[
    ((0.0, -0.10, SKULL_Y - 0.16), 0.10, BLOOD),      # chest under the mouth
    ((0.09, -0.11, HIP_Y + 0.15), 0.075, DIRT),      # the tear's rim
])
paint_grime(torso_mesh, stains=[
    ((0.085, -0.115, HIP_Y + 0.155), 0.085, BLOOD),
    ((0.0, 0.0, HIP_Y + 0.02), 0.30, DIRT),
])
paint_grime(pants_pelvis)
paint_grime(skull, stains=[
    ((0.0, -0.09, SKULL_Y - 0.085), 0.055, BLOOD),    # mouth / chin
    ((0.03, -0.05, SKULL_Y + 0.02), 0.07, DIRT),
])
paint_grime(jaw_mesh, stains=[((0.0, -0.06, SKULL_Y - 0.10), 0.06, BLOOD)])
paint_grime(neck)
paint_grime(hair)
for a in (arm_l, arm_r): paint_grime(a, stains=[((a.location.x, -0.01, HIP_Y + SHOULDER_LOCAL - 0.63), 0.09, BLOOD if a is arm_r else DIRT)])
for h in (hand_l, hand_r): paint_grime(h, stains=[((h.location.x, -0.01, HIP_Y + SHOULDER_LOCAL - 0.66), 0.08, BLOOD if h is hand_r else DIRT)])
for s in (sleeve_l, sleeve_r): paint_grime(s)
for l in (leg_l, leg_r): paint_grime(l)
for p in (pants_l, pants_r): paint_grime(p)
if boot_l: paint_grime(boot_l)

# ------------------------------------------------------------ assembly ---
def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = Vector(loc)
    if parent:
        bpy.context.view_layer.update()
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    return e

def parent_keep(obj, parent):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = parent
    parent.select_set(True)
    bpy.ops.object.parent_set(type='OBJECT', keep_transform=True)
    bpy.ops.object.select_all(action='DESELECT')

root = empty("figureRoot", (0, 0, 0))
torso_e = empty("torso", (0, 0, HIP_Y), root)
head_e = empty("head", (0, 0, HEAD_WORLD), torso_e)
jaw_e = empty("jaw", (0, -0.043, SKULL_Y - 0.067), head_e)
armL_e = empty("armL", (-ARM_X, 0, HIP_Y + SHOULDER_LOCAL), torso_e)
armR_e = empty("armR", (ARM_X, 0, HIP_Y + SHOULDER_LOCAL), torso_e)
legL_e = empty("legL", (-HIP_X, 0, HIP_Y), root)
legR_e = empty("legR", (HIP_X, 0, HIP_Y), root)

for o in (torso_skin, torso_mesh, pants_pelvis): parent_keep(o, torso_e)
for o in (skull, neck, eyes, hair): parent_keep(o, head_e)
parent_keep(jaw_mesh, jaw_e)
parent_keep(arm_l, armL_e); parent_keep(sleeve_l, armL_e); parent_keep(hand_l, armL_e)
parent_keep(arm_r, armR_e); parent_keep(sleeve_r, armR_e); parent_keep(hand_r, armR_e)
parent_keep(leg_l, legL_e); parent_keep(pants_l, legL_e); parent_keep(boot_l, legL_e)
parent_keep(leg_r, legR_e); parent_keep(pants_r, legR_e)

bpy.context.view_layer.update()

# -------------------------------------------------------------- export ---
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB',
                          export_apply=True, export_yup=True)
print("EXPORTED", OUT)

# Post-process: guarantee KHR_materials_unlit on the eyes material with a
# warm amber baseColorFactor — bindFigureGLB needs a MeshBasicMaterial,
# and GLTFLoader only makes one from the unlit extension.
with open(OUT, 'rb') as f:
    data = f.read()
magic, ver, total = struct.unpack_from('<III', data, 0)
jlen, jtype = struct.unpack_from('<II', data, 12)
gltf = json.loads(data[20:20 + jlen])
for m in gltf.get('materials', []):
    if m.get('name') == 'eyesMat':
        m['extensions'] = {'KHR_materials_unlit': {}}
        m['pbrMetallicRoughness'] = {'baseColorFactor': [1.0, 0.72, 0.22, 1.0],
                                     'metallicFactor': 0, 'roughnessFactor': 1}
        m.pop('emissiveFactor', None)
ext = gltf.setdefault('extensionsUsed', [])
if 'KHR_materials_unlit' not in ext: ext.append('KHR_materials_unlit')
new_json = json.dumps(gltf).encode('utf-8')
new_json += b' ' * ((4 - len(new_json) % 4) % 4)
bin_chunk = data[20 + jlen:]
new_total = 12 + 8 + len(new_json) + len(bin_chunk)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<III', magic, ver, new_total))
    f.write(struct.pack('<II', len(new_json), jtype))
    f.write(new_json)
    f.write(bin_chunk)
print("UNLIT PATCHED")

# Rig report
nodes = {n.get('name'): n for n in gltf['nodes']}
def chain_y(name):
    # sum translations up the parent chain (find parents from children lists)
    parent = {}
    for i, n in enumerate(gltf['nodes']):
        for c in n.get('children', []): parent[c] = i
    idx = [i for i, n in enumerate(gltf['nodes']) if n.get('name') == name][0]
    y = 0.0
    while True:
        y += gltf['nodes'][idx].get('translation', [0, 0, 0])[1]
        if idx not in parent: break
        idx = parent[idx]
    return y
print("NODES:", sorted(nodes.keys()))
print("SKULL chain Y (glTF):", round(chain_y('skull'), 4), "target 1.71")
print("MESHES:", sum(1 for n in gltf['nodes'] if 'mesh' in n))
print("TRIS:", sum(gltf['accessors'][p['indices']]['count'] // 3
                   for m in gltf['meshes'] for p in m['primitives'] if 'indices' in p))
print("COLOR_0 present:", any('COLOR_0' in p.get('attributes', {})
                              for m in gltf['meshes'] for p in m['primitives']))
print("DONE")
