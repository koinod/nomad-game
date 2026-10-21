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


PAINT = principled('AdriaticTealPaint', srgb(0x0FB5A3), metallic=0.15,
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
    (2.40, 0.845, 0.28, 0.52, 0.615),
    (2.25, 0.905, 0.20, 0.58, 0.70),
    (1.95, 0.945, 0.15, 0.66, 0.80),
    (1.36, 0.958, 0.13, 0.70, 0.83),
    (0.70, 0.952, 0.12, 0.72, 0.86),
    (0.10, 0.958, 0.12, 0.74, 0.88),
    (-0.60, 0.958, 0.12, 0.75, 0.90),
    (-1.36, 0.960, 0.13, 0.77, 0.93),
    (-1.90, 0.945, 0.16, 0.75, 0.97),
    (-2.30, 0.915, 0.26, 0.73, 0.96),
    (-2.40, 0.895, 0.34, 0.72, 0.94),
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
    (0.98, 0.790, 0.855, 0.93, 0.94),
    (0.55, 0.770, 0.865, 1.16, 1.26),
    (0.05, 0.752, 0.875, 1.26, 1.362),
    (-0.55, 0.760, 0.885, 1.27, 1.384),
    (-1.05, 0.790, 0.895, 1.17, 1.27),
    (-1.62, 0.835, 0.915, 1.00, 1.01),
]


def glass_loop(halfW, base, side, top):
    right = [
        (0.00, top),
        (0.45 * halfW, top - 0.015),
        (0.85 * halfW, side + 0.06),
        (1.00 * halfW, side),
        (0.985 * halfW, base),
    ]
    left = [(-y, z) for (y, z) in reversed(right[:-1])]
    return right + left


glass_stations = [(x, glass_loop(w, b, s, t)) for (x, w, b, s, t) in GLASS_STATIONS]
loft('Glasshouse', glass_stations, GLASS, subsurf=1, cap=False)

# paint roof panel over the glass (FX: painted roof + glass sunroof inset)
ROOF_STATIONS = [
    (0.16, 0.690, 1.358),
    (-0.20, 0.700, 1.378),
    (-0.55, 0.700, 1.386),
    (-0.86, 0.685, 1.360),
]


def roof_loop(halfW, top):
    return [(0.0, top), (0.6 * halfW, top - 0.002), (halfW, top - 0.012),
            (-halfW, top - 0.012), (-0.6 * halfW, top - 0.002)]


loft('RoofPanel', [(x, roof_loop(w, t)) for (x, w, t) in ROOF_STATIONS], PAINT, subsurf=1, cap=False)
# glass sunroof inset
box('Sunroof', (-0.32, 0, 1.383), (0.62, 0.78, 0.012), GLASS, bevel=0.01)
# shark-fin antenna
box('AntennaFin', (-0.86, 0, 1.375), (0.16, 0.03, 0.07), PAINT, rot=(0, -0.25, 0), bevel=0.01)
# B-pillar strips on the glass sides
for side in (1, -1):
    box('BPillar', (-0.28, side * 0.752, 1.17), (0.07, 0.015, 0.34), BLACK, rot=(0, 0.06, 0))

# ================================================================ FACE / TAIL
# grille + bumper intake (seated in the nose, never floating)
box('Grille', (2.395, 0, 0.47), (0.06, 1.15, 0.28), BLACK, bevel=0.02)
box('GrilleBadge', (2.43, 0, 0.49), (0.02, 0.16, 0.07), CHROME, bevel=0.005)
box('FrontSplitter', (2.36, 0, 0.145), (0.26, 1.52, 0.045), BLACK, bevel=0.01)
for side in (1, -1):
    # headlight assembly: dark housing + 3 lens segments (tri-bar DRL read)
    box('HeadlightHousing', (2.375, side * 0.635, 0.615), (0.10, 0.42, 0.11), BLACK,
        rot=(0, 0, side * -0.18), bevel=0.02)
    for i in range(3):
        box('HeadlightLens', (2.415, side * (0.545 + i * 0.095), 0.622), (0.03, 0.075, 0.055),
            LENS_F, rot=(0, 0, side * -0.18), bevel=0.008)
    # corner intake
    box('CornerIntake', (2.33, side * 0.72, 0.30), (0.16, 0.30, 0.20), BLACK, bevel=0.02)
    # tail panel + tri-bar lenses
    box('TailPanel', (-2.405, side * 0.42, 0.80), (0.05, 0.80, 0.20), BLACK, bevel=0.02)
    for i in range(3):
        box('TailLens', (-2.435, side * (0.24 + i * 0.13), 0.815), (0.03, 0.085, 0.13),
            LENS_R, bevel=0.008)
# hood vent (FX signature) — black louvered inset on the hood
box('HoodVent', (1.52, 0, 0.845), (0.52, 0.46, 0.025), BLACK, rot=(0, 0.045, 0), bevel=0.01)
for i in range(3):
    box('HoodVentSlat', (1.42 + i * 0.11, 0, 0.862), (0.05, 0.40, 0.012), DARKMETAL,
        rot=(0, 0.045, 0))
# rear diffuser + quad exhausts
box('Diffuser', (-2.33, 0, 0.235), (0.16, 1.50, 0.17), BLACK, bevel=0.02)
for side in (1, -1):
    for j in range(2):
        cyl('ExhaustTip', (-2.46, side * (0.52 + j * 0.14), 0.235), 0.037, 0.10,
            CHROME, rot=(0, math.pi / 2, 0), vertices=16)
# pedestal rear wing (FX sheet): paint blade, black uprights
for side in (1, -1):
    box('WingUpright', (-2.14, side * 0.42, 1.01), (0.07, 0.09, 0.13), BLACK)
box('RearWing', (-2.16, 0, 1.09), (0.27, 1.34, 0.035), PAINT, rot=(0, 0.10, 0), bevel=0.01)
# rocker skirts
for side in (1, -1):
    box('RockerSkirt', (0.05, side * 0.925, 0.175), (2.15, 0.045, 0.08), BLACK, bevel=0.01)
    # mirrors: stalk + housing at the A-pillars
    box('MirrorStalk', (0.80, side * 0.815, 1.02), (0.05, 0.10, 0.03), BLACK)
    box('Mirror', (0.78, side * 0.90, 1.06), (0.13, 0.07, 0.09), BLACK, bevel=0.02)
    # door handle + fuel door (right rear quarter)
    box('DoorHandle', (0.02, side * 0.962, 0.80), (0.16, 0.012, 0.03), BLACK)
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
box('Dash', (0.84, 0, 0.90), (0.32, 1.40, 0.15), CABIN, rot=(0, -0.18, 0), bevel=0.03)
box('DashScreen', (0.72, -0.05, 0.99), (0.03, 0.34, 0.15), SCREEN, rot=(0, -0.35, 0))
box('Console', (0.18, 0, 0.52), (0.85, 0.30, 0.17), CABIN, bevel=0.03)
cyl('Shifter', (0.28, 0, 0.65), 0.022, 0.12, DARKMETAL, vertices=10)
# steering wheel (driver = left, +Y): torus in the YZ plane + column + hub
torus('SteeringWheel', (0.58, 0.38, 0.97), 0.185, 0.021, CABIN, rot=(0, math.pi / 2 - 0.35, 0))
box('SteeringHub', (0.585, 0.38, 0.97), (0.05, 0.13, 0.09), CABIN, rot=(0, -0.35, 0))
cyl('SteeringColumn', (0.68, 0.38, 0.93), 0.025, 0.22, DARKMETAL, rot=(0, math.pi / 2 - 0.35, 0), vertices=10)


def seat(name, x, y):
    box(name + 'Base', (x, y, 0.47), (0.52, 0.54, 0.13), SEAT, bevel=0.04)
    box(name + 'Back', (x - 0.30, y, 0.78), (0.14, 0.54, 0.62), SEAT, rot=(0, 0.22, 0), bevel=0.05)
    box(name + 'Headrest', (x - 0.40, y, 1.09), (0.11, 0.30, 0.16), SEAT, bevel=0.04)


seat('SeatL', 0.05, 0.38)
seat('SeatR', 0.05, -0.38)
# rear bench
box('BenchBase', (-0.95, 0, 0.47), (0.45, 1.30, 0.13), SEAT, bevel=0.04)
box('BenchBack', (-1.22, 0, 0.76), (0.13, 1.30, 0.55), SEAT, rot=(0, 0.25, 0), bevel=0.05)

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
                     rot=(0, 0, 0), major_seg=28, minor_seg=10)
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
    for i in range(8):
        a = (i / 8) * math.pi * 2
        hole = cyl('RimHole', (wx, wy, 0.345), 0.040, 0.03, ARCH, rot=(math.pi / 2, 0, 0), vertices=14)
        hole.parent = g
        hole.location = (math.cos(a) * 0.155, outer * (ww / 2 - 0.006), math.sin(a) * 0.155)
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
world.node_tree.nodes['Background'].inputs[1].default_value = 0.55

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
    ('07_interior', (0.02, 0.40, 1.13), (1.6, 0.18, 0.88)),
]
for (name, loc, tgt) in SHOTS:
    cam.location = loc
    if name == '07_interior':
        cam_data.lens = 24
    elif name == '06_top':
        cam_data.lens = 50
    else:
        cam_data.lens = 42
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
