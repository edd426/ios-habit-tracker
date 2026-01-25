import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, HabitLog, DoseLog } from './types';
import {
  initializeICloud,
  isICloudAvailable,
  getICloudItem,
  setICloudItem,
} from './icloud';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'unavailable';

const KEYS = {
  HABITS: 'habits',
  HABIT_LOGS: 'habit_logs',
  DOSE_LOGS: 'dose_logs',
  LAST_SYNC: 'last_sync_timestamp',
};

// iCloud key names
const ICLOUD_KEYS = {
  HABITS: 'habits',
  HABIT_LOGS: 'habit_logs',
  DOSE_LOGS: 'dose_logs',
  LAST_SYNC: 'last_sync',
};

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
function mergeData<T extends { id: string; updatedAt?: number; createdAt?: number; deleted?: boolean }>(
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
 * Filter out deleted items for display purposes.
 * Keeps deleted items in storage for sync consistency.
 */
function filterDeleted<T extends { deleted?: boolean }>(items: T[]): T[] {
  return items.filter((item) => !item.deleted);
}

/**
 * Get data from iCloud, parsing JSON safely.
 */
async function getICloudData<T>(key: string): Promise<T[]> {
  const data = await getICloudItem(key);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    console.warn(`Failed to parse iCloud data for key "${key}"`);
    return [];
  }
}

/**
 * Get data from AsyncStorage, parsing JSON safely.
 */
async function getLocalData<T>(key: string): Promise<T[]> {
  const data = await AsyncStorage.getItem(key);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    console.warn(`Failed to parse local data for key "${key}"`);
    return [];
  }
}

/**
 * Sync a specific data type between local and iCloud.
 * Returns the merged data.
 */
async function syncDataType<T extends { id: string; updatedAt?: number; createdAt?: number; deleted?: boolean }>(
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

/**
 * Sync all data between local storage and iCloud.
 * This is the main sync function - call it on app startup and foreground.
 */
export async function syncAllData(userId: string): Promise<void> {
  if (!isICloudAvailable()) {
    // iCloud not available - just update local timestamp
    await AsyncStorage.setItem(KEYS.LAST_SYNC, Date.now().toString());
    return;
  }

  try {
    // Sync all data types in parallel
    await Promise.all([
      syncDataType<Habit>(KEYS.HABITS, ICLOUD_KEYS.HABITS),
      syncDataType<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS),
      syncDataType<DoseLog>(KEYS.DOSE_LOGS, ICLOUD_KEYS.DOSE_LOGS),
    ]);

    // Update sync timestamp in both stores
    const timestamp = Date.now().toString();
    await AsyncStorage.setItem(KEYS.LAST_SYNC, timestamp);
    await setICloudItem(ICLOUD_KEYS.LAST_SYNC, timestamp);

    console.log('Sync completed successfully');
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
}

/**
 * Push local habits to iCloud after a local change.
 */
async function pushHabitsToICloud(): Promise<void> {
  if (!isICloudAvailable()) return;

  const localData = await getLocalData<Habit>(KEYS.HABITS);
  await setICloudItem(ICLOUD_KEYS.HABITS, JSON.stringify(localData));
}

/**
 * Push local habit logs to iCloud after a local change.
 */
async function pushHabitLogsToICloud(): Promise<void> {
  if (!isICloudAvailable()) return;

  const localData = await getLocalData<HabitLog>(KEYS.HABIT_LOGS);
  await setICloudItem(ICLOUD_KEYS.HABIT_LOGS, JSON.stringify(localData));
}

/**
 * Push local dose logs to iCloud after a local change.
 */
async function pushDoseLogsToICloud(): Promise<void> {
  if (!isICloudAvailable()) return;

  const localData = await getLocalData<DoseLog>(KEYS.DOSE_LOGS);
  await setICloudItem(ICLOUD_KEYS.DOSE_LOGS, JSON.stringify(localData));
}

/**
 * Sync a single habit to iCloud.
 * Called after local habit create/update.
 */
export async function syncHabit(userId: string, habit: Habit): Promise<void> {
  await pushHabitsToICloud();
}

/**
 * Sync a single habit log to iCloud.
 * Called after local habit log create/update.
 */
export async function syncHabitLog(userId: string, log: HabitLog): Promise<void> {
  await pushHabitLogsToICloud();
}

/**
 * Sync a single dose log to iCloud.
 * Called after local dose log create/update.
 */
export async function syncDoseLog(userId: string, log: DoseLog): Promise<void> {
  await pushDoseLogsToICloud();
}

/**
 * Sync habit deletion to iCloud.
 * The local storage already has the habit marked as deleted or removed.
 */
export async function syncDeleteHabit(userId: string, habitId: string): Promise<void> {
  await pushHabitsToICloud();
}

/**
 * Sync habit log deletion to iCloud.
 */
export async function syncDeleteHabitLog(userId: string, logId: string): Promise<void> {
  await pushHabitLogsToICloud();
}

/**
 * Sync dose log deletion to iCloud.
 */
export async function syncDeleteDoseLog(userId: string, logId: string): Promise<void> {
  await pushDoseLogsToICloud();
}

/**
 * Get the last sync timestamp.
 */
export async function getLastSyncTime(): Promise<number | null> {
  const timestamp = await AsyncStorage.getItem(KEYS.LAST_SYNC);
  return timestamp ? parseInt(timestamp, 10) : null;
}
