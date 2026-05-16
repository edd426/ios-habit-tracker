import AsyncStorage from '@react-native-async-storage/async-storage';
import { BaseEntity, Habit, HabitLog, DoseLog } from './types';
import { pushCollectionToICloud } from './sync';
import { getCurrentUserId } from './auth';
import { safeParse } from './safe-json';
import { withTimeout } from './with-timeout';
import { KEYS, ICLOUD_KEYS } from './keys';

// Generate unique ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Background sync helper - doesn't block the main operation.
 * Errors are logged but never thrown; the local write has already succeeded
 * and is the source of truth.
 */
function backgroundSync<T>(syncFn: () => Promise<T>): void {
  syncFn().catch((error) => {
    console.warn('Background sync failed:', error);
  });
}

/**
 * Read a collection, apply `mutate`, write it back, and queue an iCloud push.
 *
 * One helper for the eleven CRUD operations that previously copy-pasted the
 * same read-mutate-write pattern. Reads the RAW blob via `safeParse` (NOT
 * via the filter-deleted accessors like `getHabits()`) so that tombstones
 * are preserved and propagated to iCloud — they're only removed by the
 * dedicated `gcCollection` sweep after a grace period.
 *
 * Returns the post-mutation items so callers that need to know "what's in
 * there now" don't need a second read.
 */
async function mutateCollection<T extends BaseEntity>(
  localKey: string,
  icloudKey: string,
  mutate: (items: T[]) => T[]
): Promise<T[]> {
  const raw = await AsyncStorage.getItem(localKey);
  const items = safeParse<T[]>(raw, []);
  const next = mutate(items);
  await AsyncStorage.setItem(localKey, JSON.stringify(next));
  backgroundSync(() => pushCollectionToICloud(localKey, icloudKey));
  return next;
}

// Habits
export async function getHabits(): Promise<Habit[]> {
  const data = await AsyncStorage.getItem(KEYS.HABITS);
  const habits: Habit[] = safeParse(data, []);
  // Filter out soft-deleted items
  return habits.filter((h) => !h.deleted);
}

export async function addHabit(name: string, type: 'increase' | 'decrease'): Promise<Habit> {
  const now = Date.now();
  const newHabit: Habit = {
    id: generateId(),
    name,
    type,
    createdAt: now,
    updatedAt: now,
  };
  await mutateCollection<Habit>(KEYS.HABITS, ICLOUD_KEYS.HABITS, (items) => [...items, newHabit]);
  return newHabit;
}

export async function updateHabit(
  id: string,
  updates: Partial<Omit<Habit, 'id' | 'createdAt'>>
): Promise<void> {
  await mutateCollection<Habit>(KEYS.HABITS, ICLOUD_KEYS.HABITS, (items) =>
    items.map((h) => (h.id === id ? { ...h, ...updates, updatedAt: Date.now() } : h))
  );
}

export async function deleteHabit(id: string): Promise<void> {
  // Cascade: remove the habit and all its logs. Two collections → two
  // mutateCollection calls, each handles its own iCloud push.
  await mutateCollection<Habit>(KEYS.HABITS, ICLOUD_KEYS.HABITS, (items) =>
    items.filter((h) => h.id !== id)
  );
  await mutateCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, (items) =>
    items.filter((l) => l.habitId !== id)
  );
}

// Habit Logs
export async function getHabitLogs(): Promise<HabitLog[]> {
  const data = await AsyncStorage.getItem(KEYS.HABIT_LOGS);
  const logs: HabitLog[] = safeParse(data, []);
  // Filter out soft-deleted items
  return logs.filter((l) => !l.deleted);
}

export async function logHabit(habitId: string, timestamp?: number): Promise<HabitLog> {
  const now = Date.now();
  const newLog: HabitLog = {
    id: generateId(),
    habitId,
    timestamp: timestamp ?? now,
    createdAt: now,
    updatedAt: now,
  };
  await mutateCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, (items) => [
    ...items,
    newLog,
  ]);
  return newLog;
}

export async function getLogsForHabit(habitId: string): Promise<HabitLog[]> {
  const logs = await getHabitLogs();
  return logs.filter((l) => l.habitId === habitId);
}

export async function removeLastTodayLog(habitId: string): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  // Closure captures whether anything was removed, since the mutator's
  // return shape can't carry that signal.
  let removed = false;

  await mutateCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, (items) => {
    const todayLogs = items
      .filter((l) => l.habitId === habitId && l.timestamp >= todayStart && !l.deleted)
      .sort((a, b) => b.timestamp - a.timestamp);
    if (todayLogs.length === 0) return items;
    const toRemove = todayLogs[0];
    removed = true;
    return items.filter((l) => l.id !== toRemove.id);
  });

  return removed;
}

export async function getTodayCountForHabit(habitId: string): Promise<number> {
  const logs = await getLogsForHabit(habitId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  return logs.filter((l) => l.timestamp >= todayStart).length;
}

export async function getAllTodayCounts(): Promise<Record<string, number>> {
  const logs = await getHabitLogs();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  const counts: Record<string, number> = {};
  logs
    .filter((l) => l.timestamp >= todayStart)
    .forEach((l) => {
      counts[l.habitId] = (counts[l.habitId] || 0) + 1;
    });
  return counts;
}

// Dose Logs
export async function getDoseLogs(): Promise<DoseLog[]> {
  const data = await AsyncStorage.getItem(KEYS.DOSE_LOGS);
  const logs: DoseLog[] = safeParse(data, []);
  // Filter out soft-deleted items
  return logs.filter((l) => !l.deleted);
}

export async function logDose(timestamp?: number): Promise<DoseLog> {
  const now = Date.now();
  const newLog: DoseLog = {
    id: generateId(),
    timestamp: timestamp ?? now,
    createdAt: now,
    updatedAt: now,
  };
  await mutateCollection<DoseLog>(KEYS.DOSE_LOGS, ICLOUD_KEYS.DOSE_LOGS, (items) => [
    ...items,
    newLog,
  ]);
  return newLog;
}

export async function getLastDose(): Promise<DoseLog | null> {
  const logs = await getDoseLogs();
  if (logs.length === 0) return null;
  return logs.reduce((latest, current) =>
    current.timestamp > latest.timestamp ? current : latest
  );
}

// Date-based queries and log management
export async function getLogsForDate(date: Date): Promise<HabitLog[]> {
  const logs = await getHabitLogs();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;

  return logs
    .filter((l) => l.timestamp >= dayStart.getTime() && l.timestamp < dayEnd)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateLog(logId: string, updates: { timestamp?: number }): Promise<void> {
  await mutateCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, (items) =>
    items.map((l) => (l.id === logId ? { ...l, ...updates, updatedAt: Date.now() } : l))
  );
}

export async function deleteLog(logId: string): Promise<void> {
  await mutateCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, (items) =>
    items.filter((l) => l.id !== logId)
  );
}

export async function getDoseLogsForDate(date: Date): Promise<DoseLog[]> {
  const logs = await getDoseLogs();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;

  return logs
    .filter((l) => l.timestamp >= dayStart.getTime() && l.timestamp < dayEnd)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateDoseLog(
  logId: string,
  updates: { timestamp?: number }
): Promise<void> {
  await mutateCollection<DoseLog>(KEYS.DOSE_LOGS, ICLOUD_KEYS.DOSE_LOGS, (items) =>
    items.map((l) => (l.id === logId ? { ...l, ...updates, updatedAt: Date.now() } : l))
  );
}

export async function deleteDoseLog(logId: string): Promise<void> {
  await mutateCollection<DoseLog>(KEYS.DOSE_LOGS, ICLOUD_KEYS.DOSE_LOGS, (items) =>
    items.filter((l) => l.id !== logId)
  );
}

// Garbage collection of soft-deleted records.
//
// Tombstones (`deleted: true`) accumulate in iCloud's merge layer over time —
// when one device deletes a record, the deletion propagates via a `deleted: true`
// marker that other devices apply during their next merge. Without GC, those
// markers persist forever and bloat the JSON blob.
//
// 30 days is well past the realistic window for two devices to be out of sync,
// and the system is self-healing: if device B comes online >30 days after a
// delete, the tombstone is gone and the record may reappear briefly before
// B's next local mutation overrides it.
const GC_GRACE_DAYS = 30;
const GC_GRACE_MS = GC_GRACE_DAYS * 24 * 60 * 60 * 1000;

export async function gcCollection<T extends BaseEntity>(
  localKey: string,
  icloudKey: string,
  graceMs: number = GC_GRACE_MS
): Promise<{ removed: number }> {
  let removed = 0;
  const now = Date.now();
  await mutateCollection<T>(localKey, icloudKey, (items) => {
    const kept = items.filter((item) => {
      if (!item.deleted) return true;
      // Conservative fallback: an item with no timestamps gets `now`, so
      // the age comparison resolves to 0 and it's preserved. Better to
      // keep an undated tombstone than to silently lose data.
      const ts = item.updatedAt ?? item.createdAt ?? now;
      return now - ts < graceMs;
    });
    removed = items.length - kept.length;
    return kept;
  });
  return { removed };
}

/**
 * Sweep all three collections for old tombstones. Called from AuthContext
 * at startup AFTER the initial sync resolves — running it before the pull
 * could hard-delete tombstones iCloud is about to send us.
 *
 * Wrapped in a timeout so a stuck AsyncStorage call can't pin the JS thread.
 * Errors are swallowed; this is invisible background hygiene.
 */
export async function runStartupGc(): Promise<void> {
  await withTimeout(
    (async () => {
      const [habits, habitLogs, doseLogs] = [
        await gcCollection<Habit>(KEYS.HABITS, ICLOUD_KEYS.HABITS),
        await gcCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS),
        await gcCollection<DoseLog>(KEYS.DOSE_LOGS, ICLOUD_KEYS.DOSE_LOGS),
      ];
      const total = habits.removed + habitLogs.removed + doseLogs.removed;
      if (total > 0) {
        console.log(
          `GC: hard-deleted ${total} soft-deleted records older than ${GC_GRACE_DAYS} days`
        );
      }
    })(),
    5_000,
    'startup GC'
  );
}

// Export
export interface ExportPayload {
  exportedAt: number;
  exportedAtISO: string;
  userId: string | null;
  schemaVersion: 1;
  habits: Habit[];
  habitLogs: HabitLog[];
  doseLogs: DoseLog[];
  lastSync: number | null;
}

/**
 * Build a full export of all locally-stored data (AsyncStorage source of truth).
 * Includes soft-deleted rows so the export is a faithful snapshot.
 */
export async function buildExportPayload(): Promise<ExportPayload> {
  const [habitsRaw, habitLogsRaw, doseLogsRaw, lastSyncRaw] = await Promise.all([
    AsyncStorage.getItem(KEYS.HABITS),
    AsyncStorage.getItem(KEYS.HABIT_LOGS),
    AsyncStorage.getItem(KEYS.DOSE_LOGS),
    AsyncStorage.getItem(KEYS.LAST_SYNC),
  ]);

  const now = Date.now();
  return {
    exportedAt: now,
    exportedAtISO: new Date(now).toISOString(),
    userId: getCurrentUserId(),
    schemaVersion: 1,
    habits: safeParse<Habit[]>(habitsRaw, []),
    habitLogs: safeParse<HabitLog[]>(habitLogsRaw, []),
    doseLogs: safeParse<DoseLog[]>(doseLogsRaw, []),
    lastSync: lastSyncRaw ? parseInt(lastSyncRaw, 10) : null,
  };
}

// Stats helpers
export async function getDailyCountsForHabit(
  habitId: string,
  days: number = 30
): Promise<{ date: string; count: number }[]> {
  const logs = await getLogsForHabit(habitId);
  const result: { date: string; count: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const dayStart = date.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const count = logs.filter((l) => l.timestamp >= dayStart && l.timestamp < dayEnd).length;
    result.push({
      date: date.toISOString().split('T')[0],
      count,
    });
  }

  return result;
}
