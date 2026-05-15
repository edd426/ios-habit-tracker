/**
 * Tests for the pure-function aggregations.
 *
 * All fixture timestamps are constructed via `Date.UTC(year, monthIdx, day, hour, minute)`
 * and the device timezone is assumed to be UTC during tests (Jest default).
 */

import {
  timeOfDayBuckets,
  dayOfWeekBuckets,
  medicatedWindowBuckets,
  doseDayPermission,
  rolling14d,
  crossHabitOverlap,
  interEventInterval,
  toLocalDateKey,
} from '../aggregations';
import { HabitLog, DoseLog } from '../types';

// Helper: construct a HabitLog
function hl(habitId: string, ts: number): HabitLog {
  return { id: `${habitId}-${ts}`, habitId, timestamp: ts, createdAt: ts, updatedAt: ts };
}

function dl(ts: number): DoseLog {
  return { id: `d-${ts}`, timestamp: ts, createdAt: ts, updatedAt: ts };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('timeOfDayBuckets', () => {
  it('returns 24 zeros for empty input', () => {
    const buckets = timeOfDayBuckets([]);
    expect(buckets).toHaveLength(24);
    expect(buckets.every((n) => n === 0)).toBe(true);
  });

  it('counts events by local hour', () => {
    const day = new Date(2026, 0, 15); // Jan 15 2026 local
    day.setHours(0, 0, 0, 0);
    const base = day.getTime();
    const logs = [
      hl('a', base + 5 * HOUR + 30 * 60 * 1000),  // 5:30
      hl('a', base + 5 * HOUR + 45 * 60 * 1000),  // 5:45
      hl('a', base + 16 * HOUR + 12 * 60 * 1000), // 16:12
    ];
    const b = timeOfDayBuckets(logs);
    expect(b[5]).toBe(2);
    expect(b[16]).toBe(1);
  });

  it('counts both 16:00 and 16:12 events at hour 16 (16:00 is not a midnight-stub)', () => {
    const day = new Date(2026, 0, 15);
    day.setHours(0, 0, 0, 0);
    const base = day.getTime();
    const logs = [
      hl('a', base + 16 * HOUR),
      hl('a', base + 16 * HOUR + 12 * 60 * 1000),
    ];
    const b = timeOfDayBuckets(logs);
    expect(b[16]).toBe(2);
  });

  it('filters midnight retro-stubs (HH=MM=SS=0)', () => {
    const day = new Date(2026, 0, 15);
    day.setHours(0, 0, 0, 0);
    const base = day.getTime(); // exactly 00:00:00.000 local
    const logs = [
      hl('a', base),                               // retro-stub
      hl('a', base + 3 * HOUR + 14 * 60 * 1000),   // 3:14 AM real event
    ];
    const b = timeOfDayBuckets(logs);
    expect(b[0]).toBe(0); // midnight stub filtered
    expect(b[3]).toBe(1);
  });
});

describe('dayOfWeekBuckets', () => {
  it('returns 7 zeros for empty input', () => {
    const buckets = dayOfWeekBuckets([]);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((n) => n === 0)).toBe(true);
  });

  it('counts UNIQUE event-days per weekday', () => {
    // Mon 2026-01-12, Tue 2026-01-13, Wed 2026-01-14
    const mon = new Date(2026, 0, 12, 10, 0, 0).getTime();
    const tue = new Date(2026, 0, 13, 10, 0, 0).getTime();
    const wed = new Date(2026, 0, 14, 10, 0, 0).getTime();
    const logs = [
      hl('a', mon),
      hl('a', mon + HOUR), // second event same day, should NOT double-count
      hl('a', tue),
      hl('a', wed),
      hl('a', wed + HOUR),
    ];
    const b = dayOfWeekBuckets(logs);
    expect(b[0]).toBe(1); // Mon
    expect(b[1]).toBe(1); // Tue
    expect(b[2]).toBe(1); // Wed
    expect(b[3]).toBe(0); // Thu
    expect(b[6]).toBe(0); // Sun
  });
});

describe('medicatedWindowBuckets', () => {
  it('classifies events by gap from last dose', () => {
    // Dose at noon, events at +1h, +5h, +18h, +30h, and one BEFORE any dose
    const dose = new Date(2026, 0, 15, 12, 0, 0).getTime();
    const logs = [
      hl('a', dose - HOUR),               // before any dose -> "none"
      hl('a', dose + 1 * HOUR),           // <2h
      hl('a', dose + 5 * HOUR),           // 2-12h
      hl('a', dose + 18 * HOUR),          // 12-24h
      hl('a', dose + 30 * HOUR),          // >24h
    ];
    const doses = [dl(dose)];
    const b = medicatedWindowBuckets(logs, doses);
    expect(b.none).toBe(1);
    expect(b.lt2h).toBe(1);
    expect(b.in_2_12h).toBe(1);
    expect(b.in_12_24h).toBe(1);
    expect(b.gt24h).toBe(1);
    expect(b.total).toBe(5);
  });

  it('handles boundary at exactly 12h (inclusive in 2-12h bucket)', () => {
    const dose = new Date(2026, 0, 15, 12, 0, 0).getTime();
    const logs = [hl('a', dose + 12 * HOUR)];
    const b = medicatedWindowBuckets(logs, [dl(dose)]);
    expect(b.in_2_12h).toBe(1);
    expect(b.in_12_24h).toBe(0);
  });

  it('handles boundary at exactly 24h (inclusive in 12-24h bucket)', () => {
    const dose = new Date(2026, 0, 15, 12, 0, 0).getTime();
    const logs = [hl('a', dose + 24 * HOUR)];
    const b = medicatedWindowBuckets(logs, [dl(dose)]);
    expect(b.in_12_24h).toBe(1);
    expect(b.gt24h).toBe(0);
  });

  it('picks the MOST RECENT dose when multiple exist', () => {
    const dose1 = new Date(2026, 0, 14, 12, 0, 0).getTime();
    const dose2 = new Date(2026, 0, 15, 12, 0, 0).getTime();
    const logs = [hl('a', dose2 + 3 * HOUR)]; // 3h after dose2, ~27h after dose1
    const b = medicatedWindowBuckets(logs, [dl(dose1), dl(dose2)]);
    expect(b.in_2_12h).toBe(1);
    expect(b.gt24h).toBe(0);
  });
});

describe('doseDayPermission', () => {
  it('computes on/off-dose-day rates', () => {
    // 5 dose days, 5 non-dose days (10 total)
    // Habit appears on 4 of the 5 dose days and 1 of the 5 non-dose days
    const dates = new Set<string>();
    const doseDates = new Set<string>();
    const habitLogs: HabitLog[] = [];

    const base = new Date(2026, 0, 1);
    for (let i = 0; i < 10; i++) {
      const day = new Date(base.getTime() + i * DAY);
      const key = toLocalDateKey(day.getTime());
      dates.add(key);
      if (i < 5) doseDates.add(key);
    }
    // Habit on day 0, 1, 2, 3 (dose days) and day 5 (non-dose day)
    for (const i of [0, 1, 2, 3, 5]) {
      const day = new Date(base.getTime() + i * DAY + 10 * HOUR);
      habitLogs.push(hl('a', day.getTime()));
    }

    const p = doseDayPermission(habitLogs, doseDates, dates);
    expect(p.onDoseDays).toBe(4);
    expect(p.totalDoseDays).toBe(5);
    expect(p.offDoseDays).toBe(1);
    expect(p.totalNonDoseDays).toBe(5);
    expect(p.onDoseRate).toBe(80);
    expect(p.offDoseRate).toBe(20);
    expect(p.ratio).toBe(4);
  });

  it('returns Infinity ratio when off-dose rate is 0', () => {
    const doseDates = new Set(['2026-01-01', '2026-01-02']);
    const allDates = new Set(['2026-01-01', '2026-01-02', '2026-01-03']);
    const logs = [hl('a', new Date(2026, 0, 1, 10, 0).getTime())];
    const p = doseDayPermission(logs, doseDates, allDates);
    expect(p.ratio).toBe(Infinity);
  });
});

describe('rolling14d', () => {
  it('returns empty when range < 14 days', () => {
    const start = new Date(2026, 0, 1).getTime();
    const end = start + 10 * DAY;
    expect(rolling14d([], start, end)).toEqual([]);
  });

  it('produces one window per stride day after warmup', () => {
    const start = new Date(2026, 0, 1).getTime();
    const end = start + 27 * DAY;
    const logs: HabitLog[] = [];
    // 5 events on day 0, 5 events on day 5
    for (let i = 0; i < 5; i++) {
      logs.push(hl('a', start + i * 60_000));
      logs.push(hl('a', start + 5 * DAY + i * 60_000));
    }
    const windows = rolling14d(logs, start, end, 7);
    // First window: days 0-13 (end on day 13). Stride 7 -> next on day 20, day 27
    expect(windows.length).toBeGreaterThanOrEqual(2);
    const first = windows[0];
    expect(first.activeDays).toBe(2); // day 0 and day 5
    expect(first.totalEvents).toBe(10);
    expect(first.highVolumeDays).toBe(2); // both days >= 5 events
    expect(first.eventsPerDay).toBe(5);
  });
});

describe('crossHabitOverlap', () => {
  it('classifies each date into a_only / b_only / both / neither', () => {
    const dA = new Date(2026, 0, 1, 10).getTime();
    const dB = new Date(2026, 0, 2, 10).getTime();
    const dBoth = new Date(2026, 0, 3, 10).getTime();
    const logsA = [hl('a', dA), hl('a', dBoth)];
    const logsB = [hl('b', dB), hl('b', dBoth)];
    const dates = new Set([
      toLocalDateKey(dA),
      toLocalDateKey(dB),
      toLocalDateKey(dBoth),
      toLocalDateKey(new Date(2026, 0, 4).getTime()), // neither
    ]);
    const o = crossHabitOverlap(logsA, logsB, dates);
    expect(o.a_only).toBe(1);
    expect(o.b_only).toBe(1);
    expect(o.both).toBe(1);
    expect(o.neither).toBe(1);
    expect(o.total).toBe(4);
  });
});

describe('interEventInterval', () => {
  it('returns empty for < 2 unique event-days', () => {
    expect(interEventInterval([])).toEqual([]);
    const single = [hl('a', new Date(2026, 0, 1, 10).getTime())];
    expect(interEventInterval(single)).toEqual([]);
  });

  it('computes median day-gaps over rolling windows', () => {
    // Events on days 1, 3, 5, 10, 12 — median gap is somewhere around 2-3
    const base = new Date(2026, 0, 1).getTime();
    const logs = [1, 3, 5, 10, 12].map((d) =>
      hl('a', base + d * DAY + 10 * HOUR)
    );
    const points = interEventInterval(logs, 30, 30);
    expect(points.length).toBeGreaterThan(0);
    expect(points[0].medianGapDays).toBeGreaterThan(0);
  });
});

describe('toLocalDateKey', () => {
  it('zero-pads month and day', () => {
    const ts = new Date(2026, 0, 5, 10, 0).getTime();
    expect(toLocalDateKey(ts)).toBe('2026-01-05');
  });

  it('two-digit months are not double-padded', () => {
    const ts = new Date(2026, 10, 15, 10, 0).getTime();
    expect(toLocalDateKey(ts)).toBe('2026-11-15');
  });
});
