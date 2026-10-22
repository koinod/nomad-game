#!/usr/bin/env python3
"""MODELED VEGETATION — Blender build (NOMAD world dressing, BETA_SCATTER).

Builds the six modeled vegetation classes declared in
src/data/betaLayout.ts (BETA_SCATTER) as GLBs with two LODs each:

  live_oak     maritime live oak — spreading limbs, canopy masses,
               leaf cards, hanging Spanish moss strands
  loblolly     loblolly pine — tall tapered trunk, tiered whorl
               branches, needle-cluster masses
  wax_myrtle   multi-stem understory shrub, foliage masses + cards
  needle_rush  black needle rush — dark tapered blades, waterline clump
  spartina     spartina cordgrass — arching blades + seed stalks
  dune_grass   sea-oat dune grass — arching straw blades + oat heads

Every class is REAL modeled geometry: branching structures are tubes
along curved spines with per-ring radii (never a cone/cylinder
primitive standing alone), canopies are noise-displaced icosphere
masses, foliage detail is leaf-card quads and blade strips. One joined
mesh per LOD, named LOD0 (near) / LOD1 (far: trunk + canopy masses of
the same model, no cards), origin at the ground point, single
vertex-color material — the engine supplies its own MeshStandardMaterial
with vertexColors and patches it with the shared wind sway
(src/game/Clouds.ts applyWindSway).

Deterministic: one random.Random(seed) per class per LOD.

Run: blender -b --python tools/vegetation/build_vegetation.py
Out: public/models/veg-<class>.glb  (+ tools/vegetation/vegetation.blend)
"""
import bpy
import os
import random
import sys
from math import cos, sin, pi, sqrt
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(ROOT, "..", ".."))
OUT_DIR = os.path.join(WT, "public", "models")

# ─── geometry assembly (plain lists; one mesh per LOD) ──────────────────────


class Geom:
    """verts / faces / per-vertex colors accumulator."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.colors = []

    def vert(self, p, color):
        self.verts.append((p.x, p.y, p.z))
        # palette entries are RGB; the color attribute wants RGBA
        self.colors.append(color if len(color) == 4 else (color[0], color[1], color[2], 1.0))
        return len(self.verts) - 1

    def tri(self, a, b, c):
        self.faces.append((a, b, c))

    def quad(self, a, b, c, d):
        self.faces.append((a, b, c))
        self.faces.append((a, c, d))


def shade(color, f):
    return (color[0] * f, color[1] * f, color[2] * f, 1.0)


def jitter(rng, color, amt):
    f = 1.0 + (rng.random() * 2 - 1) * amt
    return (max(0.0, color[0] * f), max(0.0, color[1] * f), max(0.0, color[2] * f), 1.0)


def emit_tube(g, spine, radial, color, tip_color=None, uv_bend=None):
    """Tube along a spine of (point, radius). Rings are framed by a
    carried normal so bends don't twist. Ends: base ring open (sits in
    the ground), tip closed with a fan to a point past the last ring."""
    n = len(spine)
    frames = []
    prev_n = None
    for i in range(n):
        p = spine[i][0]
        if i == 0:
            tan = (spine[1][0] - p)
        elif i == n - 1:
            tan = (p - spine[i - 1][0])
        else:
            tan = (spine[i + 1][0] - spine[i - 1][0])
        tan.normalize()
        ref = Vector((0, 0, 1)) if abs(tan.z) < 0.9 else Vector((1, 0, 0))
        if prev_n is None:
            nrm = ref - tan * ref.dot(tan)
            nrm.normalize()
        else:
            nrm = prev_n - tan * prev_n.dot(tan)
            nrm.normalize()
        binm = tan.cross(nrm)
        frames.append((nrm, binm))
        prev_n = nrm
    rings = []
    for i in range(n):
        p, r = spine[i]
        nrm, binm = frames[i]
        f = i / max(1, n - 1)
        col = color if tip_color is None else tuple(
            color[k] + (tip_color[k] - color[k]) * f for k in range(3)) + (1.0,)
        ring = []
        for j in range(radial):
            a = (j / radial) * 2 * pi
            off = nrm * cos(a) * r + binm * sin(a) * r
            ring.append(g.vert(p + off, col))
        rings.append(ring)
    for i in range(n - 1):
        for j in range(radial):
            j2 = (j + 1) % radial
            g.quad(rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j])
    # tip fan
    p_last, r_last = spine[-1]
    tan = (spine[-1][0] - spine[-2][0])
    tan.normalize()
    tip = g.vert(p_last + tan * (r_last * 1.6 + 0.01),
                 tip_color if tip_color is not None else color)
    for j in range(radial):
        j2 = (j + 1) % radial
        g.tri(rings[-1][j], rings[-1][j2], tip)


def ico_sphere(center, radius, subdiv):
    """Icosphere verts/faces (unit), scaled later. Returns (verts, faces)
    in local space around the origin."""
    t = (1.0 + sqrt(5.0)) / 2.0
    verts = [
        (-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0),
        (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
        (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1),
    ]
    verts = [Vector(v).normalized() for v in verts]
    faces = [
        (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
        (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
        (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
        (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
    ]
    for _ in range(subdiv):
        cache = {}
        new_faces = []

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key in cache:
                return cache[key]
            m = (verts[a] + verts[b]) * 0.5
            m.normalize()
            verts.append(m)
            cache[key] = len(verts) - 1
            return cache[key]

        for (a, b, c) in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            new_faces += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = new_faces
    return verts, faces


def emit_mass(g, rng, center, radii, subdiv, color, disp=0.34, squash=0.78):
    """A noise-displaced icosphere canopy mass. Color darkens toward the
    underside/interior so the mass reads as lit foliage, not a ball."""
    verts, faces = ico_sphere(center, 1.0, subdiv)
    idx = []
    for v in verts:
        d = 1.0 + (rng.random() * 2 - 1) * disp
        p = Vector((v.x * radii.x * d, v.y * radii.y * d, v.z * radii.z * d * squash))
        shadef = 0.62 + 0.38 * max(0.0, v.z) + rng.random() * 0.16
        idx.append(g.vert(center + p, shade(color, shadef)))
    for (a, b, c) in faces:
        g.tri(idx[a], idx[b], idx[c])
    return center


def emit_card(g, rng, center, size, color, up_bias=0.4):
    """One leaf card: a quad facing a random direction (biased up),
    slightly folded along its diagonal via a raised center pair —
    2 triangles, 4 verts (fold suggested by vertex color, geometry flat
    so seam duplicates share positions exactly)."""
    n = Vector((rng.random() * 2 - 1, rng.random() * 2 - 1,
                rng.random() * up_bias + 0.25)).normalized()
    u = Vector((0, 0, 1)).cross(n)
    if u.length < 0.01:
        u = Vector((1, 0, 0))
    u.normalize()
    v = n.cross(u)
    w = size * (0.75 + rng.random() * 0.5)
    h = size * (0.6 + rng.random() * 0.4)
    col = jitter(rng, color, 0.22)
    c00 = g.vert(center - u * w - v * h, shade(col, 0.8))
    c10 = g.vert(center + u * w - v * h, shade(col, 0.9))
    c11 = g.vert(center + u * w + v * h, col)
    c01 = g.vert(center - u * w + v * h, shade(col, 0.95))
    g.quad(c00, c10, c11, c01)


def emit_blade(g, rng, base, height, width, lean_dir, lean_amt,
               col_base, col_tip, segs=2):
    """A tapered, bending blade strip: levels rise and lean, widths
    shrink to a tip point. segs=2 -> 3 tris, segs=1 -> 2 tris + tip tri."""
    side = Vector((-lean_dir.y, lean_dir.x, 0))
    if side.length < 0.01:
        side = Vector((1, 0, 0))
    side.normalize()
    levels = []
    for i in range(segs + 1):
        f = i / segs
        w = width * (1.0 - f * 0.72)
        p = base + Vector((0, 0, height * f)) + lean_dir * (lean_amt * f * f * height)
        col = tuple(col_base[k] + (col_tip[k] - col_base[k]) * f for k in range(3)) + (1.0,)
        levels.append((g.vert(p - side * w, col), g.vert(p + side * w, col)))
    tip_p = base + Vector((0, 0, height * 1.12)) + lean_dir * (lean_amt * 1.25 * height)
    tip = g.vert(tip_p, col_tip + (1.0,))
    for i in range(segs):
        a, b = levels[i]
        c, d = levels[i + 1]
        g.quad(a, b, d, c)
    a, b = levels[-1]
    g.tri(a, b, tip)


def emit_strand(g, rng, top, length, color):
    """A hanging Spanish-moss strand: thin 3-sided tapered tube,
    3 segments, slight sway offset as it descends."""
    radial = 3
    rings = []
    drift = Vector((rng.random() - 0.5, rng.random() - 0.5, 0)) * 0.12
    for i in range(4):
        f = i / 3
        r = 0.028 * (1.0 - f * 0.75)
        c = top + Vector((drift.x * f, drift.y * f, -length * f))
        ring = []
        for j in range(radial):
            a = (j / radial) * 2 * pi + f * 0.8
            ring.append(g.vert(c + Vector((cos(a) * r, sin(a) * r, 0)),
                               shade(color, 0.85 + f * 0.3)))
        rings.append(ring)
    for i in range(3):
        for j in range(radial):
            j2 = (j + 1) % radial
            g.quad(rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j])


# ─── palette (linear-ish values; engine material is vertexColors) ──────────

BARK_OAK = (0.23, 0.18, 0.13)
BARK_PINE = (0.30, 0.20, 0.13)
BARK_MYRTLE = (0.32, 0.24, 0.17)
OAK_LEAF = (0.16, 0.32, 0.12)
PINE_NEEDLE = (0.10, 0.26, 0.13)
MYRTLE_LEAF = (0.14, 0.30, 0.13)
MOSS = (0.45, 0.48, 0.38)
RUSH_BASE = (0.13, 0.18, 0.10)
RUSH_TIP = (0.38, 0.28, 0.16)
SPART_BASE = (0.20, 0.32, 0.12)
SPART_TIP = (0.52, 0.55, 0.24)
DUNE_BASE = (0.30, 0.38, 0.16)
DUNE_TIP = (0.62, 0.58, 0.34)
OAT_HEAD = (0.66, 0.58, 0.36)


def spine_from(points_radii):
    return [(Vector(p), r) for (p, r) in points_radii]


# ─── class builders ──────────────────────────────────────────────────────────


def build_live_oak(rng, lod):
    g = Geom()
    near = lod == 0
    radial = 7 if near else 5
    # Trunk: short, massive, slight lean, flares at the base.
    lean = Vector((rng.uniform(-0.14, 0.14), rng.uniform(-0.14, 0.14), 0))
    trunk_top = Vector((lean.x * 2.2, lean.y * 2.2, 2.2))
    emit_tube(g, spine_from([
        ((0, 0, -0.25), 0.52),
        ((lean.x * 0.5, lean.y * 0.5, 0.8), 0.44),
        ((lean.x * 1.4, lean.y * 1.4, 1.6), 0.36),
        ((trunk_top.x, trunk_top.y, 2.2), 0.30),
    ]), radial, BARK_OAK)
    # Primary limbs: wide-spreading, rise at the tips (live oak habit).
    limb_tips = []
    n_limbs = 5 if near else 4
    for i in range(n_limbs):
        a = (i / n_limbs) * 2 * pi + rng.uniform(-0.3, 0.3)
        reach = rng.uniform(2.3, 3.3)
        base = trunk_top + Vector((cos(a) * 0.18, sin(a) * 0.18, rng.uniform(-0.25, 0.3)))
        mid = base + Vector((cos(a) * reach * 0.55, sin(a) * reach * 0.55,
                             rng.uniform(0.35, 0.8)))
        tip = base + Vector((cos(a) * reach, sin(a) * reach,
                             rng.uniform(1.15, 1.75)))
        emit_tube(g, spine_from([
            ((base.x, base.y, base.z), 0.20),
            ((mid.x, mid.y, mid.z), 0.12),
            ((tip.x, tip.y, tip.z), 0.05),
        ]), 5 if near else 4, BARK_OAK)
        limb_tips.append(tip)
        if near:
            # one secondary twig per limb (bare — shares the limb's mass)
            t2 = tip + Vector((cos(a + 0.7) * 0.8, sin(a + 0.7) * 0.8, 0.55))
            emit_tube(g, spine_from([
                ((tip.x, tip.y, tip.z), 0.045),
                ((t2.x, t2.y, t2.z), 0.018),
            ]), 4, BARK_OAK)
    # Canopy masses over the primary limb ends + a broad crown center.
    masses = []
    crown_c = trunk_top + Vector((0, 0, 1.9))
    masses.append(emit_mass(g, rng, crown_c, Vector((3.1, 3.1, 1.7)),
                            1, OAK_LEAF, disp=0.30))
    for tip in limb_tips:
        masses.append(emit_mass(g, rng, tip + Vector((0, 0, 0.45)),
                                Vector((1.35, 1.35, 0.8)),
                                1 if near else 0, OAK_LEAF, disp=0.36))
    if near:
        # Leaf cards peppered on the canopy shell.
        for c in masses:
            for _ in range(8):
                off = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.4, 1)))
                off.normalize()
                emit_card(g, rng, c + off * rng.uniform(1.2, 2.2), 0.34, OAK_LEAF)
        # Spanish moss: strands hang from the limb undersides.
        for tip in limb_tips:
            for _ in range(2):
                top = tip + Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), -0.1))
                emit_strand(g, rng, top, rng.uniform(0.7, 1.3), MOSS)
    return g


def build_loblolly(rng, lod):
    g = Geom()
    near = lod == 0
    # Tall straight trunk, gentle taper, slight wander.
    H = 11.5
    rings = 7 if near else 5
    spine = []
    for i in range(rings + 1):
        f = i / rings
        spine.append(((rng.uniform(-0.05, 0.05) * f * 3, rng.uniform(-0.05, 0.05) * f * 3,
                       -0.25 + (H + 0.25) * f), 0.34 * (1 - f) + 0.05 * f + 0.02))
    emit_tube(g, spine_from(spine), 7 if near else 5, BARK_PINE)
    if not near:
        # Far LOD: the tiered silhouette is what survives distance —
        # flattened ring masses ON the trunk at the whorl heights, no
        # branch tubes. Same tier heights/envelope as the near build.
        for t in range(4):
            f = t / 3
            h = H * (0.48 + 0.5 * f)
            r = 2.3 * (1 - f * 0.62) * 0.66
            emit_mass(g, rng, Vector((0, 0, h + 0.1)), Vector((r, r, 0.55)),
                      0, PINE_NEEDLE, disp=0.34)
        emit_mass(g, rng, Vector((0, 0, H + 0.25)), Vector((0.6, 0.6, 0.55)),
                  0, PINE_NEEDLE, disp=0.38)
        return g
    # Near: whorled tiers in the upper 55% — branches angle out and
    # slightly down, chunky displaced needle masses at mid + tip (the
    # bottom two tiers are mostly seen through the tiers above, so
    # they carry the tip mass only). Tiers shrink toward the top.
    tiers = 6
    for t in range(tiers):
        f = t / max(1, tiers - 1)
        h = H * (0.48 + 0.5 * f)
        blen = 2.3 * (1 - f * 0.62)
        n_br = 4
        for b in range(n_br):
            a = (b / n_br) * 2 * pi + t * 0.9 + rng.uniform(-0.2, 0.2)
            base = Vector((0, 0, h))
            mid = base + Vector((cos(a) * blen * 0.55, sin(a) * blen * 0.55, -0.16))
            tip = base + Vector((cos(a) * blen, sin(a) * blen, 0.22))
            emit_tube(g, spine_from([
                ((base.x, base.y, base.z), 0.075),
                ((mid.x, mid.y, mid.z), 0.045),
                ((tip.x, tip.y, tip.z), 0.02),
            ]), 4, BARK_PINE)
            if t >= 4:
                emit_mass(g, rng, mid + Vector((0, 0, 0.06)),
                          Vector((0.62, 0.62, 0.4)), 0, PINE_NEEDLE, disp=0.42)
            emit_mass(g, rng, tip + Vector((0, 0, 0.1)),
                      Vector((0.55, 0.55, 0.38)), 0, PINE_NEEDLE, disp=0.42)
    # leader tuft at the very top
    emit_mass(g, rng, Vector((0, 0, H + 0.25)), Vector((0.6, 0.6, 0.55)),
              1, PINE_NEEDLE, disp=0.38)
    return g


def build_wax_myrtle(rng, lod):
    g = Geom()
    near = lod == 0
    stems = 5 if near else 4
    tops = []
    for i in range(stems):
        a = (i / stems) * 2 * pi + rng.uniform(-0.4, 0.4)
        r0 = rng.uniform(0.05, 0.22)
        base = Vector((cos(a) * r0, sin(a) * r0, -0.1))
        top = Vector((cos(a) * rng.uniform(0.4, 0.75), sin(a) * rng.uniform(0.4, 0.75),
                      rng.uniform(1.1, 1.7)))
        mid = (base + top) * 0.5 + Vector((0, 0, 0.12))
        emit_tube(g, spine_from([
            ((base.x, base.y, base.z), 0.05),
            ((mid.x, mid.y, mid.z), 0.035),
            ((top.x, top.y, top.z), 0.018),
        ]), 4, BARK_MYRTLE)
        tops.append(top)
    for top in tops:
        emit_mass(g, rng, top + Vector((0, 0, 0.34)), Vector((0.62, 0.62, 0.5)),
                  1 if near else 0, MYRTLE_LEAF, disp=0.36)
    emit_mass(g, rng, Vector((0, 0, 1.55)), Vector((0.85, 0.85, 0.62)),
              1 if near else 0, MYRTLE_LEAF, disp=0.36)
    if near:
        for top in tops:
            for _ in range(3):
                off = Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0.1, 0.7)))
                emit_card(g, rng, top + off, 0.26, MYRTLE_LEAF)
    return g


def build_needle_rush(rng, lod):
    g = Geom()
    near = lod == 0
    blades = 13 if near else 7
    for _ in range(blades):
        a = rng.uniform(0, 2 * pi)
        r = rng.uniform(0, 0.30)
        base = Vector((cos(a) * r, sin(a) * r, -0.06))
        lean = Vector((cos(a), sin(a), 0))
        emit_blade(g, rng, base, rng.uniform(0.85, 1.25), 0.020,
                   lean, rng.uniform(0.04, 0.16), RUSH_BASE, RUSH_TIP,
                   segs=2 if near else 1)
    return g


def build_spartina(rng, lod):
    g = Geom()
    near = lod == 0
    blades = 12 if near else 7
    for _ in range(blades):
        a = rng.uniform(0, 2 * pi)
        r = rng.uniform(0, 0.34)
        base = Vector((cos(a) * r, sin(a) * r, -0.05))
        lean = Vector((cos(a), sin(a), 0))
        emit_blade(g, rng, base, rng.uniform(0.7, 1.05), 0.030,
                   lean, rng.uniform(0.18, 0.4), SPART_BASE, SPART_TIP,
                   segs=2 if near else 1)
    if near:
        # two seed stalks stand above the blades
        for _ in range(2):
            base = Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), -0.05))
            emit_blade(g, rng, base, rng.uniform(1.1, 1.3), 0.012,
                       Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)).normalized(),
                       0.1, SPART_TIP, OAT_HEAD, segs=2)
    return g


def emit_oat_head(g, rng, top, color):
    """Elongated octahedron seed head (8 tris), drooping at the tip."""
    r = 0.045
    h = 0.30
    up = g.vert(top + Vector((0, 0, h * 0.55)), color)
    dn = g.vert(top + Vector((0.03, 0, -h * 0.45)), shade(color, 0.85))
    ring = []
    for j in range(4):
        a = (j / 4) * 2 * pi + 0.4
        ring.append(g.vert(top + Vector((cos(a) * r, sin(a) * r, h * 0.08)),
                           shade(color, 0.95)))
    for j in range(4):
        j2 = (j + 1) % 4
        g.tri(ring[j], ring[j2], up)
        g.tri(ring[j2], ring[j], dn)


def build_dune_grass(rng, lod):
    g = Geom()
    near = lod == 0
    blades = 11 if near else 6
    for _ in range(blades):
        a = rng.uniform(0, 2 * pi)
        r = rng.uniform(0, 0.26)
        base = Vector((cos(a) * r, sin(a) * r, -0.04))
        lean = Vector((cos(a), sin(a), 0))
        emit_blade(g, rng, base, rng.uniform(0.6, 0.95), 0.026,
                   lean, rng.uniform(0.3, 0.55), DUNE_BASE, DUNE_TIP,
                   segs=2 if near else 1)
    if near:
        for _ in range(3):
            base = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), -0.04))
            stalk_top = base + Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), rng.uniform(1.0, 1.2)))
            emit_tube(g, spine_from([
                ((base.x, base.y, base.z), 0.012),
                ((stalk_top.x, stalk_top.y, stalk_top.z), 0.008),
            ]), 3, DUNE_TIP)
            emit_oat_head(g, rng, stalk_top, OAT_HEAD)
    return g


BUILDERS = {
    'live_oak': build_live_oak,
    'loblolly': build_loblolly,
    'wax_myrtle': build_wax_myrtle,
    'needle_rush': build_needle_rush,
    'spartina': build_spartina,
    'dune_grass': build_dune_grass,
}
SEEDS = {
    'live_oak': 0x0A1C,
    'loblolly': 0x10B1,
    'wax_myrtle': 0x1177,
    'needle_rush': 0x1255,
    'spartina': 0x59A7,
    'dune_grass': 0xD01E,
}


def make_object(name, geom):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(geom.verts, [], geom.faces)
    mesh.update()
    colattr = mesh.color_attributes.new(name="Color", type='FLOAT_COLOR', domain='POINT')
    # POINT domain: one color per vertex, in vertex order
    for i, c in enumerate(geom.colors):
        colattr.data[i].color = c
    mesh.color_attributes.active_color = colattr
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def veg_material():
    mat = bpy.data.materials.new("VegMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Color"
    mat.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    return mat


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    mat = veg_material()
    for cls, builder in BUILDERS.items():
        for lod in (0, 1):
            rng = random.Random(SEEDS[cls] * 10 + lod)
            geom = builder(rng, lod)
            obj = make_object(f"{cls}_LOD{lod}", geom)
            obj.data.materials.append(mat)
            tris = len(geom.faces)
            print(f"BUILD {cls} LOD{lod}: {tris} tris, {len(geom.verts)} verts")
        # export one GLB per class containing both LOD nodes, renamed to
        # the engine contract (LOD0 / LOD1)
        bpy.ops.object.select_all(action='DESELECT')
        objs = [bpy.data.objects[f"{cls}_LOD0"], bpy.data.objects[f"{cls}_LOD1"]]
        for o in objs:
            o.select_set(True)
        objs[0].name = "LOD0"
        objs[1].name = "LOD1"
        path = os.path.join(OUT_DIR, f"veg-{cls.replace('_', '-')}.glb")
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', use_selection=True,
            export_apply=True, export_yup=True)
        print(f"EXPORT {path}")
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "vegetation.blend"))


if __name__ == "__main__":
    main()
