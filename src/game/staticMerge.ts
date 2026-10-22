// ─── STATIC GEOMETRY MERGE (perf lane, 2026-10-22) ──────────────────────────
//
// The kit/greeble builders and the vehicle GLB attach path historically
// emitted one THREE.Mesh per part: ~3,700 meshes in the built world and
// ~1,500 across the parked fleet, each its own draw call in BOTH the
// main pass and the shadow pass. Nothing about those parts is dynamic
// per-part — they share a handful of materials and never move again
// after build. This helper bakes every eligible mesh's transform into
// merged geometry, grouped by (material, shadow flags, attribute
// signature), so a whole building / vehicle body collapses to a few
// draw calls with IDENTICAL triangles (the greeble budget tests count
// tris through the group and must see the same totals).
//
// Eligibility is deliberately conservative. The core refuses meshes
// that have children, are InstancedMesh / SkinnedMesh, carry an array
// material, sit under a `userData.noMerge` node, or land in a
// singleton merge group. Everything name-based is the CALLER's policy
// (the `exclude` predicate sees the mesh's full ancestor chain):
// kit/greeble callers pass `excludeNamedSubtrees` (named meshes are
// fixtures other systems count or look up — lanterns, fenders, pad
// markers — and disturbed/named subtrees may move), while the vehicle
// GLB caller vetoes MOD_* / Wheel* / anchor subtrees by name.
// A failed merge (incompatible attributes) leaves the originals in
// place — merging is an optimization, never a build dependency.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface StaticMergeStats {
  /** meshes folded into merged geometry. */
  merged: number;
  /** merged meshes created. */
  created: number;
}

export interface StaticMergeOpts {
  /** Veto: return true to keep this mesh unmerged. Receives the mesh
   *  and its full ancestor chain — root's child first, the mesh
   *  itself last — so a predicate can veto by any name in the chain. */
  exclude?: (mesh: THREE.Mesh, chain: THREE.Object3D[]) => boolean;
  /** Name given to merged outputs (also marks them as already-merged). */
  mergedName?: string;
}

/** The kit/greeble policy: named meshes are fixtures other systems
 *  count or look up (lanterns, fenders, pad markers), and anything
 *  under a named or disturbed ancestor may move — keep all of it. */
export function excludeNamedSubtrees(_mesh: THREE.Mesh, chain: THREE.Object3D[]): boolean {
  return chain.some((o) => o.name !== '' || o.userData?.disturbedDelta !== undefined);
}

function attrSignature(geo: THREE.BufferGeometry): string {
  const names = Object.keys(geo.attributes).sort().join(',');
  return `${geo.index ? 'i' : 'n'}|${names}|${geo.groups.length}`;
}

/**
 * Merge every eligible static mesh under `root` (in root-local space).
 * Returns counts for tests/reports. Idempotent: merged outputs are
 * named, and named meshes are never re-merged.
 */
export function mergeStaticMeshes(root: THREE.Object3D, opts: StaticMergeOpts = {}): StaticMergeStats {
  const stats: StaticMergeStats = { merged: 0, created: 0 };
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  interface Candidate { mesh: THREE.Mesh; rel: THREE.Matrix4 }
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; items: Candidate[] }>();

  const visit = (node: THREE.Object3D, ancestors: THREE.Object3D[]): void => {
    for (const child of node.children) {
      const chain = [...ancestors, child];
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        const eligible = mesh.children.length === 0
          && !(mesh as THREE.InstancedMesh).isInstancedMesh
          && !(mesh as THREE.SkinnedMesh).isSkinnedMesh
          && !Array.isArray(mesh.material)
          && mesh.geometry
          && !chain.some((o) => o.userData?.noMerge === true)
          && !(opts.exclude && opts.exclude(mesh, chain));
        if (eligible) {
          const key = [
            (mesh.material as THREE.Material).uuid,
            mesh.castShadow ? 'c' : '-', mesh.receiveShadow ? 'r' : '-',
            attrSignature(mesh.geometry),
          ].join('|');
          let g = groups.get(key);
          if (!g) {
            g = { mat: mesh.material as THREE.Material, cast: mesh.castShadow, recv: mesh.receiveShadow, items: [] };
            groups.set(key, g);
          }
          g.items.push({
            mesh,
            rel: new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld),
          });
        }
      }
      visit(child, chain);
    }
  };
  visit(root, []);

  for (const g of groups.values()) {
    if (g.items.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    let ok = true;
    for (const { mesh, rel } of g.items) {
      const clone = mesh.geometry.clone();
      clone.applyMatrix4(rel);
      geos.push(clone);
    }
    const merged = mergeGeometries(geos, false);
    if (!merged) { ok = false; }
    if (!ok || !merged) {
      for (const geo of geos) geo.dispose();
      continue;
    }
    const out = new THREE.Mesh(merged, g.mat);
    out.castShadow = g.cast;
    out.receiveShadow = g.recv;
    out.name = opts.mergedName ?? 'merged-static';
    out.userData.mergedStatic = true;
    root.add(out);
    for (const { mesh } of g.items) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      stats.merged++;
    }
    for (const geo of geos) geo.dispose();
    stats.created++;
  }
  return stats;
}
