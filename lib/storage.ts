import AsyncStorage from '@react-native-async-storage/async-storage';
import { BaseEntity, Habit, HabitLog, DoseLog } from './types';
import { pushCollectionToICloud } from './sync';
import { getCurrentUserId } from './auth';
import { safeParse } from './safe-json';
import { withTimeout } from './with-timeout';
import { serializeWrite } from './write-queue';
import { KEYS, ICLOUD_KEYS } from './keys';
import { getDayStart, getDayEnd } from './date-utils';
import { DoseKind, DEFAULT_DOSE_KIND } from './dose-protocols';

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
 * Mutations to the same key are serialized via `serializeWrite`; concurrent
 * callers (including sync's merge-write in sync.ts) run one after another
 * instead of clobbering each other's writes.
 *
 * Returns the post-mutation items so callers that need to know "what's in
 * there now" don't need a second read.
 */
function mutateCollection<T extends BaseEntity>(
  localKey: string,
  icloudKey: string,
  mutate: (items: T[]) => T[]
): Promise<T[]> {
  return serializeWrite(localKey, async () => {
    const raw = await AsyncStorage.getItem(localKey);
    const items = safeParse<T[]>(raw, []);
    const next = mutate(items);
    await AsyncStorage.setItem(localKey, JSON.stringify(next));
    backgroundSync(() => pushCollectionToICloud(localKey, icloudKey));
    return next;
  });
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
  // Cascade: tombstone the habit and all its logs. Two collections → two
  // mutateCollection calls, each handles its own iCloud push. Soft deletes
  // (see deleteDoseLog) so the deletion propagates through the iCloud merge
  // instead of being resurrected by another device's copy or a stale remote
  // blob; the GC sweep hard-deletes tombstones after the grace period.
  const now = Date.now();
  await mutateCollection<Habit>(KEYS.HABITS, ICLOUD_KEYS.HABITS, (items) =>
    items.map((h) => (h.id === id ? { ...h, deleted: true, updatedAt: now } : h))
  );
  await mutateCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, (items) =>
    items.map((l) => (l.habitId === id ? { ...l, deleted: true, updatedAt: now } : l))
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
  const logs = await logHabitBatch(habitId, timestamp ?? Date.now(), 1);
  return logs[0];
}

/**
 * Append `count` logs for a habit at the same timestamp in ONE collection
 * write (and one iCloud push). This is how the quantity modal ("+3 at 9pm")
 * persists multiple entries — N separate logHabit calls would be N writes.
 */
export async function logHabitBatch(
  habitId: string,
  timestamp: number,
  count: number
): Promise<HabitLog[]> {
  const now = Date.now();
  const newLogs: HabitLog[] = Array.from({ length: count }, () => ({
    id: generateId(),
    habitId,
    timestamp,
    createdAt: now,
    updatedAt: now,
  }));
  await mutateCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, (items) => [
    ...items,
    ...newLogs,
  ]);
  return newLogs;
}

export async function getLogsForHabit(habitId: string): Promise<HabitLog[]> {
  const logs = await getHabitLogs();
  return logs.filter((l) => l.habitId === habitId);
}

export async function removeLastTodayLog(habitId: string): Promise<boolean> {
  const todayStart = getDayStart(Date.now());

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
    // Tombstone rather than remove — see deleteDoseLog.
    return items.map((l) =>
      l.id === toRemove.id ? { ...l, deleted: true, updatedAt: Date.now() } : l
    );
  });

  return removed;
}

export async function getTodayCountForHabit(habitId: string): Promise<number> {
  const logs = await getLogsForHabit(habitId);
  const todayStart = getDayStart(Date.now());
  return logs.filter((l) => l.timestamp >= todayStart).length;
}

export async function getAllTodayCounts(): Promise<Record<string, number>> {
  const logs = await getHabitLogs();
  const todayStart = getDayStart(Date.now());

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

export async function logDose(
  timestamp?: number,
  kind: DoseKind = DEFAULT_DOSE_KIND
): Promise<DoseLog> {
  const now = Date.now();
  const newLog: DoseLog = {
    id: generateId(),
    timestamp: timestamp ?? now,
    kind,
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

/** Items whose timestamp falls on `date`'s local day, sorted ascending. */
async function logsForLocalDay<T extends BaseEntity & { timestamp: number }>(
  getter: () => Promise<T[]>,
  date: Date
): Promise<T[]> {
  const logs = await getter();
  const dayStart = getDayStart(date);
  const dayEnd = getDayEnd(date);
  return logs
    .filter((l) => l.timestamp >= dayStart && l.timestamp < dayEnd)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function getLogsForDate(date: Date): Promise<HabitLog[]> {
  return logsForLocalDay(getHabitLogs, date);
}

export async function updateLog(logId: string, updates: { timestamp?: number }): Promise<void> {
  await mutateCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, (items) =>
    items.map((l) => (l.id === logId ? { ...l, ...updates, updatedAt: Date.now() } : l))
  );
}

export async function deleteLog(logId: string): Promise<void> {
  // Tombstone rather than remove — see deleteDoseLog.
  await mutateCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, (items) =>
    items.map((l) => (l.id === logId ? { ...l, deleted: true, updatedAt: Date.now() } : l))
  );
}

export function getDoseLogsForDate(date: Date): Promise<DoseLog[]> {
  return logsForLocalDay(getDoseLogs, date);
}

export async function updateDoseLog(
  logId: string,
  updates: { timestamp?: number; kind?: DoseKind }
): Promise<void> {
  await mutateCollection<DoseLog>(KEYS.DOSE_LOGS, ICLOUD_KEYS.DOSE_LOGS, (items) =>
    items.map((l) => (l.id === logId ? { ...l, ...updates, updatedAt: Date.now() } : l))
  );
}

export async function deleteDoseLog(logId: string): Promise<void> {
  // Soft delete (tombstone) — matches habits/logs and keeps iCloud merge safe.
  // A hard delete would let another device's copy resurrect the dose on the
  // next sync; the tombstone propagates the deletion until GC sweeps it.
  await mutateCollection<DoseLog>(KEYS.DOSE_LOGS, ICLOUD_KEYS.DOSE_LOGS, (items) =>
    items.map((l) => (l.id === logId ? { ...l, deleted: true, updatedAt: Date.now() } : l))
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

// Sync payload size monitoring.
//
// iCloud KV storage (NSUbiquitousKeyValueStore) caps ALL keys at 1 MB total.
// Past the cap, set() fails SILENTLY — sync just stops propagating while the
// UI still reports success. Settings surfaces this gauge so the ceiling is
// visible long before that happens.
export const ICLOUD_KV_LIMIT_BYTES = 1024 * 1024;

export async function getSyncDataSize(): Promise<{
  perKey: Record<string, number>;
  totalBytes: number;
}> {
  const keys = [KEYS.HABITS, KEYS.HABIT_LOGS, KEYS.DOSE_LOGS];
  const perKey: Record<string, number> = {};
  let totalBytes = 0;
  for (const key of keys) {
    const raw = await AsyncStorage.getItem(key);
    // String length ≈ bytes for this ASCII-dominated JSON; fine for a gauge.
    const bytes = raw?.length ?? 0;
    perKey[key] = bytes;
    totalBytes += bytes;
  }
  return { perKey, totalBytes };
}

// Export
export interface ExportPayload {
  exportedAt: number;
  exportedAtISO: string;
  userId: string | null;
  schemaVersion: 2;
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
    schemaVersion: 2,
    habits: safeParse<Habit[]>(habitsRaw, []),
    habitLogs: safeParse<HabitLog[]>(habitLogsRaw, []),
    doseLogs: safeParse<DoseLog[]>(doseLogsRaw, []),
    lastSync: lastSyncRaw ? parseInt(lastSyncRaw, 10) : null,
  };
}
