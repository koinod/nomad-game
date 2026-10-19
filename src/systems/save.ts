import { openDB, type IDBPDatabase } from 'idb';
import type { DifficultyId, SaveMeta, SaveSnapshot } from '../store/types';

const DB_NAME = 'nomad';
const STORE = 'saves';
const CURRENT_VERSION = 1;

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
 */
export function migrate(record: RawSaveRecord): SaveSnapshot {
  const s: Record<string, unknown> = { ...record };

  switch (s.version) {
    case 0: {
      // v0 -> v1: phone state, battery, hotbar, equipped, and seed were added.
      if (s.battery === undefined) s.battery = 100;
      if (s.phoneUnlocked === undefined) s.phoneUnlocked = false;
      if (s.hotbar === undefined) s.hotbar = [null, null, null];
      if (s.equipped === undefined)
        s.equipped = { melee: null, ranged: null, pack: null };
      if (s.seed === undefined) s.seed = 0;
      s.version = 1;
      break;
    }
    case 1:
      // Current — nothing to do.
      break;
    default:
      throw new Error(`save.ts: cannot migrate unknown save version ${String(s.version)}`);
  }

  if (s.version !== CURRENT_VERSION) {
    throw new Error(
      `save.ts: migration incomplete, still at version ${String(s.version)}`,
    );
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
