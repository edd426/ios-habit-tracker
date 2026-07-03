import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ChartCard from './ChartCard';
import { MedicatedBuckets } from '@/lib/aggregations';

interface Props {
  buckets: MedicatedBuckets;
}

/**
 * Horizontal segmented bar — clearer than chart-kit's StackedBarChart for
 * a single distribution. Each segment is sized by its share of total events.
 */
export default React.memo(function MedicatedWindowChart({ buckets }: Props) {
  const total = buckets.total;
  if (total === 0) {
    return (
      <ChartCard title="Medicated window" empty>{null}</ChartCard>
    );
  }

  // Each event vs the protective window of its most recent dose. "Covered"
  // (green) is the good bucket: after the lead time, before protection wears off.
  const segments = [
    { label: 'before lead', count: buckets.beforeLead, color: '#f39c12' }, // amber: too early
    { label: 'covered', count: buckets.inWindow, color: '#2ecc71' },       // green: protected
    { label: 'lapsed', count: buckets.lapsed, color: '#e74c3c' },          // red: worn off
    { label: 'no dose', count: buckets.none, color: '#7f8c8d' },           // grey: no prior dose
  ].filter((s) => s.count > 0);

  return (
    <ChartCard
      title="Medicated window"
      subtitle="Each event vs its most recent dose's protective window. Green = covered (after the lead time, before it wears off)."
    >
      <View style={styles.barRow}>
        {segments.map((s) => (
          <View
            key={s.label}
            style={[
              styles.segment,
              { flex: s.count, backgroundColor: s.color },
            ]}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {segments.map((s) => {
          const pct = ((s.count / total) * 100).toFixed(0);
          return (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
  },
});
