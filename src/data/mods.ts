// Weapon attachments — mods are items; attaching happens at a Weapons Bench.
// Spec: SYSTEMS_SPEC.md §3. Effects apply in Combat via the equipped item's
// `mods` list (per-instance, keyed by inventory uid).

export type ModSlot = 'optic' | 'muzzle' | 'magazine' | 'underbarrel';

export interface ModDef {
  id: string;
  slot: ModSlot;
  name: string;
  desc: string;
  gunPartsCost: number; // attach cost at the bench
  noiseMult?: number;
  spreadMult?: number;
  adsSpreadMult?: number;
  magMult?: number;
  recoilMult?: number; // wave 2: camera kick scale (foregrip)
  adsTimeMult?: number; // wave 2: hip -> sights transition speed (reflex)
}

export const MODS: Record<string, ModDef> = {
  reflex_sight: {
    id: 'reflex_sight', slot: 'optic', name: 'Reflex sight', gunPartsCost: 2,
    desc: 'Down-sights cone −30%. The dot does not lie.',
    adsSpreadMult: 0.7, adsTimeMult: 0.7,
  },
  suppressor: {
    id: 'suppressor', slot: 'muzzle', name: 'Suppressor', gunPartsCost: 3,
    desc: 'Gunshot noise ×0.31 — 80m becomes 25m. The loud problem, solved.',
    noiseMult: 0.31,
  },
  extended_mag: {
    id: 'extended_mag', slot: 'magazine', name: 'Extended magazine', gunPartsCost: 2,
    desc: 'Magazine capacity ×1.5. Fewer reloads in the bad moments.',
    magMult: 1.5,
  },
  foregrip: {
    id: 'foregrip', slot: 'underbarrel', name: 'Foregrip', gunPartsCost: 1,
    desc: 'Spread ×0.75 at every stance. Recoil ×0.8 — the climb is yours to hold.',
    spreadMult: 0.75, recoilMult: 0.8, adsTimeMult: 0.9,
  },
  laser_sight: {
    id: 'laser_sight', slot: 'underbarrel', name: 'Laser sight', gunPartsCost: 2,
    desc: 'Hip-fire cone ×0.6. They can see the dot. So can you.',
    spreadMult: 0.85,
  },
};

// --------------------------------------------------------------- finishes ---
// Wave 4: weapon finishes — lootable cosmetics applied at a Weapons Bench.
// Pure data: the material rules themselves live in weaponMeshes.applyFinish
// (metal surfaces take metal/rough/metalness; camo breaks up the rest).

export interface FinishDef {
  id: string; // also the inventory item id of the finish kit
  name: string;
  metal: number; // color metal surfaces (metalness >= 0.4) are refinished to
  rough: number;
  metalness: number;
  /** Camo only: the two tones non-metal parts alternate between. */
  camoTones?: [number, number];
}

export const FINISHES: Record<string, FinishDef> = {
  finish_matte: { id: 'finish_matte', name: 'Matte Black', metal: 0x1b1d20, rough: 0.62, metalness: 0.35 },
  finish_camo: { id: 'finish_camo', name: 'Marsh Camo', metal: 0x59603f, rough: 0.8, metalness: 0.15, camoTones: [0x59603f, 0x8a7a52] },
  finish_rust: { id: 'finish_rust', name: 'Honest Rust', metal: 0x7a4a2a, rough: 0.95, metalness: 0.08 },
  finish_worn: { id: 'finish_worn', name: 'Worn Steel', metal: 0x8f9296, rough: 0.48, metalness: 0.62 },
};

export function finishDef(id: string | undefined): FinishDef | undefined {
  return id ? FINISHES[id] : undefined;
}

export function magSizeOf(baseMag: number, mods: readonly string[]): number {
  let m = baseMag;
  for (const id of mods) {
    const d = MODS[id];
    if (d?.magMult) m = Math.round(m * d.magMult);
  }
  return m;
}

export function modNoiseMult(mods: readonly string[]): number {
  let v = 1;
  for (const id of mods) if (MODS[id]?.noiseMult) v *= MODS[id].noiseMult!;
  return v;
}

export function modSpreadMult(mods: readonly string[], aimLevel: number): number {
  let v = 1;
  for (const id of mods) {
    const d = MODS[id];
    if (!d) continue;
    if (d.spreadMult) v *= d.spreadMult;
    if (aimLevel === 2 && d.adsSpreadMult) v *= d.adsSpreadMult;
    if (id === 'laser_sight' && aimLevel === 0) v *= 0.7; // the laser earns its keep from the hip
  }
  return v;
}

export function modRecoilMult(mods: readonly string[]): number {
  let v = 1;
  for (const id of mods) if (MODS[id]?.recoilMult) v *= MODS[id].recoilMult!;
  return v;
}

export function modAdsTimeMult(mods: readonly string[]): number {
  let v = 1;
  for (const id of mods) if (MODS[id]?.adsTimeMult) v *= MODS[id].adsTimeMult!;
  return v;
}
