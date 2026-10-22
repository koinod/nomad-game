#!/usr/bin/env python3
"""NOMAD PRIME — proof renderer. Loads tools/prime/prime.blend, renders views.

Usage: blender -b --python tools/prime/render_prime.py -- \
    --views side,front34,rear34,front,rear,top,interior \
    --mode studio|outdoor|clay|zebra --res 768 --out design-refs/proof-prime
Never saves the blend.
"""
import bpy, math, os, sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
BLEND = os.path.join(ROOT, "prime.blend")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default

VIEWS = arg("--views", "side,front34").split(",")
MODE = arg("--mode", "studio")
RES = int(arg("--res", "768"))
OUT = arg("--out", os.path.join(WT, "design-refs", "proof-prime"))
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = RES
scene.render.resolution_y = int(RES * 0.72)
scene.render.film_transparent = False

# ---------------- lighting rigs (procedural; no external HDRI dependency)
world = bpy.data.worlds["World"] if bpy.data.worlds else bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]

def area(name, loc, energy, size, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy; d.shape = 'DISK'; d.size = size; d.color = color
    ob = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob

def sun(loc, energy=4.0, angle=0.4):
    d = bpy.data.lights.new("Sun", 'SUN')
    d.energy = energy; d.angle = angle
    ob = bpy.data.objects.new("Sun", d)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob

if MODE == "outdoor":
    # Nishita sky + sun
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = 'NISHITA'
    sky.sun_elevation = math.radians(38)
    sky.sun_rotation = math.radians(130)
    links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    sun((18, 12, 22), 3.0)
else:  # studio / clay / zebra: dark room + big softboxes
    bg.inputs["Color"].default_value = (0.035, 0.038, 0.042, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    area("Key", (6, 9, 9), 1600, 7.0)
    area("Fill", (-9, -6, 5), 700, 6.0, (0.85, 0.9, 1.0))
    area("Rim", (-4, 2, 11), 1200, 5.0)
    sun((10, 6, 14), 1.2)

# ground plane (receives the truck's shadow; excluded from clay/zebra swaps)
gp = bpy.data.meshes.new("ground")
gp.from_pydata([(-16, -16, 0), (16, -16, 0), (16, 16, 0), (-16, 16, 0)], [], [(0, 1, 2, 3)])
gob = bpy.data.objects.new("Ground", gp)
bpy.context.collection.objects.link(gob)
gm = bpy.data.materials.new("GroundMat")
gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.095, 0.10, 1.0)
gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
gob.data.materials.append(gm)

# ---------------- mode material swaps
def clay_mat():
    m = bpy.data.materials.new("Clay")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.55, 0.56, 0.58, 1.0)
    b.inputs["Roughness"].default_value = 0.42
    return m

def zebra_mat():
    m = bpy.data.materials.new("Zebra")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'X'
    wave.inputs["Scale"].default_value = 2.6
    wave.inputs["Distortion"].default_value = 0.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (0.03, 0.03, 0.03, 1)
    ramp.color_ramp.elements[1].position = 0.55
    ramp.color_ramp.elements[1].color = (0.95, 0.95, 0.95, 1)
    nt.links.new(tex.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.25
    return m

if MODE in ("clay", "zebra"):
    cm = clay_mat()
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.name != "Ground":
            ob.data.materials.clear()
            ob.data.materials.append(cm)
    if MODE == "zebra":
        shell = bpy.data.objects.get("BodyShell")
        if shell:
            shell.data.materials.clear()
            shell.data.materials.append(zebra_mat())

# ---------------- cameras
cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam

VIEWS_DEF = {
    # name: (location, target, lens)
    "side":    ((0.2, 13.5, 1.55), (0.2, 0, 1.45), 50),
    "side_r":  ((0.2, -13.5, 1.55), (0.2, 0, 1.45), 50),
    "front34": ((10.6, 8.6, 4.6), (0, 0, 1.25), 42),
    "rear34":  ((-10.6, 8.6, 4.6), (0, 0, 1.25), 42),
    "front":   ((13.8, 0, 1.7), (0.4, 0, 1.5), 50),
    "rear":    ((-13.8, 0, 1.7), (-0.4, 0, 1.5), 50),
    "top":     ((0, 0.01, 17.5), (0, 0, 0), 46),
    "interior": ((2.65, -2.45, 2.25), (1.30, 0.50, 1.50), 30),
    "door":    ((1.36, 4.6, 1.9), (1.36, 0, 1.7), 40),
    "deck":    ((-4.4, 4.8, 3.4), (-2.4, 0, 1.1), 40),
}

for v in VIEWS:
    if v not in VIEWS_DEF:
        print(f"SKIP unknown view {v}")
        continue
    loc, tgt, lens = VIEWS_DEF[v]
    cam.location = loc
    cam_data.lens = lens
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if v == "interior":
        # cutaway proof: hide the shells/panels so the cockpit reads lit
        for hn in ("BodyShell", "HoodShell", "DoorPanel_L", "DoorPanel_R",
                   "DoorGapPlate_L", "DoorGapPlate_R", "Windshield_L",
                   "Windshield_R", "DoorGlass_L", "DoorGlass_R", "SunVisor"):
            ob = bpy.data.objects.get(hn)
            if ob:
                ob.hide_render = True
        if not bpy.data.objects.get("InteriorFill"):
            bpy.ops.object.light_add(type='POINT', location=(1.30, 0, 2.45))
            pt = bpy.context.object
            pt.name = "InteriorFill"
            pt.data.energy = 90
    scene.render.filepath = os.path.join(OUT, f"{MODE}_{v}.png")
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {MODE}_{v}.png")
print("RENDER DONE")
