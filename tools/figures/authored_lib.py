# authored_lib.py — AUTHORED FIGURES WAVE 2: the shared clay kit.
#
# Wave 1 (build_shambler_authored.py) proved the method: per-part clay ->
# voxel remesh for continuous anatomy -> face displacement -> seeded
# vertex-color grime -> GLB on the figureKit pivot contract. This module
# is that kit parameterized, so each wave-2 class script reads as its
# anatomy (profiles, features, stains), not as plumbing.
#
# Blender space: Z-up, figure faces -Y (exports to +Z in glTF/three).
# All geometry is built in world coords with origins moved onto the
# pivots, exactly like wave 1; runtime pose params map 1:1 in sign for
# rotation.x on the pivots.
import bpy, math, os, random, struct, json
from mathutils import Vector

WT = os.path.expanduser("~/workspace/nomad-wt/figures-authored-2")

# ------------------------------------------------------------- palette ---
def srgb(hexv):
    """Kit palette hex (sRGB, as three.js reads it) -> linear for Blender."""
    out = []
    for shift in (16, 8, 0):
        c = ((hexv >> shift) & 0xFF) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)

def principled(name, base, rough=0.9, sss=0.0, metal=0.0, emission=None, use_grime=True):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if sss > 0:
        bsdf.inputs["Subsurface Weight"].default_value = sss
        bsdf.inputs["Subsurface Radius"].default_value = (0.6, 0.25, 0.12)
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
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

def eyes_material():
    """True-unlit amber — bindFigureGLB needs a MeshBasicMaterial on the
    `eyes` mesh; the GLB post-patch below guarantees the extension."""
    m = bpy.data.materials.new("eyesMat")
    m.use_nodes = True
    nt = m.node_tree
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 0.72, 0.22, 1)
    em.inputs["Strength"].default_value = 2.6
    nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return m

BLOOD = (0.30, 0.13, 0.09)
DIRT = (0.42, 0.36, 0.28)
ACID = (0.36, 0.48, 0.16)
WEEP = (0.45, 0.52, 0.20)

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
    bpy.ops.mesh.primitive_cone_add(vertices=18, radius1=r_bottom, radius2=r_top,
                                    depth=depth, location=loc)
    o = bpy.context.active_object
    o.name = name
    if mat: o.data.materials.append(mat)
    return o

def box(name, loc, scale, mat=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = o.modifiers.new("bev", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
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

def finish_part(obj, origin, voxel=0.011, mat=None, tris=None, smooth=0):
    """Origin to pivot, voxel-remesh for continuous mass, smooth shade,
    decimate to budget. (Wave-1 helper, unchanged in behavior.)"""
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
    """Tear a hem on parts whose origin sits at z=0 world (wave-1 style):
    verts below world-ish z_max get seeded ragged z offsets."""
    me = obj.data
    for v in me.vertices:
        if v.co.z < z_max:
            k = (z_max - v.co.z) / max(0.001, abs(z_max) + 0.04)
            v.co.z += random.uniform(0, amount) * min(1.0, k + 0.35)
    me.update()

def jitter_hem_local(obj, z_above, amount):
    """Same, in pivot-local coords (limb parts hang -Z from the pivot)."""
    me = obj.data
    for v in me.vertices:
        if v.co.z < z_above + 0.05:
            v.co.z -= random.uniform(0, amount)
    me.update()

def loft_mesh(name, profile, seg=20):
    """A true loft: elliptical rings interpolated through the profile
    stations (z, rx, ry[, yoff]). Smooth by construction (wave 1)."""
    rings = []
    for i in range(len(profile) - 1):
        a, b = profile[i], profile[i + 1]
        rings.append(a)
        rings.append(tuple((a[k] + b[k]) / 2 for k in range(len(a))))
    rings.append(profile[-1])
    def ring_of(r):
        z, rx, ry = r[0], r[1], r[2]
        yo = r[3] if len(r) > 3 else 0.0
        return z, rx, ry, yo
    verts, faces = [], []
    for r in rings:
        z, rx, ry, yo = ring_of(r)
        for j in range(seg):
            a = (j / seg) * math.tau
            verts.append((math.cos(a) * rx, yo + math.sin(a) * ry, z))
    for ri in range(len(rings) - 1):
        for j in range(seg):
            a = ri * seg + j
            b = ri * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    zb, rb = ring_of(rings[0])[0], len(verts)
    verts.append((0, ring_of(rings[0])[3], zb - 0.012))
    for j in range(seg):
        faces.append((rb, (j + 1) % seg, j))
    zt, rt = ring_of(rings[-1])[0], len(verts)
    top0 = (len(rings) - 1) * seg
    verts.append((0, ring_of(rings[-1])[3], zt + 0.008))
    for j in range(seg):
        faces.append((rt, top0 + j, top0 + (j + 1) % seg))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o

# ------------------------------------------------------------- grime -----
def paint_grime(obj, stains=()):
    """Seeded vertex-color grime: mottling, low-body dirt, back dust,
    plus named stain spheres ((center, radius, tint)) — color MULTIPLIES
    the material base (wave-1 helper, unchanged in behavior)."""
    me = obj.data
    if not me.color_attributes:
        me.color_attributes.new(name="grime", type='FLOAT_COLOR', domain='POINT')
    attr = me.color_attributes["grime"]
    mw = obj.matrix_world
    for i, v in enumerate(me.vertices):
        w = mw @ v.co
        n = random.uniform(0.82, 1.0)
        low = 1.0 - 0.34 * max(0.0, min(1.0, (0.75 - w.z) / 0.75))
        rim = 1.0 - 0.16 * max(0.0, min(1.0, (0.25 - w.y) / 0.5))
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

# --------------------------------------------------------------- head ----
def sculpt_face(skull, SKULL_Y, gaunt=0.0, elongate=0.0, mouth=0.0, jut=0.0):
    """Wave-1 face displacement, parameterized: brow ridge, sunken
    sockets, hollow cheeks, jaw-line taper, flatter crown — plus the
    wave-2 knobs: `elongate` stretches the lower face (screamer),
    `mouth` carves an open-mouth hollow, `jut` pushes the whole face
    mass forward (crawler). Local coords, origin at skull center,
    front = -Y."""
    me = skull.data
    for v in me.vertices:
        p = v.co
        if 0.005 < p.z < 0.05 and p.y < -0.062:
            p.y -= 0.008 * (1 - abs(p.z - 0.027) / 0.03)
        for sx in (-1, 1):
            c = Vector((sx * 0.037, -0.088, 0.006))
            d = (p - c).length
            if d < 0.034:
                v.co = p + (c - p) * (0.42 + gaunt * 0.18) * (1 - d / 0.034)
                p = v.co
        for sx in (-1, 1):
            c = Vector((sx * 0.070, -0.062, -0.052))
            d = (p - c).length
            if d < 0.036:
                v.co = p + (Vector((sx * 0.03, -0.02, -0.03)) - p) * (0.30 + gaunt * 0.22) * (1 - d / 0.036)
                p = v.co
        if p.z < -0.02:
            k = min(1.0, (-p.z - 0.02) / 0.09)
            v.co.x = p.x * (1 - 0.20 * k)
            if elongate:
                v.co.z = p.z * (1 + elongate * k)
        if mouth:
            c = Vector((0.0, -0.098, -0.088 - elongate * 0.03))
            d = (p - c).length
            if d < 0.030:
                v.co = p + (Vector((0.0, -0.055, -0.075)) - p) * mouth * (1 - d / 0.030)
                p = v.co
        if p.z > 0.10:
            v.co.z = 0.10 + (p.z - 0.10) * 0.82
    if jut:
        for v in me.vertices:
            if v.co.y < -0.03:
                v.co.y -= jut * (1 - min(1.0, abs(v.co.y + 0.03) / 0.12)) * 0.5
    me.update()

def build_head(SKULL_Y, hs, mats, gaunt=0.0, elongate=0.0, mouth=0.0, jut=0.0,
               jaw_scale=(1.0, 1.0, 1.0), neck_depth=0.13, neck_r=(0.060, 0.052),
               hair='patchy', eye_spread=0.037, eye_dy=-0.096, eye_dz=0.004):
    """Skull + face sculpt + neck + hinged jaw + unlit eyes (+ hair).
    `hs` scales the wave-1 shambler head (built at H=1.8). Returns a dict
    of finished parts; caller parents them."""
    SKIN, HAIR = mats['skin'], mats['hair']
    s = hs
    clay = [
        blob("sk_main", (0, -0.004 * s, SKULL_Y), (0.104 * s, 0.112 * s, 0.128 * s)),
        blob("sk_face", (0, -0.052 * s, SKULL_Y - 0.045 * s), (0.082 * s, 0.072 * s, 0.085 * s)),
        blob("sk_nose", (0, -0.118 * s, SKULL_Y - 0.028 * s), (0.018 * s, 0.024 * s, 0.032 * s)),
        blob("sk_earL", (-0.102 * s, 0.002 * s, SKULL_Y - 0.002 * s), (0.011 * s, 0.024 * s, 0.030 * s)),
        blob("sk_earR", (0.102 * s, 0.002 * s, SKULL_Y - 0.002 * s), (0.011 * s, 0.024 * s, 0.030 * s)),
    ]
    skull = finish_part(join_all(clay, "skull"), (0, -0.004 * s, SKULL_Y), 0.006, SKIN, 11000)
    sculpt_face(skull, SKULL_Y, gaunt=gaunt, elongate=elongate, mouth=mouth, jut=jut)
    neck_cz = SKULL_Y - 0.178 * s
    neck = finish_part(
        taper("neckMesh", (0, 0.004 * s, neck_cz), neck_r[0] * s, neck_r[1] * s, neck_depth * s),
        (0, 0.004 * s, neck_cz), 0.010, SKIN, 1000)
    jw = [
        blob("jw_body", (0, -0.048 * s * jaw_scale[1], SKULL_Y - 0.105 * s * jaw_scale[2]),
             (0.058 * s * jaw_scale[0], 0.058 * s * jaw_scale[1], 0.042 * s * jaw_scale[2])),
        blob("jw_chin", (0, -0.082 * s * jaw_scale[1], SKULL_Y - 0.118 * s * jaw_scale[2]),
             (0.042 * s * jaw_scale[0], 0.034 * s * jaw_scale[1], 0.032 * s * jaw_scale[2])),
    ]
    jaw = finish_part(join_all(jw, "jawMesh"), (0, -0.050 * s, SKULL_Y - 0.068 * s), 0.008, SKIN, 1800)
    e_l = blob("tmpEyeL", (-eye_spread * s, eye_dy * s, SKULL_Y + eye_dz * s), (0.0135 * s, 0.010 * s, 0.0135 * s))
    e_r = blob("tmpEyeR", (eye_spread * s, eye_dy * s, SKULL_Y + eye_dz * s), (0.0135 * s, 0.010 * s, 0.0135 * s))
    eyes = join_all([e_l, e_r], "eyes")
    eyes.data.materials.clear()
    eyes.data.materials.append(mats['eyes'])
    set_origin(eyes, (0, eye_dy * s, SKULL_Y + eye_dz * s))
    parts = {'skull': skull, 'neck': neck, 'jaw': jaw, 'eyes': eyes}
    if hair == 'patchy':
        hclay = [
            blob("hr_top", (0.012 * s, 0.022 * s, SKULL_Y + 0.112 * s), (0.072 * s, 0.076 * s, 0.030 * s)),
            blob("hr_back", (-0.008 * s, 0.058 * s, SKULL_Y + 0.050 * s), (0.078 * s, 0.042 * s, 0.062 * s)),
            blob("hr_side", (-0.078 * s, 0.024 * s, SKULL_Y + 0.050 * s), (0.026 * s, 0.052 * s, 0.052 * s)),
        ]
        parts['hair'] = finish_part(join_all(hclay, "hairMesh"), (0, 0.01 * s, SKULL_Y + 0.06 * s), 0.010, HAIR, 2000)
    return parts

# --------------------------------------------------------------- limbs ---
def build_hand(side, px, pz, s, mats, finger_len=1.0, fist=0.0, finger_r=1.0):
    """Wave-1 hand (own finer voxel) with knobs: `finger_len` stretches
    the fingers (crawler/stalker/screamer), `fist`>0 replaces fingers
    with a club mass (brute)."""
    SKIN = mats['skin']
    if fist:
        clay = [
            blob("h_wr", (px, 0.004, pz - 0.575 * s), (0.040 * s, 0.038 * s, 0.038 * s)),
            blob("h_pa", (px, 0.006, pz - 0.640 * s), (0.062 * s * fist, 0.055 * s * fist, 0.075 * s * fist)),
            blob("h_kn", (px, -0.006, pz - 0.700 * s), (0.058 * s * fist, 0.048 * s * fist, 0.045 * s * fist)),
        ]
        return finish_part(join_all(clay, "handMesh"), (px, 0, pz), 0.007, SKIN, 1600)
    clay = [
        blob("h_wr", (px, 0.004, pz - 0.575 * s), (0.036 * s, 0.034 * s, 0.034 * s)),
        blob("h_pa", (px, 0.006, pz - 0.628 * s), (0.043 * s, 0.021 * s, 0.058 * s)),
    ]
    fl = 0.058 * finger_len
    for fi, fx in enumerate((-0.030, -0.010, 0.010, 0.030)):
        clay.append(taper(f"h_f{fi}", (px + fx * s, 0.002 - fi * 0.0015, pz - (0.672 + fl / 2) * s),
                          0.0068 * s * finger_r, 0.0078 * s * finger_r, fl * s))
    clay.append(taper("h_th", (px - side * 0.040 * s, -0.010, pz - 0.615 * s),
                      0.0075 * s * finger_r, 0.0088 * s * finger_r, 0.048 * s * finger_len))
    return finish_part(join_all(clay, "handMesh"), (px, 0, pz), 0.006, SKIN, 1500)

def build_arm(side, px, pz, s, mats, sleeve_len, rad=1.0, finger_len=1.0, fist=0.0,
              sleeve_mat_key='shirt'):
    """Clay hangs -Z from the shoulder pivot (px, pz = pivot world x/z).
    `s` scales the wave-1 arm (ARM_LEN .648 at H=1.8); `rad` fattens."""
    SKIN = mats['skin']
    SHIRT = mats[sleeve_mat_key]
    clay = [
        blob("a_sh", (px, 0, pz), (0.070 * s * rad, 0.068 * s * rad, 0.072 * s * rad)),
        taper("a_up", (px, 0, pz - 0.155 * s), 0.046 * s * rad, 0.058 * s * rad, 0.27 * s),
        blob("a_el", (px, 0.002, pz - 0.305 * s), (0.045 * s * rad, 0.044 * s * rad, 0.050 * s * rad)),
        taper("a_fo", (px, 0.004, pz - 0.435 * s), 0.031 * s * rad, 0.041 * s * rad, 0.23 * s),
        taper("a_wr", (px, 0.004, pz - 0.545 * s), 0.027 * s * rad, 0.030 * s * rad, 0.06 * s),
    ]
    arm = finish_part(join_all(clay, "armMesh"), (px, 0, pz), 0.0085, SKIN, 3600)
    hand = build_hand(side, px, pz, s, mats, finger_len=finger_len, fist=fist)
    if sleeve_len <= 0:
        return arm, hand, None
    sl_clay = [
        blob("s_sh", (px, 0, pz + 0.01), (0.074 * s * rad, 0.072 * s * rad, 0.058 * s * rad)),
        taper("s_up", (px, 0, pz - sleeve_len * s / 2), 0.052 * s * rad, 0.066 * s * rad, sleeve_len * s),
    ]
    sleeve = finish_part(join_all(sl_clay, "sleeveMesh"), (px, 0, pz), 0.0095, SHIRT, 2000)
    jitter_hem_local(sleeve, -sleeve_len * s - 0.01, 0.03)
    return arm, hand, sleeve

def build_leg(side, px, pz, s, mats, pants_len, boot, rad=1.0):
    """Wave-1 leg with `rad` fattening; origins at the hip pivot."""
    SKIN, PANTS, DARK = mats['skin'], mats['pants'], mats['dark']
    clay = [
        blob("l_hip", (px, 0, pz - 0.01), (0.088 * s * rad, 0.082 * s * rad, 0.075 * s * rad)),
        taper("l_th", (px, 0, pz - 0.225 * s), 0.058 * s * rad, 0.084 * s * rad, 0.37 * s),
        blob("l_kn", (px, -0.006, pz - 0.435 * s), (0.057 * s * rad, 0.056 * s * rad, 0.058 * s * rad)),
        taper("l_sn", (px, 0, pz - 0.63 * s), 0.036 * s * rad, 0.052 * s * rad, 0.35 * s),
        blob("l_ank", (px, 0, pz - 0.815 * s), (0.042 * s * rad, 0.042 * s * rad, 0.038 * s * rad)),
        blob("l_ft", (px, -0.048 * s, pz - 0.845 * s), (0.047 * s * rad, 0.088 * s, 0.030 * s)),
    ]
    leg = finish_part(join_all(clay, "legMesh"), (px, 0, pz), 0.0095, SKIN, 4500)
    pants = None
    if pants_len > 0:
        p_clay = [
            blob("p_hip", (px, 0, pz - 0.005), (0.096 * s * rad, 0.090 * s * rad, 0.082 * s * rad)),
            taper("p_th", (px, 0, pz - pants_len * s / 2 - 0.01),
                  (0.062 + (0.088 - 0.062) * (1 - pants_len / 0.62)) * s * rad, 0.092 * s * rad, pants_len * s),
        ]
        pants = finish_part(join_all(p_clay, "pantsMesh"), (px, 0, pz), 0.0105, PANTS, 2400)
        jitter_hem_local(pants, -pants_len * s - 0.01, 0.035)
    boot_mesh = None
    if boot:
        b_clay = [
            taper("b_sh", (px, 0, pz - 0.775 * s), 0.052 * s * rad, 0.058 * s * rad, 0.13 * s),
            blob("b_ft", (px, -0.052 * s, pz - 0.85 * s), (0.055 * s * rad, 0.098 * s, 0.036 * s)),
            blob("b_toe", (px, -0.115 * s, pz - 0.855 * s), (0.052 * s * rad, 0.045 * s, 0.030 * s)),
        ]
        boot_mesh = finish_part(join_all(b_clay, "bootMesh"), (px, 0, pz), 0.0095, DARK, 1800)
    return leg, pants, boot_mesh

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
    if obj is None: return
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = parent
    parent.select_set(True)
    bpy.ops.object.parent_set(type='OBJECT', keep_transform=True)
    bpy.ops.object.select_all(action='DESELECT')

def assemble(hip_y, head_world, jaw_hinge, arm_x, shoulder_local, hip_x, parts):
    """The figureKit pivot contract: figureRoot > torso (hip line) >
    head > jaw; arms on the torso; legs on the root. `parts` maps:
    torso: [...], head: [...], jaw: [...], armL/armR/legL/legR: [...],
    plus optional root: [...] (geometry riding the root unposed)."""
    root = empty("figureRoot", (0, 0, 0))
    torso_e = empty("torso", (0, 0, hip_y), root)
    head_e = empty("head", (0, 0, head_world), torso_e)
    jaw_e = empty("jaw", jaw_hinge, head_e)
    armL_e = empty("armL", (-arm_x, 0, hip_y + shoulder_local), torso_e)
    armR_e = empty("armR", (arm_x, 0, hip_y + shoulder_local), torso_e)
    legL_e = empty("legL", (-hip_x, 0, hip_y), root)
    legR_e = empty("legR", (hip_x, 0, hip_y), root)
    for o in parts.get('torso', []): parent_keep(o, torso_e)
    for o in parts.get('head', []): parent_keep(o, head_e)
    for o in parts.get('jaw', []): parent_keep(o, jaw_e)
    for o in parts.get('armL', []): parent_keep(o, armL_e)
    for o in parts.get('armR', []): parent_keep(o, armR_e)
    for o in parts.get('legL', []): parent_keep(o, legL_e)
    for o in parts.get('legR', []): parent_keep(o, legR_e)
    for o in parts.get('root', []): parent_keep(o, root)
    bpy.context.view_layer.update()
    return {'root': root, 'torso': torso_e, 'head': head_e, 'jaw': jaw_e}

# -------------------------------------------------------------- export ---
def export_glb(out_path, skull_target):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB',
                              export_apply=True, export_yup=True)
    print("EXPORTED", out_path)
    # guarantee KHR_materials_unlit on eyesMat (wave-1 post-patch)
    with open(out_path, 'rb') as f:
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
    with open(out_path, 'wb') as f:
        f.write(struct.pack('<III', magic, ver, new_total))
        f.write(struct.pack('<II', len(new_json), jtype))
        f.write(new_json)
        f.write(bin_chunk)
    print("UNLIT PATCHED")
    nodes = {n.get('name'): n for n in gltf['nodes']}
    parent = {}
    for i, n in enumerate(gltf['nodes']):
        for c in n.get('children', []): parent[c] = i
    def chain_y(name):
        idx = [i for i, n in enumerate(gltf['nodes']) if n.get('name') == name][0]
        y = 0.0
        while True:
            y += gltf['nodes'][idx].get('translation', [0, 0, 0])[1]
            if idx not in parent: break
            idx = parent[idx]
        return y
    print("NODES:", sorted(nodes.keys()))
    print("SKULL chain Y (glTF):", round(chain_y('skull'), 4), "target", skull_target)
    print("MESHES:", sum(1 for n in gltf['nodes'] if 'mesh' in n))
    print("TRIS:", sum(gltf['accessors'][p['indices']]['count'] // 3
                       for m in gltf['meshes'] for p in m['primitives'] if 'indices' in p))
    print("COLOR_0 present:", any('COLOR_0' in p.get('attributes', {})
                                  for m in gltf['meshes'] for p in m['primitives']))
    print("DONE")
