import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import ChartCard from './ChartCard';
import { heatmapGrid, HeatLevel, TimestampedEvent } from '@/lib/aggregations';

interface Props {
  habitEvents: TimestampedEvent[];
  doseEvents: TimestampedEvent[];
  habitColor: string; // 'r, g, b'
}

type Source = 'habit' | 'doses';
type Span = 26 | 52;

const SPANS: { weeks: Span; label: string }[] = [
  { weeks: 26, label: '6M' },
  { weeks: 52, label: '1Y' },
];

const DOSE_COLOR = '74, 105, 189'; // #4a69bd
const EMPTY_CELL = '#2a2f45';
const LEVEL_OPACITY: Record<Exclude<HeatLevel, 0>, number> = { 1: 0.4, 2: 0.6, 3: 0.8, 4: 1 };
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

const GAP = 2;
const LABEL_W = 26;
const MONTH_ROW_H = 14;
// Card inner width = screen - 2x16 margin - 2x16 padding. Size cells so the
// default 26-week span fits without scrolling; 1Y keeps the same cell size and
// scrolls horizontally, opening on the most recent weeks.
const INNER_W = Dimensions.get('window').width - 64 - LABEL_W;
const CELL = Math.max(6, Math.min(14, Math.floor((INNER_W + GAP) / 26) - GAP));
const STEP = CELL + GAP;

const cellColor = (level: HeatLevel, rgb: string) =>
  level === 0 ? EMPTY_CELL : `rgba(${rgb}, ${LEVEL_OPACITY[level]})`;

/**
 * One cell per calendar day, shaded by event count: the raw day-level grid
 * that every aggregated chart hides. Streaks, clusters and seasonality show up
 * here as blocks. Independent of the screen's time-range chip, like the
 * rolling card: the point is the long-span pattern.
 */
export default React.memo(function CalendarHeatmap({ habitEvents, doseEvents, habitColor }: Props) {
  const [source, setSource] = useState<Source>('habit');
  const [span, setSpan] = useState<Span>(26);
  const scrollRef = useRef<ScrollView>(null);

  const hasDoses = doseEvents.length > 0;
  const activeSource: Source = source === 'doses' && !hasDoses ? 'habit' : source;
  const events = activeSource === 'doses' ? doseEvents : habitEvents;
  const rgb = activeSource === 'doses' ? DOSE_COLOR : habitColor;

  const grid = useMemo(() => heatmapGrid(events, span), [events, span]);

  // The darkest shade starts at the 90th-percentile day, so say where it starts.
  const subtitle =
    grid.cap > 0
      ? `${activeSource === 'doses' ? 'Doses' : 'Events'} per day · darkest shade = ${grid.cap}+`
      : 'One cell per day, shaded by event count';

  const chip = (active: boolean, label: string, onPress: () => void) => (
    <TouchableOpacity key={label} style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ChartCard title="Calendar" subtitle={subtitle}>
      <View style={styles.chipRow}>
        {hasDoses ? (
          <View style={styles.chips}>
            {chip(activeSource === 'habit', 'Habit', () => setSource('habit'))}
            {chip(activeSource === 'doses', 'Doses', () => setSource('doses'))}
          </View>
        ) : (
          <View />
        )}
        <View style={styles.chips}>
          {SPANS.map((s) => chip(span === s.weeks, s.label, () => setSpan(s.weeks)))}
        </View>
      </View>

      {grid.activeDays === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No activity in this span</Text>
        </View>
      ) : (
        <>
          <View style={styles.gridRow}>
            <View style={{ width: LABEL_W, paddingTop: MONTH_ROW_H }}>
              {DAY_LABELS.map((d, i) => (
                <Text key={i} style={[styles.axisText, { height: STEP, lineHeight: STEP }]}>
                  {d}
                </Text>
              ))}
            </View>
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              <View>
                <View style={{ height: MONTH_ROW_H, width: grid.weeks.length * STEP - GAP }}>
                  {grid.monthLabels.map((m) => (
                    <Text key={m.week} style={[styles.axisText, styles.monthLabel, { left: m.week * STEP }]}>
                      {m.label}
                    </Text>
                  ))}
                </View>
                <View style={styles.weeks}>
                  {grid.weeks.map((col, w) => (
                    <View key={w} style={styles.week}>
                      {col.map((cell, r) => (
                        <View
                          key={r}
                          style={[
                            styles.cell,
                            cell
                              ? { backgroundColor: cellColor(cell.level, rgb) }
                              : styles.cellFuture,
                          ]}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>

          <View style={styles.legend}>
            <Text style={styles.axisText}>{grid.activeDays} active days</Text>
            <View style={styles.legendScale}>
              <Text style={styles.axisText}>Less</Text>
              {([0, 1, 2, 3, 4] as HeatLevel[]).map((l) => (
                <View key={l} style={[styles.cell, { backgroundColor: cellColor(l, rgb) }]} />
              ))}
              <Text style={styles.axisText}>More</Text>
            </View>
          </View>
        </>
      )}
    </ChartCard>
  );
});

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
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
  gridRow: {
    flexDirection: 'row',
  },
  weeks: {
    flexDirection: 'row',
    gap: GAP,
  },
  week: {
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 2,
  },
  cellFuture: {
    backgroundColor: 'transparent',
  },
  axisText: {
    fontSize: 10,
    color: '#666',
  },
  monthLabel: {
    position: 'absolute',
    top: 0,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  legendScale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
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
