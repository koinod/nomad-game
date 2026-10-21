#!/usr/bin/env python3
"""NOMAD Lane 2 — MH-60S Sea Hawk procedural build (Blender 4.2).

Axes (house convention, same as tools/build_mustang.py):
  X = length (nose +X), Y = width (port/left +Y), Z = up.  Meters.
Ground plane = z 0 (gear bottoms).  Nose tip x +7.64, tail cone x -7.63.

Builds airframe loft, doghouse, rotors (separate pivots), tail, gear,
glass, full cockpit + cabin interior, door-gunner station, markings.
Exports public/seahawk.glb and saves tools/seahawk/seahawk.blend.

Run: blender -b --python tools/seahawk/build_seahawk.py
"""
import bpy, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
GLB_OUT = os.path.join(WT, "public", "seahawk.glb")
BLEND_OUT = os.path.join(ROOT, "seahawk.blend")

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

# ---------------------------------------------------------------- materials
def mat(name, rgb, rough=0.6, metal=0.1, alpha=None, emissive=None, ei=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, alpha if alpha is not None else 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emissive:
        bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
        bsdf.inputs["Emission Strength"].default_value = ei
    if alpha is not None:
        m.surface_render_method = 'DITHERED'
    return m

AIR   = mat("naval_gray",      (0.335, 0.365, 0.385), 0.58, 0.18)   # ref body gray
AIRD  = mat("gray_dark",       (0.185, 0.195, 0.205), 0.62, 0.15)   # doghouse top / anti-glare
GLASS = mat("glass_tint",      (0.055, 0.085, 0.105), 0.07, 0.25, alpha=0.62)
DARK  = mat("near_black",      (0.045, 0.048, 0.052), 0.85, 0.05)
INTM  = mat("interior",        (0.115, 0.125, 0.115), 0.9, 0.0)     # cabin tub
INTD  = mat("interior_dark",   (0.06, 0.065, 0.06), 0.92, 0.0)
SEAT  = mat("seat_fabric",     (0.09, 0.10, 0.075), 0.98, 0.0)      # olive drab canvas
SEATP = mat("seat_cushion",    (0.13, 0.115, 0.07), 0.95, 0.0)      # worn tan-olive
SCRN  = mat("screen",          (0.02, 0.05, 0.045), 0.25, 0.0, emissive=(0.05, 0.28, 0.20), ei=0.55)
SCRN2 = mat("screen_amber",    (0.05, 0.04, 0.01), 0.25, 0.0, emissive=(0.30, 0.18, 0.03), ei=0.5)
METAL = mat("gunmetal",        (0.10, 0.105, 0.11), 0.42, 0.75)
EXH   = mat("exhaust",         (0.13, 0.11, 0.10), 0.55, 0.6)
TIRE  = mat("tire",            (0.03, 0.03, 0.032), 0.95, 0.0)
HUBM  = mat("hub_gray",        (0.22, 0.23, 0.24), 0.5, 0.4)
BLADE = mat("rotor_charcoal",  (0.075, 0.078, 0.082), 0.55, 0.25)
TIPM  = mat("blade_tip",       (0.40, 0.41, 0.40), 0.5, 0.2)
MARK  = mat("marking",         (0.16, 0.175, 0.185), 0.55, 0.1)    # low-viz darker gray
ORNG  = mat("placard_orange",  (0.65, 0.22, 0.03), 0.6, 0.0)
REDL  = mat("light_red",       (0.3, 0.02, 0.02), 0.4, 0.0, emissive=(1.0, 0.05, 0.05), ei=2.0)
GRNL  = mat("light_green",     (0.02, 0.3, 0.05), 0.4, 0.0, emissive=(0.05, 1.0, 0.15), ei=2.0)
WHITEL= mat("light_white",     (0.4, 0.4, 0.38), 0.4, 0.0, emissive=(1.0, 0.98, 0.9), ei=1.4)

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

def cyl(name, loc, radius, depth, material=None, rot=(0, 0, 0), verts=20, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    ob = bpy.context.object; ob.name = name
    if material: ob.data.materials.append(material)
    for p in ob.data.polygons: p.use_smooth = True
    if parent: ob.parent = parent
    return ob

def sphere(name, loc, scale, material=None, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=loc)
    ob = bpy.context.object; ob.name = name; ob.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    if material: ob.data.materials.append(material)
    for p in ob.data.polygons: p.use_smooth = True
    if parent: ob.parent = parent
    return ob

def loft(name, stations, material=None, n=32, exp=3.4, cap=True, parent=None):
    """stations: list of (x, halfW, halfH, zCenter). Superellipse rings bridged."""
    rings = []
    for (x, hw, hh, zc) in stations:
        ring = []
        for i in range(n):
            t = 2 * math.pi * i / n
            c, s = math.cos(t), math.sin(t)
            ey = hw * math.copysign(abs(c) ** (2.0 / exp), c)
            ez = zc + hh * math.copysign(abs(s) ** (2.0 / exp), s)
            ring.append((x, ey, ez))
        rings.append(ring)
    verts, faces = [], []
    for ring in rings: verts.extend(ring)
    R = len(rings)
    for r in range(R - 1):
        for i in range(n):
            a = r * n + i; b = r * n + (i + 1) % n
            c2 = (r + 1) * n + (i + 1) % n; d = (r + 1) * n + i
            faces.append((a, b, c2, d))
    if cap:
        c0 = len(verts); verts.append(rings[0][0] and (stations[0][0], 0.0, stations[0][3]) or (0, 0, 0))
        for i in range(n): faces.append((c0, (i + 1) % n, i))
        c1 = len(verts); verts.append((stations[-1][0], 0.0, stations[-1][3]))
        base = (R - 1) * n
        for i in range(n): faces.append((c1, base + i, base + (i + 1) % n))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); link(ob, parent)
    return finish(ob, material)

def empty(name, loc, parent=None):
    ob = bpy.data.objects.new(name, None); ob.empty_display_type = 'PLAIN_AXES'
    ob.empty_display_size = 0.3; ob.location = loc; link(ob, parent)
    return ob

ROOTOB = empty("Seahawk", (0, 0, 0))

# ================================================================ FUSELAGE LOFT
# (x, halfW, halfH, zCenter) nose -> tail
FUSE_STATIONS = [
    ( 7.64, 0.06, 0.09, 1.80),
    ( 7.35, 0.50, 0.62, 1.84),
    ( 6.70, 0.90, 0.90, 1.94),
    ( 5.50, 1.15, 1.06, 2.00),
    ( 3.60, 1.17, 1.10, 2.01),
    ( 1.60, 1.16, 1.10, 2.02),
    (-0.20, 1.08, 1.05, 2.07),
    (-1.80, 0.84, 0.80, 2.20),
    (-4.20, 0.56, 0.58, 2.38),
    (-6.20, 0.43, 0.47, 2.58),
    (-7.30, 0.31, 0.42, 2.80),
    (-7.63, 0.05, 0.07, 2.87),
]
fuse = loft("SH_Fuselage", FUSE_STATIONS, AIR, parent=ROOTOB)

# Anti-glare panel ahead of windshield (dark deck strip)
box("SH_AntiGlare", (6.28, 0, 2.86), (0.95, 1.05, 0.05), AIRD, bevel=0.02,
    rot=(0, math.radians(-14), 0), parent=ROOTOB)

# ---- door aperture cutouts (boolean, exact solver) -------------------------
def cut_rounded_box(target, name, loc, scale, bevel=0.16):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    cu = bpy.context.object; cu.name = name
    cu.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    mod = cu.modifiers.new("bev", 'BEVEL'); mod.width = bevel; mod.segments = 3
    bpy.context.view_layer.objects.active = cu
    bpy.ops.object.modifier_apply(modifier="bev")
    bpy.context.view_layer.objects.active = target
    bm = target.modifiers.new("cut", 'BOOLEAN'); bm.operation = 'DIFFERENCE'
    bm.solver = 'EXACT'; bm.object = cu
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cu, do_unlink=True)

# doors: opening x 3.95..2.60 (w 1.35), z 0.95..2.45 (h 1.50), both sides
cut_rounded_box(fuse, "cut_port", (3.28, 1.05, 1.70), (1.35, 0.55, 1.50))
cut_rounded_box(fuse, "cut_stbd", (3.28, -1.05, 1.70), (1.35, 0.55, 1.50))
print("FUSELAGE verts after cuts:", len(fuse.data.vertices))

# ================================================================ DOGHOUSE
# Transmission fairing on top of cabin, x +3.3 .. -1.7
DOG_STATIONS = [
    ( 3.30, 0.30, 0.10, 3.06),
    ( 2.80, 0.66, 0.34, 3.08),
    ( 1.90, 0.78, 0.46, 3.10),
    ( 0.60, 0.80, 0.47, 3.10),
    (-0.80, 0.76, 0.42, 3.08),
    (-1.70, 0.55, 0.26, 2.98),
    (-2.05, 0.20, 0.08, 2.90),
]
dog = loft("SH_Doghouse", DOG_STATIONS, AIR, parent=ROOTOB)
# dark top deck plate
box("SH_DeckTop", (0.6, 0, 3.56), (2.6, 1.15, 0.06), AIRD, bevel=0.03, parent=ROOTOB)

# engine intakes (front face of doghouse sides): dark oval + lip
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    it = sphere("SH_Intake" + nm, (2.42, sgn * 0.80, 3.12), (0.30, 0.10, 0.24), DARK, parent=ROOTOB)
    lip = cyl("SH_IntakeLip" + nm, (2.42, sgn * 0.86, 3.12), 0.27, 0.07, AIRD,
              rot=(math.radians(90), 0, 0), parent=ROOTOB)
    lip.scale = (1.15, 1.0, 0.85); bpy.context.view_layer.objects.active = lip
    bpy.ops.object.transform_apply(scale=True)
    # exhaust: oval outlet on aft doghouse sides, angled up/aft
    ex = cyl("SH_Exhaust" + nm, (-0.55, sgn * 0.82, 3.22), 0.30, 0.16, EXH,
             rot=(math.radians(90), 0, 0), parent=ROOTOB)
    ex.scale = (1.25, 1.0, 0.8); bpy.context.view_layer.objects.active = ex
    bpy.ops.object.transform_apply(scale=True)
    box("SH_ExhaustShroud" + nm, (-0.55, sgn * 0.72, 3.30), (0.85, 0.30, 0.28), AIR,
        bevel=0.06, rot=(0, math.radians(10), 0), parent=ROOTOB)

# SATCOM humps (two drums on aft deck, per ref) + GPS dome
cyl("SH_Satcom1", (0.05, 0.18, 3.66), 0.27, 0.20, AIR, parent=ROOTOB)
cyl("SH_Satcom2", (-0.75, -0.10, 3.64), 0.24, 0.18, AIR, parent=ROOTOB)
sphere("SH_GpsDome", (1.55, 0, 3.60), (0.17, 0.17, 0.10), AIRD, parent=ROOTOB)
# blade antenna under tail boom + under cabin
box("SH_AntBoom", (-3.4, 0, 1.62), (0.42, 0.04, 0.30), AIRD, bevel=0.02, parent=ROOTOB)
box("SH_AntBelly", (2.2, 0, 0.66), (0.36, 0.04, 0.22), AIRD, bevel=0.02, parent=ROOTOB)

# ================================================================ MAIN ROTOR
mast_pivot = empty("MainRotorPivot", (0.95, 0, 3.92), parent=ROOTOB)
cyl("SH_Mast", (0.95, 0, 3.72), 0.13, 0.45, METAL, parent=ROOTOB)
# swashplate hint (visible in ref through hub area)
cyl("SH_Swashplate", (0.95, 0, 3.80), 0.30, 0.07, HUBM, parent=ROOTOB)
hub = cyl("SH_RotorHub", (0, 0, 0.10), 0.34, 0.24, HUBM, parent=mast_pivot)
sphere("SH_HubCap", (0, 0, 0.24), (0.20, 0.20, 0.12), AIRD, parent=mast_pivot)
# pitch links
for i in range(4):
    a = math.radians(45 + i * 90)
    cyl("SH_PitchLink%d" % i, (0.30 * math.cos(a), 0.30 * math.sin(a), -0.08), 0.022, 0.22,
        METAL, parent=mast_pivot)

def rotor_blade(name, r0=0.30, r1=8.18, chord=0.81, parent=None):
    """Blade along +X from hub center, droop baked (tip ~0.21 low). Segments root/mid/tip."""
    droop = math.radians(1.5)
    profs = [  # (r, chord, thick, sweep_back)
        (r0, chord * 0.92, 0.085, 0.0),
        (r0 + 1.2, chord, 0.075, 0.0),
        (r1 - 0.9, chord * 0.99, 0.062, 0.0),
        (r1 - 0.18, chord * 0.86, 0.05, 0.28),   # swept tip
        (r1, chord * 0.55, 0.04, 0.46),
    ]
    verts, faces = [], []
    for (r, ch, th, sw) in profs:
        y0 = -ch / 2 - sw; y1 = ch / 2 - sw
        z = -math.sin(droop) * r
        verts += [(r, y0, z - th / 2), (r, y1, z - th / 2), (r, y1, z + th / 2), (r, y0, z + th / 2)]
    for s in range(len(profs) - 1):
        for k in range(4):
            faces.append((s * 4 + k, s * 4 + (k + 1) % 4, (s + 1) * 4 + (k + 1) % 4, (s + 1) * 4 + k))
    faces.append((3, 2, 1, 0))
    b = len(profs) * 4 - 4
    faces.append((b, b + 1, b + 2, b + 3))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); link(ob, parent)
    finish(ob, BLADE, smooth=False)
    ob.data.materials.append(TIPM)  # index 1: tip band on last segment + cap
    for idx, p in enumerate(ob.data.polygons):
        if idx >= (len(profs) - 2) * 4:
            p.material_index = 1
    return ob

for i in range(4):
    bl = rotor_blade("SH_Blade%d" % i, parent=mast_pivot)
    bl.rotation_euler = (0, 0, math.radians(45 + i * 90))

# ================================================================ TAIL
# vertical fin: extruded profile (side view shape) at boom aft
fin_profile = [  # (x, z) leading edge up-swept, capped top, trailing down
    (-5.95, 2.78), (-6.55, 3.90), (-6.95, 4.42), (-7.45, 4.50),
    (-7.68, 4.30), (-7.70, 3.10), (-7.55, 2.72),
]
verts, faces = [], []
for (x, z) in fin_profile: verts.append((x, 0.10, z))
for (x, z) in fin_profile: verts.append((x, -0.10, z))
np_ = len(fin_profile)
for i in range(np_ - 1):
    faces.append((i, i + 1, np_ + i + 1, np_ + i))
faces.append(tuple(range(np_ - 1, -1, -1)))
faces.append(tuple(range(np_, 2 * np_)))
me = bpy.data.meshes.new("SH_TailFin"); me.from_pydata(verts, [], faces); me.update()
fin = bpy.data.objects.new("SH_TailFin", me); link(fin, ROOTOB); finish(fin, AIR, smooth=False)
# fin base fairing blending into boom
sphere("SH_FinBase", (-6.9, 0, 2.95), (0.95, 0.30, 0.42), AIR, parent=ROOTOB)
# small ventral fin strake
box("SH_VentralFin", (-7.15, 0, 2.28), (0.85, 0.06, 0.5), AIR, bevel=0.02,
    rot=(0, math.radians(-12), 0), parent=ROOTOB)

# tail rotor: mount (static, canted 20 deg about X) -> spin pivot on PORT (+Y) face of fin
tr_mount = empty("TailRotorMount", (-7.18, 0.16, 3.98), parent=ROOTOB)
tr_mount.rotation_euler = (math.radians(20), 0, 0)
tr_pivot = empty("TailRotorPivot", (0, 0, 0), parent=tr_mount)  # spin about local Y
cyl("SH_TailHub", (0, 0.10, 0), 0.13, 0.24, HUBM, rot=(math.radians(90), 0, 0), parent=tr_pivot)
def tail_blade(name, parent=None):
    profs = [(0.10, 0.30, 0.045, 0.0), (0.85, 0.285, 0.038, 0.0), (1.55, 0.25, 0.03, 0.10), (1.675, 0.16, 0.024, 0.2)]
    verts, faces = [], []
    for (r, ch, th, sw) in profs:
        y0 = -ch / 2 - sw; y1 = ch / 2 - sw
        verts += [(y0, 0, r - th / 2), (y1, 0, r - th / 2), (y1, 0, r + th / 2), (y0, 0, r + th / 2)]
    for s in range(len(profs) - 1):
        for k in range(4):
            faces.append((s * 4 + k, s * 4 + (k + 1) % 4, (s + 1) * 4 + (k + 1) % 4, (s + 1) * 4 + k))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); link(ob, parent)
    return finish(ob, BLADE, smooth=False)
for i in range(4):
    tb = tail_blade("SH_TailBlade%d" % i, parent=tr_pivot)
    tb.rotation_euler = (0, math.radians(45 + i * 90), 0)

# stabilator (separate object; folds on the real aircraft)
stab = box("SH_Stabilator", (-6.62, 0, 2.52), (0.95, 4.38, 0.09), AIR, bevel=0.04, parent=ROOTOB)

# ================================================================ SPONSONS + GEAR
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    sp = loft("SH_Sponson" + nm, [
        (3.55, 0.06, 0.05, 1.02), (3.25, 0.30, 0.26, 1.00), (2.45, 0.36, 0.30, 0.98),
        (1.55, 0.30, 0.26, 1.00), (1.15, 0.06, 0.05, 1.04)], AIR, parent=ROOTOB)
    sp.location.y = sgn * 1.13
    # gear strut + axle
    cyl("SH_GearStrut" + nm, (2.42, sgn * 1.38, 0.62), 0.075, 0.62, METAL, parent=ROOTOB)
    cyl("SH_GearDrag" + nm, (2.72, sgn * 1.30, 0.72), 0.045, 0.55, METAL,
        rot=(math.radians(38), math.radians(24), 0), parent=ROOTOB)
    # wheel: torus-ish tire = cylinder with bevel + hub disc; separate object (pivot = own origin)
    wh = cyl("SH_WheelMain" + nm, (2.42, sgn * 1.42, 0.345), 0.345, 0.24, TIRE,
             rot=(math.radians(90), 0, 0), verts=28, parent=ROOTOB)
    cyl("SH_WheelHub" + nm, (2.42, sgn * 1.43, 0.345), 0.17, 0.25, HUBM,
        rot=(math.radians(90), 0, 0), parent=ROOTOB)
# tail wheel + strut (boom belly is ~2.1 high back here: the strut is LONG)
cyl("SH_TailStrut", (-6.32, 0, 1.13), 0.055, 1.95, METAL, rot=(0, math.radians(10), 0), parent=ROOTOB)
cyl("SH_TailBrace", (-6.61, 0, 1.30), 0.03, 1.16, METAL, rot=(0, math.radians(-19), 0), parent=ROOTOB)
cyl("SH_WheelTail", (-6.48, 0, 0.205), 0.205, 0.13, TIRE, rot=(math.radians(90), 0, 0), verts=24, parent=ROOTOB)
cyl("SH_WheelTailHub", (-6.48, 0, 0.205), 0.09, 0.14, HUBM, rot=(math.radians(90), 0, 0), parent=ROOTOB)

# ================================================================ GLAZING
def pane(name, center, size, rot, parent=ROOTOB):
    return box(name, center, size, GLASS, bevel=0.03, rot=rot, parent=parent)

# windshield pair (raked, ON the sloped nose face) + center pillar
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    pane("SH_Windshield" + nm, (6.95, sgn * 0.44, 2.40), (0.06, 0.78, 0.82),
         (0, math.radians(-26), math.radians(sgn * -5)))
    # cockpit side window (big door window)
    pane("SH_CockpitWindow" + nm, (5.55, sgn * 1.175, 2.42), (1.15, 0.05, 0.78),
         (math.radians(sgn * 2), math.radians(-4), 0))
    # chin bubble (lower side window)
    pane("SH_ChinBubble" + nm, (6.42, sgn * 0.94, 1.62), (0.62, 0.30, 0.42),
         (0, math.radians(-10), math.radians(sgn * 38)))
    # aft cabin window (surface quad, dark)
    pane("SH_CabinWindowAft" + nm, (0.55, sgn * 1.155, 2.28), (0.62, 0.04, 0.52), (0, 0, 0))
    pane("SH_CabinWindowMid" + nm, (1.55, sgn * 1.165, 2.30), (0.55, 0.04, 0.48), (0, 0, 0))
box("SH_WindshieldPillar", (6.93, 0, 2.40), (0.08, 0.09, 0.84), AIRD,
    rot=(0, math.radians(-26), 0), parent=ROOTOB)
# windshield wipers
for sgn in (1, -1):
    box("SH_Wiper%d" % sgn, (7.02, sgn * 0.44, 2.20), (0.03, 0.05, 0.52), DARK,
        rot=(0, math.radians(-26), 0), parent=ROOTOB)

# ================================================================ SLIDING DOORS
def build_door(sgn, nm):
    piv = empty("DoorPivot_" + nm, (3.28, sgn * 1.16, 1.70), parent=ROOTOB)
    d = box("SH_Door" + nm, (0, 0, 0), (1.32, 0.07, 1.48), AIR, bevel=0.05, parent=piv)
    # door window (upper) + small lower window
    box("SH_DoorWindow" + nm, (0.05, sgn * 0.045, 0.32), (0.95, 0.03, 0.62), GLASS, parent=piv)
    box("SH_DoorHandle" + nm, (0.45, sgn * 0.06, -0.1), (0.16, 0.03, 0.05), DARK, parent=piv)
    # rail above door
    box("SH_DoorRail" + nm, (3.28, sgn * 1.19, 2.52), (2.5, 0.05, 0.07), AIRD, parent=ROOTOB)
    return piv
door_port = build_door(1, "Port")
door_stbd = build_door(-1, "Stbd")

# ================================================================ INTERIOR
# cabin tub: floor, ceiling, inner walls, bulkheads
box("SH_CabinFloor", (1.9, 0, 0.99), (5.6, 2.02, 0.06), INTD, parent=ROOTOB)
box("SH_CabinCeiling", (1.9, 0, 2.90), (5.6, 2.02, 0.05), INTM, parent=ROOTOB)
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    # walls stop at the door aperture (x 2.58..3.98) so the doorway opens into the real cabin
    box("SH_CabinWall" + nm, (0.84, sgn * 1.03, 1.95), (3.48, 0.05, 1.86), INTM, parent=ROOTOB)
    box("SH_CabinWallFwd" + nm, (4.29, sgn * 1.03, 1.95), (0.62, 0.05, 1.86), INTM, parent=ROOTOB)
box("SH_BulkheadAft", (-0.85, 0, 1.95), (0.06, 2.02, 1.92), INTM, parent=ROOTOB)
# fwd bulkhead has a center passage (cockpit <-> cabin walkway, as on the real aircraft)
for sgn in (1, -1):
    box("SH_BulkheadFwd%d" % sgn, (4.62, sgn * 0.685, 1.95), (0.06, 0.65, 1.92), INTM, parent=ROOTOB)
# dome lights
for x in (3.4, 1.2):
    box("SH_DomeLight%d" % int(x * 10), (x, 0, 2.86), (0.22, 0.3, 0.03), WHITEL, parent=ROOTOB)

# ---- cockpit
box("SH_Panel", (6.06, 0, 1.98), (0.34, 1.72, 0.78), INTD,
    rot=(0, math.radians(12), 0), parent=ROOTOB)
box("SH_Glareshield", (6.16, 0, 2.42), (0.42, 1.78, 0.06), DARK, parent=ROOTOB)
# MFD screens: 2 per pilot — on the panel's PILOT face (x 5.87, panel spans 5.89..6.23)
for sgn in (1, -1):
    pane_s = box("SH_MFD%d_a" % sgn, (5.87, sgn * 0.46, 2.06), (0.04, 0.40, 0.34), SCRN,
                 rot=(0, math.radians(12), 0), parent=ROOTOB)
    box("SH_MFD%d_b" % sgn, (5.87, sgn * 0.44, 1.68), (0.04, 0.38, 0.26), SCRN2,
        rot=(0, math.radians(12), 0), parent=ROOTOB)
box("SH_MFDCenter", (5.87, 0, 1.86), (0.04, 0.34, 0.44), SCRN, rot=(0, math.radians(12), 0), parent=ROOTOB)
box("SH_Console", (5.72, 0, 1.24), (0.85, 0.44, 0.5), INTD, parent=ROOTOB)
box("SH_OverheadPanel", (5.95, 0, 2.80), (0.6, 0.8, 0.06), INTD, parent=ROOTOB)
# pedestal throttle quadrant hint
box("SH_Quadrant", (5.55, 0, 1.56), (0.4, 0.22, 0.1), DARK, parent=ROOTOB)

def pilot_seat(nm, y):
    g = empty("Seat_" + nm, (5.05, y, 0), parent=ROOTOB)
    box("SH_SeatPan" + nm, (0, 0, 1.22), (0.55, 0.52, 0.10), SEATP, bevel=0.03, parent=g)
    box("SH_SeatBack" + nm, (-0.28, 0, 1.62), (0.12, 0.52, 0.85), SEAT, bevel=0.04,
        rot=(0, math.radians(6), 0), parent=g)
    box("SH_Headrest" + nm, (-0.33, 0, 2.14), (0.10, 0.30, 0.22), SEAT, bevel=0.03, parent=g)
    box("SH_SeatBase" + nm, (0, 0, 1.05), (0.45, 0.44, 0.28), INTD, parent=g)
    # harness straps
    box("SH_Harness" + nm, (-0.20, 0, 1.75), (0.03, 0.30, 0.55), DARK, parent=g)
    # cyclic between knees + collective on left side
    cyl("SH_Cyclic" + nm, (0.28, 0, 1.28), 0.025, 0.34, DARK,
        rot=(0, math.radians(-16), 0), parent=g)
    box("SH_Collective" + nm, (0.05, 0.36, 1.28), (0.34, 0.06, 0.06), DARK,
        rot=(0, math.radians(-24), 0), parent=g)
pilot_seat("Pilot", -0.55)
pilot_seat("Copilot", 0.55)
# pedals
for sgn in (1, -1):
    for k in (-1, 1):
        box("SH_Pedal%d_%d" % (sgn, k), (5.78, sgn * 0.55 + k * 0.14, 1.18), (0.05, 0.1, 0.16), DARK, parent=ROOTOB)

# ---- cabin troop seats (benches along aft walls)
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    box("SH_BenchPan" + nm, (0.55, sgn * 0.78, 1.28), (2.1, 0.42, 0.07), SEAT, bevel=0.02, parent=ROOTOB)
    box("SH_BenchBack" + nm, (0.55, sgn * 0.97, 1.62), (2.1, 0.06, 0.62), SEAT, bevel=0.02, parent=ROOTOB)
    box("SH_BenchLegs" + nm, (0.55, sgn * 0.80, 1.10), (2.0, 0.34, 0.3), INTD, parent=ROOTOB)
# fwd cabin jump seats facing aft (by the doors)
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    box("SH_JumpSeat" + nm, (4.30, sgn * 0.72, 1.30), (0.45, 0.45, 0.07), SEAT, bevel=0.02, parent=ROOTOB)
    box("SH_JumpBack" + nm, (4.52, sgn * 0.72, 1.60), (0.06, 0.45, 0.55), SEAT, bevel=0.02, parent=ROOTOB)

# ---- door gunner station (PORT): swing-arm mount + M240-style gun
gun_pivot = empty("GunPivot_Port", (3.30, 1.02, 1.62), parent=ROOTOB)
box("SH_GunArmBase", (0, 0.0, -0.25), (0.10, 0.10, 0.5), METAL, parent=gun_pivot)
arm = box("SH_GunArm", (0, 0.06, 0.12), (0.07, 0.5, 0.07), METAL,
          rot=(math.radians(-18), 0, 0), parent=gun_pivot)
gun = empty("DoorGun_Port", (0, 0.08, 0.30), parent=gun_pivot)
box("SH_GunReceiver", (0.05, 0, 0), (0.52, 0.13, 0.17), METAL, bevel=0.02, parent=gun)
cyl("SH_GunBarrel", (0.52, 0, 0.02), 0.028, 0.62, METAL, rot=(0, math.radians(90), 0), parent=gun)
cyl("SH_GunShroud", (0.38, 0, 0.02), 0.045, 0.30, DARK, rot=(0, math.radians(90), 0), parent=gun)
box("SH_GunGrip", (-0.22, 0, -0.06), (0.16, 0.05, 0.10), DARK, parent=gun)
box("SH_AmmoCan", (-0.05, -0.16, -0.05), (0.30, 0.12, 0.22), SEATP, bevel=0.01, parent=gun)
# ammo can + gunner seat in cabin at port door
box("SH_GunnerAmmoBox", (3.9, 0.75, 1.16), (0.4, 0.3, 0.3), METAL, bevel=0.02, parent=ROOTOB)
# stbd door: stowed mount post (gun ships port side per ref)
box("SH_GunPostStbd", (3.30, -1.05, 1.35), (0.09, 0.09, 0.55), METAL, parent=ROOTOB)

# ================================================================ DETAILS
# FLIR turret under nose
sphere("SH_FlirMount", (6.95, 0, 1.02), (0.26, 0.26, 0.20), AIRD, parent=ROOTOB)
sphere("SH_FlirBall", (6.95, 0, 0.88), (0.21, 0.21, 0.21), DARK, parent=ROOTOB)
cyl("SH_FlirLens", (7.13, 0, 0.86), 0.075, 0.05, SCRN, rot=(0, math.radians(90), 0), parent=ROOTOB)
# rescue hoist (starboard, above door)
box("SH_HoistArm", (3.30, -1.32, 2.62), (0.55, 0.42, 0.16), AIR, bevel=0.03, parent=ROOTOB)
cyl("SH_HoistDrum", (3.30, -1.50, 2.58), 0.09, 0.14, METAL, rot=(math.radians(90), 0, 0), parent=ROOTOB)
cyl("SH_HoistCable", (3.30, -1.52, 2.28), 0.012, 0.5, DARK, parent=ROOTOB)
box("SH_HoistHook", (3.30, -1.52, 2.0), (0.05, 0.05, 0.09), METAL, parent=ROOTOB)
# pitot tube (nose, starboard) + AOA vane
cyl("SH_Pitot", (7.15, -0.72, 1.95), 0.018, 0.5, METAL, rot=(0, math.radians(90), 0), parent=ROOTOB)
# wire cutters above / below cockpit
box("SH_CutterTop", (6.45, 0, 3.06), (0.35, 0.04, 0.18), AIRD, rot=(0, math.radians(-24), 0), parent=ROOTOB)
box("SH_CutterLow", (6.70, 0, 1.06), (0.3, 0.04, 0.16), AIRD, rot=(0, math.radians(24), 0), parent=ROOTOB)
# door steps
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    box("SH_Step" + nm, (3.3, sgn * 1.28, 0.82), (0.5, 0.28, 0.05), AIRD, parent=ROOTOB)
    # orange rescue placards by doors (per ref accents)
    box("SH_Placard" + nm, (4.15, sgn * 1.175, 1.55), (0.20, 0.02, 0.10), ORNG, parent=ROOTOB)
# position lights: port red / stbd green on sponson tips, white tail
sphere("SH_PosLightPort", (3.32, 1.47, 1.0), (0.05, 0.05, 0.05), REDL, parent=ROOTOB)
sphere("SH_PosLightStbd", (3.32, -1.47, 1.0), (0.05, 0.05, 0.05), GRNL, parent=ROOTOB)
sphere("SH_PosLightTail", (-7.72, 0, 2.86), (0.045, 0.045, 0.045), WHITEL, parent=ROOTOB)
# tail bumper / skid under aft boom
box("SH_TailSkid", (-6.9, 0, 1.95), (0.5, 0.08, 0.22), AIRD, rot=(0, math.radians(20), 0), parent=ROOTOB)

# ================================================================ MARKINGS
def marking(text, loc, size, sgn, nm):
    """Decal text on a fuselage side. Basis built explicitly (right/up/normal)
    so the lettering reads correctly on BOTH sides — euler combos mirrored it."""
    from mathutils import Matrix, Vector as MV
    bpy.ops.object.text_add(location=(0, 0, 0))
    t = bpy.context.object; t.name = nm; t.data.body = text
    t.data.size = size; t.data.extrude = 0.006; t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    bpy.ops.object.convert(target='MESH')
    t = bpy.context.object
    n = MV((0, sgn, 0)); u = MV((0, 0, 1)); r = u.cross(n)
    m = Matrix.Identity(4)
    m.col[0][:3] = r; m.col[1][:3] = u; m.col[2][:3] = n
    m.translation = loc
    t.matrix_world = m
    t.data.materials.append(MARK); t.parent = ROOTOB
    return t
# "615" both sides of tail boom + "HSC-5" beneath (per Ian's image)
for sgn in (1, -1):
    marking("615", (-4.55, sgn * 0.60, 2.52), 0.78, sgn, "SH_Mark615_%d" % sgn)
    marking("HSC-5", (-4.55, sgn * 0.565, 2.06), 0.30, sgn, "SH_MarkHSC_%d" % sgn)
    # "US NAVY" on doghouse sides
    marking("US NAVY", (1.15, sgn * 0.815, 3.14), 0.30, sgn, "SH_MarkUSN_%d" % sgn)
    # "NAVY" small on fin
    marking("NAVY", (-7.05, sgn * 0.108, 3.85), 0.24, sgn, "SH_MarkFin_%d" % sgn)

# ================================================================ EXPORT
os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB',
                          use_selection=True, export_apply=True, export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print("SEAHAWK EXPORTED", GLB_OUT, "mesh objects:", sum(1 for o in bpy.data.objects if o.type == 'MESH'),
      "polys:", tris)
