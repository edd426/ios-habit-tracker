import {
  DOSE_PROTOCOLS,
  DEFAULT_DOSE_KIND,
  LEGACY_DOSE_KIND,
  protocolFor,
  doseWindow,
  reminderDelaysSeconds,
} from '../dose-protocols';
import { DoseLog } from '../types';

const HOUR = 60 * 60 * 1000;

describe('dose protocols', () => {
  it('fast = 1-hour lead / 8-hour window; slow = 2-hour lead / 12-hour window', () => {
    expect(DOSE_PROTOCOLS.fast).toMatchObject({ label: '1-hour', leadHours: 1, windowHours: 8 });
    expect(DOSE_PROTOCOLS.slow).toMatchObject({ label: '2-hour', leadHours: 2, windowHours: 12 });
  });

  it('default kind is fast, legacy kind is slow', () => {
    expect(DEFAULT_DOSE_KIND).toBe('fast');
    expect(LEGACY_DOSE_KIND).toBe('slow');
  });

  it('protocolFor falls back to legacy (slow) for un-kinded doses', () => {
    expect(protocolFor({ kind: undefined }).kind).toBe('slow');
    expect(protocolFor({ kind: 'fast' }).kind).toBe('fast');
    expect(protocolFor({ kind: 'slow' }).kind).toBe('slow');
  });

  it('doseWindow computes clearAt/stopBy from the dose protocol', () => {
    const base = 1_700_000_000_000;
    const fast: DoseLog = { id: 'a', timestamp: base, kind: 'fast' };
    expect(doseWindow(fast)).toEqual({ clearAt: base + 1 * HOUR, stopBy: base + 8 * HOUR });
    const slow: DoseLog = { id: 'b', timestamp: base, kind: 'slow' };
    expect(doseWindow(slow)).toEqual({ clearAt: base + 2 * HOUR, stopBy: base + 12 * HOUR });
  });

  it('doseWindow treats un-kinded doses as legacy (slow)', () => {
    const base = 1_700_000_000_000;
    const legacy: DoseLog = { id: 'c', timestamp: base };
    expect(doseWindow(legacy)).toEqual({ clearAt: base + 2 * HOUR, stopBy: base + 12 * HOUR });
  });
});

describe('reminderDelaysSeconds', () => {
  const base = 1_700_000_000_000;

  it('dose taken now → both reminders at full protocol delays', () => {
    expect(reminderDelaysSeconds({ timestamp: base, kind: 'fast' }, base)).toEqual({
      toClear: 1 * 60 * 60,
      toStop: 8 * 60 * 60,
    });
  });

  it('back-dated dose → delays anchored to the dose time, not now', () => {
    // Logged 30 min after the fact: clear fires in 30 min, stop in 7.5h.
    const now = base + 30 * 60 * 1000;
    expect(reminderDelaysSeconds({ timestamp: base, kind: 'fast' }, now)).toEqual({
      toClear: 30 * 60,
      toStop: 7.5 * 60 * 60,
    });
  });

  it('clear-at already past → only the window-closing reminder remains', () => {
    const now = base + 3 * HOUR; // past fast's 1h lead, inside its 8h window
    expect(reminderDelaysSeconds({ timestamp: base, kind: 'fast' }, now)).toEqual({
      toClear: null,
      toStop: 5 * 60 * 60,
    });
  });

  it('window fully closed → no reminders at all', () => {
    const now = base + 13 * HOUR; // past even slow's 12h window
    expect(reminderDelaysSeconds({ timestamp: base, kind: 'slow' }, now)).toEqual({
      toClear: null,
      toStop: null,
    });
  });

  it('a milestone exactly at now is treated as past (no zero-second trigger)', () => {
    const now = base + 1 * HOUR;
    expect(reminderDelaysSeconds({ timestamp: base, kind: 'fast' }, now).toClear).toBeNull();
  });

  it('sub-second remainders round up to a schedulable ≥1s delay', () => {
    const now = base + 1 * HOUR - 500; // 0.5s before the clear milestone
    expect(reminderDelaysSeconds({ timestamp: base, kind: 'fast' }, now).toClear).toBe(1);
  });
});
