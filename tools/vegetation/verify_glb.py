#!/usr/bin/env python3
"""Re-import the exported vegetation GLBs and verify the engine
contract: exactly two mesh nodes named LOD0 / LOD1, a COLOR_0 vertex
color attribute on each, origin at the ground point (min Z ≈ 0 band,
below-ground root flare allowed), and triangle counts under the
budget ceilings mirrored in src/game/Vegetation.ts (VEG_TRI_BUDGET).

Run: blender -b --python tools/vegetation/verify_glb.py
"""
import bpy
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
MODELS = os.path.join(WT, "public", "models")

# class -> (LOD0 ceiling, LOD1 ceiling, min height m, max height m)
BUDGET = {
    'veg-live-oak': (1150, 330, 4.5, 7.5),
    'veg-loblolly': (1700, 190, 10.0, 13.0),
    'veg-wax-myrtle': (720, 220, 1.8, 3.0),
    'veg-needle-rush': (80, 30, 0.8, 1.5),
    'veg-spartina': (85, 30, 0.8, 1.5),
    'veg-dune-grass': (125, 26, 0.7, 1.5),
}

failures = []
for cls, (cap0, cap1, hmin, hmax) in BUDGET.items():
    path = os.path.join(MODELS, cls + ".glb")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
    names = sorted(meshes.keys())
    if names != ['LOD0', 'LOD1']:
        failures.append(f"{cls}: nodes {names} != ['LOD0', 'LOD1']")
        continue
    for lod_name, cap in (('LOD0', cap0), ('LOD1', cap1)):
        o = meshes[lod_name]
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        has_color = o.data.color_attributes is not None and len(o.data.color_attributes) > 0
        zs = [v.co.z for v in o.data.vertices]
        xs = [v.co.x for v in o.data.vertices]
        height = max(zs) - min(zs)
        print(f"{cls} {lod_name}: {tris} tris (cap {cap}), "
              f"height {height:.2f} m, width {max(xs) - min(xs):.2f} m, "
              f"minZ {min(zs):.2f}, vertexColors={has_color}")
        if tris > cap:
            failures.append(f"{cls} {lod_name}: {tris} tris over cap {cap}")
        if tris == 0:
            failures.append(f"{cls} {lod_name}: empty geometry")
        if not has_color:
            failures.append(f"{cls} {lod_name}: no vertex color attribute")
        if not (hmin <= height <= hmax):
            failures.append(f"{cls} {lod_name}: height {height:.2f} outside [{hmin}, {hmax}]")
        if min(zs) < -0.4 or min(zs) > 0.05:
            failures.append(f"{cls} {lod_name}: minZ {min(zs):.2f} — origin not at ground")

print("FAILURES:", failures if failures else "none")
sys.exit(1 if failures else 0)
