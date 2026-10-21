#!/usr/bin/env python3
"""
NOMAD — Stallion FX (S650 Mustang) authored in Blender Python.

Real dimensions (S650): L 4794mm x W 1916mm x H 1381mm, wheelbase 2718mm.
Axes: X = length (nose +X), Y = width (driver's left +Y), Z = up.
The body is a true loft: cross-sections at real stations, subdivision
smoothed. Glasshouse is a separate loft (FX glass roof). Wheels are
separate named objects (WheelFL/FR/RL/RR) so the game can spin/steer
them. Head/tail lights are seated geometry in housings — no fake glow.

Usage:
  blender --background --python tools/build_mustang.py -- \
      --out ~/workspace/nomad/design-refs/proof-mustang \
      --glb ~/workspace/nomad/public/mustang.glb
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
                   roughness=0.05, alpha=0.70)
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
SEAT = principled('SeatCloth', srgb(0x2E3138), metallic=0.0, roughness=0.95)
SCREEN = principled('DashScreen', srgb(0x0A1420), metallic=0.2, roughness=0.25,
                    emission=srgb(0x1D4E6B), emission_strength=0.7)
ARCH = principled('ArchTub', srgb(0x0A0A0B), metallic=0.0, roughness=1.0)


# ---------------------------------------------------------------- helpers
def loft(name, stations, material, subsurf=1, cap=True):
    """stations: list of (x, [(y, z), ...]) — same count per station,
    ordered around the loop. Builds a smooth lofted shell."""
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
    if cap:
        # end caps as fans around each end loop's centroid
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
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    link(obj)
    if material:
        mesh.materials.append(material)
    if subsurf:
        mod = obj.modifiers.new('smooth', 'SUBSURF')
        mod.levels = subsurf
        mod.render_levels = subsurf + 1
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


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
# Station params: (x, halfW, sillY, shoulderY, topY) — front (nose) to rear.
BODY_STATIONS = [
    # v3 (render-gate round 2): profile matched to the FX sheet — SHORT
    # UPRIGHT nose (tall face, high flat hood), fender swell over the
    # front axle, a real HAUNCH over the rear axle, short deck, ducktail.
    (2.40, 0.830, 0.30, 0.55, 0.76),
    (2.32, 0.885, 0.22, 0.60, 0.79),
    (2.10, 0.930, 0.16, 0.66, 0.81),
    (1.70, 0.950, 0.14, 0.69, 0.83),
    (1.36, 0.968, 0.13, 0.71, 0.845),
    (0.85, 0.955, 0.12, 0.72, 0.855),
    (0.30, 0.952, 0.12, 0.74, 0.875),
    (-0.45, 0.955, 0.12, 0.76, 0.90),
    (-1.10, 0.968, 0.12, 0.815, 0.945),
    (-1.45, 0.972, 0.13, 0.825, 0.96),
    (-1.95, 0.955, 0.15, 0.78, 0.965),
    (-2.30, 0.925, 0.24, 0.75, 0.965),
    (-2.40, 0.900, 0.33, 0.74, 0.955),
]


def body_loop(halfW, sill, shoulder, top):
    right = [
        (0.00, sill),
        (0.55 * halfW, sill + 0.005),
        (0.88 * halfW, sill + 0.10),
        (1.00 * halfW, shoulder),
        (0.99 * halfW, top - 0.05),
        (0.72 * halfW, top - 0.005),
        (0.35 * halfW, top + 0.012),
        (0.00, top + 0.02),
    ]
    left = [(-y, z) for (y, z) in reversed(right[1:-1])]
    return right + left


body_stations = [(x, body_loop(w, s, sh, t)) for (x, w, s, sh, t) in BODY_STATIONS]
loft('Body', body_stations, PAINT, subsurf=1)

# ================================================================ GLASSHOUSE
# (x, halfW, baseY, sideY, topY) windshield base -> backlight bottom.
GLASS_STATIONS = [
    # v4 (blue sheet 05): cabin sits ~0.24 further aft — the Mustang's
    # long dash-to-axle. Flatter fuller canopy, long straight fastback.
    (0.68, 0.775, 0.845, 0.97, 1.00),
    (0.30, 0.762, 0.855, 1.17, 1.27),
    (-0.20, 0.748, 0.865, 1.265, 1.360),
    (-0.70, 0.755, 0.875, 1.275, 1.382),
    (-1.18, 0.782, 0.885, 1.20, 1.29),
    (-1.62, 0.820, 0.900, 1.06, 1.10),
    (-1.88, 0.845, 0.915, 0.99, 1.00),
]


def glass_loop(halfW, base, side, top):
    right = [
        (0.00, top),
        (0.45 * halfW, top - 0.015),
        (0.85 * halfW, side + 0.10),
        (1.00 * halfW, side),
        (0.95 * halfW, base),
    ]
    left = [(-y, z) for (y, z) in reversed(right[:-1])]
    return right + left


glass_stations = [(x, glass_loop(w, b, s, t)) for (x, w, b, s, t) in GLASS_STATIONS]
# black SEAL loft a hair larger than the glass: reads as the framed,
# sealed edge around every pane — no floating-sheet gaps at the pillars
seal_stations = [(x, glass_loop(w + 0.014, b - 0.012, s + 0.006, t + 0.005))
                 for (x, w, b, s, t) in GLASS_STATIONS]
loft('GlassSeal', seal_stations, BLACK, subsurf=1, cap=False)
loft('Glasshouse', glass_stations, GLASS, subsurf=1, cap=False)
# A-pillars: dark framed members running the windshield edges, sealing
# glass to body (side-view slope: base front-low, top rear-high)
def _pillar_loop(cy, cz):
    return [(cy - 0.023, cz - 0.045), (cy + 0.023, cz - 0.045),
            (cy + 0.023, cz + 0.045), (cy - 0.023, cz + 0.045)]


for side in (1, -1):
    loft('APillar', [
        (0.68, _pillar_loop(side * 0.745, 0.97)),
        (0.24, _pillar_loop(side * 0.545, 1.235)),
    ], BLACK, subsurf=0)

# paint roof panel over the glass (FX: painted roof + glass sunroof inset)
ROOF_STATIONS = [
    (0.08, 0.720, 1.352),
    (-0.40, 0.730, 1.376),
    (-0.75, 0.730, 1.384),
    (-1.05, 0.715, 1.338),
]


def roof_loop(halfW, top):
    return [(0.0, top), (0.6 * halfW, top - 0.010), (halfW, top - 0.078),
            (-halfW, top - 0.078), (-0.6 * halfW, top - 0.010)]


loft('RoofPanel', [(x, roof_loop(w, t)) for (x, w, t) in ROOF_STATIONS], PAINT, subsurf=1, cap=False)
# glass sunroof inset in the painted roof frame (FX sheet)
box('Sunroof', (-0.50, 0, 1.381), (0.95, 0.80, 0.012), GLASS, bevel=0.01)
# shark-fin antenna — sits ON the roof panel's rear edge, not in the glass
box('AntennaFin', (-1.00, 0, 1.344), (0.14, 0.028, 0.06), PAINT, rot=(0, -0.30, 0), bevel=0.01)
# B-pillar strips on the glass sides
for side in (1, -1):
    box('BPillar', (-0.46, side * 0.752, 1.17), (0.07, 0.015, 0.34), BLACK, rot=(0, 0.06, 0))

# ================================================================ FACE / TAIL
# v3: identity assemblies, seated in the upright front clip / tail —
# grille OPENING (frame + recess + bar + pony), slim headlight units,
# the sheet's vertical DRL FANGS inboard of them, wide lower intake.
box('Grille', (2.405, 0, 0.50), (0.05, 1.18, 0.34), BLACK, bevel=0.03)
box('GrilleRecess', (2.432, 0, 0.50), (0.02, 1.04, 0.27), ARCH, bevel=0.01)
box('GrilleBar', (2.445, 0, 0.52), (0.015, 0.98, 0.045), DARKMETAL)
box('GrilleBadge', (2.45, 0, 0.52), (0.02, 0.15, 0.06), CHROME, bevel=0.005)
box('LowerIntake', (2.40, 0, 0.295), (0.05, 1.32, 0.13), BLACK, bevel=0.02)
box('FrontSplitter', (2.38, 0, 0.155), (0.30, 1.56, 0.04), BLACK, bevel=0.01)
for side in (1, -1):
    # slim headlight unit: housing seated in the clip corner + full lens
    box('HeadlightHousing', (2.395, side * 0.685, 0.70), (0.09, 0.36, 0.13), BLACK,
        rot=(0, 0, side * -0.10), bevel=0.02)
    box('HeadlightLens', (2.445, side * 0.685, 0.707), (0.02, 0.28, 0.075), LENS_F,
        rot=(0, 0, side * -0.10), bevel=0.008)
    # DRL fang: the tall slim blade inboard of the unit (FX signature)
    box('DRLFang', (2.425, side * 0.465, 0.585), (0.025, 0.055, 0.30), LENS_F,
        rot=(0, 0.10, 0), bevel=0.008)
    # corner intake under the unit
    box('CornerIntake', (2.36, side * 0.74, 0.33), (0.14, 0.26, 0.22), BLACK, bevel=0.02)
# hood vent (FX signature) — raised black louver panel, front half of hood
box('HoodVent', (1.55, 0, 0.849), (0.55, 0.48, 0.025), BLACK, rot=(0, 0.03, 0), bevel=0.01)
for i in range(3):
    box('HoodVentSlat', (1.44 + i * 0.11, 0, 0.866), (0.05, 0.42, 0.012), DARKMETAL,
        rot=(0, 0.03, 0))
# tail: ONE black panel spanning the tail, tri-bar HOUSINGS with real
# lens bars, decklid lip, finned diffuser, QUAD tips with dark bores
box('TailPanel', (-2.415, 0, 0.815), (0.05, 1.66, 0.21), BLACK, bevel=0.02)
box('DecklidLip', (-2.395, 0, 0.958), (0.09, 1.50, 0.04), PAINT, rot=(0, 0.15, 0), bevel=0.01)
for side in (1, -1):
    box('TailHousing', (-2.435, side * 0.55, 0.815), (0.04, 0.54, 0.17), ARCH, bevel=0.01)
    for i in range(3):
        box('TailLens', (-2.46, side * (0.395 + i * 0.15), 0.82), (0.025, 0.088, 0.135),
            LENS_R, bevel=0.008)
box('Diffuser', (-2.36, 0, 0.26), (0.20, 1.52, 0.14), BLACK, bevel=0.02)
for fy in (0.24, -0.24, 0.55, -0.55):
    box('DiffuserFin', (-2.42, fy, 0.245), (0.10, 0.02, 0.13), BLACK)
for side in (1, -1):
    for j in range(2):
        ey = side * (0.60 + j * 0.155)
        cyl('ExhaustTip', (-2.45, ey, 0.26), 0.034, 0.12, CHROME,
            rot=(0, math.pi / 2, 0), vertices=16)
        cyl('ExhaustBore', (-2.505, ey, 0.26), 0.025, 0.02, ARCH,
            rot=(0, math.pi / 2, 0), vertices=12)
# pedestal rear wing (FX sheet): uprights LAND on the decklid (base
# plates on the surface), blade low over the trailing edge
for side in (1, -1):
    box('WingBase', (-2.10, side * 0.44, 0.962), (0.16, 0.20, 0.015), BLACK)
    box('WingUpright', (-2.10, side * 0.44, 1.03), (0.09, 0.13, 0.15), BLACK)
box('RearWing', (-2.13, 0, 1.115), (0.26, 1.36, 0.032), PAINT, rot=(0, 0.10, 0), bevel=0.01)
for side in (1, -1):
    box('WingEndplate', (-2.13, side * 0.685, 1.10), (0.24, 0.015, 0.09), BLACK, rot=(0, 0.10, 0))
# rocker skirts
for side in (1, -1):
    box('RockerSkirt', (0.05, side * 0.925, 0.175), (2.15, 0.045, 0.08), BLACK, bevel=0.01)
    # mirrors: stalk + housing at the A-pillars
    box('MirrorStalk', (0.58, side * 0.815, 1.02), (0.05, 0.10, 0.03), BLACK)
    box('Mirror', (0.56, side * 0.90, 1.06), (0.13, 0.07, 0.09), BLACK, bevel=0.02)
    # door handle + fuel door (right rear quarter)
    box('DoorHandle', (-0.18, side * 0.962, 0.80), (0.16, 0.012, 0.03), BLACK)
    # fender badge (the sheet's 5.0 callout position)
    box('FenderBadge', (1.02, side * 0.963, 0.70), (0.11, 0.012, 0.045), CHROME, bevel=0.004)
    # side marker
    box('SideMarker', (1.98, side * 0.935, 0.42), (0.03, 0.02, 0.06), LENS_R)
box('FuelDoor', (-1.78, -0.927, 0.86), (0.15, 0.012, 0.15), PAINT, bevel=0.02)

# ================================================================ WHEEL ARCHES
for (wx, side) in [(1.359, 1), (1.359, -1), (-1.359, 1), (-1.359, -1)]:
    # dark tub disc behind the wheel
    cyl('ArchTub', (wx, side * 0.845, 0.345), 0.40, 0.06, ARCH, rot=(math.pi / 2, 0, 0), vertices=28)
    # arch lip: half-torus hugging the opening
    t = torus('ArchLip', (wx, side * 0.938, 0.345), 0.408, 0.026, BLACK,
              rot=(math.pi / 2, 0, 0), major_seg=28, minor_seg=8)
    # keep only the upper half: scale trick not needed — full ring reads as
    # arch trim behind the tire at the bottom; acceptable and tidy.

# ================================================================ INTERIOR
box('CabinFloor', (0, 0, 0.30), (3.30, 1.46, 0.07), CABIN)
box('Dash', (0.60, 0, 0.875), (0.32, 1.40, 0.13), CABIN, rot=(0, -0.18, 0), bevel=0.03)
box('DashScreen', (0.48, -0.05, 0.965), (0.03, 0.34, 0.15), SCREEN, rot=(0, -0.35, 0))
# v3 interior readability: cluster brow + screen in front of the driver,
# door cards, so the cabin reads as a cabin through the glass
box('ClusterBrow', (0.55, 0.38, 0.955), (0.30, 0.44, 0.05), CABIN, rot=(0, -0.18, 0), bevel=0.02)
box('ClusterScreen', (0.425, 0.38, 0.925), (0.02, 0.32, 0.11), SCREEN, rot=(0, -0.35, 0))
for side in (1, -1):
    box('DoorCard', (-0.12, side * 0.685, 0.70), (1.20, 0.04, 0.44), CABIN, bevel=0.02)
box('Console', (-0.02, 0, 0.52), (0.85, 0.30, 0.17), CABIN, bevel=0.03)
cyl('Shifter', (0.06, 0, 0.65), 0.022, 0.12, DARKMETAL, vertices=10)
# steering wheel (driver = left, +Y): torus in the YZ plane + column + hub
torus('SteeringWheel', (0.36, 0.38, 0.97), 0.185, 0.021, CABIN, rot=(0, math.pi / 2 - 0.35, 0))
box('SteeringHub', (0.365, 0.38, 0.97), (0.05, 0.13, 0.09), CABIN, rot=(0, -0.35, 0))
# wheel spokes (in the wheel's tilted YZ plane)
box('SteeringSpokeH', (0.358, 0.38, 0.965), (0.02, 0.30, 0.035), CABIN, rot=(0.35, 0, 0))
box('SteeringSpokeV', (0.358, 0.38, 0.965), (0.02, 0.035, 0.30), CABIN, rot=(0.35, 0, 0))
cyl('SteeringColumn', (0.46, 0.38, 0.93), 0.025, 0.22, DARKMETAL, rot=(0, math.pi / 2 - 0.35, 0), vertices=10)


def seat(name, x, y):
    box(name + 'Base', (x, y, 0.47), (0.52, 0.54, 0.13), SEAT, bevel=0.04)
    box(name + 'Back', (x - 0.30, y, 0.78), (0.14, 0.54, 0.62), SEAT, rot=(0, 0.22, 0), bevel=0.05)
    box(name + 'Headrest', (x - 0.40, y, 1.09), (0.11, 0.30, 0.16), SEAT, bevel=0.04)
    # side bolsters: the shaping that makes a seat read as a seat
    for s2 in (1, -1):
        box(name + 'Bolster', (x - 0.29, y + s2 * 0.245, 0.80), (0.15, 0.085, 0.52), SEAT,
            rot=(0, 0.22, 0), bevel=0.035)


seat('SeatL', -0.15, 0.38)
seat('SeatR', -0.15, -0.38)
# rear bench
box('BenchBase', (-1.12, 0, 0.47), (0.45, 1.30, 0.13), SEAT, bevel=0.04)
box('BenchBack', (-1.38, 0, 0.76), (0.13, 1.30, 0.55), SEAT, rot=(0, 0.25, 0), bevel=0.05)

# ================================================================ WHEELS
def build_wheel(name, width):
    g = bpy.data.objects.new(name, None)
    link(g)
    # tire: cylinder axis along Y
    tire = cyl('Tire', (0, 0, 0), 0.345, width, RUBBER, rot=(math.pi / 2, 0, 0), vertices=36)
    tire.parent = g
    # rounded shoulder rings
    for s in (1, -1):
        ring = torus('TireShoulder', (0, s * (width / 2 - 0.012), 0), 0.298, 0.048, RUBBER,
                     rot=(math.pi / 2, 0, 0), major_seg=28, minor_seg=10)
        ring.parent = g
    # rim barrel + white multi-hole rally face
    barrel = cyl('RimBarrel', (0, 0, 0), 0.262, width - 0.03, DARKMETAL, rot=(math.pi / 2, 0, 0), vertices=28)
    barrel.parent = g
    return g


WHEEL_POS = [
    ('WheelFL', 1.359, 0.80, 0.275),
    ('WheelFR', 1.359, -0.80, 0.275),
    ('WheelRL', -1.359, 0.795, 0.305),
    ('WheelRR', -1.359, -0.795, 0.305),
]
for (name, wx, wy, ww) in WHEEL_POS:
    g = build_wheel(name, ww)
    g.location = (wx, wy, 0.345)
    # face details parented to the group, on the OUTER side
    outer = 1 if wy > 0 else -1
    face = cyl('RimFace', (wx, wy + outer * (ww / 2 - 0.012), 0.345), 0.252, 0.024,
               RIMWHITE, rot=(math.pi / 2, 0, 0), vertices=28)
    face.parent = g
    face.location = (0, outer * (ww / 2 - 0.012), 0)
    for i in range(12):
        a = (i / 12) * math.pi * 2
        hole = cyl('RimHole', (wx, wy, 0.345), 0.036, 0.03, ARCH, rot=(math.pi / 2, 0, 0), vertices=14)
        hole.parent = g
        hole.location = (math.cos(a) * 0.160, outer * (ww / 2 - 0.006), math.sin(a) * 0.160)
    hub = cyl('Hub', (wx, wy, 0.345), 0.068, 0.034, DARKMETAL, rot=(math.pi / 2, 0, 0), vertices=16)
    hub.parent = g
    hub.location = (0, outer * (ww / 2 - 0.004), 0)
    # brake disc glimpse behind the holes
    disc = cyl('BrakeDisc', (wx, wy, 0.345), 0.19, 0.018, CHROME, rot=(math.pi / 2, 0, 0), vertices=24)
    disc.parent = g
    disc.location = (0, outer * (ww / 2 - 0.045), 0)

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

scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = 1152
scene.render.resolution_y = 832
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
    ('01_front34', (5.6, -4.9, 1.55), (0, 0, 0.55)),
    ('02_rear34', (-5.7, -4.7, 1.75), (0, 0, 0.55)),
    ('03_side', (0, -8.2, 0.72), (0, 0, 0.55)),
    ('04_front', (7.8, 0, 0.80), (0, 0, 0.58)),
    ('05_rear', (-7.8, 0, 0.95), (0, 0, 0.60)),
    ('06_top', (0.6, -0.9, 9.4), (0.2, 0, 0.3)),
    ('07_interior', (-2.0, -2.3, 1.65), (0.35, 0.05, 0.92)),
]
for (name, loc, tgt) in SHOTS:
    cam.location = loc
    cabin_fill = None
    if name == '07_interior':
        cam_data.lens = 24
        # the studio rig can't see into a closed cabin: lift the roof
        # panel for this shot only and add a soft cabin fill, so the
        # interior proof actually proves the interior
        for nm in ('RoofPanel', 'Sunroof', 'AntennaFin', 'Glasshouse', 'GlassSeal'):
            if nm in bpy.data.objects:
                bpy.data.objects[nm].hide_render = True
        ld = bpy.data.lights.new('CabinFill', 'POINT')
        ld.energy = 60
        ld.shadow_soft_size = 0.4
        try:
            ld.cycles.cast_shadow = False  # proof fill must not shadow the dash
        except Exception:
            pass
        cabin_fill = bpy.data.objects.new('CabinFill', ld)
        cabin_fill.location = (0.6, 0, 1.5)
        scene.collection.objects.link(cabin_fill)
    elif name == '06_top':
        cam_data.lens = 50
    else:
        cam_data.lens = 42
    look_at(cam, tgt)
    scene.render.filepath = os.path.join(args.out, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', name)
    if cabin_fill is not None:
        bpy.data.objects.remove(cabin_fill, do_unlink=True)
        for nm in ('RoofPanel', 'Sunroof', 'AntennaFin', 'Glasshouse', 'GlassSeal'):
            if nm in bpy.data.objects:
                bpy.data.objects[nm].hide_render = False

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
