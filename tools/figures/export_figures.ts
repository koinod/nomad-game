// export_figures.ts — LANE 4 proof pipeline, step 1.
//
// Builds every figure with the REAL figureKit builders (the same code
// the game runs), bakes world transforms, and writes one OBJ+MTL per
// figure to tools/figures/obj/. Step 2 (render_proofs.py, Blender)
// renders the gate contact sheets from these and exports GLBs to
// public/figures/.
//
// Run: npx tsc -p tools/figures/tsconfig.json && node tools/figures/dist/tools/figures/export_figures.js

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { buildHumanFigure, buildHuskFigure, type HuskFigureKind, type FigureRig } from '../../src/game/figureKit';
import { SURVIVOR_LOOKS, NPC_LOOKS, type SurvivorLook } from '../../src/data/survivors';
import { mulberry32 } from '../../src/game/rng';

const OUT = path.resolve(process.cwd(), 'tools/figures/obj');
fs.mkdirSync(OUT, { recursive: true });

function writeOBJ(name: string, rig: FigureRig): void {
  rig.group.updateWorldMatrix(true, true);
  const mats = new Map<string, { r: number; g: number; b: number }>();
  const lines: string[] = [`mtllib ${name}.mtl`, `o ${name}`];
  let vOff = 0;
  let nOff = 0;
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  rig.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry as THREE.BufferGeometry;
    const mat = o.material as THREE.MeshStandardMaterial;
    const hex = (mat.color?.getHex() ?? 0x888888).toString(16).padStart(6, '0');
    const mName = `m_${hex}`;
    if (!mats.has(mName)) {
      const c = mat.color ?? new THREE.Color(0x888888);
      mats.set(mName, { r: c.r, g: c.g, b: c.b });
    }
    lines.push(`g ${o.name || 'part'}`, `usemtl ${mName}`);
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      lines.push(`v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`);
      if (nor) {
        n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        lines.push(`vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}`);
      }
    }
    const idx = geo.getIndex();
    const emit = (a: number, b: number, c: number) => {
      lines.push(nor
        ? `f ${a + 1 + vOff}//${a + 1 + nOff} ${b + 1 + vOff}//${b + 1 + nOff} ${c + 1 + vOff}//${c + 1 + nOff}`
        : `f ${a + 1 + vOff} ${b + 1 + vOff} ${c + 1 + vOff}`);
    };
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) emit(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    } else {
      for (let i = 0; i < pos.count; i += 3) emit(i, i + 1, i + 2);
    }
    vOff += pos.count;
    nOff += pos.count;
  });
  const mtl = [...mats.entries()]
    .map(([mName, c]) => `newmtl ${mName}\nKd ${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)}\nKs 0.05 0.05 0.05\nNs 24`)
    .join('\n');
  fs.writeFileSync(path.join(OUT, `${name}.mtl`), mtl + '\n');
  fs.writeFileSync(path.join(OUT, `${name}.obj`), lines.join('\n') + '\n');
  console.log('wrote', name, `(${vOff} verts)`);
}

// ---- husks: the in-game wardrobe + profiles, seeded deterministically
const HUSK_PROFILE: Record<HuskFigureKind, { height: number; headY: number }> = {
  shambler: { height: 1.8, headY: 1.71 },
  stalker: { height: 1.95, headY: 1.85 },
  armored: { height: 1.92, headY: 1.82 },
  screamer: { height: 2.1, headY: 2.0 },
  brute: { height: 2.4, headY: 2.26 },
  crawler: { height: 0.95, headY: 0.6 },
  bloater: { height: 1.85, headY: 1.76 },
  spitter: { height: 1.85, headY: 1.76 },
};
for (const kind of Object.keys(HUSK_PROFILE) as HuskFigureKind[]) {
  const p = HUSK_PROFILE[kind];
  writeOBJ(`husk_${kind}`, buildHuskFigure(kind, {
    height: p.height, headCenterY: p.headY,
    palette: { skin: 0x8a7a68, jacket: 0x4a5a3c, pants: 0x35322c, dark: 0x2c2c30 },
    vrnd: mulberry32(11),
  }));
}

// ---- humans: recruits + story NPCs from their designed looks
const humanFromLook = (look: SurvivorLook, female: boolean) => buildHumanFigure({
  palette: { skin: look.skin, jacket: look.jacket, pants: look.pants, hair: look.hair, dark: 0x24211e },
  build: look.build, hairStyle: look.hairStyle, female,
});
writeOBJ('survivor_elena', humanFromLook(SURVIVOR_LOOKS.elena, true));
writeOBJ('survivor_mateo', humanFromLook(SURVIVOR_LOOKS.mateo, false));
writeOBJ('survivor_lina', humanFromLook(SURVIVOR_LOOKS.lina, true));
writeOBJ('survivor_dez', humanFromLook(SURVIVOR_LOOKS.dez, false));
writeOBJ('survivor_priya', humanFromLook(SURVIVOR_LOOKS.priya, true));
writeOBJ('npc_jonah', humanFromLook(NPC_LOOKS.jonah, false));
writeOBJ('npc_kowalski', humanFromLook(NPC_LOOKS.kowalski, true));

// ---- the player avatar spec Player.ts will bind (gear ON: pack T2 + vest)
writeOBJ('player_avatar', buildHumanFigure({
  palette: { skin: 0xc9a180, jacket: 0x2e4a4e, pants: 0x3a3630, hair: 0x2c2018, dark: 0x24211e },
  hairStyle: 'crop', gear: { pack: 2, vest: true },
}));

console.log('done ->', OUT);
