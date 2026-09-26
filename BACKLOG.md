# Backlog

Open scope for this app. GitHub issues on `edd426/ios-habit-tracker` are the source of
truth when an item has one; check there first:

```bash
gh issue list --repo edd426/ios-habit-tracker
```

Items below without an issue number live only in this file.

---

## Rolling-window frequency charts (calendar-day denominator) — [#1](https://github.com/edd426/ios-habit-tracker/issues/1)

**Problem.** `RollingIntensityChart` / `rolling14d()` divide by *active days*
(`eventsPerDay = totalEvents / activeDays`). That measures intensity-when-active and
structurally hides a change in **how often** a habit is engaged with at all. Engaging
less often but just as intensely per session reads as flat — or rising — on every
current series. For `decrease`-type habits this inverts the signal: real progress looks
like no progress.

**Wanted.**

1. A **window-size toggle — 7 / 14 / 30 days** — as a second chip row. It governs
   **every** series on the card, including the three that exist today (active days,
   events per active day, high-volume days), not just the new frequency metrics. The two
   chip rows compose: window size × metric.
2. Three **new** selectable metrics alongside the existing three:
   - **Events per calendar day** — `totalEvents / windowDays`. True frequency; zero-days
     count against the average. This is the series that's missing today.
   - **Events per window** — raw `totalEvents`. Simplest read; not comparable across
     window sizes, so the window size must be visible in the label whenever it's shown.
   - **Active-day rate** — `activeDays / windowDays` as a percentage. "What fraction of
     days did this happen at all."
3. Applies to **medication doses as well as habits**, not habits only. `DoseLog` and
   `HabitLog` share the `timestamp` shape, so the aggregation should take a generic
   `{ timestamp }[]` rather than `HabitLog[]`.

**Implementation notes.**

- `rolling14d()` in `lib/aggregations.ts` hardcodes the window at 14 (`i = 13`,
  `j = i - 13`) with `stride = 7`. Generalize to `rollingWindow(logs, startMs, endMs,
  windowDays, stride)` and keep a 14-day call site so nothing regresses.
- `RollingWindow` needs `windowDays` on it for the per-calendar-day and active-day-rate
  metrics to be computable downstream, and so labels can state the window.
- Guard the existing early return: `if (allDates.length < 14) return []` must become
  `< windowDays`, or a 30-day window silently returns partial garbage on short ranges.
  Conversely a 7-day window now qualifies on much shorter ranges than before — check the
  chart renders sanely at the low end.
- **Stride interacts with window size.** `stride = 7` on a 7-day window gives
  non-overlapping windows (no smoothing at all — it becomes a plain weekly bar); on 30
  days it gives heavy overlap. Either scale stride with the window (e.g.
  `max(1, round(windowDays / 4))`) or hold it fixed and accept that 7d reads as noisier.
  Decide deliberately rather than inheriting 7.
- **Point count changes with the window**, so the label-thinning math
  (`labelInterval = windows.length > 8 ? ceil(windows.length / 6) : 1`) needs a re-check
  at each size — a 7-day window over a 1-year range produces far more points than today.
- Existing series (`activeDays`, `eventsPerDay`, `highVolumeDays`) stay and gain the
  window toggle — the point is to add framings, not remove the intensity read.
- `HIGH_VOLUME_THRESHOLD` (>=5) is habit-shaped; sanity-check it before reusing the
  heavy-day series for doses.
- Chart card title is currently the literal string `"Rolling 14-day intensity"` in two
  places, including the empty state. It has to become dynamic over both window and metric.
- The stats screen already has a **time-range** selector (2W/1M/3M/1Y/All). Window size is
  a different axis and the UI must not read as a duplicate of it: range = how much history
  is plotted, window = the smoothing period. Nonsensical combinations (30-day window over a
  2W range) should degrade gracefully, not render empty.

**Acceptance probe.** A habit logged 3x/day every day for 30 days, then 3x/day every
third day for 30 days, must show a clear *drop* on the events-per-calendar-day series
and a roughly *flat* line on the existing per-active-day series. If both are flat, the
denominator change didn't land.

---

## "Attempted but unsuccessful" state for habits

Moved here from `CLAUDE.md`'s "Planned Features" section. For tracking cases where an
attempt was made but didn't succeed — relevant to understanding patterns around
medication timing and side effects. Needs a data-model decision: a third log state on
`HabitLog` versus a separate log type, with a migration either way (see
`lib/migrations.ts`).

---

## Fully cloud-based build and install (no local Mac in the loop)

**Problem.** The current pipeline is cloud-plus-local: a cloud Claude Code session does
the feature work and opens a PR, but a local Mac session still has to pull it, run the
tests, build the Release app, and install it on the phone (over Wi-Fi as of 2026-09-26,
see `CLAUDE.md`). The Mac is a build station the cloud session can't reach, so nothing
ships without a laptop session. Stated 2026-09-26: "this was a limitation because we
haven't invested enough in cloud setup yet."

**Wanted.** A cloud path that takes a merged PR to an installable build on the phone
with no laptop: the obvious shape is EAS Build producing a signed iOS build and
TestFlight (or an EAS internal-distribution link) delivering it. The paid Apple
Developer account already exists. Unknowns to settle first: EAS pricing tier vs build
frequency, whether the datetimepicker pin survives EAS's `expo install` step (it must —
see `expo.install.exclude`), and how the CI-side test run (`tsc`, `jest` under two time
zones) gates the build.

**Acceptance probe.** Merge a PR from a cloud session and, with the Mac closed, install
the resulting build on the phone and see its build date in Settings → About.
