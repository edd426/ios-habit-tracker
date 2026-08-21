import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import ChartCard from './ChartCard';
import { RollingWindow } from '@/lib/aggregations';

export type RollingWindowDays = 7 | 14 | 30;

interface Props {
  habitWindows: RollingWindow[];
  doseWindows: RollingWindow[];
  habitColor: string;
  windowDays: RollingWindowDays;
  onWindowDaysChange: (days: RollingWindowDays) => void;
  /** True when the habit's history is shorter than the window and the span was padded. */
  spanPadded?: boolean;
}

type Source = 'habit' | 'doses';

/**
 * Metrics split into two families that answer different questions:
 *   FREQUENCY (per-calendar-day, active-%, total) — denominated in ELAPSED days,
 *   so zero-days count and a drop in how OFTEN something happens is visible.
 *   INTENSITY (active-days, per-active-day, heavy) — denominated in ACTIVE days,
 *   so they describe a session once it happens and say nothing about frequency.
 */
type Series = 'frequency' | 'rate' | 'total' | 'days' | 'intensity' | 'heavy';

const DOSE_COLOR = '74, 105, 189'; // #4a69bd

const WINDOW_OPTIONS: RollingWindowDays[] = [7, 14, 30];

const screenWidth = Dimensions.get('window').width;

export default React.memo(function RollingWindowChart({
  habitWindows,
  doseWindows,
  habitColor,
  windowDays,
  onWindowDaysChange,
  spanPadded,
}: Props) {
  const [source, setSource] = useState<Source>('habit');
  const [series, setSeries] = useState<Series>('frequency');

  const hasDoses = doseWindows.length > 0;
  const activeSource: Source = source === 'doses' && !hasDoses ? 'habit' : source;
  const windows = activeSource === 'doses' ? doseWindows : habitWindows;

  // A dose day is one dose; >=5 never fires, so the heavy series is meaningless here.
  const metrics: Series[] =
    activeSource === 'doses'
      ? ['frequency', 'rate', 'total', 'days', 'intensity']
      : ['frequency', 'rate', 'total', 'days', 'intensity', 'heavy'];
  const activeSeries: Series = metrics.includes(series) ? series : 'frequency';

  const noun =
    activeSeries === 'frequency' || activeSeries === 'rate'
      ? 'frequency'
      : activeSeries === 'total'
        ? 'volume'
        : activeSeries === 'days'
          ? 'activity'
          : 'intensity';
  const title = `Rolling ${windowDays}-day ${noun}`;

  const { data, subtitle, decimalPlaces } = useMemo(() => {
    const prefix = activeSource === 'doses' ? 'Doses · ' : '';
    const suffix = spanPadded ? ` · shorter than the ${windowDays}-day window so far` : '';
    const spec: Record<Series, { pick: (w: RollingWindow) => number; text: string; dp: number }> = {
      frequency: {
        pick: (w) => w.eventsPerCalendarDay,
        text: `Events per calendar day — zero-days included, so this tracks how OFTEN`,
        dp: 2,
      },
      rate: {
        pick: (w) => w.activeDayRate,
        text: `Share of days with any activity, per ${windowDays}-day window`,
        dp: 0,
      },
      total: {
        pick: (w) => w.totalEvents,
        text: `Total events per ${windowDays}-day window — not comparable across window sizes`,
        dp: 0,
      },
      days: {
        pick: (w) => w.activeDays,
        text: `Unique active days per ${windowDays}-day window`,
        dp: 0,
      },
      intensity: {
        pick: (w) => w.eventsPerDay,
        text: `Events per ACTIVE day — per-session intensity, not frequency`,
        dp: 1,
      },
      heavy: {
        pick: (w) => w.highVolumeDays,
        text: `High-volume days (≥5 events) per ${windowDays}-day window`,
        dp: 0,
      },
    };
    const s = spec[activeSeries];
    return {
      data: windows.map((w) => {
        const n = s.pick(w);
        return Number.isFinite(n) ? n : 0;
      }),
      subtitle: prefix + s.text + suffix,
      decimalPlaces: s.dp,
    };
  }, [windows, activeSeries, activeSource, windowDays, spanPadded]);

  const chips = (
    <>
      {hasDoses ? (
        <View style={styles.chips}>
          {(['habit', 'doses'] as Source[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, activeSource === s && styles.chipActive]}
              onPress={() => setSource(s)}
            >
              <Text style={[styles.chipText, activeSource === s && styles.chipTextActive]}>
                {s === 'habit' ? 'Habit' : 'Doses'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <View style={styles.chips}>
        {WINDOW_OPTIONS.map((w) => (
          <TouchableOpacity
            key={w}
            style={[styles.chip, windowDays === w && styles.chipActive]}
            onPress={() => onWindowDaysChange(w)}
          >
            <Text style={[styles.chipText, windowDays === w && styles.chipTextActive]}>{w}d</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.chips, styles.chipsWrap]}>
        {metrics.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, activeSeries === s && styles.chipActive]}
            onPress={() => setSeries(s)}
          >
            <Text style={[styles.chipText, activeSeries === s && styles.chipTextActive]}>
              {SERIES_LABEL[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  // Render the chips even when this source has no data, so switching habit ->
  // doses (or narrowing the window) stays reachable instead of dead-ending on
  // ChartCard's empty state.
  if (windows.length === 0) {
    return (
      <ChartCard title={title} subtitle={subtitle}>
        {chips}
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Not enough data yet</Text>
        </View>
      </ChartCard>
    );
  }

  const labelInterval = windows.length > 8 ? Math.ceil(windows.length / 6) : 1;
  const labels = windows.map((w, i) =>
    i % labelInterval === 0 || i === windows.length - 1 ? w.endDate.slice(5) : ''
  );

  const color = activeSource === 'doses' ? DOSE_COLOR : habitColor;

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {chips}
      <LineChart
        data={{ labels, datasets: [{ data }] }}
        width={screenWidth - 48}
        height={180}
        chartConfig={{
          backgroundColor: '#16213e',
          backgroundGradientFrom: '#16213e',
          backgroundGradientTo: '#16213e',
          decimalPlaces,
          color: (opacity = 1) => `rgba(${color}, ${opacity})`,
          labelColor: () => '#888',
          propsForDots: { r: '3' },
        }}
        bezier
        style={{ marginLeft: -16, borderRadius: 8 }}
      />
    </ChartCard>
  );
});

const SERIES_LABEL: Record<Series, string> = {
  frequency: 'Per day',
  rate: 'Active %',
  total: 'Total',
  days: 'Days',
  intensity: 'Per active',
  heavy: 'Heavy',
};

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  chipsWrap: {
    flexWrap: 'wrap',
    rowGap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
  },
  chipActive: {
    backgroundColor: '#4a69bd',
  },
  chipText: {
    fontSize: 12,
    color: '#888',
  },
  emptyBox: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#fff',
  },
});
