#!/usr/bin/env python3
"""NOMAD Lane 2 — MH-60S Sea Hawk procedural build (Blender 4.2).

Axes (house convention, same as tools/build_mustang.py):
  X = length (nose +X), Y = width (port/left +Y), Z = up.  Meters.
Ground plane = z 0 (gear bottoms).  Nose tip x +7.64, tail cone x -7.63.

Builds airframe loft, doghouse, rotors (separate pivots), tail, gear,
glass, full cockpit + cabin interior, door-gunner station, markings.
Exports public/seahawk.glb and saves tools/seahawk/seahawk.blend.

Run: blender -b --python tools/seahawk/build_seahawk.py
"""
import bpy, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
GLB_OUT = os.path.join(WT, "public", "seahawk.glb")
BLEND_OUT = os.path.join(ROOT, "seahawk.blend")

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

# ---------------------------------------------------------------- materials
def mat(name, rgb, rough=0.6, metal=0.1, alpha=None, emissive=None, ei=0.0, blend=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, alpha if alpha is not None else 1.0)
    if alpha is not None:
        # The BSDF Alpha input is what Cycles AND the glTF exporter actually
        # read — without this, alpha= materials silently export opaque
        # (the original glass_tint shipped alpha 1.0 despite its .62 source).
        bsdf.inputs["Alpha"].default_value = alpha
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emissive:
        bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
        bsdf.inputs["Emission Strength"].default_value = ei
    if alpha is not None:
        m.surface_render_method = 'BLENDED' if blend else 'DITHERED'
    return m

AIR   = mat("naval_gray",      (0.335, 0.365, 0.385), 0.58, 0.18)   # ref body gray
AIRD  = mat("gray_dark",       (0.185, 0.195, 0.205), 0.62, 0.15)   # doghouse top / anti-glare
# FINISH PASS: fleet-standard glass — dark blue-green dielectric tint, BLEND
# transparency (cf. GT500 windshield 0.047/0.106/0.173 @ alpha .42 BLEND).
# Was: alpha .62 + DITHERED + metal .25, which read as flat black decals.
# Alpha is .82, not lower: the nose cone ahead of the instrument panel is
# hollow, and at .55 the far skin's painted texture bled through the glass
# as pale quad-shaped patches (diagnosed via no-glaze A/B render). At .82
# the bleed drops below visibility while the tint still reads as glass.
GLASS = mat("glass_tint",      (0.030, 0.068, 0.088), 0.05, 0.0, alpha=0.82, blend=True)
DARK  = mat("near_black",      (0.045, 0.048, 0.052), 0.85, 0.05)
INTM  = mat("interior",        (0.115, 0.125, 0.115), 0.9, 0.0)     # cabin tub
INTD  = mat("interior_dark",   (0.06, 0.065, 0.06), 0.92, 0.0)
SEAT  = mat("seat_fabric",     (0.09, 0.10, 0.075), 0.98, 0.0)      # olive drab canvas
SEATP = mat("seat_cushion",    (0.13, 0.115, 0.07), 0.95, 0.0)      # worn tan-olive
SCRN  = mat("screen",          (0.02, 0.05, 0.045), 0.25, 0.0, emissive=(0.05, 0.28, 0.20), ei=0.55)
SCRN2 = mat("screen_amber",    (0.05, 0.04, 0.01), 0.25, 0.0, emissive=(0.30, 0.18, 0.03), ei=0.5)
METAL = mat("gunmetal",        (0.10, 0.105, 0.11), 0.42, 0.75)
EXH   = mat("exhaust",         (0.13, 0.11, 0.10), 0.55, 0.6)
TIRE  = mat("tire",            (0.03, 0.03, 0.032), 0.95, 0.0)
HUBM  = mat("hub_gray",        (0.22, 0.23, 0.24), 0.5, 0.4)
BLADE = mat("rotor_charcoal",  (0.075, 0.078, 0.082), 0.55, 0.25)
TIPM  = mat("blade_tip",       (0.40, 0.41, 0.40), 0.5, 0.2)
MARK  = mat("marking",         (0.16, 0.175, 0.185), 0.55, 0.1)    # low-viz darker gray
SEAM  = mat("seam_dark",       (0.120, 0.128, 0.138), 0.82, 0.05)   # FINISH: gaskets / joint collars
PANEL = mat("panel_alt",       (0.365, 0.392, 0.412), 0.60, 0.18)   # FINISH: replacement-panel tone
ORNG  = mat("placard_orange",  (0.65, 0.22, 0.03), 0.6, 0.0)
REDL  = mat("light_red",       (0.3, 0.02, 0.02), 0.4, 0.0, emissive=(1.0, 0.05, 0.05), ei=2.0)
GRNL  = mat("light_green",     (0.02, 0.3, 0.05), 0.4, 0.0, emissive=(0.05, 1.0, 0.15), ei=2.0)
WHITEL= mat("light_white",     (0.4, 0.4, 0.38), 0.4, 0.0, emissive=(1.0, 0.98, 0.9), ei=1.4)

# ---------------------------------------------------------------- helpers
def link(obj, parent=None):
    bpy.context.collection.objects.link(obj)
    if parent: obj.parent = parent
    return obj

def finish(obj, material=None, smooth=True):
    if material: obj.data.materials.append(material)
    if smooth:
        for p in obj.data.polygons: p.use_smooth = True
    return obj

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

def sphere(name, loc, scale, material=None, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=loc)
    ob = bpy.context.object; ob.name = name; ob.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    if material: ob.data.materials.append(material)
    for p in ob.data.polygons: p.use_smooth = True
    if parent: ob.parent = parent
    return ob

def loft(name, stations, material=None, n=32, exp=3.4, cap=True, parent=None):
    """stations: list of (x, halfW, halfH, zCenter). Superellipse rings bridged."""
    rings = []
    for (x, hw, hh, zc) in stations:
        ring = []
        for i in range(n):
            t = 2 * math.pi * i / n
            c, s = math.cos(t), math.sin(t)
            ey = hw * math.copysign(abs(c) ** (2.0 / exp), c)
            ez = zc + hh * math.copysign(abs(s) ** (2.0 / exp), s)
            ring.append((x, ey, ez))
        rings.append(ring)
    verts, faces = [], []
    for ring in rings: verts.extend(ring)
    R = len(rings)
    for r in range(R - 1):
        for i in range(n):
            a = r * n + i; b = r * n + (i + 1) % n
            c2 = (r + 1) * n + (i + 1) % n; d = (r + 1) * n + i
            faces.append((a, b, c2, d))
    if cap:
        c0 = len(verts); verts.append(rings[0][0] and (stations[0][0], 0.0, stations[0][3]) or (0, 0, 0))
        for i in range(n): faces.append((c0, (i + 1) % n, i))
        c1 = len(verts); verts.append((stations[-1][0], 0.0, stations[-1][3]))
        base = (R - 1) * n
        for i in range(n): faces.append((c1, base + i, base + (i + 1) % n))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    # FINISH PASS: parametric UVs — u = ring fraction (nose 0 -> tail 1),
    # v = angle fraction (0 port equator, .25 top, .5 stbd, .75 belly).
    # paint_airframe() draws panel lines / weathering in this space.
    uv = me.uv_layers.new(name="UVMap")
    vuv = []
    for r in range(R):
        for i in range(n):
            vuv.append((r / (R - 1) if R > 1 else 0.0, i / n))
    if cap:
        vuv.append((0.0, 0.5)); vuv.append((1.0, 0.5))
    for loop in me.loops:
        uv.data[loop.index].uv = vuv[loop.vertex_index]
    ob = bpy.data.objects.new(name, me); link(ob, parent)
    return finish(ob, material)

def empty(name, loc, parent=None):
    ob = bpy.data.objects.new(name, None); ob.empty_display_type = 'PLAIN_AXES'
    ob.empty_display_size = 0.3; ob.location = loc; link(ob, parent)
    return ob

ROOTOB = empty("Seahawk", (0, 0, 0))

# ================================================================ FINISH PASS helpers
# Ty's conditional-approval items: (1) panel lines + service weathering,
# (2) glazing that reads as glass. Panel lines/weathering are PAINTED into
# parametric-UV canvas textures (numpy) on the two big lofts; glazing is
# rebuilt as conformal patches hugging the loft with real frames beneath.
import numpy as np

def _lin2srgb(c):
    return 1.055 * (c ** (1 / 2.4)) - 0.055 if c > 0.0031308 else 12.92 * c

def _station_at(stations, x):
    """Interpolated (halfW, halfH, zCenter) at x for a nose->tail station list."""
    xs = [s[0] for s in stations]
    for i in range(len(xs) - 1):
        if xs[i] >= x >= xs[i + 1]:
            f = (xs[i] - x) / (xs[i] - xs[i + 1])
            a, b = stations[i], stations[i + 1]
            return tuple(a[k] + (b[k] - a[k]) * f for k in (1, 2, 3))
    return stations[0][1:] if x > xs[0] else stations[-1][1:]

def _x_to_u(stations, x):
    xs = [s[0] for s in stations]
    for i in range(len(xs) - 1):
        if xs[i] >= x >= xs[i + 1]:
            f = (xs[i] - x) / (xs[i] - xs[i + 1])
            return (i + f) / (len(xs) - 1)
    return 0.0 if x > xs[0] else 1.0

def _v_of(stations, x, z, side, exp=3.4):
    """Loft v of the surface point at height z on a side (+1 port / -1 stbd)."""
    hw, hh, zc = _station_at(stations, x)
    dz = max(-1.0, min(1.0, (z - zc) / hh))
    s = math.copysign(abs(dz) ** (exp / 2.0), dz)
    t = math.asin(max(-1.0, min(1.0, s)))
    if side > 0:
        return (t / (2 * math.pi)) % 1.0
    return ((math.pi - t) / (2 * math.pi)) % 1.0

def _surf_point(stations, x, t, exp=3.4):
    hw, hh, zc = _station_at(stations, x)
    c, s = math.cos(t), math.sin(t)
    y = hw * math.copysign(abs(c) ** (2.0 / exp), c)
    z = zc + hh * math.copysign(abs(s) ** (2.0 / exp), s)
    return Vector((x, y, z))

def surf_patch(name, stations, x0, x1, t0, t1, offset, material, nx=10, nt=10, parent=None):
    """Conformal skin patch on the loft surface, x0..x1 by angle t0..t1
    (radians, loft convention), offset metres proud along the local normal."""
    pts, idx, verts, faces = {}, {}, [], []
    for i in range(nx + 1):
        for j in range(nt + 1):
            x = x0 + (x1 - x0) * i / nx
            t = t0 + (t1 - t0) * j / nt
            p = _surf_point(stations, x, t)
            px = _surf_point(stations, x + 0.03, t)
            pt = _surf_point(stations, x, t + 0.02)
            nrm = (pt - p).cross(px - p)
            if nrm.length < 1e-9:
                nrm = Vector((0, 1, 0))
            nrm.normalize()
            axis = Vector((x, 0, _station_at(stations, x)[2]))
            if nrm.dot(p - axis) < 0:
                nrm = -nrm
            idx[(i, j)] = len(verts)
            verts.append(tuple(p + nrm * offset))
    for i in range(nx):
        for j in range(nt):
            faces.append((idx[(i, j)], idx[(i, j + 1)], idx[(i + 1, j + 1)], idx[(i + 1, j)]))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); link(ob, parent)
    return finish(ob, material)

def loft_band(name, stations, x0, x1, t0, t1, scale, material, parent=None):
    """Conformal band on the loft surface between x0>x1 (nose->tail) and
    angles t0..t1, pushed out by radial scale about each section's centre.
    Samples the fuselage's own ring angles, so it parallels the skin with
    ZERO chord error — unlike surf_patch grids, which facet visibly on the
    double-curved nose (diagnosed round 2 of the finish pass)."""
    xs = [x0] + [s[0] for s in stations if x0 > s[0] > x1] + [x1]
    step = 2 * math.pi / 32
    ts = [t0]
    k = math.ceil(t0 / step)
    while k * step < t1 - 1e-9:
        ts.append(k * step); k += 1
    ts.append(t1)
    verts, faces = [], []
    for x in xs:
        hw, hh, zc = _station_at(stations, x)
        for t in ts:
            p = _surf_point(stations, x, t)
            verts.append((x, p.y * scale, zc + (p.z - zc) * scale))
    R, C = len(xs), len(ts)
    for r in range(R - 1):
        for i in range(C - 1):
            a = r * C + i; b = r * C + i + 1
            c2 = (r + 1) * C + i + 1; d = (r + 1) * C + i
            faces.append((a, d, c2, b))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); link(ob, parent)
    return finish(ob, material)

def _box_blur(a, r):
    if r <= 0:
        return a
    for axis in (0, 1):
        ap = np.moveaxis(a, axis, 0)
        pad = np.pad(ap, ((r, r),) + ((0, 0),) * (ap.ndim - 1), mode='edge')
        cs = np.cumsum(pad, axis=0)
        cs = np.concatenate([np.zeros_like(cs[:1]), cs], axis=0)
        out = (cs[2 * r + 1:] - cs[:-(2 * r + 1)]) / (2 * r + 1)
        a = np.moveaxis(out, 0, axis)
    return a

def _noise_field(H, W, rng, blocks):
    g = rng.random(blocks)
    up = np.kron(g, np.ones((H // blocks[0] + 1, W // blocks[1] + 1)))[:H, :W]
    return _box_blur(up, max(2, W // blocks[1] // 2))

def _cols_x(stations, W):
    us = np.linspace(0, 1, W)
    seg = np.minimum((us * (len(stations) - 1)).astype(int), len(stations) - 2)
    f = us * (len(stations) - 1) - seg
    xa = np.array([s[0] for s in stations], dtype=np.float64)
    return xa[seg] + (xa[seg + 1] - xa[seg]) * f

def paint_airframe(name, stations, W, H, base_lin, frames=(), hlines=(), rects=(),
                   streaks=(), blobs=(), tones=(), belly=False, seed=615):
    """Paint panel lines + weathering into a canvas in loft UV space.
    frames: x positions (full-circle seams). hlines: (z, x0, x1, side, str).
    rects: (x0, x1, z0, z1, side, str). streaks: (xc, side, ztop, zbot, width_m, str).
    blobs: (xc, vc, sx_m, sv, depth) gaussian stains (depth<0 lightens).
    tones: (x0, x1, z0, z1, side, factor) replacement-panel tint blocks."""
    rng = np.random.default_rng(seed)
    base = np.array([_lin2srgb(c) for c in base_lin], dtype=np.float32)
    img = np.ones((H, W, 4), dtype=np.float32)
    img[..., 0], img[..., 1], img[..., 2] = base[0], base[1], base[2]
    m = (0.972 + 0.036 * _noise_field(H, W, rng, (10, 20))
         + 0.024 * _noise_field(H, W, rng, (42, 84)))
    img[..., :3] *= m[..., None]
    L = np.ones((H, W), dtype=np.float32)          # darkening multiplier field
    T = np.ones((H, W, 3), dtype=np.float32)       # warm-tint multiplier field
    xs_col = _cols_x(stations, W)
    vrows = np.linspace(0, 1, H)

    def _spans(a, b):
        if b <= 1.0:
            yield (a, b)
        else:
            yield (a, 1.0); yield (0.0, b - 1.0)

    def vline(x, va, vb, strength=0.30, wpx=2, hi=True):
        cx = int(_x_to_u(stations, x) * (W - 1))
        # shorter-arc span between va and vb (rects are local; sides wrap
        # in opposite senses, so never trust raw ordering)
        if abs(vb - va) <= 0.5:
            lo, hi_v = min(va, vb), max(va, vb)
        else:
            lo, hi_v = max(va, vb), min(va, vb) + 1.0
        for (a, b) in _spans(lo, hi_v):
            j0, j1 = int(a * H), max(int(b * H), int(a * H) + 1)
            for dx in range(-wpx, wpx + 1):
                f = 1.0 - strength * (1 - abs(dx) / (wpx + 1))
                L[j0:j1, min(max(cx + dx, 0), W - 1)] *= f
            if hi:
                L[j0:j1, min(cx + wpx + 2, W - 1)] *= 1.05

    def hline(z, x0, x1, side, strength=0.28, wpx=2):
        i0 = int(_x_to_u(stations, max(x0, x1)) * (W - 1))
        i1 = int(_x_to_u(stations, min(x0, x1)) * (W - 1))
        for i in range(min(i0, i1), max(i0, i1) + 1):
            v = _v_of(stations, xs_col[i], z, side)
            cy = int(v * H)
            for dj in range(-wpx, wpx + 1):
                f = 1.0 - strength * (1 - abs(dj) / (wpx + 1))
                L[(cy + dj) % H, i] *= f

    for fx in frames:
        vline(fx, 0.0, 1.0, 0.30)
    for (z, x0, x1, side, s) in hlines:
        hline(z, x0, x1, side, s)
    for (x0, x1, z0, z1, side, s) in rects:
        va0 = _v_of(stations, x0, z0, side); va1 = _v_of(stations, x0, z1, side)
        vb0 = _v_of(stations, x1, z0, side); vb1 = _v_of(stations, x1, z1, side)
        vline(x0, min(va0, va1), max(va0, va1), s)
        vline(x1, min(vb0, vb1), max(vb0, vb1), s)
        hline(z0, x0, x1, side, s); hline(z1, x0, x1, side, s)
    for (xc, side, zt, zb, wid, s) in streaks:
        cols = np.where(np.abs(xs_col - xc) < wid / 2)[0]
        for i in cols:
            fall = math.cos((xs_col[i] - xc) / (wid / 2) * math.pi / 2) ** 2
            vt = _v_of(stations, xs_col[i], zt, side)
            vb2 = _v_of(stations, xs_col[i], zb, side)
            r0, r1 = int(min(vt, vb2) * H), int(max(vt, vb2) * H)
            if r1 - r0 > H // 2:
                r0, r1 = r1, r0 + H
            rows = np.arange(r0, r1 + 1)
            grad = 1.0 - 0.7 * (np.arange(len(rows)) / max(1, len(rows) - 1))
            L[rows % H, i] *= (1.0 - s * fall * grad).astype(np.float32)
    for (xc, vc, sx, sv, depth) in blobs:
        du = (xs_col[None, :] - xc) / sx
        dv = np.abs(vrows[:, None] - vc); dv = np.minimum(dv, 1.0 - dv) / sv
        field = np.exp(-(du ** 2 + dv ** 2))
        L *= (1.0 - depth * field).astype(np.float32)
        if depth > 0.1:  # heavy stains run warm/brown
            T[..., 0] *= (1.0 + 0.05 * field).astype(np.float32)
            T[..., 2] *= (1.0 - 0.06 * field).astype(np.float32)
    for (x0, x1, z0, z1, side, fac) in tones:
        cols = np.where((xs_col <= max(x0, x1)) & (xs_col >= min(x0, x1)))[0]
        for i in cols:
            va = _v_of(stations, xs_col[i], z0, side)
            vb2 = _v_of(stations, xs_col[i], z1, side)
            r0, r1 = int(min(va, vb2) * H), int(max(va, vb2) * H)
            if r1 - r0 > H // 2:
                r0, r1 = r1, r0 + H
            L[np.arange(r0, r1 + 1) % H, i] *= fac
    if belly:
        bell = np.exp(-((vrows - 0.75) / 0.13) ** 2)
        L *= (1.0 - 0.15 * bell[:, None]).astype(np.float32)
        T[..., 0] *= (1.0 + 0.03 * bell[:, None]).astype(np.float32)
        T[..., 2] *= (1.0 - 0.04 * bell[:, None]).astype(np.float32)
    img[..., :3] *= L[..., None]
    img[..., :3] *= T
    # fine per-pixel grain: breaks gradient banding/posterization in dim
    # renders and JPEG, reads as matte-paint microtexture at game distance
    img[..., :3] *= (1.0 + rng.normal(0.0, 0.012, (H, W, 1))).astype(np.float32)
    np.clip(img, 0.0, 1.0, out=img)
    img[..., 3] = 1.0
    tex = bpy.data.images.new(name, W, H, alpha=False)
    tex.colorspace_settings.name = 'sRGB'
    tex.pixels.foreach_set(img.ravel())
    tex.update()
    tex.pack()
    return tex

def textured_mat(name, image, rough=0.58, metal=0.18):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    tex = m.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return m

# ================================================================ FUSELAGE LOFT
# (x, halfW, halfH, zCenter) nose -> tail
FUSE_STATIONS = [
    ( 7.64, 0.06, 0.09, 1.80),
    ( 7.35, 0.50, 0.62, 1.84),
    ( 6.70, 0.90, 0.90, 1.94),
    ( 5.50, 1.15, 1.06, 2.00),
    ( 3.60, 1.17, 1.10, 2.01),
    ( 1.60, 1.16, 1.10, 2.02),
    (-0.20, 1.08, 1.05, 2.07),
    (-1.80, 0.84, 0.80, 2.20),
    (-4.20, 0.56, 0.58, 2.38),
    (-6.20, 0.43, 0.47, 2.58),
    (-7.30, 0.31, 0.42, 2.80),
    (-7.63, 0.05, 0.07, 2.87),
]
fuse = loft("SH_Fuselage", FUSE_STATIONS, AIR, parent=ROOTOB)

# Anti-glare panel ahead of windshield (dark deck strip)
box("SH_AntiGlare", (6.28, 0, 2.86), (0.95, 1.05, 0.05), AIRD, bevel=0.02,
    rot=(0, math.radians(-14), 0), parent=ROOTOB)

# ---- door aperture cutouts (boolean, exact solver) -------------------------
def cut_rounded_box(target, name, loc, scale, bevel=0.16):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    cu = bpy.context.object; cu.name = name
    cu.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    mod = cu.modifiers.new("bev", 'BEVEL'); mod.width = bevel; mod.segments = 3
    bpy.context.view_layer.objects.active = cu
    bpy.ops.object.modifier_apply(modifier="bev")
    bpy.context.view_layer.objects.active = target
    bm = target.modifiers.new("cut", 'BOOLEAN'); bm.operation = 'DIFFERENCE'
    bm.solver = 'EXACT'; bm.object = cu
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cu, do_unlink=True)

# doors: opening x 3.95..2.60 (w 1.35), z 0.95..2.45 (h 1.50), both sides
cut_rounded_box(fuse, "cut_port", (3.28, 1.05, 1.70), (1.35, 0.55, 1.50))
cut_rounded_box(fuse, "cut_stbd", (3.28, -1.05, 1.70), (1.35, 0.55, 1.50))
print("FUSELAGE verts after cuts:", len(fuse.data.vertices))

# ---- FINISH PASS: fuselage panel lines + weathering (painted in loft UV)
_fuse_tex = paint_airframe(
    "seahawk_fuselage_tex", FUSE_STATIONS, 2048, 1024, (0.335, 0.365, 0.385),
    frames=[6.15, 5.35, 4.62, 3.98, 2.60, 1.85, 0.90, -0.85, -1.90, -3.30, -4.70],
    hlines=[(2.80, -1.8, 5.6, 1, 0.20), (2.80, -1.8, 5.6, -1, 0.20),
            (1.02, -0.85, 5.5, 1, 0.18), (1.02, -0.85, 5.5, -1, 0.18)],
    rects=[(6.12, 7.28, 1.30, 2.44, 1, 0.32), (6.12, 7.28, 1.30, 2.44, -1, 0.32),
           (4.70, 6.00, 1.28, 2.88, 1, 0.30), (4.70, 6.00, 1.28, 2.88, -1, 0.30),
           (-3.62, -2.68, 2.02, 2.60, 1, 0.30), (-3.62, -2.68, 2.02, 2.60, -1, 0.30)],
    streaks=[(3.28, 1, 0.98, 0.55, 1.15, 0.30), (3.28, -1, 0.98, 0.55, 1.15, 0.30),
             (0.55, 1, 2.00, 1.55, 0.55, 0.20), (0.55, -1, 2.00, 1.55, 0.55, 0.20),
             (1.55, 1, 2.02, 1.58, 0.55, 0.20), (1.55, -1, 2.02, 1.58, 0.55, 0.20),
             (2.40, 1, 1.06, 0.68, 2.30, 0.22), (2.40, -1, 1.06, 0.68, 2.30, 0.22),
             (3.30, -1, 2.45, 1.95, 0.50, 0.18)],
    blobs=[(-1.70, 0.25, 1.90, 0.045, 0.45),      # exhaust soot wash over boom top
           (-3.60, 0.25, 2.20, 0.060, -0.06)],     # rotor-wash dusting aft
    tones=[(2.00, 3.40, 1.20, 2.60, 1, 1.035), (-1.90, -3.30, 1.90, 2.70, -1, 0.965)],
    belly=True)
fuse.data.materials.clear()
fuse.data.materials.append(textured_mat("naval_gray_fuse", _fuse_tex))

# ================================================================ DOGHOUSE
# Transmission fairing on top of cabin, x +3.3 .. -1.7
DOG_STATIONS = [
    ( 3.30, 0.30, 0.10, 3.06),
    ( 2.80, 0.66, 0.34, 3.08),
    ( 1.90, 0.78, 0.46, 3.10),
    ( 0.60, 0.80, 0.47, 3.10),
    (-0.80, 0.76, 0.42, 3.08),
    (-1.70, 0.55, 0.26, 2.98),
    (-2.05, 0.20, 0.08, 2.90),
]
dog = loft("SH_Doghouse", DOG_STATIONS, AIR, parent=ROOTOB)
# dark top deck plate
box("SH_DeckTop", (0.6, 0, 3.56), (2.6, 1.15, 0.06), AIRD, bevel=0.03, parent=ROOTOB)

# ---- FINISH PASS: doghouse panel lines + exhaust soot (painted in loft UV)
_dog_tex = paint_airframe(
    "seahawk_doghouse_tex", DOG_STATIONS, 1024, 512, (0.335, 0.365, 0.385),
    frames=[2.55, 1.35, 0.15, -1.05],
    hlines=[(3.32, -1.7, 3.3, 1, 0.20), (3.32, -1.7, 3.3, -1, 0.20)],
    rects=[(1.00, 2.25, 2.88, 3.38, 1, 0.32), (1.00, 2.25, 2.88, 3.38, -1, 0.32)],
    blobs=[(-0.95, _v_of(DOG_STATIONS, -0.95, 3.26, 1), 0.85, 0.055, 0.50),
           (-0.95, _v_of(DOG_STATIONS, -0.95, 3.26, -1), 0.85, 0.055, 0.50),
           (2.42, _v_of(DOG_STATIONS, 2.42, 3.12, 1), 0.30, 0.045, 0.16),
           (2.42, _v_of(DOG_STATIONS, 2.42, 3.12, -1), 0.30, 0.045, 0.16)],
    seed=616)
dog.data.materials.clear()
dog.data.materials.append(textured_mat("naval_gray_dog", _dog_tex))

# engine intakes (front face of doghouse sides): dark oval + lip
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    it = sphere("SH_Intake" + nm, (2.42, sgn * 0.80, 3.12), (0.30, 0.10, 0.24), DARK, parent=ROOTOB)
    lip = cyl("SH_IntakeLip" + nm, (2.42, sgn * 0.86, 3.12), 0.27, 0.07, AIRD,
              rot=(math.radians(90), 0, 0), parent=ROOTOB)
    lip.scale = (1.15, 1.0, 0.85); bpy.context.view_layer.objects.active = lip
    bpy.ops.object.transform_apply(scale=True)
    # exhaust: oval outlet on aft doghouse sides, angled up/aft
    ex = cyl("SH_Exhaust" + nm, (-0.55, sgn * 0.82, 3.22), 0.30, 0.16, EXH,
             rot=(math.radians(90), 0, 0), parent=ROOTOB)
    ex.scale = (1.25, 1.0, 0.8); bpy.context.view_layer.objects.active = ex
    bpy.ops.object.transform_apply(scale=True)
    box("SH_ExhaustShroud" + nm, (-0.55, sgn * 0.72, 3.30), (0.85, 0.30, 0.28), AIR,
        bevel=0.06, rot=(0, math.radians(10), 0), parent=ROOTOB)

# SATCOM humps (two drums on aft deck, per ref) + GPS dome
cyl("SH_Satcom1", (0.05, 0.18, 3.66), 0.27, 0.20, AIR, parent=ROOTOB)
cyl("SH_Satcom2", (-0.75, -0.10, 3.64), 0.24, 0.18, AIR, parent=ROOTOB)
sphere("SH_GpsDome", (1.55, 0, 3.60), (0.17, 0.17, 0.10), AIRD, parent=ROOTOB)
# blade antenna under tail boom + under cabin
box("SH_AntBoom", (-3.4, 0, 1.62), (0.42, 0.04, 0.30), AIRD, bevel=0.02, parent=ROOTOB)
box("SH_AntBelly", (2.2, 0, 0.66), (0.36, 0.04, 0.22), AIRD, bevel=0.02, parent=ROOTOB)

# ================================================================ MAIN ROTOR
mast_pivot = empty("MainRotorPivot", (0.95, 0, 3.92), parent=ROOTOB)
cyl("SH_Mast", (0.95, 0, 3.72), 0.13, 0.45, METAL, parent=ROOTOB)
# swashplate hint (visible in ref through hub area)
cyl("SH_Swashplate", (0.95, 0, 3.80), 0.30, 0.07, HUBM, parent=ROOTOB)
hub = cyl("SH_RotorHub", (0, 0, 0.10), 0.34, 0.24, HUBM, parent=mast_pivot)
sphere("SH_HubCap", (0, 0, 0.24), (0.20, 0.20, 0.12), AIRD, parent=mast_pivot)
# pitch links
for i in range(4):
    a = math.radians(45 + i * 90)
    cyl("SH_PitchLink%d" % i, (0.30 * math.cos(a), 0.30 * math.sin(a), -0.08), 0.022, 0.22,
        METAL, parent=mast_pivot)

def rotor_blade(name, r0=0.30, r1=8.18, chord=0.81, parent=None):
    """Blade along +X from hub center, droop baked (tip ~0.21 low). Segments root/mid/tip."""
    droop = math.radians(1.5)
    profs = [  # (r, chord, thick, sweep_back)
        (r0, chord * 0.92, 0.085, 0.0),
        (r0 + 1.2, chord, 0.075, 0.0),
        (r1 - 0.9, chord * 0.99, 0.062, 0.0),
        (r1 - 0.18, chord * 0.86, 0.05, 0.28),   # swept tip
        (r1, chord * 0.55, 0.04, 0.46),
    ]
    verts, faces = [], []
    for (r, ch, th, sw) in profs:
        y0 = -ch / 2 - sw; y1 = ch / 2 - sw
        z = -math.sin(droop) * r
        verts += [(r, y0, z - th / 2), (r, y1, z - th / 2), (r, y1, z + th / 2), (r, y0, z + th / 2)]
    for s in range(len(profs) - 1):
        for k in range(4):
            faces.append((s * 4 + k, s * 4 + (k + 1) % 4, (s + 1) * 4 + (k + 1) % 4, (s + 1) * 4 + k))
    faces.append((3, 2, 1, 0))
    b = len(profs) * 4 - 4
    faces.append((b, b + 1, b + 2, b + 3))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); link(ob, parent)
    finish(ob, BLADE, smooth=False)
    ob.data.materials.append(TIPM)  # index 1: tip band on last segment + cap
    for idx, p in enumerate(ob.data.polygons):
        if idx >= (len(profs) - 2) * 4:
            p.material_index = 1
    return ob

for i in range(4):
    bl = rotor_blade("SH_Blade%d" % i, parent=mast_pivot)
    bl.rotation_euler = (0, 0, math.radians(45 + i * 90))

# ================================================================ TAIL
# vertical fin: extruded profile (side view shape) at boom aft
fin_profile = [  # (x, z) leading edge up-swept, capped top, trailing down
    (-5.95, 2.78), (-6.55, 3.90), (-6.95, 4.42), (-7.45, 4.50),
    (-7.68, 4.30), (-7.70, 3.10), (-7.55, 2.72),
]
verts, faces = [], []
for (x, z) in fin_profile: verts.append((x, 0.10, z))
for (x, z) in fin_profile: verts.append((x, -0.10, z))
np_ = len(fin_profile)
for i in range(np_ - 1):
    faces.append((i, i + 1, np_ + i + 1, np_ + i))
faces.append(tuple(range(np_ - 1, -1, -1)))
faces.append(tuple(range(np_, 2 * np_)))
me = bpy.data.meshes.new("SH_TailFin"); me.from_pydata(verts, [], faces); me.update()
fin = bpy.data.objects.new("SH_TailFin", me); link(fin, ROOTOB); finish(fin, AIR, smooth=False)
# fin base fairing blending into boom
sphere("SH_FinBase", (-6.9, 0, 2.95), (0.95, 0.30, 0.42), AIR, parent=ROOTOB)
# small ventral fin strake
box("SH_VentralFin", (-7.15, 0, 2.28), (0.85, 0.06, 0.5), AIR, bevel=0.02,
    rot=(0, math.radians(-12), 0), parent=ROOTOB)

# tail rotor: mount (static, canted 20 deg about X) -> spin pivot on PORT (+Y) face of fin
tr_mount = empty("TailRotorMount", (-7.18, 0.16, 3.98), parent=ROOTOB)
tr_mount.rotation_euler = (math.radians(20), 0, 0)
tr_pivot = empty("TailRotorPivot", (0, 0, 0), parent=tr_mount)  # spin about local Y
cyl("SH_TailHub", (0, 0.10, 0), 0.13, 0.24, HUBM, rot=(math.radians(90), 0, 0), parent=tr_pivot)
def tail_blade(name, parent=None):
    profs = [(0.10, 0.30, 0.045, 0.0), (0.85, 0.285, 0.038, 0.0), (1.55, 0.25, 0.03, 0.10), (1.675, 0.16, 0.024, 0.2)]
    verts, faces = [], []
    for (r, ch, th, sw) in profs:
        y0 = -ch / 2 - sw; y1 = ch / 2 - sw
        verts += [(y0, 0, r - th / 2), (y1, 0, r - th / 2), (y1, 0, r + th / 2), (y0, 0, r + th / 2)]
    for s in range(len(profs) - 1):
        for k in range(4):
            faces.append((s * 4 + k, s * 4 + (k + 1) % 4, (s + 1) * 4 + (k + 1) % 4, (s + 1) * 4 + k))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); link(ob, parent)
    return finish(ob, BLADE, smooth=False)
for i in range(4):
    tb = tail_blade("SH_TailBlade%d" % i, parent=tr_pivot)
    tb.rotation_euler = (0, math.radians(45 + i * 90), 0)

# stabilator (separate object; folds on the real aircraft)
stab = box("SH_Stabilator", (-6.62, 0, 2.52), (0.95, 4.38, 0.09), AIR, bevel=0.04, parent=ROOTOB)

# ================================================================ SPONSONS + GEAR
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    sp = loft("SH_Sponson" + nm, [
        (3.55, 0.06, 0.05, 1.02), (3.25, 0.30, 0.26, 1.00), (2.45, 0.36, 0.30, 0.98),
        (1.55, 0.30, 0.26, 1.00), (1.15, 0.06, 0.05, 1.04)], AIR, parent=ROOTOB)
    sp.location.y = sgn * 1.13
    # gear strut + axle
    cyl("SH_GearStrut" + nm, (2.42, sgn * 1.38, 0.62), 0.075, 0.62, METAL, parent=ROOTOB)
    cyl("SH_GearDrag" + nm, (2.72, sgn * 1.30, 0.72), 0.045, 0.55, METAL,
        rot=(math.radians(38), math.radians(24), 0), parent=ROOTOB)
    # wheel: torus-ish tire = cylinder with bevel + hub disc; separate object (pivot = own origin)
    wh = cyl("SH_WheelMain" + nm, (2.42, sgn * 1.42, 0.345), 0.345, 0.24, TIRE,
             rot=(math.radians(90), 0, 0), verts=28, parent=ROOTOB)
    cyl("SH_WheelHub" + nm, (2.42, sgn * 1.43, 0.345), 0.17, 0.25, HUBM,
        rot=(math.radians(90), 0, 0), parent=ROOTOB)
# tail wheel + strut (boom belly is ~2.1 high back here: the strut is LONG)
cyl("SH_TailStrut", (-6.32, 0, 1.13), 0.055, 1.95, METAL, rot=(0, math.radians(10), 0), parent=ROOTOB)
cyl("SH_TailBrace", (-6.61, 0, 1.30), 0.03, 1.16, METAL, rot=(0, math.radians(-19), 0), parent=ROOTOB)
cyl("SH_WheelTail", (-6.48, 0, 0.205), 0.205, 0.13, TIRE, rot=(math.radians(90), 0, 0), verts=24, parent=ROOTOB)
cyl("SH_WheelTailHub", (-6.48, 0, 0.205), 0.09, 0.14, HUBM, rot=(math.radians(90), 0, 0), parent=ROOTOB)

# ================================================================ GLAZING
# FINISH PASS: conformal patches that HUG the loft — a dark frame patch a
# few mm proud of the skin, glass a few mm proud of the frame. The old flat
# boxes floated off the curved nose and read as black decals at distance.
# Angles are loft t in degrees (0 port equator, 90 top, 180 stbd, 270 belly).
def glaze(name, x0, x1, t0d, t1d):
    D = math.radians
    # frame margin is only 1.5 deg: near the section equator a superellipse
    # runs ~3.5 cm of z per degree, so the original 4-5 deg margins ballooned
    # into broad bands that read as phantom panels (diagnosed round 3)
    surf_patch("SH_GlazeFrame" + name, FUSE_STATIONS, x0 - 0.04, x1 + 0.04,
               D(t0d - 1.5), D(t1d + 1.5), 0.004, AIRD, nx=8, nt=8, parent=ROOTOB)
    return surf_patch("SH_Glaze" + name, FUSE_STATIONS, x0, x1,
                      D(t0d), D(t1d), 0.011, GLASS, nx=10, nt=10, parent=ROOTOB)

def glaze_band(name, xmax, xmin, t0d, t1d, ft=1.5):
    """Nose glazing as loft bands (frame proud 0.6%, glass 1.4%): parallels
    the skin exactly — the surf_patch version faceted on the nose."""
    D = math.radians
    loft_band("SH_GlazeFrame" + name, FUSE_STATIONS, xmax + 0.05, xmin - 0.05,
              D(t0d - ft), D(t1d + ft), 1.006, AIRD, parent=ROOTOB)
    return loft_band("SH_Glaze" + name, FUSE_STATIONS, xmax, xmin,
                     D(t0d), D(t1d), 1.014, GLASS, parent=ROOTOB)

for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    if sgn > 0:
        ws, cw, cb, aw = (33, 86), (-2, 40), (-30, -2), (0, 16)
    else:
        ws, cw, cb, aw = (94, 147), (140, 182), (182, 210), (164, 180)
    glaze_band("Windshield" + nm, 6.88, 6.02, ws[0], ws[1])  # raked front pair
    glaze_band("Chin" + nm, 6.72, 6.02, cb[0], cb[1])        # lower brow glass
    glaze("CockpitWin" + nm, 4.95, 6.08, cw[0], cw[1])     # pilot door window
    glaze("CabinWinMid" + nm, 1.26, 1.84, aw[0], aw[1])    # cabin windows are
    glaze("CabinWinAft" + nm, 0.26, 0.84, aw[0], aw[1])    # framed glass now
# center pillar re-seated on the new glass (follows the nose slope)
box("SH_WindshieldPillar", (6.52, 0, 2.87), (0.66, 0.075, 0.055), AIRD,
    rot=(0, math.radians(-14), 0), parent=ROOTOB)
# wipers parked vertically against the pillar, on the glass
for sgn in (1, -1):
    box("SH_Wiper%d" % sgn, (6.50, sgn * 0.16, 2.78), (0.03, 0.04, 0.42), DARK,
        rot=(0, math.radians(-16), 0), parent=ROOTOB)

# ================================================================ SLIDING DOORS
def build_door(sgn, nm):
    piv = empty("DoorPivot_" + nm, (3.28, sgn * 1.16, 1.70), parent=ROOTOB)
    d = box("SH_Door" + nm, (0, 0, 0), (1.32, 0.07, 1.48), AIR, bevel=0.05, parent=piv)
    # FINISH PASS: dark gasket frame around the aperture (stays with the
    # airframe when the door slides) + a frame plate behind the door glass
    box("SH_DoorGasket" + nm, (3.28, sgn * 1.172, 1.70), (1.46, 0.02, 1.60), SEAM, parent=ROOTOB)
    box("SH_DoorWinFrame" + nm, (0.05, sgn * 0.041, 0.32), (1.07, 0.014, 0.74), SEAM, parent=piv)
    # door window (upper) + small lower window
    box("SH_DoorWindow" + nm, (0.05, sgn * 0.045, 0.32), (0.95, 0.03, 0.62), GLASS, parent=piv)
    box("SH_DoorHandle" + nm, (0.45, sgn * 0.06, -0.1), (0.16, 0.03, 0.05), DARK, parent=piv)
    # rail above door
    box("SH_DoorRail" + nm, (3.28, sgn * 1.19, 2.52), (2.5, 0.05, 0.07), AIRD, parent=ROOTOB)
    return piv
door_port = build_door(1, "Port")
door_stbd = build_door(-1, "Stbd")

# ================================================================ INTERIOR
# cabin tub: floor, ceiling, inner walls, bulkheads
box("SH_CabinFloor", (1.9, 0, 0.99), (5.6, 2.02, 0.06), INTD, parent=ROOTOB)
box("SH_CabinCeiling", (1.9, 0, 2.90), (5.6, 2.02, 0.05), INTM, parent=ROOTOB)
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    # walls stop at the door aperture (x 2.58..3.98) so the doorway opens into the real cabin
    box("SH_CabinWall" + nm, (0.84, sgn * 1.03, 1.95), (3.48, 0.05, 1.86), INTM, parent=ROOTOB)
    box("SH_CabinWallFwd" + nm, (4.29, sgn * 1.03, 1.95), (0.62, 0.05, 1.86), INTM, parent=ROOTOB)
box("SH_BulkheadAft", (-0.85, 0, 1.95), (0.06, 2.02, 1.92), INTM, parent=ROOTOB)
# fwd bulkhead has a center passage (cockpit <-> cabin walkway, as on the real aircraft)
for sgn in (1, -1):
    box("SH_BulkheadFwd%d" % sgn, (4.62, sgn * 0.685, 1.95), (0.06, 0.65, 1.92), INTM, parent=ROOTOB)
# dome lights
for x in (3.4, 1.2):
    box("SH_DomeLight%d" % int(x * 10), (x, 0, 2.86), (0.22, 0.3, 0.03), WHITEL, parent=ROOTOB)

# ---- cockpit
box("SH_Panel", (6.06, 0, 1.98), (0.34, 1.72, 0.78), INTD,
    rot=(0, math.radians(12), 0), parent=ROOTOB)
box("SH_Glareshield", (6.16, 0, 2.42), (0.42, 1.78, 0.06), DARK, parent=ROOTOB)
# MFD screens: 2 per pilot — on the panel's PILOT face (x 5.87, panel spans 5.89..6.23)
for sgn in (1, -1):
    pane_s = box("SH_MFD%d_a" % sgn, (5.87, sgn * 0.46, 2.06), (0.04, 0.40, 0.34), SCRN,
                 rot=(0, math.radians(12), 0), parent=ROOTOB)
    box("SH_MFD%d_b" % sgn, (5.87, sgn * 0.44, 1.68), (0.04, 0.38, 0.26), SCRN2,
        rot=(0, math.radians(12), 0), parent=ROOTOB)
box("SH_MFDCenter", (5.87, 0, 1.86), (0.04, 0.34, 0.44), SCRN, rot=(0, math.radians(12), 0), parent=ROOTOB)
box("SH_Console", (5.72, 0, 1.24), (0.85, 0.44, 0.5), INTD, parent=ROOTOB)
box("SH_OverheadPanel", (5.95, 0, 2.80), (0.6, 0.8, 0.06), INTD, parent=ROOTOB)
# pedestal throttle quadrant hint
box("SH_Quadrant", (5.55, 0, 1.56), (0.4, 0.22, 0.1), DARK, parent=ROOTOB)

def pilot_seat(nm, y):
    g = empty("Seat_" + nm, (5.05, y, 0), parent=ROOTOB)
    box("SH_SeatPan" + nm, (0, 0, 1.22), (0.55, 0.52, 0.10), SEATP, bevel=0.03, parent=g)
    box("SH_SeatBack" + nm, (-0.28, 0, 1.62), (0.12, 0.52, 0.85), SEAT, bevel=0.04,
        rot=(0, math.radians(6), 0), parent=g)
    box("SH_Headrest" + nm, (-0.33, 0, 2.14), (0.10, 0.30, 0.22), SEAT, bevel=0.03, parent=g)
    box("SH_SeatBase" + nm, (0, 0, 1.05), (0.45, 0.44, 0.28), INTD, parent=g)
    # harness straps
    box("SH_Harness" + nm, (-0.20, 0, 1.75), (0.03, 0.30, 0.55), DARK, parent=g)
    # cyclic between knees + collective on left side
    cyl("SH_Cyclic" + nm, (0.28, 0, 1.28), 0.025, 0.34, DARK,
        rot=(0, math.radians(-16), 0), parent=g)
    box("SH_Collective" + nm, (0.05, 0.36, 1.28), (0.34, 0.06, 0.06), DARK,
        rot=(0, math.radians(-24), 0), parent=g)
pilot_seat("Pilot", -0.55)
pilot_seat("Copilot", 0.55)
# pedals
for sgn in (1, -1):
    for k in (-1, 1):
        box("SH_Pedal%d_%d" % (sgn, k), (5.78, sgn * 0.55 + k * 0.14, 1.18), (0.05, 0.1, 0.16), DARK, parent=ROOTOB)

# ---- cabin troop seats (benches along aft walls)
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    box("SH_BenchPan" + nm, (0.55, sgn * 0.78, 1.28), (2.1, 0.42, 0.07), SEAT, bevel=0.02, parent=ROOTOB)
    box("SH_BenchBack" + nm, (0.55, sgn * 0.97, 1.62), (2.1, 0.06, 0.62), SEAT, bevel=0.02, parent=ROOTOB)
    box("SH_BenchLegs" + nm, (0.55, sgn * 0.80, 1.10), (2.0, 0.34, 0.3), INTD, parent=ROOTOB)
# fwd cabin jump seats facing aft (by the doors)
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    box("SH_JumpSeat" + nm, (4.30, sgn * 0.72, 1.30), (0.45, 0.45, 0.07), SEAT, bevel=0.02, parent=ROOTOB)
    box("SH_JumpBack" + nm, (4.52, sgn * 0.72, 1.60), (0.06, 0.45, 0.55), SEAT, bevel=0.02, parent=ROOTOB)

# ---- door gunner station (PORT): swing-arm mount + M240-style gun
gun_pivot = empty("GunPivot_Port", (3.30, 1.02, 1.62), parent=ROOTOB)
box("SH_GunArmBase", (0, 0.0, -0.25), (0.10, 0.10, 0.5), METAL, parent=gun_pivot)
arm = box("SH_GunArm", (0, 0.06, 0.12), (0.07, 0.5, 0.07), METAL,
          rot=(math.radians(-18), 0, 0), parent=gun_pivot)
gun = empty("DoorGun_Port", (0, 0.08, 0.30), parent=gun_pivot)
box("SH_GunReceiver", (0.05, 0, 0), (0.52, 0.13, 0.17), METAL, bevel=0.02, parent=gun)
cyl("SH_GunBarrel", (0.52, 0, 0.02), 0.028, 0.62, METAL, rot=(0, math.radians(90), 0), parent=gun)
cyl("SH_GunShroud", (0.38, 0, 0.02), 0.045, 0.30, DARK, rot=(0, math.radians(90), 0), parent=gun)
box("SH_GunGrip", (-0.22, 0, -0.06), (0.16, 0.05, 0.10), DARK, parent=gun)
box("SH_AmmoCan", (-0.05, -0.16, -0.05), (0.30, 0.12, 0.22), SEATP, bevel=0.01, parent=gun)
# ammo can + gunner seat in cabin at port door
box("SH_GunnerAmmoBox", (3.9, 0.75, 1.16), (0.4, 0.3, 0.3), METAL, bevel=0.02, parent=ROOTOB)
# stbd door: stowed mount post (gun ships port side per ref)
box("SH_GunPostStbd", (3.30, -1.05, 1.35), (0.09, 0.09, 0.55), METAL, parent=ROOTOB)

# ================================================================ DETAILS
# FLIR turret under nose
sphere("SH_FlirMount", (6.95, 0, 1.02), (0.26, 0.26, 0.20), AIRD, parent=ROOTOB)
sphere("SH_FlirBall", (6.95, 0, 0.88), (0.21, 0.21, 0.21), DARK, parent=ROOTOB)
cyl("SH_FlirLens", (7.13, 0, 0.86), 0.075, 0.05, SCRN, rot=(0, math.radians(90), 0), parent=ROOTOB)
# rescue hoist (starboard, above door)
box("SH_HoistArm", (3.30, -1.32, 2.62), (0.55, 0.42, 0.16), AIR, bevel=0.03, parent=ROOTOB)
cyl("SH_HoistDrum", (3.30, -1.50, 2.58), 0.09, 0.14, METAL, rot=(math.radians(90), 0, 0), parent=ROOTOB)
cyl("SH_HoistCable", (3.30, -1.52, 2.28), 0.012, 0.5, DARK, parent=ROOTOB)
box("SH_HoistHook", (3.30, -1.52, 2.0), (0.05, 0.05, 0.09), METAL, parent=ROOTOB)
# pitot tube (nose, starboard) + AOA vane
cyl("SH_Pitot", (7.15, -0.72, 1.95), 0.018, 0.5, METAL, rot=(0, math.radians(90), 0), parent=ROOTOB)
# wire cutters above / below cockpit
box("SH_CutterTop", (6.45, 0, 3.06), (0.35, 0.04, 0.18), AIRD, rot=(0, math.radians(-24), 0), parent=ROOTOB)
box("SH_CutterLow", (6.70, 0, 1.06), (0.3, 0.04, 0.16), AIRD, rot=(0, math.radians(24), 0), parent=ROOTOB)
# door steps
for sgn, nm in ((1, "Port"), (-1, "Stbd")):
    box("SH_Step" + nm, (3.3, sgn * 1.28, 0.82), (0.5, 0.28, 0.05), AIRD, parent=ROOTOB)
    # orange rescue placards by doors (per ref accents)
    box("SH_Placard" + nm, (4.15, sgn * 1.175, 1.55), (0.20, 0.02, 0.10), ORNG, parent=ROOTOB)
# position lights: port red / stbd green on sponson tips, white tail
sphere("SH_PosLightPort", (3.32, 1.47, 1.0), (0.05, 0.05, 0.05), REDL, parent=ROOTOB)
sphere("SH_PosLightStbd", (3.32, -1.47, 1.0), (0.05, 0.05, 0.05), GRNL, parent=ROOTOB)
sphere("SH_PosLightTail", (-7.72, 0, 2.86), (0.045, 0.045, 0.045), WHITEL, parent=ROOTOB)
# tail bumper / skid under aft boom
box("SH_TailSkid", (-6.9, 0, 1.95), (0.5, 0.08, 0.22), AIRD, rot=(0, math.radians(20), 0), parent=ROOTOB)

# ================================================================ FINISH PASS: seams & joints
# Tail-fold collar: the MH-60 tail folds at this boom station for shipboard
# stowage — a short band loft matched to the boom section (+~3%), in seam gray.
loft("SH_TailFoldRing", [(-5.86, 0.470, 0.505, 2.545), (-5.98, 0.455, 0.495, 2.562)],
     SEAM, n=28, parent=ROOTOB)
# rotor-deck panel seams across the doghouse top plate
for sx in (1.35, 0.15):
    box("SH_DeckSeam%d" % int(sx * 100), (sx, 0, 3.592), (0.035, 1.16, 0.012), SEAM, parent=ROOTOB)

# ================================================================ MARKINGS
def marking(text, loc, size, sgn, nm):
    """Decal text on a fuselage side. Basis built explicitly (right/up/normal)
    so the lettering reads correctly on BOTH sides — euler combos mirrored it."""
    from mathutils import Matrix, Vector as MV
    bpy.ops.object.text_add(location=(0, 0, 0))
    t = bpy.context.object; t.name = nm; t.data.body = text
    t.data.size = size; t.data.extrude = 0.006; t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    bpy.ops.object.convert(target='MESH')
    t = bpy.context.object
    n = MV((0, sgn, 0)); u = MV((0, 0, 1)); r = u.cross(n)
    m = Matrix.Identity(4)
    m.col[0][:3] = r; m.col[1][:3] = u; m.col[2][:3] = n
    m.translation = loc
    t.matrix_world = m
    t.data.materials.append(MARK); t.parent = ROOTOB
    return t
# "615" both sides of tail boom + "HSC-5" beneath (per Ian's image)
for sgn in (1, -1):
    marking("615", (-4.55, sgn * 0.60, 2.52), 0.78, sgn, "SH_Mark615_%d" % sgn)
    marking("HSC-5", (-4.55, sgn * 0.565, 2.06), 0.30, sgn, "SH_MarkHSC_%d" % sgn)
    # "US NAVY" on doghouse sides
    marking("US NAVY", (1.15, sgn * 0.815, 3.14), 0.30, sgn, "SH_MarkUSN_%d" % sgn)
    # "NAVY" small on fin
    marking("NAVY", (-7.05, sgn * 0.108, 3.85), 0.24, sgn, "SH_MarkFin_%d" % sgn)

# ================================================================ EXPORT
os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB',
                          use_selection=True, export_apply=True, export_yup=True,
                          export_image_format='JPEG', export_image_quality=90)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print("SEAHAWK EXPORTED", GLB_OUT, "mesh objects:", sum(1 for o in bpy.data.objects if o.type == 'MESH'),
      "polys:", tris)
