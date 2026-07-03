import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Habit } from '@/lib/types';
import QuantityModal from './QuantityModal';
import PickerSheet from './PickerSheet';

interface Props {
  habit: Habit;
  count: number;
  onIncrement: (timestamp?: number, quantity?: number) => void;
  onDecrement: () => void;
  onPress?: () => void;
}

export default function HabitCard({ habit, count, onIncrement, onDecrement, onPress }: Props) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [startedWithTime, setStartedWithTime] = useState(false);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null);

  const handleLongPress = () => {
    Alert.alert(
      'Log Earlier',
      'When did this happen?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Earlier today',
          onPress: () => {
            setSelectedDate(new Date());
            setPickerMode('time');
            setStartedWithTime(true);
            setShowDatePicker(true);
          },
        },
        {
          text: 'Previous day',
          onPress: () => {
            setSelectedDate(new Date());
            setPickerMode('date');
            setStartedWithTime(false);
            setShowDatePicker(true);
          },
        },
      ]
    );
  };

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
  };

  const handlePickerDone = () => {
    if (pickerMode === 'date') {
      setPickerMode('time');
    } else {
      setShowDatePicker(false);
      setStartedWithTime(false);
      setPendingTimestamp(selectedDate.getTime());
      setShowQuantityModal(true);
    }
  };

  const handleQuantityConfirm = (quantity: number) => {
    setShowQuantityModal(false);
    const timestamp = pendingTimestamp ?? Date.now();
    // Single call with the quantity — firing onIncrement N times raced the
    // storage layer's read-modify-write and only one log survived.
    onIncrement(timestamp, quantity);
    setPendingTimestamp(null);
  };

  const handleQuantityCancel = () => {
    setShowQuantityModal(false);
    setPendingTimestamp(null);
  };

  const closePicker = () => {
    setShowDatePicker(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.info}>
          <Text style={styles.name}>{habit.name}</Text>
          <Text style={[styles.type, habit.type === 'decrease' ? styles.decrease : styles.increase]}>
            {habit.type === 'decrease' ? 'to reduce' : 'to increase'}
          </Text>
        </View>
        <View style={styles.right}>
          {count > 0 && (
            <TouchableOpacity
              style={styles.decrementButton}
              onPress={onDecrement}
            >
              <Text style={styles.decrementText}>-1</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.count}>{count}</Text>
          <TouchableOpacity
            style={styles.incrementButton}
            onPress={() => onIncrement()}
            onLongPress={handleLongPress}
            delayLongPress={500}
          >
            <Text style={styles.incrementText}>+1</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <PickerSheet
        visible={showDatePicker}
        title={pickerMode === 'date' ? 'Select Date' : 'Select Time'}
        doneLabel={pickerMode === 'date' ? 'Next' : 'Done'}
        value={selectedDate}
        mode={pickerMode}
        maximumDate={new Date()}
        onChange={handleDateChange}
        onDone={handlePickerDone}
        onCancel={closePicker}
      />

      <QuantityModal
        visible={showQuantityModal}
        onConfirm={handleQuantityConfirm}
        onCancel={handleQuantityCancel}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#16213e',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  type: {
    fontSize: 12,
    marginTop: 2,
  },
  decrease: {
    color: '#e74c3c',
  },
  increase: {
    color: '#2ecc71',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  count: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    minWidth: 40,
    textAlign: 'center',
  },
  decrementButton: {
    backgroundColor: '#3d3d5c',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  decrementText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
  },
  incrementButton: {
    backgroundColor: '#4a69bd',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  incrementText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
