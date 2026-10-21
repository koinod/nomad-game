import type { FactionDef } from '../store/types';

// ─── FACTION CANON (FACTIONS_CANON.md is the bible — this file is its code) ──
//
// Roster: six easymode factions + the Enclave (rumor in easymode, canon in
// hardmode) + three hardmode factions. The three slice-era factions Ian did
// not name (The Pier / The Refuge / Hollow Market) are FOLDED, not deleted —
// see FACTION_FOLDS: their people and places survive under new tags.
//
// REP BANDS — RULED BY IAN 2026-10-21 ("one line difference between the two
// bands"): the SYSTEMS_SPEC §0.1 sodgame ladder wins (War ≤−75 / Hostile
// −74…−50 / Wary −49…−10 / Neutral −9…24 / Friendly ≥25 / Allied ≥75),
// superseding FACTIONS_CANON §7.2's ladder. Its cutoffs match the raw gates
// the game already enforces (medic/town at 25, quartermaster at 75), so the
// labels tell the truth about the mechanics. Every gate (traders, claims)
// still runs on raw rep numbers — never tier names — so this stays a
// label-only surface.

export type FactionEra = 'easymode' | 'rumor' | 'hardmode';

export interface CanonFactionDef extends FactionDef {
  /** The in-world epithet — what the coast calls them. */
  epithet: string;
  /** Rep a new game starts at (consumed by the store init — Lane 5). */
  startRep: number;
  era: FactionEra;
  /** Key into TRADERS (data/traders.ts). null = no trader BY DESIGN. */
  traderId: string | null;
  /** Anchored relationships — exactly two per canon §1. */
  allies: string[];
  rivals: string[];
}

export const FACTIONS: CanonFactionDef[] = [
  {
    id: 'lighthouse', name: 'Lighthouse Collective', leader: 'Dr. Anya Kowalski',
    epithet: 'the ones who still answer the radio',
    role: 'Radio net, tech, mods, intel',
    desc: 'Holdouts at the light rebuilding the radio net, one tower at a time. They trade intel the way others trade food.',
    inSlice: true, startRep: 0, era: 'easymode', traderId: 'kowalski_bench',
    allies: ['union'], rivals: ['skulls'],
  },
  {
    id: 'remnants', name: 'Military Remnants', leader: 'The Long Chain',
    epithet: 'the Long Chain — what’s left of a chain of command',
    role: 'Armory, heavy weapons, convoy routes',
    desc: 'What’s left of a chain of command, still giving orders nobody above them is left to countermand. East-cape Coast Guard station. The grind faction: hostile start, best shop in the game at the top.',
    inSlice: true, startRep: -50, era: 'easymode', traderId: 'quartermaster',
    allies: ['lighthouse'], rivals: ['skulls'],
  },
  {
    id: 'union', name: 'Survivors Union', leader: 'The Charter',
    epithet: 'the town that feeds itself',
    role: 'Food, medicine, people — town, harbor quarter, clinic wing',
    desc: 'Neighbors with a charter, not an army. The town that feeds itself: gardens, the school dormitory, the caravan depot — plus the folded Pier harbor quarter and Refuge clinic wing.',
    inSlice: true, startRep: 25, era: 'easymode', traderId: 'union_medic',
    allies: ['lighthouse'], rivals: ['skulls'],
  },
  {
    id: 'skulls', name: 'Rust Skulls', leader: 'The toll crews',
    epithet: 'pay the toll or pay in teeth',
    role: 'The roads: tolls, ambushes, the war-rig garage',
    desc: 'Raiders who turned the toll road into a religion. Dune fort, spike walls, fire barrels. No trader by design — you pay tolls, fight pits, or take their caches. Their black fence at Ocracoke (the Hollow Market fold) is the deniable exception.',
    inSlice: true, startRep: -30, era: 'easymode', traderId: null,
    allies: [], rivals: ['remnants', 'union'],
  },
  {
    id: 'tollkeepers', name: 'The Tollkeepers', leader: 'Wraith',
    epithet: 'the bridge is theirs; the crossing is yours for a price',
    role: 'Crossings: bridge tolls, the plaza exchange',
    desc: 'They hold the Wright Memorial Bridge — the literal gate between regions. Neutral the way a turnstile is neutral. Prices are the toll schedule; haggling is not a concept they recognize.',
    inSlice: true, startRep: 0, era: 'easymode', traderId: 'toll_exchange',
    allies: [], rivals: ['drowned'],
  },
  {
    id: 'drowned', name: 'The Drowned', leader: 'Cpt. Selene Vesper',
    epithet: 'the flotilla that never came ashore',
    role: 'Boats, salvage, ferries — the chandlery',
    desc: 'The Pamlico Sound flotilla, commanded from the converted ferry Vesper’s Wake. The water door: every crossing the Tollkeepers tax, the Drowned can ferry — for a different price and a different risk.',
    inSlice: true, startRep: 0, era: 'easymode', traderId: 'chandlery',
    allies: ['union'], rivals: ['tollkeepers'],
  },
  {
    id: 'enclave', name: 'The Enclave', leader: '—',
    epithet: 'the signal nobody answers',
    role: 'Rumors only: dead-drop caches, tech that matches no faction’s make',
    desc: 'Pre-Static continuity-of-government that may or may not still exist. Locked caches, a radio burst on a dead frequency, supply drops nobody claims. A question mark the player finds evidence of — never an answer. (Canonization as a hardmode faction is Ian’s open Decision 1.)',
    inSlice: false, startRep: 0, era: 'rumor', traderId: null,
    allies: [], rivals: [],
  },
  {
    id: 'authority', name: 'The Reclamation Authority', leader: 'The Ledger',
    epithet: 'the government came back with the cure and a ledger',
    role: 'Compliance: registration, permits, confiscation — HARDMODE',
    desc: 'Everything you built is now an unpermitted structure on federal land. Not evil — administrative, which is worse. Arrives with the cure.',
    inSlice: false, startRep: 0, era: 'hardmode', traderId: 'licensed_quartermaster',
    allies: [], rivals: [],
  },
  {
    id: 'boneyard', name: 'The Boneyard', leader: 'The torch crews',
    epithet: 'the shipbreakers of the dead fleet',
    role: 'Heavy industry: ship steel, APC-scale plate — HARDMODE',
    desc: 'Norfolk’s navy yards, stripped by the people who used to maintain them. Salt-kin to the Drowned — boat people recognize boat people (Drowned rep carries at half value). The Authority’s fleet requisition is hardmode’s first war.',
    inSlice: false, startRep: 0, era: 'hardmode', traderId: 'breakers_exchange',
    allies: ['drowned'], rivals: ['authority'],
  },
  {
    id: 'listeners', name: 'The Listeners', leader: '—',
    epithet: 'the ones trying to tune the Static back in',
    role: 'No rep, no trader, no negotiation — HARDMODE',
    desc: 'To them the cure wasn’t salvation, it was silence. They tamper with relays, beacons — and dormant husks, learning to wake them. The faction you cannot talk to.',
    inSlice: false, startRep: 0, era: 'hardmode', traderId: null,
    allies: [], rivals: [],
  },
];

export function factionById(id: string): CanonFactionDef | undefined {
  return FACTIONS.find((f) => f.id === id);
}

/** New-game rep seeds for easymode factions (store init — Lane 5 consumes). */
export const STARTING_REP: Record<string, number> = Object.fromEntries(
  FACTIONS.filter((f) => f.era === 'easymode').map((f) => [f.id, f.startRep]),
);

// ─── The folds (FACTIONS_CANON §5) ───────────────────────────────────────────
// The people stay; the faction tags go. Legacy save rep under a folded id
// belongs to the absorbing faction (LEGACY_REP_ALIAS — Lane 5 migration).

export interface FactionFold {
  /** Absorbing canonical faction id. */
  into: string;
  /** Where the folded crew lives now. */
  place: string;
  /** Who still stands there. */
  people: string;
  note: string;
}

export const FACTION_FOLDS: Record<string, FactionFold> = {
  pier: {
    into: 'union', place: 'Union harbor quarter (marina)',
    people: 'Cpt. Idris Boudreaux — now the Union’s harbormaster',
    note: 'Honest trade at the docks survives as the Union’s dock market.',
  },
  refuge: {
    into: 'union', place: 'Union clinic wing (town)',
    people: 'Sister Mariah Okonkwo — runs the church infirmary',
    note: 'Medicine stays Union — one medic trader, not two.',
  },
  hollow: {
    into: 'skulls', place: 'Ocracoke fence',
    people: 'The Accountant — still at the night market',
    note: 'The black-market outlet the Skulls deny owning. The faction tag goes; the fence stays a place, traded through events, not a shop UI.',
  },
};

export const LEGACY_REP_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(FACTION_FOLDS).map(([oldId, fold]) => [oldId, fold.into]),
);

// ─── Rep tiers ───────────────────────────────────────────────────────────────
// The sodgame ladder (SYSTEMS_SPEC §0.1), per Ian's 2026-10-21 ruling — see
// the note at the top of this file. Gates use raw numbers (e.g.
// ALLIED_DEEP_GATE), never tier names, so the code is band-agnostic.

export type RepTier = 'War' | 'Hostile' | 'Wary' | 'Neutral' | 'Friendly' | 'Allied';

export function repTier(rep: number): RepTier {
  if (rep <= -75) return 'War';
  if (rep <= -50) return 'Hostile';
  if (rep <= -10) return 'Wary';
  if (rep < 25) return 'Neutral';
  if (rep < 75) return 'Friendly';
  return 'Allied';
}

/**
 * The Remnant quartermaster's gate: rep 75 — since the 2026-10-21 re-band
 * this coincides with the Allied tier boundary itself.
 */
export const ALLIED_DEEP_GATE = 75;
