#!/usr/bin/env python3
"""
NOMAD — Stallion FX (S650 Mustang) authored in Blender Python.

ROUND 3 (render gate): the body is ONE unified loft whose cross-section
RING runs underbody -> sill -> lower bulge -> character line -> beltline
-> glass -> cantrail -> crown, so the greenhouse is part of the body
surface (glass faces are a material band of the same loft), never a
separate bubble. Every station carries its own width / crown / tuck:
narrow low nose -> fender swell -> DOOR TUCK -> REAR HAUNCH PEAK ->
tapered Kamm tail. Wheel wells are BOOLEAN-CUT into the loft and the
subsurf rounds the cut edge into the arch flare (no lip rings).

Real dimensions (S650): L 4794mm x W 1916mm x H 1381mm, wheelbase 2718mm.
Axes: X = length (nose +X), Y = width (driver's left +Y), Z = up.
Wheels are separate named objects (WheelFL/FR/RL/RR) for the game.

Usage:
  blender --background --python tools/build_mustang.py -- \
      --out ~/workspace/nomad/design-refs/proof-mustang \
      --glb /tmp/mustang-round3.glb
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


PAINT = principled('FXDeepBluePaint', srgb(0x1E4A7A), metallic=0.15,
                   roughness=0.30, coat=0.7, coat_rough=0.06)
GLASS = principled('TintedGlass', srgb(0x10181D), metallic=0.0,
                   roughness=0.08, alpha=0.86)
BLACK = principled('BlackTrim', srgb(0x0B0D0F), metallic=0.2, roughness=0.55)
DARKMETAL = principled('DarkMetal', srgb(0x2A2E33), metallic=0.85, roughness=0.38)
CHROME = principled('Chrome', srgb(0xC8CCD2), metallic=1.0, roughness=0.22)
RIMWHITE = principled('RallyWhite', srgb(0xE8E9EA), metallic=0.1, roughness=0.32)
RUBBER = principled('Rubber', srgb(0x17181A), metallic=0.0, roughness=0.95)
LENS_F = principled('HeadlightLens', srgb(0xBFD9E8), metallic=0.1, roughness=0.15,
                    emission=srgb(0x9FC8E8), emission_strength=0.55)
LENS_R = principled('TailLens', srgb(0x7A0E14), metallic=0.1, roughness=0.2,
                    emission=srgb(0xD21F26), emission_strength=0.8)
CABIN = principled('CabinDark', srgb(0x1B1E22), metallic=0.0, roughness=0.9)
CABIN2 = principled('CabinTrim', srgb(0x3A3F46), metallic=0.25, roughness=0.6)
SEAT = principled('SeatCloth', srgb(0x2E3138), metallic=0.0, roughness=0.95)
SEATIN = principled('SeatInsert', srgb(0x274B73), metallic=0.0, roughness=0.9)
SCREEN = principled('DashScreen', srgb(0x0A1420), metallic=0.2, roughness=0.25,
                    emission=srgb(0x1D4E6B), emission_strength=0.7)
ARCH = principled('ArchTub', srgb(0x0A0A0B), metallic=0.0, roughness=1.0)
CARPET = principled('Carpet', srgb(0x101114), metallic=0.0, roughness=1.0)


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


# ================================================================ BODY LOFT
# Unified ring loft. Each station:
#   (x, W, zSill, zLow, wLow, zChar, wChar, zBelt, wBelt,
#    zGlass, wGlass, zCant, wCant, zTop)
# widths w* are fractions of the station half-width W (absolute for
# belt/glass/cant where tumblehome matters). Ring (half, bottom->top):
#   0 (0, .06)  1 (.55W, .085)  2 (.90W, zSill)  3 (wLow*W, zLow)
#   4 (wChar*W, zChar)  5 (wBelt*W, zBelt)  6 (wGlass*W, zGlass)
#   7 (wCant*W, zCant)  8 (.45*wCant*W, zTop-.012)  9 (0, zTop)
# Glass bands (face strips between ring points): right 5,6 / left 12,11
# = side glass; 7,8,9,10 = windshield / backlight center band.
BODY_STATIONS = [
    # nose face — blunt, narrow, low crown (hood line stays FLAT per the
    # sheet: the nose barely drops, it is not a wedge)
    (2.397, 0.800, 0.28, 0.42, 0.97, 0.58, 0.99, 0.66, 0.93, 0.715, 0.80, 0.75, 0.55, 0.775),
    # hood leading edge
    (2.28, 0.885, 0.20, 0.40, 0.99, 0.60, 1.00, 0.70, 0.95, 0.755, 0.82, 0.775, 0.58, 0.795),
    # front fender rising
    (2.02, 0.928, 0.155, 0.42, 1.00, 0.63, 1.00, 0.735, 0.96, 0.785, 0.84, 0.80, 0.60, 0.812),
    (1.66, 0.947, 0.14, 0.44, 1.00, 0.66, 1.00, 0.76, 0.96, 0.80, 0.85, 0.815, 0.62, 0.828),
    # front axle — fender swell
    (1.359, 0.952, 0.135, 0.45, 1.00, 0.68, 1.00, 0.775, 0.965, 0.815, 0.85, 0.832, 0.63, 0.845),
    # door lead — TUCK begins (lower flank pulls in)
    (0.95, 0.946, 0.13, 0.46, 0.940, 0.70, 0.965, 0.80, 0.95, 0.83, 0.84, 0.85, 0.63, 0.862),
    # cowl / windshield base — deepest tuck
    (0.55, 0.944, 0.13, 0.47, 0.935, 0.71, 0.960, 0.815, 0.945, 0.845, 0.83, 0.868, 0.62, 0.885),
    # roof front (header) — cabin begins
    (0.05, 0.946, 0.13, 0.48, 0.95, 0.72, 0.98, 0.83, 0.86, 1.10, 0.80, 1.335, 0.75, 1.372),
    # roof peak / B-pillar
    (-0.45, 0.950, 0.13, 0.49, 0.955, 0.73, 0.985, 0.845, 0.855, 1.12, 0.795, 1.345, 0.745, 1.381),
    # roof rear — fastback starts
    (-0.90, 0.954, 0.13, 0.50, 0.97, 0.75, 0.99, 0.86, 0.85, 1.10, 0.79, 1.30, 0.74, 1.352),
    # rear axle — HAUNCH PEAK (max width, bulge low), deck above
    (-1.359, 0.964, 0.135, 0.52, 1.00, 0.79, 1.00, 0.90, 0.94, 0.935, 0.86, 0.958, 0.62, 0.975),
    (-1.75, 0.952, 0.14, 0.50, 0.995, 0.78, 1.00, 0.885, 0.945, 0.925, 0.85, 0.945, 0.60, 0.962),
    # taper to the Kamm tail
    (-2.10, 0.933, 0.16, 0.46, 0.98, 0.75, 0.99, 0.865, 0.94, 0.905, 0.83, 0.928, 0.58, 0.945),
    (-2.397, 0.898, 0.30, 0.44, 0.96, 0.70, 0.985, 0.83, 0.93, 0.875, 0.80, 0.905, 0.55, 0.925),
]
WINDSHIELD_SEG = 6    # station segment cowl -> roof front
ROOF_SEGS = (7, 8)    # cabin side-glass segments
BACKLIGHT_SEG = 9     # roof rear -> deck


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
        (0.45 * wCant * W, zTop - 0.012),
        (0.00, zTop),
    ]
    left = [(-y, z) for (y, z) in reversed(right[1:-1])]
    return right + left


def build_body():
    stations = [(st[0], body_ring(st)) for st in BODY_STATIONS]
    n = len(stations[0][1])
    verts = []
    for x, loop in stations:
        for (y, z) in loop:
            verts.append((x, y, z))
    faces = []
    S = len(stations)
    for s in range(S - 1):
        for i in range(n):
            a = s * n + i
            b = s * n + (i + 1) % n
            c = (s + 1) * n + (i + 1) % n
            d = (s + 1) * n + i
            faces.append((a, b, c, d))
    for s, flip in ((0, True), (S - 1, False)):
        loop = stations[s][1]
        cx = stations[s][0]
        cy = sum(p[0] for p in loop) / n
        cz = sum(p[1] for p in loop) / n
        ci = len(verts)
        verts.append((cx, cy, cz))
        for i in range(n):
            a = s * n + i
            b = s * n + (i + 1) % n
            faces.append((ci, b, a) if flip else (ci, a, b))
    mesh = bpy.data.meshes.new('Body')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('Body', mesh)
    link(obj)
    mesh.materials.append(PAINT)
    mesh.materials.append(GLASS)
    mesh.materials.append(BLACK)
    # material bands: face index = s * n + i for loft faces (caps after).
    # Segment indices shift +1 for the nose guard station. Center glass
    # is ONLY the crown strip {8,9} — bands 7/10 are the pillar frame,
    # so the windshield reads framed, not wraparound.
    SIDE_GLASS = {5, 6, 11, 12}
    CENTER_GLASS = {6, 7, 8, 9, 10, 11}
    PILLAR = {5, 12}
    for s in range(S - 1):
        for i in range(n):
            fi = s * n + i
            if s == WINDSHIELD_SEG:
                # glass over the crown bands; the belt->glass slope faces
                # are PAINT (the A-pillar sail is bodywork — as black trim
                # it rendered as a huge gray wedge, diagnostic-verified)
                mesh.polygons[fi].material_index = 1 if i in CENTER_GLASS else 0
            elif s in ROOF_SEGS:
                mesh.polygons[fi].material_index = 1 if i in SIDE_GLASS else 0
            elif s == BACKLIGHT_SEG:
                mesh.polygons[fi].material_index = 1 if i in CENTER_GLASS else 0
    for poly in mesh.polygons:
        poly.use_smooth = True
    # CREASES — the difference between a car and a balloon. The end-ring
    # loops crease at 1.0 so the subsurf holds the nose/tail FACES as
    # planes (a fan cap alone always melts into a bullet); the
    # longitudinal feature lines (character, belt, fender shoulder) take
    # partial creases so the flanks have edges to catch light on.
    if 'crease_edge' not in mesh.attributes:
        mesh.attributes.new('crease_edge', 'FLOAT', 'EDGE')
    cattr = mesh.attributes['crease_edge']
    ncreased = 0
    for e in mesh.edges:
        va, vb = e.vertices[0], e.vertices[1]
        if va >= S * n or vb >= S * n:
            continue  # cap centers: leave the fan soft
        sa, sb, ia, ib = va // n, vb // n, va % n, vb % n
        val = 0.0
        if sa == sb and (abs(ia - ib) == 1 or abs(ia - ib) == n - 1):
            if sa == 0 or sa == S - 1:
                val = 1.0  # end face perimeters: hard
        elif ia == ib and abs(sa - sb) == 1:
            val = {4: 0.65, 5: 0.50, 7: 0.35, 3: 0.25}.get(ia, 0.0)
        if val:
            cattr.data[e.index].value = val
            ncreased += 1
    print('CREASED EDGES', ncreased)
    # wheel wells: boolean-cut, then subsurf rounds the arch edge
    for (wx, wz) in ((1.359, 0.345), (-1.359, 0.345)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.40, depth=2.30,
                                            location=(wx, 0, wz),
                                            rotation=(math.pi / 2, 0, 0),
                                            vertices=36)
        cut = bpy.context.object
        cut.name = 'ArchCut'
        mod = obj.modifiers.new('arch', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = cut
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier='arch')
        bpy.data.objects.remove(cut, do_unlink=True)
    sub = obj.modifiers.new('smooth', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 2
    return obj


build_body()

# ================================================================ SEATED DETAILS
# Every surface detail is placed by RAYCAST against the evaluated body:
# the subsurfed surface never sits exactly on the station planes, so
# parts are seated on the REAL surface (measured, not guessed) — the
# floating/swallowed-detail disease dies here.
_DEPS = bpy.context.evaluated_depsgraph_get()
_BODY = bpy.data.objects['Body']


def surf(origin, direction):
    hit, loc, _n, _i, _o, _m = bpy.context.scene.ray_cast(
        _DEPS, Vector(origin), Vector(direction))
    return loc if hit else None


def cast_x(y, z, sign):
    """Surface point on the nose (sign=+1) or tail (sign=-1) at (y, z)."""
    p = surf((sign * 3.4, y, z), (-sign, 0, 0))
    return p.x if p else sign * 2.36


def cast_z(x, y):
    p = surf((x, y, 2.4), (0, 0, -1))
    return p.z if p else 0.9


def cast_y(x, z, side):
    p = surf((x, side * 2.4, z), (0, -side, 0))
    return p.y if p else side * 0.93


# glass sunroof inset in the painted roof (FX sheet), seated on the crown
_sz = cast_z(-0.42, 0)
box('Sunroof', (-0.42, 0, _sz - 0.002), (0.85, 0.74, 0.012), GLASS, rot=(0, 0.05, 0), bevel=0.01)
# shark-fin antenna on the roof's rear edge
_az = cast_z(-0.80, 0)
box('AntennaFin', (-0.80, 0, _az + 0.010), (0.13, 0.026, 0.045), PAINT, rot=(0, -0.25, 0), bevel=0.01)
# B-pillar strips on the side glass
for side in (1, -1):
    _by = cast_y(-0.50, 1.10, side)
    box('BPillar', (-0.50, _by + side * 0.004, 1.10), (0.07, 0.018, 0.44), BLACK,
        rot=(side * -0.20, 0, 0))

# ---------------------------------------------------------------- face
_gx = cast_x(0, 0.52, 1)
box('Grille', (_gx - 0.012, 0, 0.52), (0.06, 1.04, 0.32), BLACK, bevel=0.03)
box('GrilleRecess', (_gx + 0.012, 0, 0.52), (0.02, 0.92, 0.26), ARCH, bevel=0.01)
box('GrilleBar', (_gx + 0.026, 0, 0.53), (0.015, 0.88, 0.045), DARKMETAL)
box('GrilleBadge', (_gx + 0.031, 0, 0.53), (0.02, 0.15, 0.06), CHROME, bevel=0.005)
_ix = cast_x(0, 0.30, 1)
box('LowerIntake', (_ix - 0.020, 0, 0.30), (0.05, 1.28, 0.13), BLACK, bevel=0.02)
box('FrontSplitter', (_gx - 0.06, 0, 0.155), (0.20, 1.54, 0.04), BLACK, bevel=0.01)
for side in (1, -1):
    _hx = cast_x(side * 0.60, 0.685, 1)
    box('HeadlightHousing', (_hx - 0.065, side * 0.60, 0.685), (0.15, 0.29, 0.09), BLACK,
        rot=(0, -0.10, 0), bevel=0.02)
    box('HeadlightLens', (_hx + 0.008, side * 0.60, 0.692), (0.02, 0.23, 0.06), LENS_F,
        rot=(0, -0.10, 0), bevel=0.008)
    for k in range(3):
        box('DRLBar', (_hx + 0.016, side * (0.535 + k * 0.065), 0.696), (0.018, 0.04, 0.05),
            LENS_F, rot=(0, -0.10, 0), bevel=0.004)
    _fx = cast_x(side * 0.44, 0.545, 1)
    box('DRLFang', (_fx + 0.002, side * 0.44, 0.545), (0.025, 0.05, 0.24), LENS_F,
        rot=(0, 0.08, 0), bevel=0.008)
    _cx = cast_x(side * 0.70, 0.33, 1)
    box('CornerIntake', (_cx - 0.030, side * 0.70, 0.33), (0.13, 0.24, 0.20), BLACK, bevel=0.02)
# hood vent seated on the crowned hood
_vz = cast_z(1.50, 0)
box('HoodVent', (1.50, 0, _vz + 0.000), (0.55, 0.48, 0.022), BLACK, rot=(0, 0.018, 0), bevel=0.01)
for i in range(3):
    box('HoodVentSlat', (1.395 + i * 0.11, 0, _vz + 0.013), (0.05, 0.42, 0.012), DARKMETAL,
        rot=(0, 0.018, 0))

# ---------------------------------------------------------------- tail
_tx = cast_x(0, 0.79, -1)
box('TailPanel', (_tx + 0.012, 0, 0.79), (0.05, 1.58, 0.20), BLACK, bevel=0.02)
_lz = cast_z(-2.28, 0)
box('DecklidLip', (-2.28, 0, _lz + 0.004), (0.17, 1.44, 0.03), PAINT, rot=(0, -0.12, 0), bevel=0.01)
for side in (1, -1):
    _txs = cast_x(side * 0.52, 0.79, -1)
    box('TailHousing', (_txs - 0.008, side * 0.52, 0.79), (0.04, 0.52, 0.165), ARCH, bevel=0.01)
    for i in range(3):
        box('TailLens', (_txs - 0.026, side * (0.375 + i * 0.145), 0.795), (0.025, 0.085, 0.13),
            LENS_R, bevel=0.008)
_dx = cast_x(0, 0.26, -1)
box('Diffuser', (_dx + 0.03, 0, 0.26), (0.20, 1.50, 0.14), BLACK, bevel=0.02)
for fy in (0.24, -0.24, 0.55, -0.55):
    box('DiffuserFin', (_dx - 0.03, fy, 0.245), (0.10, 0.02, 0.13), BLACK)
for side in (1, -1):
    for j in range(2):
        ey = side * (0.58 + j * 0.15)
        cyl('ExhaustTip', (_tx - 0.05, ey, 0.26), 0.034, 0.12, CHROME,
            rot=(0, math.pi / 2, 0), vertices=16)
        cyl('ExhaustBore', (_tx - 0.105, ey, 0.26), 0.025, 0.02, ARCH,
            rot=(0, math.pi / 2, 0), vertices=12)
# pedestal rear wing: bases seated on the deck surface by raycast
_wz0 = cast_z(-2.08, 0)
for side in (1, -1):
    _wz = cast_z(-2.08, side * 0.44)
    box('WingBase', (-2.08, side * 0.44, _wz + 0.004), (0.17, 0.20, 0.015), BLACK)
    box('WingUpright', (-2.08, side * 0.44, _wz + 0.060), (0.09, 0.13, 0.11), BLACK)
box('RearWing', (-2.11, 0, _wz0 + 0.128), (0.26, 1.36, 0.032), PAINT, rot=(0, 0.10, 0), bevel=0.01)
for side in (1, -1):
    box('WingEndplate', (-2.11, side * 0.685, _wz0 + 0.120), (0.24, 0.015, 0.07), BLACK, rot=(0, 0.10, 0))
# rocker skirts + small side details, all seated by side raycast
for side in (1, -1):
    _ry = cast_y(0.05, 0.165, side)
    box('RockerSkirt', (0.05, _ry + side * 0.006, 0.165), (2.10, 0.035, 0.075), BLACK, bevel=0.01)
    _my = cast_y(0.44, 1.00, side)
    box('MirrorStalk', (0.44, _my + side * 0.03, 1.00), (0.05, 0.10, 0.03), BLACK)
    box('Mirror', (0.42, _my + side * 0.085, 1.04), (0.13, 0.06, 0.09), BLACK, bevel=0.02)
    _hy = cast_y(-0.25, 0.79, side)
    box('DoorHandle', (-0.25, _hy + side * 0.003, 0.79), (0.16, 0.012, 0.03), BLACK)
    _by2 = cast_y(1.02, 0.685, side)
    box('FenderBadge', (1.02, _by2 + side * 0.003, 0.685), (0.11, 0.012, 0.045), CHROME, bevel=0.004)
    _sy = cast_y(1.98, 0.42, side)
    box('SideMarker', (1.98, _sy + side * 0.004, 0.42), (0.03, 0.02, 0.06), LENS_R)
_fy = cast_y(-1.80, 0.845, -1)
box('FuelDoor', (-1.80, _fy - 0.003, 0.845), (0.15, 0.012, 0.15), PAINT, bevel=0.02)

# ================================================================ WHEEL TUBS
# dark discs recessed inside the boolean-cut wells — reads as well depth
for (wx, wy) in [(1.359, 0.78), (1.359, -0.78), (-1.359, 0.78), (-1.359, -0.78)]:
    cyl('ArchTub', (wx, wy, 0.345), 0.408, 0.30, ARCH, rot=(math.pi / 2, 0, 0), vertices=32)

# ================================================================ INTERIOR
box('CabinFloor', (0, 0, 0.295), (3.30, 1.44, 0.07), CARPET)
box('Dash', (0.58, 0, 0.875), (0.32, 1.38, 0.13), CABIN, rot=(0, -0.18, 0), bevel=0.03)
box('DashPad', (0.565, 0, 0.945), (0.30, 1.36, 0.035), CABIN2, rot=(0, -0.18, 0), bevel=0.015)
box('DashTrim', (0.435, 0, 0.885), (0.02, 1.30, 0.028), DARKMETAL, rot=(0, -0.18, 0))
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


def seat(name, x, y):
    box(name + 'Base', (x, y, 0.47), (0.52, 0.54, 0.13), SEAT, bevel=0.04)
    box(name + 'BaseInsert', (x, y, 0.545), (0.42, 0.36, 0.02), SEATIN, bevel=0.01)
    box(name + 'Back', (x - 0.30, y, 0.78), (0.14, 0.54, 0.62), SEAT, rot=(0, 0.22, 0), bevel=0.05)
    box(name + 'BackInsert', (x - 0.225, y, 0.80), (0.03, 0.34, 0.44), SEATIN, rot=(0, 0.22, 0), bevel=0.01)
    box(name + 'Headrest', (x - 0.40, y, 1.09), (0.11, 0.30, 0.16), SEAT, bevel=0.04)
    for s2 in (1, -1):
        box(name + 'Bolster', (x - 0.29, y + s2 * 0.245, 0.80), (0.15, 0.085, 0.52), SEAT,
            rot=(0, 0.22, 0), bevel=0.035)


seat('SeatL', -0.15, 0.38)
seat('SeatR', -0.15, -0.38)
box('BenchBase', (-1.12, 0, 0.47), (0.45, 1.30, 0.13), SEAT, bevel=0.04)
box('BenchInsert', (-1.12, 0, 0.545), (0.36, 1.05, 0.02), SEATIN, bevel=0.01)
box('BenchBack', (-1.38, 0, 0.76), (0.13, 1.30, 0.55), SEAT, rot=(0, 0.25, 0), bevel=0.05)

# ================================================================ WHEELS
# Built at origin with LOCAL coordinates, group placed once — the face
# sits flush on the outer side; dark hole discs read as the rally holes.
def build_wheel(name, width, outer):
    g = bpy.data.objects.new(name, None)
    link(g)
    parts = []
    tire = cyl('Tire', (0, 0, 0), 0.345, width, RUBBER, rot=(math.pi / 2, 0, 0), vertices=36)
    parts.append(tire)
    for s in (1, -1):
        ring = torus('TireShoulder', (0, s * (width / 2 - 0.012), 0), 0.298, 0.048, RUBBER,
                     rot=(math.pi / 2, 0, 0), major_seg=28, minor_seg=10)
        parts.append(ring)
    barrel = cyl('RimBarrel', (0, 0, 0), 0.235, width - 0.04, DARKMETAL,
                 rot=(math.pi / 2, 0, 0), vertices=28)
    parts.append(barrel)
    face = cyl('RimFace', (0, outer * (width / 2 - 0.012), 0), 0.232, 0.024, RIMWHITE,
               rot=(math.pi / 2, 0, 0), vertices=28)
    parts.append(face)
    for i in range(12):
        a = (i / 12) * math.pi * 2
        hole = cyl('RimHole', (math.cos(a) * 0.158, outer * (width / 2 - 0.012),
                              math.sin(a) * 0.158), 0.034, 0.028, ARCH,
                   rot=(math.pi / 2, 0, 0), vertices=14)
        parts.append(hole)
    hub = cyl('Hub', (0, outer * (width / 2 - 0.010), 0), 0.062, 0.028, DARKMETAL,
              rot=(math.pi / 2, 0, 0), vertices=16)
    parts.append(hub)
    disc = cyl('BrakeDisc', (0, outer * (width / 2 - 0.05), 0), 0.185, 0.018, DARKMETAL,
               rot=(math.pi / 2, 0, 0), vertices=24)
    parts.append(disc)
    for p in parts:
        p.parent = g
    return g


WHEEL_POS = [
    ('WheelFL', 1.359, 0.80, 0.275, 1),
    ('WheelFR', 1.359, -0.80, 0.275, -1),
    ('WheelRL', -1.359, 0.795, 0.305, 1),
    ('WheelRR', -1.359, -0.795, 0.305, -1),
]
for (name, wx, wy, ww, outer) in WHEEL_POS:
    g = build_wheel(name, ww, outer)
    g.location = (wx, wy, 0.345)

# ================================================================ STUDIO + RENDERS
world = bpy.data.worlds.new('Studio')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.028, 0.032, 0.038, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.05

floor = box('StudioFloor', (0, 0, -0.012), (40, 40, 0.02),
            principled('FloorMat', srgb(0x14181D), roughness=0.95))
CAR.objects.unlink(floor)  # studio only — never exported with the car


def area_light(name, loc, energy, size, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy
    ld.shape = 'RECTANGLE'
    ld.size = size
    ld.size_y = size * 0.55
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    ob.location = loc
    return ob


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


key = area_light('Key', (4.5, -5.5, 6.5), 1600, 6.0)
look_at(key, (0, 0, 0.5))
rim = area_light('Rim', (-6.0, 4.5, 4.0), 1900, 5.0, color=(0.75, 0.9, 1.0))
look_at(rim, (0, 0, 0.6))
fill = area_light('Fill', (-3.0, -6.0, 2.5), 550, 7.0)
look_at(fill, (0, 0, 0.5))
top = area_light('Top', (0.5, 0.5, 7.5), 900, 5.0)
look_at(top, (0, 0, 0))

# Cycles only (EEVEE needs libEGL, which does not survive this VM's
# rootfs resets). Iteration checks drop samples/resolution via
# RENDER_SAMPLES / RENDER_SCALE; the gate set uses the defaults.
scene.render.engine = 'CYCLES'
scene.cycles.samples = int(os.environ.get('RENDER_SAMPLES', '64'))
scene.cycles.use_denoising = True
_scale = float(os.environ.get('RENDER_SCALE', '1.0'))
scene.render.resolution_x = int(1152 * _scale)
scene.render.resolution_y = int(832 * _scale)
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Filmic'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = 0.55

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
    # interior proof: camera INSIDE the cabin, rear-seat POV to the dash —
    # no hidden panels, the cabin proves itself through its own glass line
    ('07_interior', (-0.28, 0.38, 1.20), (1.40, 0.30, 0.82), 24),
]
only = os.environ.get('SHOTS_ONLY', '')
for (name, loc, tgt, lens) in SHOTS:
    if only and name not in only.split(','):
        continue
    if name == '07_interior':
        # interior proof: tint dropped + a soft cabin fill so the finish
        # materials read (the 0.86 tint + enclosed cabin render as murk
        # in a sun studio; exterior shots keep the full tint)
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
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, 'mustang.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in CAR.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['Body']
bpy.ops.export_scene.gltf(filepath=args.glb, export_format='GLB',
                          use_selection=True, export_apply=True,
                          export_yup=True)
print('EXPORTED', args.glb)
