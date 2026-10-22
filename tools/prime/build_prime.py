#!/usr/bin/env python3
"""NOMAD PRIME — clean-sheet protocol build #2 (PRD v3.0).

Axes (house): X = length (nose +X), Y = width (left +Y), Z = up. Metres.
Origin at ground under vehicle centre. Landmarks: design-refs/proof-prime/
LANDMARKS.md (PRD governs; Phase A factory data reconciled there).

Run: blender -b --python tools/prime/build_prime.py [-- --stage N]
Stages: 1 running gear · 2 body shell · 3 detail · 4 interior+export.
Each stage loads/saves tools/prime/prime.blend (stage 1 starts fresh).
"""
import bpy, math, os, sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
BLEND_OUT = os.path.join(ROOT, "prime.blend")
GLB_OUT = os.path.join(WT, "design-refs", "proof-prime", "nomad-prime.glb")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
STAGE = int(argv[argv.index("--stage") + 1]) if "--stage" in argv else 4

# ---------------------------------------------------------------- landmarks
RAM_X = 4.425; GRILLE_X = 4.280; STEER_X = 3.800; COWL_X = 1.885
CAB_BACK_X = 0.855; SLEEPER_BACK_X = -0.875
AXLE1_X = -1.860; AXLE2_X = -3.180; BOGIE_X = -2.520; KINGPIN_X = -2.350
TIRE_R = 0.538; TIRE_W = 0.315; RIM_R = 0.286
STEER_LAT = 1.100; DUAL_OUT_LAT = 1.100; DUAL_IN_LAT = 0.765
STACK_X = 0.200; STACK_LAT = 1.260; STACK_TOP = 4.120
TANK_X = -0.200; TANK_LAT = 0.940; TANK_Z = 0.620; TANK_R = 0.330; TANK_L = 1.850
RAIL_TOP = 1.020
KINGPIN = (-2.350, 0.0, 1.280)

# ---------------------------------------------------------------- materials
def srgb(rgb):
    out = []
    for c in rgb:
        out.append(((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92)
    return tuple(out)

def hexcol(h):
    h = h.lstrip('#')
    return srgb(tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)))

MAT_SPECS = {}

def principled(name, color, metallic=0.0, roughness=0.5, alpha=1.0,
               coat=0.0, coat_rough=0.1, emissive=None, ei=0.0):
    MAT_SPECS[name] = dict(color=color, metallic=metallic, roughness=roughness,
                           alpha=alpha, coat=coat, coat_rough=coat_rough,
                           emissive=emissive, ei=ei)
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, alpha)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if emissive:
        bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
        bsdf.inputs["Emission Strength"].default_value = ei
    if alpha < 1.0:
        m.surface_render_method = 'DITHERED'
    return m

PAINT   = principled("paint_cobalt",  hexcol("#1B2A38"), 0.15, 0.34, coat=0.85, coat_rough=0.22)
PAINT2  = principled("paint_slate",   hexcol("#171C1F"), 0.15, 0.38, coat=0.85, coat_rough=0.22)
CRIMSON = principled("crimson",       hexcol("#8B1E1E"), 0.20, 0.35, coat=0.6, coat_rough=0.2)
CHASSIS = principled("chassis_carc",  hexcol("#121517"), 0.30, 0.58)
CHROME  = principled("chrome",        (0.83, 0.86, 0.90), 1.0, 0.08)
ALU     = principled("polished_alu",  (0.52, 0.55, 0.58), 0.95, 0.24)
STEEL   = principled("wheel_steel",   (0.30, 0.31, 0.33), 0.85, 0.38)
STEELD  = principled("steel_dark",    (0.11, 0.115, 0.12), 0.80, 0.50)
DIAMOND = principled("diamond_plate", (0.42, 0.44, 0.46), 0.90, 0.42)
GLASS   = principled("glass_tint",    (0.070, 0.100, 0.130), 0.25, 0.05, alpha=0.55)
TIREM   = principled("tire",          (0.105, 0.105, 0.110), 0.0, 0.87)   # dark GREY, never black
RUBBER  = principled("rubber",        (0.06, 0.06, 0.065), 0.0, 0.92)
DARKM   = principled("recess",        hexcol("#0D0F11"), 0.10, 0.80)
INTM    = principled("interior_abs",  hexcol("#232629"), 0.0, 0.90)
INTD    = principled("interior_dark", hexcol("#141618"), 0.0, 0.92)
SEATF   = principled("seat_leather",  hexcol("#2E3440"), 0.0, 0.85)
BUNKF   = principled("bunk_fabric",   hexcol("#3A4149"), 0.0, 0.98)
PILLOW  = principled("bunk_pillow",   hexcol("#8A867C"), 0.0, 0.95)
TITAN   = principled("satin_titanium",(0.45, 0.46, 0.48), 0.90, 0.35)
AMBER   = principled("light_amber",   (0.30, 0.12, 0.01), 0.0, 0.35, emissive=(1.0, 0.45, 0.05), ei=2.2)
REDL    = principled("light_red",     (0.28, 0.02, 0.02), 0.0, 0.35, emissive=(1.0, 0.04, 0.04), ei=2.0)
LENS    = principled("lens_white",    (0.55, 0.58, 0.60), 0.10, 0.18, emissive=(0.95, 0.98, 1.0), ei=1.1)
SCREEN  = principled("screen",        (0.02, 0.05, 0.045), 0.0, 0.25, emissive=(0.05, 0.30, 0.22), ei=0.7)
GAUGE   = principled("gauge",         (0.03, 0.06, 0.05), 0.0, 0.25, emissive=(0.35, 0.75, 0.55), ei=0.9)
REDH    = principled("hose_red",      hexcol("#5E1616"), 0.05, 0.70)
BLUEH   = principled("hose_blue",     hexcol("#16365E"), 0.05, 0.70)
LETTER  = principled("lettering",     (0.62, 0.64, 0.66), 0.10, 0.50)

# ---------------------------------------------------------------- helpers
def link(obj, parent=None):
    bpy.context.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj

def box(name, loc, size, material, rot=(0, 0, 0), bevel=0.0, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        ob.data.materials.append(material)
    if bevel > 0:
        mod = ob.modifiers.new("bev", 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    if parent is not None:
        ob.parent = parent
    return ob

def cyl(name, loc, radius, depth, material, rot=(0, 0, 0), vertices=28, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    if material:
        ob.data.materials.append(material)
    if parent is not None:
        ob.parent = parent
    return ob

def empty(name, loc, parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    link(ob, parent)
    return ob

def mesh_from_verts_faces(name, verts, faces, material, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    if material:
        me.materials.append(material)
    link(ob, parent)
    return ob

def smooth(ob, angle=0.66):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob

def subsurf(ob, levels=2):
    mod = ob.modifiers.new("subd", 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    return ob

def join_objects(name, objects, material=None):
    """Join meshes into one object (keeps first object's transform = identity)."""
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    if material:
        ob.data.materials.clear()
        ob.data.materials.append(material)
    return ob

# ------------------------------------------------------- section loft engine
def _catmull(p0, p1, p2, p3, t):
    t2 = t * t; t3 = t2 * t
    return tuple(0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t +
                 (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
                 (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3) for i in range(2))

def half_profile(keys, subs=(3, 4, 4, 3, 3, 3)):
    """keys: [(y,z)...] bottom-centre -> roof-centre, left half. Returns
    sampled [(y,z)...] with a FIXED point count for any key set of len 7."""
    pts = []
    n = len(keys)
    for i in range(n - 1):
        p0 = keys[max(i - 1, 0)]; p1 = keys[i]; p2 = keys[i + 1]; p3 = keys[min(i + 2, n - 1)]
        s = subs[i] if i < len(subs) else 3
        for j in range(s):
            pts.append(_catmull(p0, p1, p2, p3, j / s))
    pts.append(keys[-1])
    return pts

def ring_from_keys(keys, subs=(3, 4, 4, 3, 3, 3)):
    """Full closed ring (y,z) from left-half keys: mirror to the right side."""
    half = half_profile(keys, subs)
    ring = list(half)
    for (y, z) in reversed(half[1:-1]):
        ring.append((-y, z))
    return ring

def loft(name, stations, material, subs=(3, 4, 4, 3, 3, 3), cap_ends=True):
    """stations: [(x, keys)] — keys are 7 (y,z) left-half points, bottom-centre
    first, roof-centre last. Builds a quad loft, closed rings, optional caps."""
    rings = []
    for (x, keys) in stations:
        rings.append([(x, y, z) for (y, z) in ring_from_keys(keys, subs)])
    nr = len(rings[0])
    verts = [v for ring in rings for v in ring]
    faces = []
    for s in range(len(rings) - 1):
        for i in range(nr):
            a = s * nr + i; b = s * nr + (i + 1) % nr
            c = (s + 1) * nr + (i + 1) % nr; d = (s + 1) * nr + i
            faces.append((a, b, c, d))
    if cap_ends:
        c0 = len(verts); verts.append((stations[0][0], 0.0, sum(k[1] for k in stations[0][1]) / 7))
        for i in range(nr):
            faces.append((c0, (i + 1) % nr, i))
        c1 = len(verts); base = (len(rings) - 1) * nr
        verts.append((stations[-1][0], 0.0, sum(k[1] for k in stations[-1][1]) / 7))
        for i in range(nr):
            faces.append((c1, base + i, base + (i + 1) % nr))
    ob = mesh_from_verts_faces(name, verts, faces, material)
    return smooth(ob)

def section_keys(z_bot, hw_bot, z_sill, hw_sill, z_belt, hw_belt,
                 z_rail, hw_rail, z_roof, crown=0.05):
    """Standard 7-key cab section (bottom-centre -> roof-centre)."""
    return [(0.0, z_bot), (hw_bot, z_bot), (hw_sill, z_sill), (hw_belt, z_belt),
            (hw_rail, z_rail), (hw_rail * 0.82, z_roof - crown), (0.0, z_roof)]

# ---------------------------------------------------------------- wheels
def build_wheel_mesh(name):
    """One parametric Class-8 wheel, axle along Y, centred on origin.
    Dish faces +Y (outboard when placed on the left / outer dual)."""
    parts = []
    # tyre: lathe profile rings (width offset y, radius r)
    prof = [(-0.1575, 0.300), (-0.1575, 0.455), (-0.148, 0.505), (-0.115, 0.530),
            (-0.055, 0.538), (0.0, 0.5395), (0.055, 0.538), (0.115, 0.530),
            (0.148, 0.505), (0.1575, 0.455), (0.1575, 0.300)]
    SEG = 56
    verts = []; faces = []
    for (yy, rr) in prof:
        for i in range(SEG):
            a = 2 * math.pi * i / SEG
            verts.append((rr * math.cos(a), yy, rr * math.sin(a)))
    np_ = len(prof)
    for j in range(np_ - 1):
        for i in range(SEG):
            a = j * SEG + i; b = j * SEG + (i + 1) % SEG
            c = (j + 1) * SEG + (i + 1) % SEG; d = (j + 1) * SEG + i
            faces.append((a, b, c, d))
    tyre = mesh_from_verts_faces(name + "_tyre", verts, faces, TIREM)
    smooth(tyre)
    parts.append(tyre)
    # tread blocks: two chevron rows arrayed around the crown
    blocks = []
    NB = 40
    for i in range(NB):
        a = 2 * math.pi * i / NB
        for (yo, ang) in ((-0.078, 0.32), (0.078, -0.32)):
            bx = TIRE_R * math.cos(a); bz = TIRE_R * math.sin(a)
            b = box(f"{name}_tb", (bx, yo, bz), (0.055, 0.140, 0.016), TIREM)
            # face the block radially outward (+Z local -> radial dir), then
            # apply the chevron yaw in the tangent plane
            from mathutils import Matrix
            rot = (Matrix.Rotation(math.pi / 2 - a, 4, 'Y') @ Matrix.Rotation(ang, 4, 'X'))
            b.matrix_world = Matrix.Translation((bx, yo, bz)) @ rot
            blocks.append(b)
    parts.append(join_objects(name + "_tread", blocks, TIREM))
    # rim: deep-dish steel — outer lip ring, dish cone, hub
    rim_parts = []
    lip = cyl(name + "_rimlip", (0, 0.118, 0), RIM_R, 0.055, STEEL, rot=(math.pi / 2, 0, 0), vertices=36)
    rim_parts.append(lip)
    barrel = cyl(name + "_rimbarrel", (0, -0.02, 0), RIM_R - 0.004, 0.24, STEELD, rot=(math.pi / 2, 0, 0), vertices=36)
    rim_parts.append(barrel)
    # dish: cone frustum from barrel to hub face
    verts = []; faces = []
    SEG2 = 36
    r1, y1 = RIM_R - 0.01, 0.02; r2, y2 = 0.115, 0.105
    for (yy, rr) in ((y1, r1), (y2, r2)):
        for i in range(SEG2):
            a = 2 * math.pi * i / SEG2
            verts.append((rr * math.cos(a), yy, rr * math.sin(a)))
    for i in range(SEG2):
        a = i; b = (i + 1) % SEG2; c = SEG2 + (i + 1) % SEG2; d = SEG2 + i
        faces.append((a, b, c, d))
    dish = mesh_from_verts_faces(name + "_dish", verts, faces, STEEL)
    smooth(dish)
    rim_parts.append(dish)
    hub = cyl(name + "_hub", (0, 0.115, 0), 0.105, 0.075, STEEL, rot=(math.pi / 2, 0, 0), vertices=24)
    rim_parts.append(hub)
    # 10 lug nuts (hex) around the hub
    for i in range(10):
        a = 2 * math.pi * i / 10
        lug = cyl(name + "_lug", (0.082 * math.cos(a), 0.155, 0.082 * math.sin(a)),
                  0.016, 0.028, STEELD, rot=(math.pi / 2, 0, 0), vertices=6)
        rim_parts.append(lug)
    # hub spike (PRD Step 8 tactical): 140 mm forged cone on the hub face
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.045, radius2=0.004,
                                    depth=0.140, location=(0, 0.215, 0),
                                    rotation=(math.pi / 2, 0, 0))
    spike = bpy.context.object; spike.name = name + "_spike"
    spike.data.materials.append(STEEL)
    rim_parts.append(spike)
    parts.append(join_objects(name + "_rim", rim_parts, None))
    # brake disc behind the dish
    disc = cyl(name + "_brake", (0, -0.055, 0), 0.205, 0.028, STEELD, rot=(math.pi / 2, 0, 0), vertices=32)
    parts.append(disc)
    wheel = join_objects(name, parts, None)
    return wheel

WHEEL_SPOTS = [
    ("Wheel_Steer_Left",            (STEER_X,  STEER_LAT, TIRE_R), 0),
    ("Wheel_Steer_Right",           (STEER_X, -STEER_LAT, TIRE_R), 180),
    ("Wheel_Drive_Axle1_Left_Outer",  (AXLE1_X,  DUAL_OUT_LAT, TIRE_R), 0),
    ("Wheel_Drive_Axle1_Left_Inner",  (AXLE1_X,  DUAL_IN_LAT, TIRE_R), 180),
    ("Wheel_Drive_Axle1_Right_Outer", (AXLE1_X, -DUAL_OUT_LAT, TIRE_R), 180),
    ("Wheel_Drive_Axle1_Right_Inner", (AXLE1_X, -DUAL_IN_LAT, TIRE_R), 0),
    ("Wheel_Drive_Axle2_Left_Outer",  (AXLE2_X,  DUAL_OUT_LAT, TIRE_R), 0),
    ("Wheel_Drive_Axle2_Left_Inner",  (AXLE2_X,  DUAL_IN_LAT, TIRE_R), 180),
    ("Wheel_Drive_Axle2_Right_Outer", (AXLE2_X, -DUAL_OUT_LAT, TIRE_R), 180),
    ("Wheel_Drive_Axle2_Right_Inner", (AXLE2_X, -DUAL_IN_LAT, TIRE_R), 0),
]

def build_wheels(root):
    master = build_wheel_mesh("WheelMaster")
    for (nm, loc, flip) in WHEEL_SPOTS:
        piv = empty(nm, loc, parent=root)
        inst = bpy.data.objects.new(nm + "_mesh", master.data)
        link(inst, piv)
        inst.rotation_euler = (0, 0, math.radians(flip))
    # instances share the mesh data; drop the master object so no stray
    # wheel ships at the origin
    bpy.data.objects.remove(master, do_unlink=True)
    return None

# ---------------------------------------------------------------- chassis
def c_rail(name, x0, x1, yc):
    """Boxed C-channel rail: profile loft between two stations.
    Proper C outline: flanges 90 wide point inward, web 10 thick outboard."""
    s = 1 if yc > 0 else -1
    yi = abs(yc) - 0.045; yo = abs(yc) + 0.045; wi = yo - 0.010
    prof = [(yi, RAIL_TOP), (yo, RAIL_TOP), (yo, RAIL_TOP - 0.300), (yi, RAIL_TOP - 0.300),
            (yi, RAIL_TOP - 0.290), (wi, RAIL_TOP - 0.290), (wi, RAIL_TOP - 0.010),
            (yi, RAIL_TOP - 0.010)]
    if s < 0:
        prof = list(reversed(prof))
    # build as a simple loft of the C outline (6 pts, closed) — reuse ring loft
    # by constructing verts directly
    rings = []
    for x in (x0, x1):
        rings.append([(x, s * yy, zz) for (yy, zz) in prof])
    nr = len(prof)
    verts = [v for r in rings for v in r]
    faces = []
    for i in range(nr):
        a = i; b = (i + 1) % nr; c = nr + (i + 1) % nr; d = nr + i
        faces.append((a, b, c, d))
    faces.append(tuple(range(nr - 1, -1, -1)))
    faces.append(tuple(nr + i for i in range(nr)))
    return mesh_from_verts_faces(name, verts, faces, CHASSIS)

def build_chassis(root):
    grp = empty("COL_GEO_CHASSIS_AND_RUNNING_GEAR", (0, 0, 0), parent=root)
    for s in (1, -1):
        r = c_rail(f"FrameRail_{'L' if s>0 else 'R'}", -4.250, 4.200, s * 0.405)
        r.parent = grp
        liner = box(f"RailLiner_{'L' if s>0 else 'R'}", (-0.900, s * 0.350, 0.870),
                    (5.400, 0.012, 0.270), CHASSIS, parent=grp)
    # crossmembers at PRD stations
    for (nm, xx) in (("radiator", 3.850), ("bellhousing", 1.950), ("carrier", 0.350),
                     ("tandem_torque", -1.550), ("fifth_bridge", -2.350), ("rear_crash", -4.250)):
        box(f"Crossmember_{nm}", (xx, 0, 0.900), (0.090, 0.810, 0.120), CHASSIS, parent=grp)
    # engine + gearbox hint (visible in the gaps), radiator
    box("Engine_DD16", (2.450, 0, 0.860), (1.450, 0.780, 0.720), STEELD, bevel=0.03, parent=grp)
    box("Radiator", (4.050, 0, 1.050), (0.140, 1.150, 0.900), DARKM, parent=grp)
    box("Gearbox_18sp", (1.350, 0, 0.780), (0.800, 0.520, 0.520), STEELD, bevel=0.03, parent=grp)
    # driveshaft engine -> axle1 -> axle2
    cyl("Driveshaft_1", (0.050, 0, 0.720), 0.055, 2.200, STEEL, rot=(0, math.pi / 2 - 0.03, 0), parent=grp)
    cyl("Driveshaft_2", (-2.520, 0, 0.700), 0.055, 1.320, STEEL, rot=(0, math.pi / 2, 0), parent=grp)
    # front axle I-beam + leaf springs + steering arms
    cyl("SteerAxle", (STEER_X, 0, TIRE_R), 0.052, 2.050, STEELD, rot=(math.pi / 2, 0, 0), parent=grp)
    for s in (1, -1):
        for k in range(3):
            box(f"LeafSpring_{'L' if s>0 else 'R'}_{k}", (STEER_X, s * 0.470, 0.600 + k * 0.016),
                (0.780 - k * 0.09, 0.070, 0.011), STEELD, parent=grp)
        box(f"SteerHub_{'L' if s>0 else 'R'}", (STEER_X, s * 0.960, TIRE_R),
            (0.180, 0.200, 0.180), STEELD, parent=grp)
    # drive axles: housings, pumpkins, air bags, torque rods, shocks
    for (nm, xx) in (("Axle1", AXLE1_X), ("Axle2", AXLE2_X)):
        cyl(f"Drive{nm}", (xx, 0, TIRE_R), 0.078, 1.950, STEELD, rot=(math.pi / 2, 0, 0), parent=grp)
        p = cyl(f"Diff{nm}", (xx, 0, TIRE_R), 0.190, 0.300, STEELD, rot=(math.pi / 2, 0, 0), vertices=20)
        p.scale = (1.0, 1.0, 1.15); p.parent = grp
        for s in (1, -1):
            bag = cyl(f"AirBag_{nm}_{'L' if s>0 else 'R'}", (xx + 0.28, s * 0.470, 0.780),
                      0.130, 0.330, RUBBER, vertices=20)
            bag.scale = (1.12, 1.12, 1.0); bag.parent = grp
            cyl(f"TorqueRod_{nm}_{'L' if s>0 else 'R'}", (xx + 0.45, s * 0.470, 0.560),
                0.024, 0.900, STEELD, rot=(0, math.pi / 2 - 0.18, 0), parent=grp)
            cyl(f"Shock_{nm}_{'L' if s>0 else 'R'}", (xx - 0.30, s * 0.470, 0.720),
                0.032, 0.480, STEELD, rot=(0.0, 0, 0), parent=grp)
    # battery + DEF + tool boxes on the rails
    box("BatteryBox", (1.150, 0.560, 0.760), (0.620, 0.300, 0.340), STEELD, bevel=0.015, parent=grp)
    box("DEFBox", (1.150, -0.560, 0.760), (0.480, 0.300, 0.300), STEELD, bevel=0.015, parent=grp)
    # rear underrun + light bar
    box("RearUnderrun", (-4.400, 0, 0.450), (0.060, 1.900, 0.180), CHASSIS, parent=grp)
    for s in (1, -1):
        box(f"TailLight_{'L' if s>0 else 'R'}", (-4.415, s * 0.820, 0.620),
            (0.050, 0.300, 0.140), REDL, parent=grp)
        box(f"Mudflap_{'L' if s>0 else 'R'}", (-3.880, s * 1.080, 0.330),
            (0.040, 0.560, 0.560), RUBBER, parent=grp)
    return grp

# ---------------------------------------------------------------- tanks
def build_tanks(root):
    grp = empty("COL_GEO_TANKS", (0, 0, 0), parent=root)
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        # lathe: rounded-end cylinder along X
        prof = [(-TANK_L / 2, 0.0), (-TANK_L / 2, TANK_R * 0.72), (-TANK_L / 2 + 0.10, TANK_R * 0.94),
                (-TANK_L / 2 + 0.22, TANK_R), (TANK_L / 2 - 0.22, TANK_R),
                (TANK_L / 2 - 0.10, TANK_R * 0.94), (TANK_L / 2, TANK_R * 0.72), (TANK_L / 2, 0.0)]
        SEG = 36; verts = []; faces = []
        for (xx, rr) in prof:
            for i in range(SEG):
                a = 2 * math.pi * i / SEG
                verts.append((TANK_X + xx, TANK_LAT * s + rr * math.cos(a) * 0, TANK_Z + rr * math.sin(a)))
        # lathe around X axis: ring point = (x, cy + r*cos? ) -> build properly:
        verts = []
        for (xx, rr) in prof:
            for i in range(SEG):
                a = 2 * math.pi * i / SEG
                verts.append((TANK_X + xx, s * TANK_LAT + rr * math.sin(a), TANK_Z + rr * math.cos(a)))
        np_ = len(prof)
        for j in range(np_ - 1):
            for i in range(SEG):
                a = j * SEG + i; b = j * SEG + (i + 1) % SEG
                c = (j + 1) * SEG + (i + 1) % SEG; d = (j + 1) * SEG + i
                faces.append((a, b, c, d))
        tank = mesh_from_verts_faces(f"SaddleTank_{nm}", verts, faces, ALU)
        smooth(tank); tank.parent = grp
        for dx in (-0.62, 0.62):
            band = cyl(f"TankStrap_{nm}_{dx}", (TANK_X + dx, s * TANK_LAT, TANK_Z),
                       TANK_R + 0.006, 0.045, STEELD, vertices=36)
            band.rotation_euler = (0, 0, 0)
            band.scale = (1, 1, 1)
            # strap = short fat cylinder along X: rotate cylinder axis to X
            band.rotation_euler = (0, math.pi / 2, 0)
            band.parent = grp
        cyl(f"FillerCap_{nm}", (TANK_X + 0.30, s * TANK_LAT, TANK_Z + TANK_R + 0.02),
            0.055, 0.050, STEELD, vertices=16, parent=grp)
    return grp

# ---------------------------------------------------------------- stacks
def build_stacks(root):
    grp = empty("COL_GEO_STACKS", (0, 0, 0), parent=root)
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        # main pipe Ø180 chrome, z 1.02 -> 3.87, then a true elbow (quarter
        # torus) turning rearward; the exit opening's top edge is the 4.120
        # height landmark.
        cyl(f"StackPipe_{nm}", (STACK_X, s * STACK_LAT, 2.445), 0.090, 2.850, CHROME, vertices=28, parent=grp)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.160, minor_radius=0.090,
                                         major_segments=20, minor_segments=14,
                                         location=(STACK_X - 0.160, s * STACK_LAT, 3.870),
                                         rotation=(math.pi / 2, 0, 0))
        tip = bpy.context.object; tip.name = f"StackElbow_{nm}"
        tip.data.materials.append(CHROME)
        import bmesh
        bm = bmesh.new(); bm.from_mesh(tip.data)
        kill = [v for v in bm.verts if v.co.x < -0.005 or v.co.y < -0.005]
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        bm.to_mesh(tip.data); bm.free()
        tip.parent = grp
        # heat shield: TRUE perforation — horizontal bands + vertical ribs,
        # open slots between them (no alpha). Ø240, z 1.30 -> 3.10.
        parts = []
        z = 1.320
        while z < 3.100:
            band = cyl(f"shband", (STACK_X, s * STACK_LAT, z), 0.120, 0.020, STEELD, vertices=36)
            parts.append(band)
            z += 0.060
        for i in range(14):
            a = 2 * math.pi * i / 14
            rib = box("shrib", (STACK_X + 0.120 * math.cos(a), s * STACK_LAT + 0.120 * math.sin(a), 2.200),
                      (0.016, 0.016, 1.800), STEELD)
            parts.append(rib)
        shield = join_objects(f"HeatShield_{nm}", parts, None)
        shield.parent = grp
        # 4 band clamps with T-bolts on the pipe below the shield
        for zc in (1.10, 1.22):
            cyl(f"StackClamp_{nm}_{zc}", (STACK_X, s * STACK_LAT, zc), 0.098, 0.035,
                STEELD, vertices=24, parent=grp)
        # elbow from cab rear header down to the frame
        cyl(f"StackElbow_{nm}", (STACK_X, s * STACK_LAT, 0.980), 0.088, 0.300, CHROME, vertices=20, parent=grp)
    return grp

# ---------------------------------------------------------------- body shell
# Two-loft construction (PRD-correct: the hood is its own panel with a shut
# line at the firewall; the cab loft's front stations form the windshield
# slope). Row: x, z_bot, hw_bot, z_sill, hw_sill, z_belt, hw_belt, z_rail,
# hw_rail, z_roof, crown
HOOD_STATIONS = [
    ( 4.300, 0.52, 0.62, 1.00, 0.70, 1.35, 0.72, 1.55, 0.70, 1.60, 0.03),
    ( 4.220, 0.54, 0.72, 1.01, 0.84, 1.38, 0.88, 1.58, 0.82, 1.62, 0.03),
    ( 4.050, 0.55, 0.80, 1.02, 0.94, 1.40, 0.99, 1.60, 0.98, 1.64, 0.03),
    ( 3.800, 0.58, 1.13, 1.05, 1.31, 1.45, 1.32, 1.66, 1.14, 1.68, 0.03),
    ( 3.300, 0.60, 1.10, 1.10, 1.28, 1.52, 1.29, 1.70, 1.12, 1.71, 0.03),
    ( 2.900, 0.66, 1.02, 1.20, 1.15, 1.60, 1.18, 1.74, 1.13, 1.75, 0.03),
    ( 2.400, 0.72, 1.05, 1.35, 1.17, 1.72, 1.20, 1.80, 1.15, 1.81, 0.03),
    ( 2.150, 0.76, 1.08, 1.50, 1.19, 1.84, 1.21, 1.88, 1.16, 1.90, 0.04),
    ( 1.900, 0.78, 1.10, 1.55, 1.20, 1.86, 1.215, 1.90, 1.16, 1.92, 0.04),
]
CAB_STATIONS = [
    ( 1.885, 0.78, 1.10, 1.55, 1.20, 1.90, 1.215, 1.97, 1.17, 2.00, 0.04),
    ( 1.720, 0.80, 1.12, 1.55, 1.22, 1.96, 1.23, 2.42, 1.14, 2.60, 0.05),
    ( 1.550, 0.81, 1.13, 1.55, 1.23, 2.01, 1.24, 2.78, 1.13, 2.90, 0.05),
    ( 1.450, 0.82, 1.14, 1.55, 1.24, 2.03, 1.248, 2.88, 1.13, 2.99, 0.05),
    ( 1.200, 0.84, 1.15, 1.55, 1.245, 2.04, 1.250, 2.92, 1.14, 3.02, 0.05),
    ( 0.855, 0.84, 1.15, 1.55, 1.24, 2.04, 1.245, 2.96, 1.15, 3.06, 0.05),
    ( 0.450, 0.86, 1.13, 1.55, 1.22, 2.05, 1.220, 3.10, 1.16, 3.30, 0.05),
    (-0.300, 0.86, 1.13, 1.55, 1.22, 2.05, 1.220, 3.35, 1.14, 3.60, 0.05),
    (-0.875, 0.86, 1.13, 1.55, 1.22, 2.05, 1.220, 3.30, 1.14, 3.55, 0.05),
]

def cage_audit(ob, label):
    me = ob.data
    from collections import Counter
    c = Counter(len(p.vertices) for p in me.polygons)
    print(f"CAGE_AUDIT {label}: verts={len(me.vertices)} faces={len(me.polygons)} "
          f"by_sides={dict(c)}")

def _loft_from_rows(name, rows, mat):
    stations = []
    for row in rows:
        (x, zb, hwb, zs, hws, zbl, hwbl, zr, hwr, zrf, cr) = row
        stations.append((x, section_keys(zb, hwb, zs, hws, zbl, hwbl, zr, hwr, zrf, cr)))
    ob = loft(name, stations, mat)
    cage_audit(ob, name + "_cage")
    subsurf(ob, 2)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier="subd")
    ob.select_set(False)
    return ob

def _cut(target, cutter):
    mod = target.modifiers.new("cut", 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.modifier_apply(modifier="cut")
    target.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)

def build_body(root):
    grp = empty("COL_GEO_CAB_AND_BODYWORK", (0, 0, 0), parent=root)
    hood = _loft_from_rows("HoodShell", HOOD_STATIONS, PAINT)
    hood.parent = grp
    shell = _loft_from_rows("BodyShell", CAB_STATIONS, PAINT)
    shell.parent = grp
    # --- aperture cuts (EXACT solver): steer arch in the hood; windshield,
    #     door glass, sleeper glass in the cab. Real openings — the Seahawk
    #     lesson: never film over paint.
    arch = cyl("archcut", (STEER_X, 0, TIRE_R), 0.600, 2.900, None, rot=(math.pi / 2, 0, 0), vertices=40)
    _cut(hood, arch)
    ws = box("wscut", (1.720, 0, 2.400), (0.500, 2.020, 1.000), None,
             rot=(0, math.radians(-20.0), 0))
    _cut(shell, ws)
    for s in (1, -1):
        dw = box("dwcut", (1.360, s * 1.160, 2.350), (0.800, 0.340, 0.560), None)
        _cut(shell, dw)
        sw = box("swcut", (-0.350, s * 1.150, 2.380), (0.560, 0.340, 0.420), None)
        _cut(shell, sw)
    # arch lips (flared trim over the steer arch). Torus rotated so its ring
    # lies in the X-Z plane; local +Y maps to world +Z, so the lower half is
    # local y < 0.
    for s in (1, -1):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.600, minor_radius=0.032,
                                         major_segments=24, minor_segments=8,
                                         location=(STEER_X, s * 1.285, TIRE_R),
                                         rotation=(math.pi / 2, 0, 0))
        lip = bpy.context.object; lip.name = f"ArchLip_{'L' if s>0 else 'R'}"
        lip.data.materials.append(PAINT2)
        import bmesh
        bm = bmesh.new(); bm.from_mesh(lip.data)
        kill = [v for v in bm.verts if v.co.y < -0.02]
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        bm.to_mesh(lip.data); bm.free()
        lip.parent = grp
    # cowl spine + hood extractors (recessed scoops read via dark insets)
    box("CowlSpine", (3.050, 0, 1.748), (1.700, 0.300, 0.035), PAINT2, rot=(0, math.radians(5.0), 0), parent=grp)
    for s in (1, -1):
        box(f"HoodExtractor_{'L' if s>0 else 'R'}", (2.620, s * 1.183, 1.680),
            (0.520, 0.030, 0.200), DARKM, rot=(0, math.radians(5.0), 0), parent=grp)
    # sleeper rear panel detail: louver vent + access door outline
    box("SleeperRearDoor", (SLEEPER_BACK_X - 0.012, 0.30, 1.900), (0.024, 0.780, 1.500), PAINT2, parent=grp)
    return grp, shell

def build_glass(root, grp):
    # windshield: two panes sampled on the cowl slope, inset into the aperture
    def pane(name, y0, y1):
        NU, NV = 7, 5
        verts = []; faces = []
        for j in range(NV):
            v = j / (NV - 1)
            bx = 1.860 + (1.590 - 1.860) * v
            bz = 2.075 + (2.790 - 2.075) * v
            for i in range(NU):
                u = i / (NU - 1)
                yy = y0 + (y1 - y0) * u
                bow = 0.018 * math.sin(math.pi * u) * math.sin(math.pi * v)
                verts.append((bx + bow + 0.012, yy, bz))
        for j in range(NV - 1):
            for i in range(NU - 1):
                a = j * NU + i; b = a + 1; c = a + NU + 1; d = a + NU
                faces.append((a, b, c, d))
        ob = mesh_from_verts_faces(name, verts, faces, GLASS)
        ob.parent = grp
        return ob
    pane("Windshield_L", 0.035, 1.000)
    pane("Windshield_R", -1.000, -0.035)
    box("WindshieldPost", (1.720, 0, 2.400), (0.460, 0.050, 0.820), PAINT2,
        rot=(0, math.radians(-20.0), 0), parent=grp)
    # door glass + sleeper glass, set into their apertures
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        dg = box(f"DoorGlass_{nm}", (1.360, s * 1.148, 2.350), (0.760, 0.016, 0.520), GLASS, parent=grp)
        sg = box(f"SleeperGlass_{nm}", (-0.350, s * 1.138, 2.380), (0.520, 0.016, 0.380), GLASS, parent=grp)
        # NOTE: PRD sleeper louver armor is a tactical MOD, not base spec —
        # the showcase sleeper glass is clean. Louvers stay out of this build.

def build_front(root, grp):
    # grille: surround, dark recess, hex-screen panel, 18 vertical slats —
    # the whole stack sits PROUD of the hood front cap (x 4.300)
    box("GrilleSurround", (4.315, 0, 1.130), (0.070, 1.440, 1.180), PAINT2, bevel=0.02, parent=grp)
    box("GrilleRecess", (4.330, 0, 1.130), (0.050, 1.300, 1.040), DARKM, parent=grp)
    box("GrilleHexScreen", (4.322, 0, 1.130), (0.020, 1.280, 1.020), STEELD, parent=grp)
    slats = []
    for i in range(18):
        yy = -0.595 + i * (1.19 / 17)
        slats.append(box("gslat", (4.350, yy, 1.130), (0.045, 0.016, 1.000), CHROME))
    join_objects("GrilleSlats", slats, None).parent = grp
    box("GrilleBadge", (4.360, 0, 1.690), (0.030, 0.200, 0.090), CHROME, parent=grp)
    # headlight pods: housings in the fender fronts, quad projectors + DRL bars
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        box(f"HeadlightHousing_{nm}", (4.240, s * 0.880, 0.980), (0.160, 0.460, 0.300),
            PAINT2, bevel=0.03, parent=grp)
        for (dy, dz) in ((-0.110, 1.030), (0.110, 1.030)):
            cyl(f"Projector_{nm}_{dy}", (4.330, s * 0.880 + dy, dz), 0.052, 0.040,
                LENS, rot=(0, math.pi / 2, 0), vertices=20, parent=grp)
        box(f"DRL_{nm}", (4.325, s * 0.880, 0.885), (0.030, 0.360, 0.035), LENS, parent=grp)
    # boxed ram (PRD Step 8): 2.62 wide, corners back 22 deg, shackles, winch
    ram = empty("COL_GEO_TACTICAL_MODS", (0, 0, 0), parent=root)
    box("BoxedRam", (4.360, 0, 0.750), (0.170, 1.900, 0.600), PAINT2, bevel=0.025, parent=ram)
    for s in (1, -1):
        wing = box(f"RamWing_{'L' if s>0 else 'R'}", (4.310, s * 1.155, 0.750),
                   (0.170, 0.560, 0.600), PAINT2, rot=(0, 0, math.radians(-22) * s), bevel=0.02)
        wing.rotation_euler = (0, math.radians(22) * s, 0)
        wing.parent = ram
        bpy.ops.mesh.primitive_torus_add(major_radius=0.085, minor_radius=0.020,
                                         major_segments=20, minor_segments=8,
                                         location=(4.455, s * 0.550, 0.620),
                                         rotation=(0, math.pi / 2, 0))
        sh = bpy.context.object; sh.name = f"RamShackle_{'L' if s>0 else 'R'}"
        sh.data.materials.append(STEELD); sh.parent = ram
    box("RamSkid", (4.050, 0, 0.330), (0.800, 1.700, 0.050), STEELD, rot=(0, math.radians(24), 0), parent=ram)
    box("Winch", (4.180, 0, 0.580), (0.240, 0.620, 0.300), STEELD, bevel=0.02, parent=ram)
    cyl("WinchDrum", (4.300, 0, 0.580), 0.085, 0.480, STEEL, rot=(math.pi / 2, 0, 0), parent=ram)
    # aero sun visor + 5 amber teardrops
    visor = box("SunVisor", (1.620, 0, 2.940), (0.360, 2.200, 0.035), PAINT2,
                rot=(0, math.radians(-14), 0), bevel=0.01)
    visor.parent = grp
    for i, yy in enumerate((-0.72, -0.36, 0.0, 0.36, 0.72)):
        t = cyl(f"MarkerLight_{i}", (1.760, yy, 2.885), 0.026, 0.030, AMBER,
                rot=(0, math.radians(76), 0), vertices=12)
        t.scale = (1.0, 1.35, 1.0); t.parent = grp
    # mirrors: arms + dual-glass housings, tips to +-1.57
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        cyl(f"MirrorArm_{nm}", (1.720, s * 1.330, 2.620), 0.018, 0.420, STEELD,
            rot=(math.radians(90) * s * 0 + math.pi / 2, 0, 0), parent=grp).rotation_euler = (math.pi / 2, 0, 0)
        box(f"Mirror_{nm}", (1.700, s * 1.490, 2.420), (0.090, 0.160, 0.460), PAINT2, bevel=0.02, parent=grp)
        box(f"MirrorGlass_{nm}", (1.655, s * 1.490, 2.420), (0.020, 0.130, 0.420), GLASS, parent=grp)
        cyl(f"SpotMirror_{nm}", (1.690, s * 1.470, 2.120), 0.085, 0.030, STEELD,
            rot=(0, math.pi / 2, 0), vertices=20, parent=grp)
    # air cleaners at the cab rear corners (showcase read)
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        cyl(f"AirCleaner_{nm}", (0.920, s * 1.285, 1.520), 0.145, 0.580, STEEL, vertices=24, parent=grp)
        cyl(f"AirCleanerCap_{nm}", (0.920, s * 1.285, 1.835), 0.150, 0.050, STEELD, vertices=24, parent=grp)
    # door gap plates + panels + handles (shut lines as geometry)
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        gap = box(f"DoorGap_{nm}", (1.360, s * 1.243, 1.500), (0.920, 0.012, 1.640), DARKM, parent=grp)
        gap.rotation_euler = (math.radians(-3.2) * s, 0, 0)
        panel = box(f"DoorPanel_{nm}", (1.360, s * 1.252, 1.490), (0.860, 0.014, 1.040), PAINT, parent=grp)
        panel.rotation_euler = (math.radians(-3.2) * s, 0, 0)
        box(f"DoorHandle_{nm}", (1.020, s * 1.258, 1.920), (0.170, 0.025, 0.035), STEELD, parent=grp)
        # cab steps (diamond plate tops added in the catwalk stage list)
        box(f"CabStep1_{nm}", (1.360, s * 1.160, 0.600), (0.620, 0.340, 0.040), DIAMOND, parent=grp)
        box(f"CabStep2_{nm}", (1.360, s * 1.200, 0.860), (0.620, 0.260, 0.040), DIAMOND, parent=grp)
    # crimson pinstripe sweeps (geometry strips, ghosted per showcase)
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        st = box(f"PinstripeSleeper_{nm}", (0.050, s * 1.228, 2.300), (1.620, 0.010, 0.038), CRIMSON, parent=grp)
        st2 = box(f"PinstripeHood_{nm}", (2.850, s * 1.185, 1.700), (1.500, 0.010, 0.030), CRIMSON, parent=grp)
        st2.rotation_euler = (0, math.radians(5.0), 0)
    # sleeper lettering (showcase: NOMAD PRIME / HEAVY HAUL UNIT - 01)
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        # reading direction: first letter toward the nose on both sides.
        # left (+Y): euler (90,0,180); right (-Y): euler (90,0,0).
        rot = (math.pi / 2, 0, math.pi) if s > 0 else (math.pi / 2, 0, 0)
        for (txt, zz, hh) in (("NOMAD PRIME", 2.000, 0.150), ("HEAVY HAUL UNIT - 01", 1.840, 0.075)):
            bpy.ops.object.text_add(location=(-0.300, s * 1.232, zz), rotation=rot)
            tx = bpy.context.object; tx.name = f"Lettering_{nm}_{zz}"
            tx.data.body = txt; tx.data.size = hh; tx.data.extrude = 0.004
            tx.data.align_x = 'CENTER'
            tx.data.materials.append(LETTER)
            bpy.context.view_layer.objects.active = tx
            tx.select_set(True)
            bpy.ops.object.convert(target='MESH')
            tx.select_set(False)
            tx.parent = grp

# ------------------------------------------------- catwalk + fifth wheel
def diamond_deck(name, x0, x1, y0, y1, z, pitch=0.045):
    """Deck plate + TRUE geometric diamond lugs (two diagonal dashes/cell)."""
    plate = box(name + "_plate", ((x0 + x1) / 2, (y0 + y1) / 2, z - 0.004),
                (x1 - x0, y1 - y0, 0.008), DIAMOND)
    verts = []; faces = []
    lug_w, lug_l, lug_h = 0.0062, 0.0205, 0.0026
    nx = int((x1 - x0) / pitch); ny = int((y1 - y0) / pitch)
    for i in range(nx):
        for j in range(ny):
            cx = x0 + (i + 0.5) * pitch; cy = y0 + (j + 0.5) * pitch
            for k in range(2):
                ang = math.radians(45 if (i + j) % 2 == 0 else -45)
                ox = (k - 0.5) * pitch * 0.42 * math.cos(ang)
                oy = (k - 0.5) * pitch * 0.42 * math.sin(ang)
                ca, sa = math.cos(ang), math.sin(ang)
                base = len(verts)
                for (lx, ly) in ((-lug_l / 2, -lug_w / 2), (lug_l / 2, -lug_w / 2),
                                 (lug_l / 2, lug_w / 2), (-lug_l / 2, lug_w / 2)):
                    verts.append((cx + ox + lx * ca - ly * sa, cy + oy + lx * sa + ly * ca, z))
                for (lx, ly) in ((-lug_l / 2 + 0.0016, -lug_w / 2 + 0.0016),
                                 (lug_l / 2 - 0.0016, -lug_w / 2 + 0.0016),
                                 (lug_l / 2 - 0.0016, lug_w / 2 - 0.0016),
                                 (-lug_l / 2 + 0.0016, lug_w / 2 - 0.0016)):
                    verts.append((cx + ox + lx * ca - ly * sa, cy + oy + lx * sa + ly * ca, z + lug_h))
                faces += [(base, base + 1, base + 5, base + 4), (base + 1, base + 2, base + 6, base + 5),
                          (base + 2, base + 3, base + 7, base + 6), (base + 3, base + 0, base + 4, base + 7),
                          (base + 4, base + 5, base + 6, base + 7)]
    lugs = mesh_from_verts_faces(name + "_lugs", verts, faces, DIAMOND)
    print(f"DIAMOND {name}: cells={nx * ny} lugs={nx * ny * 2}")
    return plate, lugs

def build_rear_deck(root):
    grp = empty("COL_GEO_CATWALK_FIFTH", (0, 0, 0), parent=root)
    dz = 1.080
    decks = [("DeckFront", -1.450, -1.180, -1.240, 1.240),
             ("DeckSideL", -3.800, -1.450, 0.550, 1.240),
             ("DeckSideR", -3.800, -1.450, -1.240, -0.550),
             ("DeckRear", -4.050, -3.800, -1.240, 1.240),
             ("DeckMid", -3.800, -1.450, -0.540, 0.540)]
    for (nm, xa, xb, ya, yb) in decks:
        p, l = diamond_deck(nm, xa, xb, ya, yb, dz)
        p.parent = grp; l.parent = grp
    # drive-wheel arch lips on the deck sides
    for (xx) in (AXLE1_X, AXLE2_X):
        for s in (1, -1):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.600, minor_radius=0.030,
                                             major_segments=20, minor_segments=8,
                                             location=(xx, s * 1.245, TIRE_R),
                                             rotation=(math.pi / 2, 0, 0))
            lip = bpy.context.object; lip.name = "DriveArchLip"
            lip.data.materials.append(PAINT2)
            import bmesh
            bm = bmesh.new(); bm.from_mesh(lip.data)
            kill = [v for v in bm.verts if v.co.y < -0.02]
            bmesh.ops.delete(bm, geom=kill, context='VERTS')
            bm.to_mesh(lip.data); bm.free()
            lip.parent = grp
    # fifth wheel: slider rails, pedestal, cast plate with jaw slot + ramps
    for s in (1, -1):
        box(f"SliderRail_{'L' if s>0 else 'R'}", (KINGPIN_X, s * 0.330, 1.055),
            (1.500, 0.070, 0.045), STEELD, parent=grp)
    box("FifthPedestal", (KINGPIN_X, 0, 1.140), (0.500, 0.560, 0.180), STEELD, parent=grp)
    cyl("FifthPivot", (KINGPIN_X, 0, 1.225), 0.055, 0.700, STEEL, rot=(math.pi / 2, 0, 0), parent=grp)
    plate = box("FifthWheelPlate", (KINGPIN_X, 0, 1.252), (0.850, 0.920, 0.052), STEELD, bevel=0.015, parent=grp)
    box("FifthJawSlot", (KINGPIN_X - 0.180, 0, 1.282), (0.420, 0.075, 0.012), DARKM, parent=grp)
    ramp = box("FifthEntryRamp", (KINGPIN_X - 0.560, 0, 1.215), (0.300, 0.700, 0.040), STEELD,
               rot=(0, math.radians(18), 0))
    ramp.parent = grp
    # gladhands: coiled umbilicals at the sleeper rear (curve -> tube meshes)
    def coil(name, y_top, mat):
        pts = []
        turns, drop = 7, 0.520
        for i in range(turns * 14 + 1):
            t = i / (turns * 14)
            a = t * turns * 2 * math.pi
            pts.append(Vector((-0.905 - 0.055 * math.cos(a), y_top + 0.055 * math.sin(a),
                               1.480 - drop * t)))
        pts.append(Vector((-1.150, y_top, 1.020)))
        pts.append(Vector((-1.550, y_top * 0.8, 1.100)))
        cu = bpy.data.curves.new(name, 'CURVE')
        cu.dimensions = '3D'; cu.bevel_depth = 0.017; cu.bevel_resolution = 3
        sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for (p, co) in zip(sp.points, pts):
            p.co = (co.x, co.y, co.z, 1.0)
        ob = bpy.data.objects.new(name, cu)
        link(ob, grp)
        ob.data.materials.append(mat)
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        bpy.ops.object.convert(target='MESH')
        ob.select_set(False)
        return ob
    coil("GladhandEmergency", -0.160, REDH)
    coil("GladhandService", -0.040, BLUEH)
    for (nm, yy, mm) in (("GladhandHead_R", -0.160, REDH), ("GladhandHead_B", -0.040, BLUEH)):
        box(nm, (-0.900, yy, 1.500), (0.070, 0.060, 0.110), mm, parent=grp)
    # frame rear light bar + deck edge lights
    for s in (1, -1):
        box(f"DeckLight_{'L' if s>0 else 'R'}", (-4.060, s * 1.100, 1.060),
            (0.060, 0.180, 0.050), REDL, parent=grp)
    return grp

# ---------------------------------------------------------------- interior
def build_interior(root):
    grp = empty("COL_GEO_INTERIOR_COCKPIT", (0, 0, 0), parent=root)
    # floor + interior tub (rear wall, headliner, door cards)
    box("CabFloor", (1.350, 0, 1.115), (1.350, 2.300, 0.050), INTD, parent=grp)
    box("SleeperFloor", (-0.050, 0, 1.115), (1.750, 2.200, 0.050), INTD, parent=grp)
    box("CabRearWall", (0.870, 0, 2.050), (0.040, 2.300, 1.900), INTM, parent=grp)
    box("Headliner", (1.350, 0, 2.940), (1.300, 2.200, 0.040), INTM, parent=grp)
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        box(f"DoorCard_{nm}", (1.360, s * 1.130, 1.620), (0.840, 0.030, 1.100), INTM, parent=grp)
        box(f"DoorPocket_{nm}", (1.300, s * 1.105, 1.280), (0.500, 0.050, 0.220), INTD, parent=grp)
    # wrap dash (15 deg rake), gauge cluster, centre screen, vents
    dash = box("Dash", (1.760, 0, 1.800), (0.340, 2.150, 0.420), INTM, bevel=0.03)
    dash.rotation_euler = (0, math.radians(-8), 0); dash.parent = grp
    box("DashTop", (1.700, 0, 2.020), (0.420, 2.150, 0.060), INTD, parent=grp)
    for i, yy in enumerate((0.470, 0.580, 0.690)):
        cyl(f"Gauge_{i}", (1.600, yy, 1.880), 0.042, 0.015, GAUGE, rot=(0, math.pi / 2 - 0.14, 0),
            vertices=20, parent=grp)
    box("CentreScreen", (1.615, 0.100, 1.900), (0.030, 0.300, 0.190), SCREEN, parent=grp)
    for yy in (-0.750, -0.350, 0.350, 0.800):
        box(f"DashVent_{yy}", (1.620, yy, 1.940), (0.025, 0.160, 0.045), INTD, parent=grp)
    # AppBoy dock (PRD socket -> dash top, lat +0.140)
    box("AppBoyDock", (1.620, 0.140, 1.985), (0.090, 0.130, 0.055), INTD, parent=grp)
    # steering column + wheel (driver left, +Y)
    col = cyl("SteerColumn", (1.580, 0.580, 1.760), 0.028, 0.340, INTD,
              rot=(0, math.radians(52), 0), vertices=14)
    col.parent = grp
    bpy.ops.mesh.primitive_torus_add(major_radius=0.225, minor_radius=0.024,
                                     major_segments=28, minor_segments=10,
                                     location=(1.500, 0.580, 1.860), rotation=(0, math.radians(38), 0))
    wheel = bpy.context.object; wheel.name = "SteeringWheel"
    wheel.data.materials.append(INTD); wheel.parent = grp
    box("WheelHub", (1.500, 0.580, 1.860), (0.050, 0.130, 0.130), INTM,
        rot=(0, math.radians(38), 0), parent=grp)
    # captain chairs at the seat anchors (cushion top z 1.400)
    def chair(nm, yy):
        g = empty(nm, (0, 0, 0), parent=grp)
        cyl(nm + "_pedestal", (1.300, yy, 1.215), 0.090, 0.150, STEELD, vertices=16, parent=g)
        box(nm + "_bellows", (1.300, yy, 1.290), (0.300, 0.340, 0.060), RUBBER, parent=g)
        box(nm + "_cushion", (1.300, yy, 1.365), (0.560, 0.560, 0.140), SEATF, bevel=0.03, parent=g)
        back = box(nm + "_back", (1.045, yy, 1.800), (0.130, 0.560, 0.820), SEATF, bevel=0.04)
        back.rotation_euler = (0, math.radians(9), 0); back.parent = g
        box(nm + "_headrest", (0.990, yy, 2.300), (0.110, 0.260, 0.170), SEATF, bevel=0.03, parent=g)
        for ds in (1, -1):
            box(nm + f"_arm{ds}", (1.280, yy + ds * 0.330, 1.560), (0.380, 0.060, 0.050), INTD, parent=g)
        return g
    chair("SeatDriver", 0.580)
    chair("SeatPassenger", -0.580)
    # 18-speed shifter + range splitter, pedals
    cyl("Shifter", (1.480, 0.200, 1.330), 0.016, 0.360, STEELD, rot=(0, math.radians(-12), 0),
        vertices=10, parent=grp)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.038,
                                         location=(1.445, 0.200, 1.520))
    knob = bpy.context.object; knob.name = "ShifterKnob"; knob.data.materials.append(INTD); knob.parent = grp
    box("ShifterBoot", (1.500, 0.200, 1.160), (0.160, 0.160, 0.070), RUBBER, parent=grp)
    for (nm, yy) in (("PedalBrake", 0.470), ("PedalThrottle", 0.660)):
        p = box(nm, (1.830, yy, 1.230), (0.040, 0.110, 0.160), STEELD, parent=grp)
        p.rotation_euler = (0, math.radians(35), 0)
    # sleeper: lower + upper bunk, curtain on a track, lockers, fridge
    box("BunkLower", (-0.420, 0, 1.470), (0.820, 1.950, 0.160), BUNKF, bevel=0.03, parent=grp)
    box("BunkBase", (-0.420, 0, 1.360), (0.820, 1.950, 0.080), INTD, parent=grp)
    box("BunkPillow", (-0.720, 0.350, 1.585), (0.300, 0.520, 0.090), PILLOW, bevel=0.03, parent=grp)
    box("BunkUpper", (-0.450, 0, 2.330), (0.760, 1.900, 0.090), BUNKF, bevel=0.02, parent=grp)
    # curtain: waved plane across the bunk front
    verts = []; faces = []
    NU, NV = 25, 6
    for j in range(NV):
        for i in range(NU):
            u = i / (NU - 1); v = j / (NV - 1)
            verts.append((0.060 + 0.045 * math.sin(u * math.pi * 9), -0.950 + 1.900 * u,
                          1.300 + 1.280 * v))
    for j in range(NV - 1):
        for i in range(NU - 1):
            a = j * NU + i; b = a + 1; c = a + NU + 1; d = a + NU
            faces.append((a, b, c, d))
    curtain = mesh_from_verts_faces("BunkCurtain", verts, faces, INTD)
    curtain.parent = grp
    cyl("CurtainTrack", (0.060, 0, 2.620), 0.012, 1.950, TITAN, rot=(math.pi / 2, 0, 0), parent=grp)
    for s in (1, -1):
        nm = 'L' if s > 0 else 'R'
        box(f"SleeperLocker_{nm}", (-0.620, s * 0.980, 2.000), (0.420, 0.340, 1.150), INTM, parent=grp)
    box("SleeperFridge", (-0.600, -0.550, 1.300), (0.400, 0.450, 0.340), INTM, parent=grp)
    box("SleeperTV", (-0.830, 0.550, 2.450), (0.030, 0.520, 0.320), SCREEN, parent=grp)
    return grp

# ---------------------------------------------------------------- markers
def build_markers(root):
    specs = [
        ("driver_seat", (1.300, 0.580, 1.550)),
        ("passenger_seat", (1.300, -0.580, 1.550)),
        ("driver_eye", (1.380, 0.580, 2.320)),
        ("sleeper_bunk_rest_point", (-0.420, 0.0, 1.700)),
        ("trailer_hitch_fifth_wheel", KINGPIN),
        ("fifth_wheel_kingpin", KINGPIN),
        ("headlight_left_projector", (4.330, 0.880, 0.980)),
        ("headlight_right_projector", (4.330, -0.880, 0.980)),
        ("winch_fairlead", (4.440, 0.0, 0.580)),
        ("appboy_dock", (1.620, 0.140, 1.940)),
        ("exhaust_smoke_L", (STACK_X - 0.160, STACK_LAT, 4.030)),
        ("exhaust_smoke_R", (STACK_X - 0.160, -STACK_LAT, 4.030)),
        ("gladhand_emergency", (-0.920, -0.220, 1.480)),
        ("gladhand_service", (-0.920, -0.100, 1.480)),
        ("electrical_7pin", (-0.920, 0.120, 1.480)),
    ]
    for (nm, loc) in specs:
        empty(nm, loc, parent=root)

MAT_NAME_OF = {"PAINT": "paint_cobalt", "PAINT2": "paint_slate",
               "CRIMSON": "crimson", "CHASSIS": "chassis_carc",
               "CHROME": "chrome", "ALU": "polished_alu", "STEEL": "wheel_steel",
               "STEELD": "steel_dark", "DIAMOND": "diamond_plate",
               "GLASS": "glass_tint", "TIREM": "tire", "RUBBER": "rubber",
               "DARKM": "recess", "INTM": "interior_abs", "INTD": "interior_dark",
               "SEATF": "seat_leather", "BUNKF": "bunk_fabric",
               "PILLOW": "bunk_pillow", "TITAN": "satin_titanium",
               "AMBER": "light_amber", "REDL": "light_red", "LENS": "lens_white",
               "SCREEN": "screen", "GAUGE": "gauge", "REDH": "hose_red",
               "BLUEH": "hose_blue", "LETTER": "lettering"}

def rebind_materials():
    """After a file load purges module-created datablocks, re-point the
    material globals at the copies saved inside the .blend. Uses plain
    name strings only — touching a stale Material raises ReferenceError."""
    g = globals()
    for gn, mn in MAT_NAME_OF.items():
        m = bpy.data.materials.get(mn)
        if m is None and mn in MAT_SPECS:
            m = principled(mn, **MAT_SPECS[mn])  # was purged unused: recreate
        if m is not None:
            g[gn] = m

# ---------------------------------------------------------------- main
def main():
    if STAGE == 1 or not os.path.exists(BLEND_OUT):
        # NOTE: no read_factory_settings — it would purge the materials
        # created at import. Just clear objects.
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        root = empty("NomadPrime", (0, 0, 0))
        build_wheels(root)
        build_chassis(root)
        build_tanks(root)
        build_stacks(root)
    else:
        bpy.ops.wm.open_mainfile(filepath=BLEND_OUT)
        rebind_materials()
        root = bpy.data.objects["NomadPrime"]
    if STAGE >= 2 and not bpy.data.objects.get("BodyShell"):
        grp, shell = build_body(root)
        build_glass(root, grp)
        build_front(root, grp)
    if STAGE >= 3 and not bpy.data.objects.get("FifthWheelPlate"):
        build_rear_deck(root)
    if STAGE >= 4:
        if not bpy.data.objects.get("Dash"):
            build_interior(root)
        if not bpy.data.objects.get("driver_seat"):
            build_markers(root)
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
        os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_apply=True,
                                  export_yup=True, export_extras=True)
        print(f"EXPORTED {GLB_OUT}")
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    print(f"STAGE {STAGE} DONE -> {BLEND_OUT}")

main()
