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
  rollingWindow,
  crossHabitOverlap,
  interEventInterval,
  toLocalDateKey,
  gapsBetweenActiveDays,
  gapHistogram,
  gapHistogramHalves,
  longestGapSteps,
  currentGapDays,
  dailyCountSeries,
  heatmapCap,
  heatLevel,
  heatmapGrid,
} from '../aggregations';
import { HabitLog, DoseLog } from '../types';

// Helper: construct a HabitLog
function hl(habitId: string, ts: number): HabitLog {
  return { id: `${habitId}-${ts}`, habitId, timestamp: ts, createdAt: ts, updatedAt: ts };
}

function dl(ts: number, kind?: 'fast' | 'slow'): DoseLog {
  return { id: `d-${ts}`, timestamp: ts, kind, createdAt: ts, updatedAt: ts };
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
  it('classifies events against a legacy (slow: 2h lead / 12h window) dose', () => {
    const dose = new Date(2026, 0, 15, 12, 0, 0).getTime();
    const logs = [
      hl('a', dose - HOUR),       // before any dose -> none
      hl('a', dose + 1 * HOUR),   // gap 1 < lead 2 -> beforeLead
      hl('a', dose + 5 * HOUR),   // within 2..12 -> inWindow
      hl('a', dose + 18 * HOUR),  // > 12 -> lapsed
    ];
    const b = medicatedWindowBuckets(logs, [dl(dose)]); // dl() defaults to slow
    expect(b.none).toBe(1);
    expect(b.beforeLead).toBe(1);
    expect(b.inWindow).toBe(1);
    expect(b.lapsed).toBe(1);
    expect(b.total).toBe(4);
  });

  it('uses the fast protocol (1h lead / 8h window) for fast doses', () => {
    const dose = new Date(2026, 0, 15, 12, 0, 0).getTime();
    const logs = [
      hl('a', dose + 30 * 60 * 1000), // 0.5h < lead 1 -> beforeLead
      hl('a', dose + 3 * HOUR),       // within 1..8 -> inWindow
      hl('a', dose + 9 * HOUR),       // > 8 -> lapsed
    ];
    const b = medicatedWindowBuckets(logs, [dl(dose, 'fast')]);
    expect(b.beforeLead).toBe(1);
    expect(b.inWindow).toBe(1);
    expect(b.lapsed).toBe(1);
  });

  it('treats lead and window boundaries as inclusive of inWindow', () => {
    const dose = new Date(2026, 0, 15, 12, 0, 0).getTime();
    // gap == leadHours -> inWindow
    expect(medicatedWindowBuckets([hl('a', dose + 1 * HOUR)], [dl(dose, 'fast')]).inWindow).toBe(1);
    // gap == windowHours -> inWindow; just over -> lapsed
    expect(medicatedWindowBuckets([hl('a', dose + 8 * HOUR)], [dl(dose, 'fast')]).inWindow).toBe(1);
    expect(
      medicatedWindowBuckets([hl('a', dose + 8 * HOUR + 60_000)], [dl(dose, 'fast')]).lapsed
    ).toBe(1);
  });

  it('judges each event against its MOST RECENT dose\'s own protocol', () => {
    const slowDose = new Date(2026, 0, 14, 12, 0, 0).getTime();
    const fastDose = new Date(2026, 0, 15, 12, 0, 0).getTime();
    // 10h after the fast dose: lapsed (fast window is 8h) — even though that
    // gap would still be "inWindow" for a slow dose.
    const logs = [hl('a', fastDose + 10 * HOUR)];
    const b = medicatedWindowBuckets(logs, [dl(slowDose, 'slow'), dl(fastDose, 'fast')]);
    expect(b.lapsed).toBe(1);
    expect(b.inWindow).toBe(0);
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

describe('rollingWindow — calendar-day denominator (issue #1)', () => {
  const byEnd = (ws: ReturnType<typeof rollingWindow>, endDate: string) => {
    const w = ws.find((x) => x.endDate === endDate);
    if (!w) throw new Error(`no window ending ${endDate}; got ${ws.map((x) => x.endDate).join(',')}`);
    return w;
  };

  /**
   * The acceptance probe from BACKLOG.md / issue #1.
   *
   * Phase A: 3 events EVERY day for 30 days.
   * Phase B: 3 events EVERY THIRD day for 30 days.
   *
   * Intensity is identical in both phases (3 events per active day). Only
   * frequency changed. The per-active-day series MUST stay flat and the
   * per-calendar-day series MUST drop — if both are flat, the denominator
   * change did not land.
   */
  it('drops on per-calendar-day while per-active-day stays flat', () => {
    const start = Date.UTC(2026, 0, 1);
    const logs: HabitLog[] = [];
    for (let d = 0; d < 30; d++) {
      for (let k = 0; k < 3; k++) logs.push(hl('a', start + d * DAY + (10 + k) * HOUR));
    }
    for (let d = 30; d < 60; d += 3) {
      for (let k = 0; k < 3; k++) logs.push(hl('a', start + d * DAY + (10 + k) * HOUR));
    }

    const ws = rollingWindow(logs, start, start + 59 * DAY, 14, 7);

    // Window covering days 14-27: entirely inside phase A
    const phaseA = byEnd(ws, toLocalDateKey(start + 27 * DAY));
    // Window covering days 46-59: entirely inside phase B
    const phaseB = byEnd(ws, toLocalDateKey(start + 59 * DAY));

    // Intensity: unchanged
    expect(phaseA.eventsPerDay).toBeCloseTo(3, 5);
    expect(phaseB.eventsPerDay).toBeCloseTo(3, 5);

    // Frequency: halved or better
    expect(phaseA.eventsPerCalendarDay).toBeCloseTo(3, 5);
    expect(phaseB.eventsPerCalendarDay).toBeLessThan(phaseA.eventsPerCalendarDay * 0.5);

    // Active-day rate: 100% -> ~36%
    expect(phaseA.activeDayRate).toBeCloseTo(100, 5);
    expect(phaseB.activeDayRate).toBeLessThan(40);

    // Raw totals carry the window size so labels can state it
    expect(phaseA.windowDays).toBe(14);
    expect(phaseA.totalEvents).toBe(42);
  });

  it('honours windowDays for the minimum-range guard', () => {
    const start = Date.UTC(2026, 0, 1);
    // 20-day range: enough for a 7- or 14-day window, not for a 30-day one
    expect(rollingWindow([hl('a', start)], start, start + 19 * DAY, 7).length).toBeGreaterThan(0);
    expect(rollingWindow([hl('a', start)], start, start + 19 * DAY, 14).length).toBeGreaterThan(0);
    expect(rollingWindow([hl('a', start)], start, start + 19 * DAY, 30)).toEqual([]);
  });

  it('always emits a window ending on the last day of the range', () => {
    const start = Date.UTC(2026, 0, 1);
    // 30 days: strided ends land on 13, 20, 27 — day 29 would otherwise be invisible
    const ws = rollingWindow([hl('a', start + 28 * DAY)], start, start + 29 * DAY, 14, 7);
    expect(ws[ws.length - 1].endDate).toBe(toLocalDateKey(start + 29 * DAY));
    // and the tail window is not a duplicate of the previous one
    expect(ws.filter((w) => w.endDate === toLocalDateKey(start + 29 * DAY))).toHaveLength(1);
  });

  it('accepts any { timestamp } shape, not just HabitLog', () => {
    const start = Date.UTC(2026, 0, 1);
    const doses: DoseLog[] = [];
    for (let d = 0; d < 20; d++) doses.push(dl(start + d * DAY + 12 * HOUR, 'slow'));
    const ws = rollingWindow(doses, start, start + 19 * DAY, 14, 7);
    expect(ws.length).toBeGreaterThan(0);
    expect(ws[0].eventsPerCalendarDay).toBeCloseTo(1, 5);
  });

  it('rolling14d stays a 14-day alias so existing call sites do not regress', () => {
    const start = Date.UTC(2026, 0, 1);
    const logs = [hl('a', start + 3 * DAY), hl('a', start + 9 * DAY)];
    expect(rolling14d(logs, start, start + 27 * DAY, 7)).toEqual(
      rollingWindow(logs, start, start + 27 * DAY, 14, 7)
    );
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

// Local-time helpers: build fixtures from calendar days so the tests hold in
// any TZ, including across a DST change.
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h).getTime();
function eventsOnDays(dayOffsets: number[], y = 2026, m = 0, d = 1) {
  return dayOffsets.map((off) => ({ timestamp: at(y, m, d + off) }));
}
/** Active-day offsets that realise exactly the given gap sequence. */
function daysFromGaps(gaps: number[]): number[] {
  const out = [0];
  for (const g of gaps) out.push(out[out.length - 1] + g);
  return out;
}

describe('gapsBetweenActiveDays (issue #3)', () => {
  it('measures days between consecutive ACTIVE days, deduping same-day events', () => {
    const events = [
      ...eventsOnDays([0, 1, 1, 1, 4, 10]),
      { timestamp: at(2026, 0, 2, 23) }, // late on day 1 again: still one active day
    ];
    expect(gapsBetweenActiveDays(events)).toEqual([1, 3, 6]);
  });

  it('never produces zero-length gaps', () => {
    const sameDay = [at(2026, 0, 1, 8), at(2026, 0, 1, 12), at(2026, 0, 1, 20)].map((t) => ({
      timestamp: t,
    }));
    expect(gapsBetweenActiveDays(sameDay)).toEqual([]);
  });

  it('counts calendar days across a DST change (23h / 25h days)', () => {
    // Spans both EU switches in 2026 (Mar 29, Oct 25).
    const events = [at(2026, 2, 28, 12), at(2026, 2, 30, 0), at(2026, 9, 24, 23), at(2026, 9, 26, 1)].map(
      (t) => ({ timestamp: t })
    );
    expect(gapsBetweenActiveDays(events)).toEqual([2, 208, 2]);
  });
});

describe('gap histogram halves — acceptance probe (issue #3)', () => {
  const firstHalf = [1, 1, 1, 1, 2, 1, 1];
  const secondHalf = [1, 5, 1, 9, 1, 12];
  const events = eventsOnDays(daysFromGaps([...firstHalf, ...secondHalf]));

  it('round-trips the probe gaps through the shared primitive', () => {
    expect(gapsBetweenActiveDays(events)).toEqual([...firstHalf, ...secondHalf]);
  });

  it('shows a visibly heavier right tail in the newer half', () => {
    const h = gapHistogramHalves(gapsBetweenActiveDays(events));
    // buckets:            1  2  3  4-7  8-14  15+
    expect(h.first).toEqual([6, 1, 0, 0, 0, 0]);
    expect(h.second).toEqual([3, 0, 0, 1, 2, 0]);
    expect(h.firstTotal).toBe(7);
    expect(h.secondTotal).toBe(6);
  });

  it('while the rolling median alone barely separates the halves', () => {
    const median = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    expect(median(firstHalf)).toBe(1);
    expect(median(secondHalf)).toBe(3); // 1,1,1,5,9,12 — tail invisible beyond "3"
  });

  it('puts gaps into the documented buckets, with 15+ open-ended', () => {
    expect(gapHistogram([1, 2, 3, 4, 7, 8, 14, 15, 400])).toEqual([1, 1, 1, 2, 2, 2]);
    expect(gapHistogram([0, -1, NaN])).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('longestGapSteps (issue #3)', () => {
  it('is a non-decreasing record series that steps up at 5, 9, 12 in the probe tail', () => {
    const gaps = [1, 1, 1, 1, 2, 1, 1, 1, 5, 1, 9, 1, 12];
    const steps = longestGapSteps(eventsOnDays(daysFromGaps(gaps)));
    // NOTE: the issue text says "exactly three upward steps (5, 9, 12)", but its
    // own first half contains a 2, which beats the opening 1. Over the full
    // history the records are 1 -> 2 -> 5 -> 9 -> 12; the three steps it names
    // are exactly the ones in the newer half.
    expect(steps.map((s) => s.longest)).toEqual([1, 2, 5, 9, 12]);
    for (let i = 1; i < steps.length; i++) expect(steps[i].longest).toBeGreaterThan(steps[i - 1].longest);
    // Each record is dated on the active day that closed it.
    const days = daysFromGaps(gaps);
    expect(steps[steps.length - 1].date).toBe(toLocalDateKey(at(2026, 0, 1 + days[days.length - 1])));
  });

  it('returns nothing without at least two active days', () => {
    expect(longestGapSteps([])).toEqual([]);
    expect(longestGapSteps(eventsOnDays([0, 0]))).toEqual([]);
  });
});

describe('currentGapDays', () => {
  it('counts days since the last active day', () => {
    const events = eventsOnDays([0, 3]);
    expect(currentGapDays(events, at(2026, 0, 4, 22))).toBe(0);
    expect(currentGapDays(events, at(2026, 0, 10, 1))).toBe(6);
    expect(currentGapDays([], at(2026, 0, 10))).toBeNull();
  });
});

describe('dailyCountSeries (issue #2)', () => {
  it('emits every calendar day, zero-days included', () => {
    const series = dailyCountSeries(eventsOnDays([0, 0, 2]), at(2026, 0, 1), at(2026, 0, 4));
    expect(series).toEqual([
      { date: '2026-01-01', count: 2 },
      { date: '2026-01-02', count: 0 },
      { date: '2026-01-03', count: 1 },
      { date: '2026-01-04', count: 0 },
    ]);
  });

  it('has no duplicate or missing dates across a DST fall-back', () => {
    const series = dailyCountSeries([], at(2026, 9, 20), at(2026, 9, 30));
    expect(series.map((d) => d.date)).toEqual(
      Array.from({ length: 11 }, (_, i) => `2026-10-${String(20 + i).padStart(2, '0')}`)
    );
  });
});

describe('heatmap color scale (issue #2)', () => {
  it('caps at the 90th percentile of active days so one outlier cannot flatten the rest', () => {
    const counts = [0, 0, ...Array(18).fill(2), 3, 40];
    expect(heatmapCap(counts)).toBe(2);
    // typical days get the darkest shade instead of being washed out by the 40
    expect(heatLevel(2, 2)).toBe(4);
    expect(heatLevel(40, 2)).toBe(4);
  });

  it('keeps any activity visibly distinct from none', () => {
    expect(heatmapCap([0, 0, 0])).toBe(0);
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(5, 10)).toBe(2);
    expect(heatLevel(10, 10)).toBe(4);
  });
});

describe('heatmapGrid (issue #2)', () => {
  it('acceptance probe: a 21-day run next to a 21-day gap renders solid vs empty', () => {
    // Sun 2026-02-01 .. Sat 2026-03-14: 21 active days, then 21 days of nothing.
    const events = Array.from({ length: 21 }, (_, i) => [
      { timestamp: at(2026, 1, 1 + i, 9) },
      { timestamp: at(2026, 1, 1 + i, 18) },
    ]).flat();
    const grid = heatmapGrid(events, 10, at(2026, 2, 14, 12));
    const cells = grid.weeks.flat().filter((c): c is NonNullable<typeof c> => c !== null);
    const run = cells.filter((c) => c.date >= '2026-02-01' && c.date <= '2026-02-21');
    const gap = cells.filter((c) => c.date >= '2026-02-22' && c.date <= '2026-03-14');
    expect(run).toHaveLength(21);
    expect(gap).toHaveLength(21);
    expect(run.every((c) => c.level === 4)).toBe(true);
    expect(gap.every((c) => c.level === 0)).toBe(true);
    expect(grid.activeDays).toBe(21);
  });

  it('lays out Monday-first week columns ending with the current week', () => {
    // Fri 2026-09-25
    const grid = heatmapGrid([], 26, at(2026, 8, 25, 15));
    expect(grid.weeks).toHaveLength(26);
    grid.weeks.forEach((col) => expect(col).toHaveLength(7));
    expect(grid.weeks[0][0]?.date).toBe('2026-03-30'); // a Monday, 25 weeks back
    const last = grid.weeks[25];
    expect(last[0]?.date).toBe('2026-09-21'); // Monday
    expect(last[4]?.date).toBe('2026-09-25'); // today, Friday
    expect(last[5]).toBeNull(); // future days stay empty
    expect(last[6]).toBeNull();
  });

  it('labels months at the column holding their 1st, without collisions', () => {
    const grid = heatmapGrid([], 26, at(2026, 8, 25, 15));
    const labels = grid.monthLabels.map((m) => m.label);
    expect(labels).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
    for (let i = 1; i < grid.monthLabels.length; i++) {
      expect(grid.monthLabels[i].week - grid.monthLabels[i - 1].week).toBeGreaterThanOrEqual(3);
    }
    // Apr 1 2026 is a Wednesday in the first column
    expect(grid.monthLabels[0].week).toBe(0);
  });
});
