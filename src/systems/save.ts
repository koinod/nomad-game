import { openDB, type IDBPDatabase } from 'idb';
import type { DifficultyId, SaveMeta, SaveSnapshot } from '../store/types';

const DB_NAME = 'nomad';
const STORE = 'saves';
const CURRENT_VERSION = 3;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'slot' });
        }
      },
    }).catch((err) => {
      // Don't cache a failed open — let the next call retry.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A save record as it may exist on disk: possibly older than CURRENT_VERSION,
 * plus the `slot` key field that the object store requires.
 */
export type RawSaveRecord = Omit<Partial<SaveSnapshot>, 'version'> & {
  version: number;
  slot: string;
};

/**
 * Migrate a raw save record forward to the current version.
 * Throws on unknown versions so bad data never silently loads.
 *
 * Parallel-cycle note (Lane 5 field contract): the v3 snapshot grows by
 * OPTIONAL fields only — craftQueue (Lane 7's CraftJob[], segment-based:
 * startedAtMin/bankedMin/durationMin/status — see types.ts) /
 * storyChoices / baseExt (Lane 7/9/10 state), plus the second batch:
 * claims + moraleRuntime (Lane 10) and beaconChoice (Lane 9). Joining
 * wave 3's dispatches/journal/scouted/baseQueue and wave 4's appearance.
 * IndexedDB stores records as-is, so current-version saves pass through
 * untouched below and the new fields ride along; the STORE defaults any
 * that are absent on load (see gameStore.loadFromSlot — including the
 * legacy base → claims migration and the legacy rep fold, which live
 * there, not here). No version bump, and nothing here fills them in —
 * same rule as wave 3.
 */
export function migrate(record: RawSaveRecord): SaveSnapshot {
  const s: Record<string, unknown> = { ...record };

  if (s.version === 0) {
    // v0 -> v1: phone state, battery, hotbar, equipped, and seed were added.
    if (s.battery === undefined) s.battery = 100;
    if (s.phoneUnlocked === undefined) s.phoneUnlocked = false;
    if (s.hotbar === undefined) s.hotbar = [null, null, null];
    if (s.equipped === undefined)
      // inventory v2 shape; older records keep their legacy fields and
      // are unified by the store's load migration (migrateEquipped).
      s.equipped = {
        primary: null, secondary: null, tertiary: null, activeWeapon: 'primary',
        head: null, jacket: null, vest: null, pants: null, backpack: null,
        melee: null, ranged: null,
      };
    if (s.seed === undefined) s.seed = 0;
    s.version = 1;
  }

  if (s.version === 1) {
    // v1 -> v2: run-length state was added (days, skills/perks, crew,
    // base, vehicles). Old saves start those fresh — nothing else moves.
    const blankSkills: Record<string, { level: number; xp: number }> = {};
    for (const id of ['combat', 'mechanics', 'medicine', 'stealth', 'driver', 'scavenging', 'leadership']) {
      blankSkills[id] = { level: 0, xp: 0 };
    }
    if (s.daysElapsed === undefined) s.daysElapsed = 0;
    if (s.skills === undefined) s.skills = blankSkills;
    if (s.perkPoints === undefined) s.perkPoints = 0;
    if (s.perks === undefined) s.perks = [];
    if (s.survivors === undefined) s.survivors = [];
    if (s.base === undefined) s.base = null;
    if (s.vehicles === undefined) s.vehicles = [];
    s.version = 2;
  }

  if (s.version === 2) {
    // v2 -> v3: trailers were added, and vehicles grew storage / upgrades /
    // flat-tire state. Old runs keep their vehicles; trailers spawn fresh.
    if (s.trailers === undefined) s.trailers = [];
    if (Array.isArray(s.vehicles)) {
      for (const v of s.vehicles as Record<string, unknown>[]) {
        if (v.storage === undefined) v.storage = [];
        if (v.upgrades === undefined) v.upgrades = [];
        if (v.tiresFlat === undefined) v.tiresFlat = 0;
      }
    }
    s.version = 3;
  }

  if (s.version !== CURRENT_VERSION) {
    throw new Error(`save.ts: cannot migrate unknown save version ${String(s.version)}`);
  }

  // Strip the object-store key field before handing it to the store.
  const { slot: _slot, ...snap } = s;
  return snap as unknown as SaveSnapshot;
}

export async function saveGameToSlot(slot: string, snap: SaveSnapshot): Promise<void> {
  try {
    if (!slot) throw new Error('slot id is empty');
    const db = await getDb();
    await db.put(STORE, { ...snap, slot });
  } catch (err) {
    throw new Error(`save.ts: failed to write save slot "${slot}": ${msg(err)}`);
  }
}

export async function loadGameFromSlot(slot: string): Promise<SaveSnapshot | null> {
  try {
    if (!slot) throw new Error('slot id is empty');
    const db = await getDb();
    const record = (await db.get(STORE, slot)) as RawSaveRecord | undefined;
    if (!record) return null;
    // migrate() passes current-version saves through untouched.
    return migrate(record);
  } catch (err) {
    throw new Error(`save.ts: failed to load save slot "${slot}": ${msg(err)}`);
  }
}

const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  story: 'Story',
  survivor: 'Survivor',
  hardcore: 'Hardcore',
};

function slotTitle(slot: string): string {
  return slot === 'auto' ? 'Auto' : `Slot ${slot}`;
}

export async function listSaveSlots(): Promise<SaveMeta[]> {
  try {
    const db = await getDb();
    const records = (await db.getAll(STORE)) as RawSaveRecord[];
    records.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
    return records.map((r) => {
      const playMinutes = Math.floor((r.playSeconds ?? 0) / 60);
      const difficulty = (r.difficulty ?? 'survivor') as DifficultyId;
      return {
        slot: r.slot,
        label: `${slotTitle(r.slot)} — ${playMinutes} min — ${DIFFICULTY_LABELS[difficulty] ?? difficulty}`,
        savedAt: r.savedAt ?? 0,
        playMinutes,
        difficulty,
      } satisfies SaveMeta;
    });
  } catch (err) {
    throw new Error(`save.ts: failed to list save slots: ${msg(err)}`);
  }
}

export async function deleteSaveSlot(slot: string): Promise<void> {
  try {
    if (!slot) throw new Error('slot id is empty');
    const db = await getDb();
    await db.delete(STORE, slot);
  } catch (err) {
    throw new Error(`save.ts: failed to delete save slot "${slot}": ${msg(err)}`);
  }
}
