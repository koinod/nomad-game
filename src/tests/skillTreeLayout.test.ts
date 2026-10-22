// skillTreeLayout.test.ts — the tree view's geometry invariants:
// every perk in a tree is placed exactly once, columns are tiers,
// no two nodes share a cell, and the drawn edges are exactly the
// data's prerequisite graph (nothing invented, nothing dropped).

import { describe, expect, it } from 'vitest';
import { PERKS, TREES } from '../data/skills';
import { NODE_H, NODE_W, edgePath, perkTreeLayout } from '../ui/skillTreeLayout';

describe('perkTreeLayout', () => {
  for (const tree of TREES) {
    it(`${tree.id}: places every perk once, in its tier column`, () => {
      const layout = perkTreeLayout(tree.id);
      const perks = PERKS.filter((p) => p.tree === tree.id);
      expect(layout.nodes.length).toBe(perks.length);
      expect(new Set(layout.nodes.map((n) => n.perk.id)).size).toBe(perks.length);
      for (const n of layout.nodes) {
        expect(n.col).toBe(n.perk.tier - 1);
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x + NODE_W).toBeLessThanOrEqual(layout.width);
        expect(n.y + NODE_H).toBeLessThanOrEqual(layout.height);
      }
      const cells = layout.nodes.map((n) => `${n.col}:${n.row}`);
      expect(new Set(cells).size).toBe(cells.length);
    });

    it(`${tree.id}: edges are exactly the requires graph, flowing right`, () => {
      const layout = perkTreeLayout(tree.id);
      const perks = PERKS.filter((p) => p.tree === tree.id);
      const expected = perks.flatMap((p) => (p.requires ?? []).map((r) => `${r}->${p.id}`));
      const actual = layout.edges.map((e) => `${e.from}->${e.to}`);
      expect(actual.sort()).toEqual(expected.sort());
      for (const e of layout.edges) expect(e.x2).toBeGreaterThan(e.x1);
      // the capstone sits alone in the last column with two parents
      const cap = layout.nodes.find((n) => n.perk.tier === 4);
      expect(cap?.col).toBe(3);
      expect(layout.edges.filter((e) => e.to === cap?.perk.id).length).toBe(2);
    });
  }

  it('edgePath produces an SVG path through both endpoints', () => {
    const p = edgePath({ from: 'a', to: 'b', x1: 10, y1: 20, x2: 90, y2: 60 });
    expect(p.startsWith('M 10 20')).toBe(true);
    expect(p.endsWith('H 90')).toBe(true);
    expect(p).toContain('V 60');
  });
});
