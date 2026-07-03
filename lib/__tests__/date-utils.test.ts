import { DAY_MS, getDayStart, getDayEnd, sameLocalDay } from '../date-utils';

describe('date-utils', () => {
  it('getDayStart returns local midnight and accepts Date or number', () => {
    const ts = new Date(2026, 4, 28, 16, 45, 12, 500).getTime();
    const start = getDayStart(ts);
    const d = new Date(start);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(getDayStart(new Date(ts))).toBe(start);
  });

  it('getDayEnd is exactly one day after getDayStart', () => {
    const ts = new Date(2026, 4, 28, 9, 0).getTime();
    expect(getDayEnd(ts) - getDayStart(ts)).toBe(DAY_MS);
  });

  it('sameLocalDay groups times on the same calendar day', () => {
    const morning = new Date(2026, 4, 28, 6, 0).getTime();
    const night = new Date(2026, 4, 28, 23, 30).getTime();
    const nextDay = new Date(2026, 4, 29, 0, 30).getTime();
    expect(sameLocalDay(morning, night)).toBe(true);
    expect(sameLocalDay(night, nextDay)).toBe(false);
  });
});
