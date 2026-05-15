import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useFocusEffect } from 'expo-router';

import {
  loadAllForStats,
  StatsLoad,
  dailyCountsForHabit,
  timeOfDayBuckets,
  dayOfWeekBuckets,
  medicatedWindowBuckets,
  doseDayPermission,
  rolling14d,
  crossHabitOverlap,
  interEventInterval,
  toLocalDateKey,
  toLocalDayStart,
} from '@/lib/aggregations';
import { Habit, HabitLog } from '@/lib/types';
import ChartCard from '@/components/charts/ChartCard';
import TimeOfDayChart from '@/components/charts/TimeOfDayChart';
import DayOfWeekChart from '@/components/charts/DayOfWeekChart';
import MedicatedWindowChart from '@/components/charts/MedicatedWindowChart';
import DosePermissionChart from '@/components/charts/DosePermissionChart';
import RollingIntensityChart from '@/components/charts/RollingIntensityChart';
import CrossHabitChart from '@/components/charts/CrossHabitChart';
import IntervalChart from '@/components/charts/IntervalChart';

const screenWidth = Dimensions.get('window').width;

type TimeRange = '14d' | '30d' | '90d' | '1y' | 'all';

const TIME_RANGES: { key: TimeRange; label: string; days: number | null }[] = [
  { key: '14d', label: '2W', days: 14 },
  { key: '30d', label: '1M', days: 30 },
  { key: '90d', label: '3M', days: 90 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All', days: null },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export default function StatsScreen() {
  const [load, setLoad] = useState<StatsLoad | null>(null);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('14d');
  const [compareHabitId, setCompareHabitId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await loadAllForStats();
      setLoad(next);
      if (next.habits.length > 0 && !selectedHabitId) {
        setSelectedHabitId(next.habits[0].id);
      }
    } catch (e) {
      console.error('Stats load failed:', e);
    }
  }, [selectedHabitId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // === Derived values, all memoized ============================================

  const selectedHabit: Habit | undefined = useMemo(
    () => load?.habits.find((h) => h.id === selectedHabitId),
    [load, selectedHabitId]
  );

  const compareHabit: Habit | undefined = useMemo(
    () => load?.habits.find((h) => h.id === compareHabitId),
    [load, compareHabitId]
  );

  const otherHabits = useMemo(
    () => load?.habits.filter((h) => h.id !== selectedHabitId) ?? [],
    [load, selectedHabitId]
  );

  // Days for the selected time range — once
  const rangeDays = useMemo(() => {
    if (!load || !selectedHabitId) return 14;
    const range = TIME_RANGES.find((r) => r.key === selectedTimeRange);
    if (selectedTimeRange === 'all') {
      const habit = load.habits.find((h) => h.id === selectedHabitId);
      if (habit) {
        const daysSinceCreation = Math.ceil((Date.now() - habit.createdAt) / DAY_MS);
        return Math.max(daysSinceCreation, 7);
      }
      return 30;
    }
    return range?.days ?? 14;
  }, [load, selectedHabitId, selectedTimeRange]);

  // Range-filtered habit logs for the selected habit
  const rangeHabitLogs: HabitLog[] = useMemo(() => {
    if (!load || !selectedHabitId) return [];
    const all = load.logsByHabit.get(selectedHabitId) ?? [];
    const cutoff = Date.now() - rangeDays * DAY_MS;
    return all.filter((l) => l.timestamp >= cutoff);
  }, [load, selectedHabitId, rangeDays]);

  // Trend (existing)
  const trendData = useMemo(() => {
    if (!load || !selectedHabitId) return { labels: [] as string[], data: [] as number[] };
    const counts = dailyCountsForHabit(load, selectedHabitId, rangeDays);
    let labelInterval = 1;
    if (rangeDays <= 14) labelInterval = 2;
    else if (rangeDays <= 30) labelInterval = 5;
    else if (rangeDays <= 90) labelInterval = 14;
    else if (rangeDays <= 365) labelInterval = 30;
    else labelInterval = 60;
    const labels = counts.map((d, i) => {
      if (i % labelInterval !== 0 && i !== counts.length - 1) return '';
      const date = new Date(d.date);
      if (rangeDays > 90) {
        return date.toLocaleDateString('en-US', { month: 'short' });
      }
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    return { labels, data: counts.map((c) => c.count) };
  }, [load, selectedHabitId, rangeDays]);

  // Summary
  const summary = useMemo(() => {
    if (!load || !selectedHabitId) return { thisWeek: 0, lastWeek: 0, total: 0 };
    const all = load.logsByHabit.get(selectedHabitId) ?? [];
    const now = Date.now();
    const weekAgo = now - 7 * DAY_MS;
    const twoWeeksAgo = now - 14 * DAY_MS;
    return {
      total: all.length,
      thisWeek: all.filter((l) => l.timestamp >= weekAgo).length,
      lastWeek: all.filter((l) => l.timestamp >= twoWeeksAgo && l.timestamp < weekAgo).length,
    };
  }, [load, selectedHabitId]);

  const doseSummary = useMemo(() => {
    if (!load) return { thisWeek: 0, total: 0 };
    const now = Date.now();
    const weekAgo = now - 7 * DAY_MS;
    return {
      total: load.doseLogs.length,
      thisWeek: load.doseLogs.filter((l) => l.timestamp >= weekAgo).length,
    };
  }, [load]);

  // Time-of-day buckets (use range-filtered logs)
  const todBuckets = useMemo(() => timeOfDayBuckets(rangeHabitLogs), [rangeHabitLogs]);
  const dowBuckets = useMemo(() => dayOfWeekBuckets(rangeHabitLogs), [rangeHabitLogs]);

  // Medicated-window — use ALL dose logs (a dose 13h before is still "the last one")
  const medBuckets = useMemo(
    () => medicatedWindowBuckets(rangeHabitLogs, load?.doseLogs ?? []),
    [rangeHabitLogs, load]
  );

  // Dose-day permission — needs date sets over the full activity range
  const permission = useMemo(() => {
    if (!load || !selectedHabitId) {
      return {
        habitId: '',
        onDoseDays: 0,
        totalDoseDays: 0,
        offDoseDays: 0,
        totalNonDoseDays: 0,
        onDoseRate: 0,
        offDoseRate: 0,
        ratio: 0,
      };
    }
    // Build date sets from the load (already indexed)
    const doseDates = new Set(load.doseLogs.map((d) => toLocalDateKey(d.timestamp)));
    // All dates from first activity through today (closed range)
    const firstTs =
      Math.min(
        load.habitLogs[0]?.timestamp ?? Date.now(),
        load.doseLogs[0]?.timestamp ?? Date.now()
      );
    const allDateKeys = new Set<string>();
    let cur = toLocalDayStart(firstTs);
    const end = toLocalDayStart(Date.now());
    while (cur <= end) {
      allDateKeys.add(toLocalDateKey(cur));
      cur += DAY_MS;
    }
    const logs = load.logsByHabit.get(selectedHabitId) ?? [];
    return doseDayPermission(logs, doseDates, allDateKeys);
  }, [load, selectedHabitId]);

  // Rolling 14-day intensity — use the full habit log history
  const rolling = useMemo(() => {
    if (!load || !selectedHabitId) return [];
    const logs = load.logsByHabit.get(selectedHabitId) ?? [];
    if (logs.length === 0) return [];
    const firstTs = logs[0].timestamp;
    const lastTs = Date.now();
    return rolling14d(logs, firstTs, lastTs);
  }, [load, selectedHabitId]);

  // Cross-habit overlap — over the full activity range
  const overlap = useMemo(() => {
    if (!load || !selectedHabitId || !compareHabitId) {
      return { a_only: 0, b_only: 0, both: 0, neither: 0, total: 0 };
    }
    const logsA = load.logsByHabit.get(selectedHabitId) ?? [];
    const logsB = load.logsByHabit.get(compareHabitId) ?? [];
    // Use the union of dates from both habits (more meaningful than every day in range)
    const dateSet = new Set<string>();
    for (const l of logsA) dateSet.add(toLocalDateKey(l.timestamp));
    for (const l of logsB) dateSet.add(toLocalDateKey(l.timestamp));
    // Also add days from the full activity range so "neither" segments make sense
    const firstTs = Math.min(
      logsA[0]?.timestamp ?? Date.now(),
      logsB[0]?.timestamp ?? Date.now()
    );
    let cur = toLocalDayStart(firstTs);
    const end = toLocalDayStart(Date.now());
    while (cur <= end) {
      dateSet.add(toLocalDateKey(cur));
      cur += DAY_MS;
    }
    return crossHabitOverlap(logsA, logsB, dateSet);
  }, [load, selectedHabitId, compareHabitId]);

  // Inter-event interval trend
  const intervalPoints = useMemo(() => {
    if (!load || !selectedHabitId) return [];
    const logs = load.logsByHabit.get(selectedHabitId) ?? [];
    return interEventInterval(logs, 30, 7);
  }, [load, selectedHabitId]);

  // === Defensive chart data sanitization (avoid chart-kit NaN/length-mismatch crashes) ===
  const safeTrendData = useMemo(() => {
    const data = trendData.data.length > 0
      ? trendData.data.map((n) => (Number.isFinite(n) ? n : 0))
      : [0];
    const labels = trendData.labels.length === data.length
      ? trendData.labels
      : data.map(() => '');
    return { labels, data };
  }, [trendData]);

  const habitColorRgb =
    selectedHabit?.type === 'decrease' ? '231, 76, 60' : '46, 204, 113';

  // === Render ===

  if (!load) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading…</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.doseCard}>
        <Text style={styles.cardTitle}>Medication Doses</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{doseSummary.thisWeek}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{doseSummary.total}</Text>
            <Text style={styles.statLabel}>All Time</Text>
          </View>
        </View>
      </View>

      {load.habits.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No habits to show</Text>
          <Text style={styles.emptySubtext}>Add habits in Settings</Text>
        </View>
      ) : (
        <>
          <View style={styles.habitSelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {load.habits.map((habit) => (
                <TouchableOpacity
                  key={habit.id}
                  style={[styles.habitChip, selectedHabitId === habit.id && styles.habitChipActive]}
                  onPress={() => setSelectedHabitId(habit.id)}
                >
                  <Text
                    style={[styles.habitChipText, selectedHabitId === habit.id && styles.habitChipTextActive]}
                  >
                    {habit.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {selectedHabit && (
            <>
              {/* Trend (existing chart) */}
              <ChartCard
                title="Trend"
                empty={safeTrendData.data.length === 0 || safeTrendData.data.every((n) => n === 0)}
              >
                <View style={styles.timeRangeSelector}>
                  {TIME_RANGES.map((range) => (
                    <TouchableOpacity
                      key={range.key}
                      style={[
                        styles.timeRangeChip,
                        selectedTimeRange === range.key && styles.timeRangeChipActive,
                      ]}
                      onPress={() => setSelectedTimeRange(range.key)}
                    >
                      <Text
                        style={[
                          styles.timeRangeText,
                          selectedTimeRange === range.key && styles.timeRangeTextActive,
                        ]}
                      >
                        {range.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <LineChart
                  data={{
                    labels: safeTrendData.labels,
                    datasets: [{ data: safeTrendData.data }],
                  }}
                  width={screenWidth - 48}
                  height={200}
                  chartConfig={{
                    backgroundColor: '#16213e',
                    backgroundGradientFrom: '#16213e',
                    backgroundGradientTo: '#16213e',
                    decimalPlaces: 0,
                    color: (opacity = 1) =>
                      selectedHabit.type === 'decrease'
                        ? `rgba(231, 76, 60, ${opacity})`
                        : `rgba(46, 204, 113, ${opacity})`,
                    labelColor: () => '#888',
                    propsForDots: { r: '4' },
                  }}
                  bezier
                  style={{ marginLeft: -16, borderRadius: 8 }}
                />
              </ChartCard>

              <RollingIntensityChart windows={rolling} color={habitColorRgb} />

              <TimeOfDayChart buckets={todBuckets} color={habitColorRgb} />

              <DayOfWeekChart buckets={dowBuckets} color={habitColorRgb} />

              <MedicatedWindowChart buckets={medBuckets} />

              <DosePermissionChart permission={permission} color={habitColorRgb} />

              <CrossHabitChart
                overlap={overlap}
                habitA={selectedHabit}
                habitB={compareHabit ?? null}
                otherHabits={otherHabits}
                onSelectB={setCompareHabitId}
              />

              <IntervalChart points={intervalPoints} color={habitColorRgb} />

              {/* Summary (existing) */}
              <View style={styles.statsCard}>
                <Text style={styles.cardTitle}>Summary</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{summary.thisWeek}</Text>
                    <Text style={styles.statLabel}>This Week</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{summary.lastWeek}</Text>
                    <Text style={styles.statLabel}>Last Week</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{summary.total}</Text>
                    <Text style={styles.statLabel}>All Time</Text>
                  </View>
                </View>
                {selectedHabit.type === 'decrease' && summary.thisWeek < summary.lastWeek && (
                  <Text style={styles.progressText}>
                    Down {summary.lastWeek - summary.thisWeek} from last week
                  </Text>
                )}
                {selectedHabit.type === 'increase' && summary.thisWeek > summary.lastWeek && (
                  <Text style={styles.progressText}>
                    Up {summary.thisWeek - summary.lastWeek} from last week
                  </Text>
                )}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  doseCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
  },
  habitSelector: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  habitChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#16213e',
    borderRadius: 20,
    marginRight: 8,
  },
  habitChipActive: {
    backgroundColor: '#4a69bd',
  },
  habitChipText: {
    color: '#888',
    fontSize: 14,
  },
  habitChipTextActive: {
    color: '#fff',
  },
  timeRangeSelector: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    justifyContent: 'flex-end',
  },
  timeRangeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
  },
  timeRangeChipActive: {
    backgroundColor: '#4a69bd',
  },
  timeRangeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  timeRangeTextActive: {
    color: '#fff',
  },
  statsCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: '#16213e',
    borderRadius: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  progressText: {
    textAlign: 'center',
    color: '#2ecc71',
    marginTop: 12,
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    padding: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#444',
    marginTop: 4,
  },
});
