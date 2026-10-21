# verify_authored_glb.py — structural contract check for the authored
# shambler GLB against figureKit's bindFigureGLB expectations.
# Pure-stdlib GLB parse; exits non-zero on any failure.
# Run: python3 tools/figures/verify_authored_glb.py
import json, os, struct, sys

PATH = os.path.expanduser("~/workspace/nomad-wt/figures-authored/public/figures/husk_shambler_authored.glb")
fails = []
def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond: fails.append(label)

data = open(PATH, 'rb').read()
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
def chain(name):
    idx = by_name[name][0]
    out = []
    while True:
        out.append(nodes[idx].get('name'))
        if idx not in parent: break
        idx = parent[idx]
    return out

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

check(abs(chain_translation_y('skull') - 1.71) < 0.03,
      f"skull node world Y = {chain_translation_y('skull'):.3f} (HitProfile 1.71)")
check(abs(nodes[by_name['torso'][0]].get('translation', [0, 0, 0])[1] - 0.864) < 0.01,
      "torso pivot at the hip line (0.864)")
for leg in ('legL', 'legR'):
    t = nodes[by_name[leg][0]].get('translation', [0, 0, 0])
    check(abs(abs(t[0]) - 0.099) < 0.005 and abs(t[1] - 0.864) < 0.01,
          f"{leg} hip pivot at (±0.099, 0.864): {t}")

def mesh_of(name):
    idx = by_name[name][0]
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

grime_meshes = {'skull', 'torsoMesh', 'torsoSkin', 'pantsPelvis', 'jawMesh', 'neckMesh'}
for name in sorted(grime_meshes):
    prims = mesh_of(name)['primitives']
    check(all('COLOR_0' in p['attributes'] for p in prims), f"{name} exports COLOR_0 grime")

mesh_nodes = [n for n in nodes if 'mesh' in n]
check(len(mesh_nodes) >= 15, f"figure is real geometry: {len(mesh_nodes)} mesh nodes")
tris = sum(g['accessors'][p['indices']]['count'] // 3
           for m in g['meshes'] for p in m['primitives'] if 'indices' in p)
print(f"TRIS total: {tris}")
check(tris < 90000, "triangle budget sane for a mob-class figure")

print("RESULT:", "ALL PASS" if not fails else f"{len(fails)} FAILURES")
sys.exit(1 if fails else 0)
