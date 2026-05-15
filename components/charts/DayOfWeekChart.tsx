import React from 'react';
import { Dimensions } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import ChartCard from './ChartCard';

interface Props {
  buckets: number[]; // 7-element array, Mon..Sun
  color: string;
}

const screenWidth = Dimensions.get('window').width;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default React.memo(function DayOfWeekChart({ buckets, color }: Props) {
  const total = buckets.reduce((a, b) => a + b, 0);
  const isEmpty = total === 0;

  return (
    <ChartCard
      title="Day of week"
      subtitle="Unique event-days per weekday."
      empty={isEmpty}
    >
      <BarChart
        data={{
          labels: DAY_LABELS,
          datasets: [{ data: buckets.map((n) => (Number.isFinite(n) ? n : 0)) }],
        }}
        width={screenWidth - 48}
        height={180}
        yAxisLabel=""
        yAxisSuffix=""
        fromZero
        showValuesOnTopOfBars
        withInnerLines
        chartConfig={{
          backgroundColor: '#16213e',
          backgroundGradientFrom: '#16213e',
          backgroundGradientTo: '#16213e',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(${color}, ${opacity})`,
          labelColor: () => '#888',
          barPercentage: 0.6,
        }}
        style={{ marginLeft: -16, borderRadius: 8 }}
      />
    </ChartCard>
  );
});
