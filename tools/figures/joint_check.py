# joint_check.py — vertex-level JOINT CONTINUITY checks for authored
# figure GLBs (joint-continuity pass, 2026-10-21; Ian's playtest
# verdict: "legs disconnected — legs and arms should bend").
#
# Per pivot (armL/armR/legL/legR), in pivot-local space (glTF Y-up,
# +Z = figure front), three mechanical properties:
#   1. TELESCOPE: the limb's own clay reaches >= 0.028 ABOVE the pivot
#      (the joint ball telescopes into the parent segment).
#   2. BEND: the clay below -0.45 hangs displaced toward the flexion
#      direction — arms forward (centroid Z >= +0.022), legs back
#      (centroid Z <= -0.008). A straight stick reads ~0 and fails.
#   3. PARENT COVERAGE: parent-side clay (everything except the two
#      limb subtrees and the head) fills the shell around the pivot:
#      >= 30 verts in the shell (0.25x..1.3x the joint-mass radius,
#      read off the limb's own near-pivot verts) spread over >= 7 of
#      8 direction octants — a pivot backed on one side only (the
#      pre-pass loft wall: 4/8) fails.
# Thresholds calibrated against the pre-pass GLBs (bend + shoulder
# coverage failed on every class; both pass on the rebuilt figures).
import json, math, struct


def _mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def _mat_inv(m):
    a, b, c = m[0][0], m[0][1], m[0][2]
    d, e, f = m[1][0], m[1][1], m[1][2]
    g, h, i = m[2][0], m[2][1], m[2][2]
    A = e * i - f * h; B = -(d * i - f * g); C = d * h - e * g
    det = a * A + b * B + c * C
    inv = [[A / det, (c * h - b * i) / det, (b * f - c * e) / det],
           [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
           [C / det, (b * g - a * h) / det, (a * e - b * d) / det]]
    t = [m[0][3], m[1][3], m[2][3]]
    ti = [-(inv[r][0] * t[0] + inv[r][1] * t[1] + inv[r][2] * t[2]) for r in range(3)]
    return [[inv[0][0], inv[0][1], inv[0][2], ti[0]],
            [inv[1][0], inv[1][1], inv[1][2], ti[1]],
            [inv[2][0], inv[2][1], inv[2][2], ti[2]],
            [0, 0, 0, 1]]


def _node_mat(n):
    if 'matrix' in n:
        v = n['matrix']
        return [[v[0], v[4], v[8], v[12]], [v[1], v[5], v[9], v[13]],
                [v[2], v[6], v[10], v[14]], [v[3], v[7], v[11], v[15]]]
    t = n.get('translation', [0, 0, 0]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[R[0][0] * s[0], R[0][1] * s[1], R[0][2] * s[2], t[0]],
            [R[1][0] * s[0], R[1][1] * s[1], R[1][2] * s[2], t[1]],
            [R[2][0] * s[0], R[2][1] * s[1], R[2][2] * s[2], t[2]],
            [0, 0, 0, 1]]


def _xform(m, v):
    return (m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2] + m[0][3],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2] + m[1][3],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2] + m[2][3])


def pivot_metrics(path):
    """{pivot: {ext_up, low_cz, near, octs}} for every limb pivot."""
    data = open(path, 'rb').read()
    jlen, _ = struct.unpack_from('<II', data, 12)
    g = json.loads(data[20:20 + jlen])
    bin_off = 20 + jlen + 8
    nodes = g['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    world = {}

    def wm(i):
        if i not in world:
            m = _node_mat(nodes[i])
            if i in parent:
                m = _mat_mul(wm(parent[i]), m)
            world[i] = m
        return world[i]

    by_name = {}
    for i, n in enumerate(nodes):
        by_name.setdefault(n.get('name'), []).append(i)

    def subtree(root):
        out, stack = set(), [root]
        while stack:
            i = stack.pop()
            out.add(i)
            stack += nodes[i].get('children', [])
        return out

    def verts(idxs):
        out = []
        for i in idxs:
            n = nodes[i]
            if 'mesh' not in n:
                continue
            for p in g['meshes'][n['mesh']]['primitives']:
                acc = g['accessors'][p['attributes']['POSITION']]
                bv = g['bufferViews'][acc['bufferView']]
                off = bin_off + bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
                stride = bv.get('byteStride') or 12
                for k in range(acc['count']):
                    out.append(_xform(wm(i), struct.unpack_from('<fff', data, off + k * stride)))
        return out

    mesh_nodes = {i for i, n in enumerate(nodes) if 'mesh' in n}
    sib = {'armL': 'armR', 'armR': 'armL', 'legL': 'legR', 'legR': 'legL'}
    out = {}
    for piv in ('armL', 'armR', 'legL', 'legR'):
        if piv not in by_name:
            continue
        pi = by_name[piv][0]
        inv = _mat_inv(wm(pi))
        sub = subtree(pi)
        own = [_xform(inv, v) for v in verts(sub)]
        low = [v for v in own if v[1] < -0.45]
        # the joint mass radius, read off the limb's own ABOVE-pivot
        # verts (the joint ball's dome) — the coverage shell scales
        # with it (the brute's shoulder ball is 2x a standard class's;
        # a fixed 0.105 shell sits INSIDE its cap and sees nothing).
        # Above-pivot only: including the elbow/knee ball (0.31 below)
        # inflates the radius and pushes small classes' caps inside
        # the shell's inner exclusion.
        r_ball = max(math.dist(v, (0, 0, 0)) for v in own if v[1] > -0.01)
        excl = set(sub) | subtree(by_name[sib[piv]][0])
        if 'head' in by_name:
            excl |= subtree(by_name['head'][0])
        pv = [_xform(inv, v) for v in verts(mesh_nodes - excl)]
        near = [v for v in pv if r_ball * 0.25 < math.dist(v, (0, 0, 0)) <= r_ball * 1.3]
        octs = {(1 if v[0] > 0 else -1, 1 if v[1] > 0 else -1, 1 if v[2] > 0 else -1) for v in near}
        out[piv] = dict(
            ext_up=max(v[1] for v in own),
            low_cz=(sum(v[2] for v in low) / len(low)) if low else 0.0,
            near=len(near), octs=len(octs))
    return out


def joint_failures(path):
    """Failure strings for the joint-continuity contract ([] = pass)."""
    fails = []
    for piv, m in pivot_metrics(path).items():
        tag = f"{piv} joint"
        if m['ext_up'] < 0.028:
            fails.append(f"{tag}: telescope ext_up {m['ext_up']:+.3f} < 0.028")
        if piv.startswith('arm'):
            if m['low_cz'] < 0.022:
                fails.append(f"{tag}: elbow bend centroid Z {m['low_cz']:+.3f} < +0.022 (straight arm)")
        else:
            if m['low_cz'] > -0.008:
                fails.append(f"{tag}: knee bend centroid Z {m['low_cz']:+.3f} > -0.008 (straight leg)")
        if m['near'] < 30 or m['octs'] < 7:
            fails.append(f"{tag}: parent coverage near={m['near']} octs={m['octs']}/8 (< 30 verts or < 7 octants)")
    return fails
