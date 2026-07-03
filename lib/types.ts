/**
 * Shared shape for any record that participates in iCloud sync.
 * `id` identifies the record across devices; `createdAt`/`updatedAt`
 * drive last-write-wins merge; `deleted` is the soft-delete tombstone
 * that lets a delete on one device propagate to others before being
 * garbage-collected after a grace period.
 */
export interface BaseEntity {
  id: string;
  createdAt?: number;
  updatedAt?: number;
  deleted?: boolean;
}

export interface Habit extends BaseEntity {
  name: string;
  type: 'increase' | 'decrease';
  // Narrow `createdAt` from optional → required for Habit specifically.
  // Habits always have a known creation time; logs sometimes don't.
  createdAt: number;
}

export interface HabitLog extends BaseEntity {
  habitId: string;
  timestamp: number;
}

/**
 * Which dosing protocol a dose follows. Kept abstract (`fast`/`slow`) rather
 * than naming anything, so the on-screen labels and the timing numbers can
 * change without a data migration. Timing for each kind lives in
 * `lib/dose-protocols.ts`.
 */
export type DoseKind = 'fast' | 'slow';

export interface DoseLog extends BaseEntity {
  timestamp: number;
  // Optional for backward compatibility: doses logged before the two-protocol
  // feature have no `kind`. `protocolFor()` treats `undefined` as the legacy
  // default, and a one-time migration back-fills the field.
  kind?: DoseKind;
}
