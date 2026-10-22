#!/usr/bin/env python3
"""Verify the exported Prime GLB: overall bounds, per-object world bounds,
marker (empty) positions, and triangle count — measured FROM the GLB's own
node transforms (not from build constants). The GLB exporter bakes Blender's
Z-up into Y-up: glTF (x, y, z) = Blender (x, -z, y). This script converts
back to house axes (X length nose+, Y width left+, Z up) and reports metres.

Usage: python3 verify_glb.py [path-to-glb]
"""
import json
import math
import struct
import sys

GLB = sys.argv[1] if len(sys.argv) > 1 else "design-refs/proof-prime/nomad-prime.glb"

with open(GLB, "rb") as f:
    data = f.read()
assert data[:4] == b"glTF", "not a GLB"
_, _, _, clen = struct.unpack_from("<IIII", data, 0)
gltf = json.loads(data[20:20 + clen])

# binary chunk offset
off = 20 + clen
_, blen = struct.unpack_from("<II", data, off)
bin_off = off + 8

def buf_bytes(bv):
    start = bin_off + bv.get("byteOffset", 0)
    return data[start:start + bv["byteLength"]]

COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
        5125: ("I", 4), 5126: ("f", 4)}
TYPEN = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

def read_accessor(idx):
    a = gltf["accessors"][idx]
    bv = gltf["bufferViews"][a["bufferView"]]
    raw = buf_bytes(bv)
    fmt, sz = COMP[a["componentType"]]
    n = TYPEN[a["type"]]
    stride = bv.get("byteStride", sz * n)
    start = a.get("byteOffset", 0)
    out = []
    for i in range(a["count"]):
        vals = struct.unpack_from("<" + fmt * n, raw, start + i * stride)
        out.append(vals)
    return out

def mat_mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

def node_matrix(node):
    if "matrix" in node:
        m = node["matrix"]
        return [[m[0], m[4], m[8], m[12]], [m[1], m[5], m[9], m[13]],
                [m[2], m[6], m[10], m[14]], [m[3], m[7], m[11], m[15]]]
    T = node.get("translation", [0, 0, 0])
    R = node.get("rotation", [0, 0, 0, 1])
    S = node.get("scale", [1, 1, 1])
    x, y, z, w = R
    Rm = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
        [0, 0, 0, 1],
    ]
    Sm = [[S[0], 0, 0, 0], [0, S[1], 0, 0], [0, 0, S[2], 0], [0, 0, 0, 1]]
    Tm = [[1, 0, 0, T[0]], [0, 1, 0, T[1]], [0, 0, 1, T[2]], [0, 0, 0, 1]]
    return mat_mul(Tm, mat_mul(Rm, Sm))

def xform(M, p):
    return tuple(M[i][0] * p[0] + M[i][1] * p[1] + M[i][2] * p[2] + M[i][3] for i in range(3))

def gltf_to_house(p):
    # glTF (x, y_up, z) from Blender (x, y_left, z_up): gltf = (bx, bz, -by)
    return (p[0], -p[2], p[1])

nodes = gltf["nodes"]
parents = {}
for i, n in enumerate(nodes):
    for c in n.get("children", []):
        parents[c] = i

world = {}
def world_mat(i):
    if i in world:
        return world[i]
    M = node_matrix(nodes[i])
    if i in parents:
        M = mat_mul(world_mat(parents[i]), M)
    world[i] = M
    return M

overall_min = [1e9] * 3
overall_max = [-1e9] * 3
tris = 0
objects = []
markers = []
for i, n in enumerate(nodes):
    name = n.get("name", f"node{i}")
    M = world_mat(i)
    if "mesh" not in n:
        pos = gltf_to_house(xform(M, (0, 0, 0)))
        markers.append((name, pos))
        continue
    mesh = gltf["meshes"][n["mesh"]]
    wmn = [1e9] * 3; wmx = [-1e9] * 3
    for prim in mesh["primitives"]:
        pos_acc = gltf["accessors"][prim["attributes"]["POSITION"]]
        lo = tuple(pos_acc["min"]); hi = tuple(pos_acc["max"])
        for a in (lo[0], hi[0]):
            for b in (lo[1], hi[1]):
                for c in (lo[2], hi[2]):
                    w = gltf_to_house(xform(M, (a, b, c)))
                    for k in range(3):
                        wmn[k] = min(wmn[k], w[k]); wmx[k] = max(wmx[k], w[k])
        if "indices" in prim:
            idx = read_accessor(prim["indices"])
            tris += len(idx) // 3
        else:
            tris += pos_acc["count"] // 3
    for c in range(3):
        overall_min[c] = min(overall_min[c], wmn[c])
        overall_max[c] = max(overall_max[c], wmx[c])
    objects.append((name, wmn, wmx))

print(f"GLB: {GLB}")
print(f"Mesh objects: {len(objects)}   Triangles: {tris}")
dims = [overall_max[i] - overall_min[i] for i in range(3)]
print(f"OVERALL BOUNDS (house axes, m): "
      f"X {overall_min[0]:+.3f}..{overall_max[0]:+.3f} (L {dims[0]*1000:.0f} mm)  "
      f"Y {overall_min[1]:+.3f}..{overall_max[1]:+.3f} (W {dims[1]*1000:.0f} mm)  "
      f"Z {overall_min[2]:+.3f}..{overall_max[2]:+.3f} (H {dims[2]*1000:.0f} mm)")
print()
print("MARKERS / EMPTIES (house axes, m):")
for name, p in sorted(markers):
    print(f"  {name:34s} ({p[0]:+.3f}, {p[1]:+.3f}, {p[2]:+.3f})")
EXPECTED_MK = ["MK_driver_seat", "MK_passenger_seat", "MK_driver_eye",
               "MK_sleeper_bunk_rest_point", "MK_trailer_hitch_fifth_wheel",
               "MK_fifth_wheel_kingpin", "MK_headlight_projector_L",
               "MK_headlight_projector_R", "MK_winch_fairlead", "MK_appboy_dock",
               "MK_exhaust_smoke_L", "MK_exhaust_smoke_R", "MK_gladhands",
               "MK_seven_pin"]
have = {n for n, _ in markers}
missing = [m for m in EXPECTED_MK if m not in have]
print("MISSING MARKERS:", missing if missing else "none")
print()
print("KEY OBJECT BOUNDS:")
for name, mn, mx in objects:
    if name.startswith(("WheelUnit", "FifthWheelPlate", "BodyShell", "HoodShell",
                         "FuelTank", "StackTip", "StackElbow", "RamFace")):
        c = [(mn[i] + mx[i]) / 2 for i in range(3)]
        print(f"  {name:28s} centre ({c[0]:+.3f}, {c[1]:+.3f}, {c[2]:+.3f})  "
              f"size ({(mx[0]-mn[0])*1000:.0f} x {(mx[1]-mn[1])*1000:.0f} x {(mx[2]-mn[2])*1000:.0f} mm)")
