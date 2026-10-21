#!/usr/bin/env python3
"""Re-import public/models/nomad-prime.glb and verify the node contract:
10 wheel pivots, 7 markers, key named parts, real 5700XE dimensions.
Run: blender -b --python tools/nomad_prime/verify_glb.py
"""
import bpy, os, sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
GLB = os.path.join(WT, "public", "models", "nomad-prime.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)

names = {o.name for o in bpy.data.objects}
wheels = [
    "Wheel_Steer_Left", "Wheel_Steer_Right",
    "Wheel_Drive_Axle1_Left_Inner", "Wheel_Drive_Axle1_Left_Outer",
    "Wheel_Drive_Axle1_Right_Inner", "Wheel_Drive_Axle1_Right_Outer",
    "Wheel_Drive_Axle2_Left_Inner", "Wheel_Drive_Axle2_Left_Outer",
    "Wheel_Drive_Axle2_Right_Inner", "Wheel_Drive_Axle2_Right_Outer",
]
markers = [
    "driver_seat", "passenger_seat", "sleeper_bunk_rest_point",
    "trailer_hitch_fifth_wheel", "electrical_brake_umbilical",
    "headlight_left_projector", "headlight_right_projector",
]
parts = [
    "ChassisFrame_L", "AerodynamicHood", "GrilleRail_T", "GrilleBar_00", "FrontPushBumper",
    "HighRoofSleeperCab", "SunVisor", "ExhaustStack_L", "ExhaustStack_R",
    "FuelTank_L", "FuelTank_R", "RearCatwalk_L", "FifthWheel",
    "CaptainChair_Driver", "SleeperBunk", "SteeringWheel",
]
missing = [n for n in wheels + markers + parts if n not in names]
print("MISSING:", missing if missing else "none")

# wheel pivots must sit at axle height AND carry their geometry as children
for w in wheels:
    o = bpy.data.objects[w]
    kids = [c.name for c in o.children]
    print("PIVOT", w, "at", tuple(round(v, 3) for v in o.location),
          "children:", len(kids))
    assert (w + "_Tire") in kids, w + " carries no tire child"

# world-space bounds of the whole import (glTF Y-up -> Blender Z-up)
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for o in bpy.data.objects:
    if o.type == 'MESH':
        for c in o.bound_box:
            v = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
dims = hi - lo
print("BOUNDS min", tuple(round(v, 2) for v in lo), "max", tuple(round(v, 2) for v in hi))
print("DIMS overall length(x)=%.2f width(y)=%.2f height(z)=%.2f" % (dims.x, dims.y, dims.z))
# body width from the cab mass itself (2.55 m spec is body width; mirrors
# legitimately reach ~3.1 m overall)
cab = bpy.data.objects["HighRoofSleeperCab"]
clo = Vector((1e9, 1e9, 1e9)); chi = Vector((-1e9, -1e9, -1e9))
for c in cab.bound_box:
    v = cab.matrix_world @ Vector(c)
    clo = Vector(map(min, clo, v)); chi = Vector(map(max, chi, v))
cabw = chi.y - clo.y
print("CAB body width = %.3f (target 2.50 + glass/bevel ~2.56)" % cabw)
assert not missing, "node contract incomplete"
assert 8.30 < dims.x < 8.60, "overall length off: %.2f" % dims.x
assert 3.85 < dims.z < 3.98, "overall height off: %.2f" % dims.z
assert 2.48 < cabw < 2.58, "cab width off: %.2f" % cabw
print("VERIFY OK — objects:", len(bpy.data.objects))
