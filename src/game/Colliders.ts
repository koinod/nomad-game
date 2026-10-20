// Colliders.ts — axis-aligned wall/furniture colliders + interior floor rects.
// The player and husks resolve the same list every tick (circle vs AABB).

export interface Collider {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface FloorRect extends Collider {
  y: number; // interior floor height — beats terrain inside houses
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/** Push a circle out of every collider it overlaps. Mutates pos in place. */
export function resolveCollisions(
  pos: { x: number; z: number },
  radius: number,
  colliders: readonly Collider[],
): void {
  for (const c of colliders) {
    const cx = clamp(pos.x, c.x0, c.x1);
    const cz = clamp(pos.z, c.z0, c.z1);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // center inside the box: push out along the shallowest axis
      const dl = pos.x - c.x0;
      const dr = c.x1 - pos.x;
      const dn = pos.z - c.z0;
      const df = c.z1 - pos.z;
      const m = Math.min(dl, dr, dn, df);
      if (m === dl) pos.x = c.x0 - radius;
      else if (m === dr) pos.x = c.x1 + radius;
      else if (m === dn) pos.z = c.z0 - radius;
      else pos.z = c.z1 + radius;
    }
  }
}

/** Highest interior floor under (x,z), or -Infinity when outdoors. */
export function floorYAt(x: number, z: number, floors: readonly FloorRect[]): number {
  let y = -Infinity;
  for (const f of floors) {
    if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.y > y) y = f.y;
  }
  return y;
}

/**
 * Height-aware floor lookup for stacked floors (houses v2): the highest
 * floor at (x,z) that is no more than `stepUp` above the walker's current
 * height — so a ground-floor walker isn't snapped onto the floor above,
 * stairs climb one step at a time, and the upstairs floor holds you once
 * you're on it.
 */
export function floorYAtRef(
  x: number,
  z: number,
  floors: readonly FloorRect[],
  refY: number,
  stepUp = 0.55,
): number {
  let y = -Infinity;
  for (const f of floors) {
    if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.y <= refY + stepUp && f.y > y) {
      y = f.y;
    }
  }
  return y;
}
