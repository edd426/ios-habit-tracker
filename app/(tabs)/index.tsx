import React, { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, View, Text, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';

import DoseTimer from '@/components/DoseTimer';
import HabitCard from '@/components/HabitCard';
import { getHabits, getAllTodayCounts, logHabit, removeLastTodayLog } from '@/lib/storage';
import { Habit } from '@/lib/types';

export default function HomeScreen() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [h, c] = await Promise.all([getHabits(), getAllTodayCounts()]);
    setHabits(h);
    setCounts(c);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleIncrement = async (habitId: string, timestamp?: number) => {
    await logHabit(habitId, timestamp);
    // Reload counts to get accurate today's count (in case logging for a past day)
    const newCounts = await getAllTodayCounts();
    setCounts(newCounts);
  };

  const handleDecrement = async (habitId: string) => {
    await removeLastTodayLog(habitId);
    const newCounts = await getAllTodayCounts();
    setCounts(newCounts);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
    >
      <DoseTimer onDoseLogged={loadData} />

      <View style={styles.habitsSection}>
        <Text style={styles.sectionTitle}>Today's Habits</Text>
        {habits.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No habits yet</Text>
            <Text style={styles.emptySubtext}>Add habits in Settings</Text>
          </View>
        ) : (
          habits.map(habit => (
            <HabitCard
              key={habit.id}
              habit={habit}
              count={counts[habit.id] || 0}
              onIncrement={(timestamp) => handleIncrement(habit.id, timestamp)}
              onDecrement={() => handleDecrement(habit.id)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  habitsSection: {
    marginTop: 24,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#888',
    marginLeft: 16,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
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
