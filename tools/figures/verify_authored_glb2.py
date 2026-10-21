# verify_authored_glb2.py — structural contract check for the wave-2
# authored husk GLBs against figureKit's bindFigureGLB expectations.
# Wave 1's verify_authored_glb.py remains the shambler's authority;
# this is its parameterized sibling for the seven wave-2 classes.
# Pure-stdlib GLB parse; exits non-zero on any failure.
# Run: python3 tools/figures/verify_authored_glb2.py <kind|all>
import json, os, struct, sys

BASE = os.path.expanduser("~/workspace/nomad-wt/figures-authored-2/public/figures")

# skull = the UNPOSED skull-center height the class builder targets
# (== HitProfile headY for every kind except the crawler, whose kit
# build stands upright at 1.62 and is re-posed quadruped at runtime).
# hip = 0.48H hip line; legx = the kit's hip pivot half-width 0.055H*bw.
KINDS = {
    'crawler':  dict(file='husk_crawler_authored.glb',  skull=1.62, hip=0.864,  legx=0.0851, extra=[]),
    'spitter':  dict(file='husk_spitter_authored.glb',  skull=1.76, hip=0.888,  legx=0.0875, extra=['sac']),
    'screamer': dict(file='husk_screamer_authored.glb', skull=2.00, hip=1.008,  legx=0.0993, extra=[]),
    'bloater':  dict(file='husk_bloater_authored.glb',  skull=1.76, hip=0.888,  legx=0.1201, extra=[]),
    'stalker':  dict(file='husk_stalker_authored.glb',  skull=1.85, hip=0.936,  legx=0.0922, extra=[]),
    'armored':  dict(file='husk_armored_authored.glb',  skull=1.82, hip=0.9216, legx=0.1246, extra=[]),
    'brute':    dict(file='husk_brute_authored.glb',    skull=2.26, hip=1.152,  legx=0.1558, extra=[]),
}

def verify(kind, spec):
    fails = []
    def check(cond, label):
        print(("PASS " if cond else "FAIL ") + label)
        if not cond: fails.append(label)
    path = os.path.join(BASE, spec['file'])
    data = open(path, 'rb').read()
    magic, ver, total = struct.unpack_from('<III', data, 0)
    check(magic == 0x46546C67, "glTF magic")
    jlen, _ = struct.unpack_from('<II', data, 12)
    g = json.loads(data[20:20 + jlen])
    nodes = g['nodes']
    by_name = {}
    for i, n in enumerate(nodes):
        by_name.setdefault(n.get('name'), []).append(i)
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    def parent_name(idx):
        return nodes[parent[idx]].get('name') if idx in parent else None
    for req in ('torso', 'head', 'jaw', 'armL', 'armR', 'legL', 'legR'):
        check(req in by_name, f"pivot node '{req}' exists")
    check(parent_name(by_name['head'][0]) == 'torso', "head is a child of torso")
    check(parent_name(by_name['jaw'][0]) == 'head', "jaw is a child of head")
    check(parent_name(by_name['armL'][0]) == 'torso', "armL is a child of torso")
    check(parent_name(by_name['armR'][0]) == 'torso', "armR is a child of torso")
    check(parent_name(by_name['legL'][0]) == 'figureRoot', "legL is a root-level child")
    check(parent_name(by_name['torso'][0]) == 'figureRoot', "torso is a root-level child")
    def chain_translation_y(name):
        idx = by_name[name][0]
        y = 0.0
        while True:
            y += nodes[idx].get('translation', [0, 0, 0])[1]
            if idx not in parent: break
            idx = parent[idx]
        return y
    check(abs(chain_translation_y('skull') - spec['skull']) < 0.03,
          f"skull node world Y = {chain_translation_y('skull'):.3f} (target {spec['skull']})")
    check(abs(nodes[by_name['torso'][0]].get('translation', [0, 0, 0])[1] - spec['hip']) < 0.01,
          "torso pivot at the hip line")
    for leg in ('legL', 'legR'):
        t = nodes[by_name[leg][0]].get('translation', [0, 0, 0])
        check(abs(abs(t[0]) - spec['legx']) < 0.006 and abs(t[1] - spec['hip']) < 0.01,
              f"{leg} hip pivot at (±{spec['legx']}, {spec['hip']}): {t}")
    def mesh_of(name):
        idx = by_name[name][0]
        if 'mesh' not in nodes[idx]:
            raise KeyError(f"node '{name}' carries no mesh")
        return g['meshes'][nodes[idx]['mesh']]
    check('torsoMesh' in by_name, "mesh node 'torsoMesh' (bodyMat seam) exists")
    check('eyes' in by_name, "mesh node 'eyes' exists")
    eyes_mat = g['materials'][mesh_of('eyes')['primitives'][0]['material']]
    check(eyes_mat.get('name') == 'eyesMat', "eyes mesh carries eyesMat")
    check('KHR_materials_unlit' in eyes_mat.get('extensions', {}),
          "eyesMat is KHR_materials_unlit (MeshBasicMaterial after load)")
    check('KHR_materials_unlit' in g.get('extensionsUsed', []), "extensionsUsed lists unlit")
    tm_mat = g['materials'][mesh_of('torsoMesh')['primitives'][0]['material']]
    check('KHR_materials_unlit' not in tm_mat.get('extensions', {}),
          "torsoMesh material stays a lit standard material (bodyMat seam)")
    for name in spec['extra']:
        check(name in by_name, f"feature node '{name}' exists")
        check('mesh' in nodes[by_name[name][0]], f"feature node '{name}' is a mesh")
    for name in ('skull', 'torsoMesh', 'torsoSkin'):
        prims = mesh_of(name)['primitives']
        check(all('COLOR_0' in p['attributes'] for p in prims), f"{name} exports COLOR_0 grime")
    mesh_nodes = [n for n in nodes if 'mesh' in n]
    check(len(mesh_nodes) >= 15, f"figure is real geometry: {len(mesh_nodes)} mesh nodes")
    tris = sum(g['accessors'][p['indices']]['count'] // 3
               for m in g['meshes'] for p in m['primitives'] if 'indices' in p)
    print(f"TRIS total: {tris}")
    check(tris < 95000, "triangle budget sane for a mob-class figure")
    print(f"[{kind}] RESULT:", "ALL PASS" if not fails else f"{len(fails)} FAILURES")
    return fails

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    kinds = list(KINDS) if which == 'all' else [which]
    bad = []
    for k in kinds:
        try:
            if verify(k, KINDS[k]): bad.append(k)
        except Exception as e:   # a malformed artifact is a FAIL, not a crash
            print(f"[{k}] RESULT: FAIL ({e})")
            bad.append(k)
    sys.exit(1 if bad else 0)
