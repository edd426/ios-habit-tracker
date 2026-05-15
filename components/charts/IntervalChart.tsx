import React from 'react';
import { Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import ChartCard from './ChartCard';
import { IntervalPoint } from '@/lib/aggregations';

interface Props {
  points: IntervalPoint[];
  color: string;
}

const screenWidth = Dimensions.get('window').width;

/**
 * Rolling median days-between-events. Trends up over time when events are
 * getting further apart — a useful behavioral trend signal.
 */
export default React.memo(function IntervalChart({ points, color }: Props) {
  const usable = points.filter((p) => p.medianGapDays !== null) as Array<IntervalPoint & { medianGapDays: number }>;
  if (usable.length < 2) {
    return (
      <ChartCard
        title="Inter-event interval"
        empty
        emptyText="Need at least 2 windows with 2+ events to compute."
      >
        {null}
      </ChartCard>
    );
  }

  const labelInterval = usable.length > 8 ? Math.ceil(usable.length / 6) : 1;
  const labels = usable.map((p, i) =>
    i % labelInterval === 0 || i === usable.length - 1 ? p.endDate.slice(5) : ''
  );
  const data = usable.map((p) => p.medianGapDays);

  return (
    <ChartCard
      title="Inter-event interval"
      subtitle="Rolling 30-day median days between event-days. Trending up means events are spreading out."
    >
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
          decimalPlaces: 1,
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
