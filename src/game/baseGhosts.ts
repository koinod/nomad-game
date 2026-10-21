// Blueprint ghosts — BASE_DESIGN §2 verdict 3 / §3.3b. Prefab pieces are
// placed as translucent ghosts inside the claim radius; a ghost completes
// when its materials are delivered AND its labor hours elapse (a Builder
// visibly works it — the Kelvin model; the animation is world wiring).
// This module is the placement + progress math only: plain coordinates,
// no THREE, no World.ts. The renderer consumes GhostPlacement[] and the
// build queue consumes ghostProgress().

import { prefabDef, type ItemQty } from '../data/base';

export interface GhostPlacement {
  prefabId: string;
  x: number;
  z: number;
  /** Facing (radians, world Y rotation). Ring pieces face outward. */
  rotY: number;
  /** Ring segment index for walls/fences (0 for interior pieces). */
  ringIndex: number;
}

export interface ClaimAnchor {
  x: number;
  z: number;
  /** Claim radius: 40m home / 20m outpost (CLAIM_SITES.prefabRadiusM). */
  radiusM: number;
}

/** Each palisade/fence piece spans 3m (§3.3b). The gate gap is 4m wide. */
export const RING_SEGMENT_M = 3;
export const GATE_GAP_M = 4;

/**
 * Plan a prefab ring around a claim: wall-class pieces (palisade_wall,
 * fence) tile the circumference at the claim radius, leaving a gate gap
 * centered on gateBearing (radians, direction of the road/approach);
 * 'gate' pieces fill the gap; everything else (watchtower, spikes,
 * rain_barrel, campfire_bedroll, mess_table, storage_crate) is placed
 * inside the ring, spaced along an inner arc so pieces never stack.
 * Deterministic — same inputs, same plan (the build queue persists it).
 */
export function planPrefabRing(
  anchor: ClaimAnchor,
  prefabIds: readonly string[],
  gateBearing = 0,
): GhostPlacement[] {
  const out: GhostPlacement[] = [];
  const ringIds = prefabIds.filter((id) => id === 'palisade_wall' || id === 'fence');
  const innerIds = prefabIds.filter((id) => id !== 'palisade_wall' && id !== 'fence' && id !== 'gate');
  const hasGate = prefabIds.includes('gate');

  // Ring: walk the circumference, skipping the gate gap.
  const circumference = 2 * Math.PI * anchor.radiusM;
  const segments = Math.max(0, Math.floor((circumference - (hasGate ? GATE_GAP_M : 0)) / RING_SEGMENT_M));
  let ringIndex = 0;
  for (let i = 0; i < ringIds.length && ringIndex < segments; i++) {
    // Center this segment on the ring, offset so the gap stays centered.
    const segCenterDist = (ringIndex + 0.5) * RING_SEGMENT_M + (hasGate ? GATE_GAP_M / 2 : 0);
    const ang = gateBearing + segCenterDist / anchor.radiusM;
    out.push({
      prefabId: ringIds[i],
      x: anchor.x + Math.cos(ang) * anchor.radiusM,
      z: anchor.z + Math.sin(ang) * anchor.radiusM,
      rotY: -ang + Math.PI / 2, // face outward along the radius
      ringIndex: ringIndex++,
    });
  }
  if (hasGate) {
    out.push({
      prefabId: 'gate',
      x: anchor.x + Math.cos(gateBearing) * anchor.radiusM,
      z: anchor.z + Math.sin(gateBearing) * anchor.radiusM,
      rotY: -gateBearing + Math.PI / 2,
      ringIndex: -1,
    });
  }
  // Interior: spaced along an inner arc at 55% radius, fanned opposite
  // the gate so the approach stays clear. Watchtowers go to the ring's
  // shoulder (they're perimeter pieces in spirit).
  const innerR = anchor.radiusM * 0.55;
  innerIds.forEach((id, i) => {
    const isTower = id === 'watchtower';
    const r = isTower ? anchor.radiusM * 0.92 : innerR;
    const spread = Math.min(Math.PI * 1.2, 0.7 * Math.max(1, innerIds.length - 1));
    const t = innerIds.length <= 1 ? 0.5 : i / (innerIds.length - 1);
    const ang = gateBearing + Math.PI - spread / 2 + spread * t;
    out.push({
      prefabId: id,
      x: anchor.x + Math.cos(ang) * r,
      z: anchor.z + Math.sin(ang) * r,
      rotY: -ang - Math.PI / 2, // face the claim center
      ringIndex: -1,
    });
  });
  return out;
}

/** How many ring segments a full palisade would need at this radius. */
export function ringSegmentCount(radiusM: number, withGate = true): number {
  const circumference = 2 * Math.PI * radiusM;
  return Math.max(0, Math.floor((circumference - (withGate ? GATE_GAP_M : 0)) / RING_SEGMENT_M));
}

/**
 * Ghost completion (§3.3b): materials delivered AND labor elapsed.
 * Progress is the slower of the two — a fully-stocked ghost with no
 * builder on it sits at its labor fraction; hauling more scrap at it
 * doesn't hammer nails.
 */
export function ghostProgress(
  delivered: readonly ItemQty[],
  cost: readonly ItemQty[],
  laborHoursDone: number,
  buildHours: number,
): number {
  const needUnits = cost.reduce((a, c) => a + c.qty, 0);
  const gotUnits = cost.reduce((a, c) => a + Math.min(c.qty, delivered.find((d) => d.itemId === c.itemId)?.qty ?? 0), 0);
  const matFrac = needUnits === 0 ? 1 : gotUnits / needUnits;
  const laborFrac = buildHours <= 0 ? 1 : Math.min(1, laborHoursDone / buildHours);
  return Math.min(matFrac, laborFrac);
}

export function ghostComplete(
  delivered: readonly ItemQty[],
  cost: readonly ItemQty[],
  laborHoursDone: number,
  buildHours: number,
): boolean {
  return ghostProgress(delivered, cost, laborHoursDone, buildHours) >= 1;
}

/** Materials still owed on a ghost (the hauling list the UI shows). */
export function ghostShortfall(delivered: readonly ItemQty[], cost: readonly ItemQty[]): ItemQty[] {
  return cost
    .map((c) => ({ itemId: c.itemId, qty: c.qty - (delivered.find((d) => d.itemId === c.itemId)?.qty ?? 0) }))
    .filter((c) => c.qty > 0);
}

/** Sanity for the build queue: a prefab id the kit actually knows. */
export function isPrefab(id: string): boolean {
  return !!prefabDef(id);
}
