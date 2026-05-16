/**
 * Centralized storage key names. Both AsyncStorage (local) and
 * NSUbiquitousKeyValueStore (iCloud) reference these.
 *
 * Single source of truth: previously these were duplicated in storage.ts
 * and sync.ts and could silently drift. Drift between local and iCloud
 * key names would cause sync to silently no-op.
 */

export const KEYS = {
  HABITS: 'habits',
  HABIT_LOGS: 'habit_logs',
  DOSE_LOGS: 'dose_logs',
  LAST_SYNC: 'last_sync_timestamp',
} as const;

export const ICLOUD_KEYS = {
  HABITS: 'habits',
  HABIT_LOGS: 'habit_logs',
  DOSE_LOGS: 'dose_logs',
  LAST_SYNC: 'last_sync',
} as const;
