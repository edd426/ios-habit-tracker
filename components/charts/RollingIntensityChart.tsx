import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import ChartCard from './ChartCard';
import { RollingWindow } from '@/lib/aggregations';

interface Props {
  windows: RollingWindow[];
  color: string;
}

type Series = 'days' | 'intensity' | 'heavy';

const screenWidth = Dimensions.get('window').width;

export default React.memo(function RollingIntensityChart({ windows, color }: Props) {
  const [series, setSeries] = useState<Series>('days');

  if (windows.length === 0) {
    return <ChartCard title="Rolling 14-day intensity" empty>{null}</ChartCard>;
  }

  const labelInterval = windows.length > 8 ? Math.ceil(windows.length / 6) : 1;
  const labels = windows.map((w, i) =>
    i % labelInterval === 0 || i === windows.length - 1
      ? w.endDate.slice(5) // MM-DD
      : ''
  );

  let data: number[];
  let subtitle: string;
  let decimalPlaces = 0;

  if (series === 'days') {
    data = windows.map((w) => w.activeDays);
    subtitle = 'Unique active-days per 14-day window';
  } else if (series === 'intensity') {
    data = windows.map((w) => w.eventsPerDay);
    subtitle = 'Events per active day — tracks per-session intensity';
    decimalPlaces = 1;
  } else {
    data = windows.map((w) => w.highVolumeDays);
    subtitle = 'High-volume days (≥5 events) per 14-day window';
  }

  return (
    <ChartCard title="Rolling 14-day intensity" subtitle={subtitle}>
      <View style={styles.chips}>
        {(['days', 'intensity', 'heavy'] as Series[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, series === s && styles.chipActive]}
            onPress={() => setSeries(s)}
          >
            <Text style={[styles.chipText, series === s && styles.chipTextActive]}>
              {s === 'days' ? 'Days' : s === 'intensity' ? 'Per-day' : 'Heavy'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <LineChart
        data={{
          labels,
          datasets: [{ data: data.map((n) => (Number.isFinite(n) ? n : 0)) }],
        }}
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

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
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
  chipTextActive: {
    color: '#fff',
  },
});
