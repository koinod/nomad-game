// ui/skillTreeLayout.ts — pure geometry for the skill TREE view.
//
// The phone Character tab used to render perks as a grouped LIST;
// this turns the data's prerequisite graph (data/skills.ts PERKS
// requires) into positioned nodes + edges: columns are tiers
// (1 → 4, capstone last), rows are the perk's order within its tier.
// Rendering lives in SkillsPanel; everything here is pure so the
// invariants (every perk placed once, edges == requires) are pinned
// by tests.

import { PERKS, type PerkDef, type TreeId } from '../data/skills';

export const NODE_W = 118;
export const NODE_H = 54;
export const COL_PITCH = 150;
export const ROW_PITCH = 74;
export const PAD = 10;

export interface TreeNode {
  perk: PerkDef;
  col: number;
  row: number;
  x: number;
  y: number;
}

export interface TreeEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: TreeNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
}

export function perkTreeLayout(treeId: TreeId): TreeLayout {
  const perks = PERKS.filter((p) => p.tree === treeId);
  const perTierCount = new Map<number, number>();
  const nodes: TreeNode[] = perks.map((p) => {
    const row = perTierCount.get(p.tier) ?? 0;
    perTierCount.set(p.tier, row + 1);
    const col = p.tier - 1;
    return { perk: p, col, row, x: PAD + col * COL_PITCH, y: PAD + row * ROW_PITCH };
  });
  const byId = new Map(nodes.map((n) => [n.perk.id, n]));
  const edges: TreeEdge[] = [];
  for (const n of nodes) {
    for (const req of n.perk.requires ?? []) {
      const from = byId.get(req);
      if (!from) continue; // cross-tree requires would render in their own tree; data has none
      edges.push({
        from: req,
        to: n.perk.id,
        x1: from.x + NODE_W,
        y1: from.y + NODE_H / 2,
        x2: n.x,
        y2: n.y + NODE_H / 2,
      });
    }
  }
  const maxRow = nodes.reduce((a, n) => Math.max(a, n.row), 0);
  return {
    nodes,
    edges,
    width: PAD * 2 + 3 * COL_PITCH + NODE_W,
    height: PAD * 2 + maxRow * ROW_PITCH + NODE_H,
  };
}

/** Elbow path (horizontal → vertical → horizontal) between edge ends —
 *  the classic tree look, and it never crosses a node box. */
export function edgePath(e: TreeEdge): string {
  const midX = Math.round((e.x1 + e.x2) / 2);
  return `M ${e.x1} ${e.y1} H ${midX} V ${e.y2} H ${e.x2}`;
}
