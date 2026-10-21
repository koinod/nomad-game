#!/usr/bin/env python3
"""NOMAD Fleet — Western Star 5700 XE "Nomad Prime" heavy semi tractor.

Built from Ian's spec + isometric reference (design-refs/fleet-specs/).
Axes (house convention, same as tools/seahawk/build_seahawk.py):
  X = length (nose +X), Y = width (left +Y), Z = up.  Meters.
Ground plane = z 0 (tire bottoms).  Overall 8.34 m long, 2.55 m wide,
3.88 m to the roof-fairing peak.  Wheel radius 0.525 (22.5" Class-8).

Exports public/models/nomad-prime.glb and saves
tools/nomad_prime/nomad_prime.blend.

Run: blender -b --python tools/nomad_prime/build_nomad_prime.py
"""
import bpy, math, os
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
GLB_OUT = os.path.join(WT, "public", "models", "nomad-prime.glb")
BLEND_OUT = os.path.join(ROOT, "nomad_prime.blend")

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

def srgb(rgb):
    """sRGB 0..1 triple -> linear triple (Blender Principled base color)."""
    out = []
    for c in rgb:
        out.append(((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92)
    return tuple(out)

def hexcol(h):
    h = h.lstrip('#')
    return srgb(tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)))

def mat(name, rgb, rough=0.6, metal=0.1, alpha=None, emissive=None, ei=0.0,
        coat=0.0, coat_rough=0.1):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, alpha if alpha is not None else 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if emissive:
        bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
        bsdf.inputs["Emission Strength"].default_value = ei
    if alpha is not None:
        m.surface_render_method = 'DITHERED'
    return m

# Spec colors: #171C1F gunmetal / #1B2A38 cobalt navy + ghosted crimson.
PAINT   = mat("paint_cobalt",   hexcol("#1B2A38"), 0.34, 0.15, coat=1.0, coat_rough=0.08)
HOODM   = mat("paint_slate",    hexcol("#2B3640"), 0.36, 0.15, coat=1.0, coat_rough=0.10)  # hood/fenders read lighter in ref
DARKM   = mat("gunmetal",       hexcol("#171C1F"), 0.46, 0.55)                            # bumper / frame trim
DARKER  = mat("near_black",     hexcol("#0D0F11"), 0.80, 0.10)                            # recesses, underbody
CHROME  = mat("chrome",         (0.83, 0.86, 0.90), 0.07, 1.0)                            # stacks, grille bars
ALU     = mat("polished_tank",  (0.52, 0.55, 0.58), 0.24, 0.95)                           # saddle tanks
STEEL   = mat("wheel_steel",    (0.40, 0.41, 0.43), 0.38, 0.85)                           # deep-dish rims
STEELD  = mat("steel_dark",     (0.13, 0.135, 0.14), 0.50, 0.80)                          # fifth wheel, axles
GLASS   = mat("glass_tint",     (0.075, 0.105, 0.135), 0.04, 0.25, alpha=0.55)
TIRE    = mat("tire",           (0.028, 0.028, 0.030), 0.95, 0.0)
RUBBER  = mat("rubber",         (0.035, 0.035, 0.038), 0.92, 0.0)                        # mudflaps, hoses
INTM    = mat("interior",       hexcol("#232629"), 0.90, 0.0)                            # dash / trim
INTD    = mat("interior_dark",  hexcol("#141618"), 0.92, 0.0)
SEATF   = mat("seat_fabric",    hexcol("#2E3440"), 0.98, 0.0)                            # captain chairs
BUNKF   = mat("bunk_fabric",    hexcol("#4A4A3E"), 0.98, 0.0)                            # bunk mattress
PILLOW  = mat("bunk_pillow",    hexcol("#8A867C"), 0.95, 0.0)
CRIMSON = mat("pinstripe",      hexcol("#4A0E14"), 0.35, 0.20, coat=0.6)                  # ghosted crimson
LETTER  = mat("lettering",      (0.60, 0.62, 0.64), 0.55, 0.10)                          # door stencil
AMBER   = mat("light_amber",    (0.30, 0.12, 0.01), 0.35, 0.0, emissive=(1.0, 0.45, 0.05), ei=2.2)
REDL    = mat("light_red",      (0.28, 0.02, 0.02), 0.35, 0.0, emissive=(1.0, 0.04, 0.04), ei=2.0)
LENS    = mat("lens_white",     (0.55, 0.58, 0.60), 0.18, 0.10, emissive=(0.95, 0.98, 1.0), ei=1.1)
SCREEN  = mat("screen",         (0.02, 0.05, 0.045), 0.25, 0.0, emissive=(0.05, 0.30, 0.22), ei=0.7)
REDH    = mat("hose_red",       hexcol("#5E1616"), 0.70, 0.05)
BLUEH   = mat("hose_blue",      hexcol("#16365E"), 0.70, 0.05)

# ------------------------------------------------- diamond plate (numpy bake)
def diamond_plate_material():
    """Procedural tread-plate: color + tangent normal map images, wired so
    both the Blender proofs AND the exported GLB carry the detail."""
    S = 256
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    rt2 = math.sqrt(2.0)
    u = (xx + yy) / rt2
    v = (xx - yy) / rt2
    per = 36.0  # lug pitch in px along the diagonal axes

    def dashes(a, b):
        sa = np.mod(a, per)
        sb = np.mod(b, per * 2.0)
        lug = ((sa > 7) & (sa < per - 7)).astype(np.float32)
        gate = ((sb > 5) & (sb < per - 5)).astype(np.float32)
        return lug * gate

    cell = ((np.floor(u / per) + np.floor(v / per)) % 2).astype(np.float32)
    h = np.where(cell > 0.5, dashes(u, v), dashes(v, u))
    # one softening pass so lugs have sloped shoulders
    hb = (h + np.roll(h, 1, 0) + np.roll(h, -1, 0) + np.roll(h, 1, 1) + np.roll(h, -1, 1)) / 5.0
    h = np.maximum(hb, h * 0.9)
    # normal map from height (Sobel-ish) — stronger relief for the polish pass
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 3.4
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 3.4
    inv = 1.0 / np.sqrt(gx * gx + gy * gy + 1.0)
    nrm = np.dstack((-gx * inv, gy * inv, inv)) * 0.5 + 0.5
    base = 0.40 + h * 0.46  # steel gray, lugs catch the light
    rgh = 0.60 - h * 0.28   # raised lugs are polished smoother than the field

    def to_img(name, rgb_arr):
        img = bpy.data.images.new(name, S, S, alpha=False)
        rgba = np.dstack((rgb_arr, np.ones((S, S), np.float32))).astype(np.float32)
        img.pixels.foreach_set(rgba.ravel())
        img.pack()
        return img

    img_c = to_img("DiamondPlate_Color", np.dstack((base, base, base * 1.04)))
    img_n = to_img("DiamondPlate_Normal", nrm)
    img_r = to_img("DiamondPlate_Rough", np.dstack((rgh, rgh, rgh)))
    m = bpy.data.materials.new("diamond_plate")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.85
    bsdf.inputs["Roughness"].default_value = 0.50
    tc = nt.nodes.new("ShaderNodeTexImage"); tc.image = img_c
    tc.location = (-420, 220)
    nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])
    img_n.colorspace_settings.name = 'Non-Color'
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = img_n
    tn.location = (-420, -60)
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.location = (-160, -60)
    nmap.inputs["Strength"].default_value = 1.35
    nt.links.new(tn.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    img_r.colorspace_settings.name = 'Non-Color'
    tr = nt.nodes.new("ShaderNodeTexImage"); tr.image = img_r
    tr.location = (-420, -320)
    nt.links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])
    return m

DIAMOND = diamond_plate_material()

# ---------------------------------------------------------------- helpers
def link(obj, parent=None):
    bpy.context.collection.objects.link(obj)
    if parent: obj.parent = parent
    return obj

def finish(obj, material=None, smooth=True):
    if material: obj.data.materials.append(material)
    if smooth:
        for p in obj.data.polygons: p.use_smooth = True
    return obj

def box(name, loc, scale, material=None, bevel=0.0, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    ob = bpy.context.object; ob.name = name
    ob.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    ob.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=False)
    if bevel > 0:
        mod = ob.modifiers.new("bev", 'BEVEL'); mod.width = bevel; mod.segments = 2
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier="bev")
    if material: ob.data.materials.append(material)
    if parent: ob.parent = parent
    return ob

def cyl(name, loc, radius, depth, material=None, rot=(0, 0, 0), verts=24, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    ob = bpy.context.object; ob.name = name
    if material: ob.data.materials.append(material)
    for p in ob.data.polygons: p.use_smooth = True
    if parent: ob.parent = parent
    return ob

def empty(name, loc, parent=None, size=0.3):
    ob = bpy.data.objects.new(name, None); ob.empty_display_type = 'PLAIN_AXES'
    ob.empty_display_size = size; ob.location = loc; link(ob, parent)
    return ob

def extrude_xz(name, pts, depth, material=None, parent=None, bevel=0.0):
    """Prism from an (x, z) side profile, extruded across Y (centered)."""
    import bmesh
    n = len(pts)
    verts = [(x, -depth / 2, z) for (x, z) in pts] + [(x, depth / 2, z) for (x, z) in pts]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    faces.append(tuple(range(n - 1, -1, -1)))
    faces.append(tuple(range(n, 2 * n)))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); link(ob, parent)
    if material: ob.data.materials.append(material)
    if bevel > 0:
        mod = ob.modifiers.new("bev", 'BEVEL'); mod.width = bevel; mod.segments = 2
        mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = ob
        try:
            bpy.ops.object.modifier_apply(modifier="bev")
        except RuntimeError:
            ob.modifiers.remove(mod)
    for p in ob.data.polygons: p.use_smooth = False
    return ob

def scale_uvs(obj, sx, sy=None):
    if sy is None: sy = sx
    uv = obj.data.uv_layers.active
    if uv is None: return
    for loop in uv.data:
        loop.uv = (loop.uv[0] * sx, loop.uv[1] * sy)

def marking(text, loc, size, sgn, nm, material, parent):
    """Decal text on a vehicle side (matrix basis — reads correctly on both
    sides; pattern proven on the Seahawk build)."""
    from mathutils import Matrix, Vector as MV
    bpy.ops.object.text_add(location=(0, 0, 0))
    t = bpy.context.object; t.name = nm; t.data.body = text
    t.data.size = size; t.data.extrude = 0.005; t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    bpy.ops.object.convert(target='MESH')
    t = bpy.context.object
    n = MV((0, sgn, 0)); u = MV((0, 0, 1)); r = u.cross(n)
    m = Matrix.Identity(4)
    m.col[0][:3] = r; m.col[1][:3] = u; m.col[2][:3] = n
    m.translation = loc
    t.matrix_world = m
    t.data.materials.append(material); t.parent = parent
    return t

ROOTOB = empty("NomadPrime", (0, 0, 0), size=0.6)

# ================================================================ CHASSIS
# Frame rails + underbody (dark mechanical layer)
box("ChassisFrame_L", (-0.30,  0.42, 0.88), (7.30, 0.18, 0.28), DARKM, parent=ROOTOB)
box("ChassisFrame_R", (-0.30, -0.42, 0.88), (7.30, 0.18, 0.28), DARKM, parent=ROOTOB)
box("UnderbodyPan",   ( 0.10,  0.00, 0.60), (6.90, 2.15, 0.10), DARKER, parent=ROOTOB)
# axle housings + driveshaft
for ax, xn in (("Steer", 2.60), ("Axle1", -2.35), ("Axle2", -3.60)):
    box("AxleHousing_" + ax, (xn, 0, 0.50), (0.26, 1.95, 0.30), STEELD, parent=ROOTOB)
cyl("Driveshaft", (-1.60, 0, 0.62), 0.07, 2.10, STEELD, rot=(0, math.radians(90), 0), parent=ROOTOB)
# engine block hint under the hood
box("EngineBlock", (2.45, 0, 0.95), (1.70, 1.30, 0.55), DARKER, parent=ROOTOB)

# ================================================================ HOOD
# Long aero nose: faceted profile prism, narrower than the cab (1.86 vs 2.50)
HOOD_PTS = [
    (3.88, 0.72), (3.92, 1.72), (3.55, 1.94), (2.40, 2.05),
    (1.58, 2.10), (1.50, 1.35), (1.48, 0.95), (2.60, 0.78),
]
extrude_xz("AerodynamicHood", HOOD_PTS, 1.86, HOODM, parent=ROOTOB, bevel=0.025)
# hood crown spine (subtle raised center, per reference)
box("HoodCrown", (2.72, 0, 1.985), (2.20, 0.36, 0.035), HOODM, bevel=0.015,
    rot=(0, math.radians(-2.2), 0), parent=ROOTOB)
# Aero fenders over the steer wheels: side-profile extrusions that sweep
# from the bumper line up over the arch and taper into the cowl — the
# reference's fenders are shaped bodywork, not bolted-on boxes (polish pass).
FENDER_PTS = [
    (3.46, 0.88), (3.44, 1.22), (3.20, 1.44), (2.62, 1.52),
    (2.06, 1.44), (1.86, 1.18), (1.88, 0.90), (2.60, 0.84),
]
for sgn, sd in ((1, "L"), (-1, "R")):
    fd = extrude_xz("Fender_" + sd, FENDER_PTS, 0.50, PAINT, parent=ROOTOB, bevel=0.02)
    fd.location.y = sgn * 0.995
# hood character lines: pressed creases along the top shoulders + a side
# spear line, read as shadow grooves against the lighter hood paint
for sgn, sd in ((1, "L"), (-1, "R")):
    box("HoodCrease_" + sd, (2.56, sgn * 0.52, 2.030), (2.00, 0.030, 0.014),
        PAINT, rot=(0, math.radians(4.6), 0), parent=ROOTOB)
    box("HoodSpear_" + sd, (2.70, sgn * 0.938, 1.865), (1.95, 0.012, 0.028),
        PAINT, parent=ROOTOB)
    # cowl side vents: four louver slats per side (5700 XE signature)
    for i in range(4):
        box("HoodVent_%s_%d" % (sd, i), (1.76, sgn * 0.940, 1.44 + i * 0.085),
            (0.30, 0.014, 0.045), DARKER, rot=(0, 0, 0), parent=ROOTOB)

# ---- grille: surround + vertical louvers + badge
# Polish pass: the surround is a true FRAME (the old solid slab buried the
# recessed bars outright); louvers sit ~50 mm behind its front face — a real
# recessed reveal with shadow depth, darker steel against bright chrome.
box("GrilleRail_L", (3.945,  0.545, 1.52), (0.10, 0.13, 1.12), CHROME, bevel=0.02, parent=ROOTOB)
box("GrilleRail_R", (3.945, -0.545, 1.52), (0.10, 0.13, 1.12), CHROME, bevel=0.02, parent=ROOTOB)
box("GrilleRail_T", (3.945, 0, 2.055), (0.10, 1.18, 0.11), CHROME, bevel=0.02, parent=ROOTOB)
box("GrilleRail_B", (3.945, 0, 0.985), (0.10, 1.18, 0.11), CHROME, bevel=0.02, parent=ROOTOB)
box("GrilleRecess",   (3.905, 0, 1.52), (0.04, 1.06, 1.02), DARKER, parent=ROOTOB)
for i in range(11):
    y = -0.475 + i * 0.095
    box("GrilleBar_%02d" % i, (3.945, y, 1.52), (0.035, 0.038, 0.98), STEEL, parent=ROOTOB)
box("GrilleMidRail", (3.945, 0, 1.52), (0.030, 1.02, 0.055), STEEL, parent=ROOTOB)
box("GrilleBadge", (3.968, 0, 1.52), (0.03, 0.13, 0.13), DARKM,
    rot=(math.radians(45), 0, 0), parent=ROOTOB)

# ---- headlights: housing + twin projectors + DRL strip per side
for sgn, sd in ((1, "L"), (-1, "R")):
    box("HeadlightHousing_" + sd, (3.80, sgn * 0.90, 1.30), (0.34, 0.52, 0.30),
        DARKM, bevel=0.05, rot=(0, math.radians(-6), 0), parent=ROOTOB)
    for k, dy in enumerate((0.115, -0.115)):
        cyl("Projector_%s_%d" % (sd, k), (3.955, sgn * 0.90 + dy, 1.33), 0.082, 0.05,
            CHROME, rot=(0, math.radians(90), 0), verts=20, parent=ROOTOB)
        cyl("ProjectorLens_%s_%d" % (sd, k), (3.982, sgn * 0.90 + dy, 1.33), 0.066, 0.02,
            LENS, rot=(0, math.radians(90), 0), verts=20, parent=ROOTOB)
    box("DRL_" + sd, (3.94, sgn * 0.90, 1.475), (0.03, 0.42, 0.035), LENS, parent=ROOTOB)
    box("TurnSignal_" + sd, (3.93, sgn * 0.90, 1.16), (0.03, 0.36, 0.05), AMBER, parent=ROOTOB)

# ---- front push bumper: boxed steel, intake slots, tow hooks, fog pods
box("FrontPushBumper", (4.00, 0, 0.82), (0.34, 2.50, 0.56), DARKM, bevel=0.05, parent=ROOTOB)
box("BumperValance",   (4.02, 0, 0.46), (0.28, 2.30, 0.20), DARKER, bevel=0.03, parent=ROOTOB)
for i, y in enumerate((-0.62, 0.0, 0.62)):
    box("BumperSlot_%d" % i, (4.185, y, 0.50), (0.02, 0.44, 0.09), DARKM, parent=ROOTOB)
for sgn, sd in ((1, "L"), (-1, "R")):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.075, minor_radius=0.022,
                                     major_segments=16, minor_segments=8,
                                     location=(4.19, sgn * 0.55, 0.66),
                                     rotation=(0, math.radians(90), 0))
    th = bpy.context.object; th.name = "TowHook_" + sd
    th.data.materials.append(STEELD); th.parent = ROOTOB
    box("FogPod_" + sd, (4.16, sgn * 1.02, 0.86), (0.05, 0.15, 0.075), LENS, parent=ROOTOB)

# ================================================================ CAB + SLEEPER
# One faceted mass: raked windshield line sweeps into the high-roof aero
# fairing over the sleeper; vertical drop at the back (reference silhouette).
CAB_PTS = [
    (1.58, 0.92), (1.55, 1.60), (1.28, 2.35), (1.04, 2.98), (0.72, 3.34),
    (0.05, 3.72), (-0.85, 3.88), (-1.70, 3.86), (-2.08, 3.55), (-2.20, 3.10),
    (-2.20, 0.95), (0.20, 0.90),
]
extrude_xz("HighRoofSleeperCab", CAB_PTS, 2.50, PAINT, parent=ROOTOB, bevel=0.03)
# lower cab skirt closing the gap to the frame
box("CabSkirt", (-0.30, 0, 0.86), (3.70, 2.44, 0.22), DARKM, parent=ROOTOB)

# ---- glass: windshield pair on the rake, door glass, sleeper glass
RAKE = math.radians(-18.6)
for sgn, sd in ((1, "L"), (-1, "R")):
    box("WindshieldGlass_" + sd, (1.265, sgn * 0.565, 2.485), (0.035, 1.06, 1.04),
        GLASS, rot=(0, RAKE, 0), parent=ROOTOB)
    box("DoorGlass_" + sd, (0.93, sgn * 1.262, 2.44), (0.66, 0.025, 0.58),
        GLASS, bevel=0.02, parent=ROOTOB)
    box("SleeperGlass_" + sd, (-1.32, sgn * 1.262, 2.60), (0.52, 0.025, 0.44),
        GLASS, bevel=0.02, parent=ROOTOB)
    # door outline: thin perimeter seam strips only (a filled panel buried
    # the glass in round 1) + handle + one sleeper parting seam
    for zz in (2.16, 1.06):
        box("DoorSeamH_%s_%d" % (sd, int(zz * 10)), (0.90, sgn * 1.254, zz),
            (1.04, 0.010, 0.022), DARKER, parent=ROOTOB)
    for xx in (0.39, 1.41):
        box("DoorSeamV_%s_%d" % (sd, int(xx * 10)), (xx, sgn * 1.254, 1.61),
            (0.022, 0.010, 1.10), DARKER, parent=ROOTOB)
    box("DoorHandle_" + sd, (0.48, sgn * 1.262, 2.02), (0.16, 0.02, 0.045), STEELD, parent=ROOTOB)
    box("SleeperSeam_" + sd, (-0.62, sgn * 1.254, 2.00), (0.022, 0.010, 1.90), DARKER, parent=ROOTOB)
    # ghosted crimson pinstripes: hood sweep + sleeper parallels
    box("PinstripeHood_" + sd, (2.55, sgn * 0.938, 1.66), (2.35, 0.012, 0.035),
        CRIMSON, rot=(0, math.radians(-2.6), 0), parent=ROOTOB)
    box("PinstripeSleeper1_" + sd, (-1.30, sgn * 1.256, 2.14), (1.62, 0.010, 0.030), CRIMSON, parent=ROOTOB)
    box("PinstripeSleeper2_" + sd, (-1.30, sgn * 1.256, 2.05), (1.62, 0.010, 0.018), CRIMSON, parent=ROOTOB)
    # door lettering (spec: NOMAD PRIME / HEAVY HAUL UNIT - 01)
    marking("NOMAD PRIME", (-1.28, sgn * 1.262, 1.80), 0.30, sgn, "Lettering_" + sd, LETTER, ROOTOB)
    marking("HEAVY HAUL UNIT - 01", (-1.28, sgn * 1.262, 1.60), 0.115, sgn, "LetteringSub_" + sd, LETTER, ROOTOB)

# ---- sun visor: extruded aero wedge (polish pass — replaces the flat
# tilted plate): deep overhang, tapered underside, markers on its front face
VISOR_PTS = [
    (1.52, 2.99), (1.56, 3.09), (1.10, 3.20),
    (0.92, 3.24), (0.94, 3.10), (1.30, 3.04),
]
extrude_xz("SunVisor", VISOR_PTS, 2.20, HOODM, parent=ROOTOB, bevel=0.015)
for i, y in enumerate((-0.84, -0.42, 0.0, 0.42, 0.84)):
    box("RoofMarker_%d" % i, (1.565, y, 3.045), (0.040, 0.09, 0.048), AMBER,
        rot=(0, math.radians(-14), 0), parent=ROOTOB)

# ---- mirrors: aero arms + dual glass + round spot mirror (right, per ref)
for sgn, sd in ((1, "L"), (-1, "R")):
    cyl("MirrorArm_" + sd, (1.28, sgn * 1.36, 2.72), 0.022, 0.30, STEELD,
        rot=(math.radians(90), 0, 0), parent=ROOTOB)
    box("MirrorHousing_" + sd, (1.30, sgn * 1.52, 2.58), (0.07, 0.10, 0.46), DARKM,
        bevel=0.02, parent=ROOTOB)
    box("MirrorGlass_" + sd, (1.255, sgn * 1.52, 2.58), (0.02, 0.085, 0.42), GLASS, parent=ROOTOB)
cyl("SpotMirrorStalk", (2.02, -1.22, 1.86), 0.018, 0.34, STEELD,
    rot=(math.radians(55), 0, math.radians(-30)), parent=ROOTOB)
cyl("SpotMirror", (2.15, -1.34, 1.98), 0.11, 0.05, STEELD, rot=(math.radians(90), 0, 0), parent=ROOTOB)
cyl("SpotMirrorGlass", (2.15, -1.368, 1.98), 0.095, 0.012, GLASS, rot=(math.radians(90), 0, 0), parent=ROOTOB)

# ---- air cleaner canisters at the cowl (visible in the reference)
for sgn, sd in ((1, "L"), (-1, "R")):
    cyl("AirCleaner_" + sd, (1.42, sgn * 1.13, 1.42), 0.155, 0.52, STEELD, verts=20, parent=ROOTOB)
    cyl("AirCleanerCap_" + sd, (1.42, sgn * 1.13, 1.70), 0.165, 0.05, DARKM, verts=20, parent=ROOTOB)

# ================================================================ STACKS
# Twin vertical chrome stacks behind the cab, perforated heat shields.
for sgn, sd in ((1, "L"), (-1, "R")):
    cyl("ExhaustStack_" + sd, (-0.28, sgn * 1.235, 2.35), 0.090, 2.80, CHROME, verts=20, parent=ROOTOB)
    cyl("HeatShield_" + sd, (-0.28, sgn * 1.235, 2.02), 0.112, 1.30, STEEL, verts=20, parent=ROOTOB)
    cyl("StackElbow_" + sd, (-0.12, sgn * 1.14, 0.98), 0.080, 0.45, STEELD,
        rot=(math.radians(90), 0, 0), verts=16, parent=ROOTOB)
    # mitred tip: short angled section at the top
    cyl("StackTip_" + sd, (-0.30, sgn * 1.235, 3.80), 0.090, 0.18, CHROME,
        rot=(math.radians(24), 0, 0), verts=20, parent=ROOTOB)
    box("StackClamp_%s_1" % sd, (-0.28, sgn * 1.235, 2.72), (0.20, 0.28, 0.05), DARKM, parent=ROOTOB)
    box("StackClamp_%s_2" % sd, (-0.28, sgn * 1.235, 1.30), (0.20, 0.28, 0.05), DARKM, parent=ROOTOB)

# ================================================================ TANKS + STEPS + BOXES
for sgn, sd in ((1, "L"), (-1, "R")):
    tk = cyl("FuelTank_" + sd, (-0.02, sgn * 0.94, 0.72), 0.335, 2.05, ALU,
             rot=(0, math.radians(90), 0), verts=28, parent=ROOTOB)
    for bx in (0.62, -0.66):
        cyl("TankStrap_%s_%d" % (sd, int(bx * 10)), (bx, sgn * 0.94, 0.72), 0.345, 0.07,
            DARKM, rot=(0, math.radians(90), 0), verts=28, parent=ROOTOB)
    cyl("TankCap_" + sd, (0.30, sgn * 1.10, 0.99), 0.05, 0.10, STEELD,
        rot=(math.radians(55), 0, 0), verts=14, parent=ROOTOB)
    # diamond-plate cab steps (two treads)
    st1 = box("StepLow_" + sd, (0.88, sgn * 1.13, 0.40), (0.72, 0.36, 0.055), DIAMOND, parent=ROOTOB)
    scale_uvs(st1, 3)
    st2 = box("StepHigh_" + sd, (0.88, sgn * 1.06, 0.76), (0.72, 0.30, 0.055), DIAMOND, parent=ROOTOB)
    scale_uvs(st2, 3)
    # grab handle beside the door
    cyl("GrabHandle_" + sd, (0.36, sgn * 1.24, 1.85), 0.018, 0.62, CHROME, verts=10, parent=ROOTOB)
    # chassis tool/battery box between tank and tandem
    tb = box("ToolBox_" + sd, (-1.62, sgn * 0.96, 0.74), (1.05, 0.52, 0.52), DARKM,
             bevel=0.02, parent=ROOTOB)
    tbl = box("ToolBoxLid_" + sd, (-1.62, sgn * 0.96, 1.01), (1.05, 0.52, 0.03), DIAMOND, parent=ROOTOB)
    scale_uvs(tbl, 3)

# ================================================================ REAR DECK
# Diamond-plate catwalk flanking the fifth wheel + rear plate.
for sgn, sd in ((1, "L"), (-1, "R")):
    cw = box("RearCatwalk_" + sd, (-3.20, sgn * 0.885, 1.07), (1.80, 0.73, 0.05), DIAMOND, parent=ROOTOB)
    scale_uvs(cw, 3.5)
    cw2 = box("CatwalkFront_" + sd, (-2.42, sgn * 0.885, 1.07), (0.28, 0.73, 0.05), DIAMOND, parent=ROOTOB)
    scale_uvs(cw2, 3.5)
rp = box("RearDeckPlate", (-3.88, 0, 1.07), (0.55, 2.50, 0.05), DIAMOND, parent=ROOTOB)
scale_uvs(rp, 3.5)
# frame rails behind the sleeper (visible deck structure)
box("DeckRail_L", (-3.15,  0.42, 1.00), (1.95, 0.16, 0.14), DARKM, parent=ROOTOB)
box("DeckRail_R", (-3.15, -0.42, 1.00), (1.95, 0.16, 0.14), DARKM, parent=ROOTOB)

# ---- fifth-wheel turntable (50k heavy-haul, spec marker socket)
box("FifthWheelMount", (-2.90, 0, 1.10), (0.80, 0.90, 0.08), STEELD, parent=ROOTOB)
fw = cyl("FifthWheel", (-2.90, 0, 1.185), 0.46, 0.055, STEELD,
         rot=(0, math.radians(-3.5), 0), verts=28, parent=ROOTOB)
box("FifthWheelThroat", (-3.22, 0, 1.20), (0.55, 0.16, 0.03), DARKER,
    rot=(0, math.radians(-3.5), 0), parent=ROOTOB)  # kingpin slot opening aft
cyl("FifthWheelPivot", (-2.90, 0, 1.13), 0.10, 0.10, DARKM, verts=16, parent=ROOTOB)

# ---- air umbilical: coiled red/blue gladhand lines behind the sleeper
for k, (hm, off) in enumerate(((REDH, 0.30), (BLUEH, 0.48))):
    for i in range(4):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.085, minor_radius=0.020,
                                         major_segments=18, minor_segments=8,
                                         location=(-2.30, off, 1.62 - i * 0.085),
                                         rotation=(math.radians(90), 0, 0))
        co = bpy.context.object; co.name = "AirUmbilical_%d_%d" % (k, i)
        co.data.materials.append(hm); co.parent = ROOTOB
    box("Gladhand_%d" % k, (-2.30, off, 1.20), (0.07, 0.07, 0.12), STEELD, parent=ROOTOB)

# ---- half fenders over the tandem (faceted arc segments) + mudflaps
for sgn, sd in ((1, "L"), (-1, "R")):
    for i, ang in enumerate((14, 40, 66, 90, 114, 140, 166)):
        a = math.radians(ang)
        fx = -2.975 + 0.72 * math.cos(a)
        fz = 0.525 + 0.72 * math.sin(a)
        box("HalfFender_%s_%d" % (sd, i), (fx, sgn * 0.925, fz), (0.56, 0.80, 0.045),
            DARKM, rot=(0, math.radians(90 - ang), 0), parent=ROOTOB)
    box("Mudflap_" + sd, (-4.20, sgn * 0.925, 0.38), (0.04, 0.58, 0.62), RUBBER,
        rot=(0, math.radians(-6), 0), parent=ROOTOB)
# rear light bar / underrun
box("RearLightBar", (-4.17, 0, 0.88), (0.06, 1.90, 0.10), DARKM, parent=ROOTOB)
for sgn, sd in ((1, "L"), (-1, "R")):
    box("RearLight_" + sd, (-4.205, sgn * 0.78, 0.88), (0.02, 0.30, 0.07), REDL, parent=ROOTOB)
    box("RearMarker_" + sd, (-4.205, sgn * 0.30, 0.88), (0.02, 0.12, 0.07), AMBER, parent=ROOTOB)
# small amber side markers along the skirt
for sgn, sd in ((1, "L"), (-1, "R")):
    for xx in (1.35, -0.55, -2.15):
        box("SideMarker_%s_%d" % (sd, int(abs(xx) * 10)), (xx, sgn * 1.236, 0.86),
            (0.10, 0.015, 0.045), AMBER, parent=ROOTOB)

# ================================================================ INTERIOR
# Cab floor, dash, captain chairs, steering, sleeper bunk + lockers.
box("CabFloor", (0.10, 0, 1.10), (3.30, 2.30, 0.08), INTD, parent=ROOTOB)
box("Dash", (1.28, 0, 1.80), (0.42, 2.20, 0.42), INTM, bevel=0.05, parent=ROOTOB)
box("DashTop", (1.22, 0, 2.04), (0.50, 2.20, 0.06), INTD, parent=ROOTOB)
box("DashScreen", (1.05, 0.0, 1.86), (0.03, 0.42, 0.24), SCREEN,
    rot=(0, math.radians(-14), 0), parent=ROOTOB)
box("GaugeCluster", (1.06, 0.62, 1.90), (0.03, 0.44, 0.20), SCREEN,
    rot=(0, math.radians(-14), 0), parent=ROOTOB)
box("CenterConsole", (0.72, 0, 1.28), (0.85, 0.44, 0.30), INTM, bevel=0.03, parent=ROOTOB)
# steering wheel + column (driver = left, +Y)
cyl("SteeringColumn", (1.02, 0.62, 1.66), 0.035, 0.42, INTD,
    rot=(math.radians(38), 0, 0), verts=12, parent=ROOTOB)
bpy.ops.mesh.primitive_torus_add(major_radius=0.225, minor_radius=0.026,
                                 major_segments=28, minor_segments=10,
                                 location=(0.94, 0.62, 1.80),
                                 rotation=(0, math.radians(52), 0))
sw = bpy.context.object; sw.name = "SteeringWheel"
sw.data.materials.append(INTD); sw.parent = ROOTOB
box("SteeringHub", (0.94, 0.62, 1.80), (0.05, 0.16, 0.10), INTM,
    rot=(0, math.radians(52), 0), parent=ROOTOB)

def captain_chair(nm, y):
    g = empty(nm, (0.42, y, 1.14), parent=ROOTOB, size=0.15)
    box(nm + "_Base", (0.42, y, 1.20), (0.58, 0.56, 0.12), INTD, parent=ROOTOB)
    box(nm + "_Cushion", (0.42, y, 1.33), (0.60, 0.58, 0.13), SEATF, bevel=0.04, parent=ROOTOB)
    box(nm + "_Back", (0.13, y, 1.78), (0.13, 0.58, 0.86), SEATF, bevel=0.05,
        rot=(0, math.radians(8), 0), parent=ROOTOB)
    box(nm + "_Headrest", (0.065, y, 2.32), (0.11, 0.30, 0.20), SEATF, bevel=0.04,
        rot=(0, math.radians(8), 0), parent=ROOTOB)
    for s2 in (1, -1):
        box(nm + "_Arm_%d" % s2, (0.36, y + s2 * 0.345, 1.62), (0.44, 0.06, 0.07),
            INTM, parent=ROOTOB)
    return g

captain_chair("CaptainChair_Driver", 0.62)
captain_chair("CaptainChair_Passenger", -0.62)

# sleeper: liners, platform bunk, pillow, overhead cabinets, rear lockers
for sgn, sd in ((1, "L"), (-1, "R")):
    box("SleeperLiner_" + sd, (-1.30, sgn * 1.17, 2.20), (1.70, 0.05, 2.30), INTM, parent=ROOTOB)
box("SleeperCeiling", (-1.30, 0, 3.38), (1.70, 2.30, 0.05), INTM, parent=ROOTOB)
box("SleeperBunk", (-1.55, 0, 1.30), (1.15, 2.05, 0.20), BUNKF, bevel=0.04, parent=ROOTOB)
box("BunkBase", (-1.55, 0, 1.14), (1.20, 2.10, 0.14), INTD, parent=ROOTOB)
box("BunkPillow", (-1.98, 0.45, 1.46), (0.30, 0.62, 0.13), PILLOW, bevel=0.04, parent=ROOTOB)
box("BunkBlanket", (-1.30, -0.25, 1.43), (0.80, 1.15, 0.07), SEATF, bevel=0.03, parent=ROOTOB)
box("OverheadCabinet", (-2.02, 0, 2.95), (0.30, 1.90, 0.55), INTM, bevel=0.02, parent=ROOTOB)
for sgn, sd in ((1, "L"), (-1, "R")):
    box("SleeperLocker_" + sd, (-2.06, sgn * 0.72, 1.95), (0.26, 0.80, 1.45), INTM,
        bevel=0.02, parent=ROOTOB)
    box("LockerHandle_" + sd, (-1.92, sgn * 0.72, 1.95), (0.03, 0.05, 0.30), STEELD, parent=ROOTOB)
box("FridgeBox", (-2.02, -0.85, 1.55), (0.28, 0.45, 0.62), INTD, parent=ROOTOB)
box("SleeperLamp", (-2.14, 0, 2.55), (0.03, 0.30, 0.08), LENS, parent=ROOTOB)

# ================================================================ WHEELS (10 pivots)
WHEEL_R = 0.525

def make_wheel(pname, x, yc, width, dual_outer):
    from mathutils import Matrix
    piv = empty(pname, (x, yc, WHEEL_R), parent=ROOTOB, size=0.25)
    parts = []
    parts.append(cyl(pname + "_Tire", (x, yc, WHEEL_R), WHEEL_R, width, TIRE,
                     rot=(math.radians(90), 0, 0), verts=36))
    # rounded shoulders
    for s2 in (1, -1):
        bpy.ops.mesh.primitive_torus_add(major_radius=WHEEL_R - 0.035, minor_radius=0.038,
                                         major_segments=30, minor_segments=10,
                                         location=(x, yc + s2 * (width / 2 - 0.015), WHEEL_R),
                                         rotation=(math.radians(90), 0, 0))
        sh = bpy.context.object; sh.name = pname + "_Shoulder_%d" % s2
        sh.data.materials.append(TIRE); parts.append(sh)
    # deep-dish rim: outer barrel + recessed face + hub + lugs (both faces so
    # inner duals read correctly from their visible side too)
    parts.append(cyl(pname + "_Rim", (x, yc, WHEEL_R), 0.295, width + 0.012, STEEL,
                     rot=(math.radians(90), 0, 0), verts=28))
    out_sgn = 1 if yc > 0 else -1
    if dual_outer:
        face_y = yc + out_sgn * (width / 2 - 0.055)
        parts.append(cyl(pname + "_Dish", (x, face_y, WHEEL_R), 0.235, 0.10, STEEL,
                         rot=(math.radians(90), 0, 0), verts=24))
        # bright rim lip ring — the reference's wheels read by this ring
        parts.append(cyl(pname + "_RimLip", (x, yc + out_sgn * (width / 2 + 0.002), WHEEL_R),
                         0.298, 0.018, ALU, rot=(math.radians(90), 0, 0), verts=28))
    hub_y = yc + out_sgn * (width / 2 + 0.005)
    parts.append(cyl(pname + "_Hub", (x, hub_y, WHEEL_R), 0.115, 0.085, STEEL,
                     rot=(math.radians(90), 0, 0), verts=18))
    for i in range(8):
        a = 2 * math.pi * i / 8
        parts.append(cyl(pname + "_Lug_%d" % i,
                         (x + 0.165 * math.cos(a), hub_y, WHEEL_R + 0.165 * math.sin(a)),
                         0.020, 0.085, STEELD, rot=(math.radians(90), 0, 0), verts=8))
    # parent parts to the pivot, preserving world placement (pivot hangs off
    # the identity root, so its world matrix is a pure translation)
    inv = Matrix.Translation((x, yc, WHEEL_R)).inverted()
    for p in parts:
        p.parent = piv
        p.matrix_parent_inverse = inv
    return piv

make_wheel("Wheel_Steer_Left", 2.60, 0.95, 0.32, True)
make_wheel("Wheel_Steer_Right", 2.60, -0.95, 0.32, True)
for axn, xx in (("Axle1", -2.35), ("Axle2", -3.60)):
    make_wheel("Wheel_Drive_%s_Left_Outer" % axn, xx, 0.985, 0.28, True)
    make_wheel("Wheel_Drive_%s_Left_Inner" % axn, xx, 0.665, 0.28, False)
    make_wheel("Wheel_Drive_%s_Right_Outer" % axn, xx, -0.985, 0.28, True)
    make_wheel("Wheel_Drive_%s_Right_Inner" % axn, xx, -0.665, 0.28, False)

# ================================================================ MARKERS
empty("driver_seat", (0.42, 0.62, 1.62), parent=ROOTOB)
empty("passenger_seat", (0.42, -0.62, 1.62), parent=ROOTOB)
empty("sleeper_bunk_rest_point", (-1.55, 0, 1.62), parent=ROOTOB)
empty("trailer_hitch_fifth_wheel", (-2.90, 0, 1.30), parent=ROOTOB)
empty("electrical_brake_umbilical", (-2.30, 0.39, 1.55), parent=ROOTOB)
empty("headlight_left_projector", (4.02, 0.90, 1.33), parent=ROOTOB)
empty("headlight_right_projector", (4.02, -0.90, 1.33), parent=ROOTOB)

# ================================================================ EXPORT
os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB',
                          use_selection=True, export_apply=True, export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print("NOMAD PRIME EXPORTED", GLB_OUT,
      "mesh objects:", sum(1 for o in bpy.data.objects if o.type == 'MESH'),
      "polys:", tris, "size MB:", round(os.path.getsize(GLB_OUT) / 1e6, 2))
