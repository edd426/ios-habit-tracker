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

export interface DoseLog extends BaseEntity {
  timestamp: number;
}
