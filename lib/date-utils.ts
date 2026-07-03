/**
 * Local-time day-boundary helpers.
 *
 * Day boundaries follow the DEVICE's local timezone (matching the journal-style
 * semantics used across the app). Centralizing the `setHours(0,0,0,0)` + 24h
 * arithmetic that was previously copy-pasted across storage/screens keeps the
 * math consistent and testable in one place.
 *
 * Note: `aggregations.ts` keeps its own `toLocalDateKey`/`toLocalDayStart`
 * (string-keyed indexing for the stats screen); these helpers cover the
 * timestamp-range queries in storage and the migration.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms for local midnight of the day containing `d`. */
export function getDayStart(d: Date | number): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Epoch ms for local midnight of the FOLLOWING day (exclusive day end). */
export function getDayEnd(d: Date | number): number {
  return getDayStart(d) + DAY_MS;
}

/** True if two timestamps fall on the same local calendar day. */
export function sameLocalDay(a: number, b: number): boolean {
  return getDayStart(a) === getDayStart(b);
}
