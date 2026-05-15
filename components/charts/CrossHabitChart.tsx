import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import ChartCard from './ChartCard';
import { OverlapSegments } from '@/lib/aggregations';
import { Habit } from '@/lib/types';

interface Props {
  overlap: OverlapSegments;
  habitA: Habit;
  habitB: Habit | null;
  otherHabits: Habit[];
  onSelectB: (id: string) => void;
}

export default React.memo(function CrossHabitChart({
  overlap,
  habitA,
  habitB,
  otherHabits,
  onSelectB,
}: Props) {
  if (!habitB) {
    return (
      <ChartCard
        title="Cross-habit overlap"
        subtitle="Pick a second habit to compare against."
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {otherHabits.map((h) => (
            <TouchableOpacity key={h.id} style={styles.chip} onPress={() => onSelectB(h.id)}>
              <Text style={styles.chipText}>{h.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ChartCard>
    );
  }

  const { a_only, b_only, both, neither, total } = overlap;
  if (total === 0) {
    return <ChartCard title="Cross-habit overlap" empty>{null}</ChartCard>;
  }

  const segments = [
    { label: `${habitA.name} only`, count: a_only, color: '#e74c3c' },
    { label: 'both', count: both, color: '#9b59b6' },
    { label: `${habitB.name} only`, count: b_only, color: '#3498db' },
    { label: 'neither', count: neither, color: '#34495e' },
  ];

  return (
    <ChartCard
      title="Cross-habit overlap"
      subtitle={`Days with each habit. ${both}/${a_only + both} of ${habitA.name} days had ${habitB.name} too.`}
    >
      <View style={styles.chipRow}>
        <Text style={styles.compareLabel}>Compare with:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {otherHabits.map((h) => (
            <TouchableOpacity
              key={h.id}
              style={[styles.chip, habitB.id === h.id && styles.chipActive]}
              onPress={() => onSelectB(h.id)}
            >
              <Text style={[styles.chipText, habitB.id === h.id && styles.chipTextActive]}>
                {h.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View style={styles.barRow}>
        {segments.map((s) => (
          s.count > 0 ? (
            <View
              key={s.label}
              style={[styles.segment, { flex: s.count, backgroundColor: s.color }]}
            />
          ) : null
        ))}
      </View>
      <View style={styles.legend}>
        {segments.map((s) => {
          const pct = total === 0 ? 0 : ((s.count / total) * 100).toFixed(0);
          return (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendText} numberOfLines={1}>
                {s.label}: {s.count} ({pct}%)
              </Text>
            </View>
          );
        })}
      </View>
    </ChartCard>
  );
});

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  compareLabel: {
    color: '#888',
    fontSize: 12,
    marginRight: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: '#4a69bd',
  },
  chipText: {
    fontSize: 12,
    color: '#888',
  },
  chipTextActive: {
    color: '#fff',
  },
  barRow: {
    flexDirection: 'row',
    height: 28,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  segment: {
    height: '100%',
  },
  legend: {
    gap: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginRight: 6,
  },
  legendText: {
    color: '#aaa',
    fontSize: 12,
    flex: 1,
  },
});
