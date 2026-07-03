import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  backfillDoseKinds,
  runMigrations,
  CURRENT_SCHEMA_VERSION,
} from '../migrations';
import { KEYS } from '../keys';
import { DoseLog } from '../types';

// Avoid loading the iCloud/native chain through sync.ts.
jest.mock('../sync', () => ({
  pushCollectionToICloud: jest.fn(async () => {}),
}));

// Mirror the migration's local-time cutoff (month index 4 = May).
const CUTOFF = new Date(2026, 4, 28, 0, 0, 0, 0).getTime();

const d = (id: string, ts: number, kind?: 'fast' | 'slow'): DoseLog => ({
  id,
  timestamp: ts,
  kind,
  createdAt: ts,
  updatedAt: ts,
});

describe('backfillDoseKinds (pure)', () => {
  it('stamps fast on/after the cutoff and slow before it', () => {
    const { doses, changed } = backfillDoseKinds(
      [d('a', CUTOFF - 1), d('b', CUTOFF), d('c', CUTOFF + 1)],
      CUTOFF
    );
    expect(changed).toBe(true);
    expect(doses.find((x) => x.id === 'a')!.kind).toBe('slow');
    expect(doses.find((x) => x.id === 'b')!.kind).toBe('fast');
    expect(doses.find((x) => x.id === 'c')!.kind).toBe('fast');
  });

  it('leaves already-kinded doses untouched and reports changed=false', () => {
    const input = [d('a', CUTOFF - 1, 'fast'), d('b', CUTOFF + 1, 'slow')];
    const { doses, changed } = backfillDoseKinds(input, CUTOFF);
    expect(changed).toBe(false);
    expect(doses).toBe(input); // same reference when nothing changed
    expect(doses[0].kind).toBe('fast'); // not overwritten by cutoff
  });

  it('does not bump updatedAt (merge-safety)', () => {
    const input = [d('a', CUTOFF - 1)];
    const { doses } = backfillDoseKinds(input, CUTOFF);
    expect(doses[0].updatedAt).toBe(input[0].updatedAt);
  });
});

describe('runMigrations', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('back-fills doses and records the schema version', async () => {
    await AsyncStorage.setItem(
      KEYS.DOSE_LOGS,
      JSON.stringify([d('a', CUTOFF - 1), d('c', CUTOFF + 1)])
    );
    await runMigrations();
    const stored: DoseLog[] = JSON.parse((await AsyncStorage.getItem(KEYS.DOSE_LOGS))!);
    expect(stored.find((x) => x.id === 'a')!.kind).toBe('slow');
    expect(stored.find((x) => x.id === 'c')!.kind).toBe('fast');
    expect(await AsyncStorage.getItem(KEYS.SCHEMA_VERSION)).toBe(String(CURRENT_SCHEMA_VERSION));
  });

  it('is idempotent — a second run does not re-touch data', async () => {
    await AsyncStorage.setItem(KEYS.DOSE_LOGS, JSON.stringify([d('a', CUTOFF - 1)]));
    await runMigrations();

    // Flip the kind by hand; the version guard must prevent a second back-fill.
    const after1: DoseLog[] = JSON.parse((await AsyncStorage.getItem(KEYS.DOSE_LOGS))!);
    after1[0].kind = 'fast';
    await AsyncStorage.setItem(KEYS.DOSE_LOGS, JSON.stringify(after1));

    await runMigrations();
    const after2: DoseLog[] = JSON.parse((await AsyncStorage.getItem(KEYS.DOSE_LOGS))!);
    expect(after2[0].kind).toBe('fast');
  });
});
