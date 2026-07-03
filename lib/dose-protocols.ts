/**
 * Dose protocol configuration — the single source of truth for the timing
 * behaviour of each dose kind.
 *
 * Deliberately contains NO medication names. A protocol is described purely by
 * its timing: how long to wait before the protected window opens (`leadHours`)
 * and how long after the dose that window stays open (`windowHours`). The
 * `label` is what the user sees; change it freely without touching stored data.
 */

import { DoseKind, DoseLog } from './types';

export type { DoseKind };

export interface DoseProtocol {
  kind: DoseKind;
  /** User-facing label (timing only, never a medication name). */
  label: string;
  /** Hours after the dose before the protective window opens. */
  leadHours: number;
  /** Hours after the dose when the protective window closes (stop-by). */
  windowHours: number;
}

export const DOSE_PROTOCOLS: Record<DoseKind, DoseProtocol> = {
  fast: { kind: 'fast', label: '1-hour', leadHours: 1, windowHours: 8 },
  slow: { kind: 'slow', label: '2-hour', leadHours: 2, windowHours: 12 },
};

/** New doses default to this kind (the current primary protocol). */
export const DEFAULT_DOSE_KIND: DoseKind = 'fast';

/** Un-kinded legacy doses are treated as this kind. */
export const LEGACY_DOSE_KIND: DoseKind = 'slow';

/** Every kind, in display order — handy for selectors/migrations/tests. */
export const DOSE_KINDS: DoseKind[] = ['fast', 'slow'];

/** Resolve the protocol for a dose, falling back to the legacy default. */
export function protocolFor(dose: Pick<DoseLog, 'kind'>): DoseProtocol {
  return DOSE_PROTOCOLS[dose.kind ?? LEGACY_DOSE_KIND];
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The protected window for a dose, as absolute timestamps:
 *  - `clearAt`: when protection becomes active (dose + leadHours)
 *  - `stopBy`:  when protection wears off    (dose + windowHours)
 * Pure and timezone-agnostic (operates on epoch ms) so it's trivially testable.
 */
export function doseWindow(dose: DoseLog): { clearAt: number; stopBy: number } {
  const p = protocolFor(dose);
  return {
    clearAt: dose.timestamp + p.leadHours * HOUR_MS,
    stopBy: dose.timestamp + p.windowHours * HOUR_MS,
  };
}
