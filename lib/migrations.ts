/**
 * One-time, idempotent data migrations.
 *
 * Guarded by a stored schema-version flag (KEYS.SCHEMA_VERSION) so the real
 * work runs once per device. Called from AuthContext startup, off the
 * UI-loading critical path and wrapped in a timeout.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DoseLog, DoseKind } from './types';
import { KEYS, ICLOUD_KEYS } from './keys';
import { safeParse } from './safe-json';
import { pushCollectionToICloud } from './sync';

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Doses logged on/after this instant were the 1-hour ('fast') protocol entered
 * with the old single-button UI; everything earlier was the 2-hour ('slow')
 * protocol. Local device time (month index 4 = May).
 */
export const FAST_CUTOFF_MS = new Date(2026, 4, 28, 0, 0, 0, 0).getTime();

/**
 * Pure: stamp a `kind` on every dose that lacks one, based on the cutoff.
 * Doses that already have a `kind` are left untouched.
 *
 * `updatedAt` is intentionally NOT bumped: the merge in sync.ts is strict
 * last-write-wins, so leaving timestamps alone means a back-filled local dose
 * is never overwritten by an un-kinded remote copy with the same `updatedAt`.
 */
export function backfillDoseKinds(
  doses: DoseLog[],
  cutoffMs: number = FAST_CUTOFF_MS
): { doses: DoseLog[]; changed: boolean } {
  let changed = false;
  const next = doses.map((d) => {
    if (d.kind) return d;
    changed = true;
    const kind: DoseKind = d.timestamp >= cutoffMs ? 'fast' : 'slow';
    return { ...d, kind };
  });
  return { doses: changed ? next : doses, changed };
}

async function getStoredSchemaVersion(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEYS.SCHEMA_VERSION);
  const n = raw == null ? 1 : parseInt(raw, 10);
  return Number.isFinite(n) ? n : 1;
}

/**
 * Run all pending migrations. Idempotent and safe to call on every startup —
 * returns immediately once the device is at CURRENT_SCHEMA_VERSION.
 */
export async function runMigrations(): Promise<void> {
  const version = await getStoredSchemaVersion();
  if (version >= CURRENT_SCHEMA_VERSION) return;

  // v1 -> v2: back-fill dose `kind`.
  const raw = await AsyncStorage.getItem(KEYS.DOSE_LOGS);
  const { doses, changed } = backfillDoseKinds(safeParse<DoseLog[]>(raw, []));
  if (changed) {
    await AsyncStorage.setItem(KEYS.DOSE_LOGS, JSON.stringify(doses));
    // Best-effort: propagate to iCloud. No-ops cleanly if iCloud isn't ready
    // yet (the next mutation or startup sync will push the kinds).
    await pushCollectionToICloud(KEYS.DOSE_LOGS, ICLOUD_KEYS.DOSE_LOGS).catch(() => {});
  }

  await AsyncStorage.setItem(KEYS.SCHEMA_VERSION, String(CURRENT_SCHEMA_VERSION));
}
