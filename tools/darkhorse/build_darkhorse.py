#!/usr/bin/env python3
"""
NOMAD — Mustang Dark Horse (S650) authored in Blender Python.

Ian's order (2026-10-21): "remade the dark horse once again until it
looks like the images i dropped." References:
  design-refs/media-generation-mustang-darkhorse-model-0-*.webp
    (front-3/4 studio render: Blue Ember-dark paint, honeycomb grille,
     carbon hood extractor, aero-disc dark wheels, big pedestal wing)
  design-refs/stallion/05-fx-package-2026-blue-sheet.png (family shape)

Method (v2, after the v1 loft was gate-killed as a 'jettson elipse'):
the side profile was TRACED from the FX sheet's side view (landmarks
anchored on the wheelbase; see tools/darkhorse/trace_side.json) and the
shell is built as separate PANEL BANDS between the section rails — no
subsurf, no cross-panel smoothing; every rail line is a hard seam,
each band solidified + bevel-edged like a stamped panel. Roof = flat
panel run, windshield = one collinear plane, backlight = one long
shallow run to a short deck. Details remain RAYCAST-SEATED (against a
hidden joined proxy of the bands). NOTE: image-to-3D generation does
not exist in this environment (media pipeline is image/video only;
the reference JSON is an image-gen snapshot record, no mesh) — the
traced-panel route is the sanctioned fallback from the brief.

Dark Horse deltas vs the FX car: Blue Ember paint, honeycomb grille
texture, raised CARBON hood extractor + hood pins, larger splitter with
corner flicks, matte pedestal rear wing (endplates + Gurney lip),
extended side skirts, dark AERO wheels, DARK HORSE fender badges,
Recaro-style interior (integrated headrests, harness slots).

Real dimensions (S650 Dark Horse): L 4794mm x W 1916mm x H 1381mm,
wheelbase 2718mm. Axes: X = length (nose +X), Y = width, Z = up.
Wheels are separate named objects (WheelFL/FR/RL/RR) for the game.

Usage:
  blender --background --python tools/darkhorse/build_darkhorse.py -- \
      --out ~/workspace/nomad/design-refs/proof-darkhorse \
      --glb ~/workspace/nomad/public/darkhorse.glb
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

# ---------------------------------------------------------------- args
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--glb', required=True)
args = ap.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

CAR = bpy.data.collections.new('Car')
scene.collection.children.link(CAR)


def link(obj):
    CAR.objects.link(obj)
    return obj


def srgb(hexv):
    """0xRRGGBB -> linear RGB tuple."""
    r = ((hexv >> 16) & 0xFF) / 255.0
    g = ((hexv >> 8) & 0xFF) / 255.0
    b = (hexv & 0xFF) / 255.0

    def f(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


# ---------------------------------------------------------------- materials
def principled(name, color, metallic=0.0, roughness=0.5, alpha=1.0,
               coat=0.0, coat_rough=0.1, emission=None, emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Alpha'].default_value = alpha
    if coat > 0:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = coat_rough
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = emission
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    if alpha < 1.0:
        m.surface_render_method = 'DITHERED'
    return m


# Blue Ember — the Dark Horse launch color: desaturated deep steel blue
PAINT = principled('BlueEmberPaint', srgb(0x152539), metallic=0.25,
                   roughness=0.30, coat=0.8, coat_rough=0.05)
GLASS = principled('TintedGlass', srgb(0x0A0F12), metallic=0.0,
                   roughness=0.34, alpha=0.96)
GLASS.node_tree.nodes['Principled BSDF'].inputs[
    'Specular IOR Level'].default_value = 0.10
BLACK = principled('BlackTrim', srgb(0x0B0D0F), metallic=0.2, roughness=0.55)
CARBON = principled('CarbonFiber', srgb(0x0F1113), metallic=0.35, roughness=0.42)
DARKMETAL = principled('DarkMetal', srgb(0x2A2E33), metallic=0.85, roughness=0.38)
WHEELDARK = principled('WheelDark', srgb(0x141518), metallic=0.55, roughness=0.42)
SPOKE = principled('WheelSpoke', srgb(0x3D4149), metallic=0.2, roughness=0.40)
STEEL = principled('BrakeSteel', srgb(0x767B80), metallic=0.25, roughness=0.48)
RIMLIP = principled('RimLip', srgb(0x7E858C), metallic=1.0, roughness=0.30)
CALIPER = principled('BrakeCaliper', srgb(0x5E1220), metallic=0.2, roughness=0.5)
CHROME = principled('Chrome', srgb(0xC8CCD2), metallic=1.0, roughness=0.22)
RUBBER = principled('Rubber', srgb(0x0D0D0F), metallic=0.0, roughness=0.95)
LENS_F = principled('HeadlightLens', srgb(0x54626E), metallic=0.1, roughness=0.15,
                    emission=srgb(0x9FC8E8), emission_strength=0.35)
LENS_R = principled('TailLens', srgb(0x7A0E14), metallic=0.1, roughness=0.2,
                    emission=srgb(0xD21F26), emission_strength=0.8)
LENSDARK = principled('SmokedLens', srgb(0x11161A), metallic=0.3, roughness=0.25)
AMBER = principled('SideMarker', srgb(0x8A4A08), metallic=0.1, roughness=0.3,
                   emission=srgb(0xC46A12), emission_strength=0.5)
CABIN = principled('CabinDark', srgb(0x17191D), metallic=0.0, roughness=0.9)
CABIN2 = principled('CabinTrim', srgb(0x22252A), metallic=0.25, roughness=0.6)
SEAT = principled('SeatCloth', srgb(0x181A1E), metallic=0.0, roughness=0.95)
SEATIN = principled('SeatInsert', srgb(0x1E4A73), metallic=0.0, roughness=0.9)
SCREEN = principled('DashScreen', srgb(0x0A1420), metallic=0.2, roughness=0.25,
                    emission=srgb(0x14384E), emission_strength=0.30)
ARCH = principled('ArchTub', srgb(0x0A0A0B), metallic=0.0, roughness=1.0)
CARPET = principled('Carpet', srgb(0x0E0F11), metallic=0.0, roughness=1.0)


def honeycomb_material():
    """Procedural honeycomb grille texture — kills the black-box face.
    Pointy-top hex lattice via cube-coordinate rounding; cell value is
    the normalized hex distance (1.0 at the web, 0 at the center)."""
    S = 256
    img = bpy.data.images.new('Honeycomb', S, S, alpha=False)
    px = [0.0] * (S * S * 4)
    R = 13.0                       # hex circumradius, px
    SQ3 = math.sqrt(3.0)

    def hexfield(x, y):
        q = (SQ3 / 3.0 * x - y / 3.0) / R
        r = (2.0 / 3.0 * y) / R
        s = -q - r
        rq, rr, rs = round(q), round(r), round(s)
        dq, dr, ds = abs(rq - q), abs(rr - r), abs(rs - s)
        if dq > dr and dq > ds:
            rq = -rr - rs
        elif dr > ds:
            rr = -rq - rs
        cx = SQ3 * R * (rq + rr / 2.0)
        cy = 1.5 * R * rr
        lx, ly = (x - cx) / R, (y - cy) / R
        return max(abs(lx), abs(0.5 * lx + 0.866 * ly),
                   abs(-0.5 * lx + 0.866 * ly)) / 0.866

    for y in range(S):
        for x in range(S):
            d = hexfield(x, y)
            v = 0.16 if d > 0.80 else 0.015    # web vs cell
            i = (y * S + x) * 4
            px[i] = px[i + 1] = px[i + 2] = v
            px[i + 3] = 1.0
    img.pixels = px
    img.update()
    m = bpy.data.materials.new('Honeycomb')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'REPEAT'
    bsdf.inputs['Metallic'].default_value = 0.25
    bsdf.inputs['Roughness'].default_value = 0.55
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


HONEY = honeycomb_material()


# ---------------------------------------------------------------- helpers
def box(name, loc, size, material, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(obj)
    if material:
        obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new('bev', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return obj


def cyl(name, loc, radius, depth, material, rot=(0, 0, 0), vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth,
                                        location=loc, rotation=rot,
                                        vertices=vertices)
    obj = bpy.context.object
    obj.name = name
    link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def torus(name, loc, major, minor, material, rot=(0, 0, 0), major_seg=32, minor_seg=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=major_seg, minor_segments=minor_seg,
                                     location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def text_plate(name, text, loc, size, material, rot=(0, 0, 0), axis_angle=None):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.size = size
    obj.data.extrude = 0.0015
    obj.data.align_x = 'CENTER'
    obj.data.align_y = 'CENTER'
    if axis_angle is not None:
        obj.rotation_mode = 'AXIS_ANGLE'
        obj.rotation_axis_angle = axis_angle
    link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    if material:
        obj.data.materials.append(material)
    return obj


# ================================================================ BODY PANELS (v2)
# Traced panel construction (replaces the v1 smooth loft, killed at the
# gate: six loft rounds read as one continuous curve — 'jettson elipse').
# Method: the side profile was traced from the S650 reference sheet
# (tools/darkhorse/trace_side.json — wheel-anchored landmark trace), and
# the shell is built as SEPARATE panel bands between the section's rail
# points: no subsurf, no cross-panel smoothing, every rail line is a
# hard seam between two meshes, each band solidified (stamped-panel
# thickness) with a small bevel so seams catch a highlight. The roof is
# a flat panel run (header -> peak -> roof rear at near-constant zTop),
# the windshield is one straight plane (collinear cowl/mid/header), the
# backlight is a long shallow run to a short flat deck, the beltline
# rises over the rear haunch (traced), and the haunch station carries
# the widest section. Station tuple (unchanged field order):
#   (x, W, zSill, zLow, wLow, zChar, wChar, zBelt, wBelt,
#    zGlass, wGlass, zCant, wCant, zTop)
# Ring (half, bottom->top): 0 (0,.06) 1 (.55W,.085) 2 (.90W,zSill)
#   3 (wLow*W,zLow) 4 (wChar*W,zChar) 5 (wBelt*W,zBelt)
#   6 (wGlass*W,zGlass) 7 (wCant*W,zCant) 8 (.62*wCant*W,zTop-.002)
#   9 (0,zTop)
BODY_STATIONS = [
    # nose face
    (2.397, 0.830, 0.28, 0.42, 0.97, 0.60, 0.99, 0.70, 0.93, 0.745, 0.80, 0.775, 0.55, 0.815),
    # hood leading edge
    (2.28, 0.885, 0.20, 0.40, 0.99, 0.62, 1.00, 0.75, 0.95, 0.78, 0.82, 0.805, 0.58, 0.832),
    # front fender rising
    (2.02, 0.928, 0.155, 0.42, 1.00, 0.65, 1.00, 0.775, 0.96, 0.815, 0.84, 0.835, 0.60, 0.86),
    (1.66, 0.947, 0.14, 0.44, 1.00, 0.68, 1.00, 0.80, 0.96, 0.83, 0.85, 0.845, 0.62, 0.875),
    # front axle — fender swell
    (1.359, 0.952, 0.135, 0.45, 1.00, 0.70, 1.00, 0.81, 0.965, 0.845, 0.85, 0.86, 0.63, 0.885),
    # door lead
    (0.95, 0.940, 0.13, 0.46, 0.940, 0.73, 0.965, 0.85, 0.95, 0.88, 0.84, 0.90, 0.63, 0.90),
    # cowl / windshield base
    (0.72, 0.944, 0.13, 0.47, 0.935, 0.74, 0.960, 0.875, 0.945, 0.90, 0.83, 0.915, 0.62, 0.93),
    # mid-windshield — ON the cowl->header plane (collinear, no kink)
    (0.36, 0.945, 0.13, 0.475, 0.937, 0.745, 0.962, 0.88, 0.945, 1.03, 0.81, 1.13, 0.66, 1.157),
    # roof front (header) — traced: header sits at x ~ 0
    (0.02, 0.946, 0.13, 0.48, 0.95, 0.75, 0.98, 0.885, 0.86, 1.155, 0.78, 1.345, 0.73, 1.372),
    # roof peak — flat run begins
    (-0.40, 0.950, 0.13, 0.49, 0.955, 0.76, 0.985, 0.92, 0.855, 1.145, 0.775, 1.35, 0.725, 1.381),
    # roof rear — flat run ends, backlight starts (traced long roof)
    (-1.05, 0.954, 0.13, 0.50, 0.97, 0.77, 0.99, 0.97, 0.85, 1.115, 0.77, 1.24, 0.72, 1.350),
    # rear axle — HAUNCH PEAK (widest section); top here is backlight glass
    (-1.359, 0.970, 0.135, 0.54, 1.00, 0.79, 1.00, 0.99, 0.94, 1.10, 0.80, 1.06, 0.66, 1.175),
    # backlight low
    (-1.45, 0.958, 0.132, 0.51, 0.98, 0.77, 0.995, 0.93, 0.85, 1.02, 0.79, 0.99, 0.70, 1.10),
    # deck front — glass ends, short flat decklid begins
    (-1.70, 0.952, 0.14, 0.50, 0.995, 0.78, 1.00, 0.885, 0.945, 0.94, 0.85, 0.955, 0.60, 1.00),
    # deck rear
    (-2.10, 0.933, 0.16, 0.46, 0.98, 0.75, 0.99, 0.865, 0.94, 0.915, 0.83, 0.935, 0.58, 0.97),
    # Kamm tail
    (-2.397, 0.898, 0.30, 0.44, 0.96, 0.70, 0.985, 0.83, 0.93, 0.885, 0.80, 0.915, 0.55, 0.94),
]
WINDSHIELD_SEGS = (6, 7)      # cowl -> mid -> header
ROOF_SEGS = (8, 9)            # header -> peak -> roof rear (side glass)
BACKLIGHT_SEGS = (10, 11, 12)  # roof rear -> axle -> low -> deck front


def body_ring(st):
    (x, W, zSill, zLow, wLow, zChar, wChar, zBelt, wBelt,
     zGlass, wGlass, zCant, wCant, zTop) = st
    right = [
        (0.00, 0.06),
        (0.55 * W, 0.085),
        (0.90 * W, zSill),
        (wLow * W, zLow),
        (wChar * W, zChar),
        (wBelt * W, zBelt),
        (wGlass * W, zGlass),
        (wCant * W, zCant),
        (0.62 * wCant * W, zTop - 0.008),
        (0.00, zTop),
    ]
    left = [(-y, z) for (y, z) in reversed(right[1:-1])]
    return right + left


def uncap(obj, depth):
    """Strip a capped cylinder's end discs (local +-Z faces). Defined
    here because the wheel tubs (below) run before the wheels section;
    the wheels section carries an identical def."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    kill = [f for f in bm.faces
            if abs(f.normal.z) > 0.9
            and abs(f.calc_center_median().z) > depth / 2 - 0.002]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def _outward_faces(verts, quads):
    """Order each quad so its normal points away from the section core."""
    fixed = []
    for (a, b, c, d) in quads:
        va, vb, vc, vd = (Vector(verts[i]) for i in (a, b, c, d))
        n = (vb - va).cross(vd - va)
        centre = (va + vb + vc + vd) / 4
        radial = Vector((0.0, centre.y, centre.z - 0.52))
        fixed.append((a, b, c, d) if n.dot(radial) >= 0 else (a, d, c, b))
    return fixed


def build_panels():
    stations = [(st[0], body_ring(st)) for st in BODY_STATIONS]
    S = len(stations)

    def glass_for(pair, seg):
        if seg in WINDSHIELD_SEGS:
            return pair in (7, 8)
        if seg in BACKLIGHT_SEGS:
            # wide at the roof, tapering to the centre strip at the deck
            return pair in (7, 8) if seg in BACKLIGHT_SEGS[:2] else pair == 8
        if seg in ROOF_SEGS:
            # window + quarter window; painted cantrail strip above
            return pair == 5
        return False

    band_objs = []
    for a in range(9):
        for side in (1, -1):
            if side == 1:
                ia, ib = a, a + 1
            else:
                ia, ib = (18 - a) % 18, 17 - a
            verts, quads = [], []
            for s in range(S):
                x, loop = stations[s]
                for idx in (ia, ib):
                    y, z = loop[idx]
                    verts.append((x, y, z))
            for s in range(S - 1):
                quads.append((s * 2, s * 2 + 1, s * 2 + 3, s * 2 + 2))
            faces = _outward_faces(verts, quads)
            mesh = bpy.data.meshes.new('Band%d_%s' % (a, 'R' if side == 1 else 'L'))
            mesh.from_pydata(verts, [], faces)
            mesh.update()
            mesh.materials.append(PAINT)
            mesh.materials.append(GLASS)
            for s in range(S - 1):
                if glass_for(a, s):
                    mesh.polygons[s].material_index = 1
            for poly in mesh.polygons:
                poly.use_smooth = True
            obj = bpy.data.objects.new(mesh.name, mesh)
            link(obj)
            # stamped-panel thickness, then arch cuts on the low bands
            sol = obj.modifiers.new('panel', 'SOLIDIFY')
            sol.thickness = 0.012
            sol.offset = -0.5
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier='panel')
            if a in (1, 2, 3):
                for (wx, wz) in ((1.359, 0.345), (-1.359, 0.345)):
                    bpy.ops.mesh.primitive_cylinder_add(
                        radius=0.365, depth=2.30, location=(wx, 0, wz),
                        rotation=(math.pi / 2, 0, 0), vertices=36)
                    cut = bpy.context.object
                    cut.name = 'ArchCut'
                    mod = obj.modifiers.new('arch', 'BOOLEAN')
                    mod.operation = 'DIFFERENCE'
                    mod.solver = 'EXACT'
                    mod.object = cut
                    bpy.context.view_layer.objects.active = obj
                    bpy.ops.object.modifier_apply(modifier='arch')
                    bpy.data.objects.remove(cut, do_unlink=True)
            bev = obj.modifiers.new('edge', 'BEVEL')
            bev.width = 0.003
            bev.segments = 1
            bev.limit_method = 'ANGLE'
            band_objs.append(obj)

    # nose / tail caps (flat fans across the end rings)
    cap_objs = []
    for s_idx, sign in ((0, 1), (S - 1, -1)):
        x, loop = stations[s_idx]
        n = len(loop)
        centre = (x, sum(p[0] for p in loop) / n, sum(p[1] for p in loop) / n)
        verts = [(x, y, z) for (y, z) in loop] + [centre]
        quads = [(n, i, (i + 1) % n) for i in range(n)]
        fixed = []
        for (a, b, c) in quads:
            va, vb, vc = (Vector(verts[i]) for i in (a, b, c))
            nrm = (vb - va).cross(vc - va)
            fixed.append((a, b, c) if nrm.x * sign >= 0 else (a, c, b))
        mesh = bpy.data.meshes.new('CapF' if sign == 1 else 'CapR')
        mesh.from_pydata(verts, [], fixed)
        mesh.update()
        mesh.materials.append(PAINT)
        obj = bpy.data.objects.new(mesh.name, mesh)
        link(obj)
        cap_objs.append(obj)

    # invisible joined proxy named 'Body': the raycast/seating target for
    # the details section (scene ray_cast ignores hide_render), kept OUT
    # of the Car collection so it never exports or double-renders.
    dups = []
    for o in band_objs + cap_objs:
        d = o.copy()
        d.data = o.data.copy()
        d.modifiers.clear()
        bpy.context.scene.collection.objects.link(d)
        dups.append(d)
    bpy.ops.object.select_all(action='DESELECT')
    for d in dups:
        d.select_set(True)
    bpy.context.view_layer.objects.active = dups[0]
    bpy.ops.object.join()
    proxy = dups[0]
    proxy.name = 'Body'
    proxy.data.name = 'BodyProxy'
    proxy.hide_render = True
    return band_objs


build_panels()

# ================================================================ SEATED DETAILS
_DEPS = bpy.context.evaluated_depsgraph_get()
_BODY = bpy.data.objects['Body']


def surf(origin, direction):
    hit, loc, _n, _i, _o, _m = bpy.context.scene.ray_cast(
        _DEPS, Vector(origin), Vector(direction))
    return loc if hit else None


def cast_x(y, z, sign):
    p = surf((sign * 3.4, y, z), (-sign, 0, 0))
    return p.x if p else sign * 2.36


def cast_z(x, y):
    p = surf((x, y, 2.4), (0, 0, -1))
    return p.z if p else 0.9


def cast_y(x, z, side):
    p = surf((x, side * 2.4, z), (0, -side, 0))
    return p.y if p else side * 0.93


# shark-fin antenna (paint), B-pillar strips
_az = cast_z(-0.80, 0)
box('AntennaFin', (-0.80, 0, _az + 0.010), (0.13, 0.026, 0.045), PAINT, rot=(0, -0.25, 0), bevel=0.01)

# ---------------------------------------------------------------- face
# Dark Horse fascia: honeycomb grille (textured, not a black slab),
# body-color mid band, deep lower intake, big corner intakes, splitter.
_gx = cast_x(0, 0.535, 1)
box('GrilleSurround', (_gx - 0.030, 0, 0.535), (0.07, 1.20, 0.35), BLACK, bevel=0.03)
box('GrilleMesh', (_gx - 0.006, 0, 0.535), (0.03, 1.14, 0.30), HONEY, bevel=0.01)
box('GrilleBadge', (_gx + 0.014, 0, 0.535), (0.02, 0.17, 0.065), CHROME, bevel=0.005)
_ix = cast_x(0, 0.30, 1)
box('LowerIntakeFrame', (_ix - 0.034, 0, 0.30), (0.06, 1.32, 0.14), BLACK, bevel=0.02)
box('LowerIntakeMesh', (_ix - 0.008, 0, 0.30), (0.03, 1.26, 0.115), HONEY, bevel=0.01)
box('FrontSplitter', (_gx - 0.075, 0, 0.148), (0.26, 1.60, 0.035), CARBON, bevel=0.01)
for side in (1, -1):
    _hx = cast_x(side * 0.565, 0.70, 1)
    box('HeadlightHousing', (_hx - 0.095, side * 0.565, 0.70), (0.19, 0.35, 0.105), BLACK,
        rot=(0, -0.12, 0), bevel=0.02)
    box('HeadlightLens', (_hx - 0.008, side * 0.565, 0.703), (0.02, 0.31, 0.085), LENSDARK,
        rot=(0, -0.12, 0), bevel=0.008)
    for k in range(3):
        box('DRLBar', (_hx + 0.000, side * (0.462 + k * 0.103), 0.707), (0.016, 0.055, 0.028),
            LENS_F, rot=(0, -0.12, 0), bevel=0.004)
    _cx = cast_x(side * 0.72, 0.33, 1)
    box('CornerIntake', (_cx - 0.045, side * 0.72, 0.33), (0.12, 0.20, 0.16), HONEY, bevel=0.02)
    # splitter corner flick (aero wingtip at the splitter end)
    box('SplitterFlick', (_gx - 0.055, side * 0.79, 0.185), (0.20, 0.03, 0.09), CARBON,
        rot=(0, 0, side * 0.35), bevel=0.008)
    _mx = cast_x(side * 0.795, 0.46, 1)
    box('SideMarker', (_mx + 0.004, side * 0.795, 0.46), (0.02, 0.015, 0.05), AMBER)
# raised CARBON hood extractor (the Dark Horse signature) + hood pins
_vz = cast_z(1.52, 0)
box('HoodVentBase', (1.52, 0, _vz + 0.002), (0.62, 0.52, 0.022), CARBON, rot=(0, 0.018, 0), bevel=0.008)
for i in range(4):
    box('HoodVentSlat', (1.375 + i * 0.105, 0, _vz + 0.014), (0.055, 0.44, 0.010), BLACK,
        rot=(0, 0.018, 0))
for sy in (0.33, -0.33):
    _pz = cast_z(2.02, sy)
    cyl('HoodPin', (2.02, sy, _pz + 0.006), 0.021, 0.012, DARKMETAL, vertices=14)

# ---------------------------------------------------------------- tail
_tx = cast_x(0, 0.80, -1)
box('TailPanel', (_tx + 0.012, 0, 0.80), (0.05, 1.58, 0.20), BLACK, bevel=0.02)
for side in (1, -1):
    _txs = cast_x(side * 0.52, 0.80, -1)
    box('TailHousing', (_txs - 0.008, side * 0.52, 0.80), (0.04, 0.52, 0.165), ARCH, bevel=0.01)
    for i in range(3):
        box('TailLens', (_txs - 0.026, side * (0.375 + i * 0.145), 0.805), (0.025, 0.085, 0.13),
            LENS_R, bevel=0.008)
_dx = cast_x(0, 0.26, -1)
box('Diffuser', (_dx + 0.03, 0, 0.26), (0.22, 1.52, 0.15), CARBON, bevel=0.02)
for fy in (0.24, -0.24, 0.55, -0.55):
    box('DiffuserFin', (_dx - 0.03, fy, 0.245), (0.10, 0.02, 0.13), CARBON)
for side in (1, -1):
    for j in range(2):
        ey = side * (0.58 + j * 0.15)
        cyl('ExhaustTip', (_tx - 0.04, ey, 0.28), 0.036, 0.10, DARKMETAL,
            rot=(0, math.pi / 2, 0), vertices=16)
        cyl('ExhaustBore', (_tx - 0.085, ey, 0.28), 0.027, 0.02, ARCH,
            rot=(0, math.pi / 2, 0), vertices=12)
# BIG matte pedestal wing (Dark Horse track pack): black uprights, wide
# chord, endplates, Gurney lip — the reference car's loudest feature
_wz0 = cast_z(-2.10, 0)
for side in (1, -1):
    _wz = cast_z(-2.10, side * 0.42)
    box('WingBase', (-2.10, side * 0.42, _wz + 0.004), (0.18, 0.22, 0.015), BLACK)
    box('WingUpright', (-2.13, side * 0.42, _wz + 0.10), (0.16, 0.055, 0.20), BLACK, rot=(0, 0.10, 0), bevel=0.006)
box('RearWing', (-2.14, 0, _wz0 + 0.215), (0.31, 1.44, 0.030), BLACK, rot=(0, 0.13, 0), bevel=0.01)
box('WingGurney', (-2.285, 0, _wz0 + 0.235), (0.035, 1.44, 0.028), BLACK, rot=(0, 0.13, 0))
for side in (1, -1):
    box('WingEndplate', (-2.14, side * 0.725, _wz0 + 0.205), (0.30, 0.014, 0.085), BLACK, rot=(0, 0.13, 0))
# extended matte side skirts + flank details
for side in (1, -1):
    _ry = cast_y(0.05, 0.155, side)
    box('SideSkirt', (0.05, _ry + side * 0.012, 0.155), (2.16, 0.05, 0.105), BLACK, bevel=0.01)
    _my = cast_y(0.60, 1.02, side)
    box('MirrorStalk', (0.60, _my + side * 0.03, 1.02), (0.05, 0.10, 0.03), BLACK)
    box('Mirror', (0.58, _my + side * 0.085, 1.06), (0.13, 0.06, 0.09), PAINT, bevel=0.02)
    _hy = cast_y(-0.25, 0.80, side)
    box('DoorHandle', (-0.25, _hy + side * 0.003, 0.80), (0.16, 0.012, 0.03), BLACK)
    _by2 = cast_y(1.06, 0.70, side)
    if side < 0:
        # Euler Rx(+90): text reads +X (nose), up +Z, faces -Y
        text_plate('FenderBadge', 'DARK HORSE', (1.06, _by2 + side * 0.006, 0.70), 0.030,
                   DARKMETAL, rot=(math.pi / 2, 0, 0))
    else:
        # 180 deg about the (0,1,1) diagonal: reads nose-ward, faces +Y
        text_plate('FenderBadge', 'DARK HORSE', (1.06, _by2 + side * 0.006, 0.70), 0.030,
                   DARKMETAL, axis_angle=(math.pi, 0.0, 0.70711, 0.70711))
_fy = cast_y(-1.80, 0.855, -1)
box('FuelDoor', (-1.80, _fy - 0.003, 0.855), (0.15, 0.012, 0.15), PAINT, bevel=0.02)

# ================================================================ WHEEL TUBS
for (wx, wy) in [(1.359, 0.78), (1.359, -0.78), (-1.359, 0.78), (-1.359, -0.78)]:
    _tub = cyl('ArchTub', (wx, wy, 0.345), 0.408, 0.30, ARCH,
               rot=(math.pi / 2, 0, 0), vertices=32)
    uncap(_tub, 0.30)  # OPEN shell: the v1 capped tub hid the wheels


# ================================================================ INTERIOR
box('CabinFloor', (0, 0, 0.295), (3.30, 1.44, 0.07), CARPET)
box('Dash', (0.58, 0, 0.875), (0.32, 1.38, 0.13), CABIN, rot=(0, -0.18, 0), bevel=0.03)
box('DashPad', (0.565, 0, 0.945), (0.30, 1.36, 0.035), CABIN2, rot=(0, -0.18, 0), bevel=0.015)
box('DashTrim', (0.435, 0, 0.885), (0.02, 1.30, 0.028), CARBON, rot=(0, -0.18, 0))
box('DashScreen', (0.46, -0.05, 0.97), (0.03, 0.36, 0.16), SCREEN, rot=(0, -0.35, 0))
box('ClusterBrow', (0.53, 0.38, 0.955), (0.30, 0.44, 0.05), CABIN, rot=(0, -0.18, 0), bevel=0.02)
box('ClusterScreen', (0.405, 0.38, 0.925), (0.02, 0.32, 0.11), SCREEN, rot=(0, -0.35, 0))
for side in (1, -1):
    box('DoorCard', (-0.12, side * 0.68, 0.70), (1.20, 0.04, 0.44), CABIN, bevel=0.02)
    box('DoorArmrest', (-0.10, side * 0.645, 0.66), (0.62, 0.07, 0.06), CABIN2, bevel=0.02)
    cyl('DoorSpeaker', (0.28, side * 0.655, 0.52), 0.075, 0.02, DARKMETAL,
        rot=(math.pi / 2, 0, 0), vertices=20)
box('Console', (-0.02, 0, 0.52), (0.85, 0.30, 0.17), CABIN, bevel=0.03)
box('ConsoleTrim', (-0.02, 0, 0.615), (0.80, 0.20, 0.015), CABIN2, bevel=0.005)
cyl('Shifter', (0.06, 0, 0.66), 0.022, 0.12, DARKMETAL, vertices=10)
torus('SteeringWheel', (0.36, 0.38, 0.97), 0.185, 0.021, CABIN, rot=(0, math.pi / 2 - 0.35, 0))
box('SteeringHub', (0.365, 0.38, 0.97), (0.05, 0.13, 0.09), CABIN2, rot=(0, -0.35, 0))
box('SteeringSpokeH', (0.358, 0.38, 0.965), (0.02, 0.30, 0.035), DARKMETAL, rot=(0.35, 0, 0))
box('SteeringSpokeV', (0.358, 0.38, 0.965), (0.02, 0.035, 0.30), DARKMETAL, rot=(0.35, 0, 0))
cyl('SteeringColumn', (0.46, 0.38, 0.93), 0.025, 0.22, DARKMETAL, rot=(0, math.pi / 2 - 0.35, 0), vertices=10)


def recaro(name, x, y):
    """Dark Horse Recaro: one-piece back with integrated headrest,
    deep bolsters, harness slots, blue insert."""
    box(name + 'Base', (x, y, 0.47), (0.52, 0.56, 0.13), SEAT, bevel=0.04)
    box(name + 'BaseInsert', (x, y, 0.545), (0.42, 0.36, 0.02), SEATIN, bevel=0.01)
    box(name + 'Back', (x - 0.315, y, 0.86), (0.15, 0.56, 0.86), SEAT, rot=(0, 0.20, 0), bevel=0.05)
    box(name + 'BackInsert', (x - 0.235, y, 0.84), (0.03, 0.34, 0.58), SEATIN, rot=(0, 0.20, 0), bevel=0.01)
    for s2 in (1, -1):
        box(name + 'Bolster', (x - 0.30, y + s2 * 0.26, 0.86), (0.16, 0.09, 0.66), SEAT,
            rot=(0, 0.20, 0), bevel=0.035)
        box(name + 'BaseBolster', (x + 0.02, y + s2 * 0.26, 0.50), (0.44, 0.08, 0.10), SEAT,
            bevel=0.03)
    # harness slots through the headrest
    for s2 in (1, -1):
        box(name + 'HarnessSlot', (x - 0.375, y + s2 * 0.11, 1.155), (0.06, 0.07, 0.10), ARCH,
            rot=(0, 0.20, 0))


recaro('SeatL', -0.15, 0.38)
recaro('SeatR', -0.15, -0.38)
box('BenchBase', (-1.12, 0, 0.47), (0.45, 1.30, 0.13), SEAT, bevel=0.04)
box('BenchInsert', (-1.12, 0, 0.545), (0.36, 1.05, 0.02), SEATIN, bevel=0.01)
box('BenchBack', (-1.38, 0, 0.76), (0.13, 1.30, 0.55), SEAT, rot=(0, 0.25, 0), bevel=0.05)

# ================================================================ WHEELS
# Dark AERO wheels per the reference render: near-solid dark face with a
# machined ring groove, five short vents, visible brake disc + caliper.
# (The r3 failure was a WHITE disc with black holes = cheese grater;
# dark-on-dark reads as the aero wheel it is.)
def uncap(obj, depth):
    """Strip a capped cylinder's end discs (local +-Z faces) so wheels
    are open tubes — a capped barrel/tire reads as a solid disc."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    kill = [f for f in bm.faces
            if abs(f.normal.z) > 0.9
            and abs(f.calc_center_median().z) > depth / 2 - 0.002]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def build_wheel(name, width, outer):
    g = bpy.data.objects.new(name, None)
    link(g)
    parts = []
    tire = cyl('Tire', (0, 0, 0), 0.340, width, RUBBER, rot=(math.pi / 2, 0, 0), vertices=40)
    uncap(tire, width)
    parts.append(tire)
    for s in (1, -1):
        ring = torus('TireShoulder', (0, s * (width / 2 - 0.012), 0), 0.296, 0.042, RUBBER,
                     rot=(math.pi / 2, 0, 0), major_seg=32, minor_seg=10)
        parts.append(ring)
    barrel = cyl('RimBarrel', (0, 0, 0), 0.238, width - 0.03, WHEELDARK,
                 rot=(math.pi / 2, 0, 0), vertices=32)
    uncap(barrel, width - 0.03)
    parts.append(barrel)
    disc = cyl('BrakeDisc', (0, outer * (width / 2 - 0.072), 0), 0.185, 0.018, STEEL,
               rot=(math.pi / 2, 0, 0), vertices=28)
    parts.append(disc)
    cal = box('BrakeCaliper', (0.10, outer * (width / 2 - 0.070), 0.10), (0.09, 0.03, 0.13),
              CALIPER, bevel=0.008)
    parts.append(cal)
    # --- split-5 SPOKE face: recessed spokes, proud lip, brakes behind.
    # (Gate rule: dark discs are an automatic fail — the Dark Horse wears
    # dark multi-spokes with real depth.) ---
    lip = torus('RimLip', (0, outer * (width / 2 - 0.004), 0), 0.238, 0.014,
                RIMLIP, rot=(math.pi / 2, 0, 0), major_seg=36, minor_seg=8)
    parts.append(lip)
    seat = outer * (width / 2 - 0.046)          # spoke plane, ~50 mm recessed
    tie = torus('SpokeTie', (0, seat, 0), 0.196, 0.011, WHEELDARK,
                rot=(math.pi / 2, 0, 0), major_seg=36, minor_seg=8)
    parts.append(tie)
    for i in range(5):
        a0 = (i / 5) * math.pi * 2 + math.pi / 2
        for da in (-0.17, 0.17):                # split pair
            a = a0 + da
            sp = box('Spoke', (math.cos(a) * 0.130, seat, math.sin(a) * 0.130),
                     (0.156, 0.034, 0.036), SPOKE, rot=(0, -a, 0),
                     bevel=0.005)
            parts.append(sp)
    hub = cyl('Hub', (0, seat + outer * 0.004, 0), 0.058, 0.034, WHEELDARK,
              rot=(math.pi / 2, 0, 0), vertices=20)
    parts.append(hub)
    cap = cyl('CenterCap', (0, seat + outer * 0.024, 0), 0.030, 0.012, DARKMETAL,
              rot=(math.pi / 2, 0, 0), vertices=16)
    parts.append(cap)
    for p in parts:
        p.parent = g
    return g


WHEEL_POS = [
    ('WheelFL', 1.359, 0.795, 0.265, 1),
    ('WheelFR', 1.359, -0.795, 0.265, -1),
    ('WheelRL', -1.359, 0.79, 0.295, 1),
    ('WheelRR', -1.359, -0.79, 0.295, -1),
]
for (name, wx, wy, ww, outer) in WHEEL_POS:
    g = build_wheel(name, ww, outer)
    g.location = (wx, wy, 0.340)

# ================================================================ STUDIO + RENDERS
world = bpy.data.worlds.new('Studio')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.028, 0.032, 0.038, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.05

floor = box('StudioFloor', (0, 0, -0.012), (40, 40, 0.02),
            principled('FloorMat', srgb(0x14181D), roughness=0.95))
CAR.objects.unlink(floor)  # studio only — never exported with the car


def area_light(name, loc, energy, size, size_y=None, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy
    ld.shape = 'RECTANGLE'
    ld.size = size
    ld.size_y = size_y if size_y is not None else size * 0.55
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    ob.location = loc
    return ob


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


key = area_light('Key', (4.5, -5.5, 6.5), 1500, 7.0, 0.9)
look_at(key, (0, 0, 0.5))
rim = area_light('Rim', (-6.0, 4.5, 4.0), 1700, 6.0, 0.8, color=(0.75, 0.9, 1.0))
look_at(rim, (0, 0, 0.6))
fill = area_light('Fill', (-3.0, -6.0, 2.5), 380, 7.0)
look_at(fill, (0, 0, 0.5))
top = area_light('Top', (0.5, 0.5, 7.5), 600, 6.5, 0.7)
look_at(top, (0, 0, 0))

scene.render.engine = 'CYCLES'
scene.cycles.samples = int(os.environ.get('RENDER_SAMPLES', '64'))
scene.cycles.use_denoising = True
_scale = float(os.environ.get('RENDER_SCALE', '1.0'))
scene.render.resolution_x = int(1152 * _scale)
scene.render.resolution_y = int(832 * _scale)
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Filmic'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = 0.45

cam_data = bpy.data.cameras.new('Cam')
cam_data.lens = 42
cam = bpy.data.objects.new('Cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

SHOTS = [
    ('01_front34', (5.6, -4.9, 1.55), (0, 0, 0.55), 42),
    ('02_rear34', (-5.7, -4.7, 1.75), (0, 0, 0.55), 42),
    ('03_side', (0, -8.2, 0.72), (0, 0, 0.55), 42),
    ('04_front', (7.8, 0, 0.80), (0, 0, 0.58), 42),
    ('05_rear', (-7.8, 0, 0.95), (0, 0, 0.60), 42),
    ('06_top', (0.6, -0.9, 9.4), (0.2, 0, 0.3), 50),
    ('07_interior', (-0.28, 0.38, 1.20), (1.40, 0.30, 0.82), 24),
]
only = os.environ.get('SHOTS_ONLY', '')
for (name, loc, tgt, lens) in SHOTS:
    if only and name not in only.split(','):
        continue
    if name == '07_interior':
        _bsdf = GLASS.node_tree.nodes['Principled BSDF']
        _bsdf.inputs['Alpha'].default_value = 0.25
        _fl = bpy.data.lights.new('CabinFill', 'POINT')
        _fl.energy = 9
        _fl.color = (1.0, 0.96, 0.90)
        _fo = bpy.data.objects.new('CabinFill', _fl)
        _fo.location = (-0.35, 0, 1.22)
        link(_fo)
    cam.location = loc
    cam_data.lens = lens
    look_at(cam, tgt)
    scene.render.filepath = os.path.join(args.out, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', name)

# ================================================================ EXPORT
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, 'darkhorse.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in CAR.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['Body']
bpy.ops.export_scene.gltf(filepath=args.glb, export_format='GLB',
                          use_selection=True, export_apply=True,
                          export_yup=True)
print('EXPORTED', args.glb)
