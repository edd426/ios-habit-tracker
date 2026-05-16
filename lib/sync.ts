import AsyncStorage from '@react-native-async-storage/async-storage';
import { BaseEntity, Habit, HabitLog, DoseLog } from './types';
import {
  initializeICloud,
  isICloudAvailable,
  getICloudItem,
  setICloudItem,
} from './icloud';
import { withTimeout } from './with-timeout';
import { KEYS, ICLOUD_KEYS } from './keys';
import { safeParse } from './safe-json';

// Hard ceiling on a single sync attempt. Anything longer is treated as a
// failure rather than allowed to keep the JS thread busy. 10s is generous —
// a healthy sync on the user's dataset takes <500ms — and is well under
// iOS's New-Arch invalidation watchdog (~10s) so a background-during-sync
// can't deadlock the app on next launch.
const SYNC_TIMEOUT_MS = 10_000;

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'unavailable';

/**
 * Initialize iCloud sync. Call this on app startup.
 * Returns true if iCloud is available.
 */
export async function setupICloudSync(): Promise<boolean> {
  return await initializeICloud();
}

/**
 * Check if iCloud sync is available.
 */
export function isICloudSyncAvailable(): boolean {
  return isICloudAvailable();
}

/**
 * Merge local and remote data using last-write-wins strategy.
 * Returns merged data that should be written to both stores.
 */
function mergeData<T extends BaseEntity>(
  local: T[],
  remote: T[]
): T[] {
  const merged = new Map<string, T>();

  // Add all local items
  for (const item of local) {
    merged.set(item.id, item);
  }

  // Merge remote items, using last-write-wins
  for (const remoteItem of remote) {
    const localItem = merged.get(remoteItem.id);

    if (!localItem) {
      // New item from remote
      merged.set(remoteItem.id, remoteItem);
    } else {
      // Both exist - use the one with later updatedAt
      const localUpdated = localItem.updatedAt ?? localItem.createdAt ?? 0;
      const remoteUpdated = remoteItem.updatedAt ?? remoteItem.createdAt ?? 0;

      if (remoteUpdated > localUpdated) {
        merged.set(remoteItem.id, remoteItem);
      }
    }
  }

  return Array.from(merged.values());
}

/**
 * Get data from iCloud, parsing JSON safely.
 */
async function getICloudData<T>(key: string): Promise<T[]> {
  const data = await getICloudItem(key);
  return safeParse<T[]>(data, []);
}

/**
 * Get data from AsyncStorage, parsing JSON safely.
 */
async function getLocalData<T>(key: string): Promise<T[]> {
  const data = await AsyncStorage.getItem(key);
  return safeParse<T[]>(data, []);
}

/**
 * Sync a specific data type between local and iCloud.
 * Returns the merged data.
 */
async function syncDataType<T extends BaseEntity>(
  localKey: string,
  icloudKey: string
): Promise<T[]> {
  // Read from both stores
  const localData = await getLocalData<T>(localKey);
  const remoteData = await getICloudData<T>(icloudKey);

  // Merge using last-write-wins
  const merged = mergeData(localData, remoteData);

  // Write merged data to both stores
  const jsonData = JSON.stringify(merged);
  await AsyncStorage.setItem(localKey, jsonData);
  await setICloudItem(icloudKey, jsonData);

  return merged;
}

// In-flight sync promise. Concurrent callers share this — back-to-back
// foreground events and the initial startup sync coalesce into one.
let inFlightSync: Promise<void> | null = null;

/**
 * Sync all data between local storage and iCloud.
 * Call on app startup and foreground.
 *
 * - Coalesces concurrent callers into a single in-flight sync.
 * - Bounded by SYNC_TIMEOUT_MS so a stuck iCloud call can't wedge the app.
 * - Always resolves the mutex even on timeout/error, so future syncs aren't blocked.
 */
export async function syncAllData(userId: string): Promise<void> {
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    if (!isICloudAvailable()) {
      // iCloud not available - just update local timestamp
      await AsyncStorage.setItem(KEYS.LAST_SYNC, Date.now().toString());
      return;
    }

    try {
      // Sync all data types in parallel, with a hard timeout.
      await withTimeout(
        Promise.all([
          syncDataType<Habit>(KEYS.HABITS, ICLOUD_KEYS.HABITS),
          syncDataType<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS),
          syncDataType<DoseLog>(KEYS.DOSE_LOGS, ICLOUD_KEYS.DOSE_LOGS),
        ]),
        SYNC_TIMEOUT_MS,
        'iCloud sync'
      );

      // Update sync timestamp in both stores
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(KEYS.LAST_SYNC, timestamp);
      await setICloudItem(ICLOUD_KEYS.LAST_SYNC, timestamp);

      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    }
  })();

  try {
    await inFlightSync;
  } finally {
    // Release the mutex whether success or failure, so the next call can retry.
    inFlightSync = null;
  }
}

/**
 * Push the entire local collection at `localKey` to iCloud at `icloudKey`.
 * Called after any local mutation (create/update/delete) to keep iCloud in sync.
 *
 * Must read the raw blob — NOT a filtered view — because tombstones
 * (`deleted: true` records) must propagate via this push so other devices
 * can apply the delete during their next merge. The GC sweep is the only
 * thing that should remove tombstones, and only after the grace period.
 *
 * No-ops cleanly if iCloud is unavailable; failures are caught by the
 * caller (`backgroundSync` in storage.ts swallows the rejection).
 */
export async function pushCollectionToICloud(
  localKey: string,
  icloudKey: string
): Promise<void> {
  if (!isICloudAvailable()) return;

  const raw = await AsyncStorage.getItem(localKey);
  // Send `'[]'` rather than `null` so an explicit empty list overwrites
  // any stale iCloud state (e.g., after a full local wipe).
  await setICloudItem(icloudKey, raw ?? '[]');
}

/**
 * Get the last sync timestamp.
 */
export async function getLastSyncTime(): Promise<number | null> {
  const timestamp = await AsyncStorage.getItem(KEYS.LAST_SYNC);
  return timestamp ? parseInt(timestamp, 10) : null;
}
