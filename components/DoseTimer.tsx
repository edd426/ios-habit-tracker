import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { getLastDose, logDose } from '@/lib/storage';
import { DoseLog } from '@/lib/types';

interface Props {
  onDoseLogged?: () => void;
}

export default function DoseTimer({ onDoseLogged }: Props) {
  const [lastDose, setLastDose] = useState<DoseLog | null>(null);
  const [elapsed, setElapsed] = useState<string>('No dose logged');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');

  const loadLastDose = useCallback(async () => {
    const dose = await getLastDose();
    setLastDose(dose);
  }, []);

  useEffect(() => {
    loadLastDose();
  }, [loadLastDose]);

  useEffect(() => {
    if (!lastDose) {
      setElapsed('No dose logged');
      return;
    }

    const updateElapsed = () => {
      const now = Date.now();
      const diff = now - lastDose.timestamp;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        setElapsed(`${hours}h ${minutes}m ago`);
      } else {
        setElapsed(`${minutes}m ago`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 60000);
    return () => clearInterval(interval);
  }, [lastDose]);

  const saveDose = async (timestamp: number) => {
    // Dose logging MUST succeed even if notification scheduling fails —
    // recording the dose is the primary purpose of the app; the reminder
    // is a nice-to-have. Wrap each part in its own try/catch so a failure
    // in one doesn't block the other.
    try {
      await logDose(timestamp);
      await loadLastDose();
      onDoseLogged?.();
    } catch (e) {
      console.error('Failed to log dose:', e);
      Alert.alert(
        'Could not save dose',
        'Something went wrong saving the dose. Please try again.'
      );
      return;
    }

    // Only schedule notification if logging for now (within last 5 minutes)
    const isRecent = Date.now() - timestamp < 5 * 60 * 1000;
    if (isRecent) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Medication Active',
            body: '2 hours have passed since your dose.',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 2 * 60 * 60,
          },
        });
      } catch (e) {
        // Permissions denied, system in a bad state, etc. Don't crash the dose flow.
        console.warn('Failed to schedule dose reminder notification:', e);
      }
    }
  };

  // Primary action: log now immediately
  const handleLogNow = async () => {
    await saveDose(Date.now());
  };

  // Secondary action: log at a past time
  const handleLogEarlier = () => {
    Alert.alert(
      'Log Earlier Dose',
      'When did you take it?',
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

  const [startedWithTime, setStartedWithTime] = useState(false);

  const handleDateChange = (_event: any, date?: Date) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  const handlePickerDone = () => {
    if (pickerMode === 'date') {
      // After selecting date, move to time
      setPickerMode('time');
    } else if (pickerMode === 'time' && !startedWithTime) {
      // After selecting time (when we started with date), confirm
      setShowDatePicker(false);
      setStartedWithTime(false);
      Alert.alert(
        'Confirm',
        `Log dose at ${selectedDate.toLocaleString()}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: () => saveDose(selectedDate.getTime()),
          },
        ]
      );
    } else {
      // Started with time only (earlier today), confirm with just time
      setShowDatePicker(false);
      setStartedWithTime(false);
      const timeStr = selectedDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      Alert.alert(
        'Confirm',
        `Log dose at ${timeStr} today?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: () => saveDose(selectedDate.getTime()),
          },
        ]
      );
    }
  };

  const closePicker = () => {
    setShowDatePicker(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Last Medication</Text>
      <Text style={styles.timer}>{elapsed}</Text>
      <TouchableOpacity style={styles.button} onPress={handleLogNow}>
        <Text style={styles.buttonText}>I took my medication</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkButton} onPress={handleLogEarlier}>
        <Text style={styles.linkText}>Log earlier dose</Text>
      </TouchableOpacity>

      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={closePicker}>
                <Text style={styles.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>
                {pickerMode === 'date' ? 'Select Date' : 'Select Time'}
              </Text>
              <TouchableOpacity onPress={handlePickerDone}>
                <Text style={styles.pickerDone}>
                  {pickerMode === 'date' ? 'Next' : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={selectedDate}
              mode={pickerMode}
              display="spinner"
              onChange={handleDateChange}
              maximumDate={new Date()}
              textColor="#fff"
              themeVariant="dark"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  timer: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#4a69bd',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 12,
    padding: 4,
  },
  linkText: {
    color: '#666',
    fontSize: 13,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    width: '90%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  pickerCancel: {
    fontSize: 16,
    color: '#888',
  },
  pickerDone: {
    fontSize: 16,
    color: '#4a69bd',
    fontWeight: '600',
  },
});
