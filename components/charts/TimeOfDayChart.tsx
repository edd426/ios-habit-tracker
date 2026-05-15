import React from 'react';
import { Dimensions } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import ChartCard from './ChartCard';

interface Props {
  buckets: number[]; // 24-element array
  color: string;     // rgb string fragment, e.g. '231, 76, 60'
}

const screenWidth = Dimensions.get('window').width;

export default React.memo(function TimeOfDayChart({ buckets, color }: Props) {
  const total = buckets.reduce((a, b) => a + b, 0);
  const isEmpty = total === 0;

  // Show every 3rd hour as a label to avoid crowding
  const labels = buckets.map((_, i) => (i % 3 === 0 ? `${i}` : ''));

  return (
    <ChartCard
      title="Time of day"
      subtitle="Hour of day (local time). Retro-entered midnight stubs excluded."
      empty={isEmpty}
    >
      <BarChart
        data={{
          labels,
          datasets: [{ data: buckets.map((n) => (Number.isFinite(n) ? n : 0)) }],
        }}
        width={screenWidth - 48}
        height={180}
        yAxisLabel=""
        yAxisSuffix=""
        fromZero
        showValuesOnTopOfBars={false}
        withInnerLines
        chartConfig={{
          backgroundColor: '#16213e',
          backgroundGradientFrom: '#16213e',
          backgroundGradientTo: '#16213e',
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(${color}, ${opacity})`,
          labelColor: () => '#888',
          barPercentage: 0.45,
        }}
        style={{ marginLeft: -16, borderRadius: 8 }}
      />
    </ChartCard>
  );
});
