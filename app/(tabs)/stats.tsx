import React, { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, View, Text, Dimensions, TouchableOpacity } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useFocusEffect } from 'expo-router';

import { getHabits, getDailyCountsForHabit, getHabitLogs, getDoseLogs } from '@/lib/storage';
import { Habit } from '@/lib/types';

const screenWidth = Dimensions.get('window').width;

export default function StatsScreen() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
  const [stats, setStats] = useState({ thisWeek: 0, lastWeek: 0, total: 0 });
  const [doseStats, setDoseStats] = useState({ total: 0, thisWeek: 0 });

  const loadHabits = useCallback(async () => {
    const h = await getHabits();
    setHabits(h);
    if (h.length > 0 && !selectedHabitId) {
      setSelectedHabitId(h[0].id);
    }

    // Load medication dose stats
    const doseLogs = await getDoseLogs();
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    setDoseStats({
      total: doseLogs.length,
      thisWeek: doseLogs.filter(l => l.timestamp >= weekAgo).length,
    });
  }, [selectedHabitId]);

  const loadChartData = useCallback(async () => {
    if (!selectedHabitId) return;

    const dailyCounts = await getDailyCountsForHabit(selectedHabitId, 14);
    const labels = dailyCounts.map(d => {
      const date = new Date(d.date);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    const data = dailyCounts.map(d => d.count);

    setChartData({ labels, data });

    // Calculate stats
    const allLogs = await getHabitLogs();
    const habitLogs = allLogs.filter(l => l.habitId === selectedHabitId);
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    setStats({
      total: habitLogs.length,
      thisWeek: habitLogs.filter(l => l.timestamp >= weekAgo).length,
      lastWeek: habitLogs.filter(l => l.timestamp >= twoWeeksAgo && l.timestamp < weekAgo).length,
    });
  }, [selectedHabitId]);

  useFocusEffect(
    useCallback(() => {
      loadHabits();
    }, [loadHabits])
  );

  useFocusEffect(
    useCallback(() => {
      loadChartData();
    }, [loadChartData])
  );

  const selectedHabit = habits.find(h => h.id === selectedHabitId);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.doseCard}>
        <Text style={styles.cardTitle}>Medication Doses</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{doseStats.thisWeek}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{doseStats.total}</Text>
            <Text style={styles.statLabel}>All Time</Text>
          </View>
        </View>
      </View>

      {habits.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No habits to show</Text>
          <Text style={styles.emptySubtext}>Add habits in Settings</Text>
        </View>
      ) : (
        <>
          <View style={styles.habitSelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {habits.map(habit => (
                <TouchableOpacity
                  key={habit.id}
                  style={[styles.habitChip, selectedHabitId === habit.id && styles.habitChipActive]}
                  onPress={() => setSelectedHabitId(habit.id)}
                >
                  <Text style={[styles.habitChipText, selectedHabitId === habit.id && styles.habitChipTextActive]}>
                    {habit.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {selectedHabit && chartData.data.length > 0 && (
            <>
              <View style={styles.chartCard}>
                <Text style={styles.cardTitle}>Last 14 Days</Text>
                <LineChart
                  data={{
                    labels: chartData.labels.filter((_, i) => i % 2 === 0),
                    datasets: [{ data: chartData.data.length > 0 ? chartData.data : [0] }],
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
                    propsForDots: {
                      r: '4',
                    },
                  }}
                  bezier
                  style={styles.chart}
                />
              </View>

              <View style={styles.statsCard}>
                <Text style={styles.cardTitle}>Summary</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.thisWeek}</Text>
                    <Text style={styles.statLabel}>This Week</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.lastWeek}</Text>
                    <Text style={styles.statLabel}>Last Week</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.total}</Text>
                    <Text style={styles.statLabel}>All Time</Text>
                  </View>
                </View>
                {selectedHabit.type === 'decrease' && stats.thisWeek < stats.lastWeek && (
                  <Text style={styles.progressText}>
                    Down {stats.lastWeek - stats.thisWeek} from last week
                  </Text>
                )}
                {selectedHabit.type === 'increase' && stats.thisWeek > stats.lastWeek && (
                  <Text style={styles.progressText}>
                    Up {stats.thisWeek - stats.lastWeek} from last week
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
  chartCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: '#16213e',
    borderRadius: 12,
  },
  chart: {
    marginLeft: -16,
    borderRadius: 8,
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
