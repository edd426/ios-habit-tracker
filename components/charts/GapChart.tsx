import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import ChartCard from './ChartCard';
import {
  GAP_BUCKETS,
  TimestampedEvent,
  gapsBetweenActiveDays,
  gapHistogramHalves,
  longestGapSteps,
  currentGapDays,
  dateKeyToDayNumber,
  localDayNumber,
  dayNumberToKey,
} from '@/lib/aggregations';

interface Props {
  habitEvents: TimestampedEvent[];
  doseEvents: TimestampedEvent[];
  habitColor: string; // 'r, g, b'
  habitType: 'increase' | 'decrease';
}

type Source = 'habit' | 'doses';

const DOSE_COLOR = '74, 105, 189'; // #4a69bd
const INNER_W = Dimensions.get('window').width - 64;
const BUCKET_LABEL_W = 40;
const COUNT_W = 28;
const BAR_MAX_W = INNER_W - BUCKET_LABEL_W - COUNT_W - 4; // 4 = bar/count gap

const STEP_H = 140;
const PAD = { top: 14, right: 12, bottom: 18, left: 26 };

const shortDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * The tail of the gap distribution, which the rolling median hides by
 * construction: going from "never more than 3 days off" to "sometimes 10 days
 * off" barely moves a median. Both views read the FULL history through one
 * definition of a gap (gapsBetweenActiveDays), independent of the range chip.
 */
export default React.memo(function GapChart({ habitEvents, doseEvents, habitColor, habitType }: Props) {
  const [source, setSource] = useState<Source>('habit');

  const hasDoses = doseEvents.length > 0;
  const activeSource: Source = source === 'doses' && !hasDoses ? 'habit' : source;
  const events = activeSource === 'doses' ? doseEvents : habitEvents;
  const rgb = activeSource === 'doses' ? DOSE_COLOR : habitColor;

  const { halves, steps, current } = useMemo(() => {
    const gaps = gapsBetweenActiveDays(events);
    return {
      halves: gapHistogramHalves(gaps),
      steps: longestGapSteps(events),
      current: currentGapDays(events),
    };
  }, [events]);

  // The same number reads differently depending on what is being tracked.
  const meaning =
    activeSource === 'doses'
      ? 'A gap over 1 day means days without a dose.'
      : habitType === 'decrease'
        ? 'Longer gaps are longer stretches without it.'
        : 'Longer gaps are longer lapses.';

  const sourceChips = hasDoses ? (
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
  ) : null;

  if (halves.secondTotal === 0) {
    return (
      <ChartCard title="Gaps between active days" subtitle={meaning}>
        {sourceChips}
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Needs at least 3 active days</Text>
        </View>
      </ChartCard>
    );
  }

  // Compare SHARES, not counts, so the halves are comparable even when one
  // holds the odd gap out.
  const share = (count: number, total: number) => (total > 0 ? count / total : 0);
  const maxShare = Math.max(
    ...halves.first.map((c) => share(c, halves.firstTotal)),
    ...halves.second.map((c) => share(c, halves.secondTotal))
  );
  const barW = (count: number, total: number) =>
    maxShare > 0 ? Math.max(count > 0 ? 2 : 0, (share(count, total) / maxShare) * BAR_MAX_W) : 0;

  return (
    <ChartCard title="Gaps between active days" subtitle={meaning}>
      {sourceChips}

      <Text style={styles.sectionTitle}>Gap length, earlier vs. recent half</Text>
      {GAP_BUCKETS.map((b, i) => (
        <View key={b.label} style={styles.bucketRow}>
          <Text style={styles.bucketLabel}>{b.label}d</Text>
          <View style={styles.bars}>
            <View style={styles.barLine}>
              <View
                style={[
                  styles.bar,
                  { width: barW(halves.first[i], halves.firstTotal), backgroundColor: `rgba(${rgb}, 0.35)` },
                ]}
              />
              <Text style={styles.count}>{halves.first[i] || ''}</Text>
            </View>
            <View style={styles.barLine}>
              <View
                style={[
                  styles.bar,
                  { width: barW(halves.second[i], halves.secondTotal), backgroundColor: `rgba(${rgb}, 1)` },
                ]}
              />
              <Text style={styles.count}>{halves.second[i] || ''}</Text>
            </View>
          </View>
        </View>
      ))}
      <View style={styles.legend}>
        <View style={[styles.swatch, { backgroundColor: `rgba(${rgb}, 0.35)` }]} />
        <Text style={styles.legendText}>Earlier ({halves.firstTotal} gaps)</Text>
        <View style={[styles.swatch, { backgroundColor: `rgba(${rgb}, 1)` }]} />
        <Text style={styles.legendText}>Recent ({halves.secondTotal} gaps)</Text>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Longest gap so far</Text>
      <LongestGapSteps steps={steps} rgb={rgb} />
      {current !== null && steps.length > 0 ? (
        <Text style={styles.currentText}>
          Current gap: {current} {current === 1 ? 'day' : 'days'}
          {current > steps[steps.length - 1].longest ? ' — longer than the record' : ''}
        </Text>
      ) : null}
    </ChartCard>
  );
});

/**
 * Running record as a true step line on a real time axis: flat while the
 * record holds, straight up the day it is broken.
 */
function LongestGapSteps({ steps, rgb }: { steps: { date: string; longest: number }[]; rgb: string }) {
  const width = INNER_W;
  const startDay = dateKeyToDayNumber(steps[0].date);
  const endDay = Math.max(localDayNumber(Date.now()), startDay + 1);
  const maxY = steps[steps.length - 1].longest;

  const plotW = width - PAD.left - PAD.right;
  const plotH = STEP_H - PAD.top - PAD.bottom;
  const x = (day: number) => PAD.left + ((day - startDay) / (endDay - startDay)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / maxY) * plotH;

  let d = `M ${x(startDay)} ${y(steps[0].longest)}`;
  for (const s of steps.slice(1)) {
    const sx = x(dateKeyToDayNumber(s.date));
    d += ` H ${sx} V ${y(s.longest)}`;
  }
  d += ` H ${x(endDay)}`;

  // Early records tend to cluster (1, 2, 3 in the first weeks); label a dot
  // only when it has room, and always label the current record.
  const MIN_LABEL_DX = 16;
  let lastLabelX = -Infinity;
  const labelled = steps.map((s, i) => {
    const cx = x(dateKeyToDayNumber(s.date));
    const show = i === steps.length - 1 || cx - lastLabelX >= MIN_LABEL_DX;
    if (show) lastLabelX = cx;
    return { ...s, cx, show };
  });

  return (
    <Svg width={width} height={STEP_H}>
      <Line x1={PAD.left} y1={y(0)} x2={width - PAD.right} y2={y(0)} stroke="#2a2f45" strokeWidth={1} />
      <SvgText x={PAD.left - 6} y={y(0) + 3} fill="#666" fontSize={10} textAnchor="end">
        0
      </SvgText>
      <Path d={d} stroke={`rgba(${rgb}, 1)`} strokeWidth={2} fill="none" />
      {labelled.map((s) => (
        <React.Fragment key={s.date}>
          <Circle cx={s.cx} cy={y(s.longest)} r={3} fill={`rgba(${rgb}, 1)`} />
          {s.show ? (
            <SvgText x={s.cx} y={y(s.longest) - 6} fill="#aaa" fontSize={10} textAnchor="middle">
              {s.longest}
            </SvgText>
          ) : null}
        </React.Fragment>
      ))}
      <SvgText x={PAD.left} y={STEP_H - 4} fill="#666" fontSize={10} textAnchor="start">
        {shortDate(steps[0].date)}
      </SvgText>
      <SvgText x={width - PAD.right} y={STEP_H - 4} fill="#666" fontSize={10} textAnchor="end">
        {shortDate(dayNumberToKey(endDay))}
      </SvgText>
    </Svg>
  );
}

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
  sectionTitle: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 8,
  },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  bucketLabel: {
    width: BUCKET_LABEL_W,
    fontSize: 12,
    color: '#888',
  },
  bars: {
    flex: 1,
    gap: 2,
  },
  barLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bar: {
    height: 7,
    borderRadius: 2,
  },
  count: {
    width: COUNT_W,
    fontSize: 10,
    color: '#666',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: '#888',
    marginRight: 8,
  },
  currentText: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
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
});
