/**
 * Stats aggregations — pure functions over pre-loaded data.
 *
 * Replaces the old O(days × logs) per-chart storage scans by:
 *   1. Reading all three storage blobs ONCE per stats screen load (`loadAllForStats`)
 *   2. Building per-habit and per-date indexes
 *   3. All chart-specific bucketers operate on the indexes (no further storage reads)
 *
 * Time bucketing uses the DEVICE's local timezone, so day boundaries follow
 * the user across timezones (which matches journal-style entry semantics).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, HabitLog, DoseLog } from './types';
import { safeParse } from './safe-json';
import { KEYS } from './keys';
import { protocolFor } from './dose-protocols';

// ============================================================================
// Types
// ============================================================================

export interface StatsLoad {
  habits: Habit[];
  habitLogs: HabitLog[];        // non-deleted, sorted by timestamp asc
  doseLogs: DoseLog[];          // non-deleted, sorted by timestamp asc
  logsByHabit: Map<string, HabitLog[]>;   // habitId -> logs
  logsByDate: Map<string, HabitLog[]>;    // 'YYYY-MM-DD' -> logs
  dosesByDate: Map<string, DoseLog[]>;    // 'YYYY-MM-DD' -> doses
  dateSet: Set<string>;                    // every date with any activity
}

export interface MedicatedBuckets {
  none: number;       // no dose before the event
  beforeLead: number; // dosed, but protection not yet active (gap < leadHours)
  inWindow: number;   // protected: leadHours <= gap <= windowHours
  lapsed: number;     // protection worn off (gap > windowHours)
  total: number;
}

export interface DosePermission {
  habitId: string;
  onDoseDays: number;        // dose-days with this habit
  totalDoseDays: number;
  offDoseDays: number;       // non-dose-days with this habit
  totalNonDoseDays: number;
  onDoseRate: number;        // 0-100 percentage
  offDoseRate: number;
  ratio: number;             // onDoseRate / offDoseRate (Infinity if off=0)
}

/** Anything carrying a timestamp: HabitLog, DoseLog, or a synthetic event. */
export interface TimestampedEvent {
  timestamp: number;
}

export interface RollingWindow {
  endDate: string;              // 'YYYY-MM-DD'
  windowDays: number;           // width of this window, so labels can state it
  activeDays: number;           // unique event-days in window
  totalEvents: number;          // raw count
  /**
   * INTENSITY: totalEvents / activeDays (0 if no active days). Conditioned on
   * the habit having happened at all, so it deliberately says nothing about
   * how often that was.
   */
  eventsPerDay: number;
  /**
   * FREQUENCY: totalEvents / windowDays. Zero-days count against the average,
   * which is what makes a drop in how *often* something happens visible.
   */
  eventsPerCalendarDay: number;
  activeDayRate: number;        // activeDays / windowDays, as 0-100 percent
  highVolumeDays: number;       // days with >= HIGH_VOLUME_THRESHOLD events
}

export interface OverlapSegments {
  a_only: number;
  b_only: number;
  both: number;
  neither: number;
  total: number;
}

export interface IntervalPoint {
  endDate: string;
  medianGapDays: number | null;  // null if < 2 events in window
}

// ============================================================================
// Loader
// ============================================================================

export async function loadAllForStats(): Promise<StatsLoad> {
  const [habitsRaw, habitLogsRaw, doseLogsRaw] = await Promise.all([
    AsyncStorage.getItem(KEYS.HABITS),
    AsyncStorage.getItem(KEYS.HABIT_LOGS),
    AsyncStorage.getItem(KEYS.DOSE_LOGS),
  ]);

  const allHabits = safeParse<Habit[]>(habitsRaw, []);
  const allHabitLogs = safeParse<HabitLog[]>(habitLogsRaw, []);
  const allDoseLogs = safeParse<DoseLog[]>(doseLogsRaw, []);

  const habits = allHabits.filter((h) => !h.deleted);
  const habitLogs = allHabitLogs
    .filter((l) => !l.deleted)
    .sort((a, b) => a.timestamp - b.timestamp);
  const doseLogs = allDoseLogs
    .filter((l) => !l.deleted)
    .sort((a, b) => a.timestamp - b.timestamp);

  const logsByHabit = new Map<string, HabitLog[]>();
  const logsByDate = new Map<string, HabitLog[]>();
  const dosesByDate = new Map<string, DoseLog[]>();
  const dateSet = new Set<string>();

  for (const log of habitLogs) {
    const arr = logsByHabit.get(log.habitId) ?? [];
    arr.push(log);
    logsByHabit.set(log.habitId, arr);

    const key = toLocalDateKey(log.timestamp);
    const dateArr = logsByDate.get(key) ?? [];
    dateArr.push(log);
    logsByDate.set(key, dateArr);
    dateSet.add(key);
  }

  for (const dose of doseLogs) {
    const key = toLocalDateKey(dose.timestamp);
    const arr = dosesByDate.get(key) ?? [];
    arr.push(dose);
    dosesByDate.set(key, arr);
    dateSet.add(key);
  }

  return {
    habits,
    habitLogs,
    doseLogs,
    logsByHabit,
    logsByDate,
    dosesByDate,
    dateSet,
  };
}

// ============================================================================
// Date helpers
// ============================================================================

/** Local-time YYYY-MM-DD string (device timezone). */
export function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local-time midnight timestamp (ms) for the day containing ts. */
export function toLocalDayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** All YYYY-MM-DD keys from start (inclusive) to end (inclusive). */
export function enumerateDates(startMs: number, endMs: number): string[] {
  const out: string[] = [];
  // Step by calendar date rather than by +24h: on a DST fall-back the day is
  // 25 hours long, so a fixed 24h step emits the same date twice and shifts
  // every subsequent window off by a day.
  const cur = new Date(toLocalDayStart(startMs));
  const last = toLocalDayStart(endMs);
  while (cur.getTime() <= last) {
    out.push(toLocalDateKey(cur.getTime()));
    cur.setDate(cur.getDate() + 1);
    cur.setHours(0, 0, 0, 0);
  }
  return out;
}

// ============================================================================
// Daily counts (indexed)
// ============================================================================

export function dailyCountsForHabit(
  load: StatsLoad,
  habitId: string,
  days: number,
  endDateMs: number = Date.now()
): { date: string; count: number }[] {
  const logs = load.logsByHabit.get(habitId) ?? [];
  const result: { date: string; count: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = toLocalDayStart(endDateMs - i * 24 * 60 * 60 * 1000);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const count = logs.filter((l) => l.timestamp >= dayStart && l.timestamp < dayEnd).length;
    result.push({
      date: toLocalDateKey(dayStart),
      count,
    });
  }
  return result;
}

// ============================================================================
// Time-of-day buckets
// ============================================================================

/** Returns a 24-element array. Filters midnight retro-stubs (HH=MM=SS=0 ms=0). */
export function timeOfDayBuckets(logs: HabitLog[]): number[] {
  const buckets = new Array(24).fill(0);
  for (const log of logs) {
    const d = new Date(log.timestamp);
    if (
      d.getHours() === 0 &&
      d.getMinutes() === 0 &&
      d.getSeconds() === 0 &&
      d.getMilliseconds() === 0
    ) {
      // Retro-entered "this happened on day X" stub with no real time
      continue;
    }
    buckets[d.getHours()]++;
  }
  return buckets;
}

// ============================================================================
// Day-of-week buckets
// ============================================================================

/** Returns a 7-element array. Index 0 = Monday, 6 = Sunday (ISO weekday order). */
export function dayOfWeekBuckets(logs: HabitLog[]): number[] {
  const buckets = new Array(7).fill(0);
  // Count UNIQUE event-days (not raw events) to dedupe multi-tap retro-entries
  const seen = new Set<string>();
  for (const log of logs) {
    const key = toLocalDateKey(log.timestamp);
    if (seen.has(key)) continue;
    seen.add(key);
    const d = new Date(log.timestamp);
    const jsDay = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const isoIdx = (jsDay + 6) % 7; // 0=Mon, ..., 6=Sun
    buckets[isoIdx]++;
  }
  return buckets;
}

// ============================================================================
// Medicated-window buckets
// ============================================================================

const HOUR_MS = 60 * 60 * 1000;

/** Binary search: index of the latest dose with timestamp <= eventTs, or -1. */
function lastDoseIndexAtOrBefore(eventTs: number, sortedDoses: DoseLog[]): number {
  let lo = 0;
  let hi = sortedDoses.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedDoses[mid].timestamp <= eventTs) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Classify each event against the protective window of its MOST RECENT prior
 * dose. The window is per-protocol (each dose's own lead/stop hours), so mixed
 * 1-hour/2-hour doses are judged correctly. Un-kinded legacy doses fall back to
 * the legacy protocol via `protocolFor`.
 */
export function medicatedWindowBuckets(
  logs: HabitLog[],
  doses: DoseLog[]
): MedicatedBuckets {
  const sortedDoses = [...doses].sort((a, b) => a.timestamp - b.timestamp);
  const out: MedicatedBuckets = {
    none: 0,
    beforeLead: 0,
    inWindow: 0,
    lapsed: 0,
    total: logs.length,
  };
  for (const log of logs) {
    const idx = lastDoseIndexAtOrBefore(log.timestamp, sortedDoses);
    if (idx < 0) {
      out.none++;
      continue;
    }
    const dose = sortedDoses[idx];
    const p = protocolFor(dose);
    const gapHr = (log.timestamp - dose.timestamp) / HOUR_MS;
    if (gapHr < p.leadHours) out.beforeLead++;
    else if (gapHr <= p.windowHours) out.inWindow++;
    else out.lapsed++;
  }
  return out;
}

// ============================================================================
// Dose-day permission rates
// ============================================================================

export function doseDayPermission(
  habitLogs: HabitLog[],
  doseDates: Set<string>,
  allDates: Set<string>
): DosePermission {
  const habitDates = new Set<string>();
  for (const log of habitLogs) {
    habitDates.add(toLocalDateKey(log.timestamp));
  }

  let onDoseDays = 0;
  let offDoseDays = 0;
  for (const d of habitDates) {
    if (doseDates.has(d)) onDoseDays++;
    else offDoseDays++;
  }

  const totalDoseDays = doseDates.size;
  const totalNonDoseDays = Math.max(0, allDates.size - totalDoseDays);

  const onDoseRate = totalDoseDays > 0 ? (onDoseDays / totalDoseDays) * 100 : 0;
  const offDoseRate = totalNonDoseDays > 0 ? (offDoseDays / totalNonDoseDays) * 100 : 0;
  const ratio = offDoseRate === 0 ? Infinity : onDoseRate / offDoseRate;

  return {
    habitId: '',
    onDoseDays,
    totalDoseDays,
    offDoseDays,
    totalNonDoseDays,
    onDoseRate,
    offDoseRate,
    ratio,
  };
}

// ============================================================================
// Rolling window
// ============================================================================

const HIGH_VOLUME_THRESHOLD = 5;

/**
 * Trailing-window aggregation over any timestamped events.
 *
 * Emits one window every `stride` days, each covering the preceding
 * `windowDays` calendar days. Both an intensity reading (`eventsPerDay`,
 * denominated in ACTIVE days) and a frequency reading (`eventsPerCalendarDay`,
 * `activeDayRate`, denominated in ELAPSED days) come back on every window —
 * they answer different questions and diverge exactly when engagement gets
 * rarer without getting smaller.
 *
 * `stride` is held at 7 by callers regardless of window size, so switching
 * window width keeps the x-axis geometry identical and the series stay
 * visually comparable. A 7-day window at stride 7 is therefore
 * non-overlapping — i.e. plain weekly totals, which is a legible read rather
 * than a degenerate one.
 */
export function rollingWindow(
  events: TimestampedEvent[],
  startMs: number,
  endMs: number,
  windowDays: number = 14,
  stride: number = 7
): RollingWindow[] {
  if (!Number.isFinite(windowDays) || windowDays < 1) return [];
  const width = Math.floor(windowDays);
  const step = Math.max(1, Math.floor(stride));

  const eventsByDate = new Map<string, number>();
  for (const e of events) {
    const key = toLocalDateKey(e.timestamp);
    eventsByDate.set(key, (eventsByDate.get(key) ?? 0) + 1);
  }

  const allDates = enumerateDates(startMs, endMs);
  if (allDates.length < width) return [];

  const windowEndingAt = (i: number): RollingWindow => {
    let activeDays = 0;
    let totalEvents = 0;
    let highVolumeDays = 0;
    for (let j = i - width + 1; j <= i; j++) {
      const c = eventsByDate.get(allDates[j]) ?? 0;
      if (c > 0) {
        activeDays++;
        totalEvents += c;
        if (c >= HIGH_VOLUME_THRESHOLD) highVolumeDays++;
      }
    }
    return {
      endDate: allDates[i],
      windowDays: width,
      activeDays,
      totalEvents,
      eventsPerDay: activeDays > 0 ? totalEvents / activeDays : 0,
      eventsPerCalendarDay: totalEvents / width,
      activeDayRate: (activeDays / width) * 100,
      highVolumeDays,
    };
  };

  const lastIdx = allDates.length - 1;
  const out: RollingWindow[] = [];
  for (let i = width - 1; i <= lastIdx; i += step) out.push(windowEndingAt(i));

  // Strided ends rarely land on the final day. Without this the most recent
  // (stride - 1) days never reach the chart's right edge — i.e. the part of
  // the series you actually look at to judge "am I improving lately".
  if (out[out.length - 1].endDate !== allDates[lastIdx]) out.push(windowEndingAt(lastIdx));

  return out;
}

/** 14-day call site, kept so pre-existing charts and tests do not regress. */
export function rolling14d(
  logs: TimestampedEvent[],
  startMs: number,
  endMs: number,
  stride: number = 7
): RollingWindow[] {
  return rollingWindow(logs, startMs, endMs, 14, stride);
}

// ============================================================================
// Cross-habit overlap
// ============================================================================

export function crossHabitOverlap(
  logsA: HabitLog[],
  logsB: HabitLog[],
  allDates: Set<string>
): OverlapSegments {
  const aDates = new Set<string>();
  const bDates = new Set<string>();
  for (const log of logsA) aDates.add(toLocalDateKey(log.timestamp));
  for (const log of logsB) bDates.add(toLocalDateKey(log.timestamp));

  let a_only = 0;
  let b_only = 0;
  let both = 0;
  let neither = 0;

  for (const d of allDates) {
    const inA = aDates.has(d);
    const inB = bDates.has(d);
    if (inA && inB) both++;
    else if (inA) a_only++;
    else if (inB) b_only++;
    else neither++;
  }

  return {
    a_only,
    b_only,
    both,
    neither,
    total: allDates.size,
  };
}

// ============================================================================
// Inter-event interval
// ============================================================================

/**
 * Rolling median days-between-events over the trailing windowDays. Useful as
 * a trend signal: if the median rises over time, events are spreading out.
 */
export function interEventInterval(
  logs: HabitLog[],
  windowDays: number = 30,
  stride: number = 7
): IntervalPoint[] {
  if (logs.length < 2) return [];

  // Use unique event-days to dedupe multi-tap retro entries
  const uniqueDays = Array.from(new Set(logs.map((l) => toLocalDateKey(l.timestamp)))).sort();
  if (uniqueDays.length < 2) return [];

  const firstMs = new Date(uniqueDays[0]).getTime();
  const lastMs = new Date(uniqueDays[uniqueDays.length - 1]).getTime();

  const out: IntervalPoint[] = [];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const strideMs = stride * 24 * 60 * 60 * 1000;

  for (let endMs = firstMs + windowMs; endMs <= lastMs + strideMs; endMs += strideMs) {
    const startMs = endMs - windowMs;
    const windowDayKeys = uniqueDays.filter((d) => {
      const t = new Date(d).getTime();
      return t >= startMs && t <= endMs;
    });
    if (windowDayKeys.length < 2) {
      out.push({ endDate: toLocalDateKey(endMs), medianGapDays: null });
      continue;
    }
    const gaps: number[] = [];
    for (let i = 1; i < windowDayKeys.length; i++) {
      const prev = new Date(windowDayKeys[i - 1]).getTime();
      const cur = new Date(windowDayKeys[i]).getTime();
      gaps.push((cur - prev) / (24 * 60 * 60 * 1000));
    }
    gaps.sort((a, b) => a - b);
    const median =
      gaps.length % 2 === 0
        ? (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2
        : gaps[(gaps.length - 1) / 2];
    out.push({ endDate: toLocalDateKey(endMs), medianGapDays: median });
  }
  return out;
}
