export type TrailerKind = 'utility' | 'flatbed' | 'box' | 'tanker' | 'carrier' | 'lowboy';

export interface TrailerDef {
  id: string;
  name: string;
  kind: TrailerKind;
  towClass: 1 | 2 | 3;
  length: number;
  width: number;
  massKg: number;
  storageKg: number;
  fuelMax?: number;
  /** Gooseneck coupler: needs a fifth-wheel-class tow vehicle, not a bumper hitch. */
  gooseneck?: boolean;
}

export const TRAILER_DEFS: TrailerDef[] = [
  {
    id: 't_utility',
    name: 'Utility Trailer',
    kind: 'utility',
    towClass: 1,
    length: 3.4,
    width: 1.8,
    massKg: 320,
    storageKg: 220,
  },
  {
    id: 't_flatbed',
    name: 'Flatbed Trailer',
    kind: 'flatbed',
    towClass: 2,
    length: 7.6,
    width: 2.5,
    massKg: 1150,
    storageKg: 120,
  },
  {
    id: 't_box',
    name: 'Box Trailer',
    kind: 'box',
    towClass: 3,
    length: 8.4,
    width: 2.6,
    massKg: 1750,
    storageKg: 1500,
  },
  {
    id: 't_tanker',
    name: 'Tanker Trailer',
    kind: 'tanker',
    towClass: 3,
    length: 7.8,
    width: 2.6,
    massKg: 1500,
    storageKg: 60,
    fuelMax: 2000,
  },
  {
    id: 't_carrier',
    name: 'Car Carrier',
    kind: 'carrier',
    towClass: 3,
    length: 8.8,
    width: 2.6,
    massKg: 1650,
    storageKg: 80,
  },
  {
    // HET-70: Oshkosh/M1000-style heavy equipment transporter from Ian's
    // Stitch spec — gooseneck coupler, ultra-low wide deck, 4-axle bogie.
    // Carries 1 tank OR up to 3 vehicles (enforced in Game's deck lock).
    id: 't_lowboy',
    name: 'HET-70 Heavy Lowboy',
    kind: 'lowboy',
    towClass: 3,
    gooseneck: true,
    length: 17.6,
    width: 3.4,
    massKg: 3400,
    storageKg: 500,
  },
];

export const TOW_RATING: Record<string, number> = {
  sportbike: 0,
  motocross: 0,
  atv: 0,
  skiff: 0,
  sedan: 0,
  mustang: 0,
  van: 1,
  bronco: 1,
  boxtruck: 1,
  sprinter: 1,
  pickup: 1,
  f250: 2,
  semi: 3,
  semi_day: 3,
  goliath: 3,
  tank: 3,
};

/** Vehicles with a fifth-wheel / gooseneck coupler (rating 3 AND the gear). */
export const GOOSENECK_TOWERS: readonly string[] = ['semi', 'semi_day', 'goliath', 'tank'];

export function trailerDef(id: string): TrailerDef | undefined {
  return TRAILER_DEFS.find((def) => def.id === id);
}

export function canHitch(vehicleDefId: string, trailerDefId: string): boolean {
  const def = trailerDef(trailerDefId);
  if (!def) return false;
  const rating = TOW_RATING[vehicleDefId] ?? 0;
  if (rating < def.towClass) return false;
  // a gooseneck trailer only couples to a fifth-wheel-class rig
  if (def.gooseneck && !GOOSENECK_TOWERS.includes(vehicleDefId)) return false;
  return true;
}

/** Deck trailers take drive-on vehicle loads; the rest take crates/storage. */
export function isDeckKind(kind: TrailerKind): boolean {
  return kind === 'flatbed' || kind === 'carrier' || kind === 'lowboy';
}

/** Vehicle bays on a deck trailer (the HET-70 packs three; others one). */
export function deckBayCount(def: TrailerDef): number {
  return def.kind === 'lowboy' ? 3 : isDeckKind(def.kind) ? 1 : 0;
}

export type ModuleId = 'cargo' | 'hab' | 'beacon';

export interface ModuleDef {
  id: ModuleId;
  name: string;
  desc: string;
  cost: { itemId: string; qty: number }[];
}

export const MODULE_DEFS: ModuleDef[] = [
  {
    id: 'cargo',
    name: 'Cargo Buildout',
    desc: 'Crate racks and tie-down rails line the box walls, more than doubling box storage with secure, stackable cargo space.',
    cost: [
      { itemId: 'scrap', qty: 4 },
      { itemId: 'wood', qty: 3 },
    ],
  },
  {
    id: 'hab',
    name: 'Recon Hab',
    desc: 'An enterable living module fitted into the trailer: insulated walls, storage, and a bed you can sleep in to pass the night.',
    cost: [
      { itemId: 'wood', qty: 6 },
      { itemId: 'cloth', qty: 4 },
      { itemId: 'car_battery', qty: 1 },
    ],
  },
  {
    id: 'beacon',
    name: 'Sat / Horde Beacon',
    desc: 'A deployable sat uplink for fleet tracking and a daily supply drop, with a horde-lure mode that broadcasts noise to draw husks to the beacon instead of you.',
    cost: [
      { itemId: 'wire', qty: 4 },
      { itemId: 'gun_parts', qty: 2 },
      { itemId: 'car_battery', qty: 1 },
    ],
  },
];

export function moduleDef(id: string): ModuleDef | undefined {
  return MODULE_DEFS.find((def) => def.id === id);
}
