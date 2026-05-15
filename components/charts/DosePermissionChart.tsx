import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ChartCard from './ChartCard';
import { DosePermission } from '@/lib/aggregations';

interface Props {
  permission: DosePermission;
  color: string;
}

/**
 * Two-bar comparison: rate of habit on dose days vs non-dose days.
 * A large gap between the two rates means the habit is concentrated around dosing.
 */
export default React.memo(function DosePermissionChart({ permission, color }: Props) {
  const { onDoseRate, offDoseRate, ratio, totalDoseDays, totalNonDoseDays } = permission;
  const isEmpty = totalDoseDays === 0 && totalNonDoseDays === 0;
  if (isEmpty) {
    return <ChartCard title="Dose-day permission" empty>{null}</ChartCard>;
  }

  const maxRate = Math.max(onDoseRate, offDoseRate, 1); // avoid 0-width
  const ratioText =
    !Number.isFinite(ratio) || ratio === Infinity
      ? 'only on dose days'
      : `${ratio.toFixed(1)}× more likely on dose days`;

  return (
    <ChartCard
      title="Dose-day permission"
      subtitle="Rate of this habit on dose days vs non-dose days."
    >
      <View style={styles.row}>
        <Text style={styles.label}>On dose days</Text>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { width: `${(onDoseRate / maxRate) * 100}%`, backgroundColor: `rgb(${color})` },
            ]}
          />
        </View>
        <Text style={styles.value}>
          {onDoseRate.toFixed(0)}%
        </Text>
      </View>
      <Text style={styles.context}>
        {permission.onDoseDays} / {totalDoseDays} dose days
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Off dose days</Text>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { width: `${(offDoseRate / maxRate) * 100}%`, backgroundColor: '#7f8c8d' },
            ]}
          />
        </View>
        <Text style={styles.value}>
          {offDoseRate.toFixed(0)}%
        </Text>
      </View>
      <Text style={styles.context}>
        {permission.offDoseDays} / {totalNonDoseDays} non-dose days
      </Text>

      <View style={styles.ratioRow}>
        <Text style={styles.ratioText}>{ratioText}</Text>
      </View>
    </ChartCard>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    width: 110,
    color: '#aaa',
    fontSize: 13,
  },
  barTrack: {
    flex: 1,
    height: 18,
    backgroundColor: '#0f0f1a',
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  value: {
    width: 44,
    textAlign: 'right',
    color: '#fff',
    fontWeight: '600',
  },
  context: {
    color: '#666',
    fontSize: 11,
    marginLeft: 118,
    marginBottom: 8,
  },
  ratioRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4a',
  },
  ratioText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
});
