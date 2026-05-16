import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, HabitLog, DoseLog } from './types';
import {
  syncHabit,
  syncHabitLog,
  syncDoseLog,
  syncDeleteHabit,
  syncDeleteHabitLog,
  syncDeleteDoseLog,
} from './sync';
import { getCurrentUserId } from './auth';
import { safeParse } from './safe-json';
import { KEYS } from './keys';

// Generate unique ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Background sync helper - doesn't block the main operation
 */
function backgroundSync<T>(syncFn: () => Promise<T>): void {
  syncFn().catch((error) => {
    console.warn('Background sync failed:', error);
  });
}

// Habits
export async function getHabits(): Promise<Habit[]> {
  const data = await AsyncStorage.getItem(KEYS.HABITS);
  const habits: Habit[] = safeParse(data, []);
  // Filter out soft-deleted items
  return habits.filter((h) => !h.deleted);
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.HABITS, JSON.stringify(habits));
}

export async function addHabit(name: string, type: 'increase' | 'decrease'): Promise<Habit> {
  const habits = await getHabits();
  const now = Date.now();
  const newHabit: Habit = {
    id: generateId(),
    name,
    type,
    createdAt: now,
    updatedAt: now,
  };
  habits.push(newHabit);
  await saveHabits(habits);

  // Sync in background
  const userId = getCurrentUserId();
  if (userId) {
    backgroundSync(() => syncHabit(userId, newHabit));
  }

  return newHabit;
}

export async function updateHabit(
  id: string,
  updates: Partial<Omit<Habit, 'id' | 'createdAt'>>
): Promise<void> {
  const data = await AsyncStorage.getItem(KEYS.HABITS);
  const habits: Habit[] = safeParse(data, []);
  const index = habits.findIndex((h) => h.id === id);
  if (index !== -1) {
    const updatedHabit = {
      ...habits[index],
      ...updates,
      updatedAt: Date.now(),
    };
    habits[index] = updatedHabit;
    await saveHabits(habits);

    // Sync in background
    const userId = getCurrentUserId();
    if (userId) {
      backgroundSync(() => syncHabit(userId, updatedHabit));
    }
  }
}

export async function deleteHabit(id: string): Promise<void> {
  const data = await AsyncStorage.getItem(KEYS.HABITS);
  const habits: Habit[] = safeParse(data, []);
  const filtered = habits.filter((h) => h.id !== id);
  await saveHabits(filtered);

  // Also delete associated logs
  const logs = await getHabitLogs();
  const filteredLogs = logs.filter((l) => l.habitId !== id);
  await AsyncStorage.setItem(KEYS.HABIT_LOGS, JSON.stringify(filteredLogs));

  // Sync deletion in background
  const userId = getCurrentUserId();
  if (userId) {
    backgroundSync(async () => {
      await syncDeleteHabit(userId, id);
      // Also sync delete all associated logs
      const logsToDelete = logs.filter((l) => l.habitId === id);
      for (const log of logsToDelete) {
        await syncDeleteHabitLog(userId, log.id);
      }
    });
  }
}

// Habit Logs
export async function getHabitLogs(): Promise<HabitLog[]> {
  const data = await AsyncStorage.getItem(KEYS.HABIT_LOGS);
  const logs: HabitLog[] = safeParse(data, []);
  // Filter out soft-deleted items
  return logs.filter((l) => !l.deleted);
}

export async function logHabit(habitId: string, timestamp?: number): Promise<HabitLog> {
  const logs = await getHabitLogs();
  const now = Date.now();
  const newLog: HabitLog = {
    id: generateId(),
    habitId,
    timestamp: timestamp ?? now,
    createdAt: now,
    updatedAt: now,
  };
  logs.push(newLog);
  await AsyncStorage.setItem(KEYS.HABIT_LOGS, JSON.stringify(logs));

  // Sync in background
  const userId = getCurrentUserId();
  if (userId) {
    backgroundSync(() => syncHabitLog(userId, newLog));
  }

  return newLog;
}

export async function getLogsForHabit(habitId: string): Promise<HabitLog[]> {
  const logs = await getHabitLogs();
  return logs.filter((l) => l.habitId === habitId);
}

export async function removeLastTodayLog(habitId: string): Promise<boolean> {
  const logs = await getHabitLogs();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  // Find today's logs for this habit, sorted by timestamp descending
  const todayLogs = logs
    .filter((l) => l.habitId === habitId && l.timestamp >= todayStart)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (todayLogs.length === 0) return false;

  // Remove the most recent one
  const toRemove = todayLogs[0];
  const filtered = logs.filter((l) => l.id !== toRemove.id);
  await AsyncStorage.setItem(KEYS.HABIT_LOGS, JSON.stringify(filtered));

  // Sync deletion in background
  const userId = getCurrentUserId();
  if (userId) {
    backgroundSync(() => syncDeleteHabitLog(userId, toRemove.id));
  }

  return true;
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
  const logs = await getDoseLogs();
  const now = Date.now();
  const newLog: DoseLog = {
    id: generateId(),
    timestamp: timestamp ?? now,
    createdAt: now,
    updatedAt: now,
  };
  logs.push(newLog);
  await AsyncStorage.setItem(KEYS.DOSE_LOGS, JSON.stringify(logs));

  // Sync in background
  const userId = getCurrentUserId();
  if (userId) {
    backgroundSync(() => syncDoseLog(userId, newLog));
  }

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
  const data = await AsyncStorage.getItem(KEYS.HABIT_LOGS);
  const logs: HabitLog[] = safeParse(data, []);
  const index = logs.findIndex((l) => l.id === logId);
  if (index !== -1) {
    const updatedLog = {
      ...logs[index],
      ...updates,
      updatedAt: Date.now(),
    };
    logs[index] = updatedLog;
    await AsyncStorage.setItem(KEYS.HABIT_LOGS, JSON.stringify(logs));

    // Sync in background
    const userId = getCurrentUserId();
    if (userId) {
      backgroundSync(() => syncHabitLog(userId, updatedLog));
    }
  }
}

export async function deleteLog(logId: string): Promise<void> {
  const logs = await getHabitLogs();
  const filtered = logs.filter((l) => l.id !== logId);
  await AsyncStorage.setItem(KEYS.HABIT_LOGS, JSON.stringify(filtered));

  // Sync deletion in background
  const userId = getCurrentUserId();
  if (userId) {
    backgroundSync(() => syncDeleteHabitLog(userId, logId));
  }
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
  const data = await AsyncStorage.getItem(KEYS.DOSE_LOGS);
  const logs: DoseLog[] = safeParse(data, []);
  const index = logs.findIndex((l) => l.id === logId);
  if (index !== -1) {
    const updatedLog = {
      ...logs[index],
      ...updates,
      updatedAt: Date.now(),
    };
    logs[index] = updatedLog;
    await AsyncStorage.setItem(KEYS.DOSE_LOGS, JSON.stringify(logs));

    // Sync in background
    const userId = getCurrentUserId();
    if (userId) {
      backgroundSync(() => syncDoseLog(userId, updatedLog));
    }
  }
}

export async function deleteDoseLog(logId: string): Promise<void> {
  const logs = await getDoseLogs();
  const filtered = logs.filter((l) => l.id !== logId);
  await AsyncStorage.setItem(KEYS.DOSE_LOGS, JSON.stringify(filtered));

  // Sync deletion in background
  const userId = getCurrentUserId();
  if (userId) {
    backgroundSync(() => syncDeleteDoseLog(userId, logId));
  }
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
    AsyncStorage.getItem('last_sync_timestamp'),
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
