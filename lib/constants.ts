/**
 * App-wide tunable constants. Dose *protocol* timing lives in
 * `lib/dose-protocols.ts`; this file holds the smaller magic numbers that were
 * previously inline.
 */

/**
 * A dose is only "recent enough" to schedule reminder notifications if it was
 * logged within this window of now. Back-dated doses don't schedule reminders
 * (their windows are already in the past).
 */
export const DOSE_RECENT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
