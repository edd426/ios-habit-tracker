import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, HabitLog, DoseLog } from './types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

const KEYS = {
  HABITS: 'habits',
  HABIT_LOGS: 'habit_logs',
  DOSE_LOGS: 'dose_logs',
  LAST_SYNC: 'last_sync_timestamp',
};

/**
 * Merge local and remote data using last-write-wins strategy
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

  // Filter out deleted items
  return Array.from(merged.values()).filter((item) => !item.deleted);
}

/**
 * Sync all data for a user
 * Note: This is a placeholder for future iCloud sync implementation.
 * Currently, data is stored locally in AsyncStorage which automatically
 * backs up to iCloud when the device is configured for it.
 */
export async function syncAllData(userId: string): Promise<void> {
  // For now, just update the last sync timestamp
  // Future: Implement iCloud key-value sync here
  await AsyncStorage.setItem(KEYS.LAST_SYNC, Date.now().toString());
}

/**
 * Sync a single habit
 * Placeholder for future iCloud sync
 */
export async function syncHabit(userId: string, habit: Habit): Promise<void> {
  // Future: Sync to iCloud key-value store
  console.log('Sync habit (placeholder):', habit.id);
}

/**
 * Sync a single habit log
 * Placeholder for future iCloud sync
 */
export async function syncHabitLog(userId: string, log: HabitLog): Promise<void> {
  // Future: Sync to iCloud key-value store
  console.log('Sync habit log (placeholder):', log.id);
}

/**
 * Sync a single dose log
 * Placeholder for future iCloud sync
 */
export async function syncDoseLog(userId: string, log: DoseLog): Promise<void> {
  // Future: Sync to iCloud key-value store
  console.log('Sync dose log (placeholder):', log.id);
}

/**
 * Mark a habit as deleted (soft delete for sync)
 * Placeholder for future iCloud sync
 */
export async function syncDeleteHabit(userId: string, habitId: string): Promise<void> {
  // Future: Sync deletion to iCloud
  console.log('Sync delete habit (placeholder):', habitId);
}

/**
 * Mark a habit log as deleted (soft delete for sync)
 * Placeholder for future iCloud sync
 */
export async function syncDeleteHabitLog(userId: string, logId: string): Promise<void> {
  // Future: Sync deletion to iCloud
  console.log('Sync delete habit log (placeholder):', logId);
}

/**
 * Mark a dose log as deleted (soft delete for sync)
 * Placeholder for future iCloud sync
 */
export async function syncDeleteDoseLog(userId: string, logId: string): Promise<void> {
  // Future: Sync deletion to iCloud
  console.log('Sync delete dose log (placeholder):', logId);
}

/**
 * Get the last sync timestamp
 */
export async function getLastSyncTime(): Promise<number | null> {
  const timestamp = await AsyncStorage.getItem(KEYS.LAST_SYNC);
  return timestamp ? parseInt(timestamp, 10) : null;
}
