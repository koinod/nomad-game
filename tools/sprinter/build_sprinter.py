#!/usr/bin/env python3
"""NOMAD Fleet — V-04 Sprinter Expedition live-in van (Blender 4.2).

Spec: design-refs/fleet-specs/v04-sprinter.md + v04-sprinter.png (Ian, 2026-10-21).
Body = Mercedes Sprinter 170" EXTENDED high-roof (chosen to match the reference
image's long rear section): L 6.97m, W 2.02m (2.43 over mirrors), H 2.90m roof
(+ rack ~3.05m), WB 4.32m. 3,400 kg expedition 4x4, diesel.

Axes (house convention, same as tools/build_mustang.py / seahawk):
  X = length (nose +X), Y = width (port/left +Y), Z = up.  Meters.
Ground plane = z 0 (tire bottoms).

Node contract (spec scene structure): Chassis, FrontBumper, SlidingSideDoor,
FoldingSideStep, RearDoor_L/R, SpareTireCarrier, RoofRackSystem (SolarPanels,
RoofCases, SideLadder, DeployableAwningCassette), Wheel_FL/FR/RL/RR,
InteriorLivingSpace (PlatformBed, StorageCabinets, GalleyCounter), markers.

Exports public/models/sprinter.glb and saves tools/sprinter/sprinter.blend.
Run: blender -b --python tools/sprinter/build_sprinter.py
"""
import bpy, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
GLB_OUT = os.path.join(WT, "public", "models", "sprinter.glb")
BLEND_OUT = os.path.join(ROOT, "sprinter.blend")
os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)

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

SLATE  = mat("slate_body",   (0.095, 0.110, 0.120), 0.46, 0.28)  # dark slate cab/roof
OLIVE  = mat("olive_body",   (0.295, 0.310, 0.228), 0.60, 0.14)  # sage olive panels
BAND   = mat("band_dark",    (0.052, 0.057, 0.055), 0.68, 0.10)  # side band stripe
ACCENT = mat("accent_teal",  (0.055, 0.150, 0.135), 0.55, 0.15)  # thin pinstripe
GLASS  = mat("glass_tint",   (0.048, 0.072, 0.088), 0.08, 0.25, alpha=0.70)
BLACK  = mat("trim_black",   (0.040, 0.042, 0.045), 0.85, 0.05)
TIREM  = mat("tire",         (0.026, 0.026, 0.028), 0.96, 0.0)
RIM    = mat("rim_olive",    (0.150, 0.158, 0.118), 0.48, 0.35)  # beadlock wheel olive
GUNM   = mat("gunmetal",     (0.100, 0.105, 0.110), 0.42, 0.75)
STEEL  = mat("steel_plate",  (0.300, 0.305, 0.310), 0.55, 0.65)  # diamond plate / step
SOLAR  = mat("solar_cell",   (0.028, 0.055, 0.115), 0.24, 0.45)  # deep blue cells
CASEM  = mat("case_olive",   (0.225, 0.235, 0.172), 0.66, 0.10)  # roof cases
COWL   = mat("cowl_gray",    (0.185, 0.190, 0.195), 0.60, 0.20)  # AC cowl
INTW   = mat("interior_wall",(0.355, 0.335, 0.295), 0.92, 0.0)   # warm liner
INTF   = mat("interior_floor",(0.205, 0.170, 0.130), 0.85, 0.0)  # wood-tone floor
CUSH   = mat("cushion",      (0.270, 0.265, 0.215), 0.98, 0.0)   # bed cushion
CABNT  = mat("cabinet",      (0.400, 0.380, 0.335), 0.80, 0.0)   # light warm cabinetry
CNTR   = mat("counter",      (0.085, 0.088, 0.090), 0.45, 0.20)  # galley countertop
SEATM  = mat("seat_fabric",  (0.085, 0.090, 0.095), 0.98, 0.0)   # cab seats
SCRN   = mat("screen",       (0.02, 0.05, 0.045), 0.25, 0.0, emissive=(0.05, 0.28, 0.20), ei=0.55)
HEADL  = mat("headlight",    (0.42, 0.45, 0.47), 0.18, 0.3, emissive=(0.9, 0.95, 1.0), ei=0.35)
TAILL  = mat("taillight",    (0.30, 0.02, 0.02), 0.35, 0.0, emissive=(1.0, 0.04, 0.04), ei=1.6)
AMBER  = mat("marker_amber", (0.35, 0.16, 0.02), 0.40, 0.0, emissive=(1.0, 0.45, 0.05), ei=1.2)
LEDM   = mat("led_warm",     (0.45, 0.38, 0.25), 0.5, 0.0, emissive=(1.0, 0.80, 0.52), ei=1.8)

# ---------------------------------------------------------------- helpers
def link(obj, parent=None):
    bpy.context.collection.objects.link(obj)
    if parent: obj.parent = parent
    return obj

def empty(name, loc, parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'PLAIN_AXES'
    ob.empty_display_size = 0.18
    ob.location = loc
    return link(ob, parent)

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

def prism(name, profile, half_w, material=None, parent=None):
    """Extrude an XZ side profile (list of (x,z), CCW from below-front) across Y."""
    n = len(profile)
    verts = []
    for (x, z) in profile: verts.append((x, -half_w, z))
    for (x, z) in profile: verts.append((x, +half_w, z))
    faces = []
    faces.append(tuple(range(n - 1, -1, -1)))                    # -Y cap
    faces.append(tuple(range(n, 2 * n)))                          # +Y cap
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))                        # perimeter quads
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    # orient: +Y cap must face +Y
    for f in me.polygons:
        if len(f.vertices) > 4 and f.center.y > 0 and f.normal.y < 0:
            me.flip_normals(); break
    ob = bpy.data.objects.new(name, me)
    if material: me.materials.append(material)
    return link(ob, parent)

def bool_cut(target, cutter):
    bpy.context.view_layer.objects.active = target
    mod = target.modifiers.new("cut", 'BOOLEAN')
    mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cutter, do_unlink=True)

def arc_band(name, center, r_in, r_out, width, material=None, parent=None, steps=14):
    """Rectangular cross-section arc in the XZ plane, spanning the top (10..170 deg)."""
    cx, cy, cz = center
    hw = width / 2
    verts, faces = [], []
    angs = [math.radians(10 + (160.0 * i) / steps) for i in range(steps + 1)]
    for a in angs:
        ca, sa = math.cos(a), math.sin(a)
        for (r, y) in ((r_in, -hw), (r_in, hw), (r_out, hw), (r_out, -hw)):
            verts.append((cx + r * ca, cy + y, cz + r * sa))
    for i in range(steps):
        b, nb = i * 4, (i + 1) * 4
        for k in range(4):
            k2 = (k + 1) % 4
            faces.append((b + k, nb + k, nb + k2, b + k2))
    faces.append((3, 2, 1, 0))
    e = steps * 4
    faces.append((e, e + 1, e + 2, e + 3))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    if material: me.materials.append(material)
    return link(ob, parent)

ROOTV = empty("SprinterExpeditionVan", (0, 0, 0))

# ---------------------------------------------------------------- dimensions
NOSE, TAIL = 3.48, -3.48
HALF_W = 0.99
ROOF_Z = 2.68
FLOOR_Z = 0.47
FAX, RAX = 2.32, -2.00          # front / rear axle x (WB 4.32)
WHEEL_R, WHEEL_W = 0.42, 0.30
TRACK_Y = 0.86                  # wheel center |y|

# ================================================================ CHASSIS (body shell)
profile = [
    (3.48, 0.47), (3.50, 1.12), (2.80, 1.34), (2.58, 1.40),   # nose + hood + cowl
    (2.02, 2.48), (1.90, 2.68),                                # windshield -> roof
    (-3.36, 2.68), (-3.48, 2.52),                              # roof -> tail corner
    (-3.48, 0.47),                                             # tail face -> bottom
]
chassis = prism("Chassis", profile, HALF_W, SLATE, parent=ROOTV)

# wheel-arch cuts (4x) + sliding-door aperture (port +Y)
for ax in (FAX, RAX):
    for sy in (1, -1):
        c = cyl("archcut", (ax, sy * HALF_W, WHEEL_R), 0.56, 0.30,
                rot=(math.radians(90), 0, 0))
        bool_cut(chassis, c)
door_cut = box("doorcut", (0.30, HALF_W, 1.38), (1.30, 0.30, 1.62))
bool_cut(chassis, door_cut)
# dark inner arch tubs
for ax in (FAX, RAX):
    for sy in (1, -1):
        arc_band("ArchTub", (ax, sy * (HALF_W - 0.06), WHEEL_R), 0.50, 0.565, 0.10, BLACK, ROOTV)
        # fender flare: rectangular-section arc band over the top of the arch
        fl = arc_band("FenderFlare", (ax, sy * (HALF_W + 0.01), WHEEL_R), 0.525, 0.605, 0.09, BLACK, ROOTV)
# underbody chassis + tanks
box("Underbody", (0.1, 0, 0.33), (5.9, 1.55, 0.26), BLACK, parent=ROOTV)
cyl("FuelTank", (0.9, -0.55, 0.30), 0.24, 1.5, GUNM, rot=(0, math.radians(90), 0), parent=ROOTV)
box("SkidPlate", (2.2, 0, 0.16), (1.3, 1.2, 0.06), STEEL, parent=ROOTV)

# ---- two-tone cladding: olive cargo sides + cab doors, band stripe, rocker
# The PORT (+Y) plates are split around the sliding-door aperture (x -0.35..0.95)
# so the doorway is a real opening; the door leaf carries its own band segment.
AP_X0, AP_X1 = -0.35, 0.95
def side_plate(name, sy, z, h, thick_y, material, x0=-3.44, x1=1.54):
    spans = [(x0, x1)]
    if sy > 0:
        spans = [(x0, AP_X0), (AP_X1, x1)]
    for (a, b) in spans:
        if b - a < 0.05: continue
        box(name, ((a + b) / 2, sy * thick_y, z), (b - a, 0.012, h), material, parent=ROOTV)

for sy in (1, -1):
    y = sy * (HALF_W + 0.006)
    side_plate("OliveSide", sy, 1.42, 1.72, HALF_W + 0.006, OLIVE)
    box("OliveCabDoor", (2.02, y, 0.99), (0.94, 0.012, 0.98), OLIVE, parent=ROOTV)   # cab door lower
    # band + pinstripe run the CARGO body only — past the cab they'd float beside the hood slope
    side_plate("BandStripe", sy, 2.11, 0.26, HALF_W + 0.012, BAND, x1=1.55)
    side_plate("AccentPin", sy, 1.955, 0.028, HALF_W + 0.013, ACCENT, x1=1.55)
    side_plate("RockerBand", sy, 0.545, 0.15, HALF_W + 0.008, BAND, x0=-3.48, x1=3.12)
# tail band + olive tail panel between the barn doors frame
box("BandTail", (TAIL - 0.006, 0, 2.11), (0.012, 1.96, 0.26), BAND, parent=ROOTV)
# roof edge gutter trim
for sy in (1, -1):
    box("RoofTrim", (-0.72, sy * (HALF_W + 0.004), 2.665), (5.30, 0.012, 0.05), BLACK, parent=ROOTV)

# ---- glass: windshield (raked), cab side windows, rear quarter windows
ws_ang = math.atan2(2.48 - 1.40, 2.58 - 2.02)  # windshield slope from vertical
box("Windshield", (2.315, 0, 1.955), (0.02, 1.72, 1.18), GLASS,
    rot=(0, -math.atan2(0.56, 1.08), 0), parent=ROOTV)
for sy in (1, -1):
    y = sy * (HALF_W + 0.010)
    box("CabWindow", (1.86, y, 1.94), (0.58, 0.012, 0.52), GLASS, parent=ROOTV)
    box("RearQuarterWindow", (-2.95, y, 2.24), (0.72, 0.012, 0.40), GLASS, parent=ROOTV)
    box("MirrorArm", (2.52, sy * (HALF_W + 0.10), 2.02), (0.05, 0.20, 0.05), BLACK, parent=ROOTV)
    box("Mirror", (2.52, sy * (HALF_W + 0.22), 1.98), (0.06, 0.10, 0.30), BLACK, parent=ROOTV)

# ---- front face: grille, badge blank, headlights, amber markers
box("Grille", (3.505, 0, 1.02), (0.05, 1.30, 0.34), BLACK, parent=ROOTV)
for i in range(3):
    box("GrilleSlat", (3.535, 0, 0.94 + i * 0.09), (0.02, 1.22, 0.035), GUNM, parent=ROOTV)
cyl("BadgeBlank", (3.545, 0, 1.04), 0.085, 0.03, GUNM, rot=(0, math.radians(90), 0), parent=ROOTV)
for sy in (1, -1):
    box("Headlight", (3.47, sy * 0.70, 1.20), (0.10, 0.42, 0.13), HEADL, parent=ROOTV)
    for k in range(3):
        box("GrilleAmber", (3.538, sy * (0.28 + k * 0.13), 1.06), (0.015, 0.07, 0.05), AMBER, parent=ROOTV)

# ================================================================ FRONT BUMPER (winch push bar)
FB = empty("FrontBumper", (3.52, 0, 0.62), parent=ROOTV)
box("BumperBar", (0.10, 0, 0.02), (0.22, 1.86, 0.30), BLACK, bevel=0.03, parent=FB)
box("WinchBox", (0.16, 0, 0.06), (0.24, 0.52, 0.22), GUNM, parent=FB)
box("WinchFairlead", (0.29, 0, 0.06), (0.03, 0.30, 0.09), STEEL, parent=FB)
for sy in (1, -1):
    # bull-bar hoop: two uprights + top bar
    cyl("BullUpright", (0.20, sy * 0.62, 0.28), 0.035, 0.55, BLACK, parent=FB)
    cyl("BullSide", (0.20, sy * 0.62, 0.02), 0.035, 0.30, BLACK, rot=(math.radians(90), 0, 0), parent=FB)
    cyl("FogPod", (0.24, sy * 0.80, 0.10), 0.055, 0.08, HEADL, rot=(0, math.radians(90), 0), parent=FB)
    # tow shackle (local to FrontBumper)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.055, minor_radius=0.016,
        major_segments=14, minor_segments=6, location=(0.28, sy * 0.38, -0.07),
        rotation=(0, 0, 0))
    sh = bpy.context.object; sh.name = "TowShackle"; sh.data.materials.append(STEEL); sh.parent = FB
cyl("BullTop", (0.20, 0, 0.55), 0.035, 1.28, BLACK, rot=(math.radians(90), 0, 0), parent=FB)

# rear bumper + hitch
box("RearBumper", (TAIL - 0.09, 0, 0.52), (0.18, 1.90, 0.22), BLACK, parent=ROOTV)
empty("trailer_hitch_bumper_receiver", (TAIL - 0.22, 0, 0.52), parent=ROOTV)
box("HitchReceiver", (TAIL - 0.20, 0, 0.52), (0.10, 0.14, 0.14), GUNM, parent=ROOTV)

# ================================================================ SLIDING DOOR + STEP (port +Y)
SD = empty("SlidingSideDoor", (0.30, HALF_W + 0.02, 1.38), parent=ROOTV)
box("DoorPanel", (0, 0, 0), (1.26, 0.045, 1.58), OLIVE, bevel=0.02, parent=SD)
box("DoorBand", (0, 0.012, 0.73), (1.26, 0.05, 0.26), BAND, parent=SD)
box("DoorWindow", (0.05, 0.014, 0.42), (0.92, 0.05, 0.52), GLASS, parent=SD)
box("DoorHandle", (0.52, 0.045, 0.08), (0.16, 0.03, 0.045), BLACK, parent=SD)
box("DoorRail", (0.05, HALF_W - 0.01, 2.31), (2.10, 0.03, 0.05), BLACK, parent=ROOTV)  # slide rail above the aperture
SS = empty("FoldingSideStep", (0.30, HALF_W + 0.16, 0.40), parent=ROOTV)
box("SideStep", (0, 0, 0), (1.15, 0.34, 0.05), STEEL, parent=SS)
box("CabStep", (2.08, HALF_W + 0.10, 0.38), (0.70, 0.22, 0.05), STEEL, parent=ROOTV)
box("CabStepStbd", (2.08, -(HALF_W + 0.10), 0.38), (0.70, 0.22, 0.05), STEEL, parent=ROOTV)
# utility hatch + shore power port (port rear lower, per reference)
box("UtilityHatch", (-1.55, HALF_W + 0.012, 0.95), (0.42, 0.012, 0.42), OLIVE, parent=ROOTV)
box("UtilitySeam", (-1.55, HALF_W + 0.016, 0.95), (0.36, 0.012, 0.36), BAND, parent=ROOTV)
box("ShorePort", (-2.55, HALF_W + 0.014, 0.78), (0.14, 0.012, 0.14), STEEL, parent=ROOTV)

# ================================================================ REAR BARN DOORS + SPARE
for sy, nm in ((1, "RearDoor_L"), (-1, "RearDoor_R")):
    hinge = empty(nm, (TAIL - 0.02, sy * HALF_W, 1.50), parent=ROOTV)
    box("DoorLeaf", (0, -sy * 0.475, 0), (0.045, 0.93, 1.98), OLIVE, bevel=0.015, parent=hinge)
    box("DoorLeafBand", (-0.016, -sy * 0.475, 0.61), (0.05, 0.93, 0.26), BAND, parent=hinge)
    box("DoorLeafWindow", (-0.016, -sy * 0.475, 0.55), (0.05, 0.62, 0.44), GLASS, parent=hinge)
    box("DoorLeafHandle", (-0.045, -sy * 0.10, 0.02), (0.03, 0.05, 0.20), BLACK, parent=hinge)
    box("TailLight", (TAIL - 0.035, sy * (HALF_W - 0.055), 1.30), (0.03, 0.07, 0.62), TAILL, parent=ROOTV)
# spare tire carrier on RearDoor_R (starboard), per reference peek
# (local coords relative to the hinge empty: hinge sits at the tail/starboard corner)
SC = empty("SpareTireCarrier", (-0.12, 0.51, 0.02), parent=bpy.data.objects["RearDoor_R"])
box("CarrierArm", (0, 0, -0.55), (0.07, 0.07, 0.55), GUNM, parent=SC)

# ================================================================ WHEELS
def build_wheel(name, loc):
    piv = empty(name, loc, parent=ROOTV)
    # tread: flat-shaded lug cylinder
    bpy.ops.mesh.primitive_cylinder_add(vertices=26, radius=WHEEL_R, depth=WHEEL_W,
                                        location=(0, 0, 0), rotation=(math.radians(90), 0, 0))
    tire = bpy.context.object; tire.name = name + "_Tire"; tire.data.materials.append(TIREM)
    tire.parent = piv
    # sidewall rings (torus axis must align with the wheel axle = local Y)
    for sy in (1, -1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.335, minor_radius=0.095,
            major_segments=22, minor_segments=10, location=(0, sy * (WHEEL_W / 2 - 0.055), 0),
            rotation=(math.radians(90), 0, 0))
        sw = bpy.context.object; sw.name = name + "_Sidewall"; sw.data.materials.append(TIREM)
        sw.parent = piv
    # rim + beadlock ring + bolts + hub
    cyl("Rim", (0, 0, 0), 0.235, WHEEL_W + 0.012, RIM, rot=(math.radians(90), 0, 0), verts=18, parent=piv)
    for sy in (1, -1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.205, minor_radius=0.022,
            major_segments=18, minor_segments=6, location=(0, sy * (WHEEL_W / 2 + 0.008), 0),
            rotation=(math.radians(90), 0, 0))
        ring = bpy.context.object; ring.name = name + "_Beadlock"; ring.data.materials.append(GUNM)
        ring.parent = piv
        for k in range(8):
            a = 2 * math.pi * k / 8
            cyl("BeadBolt", (0.205 * math.cos(a), sy * (WHEEL_W / 2 + 0.012), 0.205 * math.sin(a)),
                0.014, 0.025, STEEL, rot=(math.radians(90), 0, 0), verts=6, parent=piv)
    cyl("Hub", (0, 0, 0), 0.085, WHEEL_W + 0.05, GUNM, rot=(math.radians(90), 0, 0), verts=12, parent=piv)
    return piv

build_wheel("Wheel_FL", (FAX, TRACK_Y, WHEEL_R))
build_wheel("Wheel_FR", (FAX, -TRACK_Y, WHEEL_R))
build_wheel("Wheel_RL", (RAX, TRACK_Y, WHEEL_R))
build_wheel("Wheel_RR", (RAX, -TRACK_Y, WHEEL_R))
# spare = clone of the wheel build on the carrier
sp = build_wheel("SpareWheel", (0, 0, 0))
sp.parent = SC
sp.rotation_euler = (0, 0, math.radians(90))  # axle Y -> X: disc parallel to the rear door
for sy in (1, -1):
    box("Mudflap", (RAX - 0.55, sy * TRACK_Y, 0.28), (0.05, 0.34, 0.42), BLACK, parent=ROOTV)

print("PART 1 DONE")

# ================================================================ ROOF RACK SYSTEM
RR = empty("RoofRackSystem", (0, 0, ROOF_Z), parent=ROOTV)
# rack floor slats
for i in range(9):
    box("RackSlat", (1.55 - i * 0.60, 0, 0.075), (0.28, 1.70, 0.03), GUNM, parent=RR)
# perimeter rails
for sy in (1, -1):
    cyl("RackRailSide", (-0.85, sy * 0.86, 0.20), 0.028, 4.95, BLACK, rot=(0, math.radians(90), 0), parent=RR)
    for px in (1.58, -0.85, -3.28):
        cyl("RackPost", (px, sy * 0.86, 0.10), 0.024, 0.20, BLACK, parent=RR)
for px in (1.60, -3.30):
    cyl("RackRailEnd", (px, 0, 0.20), 0.028, 1.74, BLACK, rot=(math.radians(90), 0, 0), parent=RR)
# --- solar panels (front roof section, slight tilt like the reference)
SP = empty("SolarPanels", (0.95, -0.18, ROOF_Z + 0.13), parent=ROOTV)
panel = box("SolarPanel", (0, 0, 0), (1.55, 1.30, 0.045), SOLAR, rot=(0, math.radians(-4), 0), parent=SP)
box("SolarFrame", (0, 0, -0.035), (1.62, 1.37, 0.03), STEEL, rot=(0, math.radians(-4), 0), parent=SP)
for i in range(4):  # cell grid lines
    box("SolarGrid", (-0.58 + i * 0.385, 0, 0.026), (0.018, 1.26, 0.006), STEEL,
        rot=(0, math.radians(-4), 0), parent=SP)
for i in range(2):
    box("SolarGrid", (0, -0.33 + i * 0.66, 0.026), (1.50, 0.018, 0.006), STEEL,
        rot=(0, math.radians(-4), 0), parent=SP)
# --- roof cases (olive cargo boxes, rear + mid)
RC = empty("RoofCases", (0, 0, ROOF_Z), parent=ROOTV)
def roof_case(name, loc, size, parent):
    box(name, loc, size, CASEM, bevel=0.02, parent=parent)
    box(name + "Lid", (loc[0], loc[1], loc[2] + size[2] / 2 + 0.012), (size[0] * 0.98, size[1] * 0.98, 0.035), OLIVE, parent=parent)
    for sx in (-1, 1):
        box(name + "Latch", (loc[0] + sx * size[0] * 0.30, loc[1], loc[2] + size[2] * 0.28),
            (0.05, size[1] + 0.015, 0.07), GUNM, parent=parent)
roof_case("CaseBig1", (-2.55, 0.38, 0.24), (1.05, 0.78, 0.34), RC)
roof_case("CaseBig2", (-2.55, -0.48, 0.24), (1.05, 0.70, 0.34), RC)
roof_case("CaseMid", (-1.55, -0.45, 0.21), (0.80, 0.66, 0.28), RC)
roof_case("CaseFlat", (-1.50, 0.45, 0.175), (0.85, 0.60, 0.20), RC)
# --- AC cowl (mid roof) + small vent
box("ACCowl", (-0.35, 0.30, 0.16), (0.95, 0.72, 0.24), COWL, bevel=0.04, parent=RR)
for i in range(4):
    box("ACVent", (-0.35, 0.30, 0.245 + i * 0.008), (0.80, 0.58, 0.008), BLACK, parent=RR)
box("RoofVent", (0.05, -0.55, 0.10), (0.45, 0.45, 0.10), COWL, bevel=0.03, parent=RR)
# --- side ladder (port rear quarter, up to the rack)
LD = empty("SideLadder", (-3.02, HALF_W + 0.05, 0), parent=ROOTV)
for sy in (1, -1):
    cyl("LadderRail", (0, sy * 0.19, 1.80), 0.022, 2.05, BLACK, parent=LD)
for i in range(6):
    cyl("LadderRung", (0, 0, 0.95 + i * 0.34), 0.016, 0.38, BLACK, rot=(math.radians(90), 0, 0), parent=LD)
for zz in (1.05, 2.65):
    box("LadderMount", (0, -0.045, zz), (0.05, 0.10, 0.08), GUNM, parent=LD)
# --- awning cassette (port roof edge, stowed)
AW = empty("DeployableAwningCassette", (-0.10, HALF_W + 0.045, 2.42), parent=ROOTV)
box("AwningCase", (0, 0, 0), (3.10, 0.09, 0.13), BLACK, bevel=0.03, parent=AW)

# ================================================================ INTERIOR — CAB
box("CabFloor", (2.05, 0, 0.60), (1.30, 1.80, 0.06), INTF, parent=ROOTV)
box("Dash", (2.52, 0, 1.42), (0.30, 1.70, 0.34), BLACK, parent=ROOTV)
box("DashScreen", (2.40, 0.10, 1.52), (0.03, 0.34, 0.20), SCRN, rot=(0, math.radians(-18), 0), parent=ROOTV)
bpy.ops.mesh.primitive_torus_add(major_radius=0.19, minor_radius=0.022, major_segments=18,
    minor_segments=8, location=(2.32, 0.48, 1.42), rotation=(0, math.radians(72), 0))
stw = bpy.context.object; stw.name = "SteeringWheel"; stw.data.materials.append(BLACK); stw.parent = ROOTV
box("Console", (2.02, 0, 0.86), (0.60, 0.34, 0.30), BLACK, parent=ROOTV)
def captain_seat(name, y):
    g = empty(name, (1.98, y, 0.63), parent=ROOTV)
    box("SeatBase", (0, 0, 0.28), (0.55, 0.52, 0.14), SEATM, parent=g)
    box("SeatBack", (-0.26, 0, 0.72), (0.13, 0.52, 0.78), SEATM, rot=(0, math.radians(-8), 0), parent=g)
    box("Headrest", (-0.30, 0, 1.22), (0.11, 0.26, 0.20), SEATM, parent=g)
    box("SeatPedestal", (0, 0, 0.08), (0.34, 0.34, 0.16), GUNM, parent=g)
    return g
captain_seat("DriverSeatMesh", 0.48)
captain_seat("PassengerSeatMesh", -0.48)

# ================================================================ INTERIOR — LIVING SPACE
IL = empty("InteriorLivingSpace", (0, 0, 0), parent=ROOTV)
# liner: floor, ceiling, starboard wall, rear wall, front bulkhead (behind cab)
box("LivFloor", (-0.95, 0, 0.585), (4.85, 1.86, 0.05), INTF, parent=IL)
box("LivCeiling", (-0.95, 0, 2.52), (4.85, 1.86, 0.05), INTW, parent=IL)
box("LivWallStbd", (-0.95, -0.925, 1.55), (4.85, 0.05, 1.90), INTW, parent=IL)
box("LivWallRear", (-3.36, 0, 1.55), (0.05, 1.86, 1.90), INTW, parent=IL)
box("LivBulkhead", (1.47, 0, 1.55), (0.05, 1.86, 1.90), INTW, parent=IL)
box("LivWallPortRear", (-2.55, 0.925, 1.55), (1.65, 0.05, 1.90), INTW, parent=IL)
box("LivWallPortFront", (1.21, 0.925, 1.55), (0.52, 0.05, 1.90), INTW, parent=IL)
box("LEDStrip", (-0.95, 0, 2.485), (3.60, 0.10, 0.015), LEDM, parent=IL)
# --- platform bed (rear, full width) + under-bed garage crates
PB = empty("PlatformBed", (-2.62, 0, 0), parent=IL)
box("BedFrame", (0, 0, 0.90), (1.50, 1.80, 0.55), CABNT, parent=PB)
box("BedMattress", (0, 0, 1.24), (1.46, 1.76, 0.16), CUSH, bevel=0.04, parent=PB)
box("BedPillow", (-0.55, 0.35, 1.36), (0.42, 0.62, 0.12), INTW, bevel=0.04, parent=PB)
box("BedBlanket", (0.28, 0, 1.30), (0.85, 1.72, 0.07), OLIVE, bevel=0.03, parent=PB)
for sx in (-0.4, 0.35):
    box("UnderBedCrate", (sx, 0.45, 0.90), (0.62, 0.70, 0.44), CASEM, parent=PB)
# --- storage cabinets (starboard wall, mid) + tall wardrobe
CB = empty("StorageCabinets", (0, 0, 0), parent=IL)
box("CabinetRun", (-0.55, -0.70, 1.30), (1.90, 0.42, 1.45), CABNT, parent=CB)
for i in range(3):
    box("CabinetDoorLine", (-1.18 + i * 0.63, -0.483, 1.30), (0.03, 0.012, 1.30), INTF, parent=CB)
    box("CabinetKnob", (-1.02 + i * 0.63, -0.475, 1.62), (0.035, 0.03, 0.035), GUNM, parent=CB)
box("Wardrobe", (-1.72, -0.68, 1.55), (0.55, 0.46, 1.95), CABNT, parent=CB)
box("OverheadLocker", (0.55, -0.72, 2.18), (1.55, 0.38, 0.55), CABNT, parent=CB)
# --- galley counter (port wall, rear of the sliding door) + workstation seat
GC = empty("GalleyCounter", (0, 0, 0), parent=IL)
box("GalleyBase", (-1.05, 0.68, 0.92), (1.30, 0.48, 0.62), CABNT, parent=GC)
box("GalleyTop", (-1.05, 0.68, 1.26), (1.36, 0.54, 0.05), CNTR, parent=GC)
box("GalleySink", (-1.32, 0.68, 1.275), (0.46, 0.34, 0.03), GUNM, parent=GC)
cyl("Faucet", (-1.50, 0.86, 1.36), 0.018, 0.18, STEEL, parent=GC)
for dx in (0.18, 0.48):
    cyl("StoveRing", (-1.05 + dx - 0.35, 0.68, 1.29), 0.085 if dx < 0.3 else 0.065, 0.012, BLACK, verts=16, parent=GC)
box("FoldSeat", (-0.30, -0.62, 0.95), (0.42, 0.40, 0.08), SEATM, parent=IL)
box("FoldSeatBack", (-0.30, -0.845, 1.25), (0.42, 0.05, 0.55), SEATM, parent=IL)
box("Worktop", (-0.30, -0.60, 1.24), (0.55, 0.45, 0.04), CNTR, parent=IL)

# ================================================================ MARKERS
empty("driver_seat", (1.98, 0.48, 1.05), parent=ROOTV)
empty("passenger_seat", (1.98, -0.48, 1.05), parent=ROOTV)
empty("sleep_interaction_point", (-2.62, 0, 1.35), parent=ROOTV)
empty("interior_workbench_station", (-0.30, -0.60, 1.05), parent=ROOTV)
empty("rear_cargo_access_point", (TAIL - 0.45, 0, 1.00), parent=ROOTV)

# ---------------------------------------------------------------- export + save
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format="GLB", export_apply=True)
print("EXPORTED", GLB_OUT, os.path.getsize(GLB_OUT), "bytes")
print("SPRINTER BUILD DONE")
