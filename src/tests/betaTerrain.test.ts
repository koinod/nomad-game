import { describe, it, expect, beforeAll } from 'vitest';
import * as RAPIER from '@dimforge/rapier3d-compat';
import {
  BETA_WORLD, BETA_CELL_M, BETA_COLS, BETA_ROWS,
  buildBetaGrid, betaHeightAt, betaSlopeAt, betaNodeX, betaNodeZ,
  buildBetaTerrainChunks, buildBetaRapierHeightfield,
} from '../game/betaTerrain';
import { BETA_SECTORS, BETA_EXTRA_PADS, BETA_ROADS, BETA_PLAYER_SPAWN } from '../data/betaLayout';

// ─── BETA TERRAIN — the foundation law, proven ──────────────────────────────
// One authored grid is the only terrain truth: the mesh's vertices ARE
// the grid nodes, the Rapier heightfield is fed the grid nodes, and
// betaHeightAt reads the same two triangles per cell. These tests prove
// the identity on the nodes AND between them, against a real Rapier
// world — the divergence that floated vehicles on the old map cannot
// exist here.

let grid: Float32Array;
let chunks: ReturnType<typeof buildBetaTerrainChunks>;

beforeAll(() => {
  grid = buildBetaGrid();
  chunks = buildBetaTerrainChunks();
}, 180_000);

describe('grid parameters', () => {
  it('keeps the shipped world extent at driving-grade resolution', () => {
    expect(BETA_WORLD).toEqual({ xMin: -700, xMax: 700, zMin: -320, zMax: 320 });
    expect(BETA_CELL_M).toBe(1.25);
    expect(BETA_COLS).toBe(1120);
    expect(BETA_ROWS).toBe(512);
    expect(grid.length).toBe((BETA_COLS + 1) * (BETA_ROWS + 1));
  });

  it('is deterministic: rebuilding yields the same field, and the sampler is pure', () => {
    expect(buildBetaGrid()).toBe(grid); // cached — one build, one truth
    const probes: [number, number][] = [[0, 0], [123.4, -56.7], [-520, -185], [392, 168], [-297.5, 77.5]];
    for (const [x, z] of probes) {
      expect(betaHeightAt(x, z)).toBe(betaHeightAt(x, z));
    }
  });

  it('sampler == grid at the nodes', () => {
    let checked = 0;
    for (let j = 0; j <= BETA_ROWS; j += 37) {
      for (let i = 0; i <= BETA_COLS; i += 53) {
        expect(betaHeightAt(betaNodeX(i), betaNodeZ(j))).toBeCloseTo(grid[j * (BETA_COLS + 1) + i], 5);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe('mesh identity', () => {
  it('every probed mesh vertex carries its grid node height verbatim', () => {
    let checked = 0;
    for (const geo of chunks) {
      const pos = geo.getAttribute('position');
      for (let v = 0; v < pos.count; v += 613) {
        const x = pos.getX(v);
        const z = pos.getZ(v);
        const i = Math.round(((x - BETA_WORLD.xMin) / BETA_CELL_M));
        const j = Math.round(((z - BETA_WORLD.zMin) / BETA_CELL_M));
        expect(pos.getY(v)).toBe(grid[j * (BETA_COLS + 1) + i]);
        expect(x).toBeCloseTo(betaNodeX(i), 4);
        expect(z).toBeCloseTo(betaNodeZ(j), 4);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(400);
  });

  it("mesh triangles interpolate exactly like the sampler (the mesh IS the sampler's surface)", () => {
    // Read a cell's two triangles back from a chunk's real index buffer
    // and barycentric-interpolate interior points; the sampler must
    // agree to float precision — there is no second surface.
    const cellsX = Math.ceil(BETA_COLS / 8);
    const cellsZ = Math.ceil(BETA_ROWS / 4);
    const triOf = (i: number, j: number, u: number, v: number): number => {
      // default chunking is 8x4 (buildBetaTerrainChunks default)
      const cx = Math.min(7, Math.floor(i / cellsX));
      const cz = Math.min(3, Math.floor(j / cellsZ));
      const geo = chunks[cz * 8 + cx];
      const pos = geo.getAttribute('position');
      const idx = geo.getIndex()!;
      const nx = Math.min(BETA_COLS, (cx + 1) * cellsX) - cx * cellsX + 1;
      const li = i - cx * cellsX;
      const lj = j - cz * cellsZ;
      const cell = (lj * cellsX + li) * 6;
      const tri = u + v <= 1 ? 0 : 1;
      const a = idx.getX(cell + tri * 3);
      const b = idx.getX(cell + tri * 3 + 1);
      const c = idx.getX(cell + tri * 3 + 2);
      void nx;
      // Barycentric weights of (u, v) in the unit cell over triangle abc.
      const P = [pos.getX(a), pos.getZ(a), pos.getY(a)];
      const Q = [pos.getX(b), pos.getZ(b), pos.getY(b)];
      const R = [pos.getX(c), pos.getZ(c), pos.getY(c)];
      const px = betaNodeX(i) + u * BETA_CELL_M;
      const pz = betaNodeZ(j) + v * BETA_CELL_M;
      const d = (Q[1] - R[1]) * (P[0] - R[0]) + (R[0] - Q[0]) * (P[1] - R[1]);
      const wP = ((Q[1] - R[1]) * (px - R[0]) + (R[0] - Q[0]) * (pz - R[1])) / d;
      const wQ = ((R[1] - P[1]) * (px - R[0]) + (P[0] - R[0]) * (pz - R[1])) / d;
      const wR = 1 - wP - wQ;
      return wP * P[2] + wQ * Q[2] + wR * R[2];
    };
    let maxDev = 0;
    let checked = 0;
    for (let j = 8; j < BETA_ROWS - 8; j += 41) {
      for (let i = 8; i < BETA_COLS - 8; i += 47) {
        for (const [u, v] of [[0.31, 0.57], [0.78, 0.13]] as const) {
          const x = betaNodeX(i) + u * BETA_CELL_M;
          const z = betaNodeZ(j) + v * BETA_CELL_M;
          maxDev = Math.max(maxDev, Math.abs(triOf(i, j, u, v) - betaHeightAt(x, z)));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(400);
    expect(maxDev).toBeLessThan(0.005);
  });
});

describe('Rapier identity (mesh == physics == sampler)', () => {
  it('a real Rapier world raycasts the sampler surface everywhere probed', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const hf = buildBetaRapierHeightfield();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(hf.nsubdivx, hf.nsubdivz, hf.heights, hf.scale),
      body,
    );
    world.step();
    const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const castAt = (x: number, z: number): number => {
      ray.origin.x = x;
      ray.origin.y = 130;
      ray.origin.z = z;
      const hit = world.castRay(ray, 260, true);
      if (!hit) throw new Error(`no rapier hit at ${x},${z}`);
      return 130 - hit.timeOfImpact;
    };
    // Probes sit at fractional cell offsets, never exactly on a node
    // column: Parry's heightfield raycast has a hairline artifact —
    // a perfectly vertical ray at an exact node x can slip between
    // the cell triangles (proven on a synthetic FLAT field at this
    // size: identical miss bands; ±0.001 m off the column hits).
    // Node-exact identity is proven by the array test below; this
    // test proves the BETWEEN-node identity, which is where wheels
    // actually live.
    const OX = BETA_CELL_M * 0.37;
    const OZ = BETA_CELL_M * 0.71;
    const probes: [number, number][] = [];
    for (const s of BETA_SECTORS) probes.push([s.x + OX, s.z + OZ]);
    probes.push([-430 + OX, -168 + OZ], [-230 + OX, -190 + OZ], [272 + OX, -196 + OZ]); // extra pads
    probes.push([-603 + OX, 287 + OZ], [-517 + OX, 162 + OZ], [-455 + OX, 143 + OZ], [-548 + OX, 199 + OZ]); // channel (new western-sound line)
    probes.push([-330 + OX, -165 + OZ], [-505 + OX, -230 + OZ]); // bluff face + high shoulder
    for (const r of BETA_ROADS) for (const [x, z] of r.points) probes.push([x + OX, z + OZ]);
    for (let j = 12; j < BETA_ROWS - 12; j += 53) {
      for (let i = 12; i < BETA_COLS - 12; i += 61) {
        probes.push([betaNodeX(i) + BETA_CELL_M * 0.37, betaNodeZ(j) + BETA_CELL_M * 0.71]);
      }
    }
    let worst = 0;
    for (const [px, pz] of probes) {
      const x = Math.max(-699, Math.min(699, px));
      const z = Math.max(-319, Math.min(319, pz));
      worst = Math.max(worst, Math.abs(castAt(x, z) - betaHeightAt(x, z)));
    }
    // The tolerance covers Rapier's internal float32 heightfield math
    // only — the surfaces are the same triangles by construction.
    expect(worst).toBeLessThan(0.02);
    world.free();
  }, 120_000);

  it('the physics array is the grid verbatim (no sampler round-trip)', () => {
    const hf = buildBetaRapierHeightfield();
    expect(hf.nsubdivx).toBe(BETA_ROWS);
    expect(hf.nsubdivz).toBe(BETA_COLS);
    expect(hf.scale).toEqual({ x: 1400, y: 1, z: 640 });
    let checked = 0;
    for (let ix = 0; ix <= BETA_COLS; ix += 97) {
      for (let iz = 0; iz <= BETA_ROWS; iz += 89) {
        expect(hf.heights[ix * (BETA_ROWS + 1) + iz]).toBe(grid[iz * (BETA_COLS + 1) + ix]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('mid-cell reads stay close to the corner mean — the field is smooth at wheel scale', () => {
    // The anti-float property: between nodes the surface cannot dip or
    // hump away from what a suspension ray reads at the corners.
    let worst = 0;
    let skipped = 0;
    for (let j = 4; j < BETA_ROWS - 4; j += 7) {
      for (let i = 4; i < BETA_COLS - 4; i += 7) {
        const x0 = betaNodeX(i);
        const z0 = betaNodeZ(j);
        const corners = [
          betaHeightAt(x0, z0), betaHeightAt(x0 + BETA_CELL_M, z0),
          betaHeightAt(x0, z0 + BETA_CELL_M), betaHeightAt(x0 + BETA_CELL_M, z0 + BETA_CELL_M),
        ];
        let cornerSlope = 0;
        for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
          cornerSlope = Math.max(cornerSlope, Math.abs(corners[a] - corners[b]) / BETA_CELL_M);
        }
        if (cornerSlope > 0.55) { skipped++; continue; } // cliff faces are allowed to be faces
        const mean = corners.reduce((s, v) => s + v, 0) / 4;
        worst = Math.max(worst, Math.abs(betaHeightAt(x0 + BETA_CELL_M / 2, z0 + BETA_CELL_M / 2) - mean));
      }
    }
    // The bluff-face band is the one large steep region; everything
    // else (coasts, banks, shoulders) must stay wheel-smooth.
    expect(skipped).toBeLessThan(1500);
    expect(worst).toBeLessThan(0.28);
  });
});

describe('roads graded into the grid', () => {
  // Nearest centerline arc of a point (for the crossfall probe filter).
  const nearestArc = (pts: [number, number][], x: number, z: number): number => {
    let best = Infinity;
    let bestArc = 0;
    let a0 = 0;
    for (let s = 0; s + 1 < pts.length; s++) {
      const [ax, az] = pts[s];
      const dx = pts[s + 1][0] - ax;
      const dz = pts[s + 1][1] - az;
      const len = Math.hypot(dx, dz);
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len)));
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) {
        best = d;
        bestArc = a0 + len * t;
      }
      a0 += len;
    }
    return bestArc;
  };

  for (const road of BETA_ROADS) {
    it(`${road.id}: longitudinal grade within its clamp, crossfall gentle`, () => {
      let maxGrade = 0;
      let maxCross = 0;
      let arc = 0;
      const pts = road.points;
      let prev: [number, number] | null = null;
      const visit = (x: number, z: number, hPrev: number | null, stepLen: number): number => {
        const h = betaHeightAt(x, z);
        if (hPrev !== null && stepLen > 0) {
          maxGrade = Math.max(maxGrade, Math.abs(h - hPrev) / stepLen);
        }
        return h;
      };
      let segStartArc = 0;
      for (let s = 0; s + 1 < pts.length; s++) {
        const [ax, az] = pts[s];
        const [bx, bz] = pts[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.ceil(len / 5);
        for (let k = s === 0 ? 0 : 1; k <= steps; k++) {
          const t = k / steps;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          const stepLen = prev ? Math.hypot(x - prev[0], z - prev[1]) : 0;
          const hPrev = prev ? betaHeightAt(prev[0], prev[1]) : null;
          visit(x, z, hPrev, stepLen);
          // Crossfall: center vs ±2 m perpendicular — inside every
          // vehicle's track and fully within the graded corridor —
          // but only where the probe is a TRUE lateral probe: near a
          // bend/switchback vertex a lateral point's nearest arc sits
          // meters away along the road, so the read spans the bench
          // between two legs and measures projected longitudinal
          // grade, not crossfall. Skip those stations.
          const stationArc = segStartArc + len * t;
          const px = -(bz - az) / len;
          const pz = (bx - ax) / len;
          const hc = betaHeightAt(x, z);
          for (const sgn of [1, -1]) {
            const qx = x + px * 2 * sgn;
            const qz = z + pz * 2 * sgn;
            if (Math.abs(nearestArc(pts, qx, qz) - stationArc) > 1.5) continue;
            maxCross = Math.max(maxCross, Math.abs(betaHeightAt(qx, qz) - hc));
          }
          prev = [x, z];
          arc += stepLen;
        }
        segStartArc += len;
      }
      expect(arc).toBeGreaterThan(30);
      expect(maxGrade).toBeLessThan(road.maxGrade * 1.15 + 0.012);
      expect(maxCross).toBeLessThan(0.3);
    });
  }
});

describe('sector flats (pad-grade)', () => {
  const allPads = [
    ...BETA_SECTORS.map((s) => ({ id: s.id, x: s.x, z: s.z, y: s.padY, half: s.padHalf })),
    ...BETA_EXTRA_PADS.map((p) => ({ id: p.id, x: p.x, z: p.z, y: p.y, half: p.half })),
  ];
  for (const p of allPads) {
    it(`${p.id} pad is flat at its surveyed height`, () => {
      // Sampled 2.6 m inside the rect: the surveyed flat is the pad's
      // interior; at the boundary line itself the sampler necessarily
      // reads the first feather nodes outside it.
      let lo = Infinity;
      let hi = -Infinity;
      for (let dx = -p.half[0] + 2.6; dx <= p.half[0] - 2.6; dx += 4) {
        for (let dz = -p.half[1] + 2.6; dz <= p.half[1] - 2.6; dz += 4) {
          const h = betaHeightAt(p.x + dx, p.z + dz);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      expect(hi - lo).toBeLessThan(0.02);
      expect(betaHeightAt(p.x, p.z)).toBeCloseTo(p.y, 1);
    });
  }
});

describe('waterline sanity (spec §1.1 geography)', () => {
  it('spawn, sector hearts, and the airbase sit dry at their surveyed heights', () => {
    expect(betaHeightAt(BETA_PLAYER_SPAWN.x, BETA_PLAYER_SPAWN.z)).toBeGreaterThan(2);
    expect(betaHeightAt(618, -218)).toBeCloseTo(3.2, 1);   // lighthouse
    expect(betaHeightAt(468, -128)).toBeCloseTo(2.7, 1);   // airbase (shipped grade)
    expect(betaHeightAt(-520, -185)).toBeCloseTo(60, 0);   // ridge redoubt
    expect(betaHeightAt(-30, -10)).toBeCloseTo(4.4, 1);     // refuge
  });

  it('the dredged channel reads navigable depth along its line (§3.3)', () => {
    // Segment midpoints of the Phase 1.5 western-sound line: south
    // sound entrance → shoal bar → harbor mouth → estuary reach →
    // estuary head. (The Phase 1 probes sat on the deleted strait.)
    for (const [x, z] of [[-603, 287], [-561, 229.5], [-543, 189.5], [-517.5, 162], [-455, 143]] as const) {
      const h = betaHeightAt(x, z);
      expect(h).toBeLessThan(-3.6);
      expect(h).toBeGreaterThan(-4.8);
    }
  });

  it('the island waist is dry land — the Ridge connects to the main island (Phase 1.5 shape law)', () => {
    // The deleted strait's interior midpoints: where the old cut ran
    // at −4.2 m, the landform now reads as the dry saddle it always
    // was underneath — the spur climbs it overland the whole way.
    // (The southern midpoint sits in tidal marsh: dry at marsh
    // height, ~0.4 m, not saddle height.)
    for (const [x, z] of [[-20, -177.5], [-127.5, -100], [-223.5, -14], [-292, 72]] as const) {
      expect(betaHeightAt(x, z)).toBeGreaterThan(0);
    }
    expect(betaHeightAt(-127.5, -100)).toBeGreaterThan(1);
    expect(betaHeightAt(-223.5, -14)).toBeGreaterThan(1);
    // And the transect the shape gate rendered: no water anywhere
    // across the waist band between the west block and the centre.
    for (let x = -330; x <= -90; x += 15) {
      expect(betaHeightAt(x, -40)).toBeGreaterThan(0);
      expect(betaHeightAt(x, 20)).toBeGreaterThan(-0.1);
    }
  });

  it('no road runs into water — every centerline stays dry (Phase 1.5 shape law)', () => {
    // Phase 1's strait flooded two roads (the spur bottomed at
    // −4.2 m, the west fork at −2.9 m). The only water crossing in
    // the spec is the Citadel causeway, and §2 draws it as a LAND
    // bridge — so the law is absolute: dry centerlines everywhere.
    // (If a future route ever needs a true bridge, it gets flagged
    // as a bridge site in the layout, not a road through water.)
    for (const road of BETA_ROADS) {
      let min = Infinity;
      for (let s = 0; s + 1 < road.points.length; s++) {
        const [ax, az] = road.points[s];
        const [bx, bz] = road.points[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.ceil(len / 5);
        for (let k = 0; k <= steps; k++) {
          min = Math.min(min, betaHeightAt(ax + (bx - ax) * (k / steps), az + (bz - az) * (k / steps)));
        }
      }
      expect(min).toBeGreaterThan(0);
    }
  });

  it('seas read as their biomes: deep Atlantic E, shoal sound W, bay N', () => {
    expect(betaHeightAt(688, 40)).toBeLessThan(-8);            // Atlantic deep
    expect(betaHeightAt(-648, 258)).toBeGreaterThan(-2.4);     // SW shoal
    expect(betaHeightAt(-648, 258)).toBeLessThan(-0.3);
    expect(betaHeightAt(-672, -262)).toBeLessThan(-0.3);       // NW sound water (west of the bluffs)
    expect(betaHeightAt(150, -300)).toBeLessThan(-0.5);        // the north bay (causeway crosses it)
  });

  it('marsh sites sit at marsh heights', () => {
    const h = betaHeightAt(-262, 138);
    expect(h).toBeGreaterThan(-0.1);
    expect(h).toBeLessThan(1.5);
    expect(betaHeightAt(-470, 96)).toBeGreaterThan(0); // the wreck's shore
  });

  it('the NW massif rises to the scaled +180 m class with real faces', () => {
    expect(betaHeightAt(-470, -110)).toBeGreaterThan(52); // off-pad, off-road massif top
    let maxSlope = 0;
    for (let x = -420; x <= -290; x += 5) {
      maxSlope = Math.max(maxSlope, betaSlopeAt(x, -165));
    }
    expect(maxSlope).toBeGreaterThan(0.4);
  });
});
