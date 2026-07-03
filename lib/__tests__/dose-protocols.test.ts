import {
  DOSE_PROTOCOLS,
  DEFAULT_DOSE_KIND,
  LEGACY_DOSE_KIND,
  protocolFor,
  doseWindow,
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
