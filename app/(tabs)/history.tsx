import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  getHabits,
  getLogsForDate,
  getDoseLogsForDate,
  logHabit,
  logDose,
  updateLog,
  updateDoseLog,
  deleteLog,
  deleteDoseLog,
} from '@/lib/storage';
import { Habit, HabitLog, DoseLog } from '@/lib/types';
import QuantityModal from '@/components/QuantityModal';

export default function HistoryScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Modal states
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerValue, setTimePickerValue] = useState(new Date());
  const [timePickerKey, setTimePickerKey] = useState(0); // Force re-mount picker
  const selectedTimeRef = useRef(new Date()); // Track selection without re-render
  const baseDateRef = useRef(new Date()); // Store base date for time picker (avoids stale state reads)
  const [editingLog, setEditingLog] = useState<{ type: 'habit' | 'dose'; id: string } | null>(null);
  const [addingForHabit, setAddingForHabit] = useState<string | null>(null);
  const [addingDose, setAddingDose] = useState(false);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [pendingAddTime, setPendingAddTime] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    const [h, hl, dl] = await Promise.all([
      getHabits(),
      getLogsForDate(selectedDate),
      getDoseLogsForDate(selectedDate),
    ]);
    setHabits(h);
    setHabitLogs(hl);
    setDoseLogs(dl);
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const formatDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);

    if (compareDate.getTime() === today.getTime()) return 'Today';
    if (compareDate.getTime() === yesterday.getTime()) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const goToPreviousDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (next <= today) {
      setSelectedDate(next);
    }
  };

  const handleDateChange = (_event: any, date?: Date) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  const isToday = () => {
    const today = new Date();
    return (
      selectedDate.getDate() === today.getDate() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getFullYear() === today.getFullYear()
    );
  };

  // Edit time handlers
  const handleEditLog = (type: 'habit' | 'dose', id: string, timestamp: number) => {
    const originalTime = new Date(timestamp);
    setEditingLog({ type, id });
    setTimePickerValue(originalTime);
    selectedTimeRef.current = originalTime;
    baseDateRef.current = originalTime; // Store base date for time picker
    setTimePickerKey(k => k + 1); // Force fresh picker instance
    setTimeout(() => setShowTimePicker(true), 50);
  };

  const handleTimePickerChange = (_e: any, date?: Date) => {
    if (date) {
      // Store in ref to avoid re-render during scroll
      // Combine selected time with the base date (from ref, not state, to avoid stale reads)
      const newDateTime = new Date(baseDateRef.current);
      newDateTime.setHours(date.getHours(), date.getMinutes(), 0, 0);
      selectedTimeRef.current = newDateTime;
    }
  };

  const handleTimePickerDone = async () => {
    setShowTimePicker(false);
    const finalTime = selectedTimeRef.current.getTime();
    if (editingLog) {
      // Updating existing log
      if (editingLog.type === 'habit') {
        await updateLog(editingLog.id, { timestamp: finalTime });
      } else {
        await updateDoseLog(editingLog.id, { timestamp: finalTime });
      }
      setEditingLog(null);
      loadData();
    } else if (addingDose) {
      // Adding new dose
      await logDose(finalTime);
      setAddingDose(false);
      loadData();
    } else if (addingForHabit) {
      // Adding new habit log - show quantity modal
      setPendingAddTime(finalTime);
      setShowQuantityModal(true);
    }
  };

  const handleQuantityConfirm = async (quantity: number) => {
    setShowQuantityModal(false);
    if (addingForHabit && pendingAddTime !== null) {
      for (let i = 0; i < quantity; i++) {
        await logHabit(addingForHabit, pendingAddTime);
      }
      setAddingForHabit(null);
      setPendingAddTime(null);
      loadData();
    }
  };

  const handleQuantityCancel = () => {
    setShowQuantityModal(false);
    setAddingForHabit(null);
    setPendingAddTime(null);
  };

  const handleTimePickerCancel = () => {
    setShowTimePicker(false);
    setEditingLog(null);
    setAddingDose(false);
    setAddingForHabit(null);
  };

  // Delete handlers
  const handleDeleteLog = (type: 'habit' | 'dose', id: string) => {
    Alert.alert('Delete Entry', 'Are you sure you want to delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (type === 'habit') {
            await deleteLog(id);
          } else {
            await deleteDoseLog(id);
          }
          loadData();
        },
      },
    ]);
  };

  // Add handlers
  const handleAddHabitLog = (habitId: string) => {
    setAddingForHabit(habitId);
    // Set default time based on selected date
    const defaultTime = new Date(selectedDate);
    if (isToday()) {
      const now = new Date();
      defaultTime.setHours(now.getHours(), now.getMinutes(), 0, 0);
    } else {
      defaultTime.setHours(12, 0, 0, 0);
    }
    setTimePickerValue(defaultTime);
    selectedTimeRef.current = defaultTime;
    baseDateRef.current = defaultTime; // Store base date for time picker
    setTimePickerKey(k => k + 1); // Force fresh picker instance
    setTimeout(() => setShowTimePicker(true), 50);
  };

  const handleAddDose = () => {
    setAddingDose(true);
    const defaultTime = new Date(selectedDate);
    if (isToday()) {
      const now = new Date();
      defaultTime.setHours(now.getHours(), now.getMinutes(), 0, 0);
    } else {
      defaultTime.setHours(12, 0, 0, 0);
    }
    setTimePickerValue(defaultTime);
    selectedTimeRef.current = defaultTime;
    baseDateRef.current = defaultTime; // Store base date for time picker
    setTimePickerKey(k => k + 1); // Force fresh picker instance
    setTimeout(() => setShowTimePicker(true), 50);
  };

  // Group habit logs by habit
  const getLogsForHabit = (habitId: string) => {
    return habitLogs.filter(l => l.habitId === habitId);
  };

  return (
    <View style={styles.container}>
      {/* Date Navigation */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.arrowButton} onPress={goToPreviousDay}>
          <Text style={styles.arrowText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.arrowButton, isToday() && styles.arrowDisabled]}
          onPress={goToNextDay}
          disabled={isToday()}
        >
          <Text style={[styles.arrowText, isToday() && styles.arrowTextDisabled]}>→</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Medication Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Medication</Text>
          {doseLogs.length === 0 ? (
            <Text style={styles.emptyText}>No doses logged</Text>
          ) : (
            doseLogs.map(log => (
              <View key={log.id} style={styles.logRow}>
                <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
                <View style={styles.logActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleEditLog('dose', log.id, log.timestamp)}
                  >
                    <Text style={styles.actionText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeleteLog('dose', log.id)}
                  >
                    <Text style={styles.deleteText}>Del</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <TouchableOpacity style={styles.addButton} onPress={handleAddDose}>
            <Text style={styles.addButtonText}>+ Add dose</Text>
          </TouchableOpacity>
        </View>

        {/* Habits Sections */}
        {habits.map(habit => {
          const logs = getLogsForHabit(habit.id);
          return (
            <View key={habit.id} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{habit.name}</Text>
                <Text style={styles.totalCount}>Total: {logs.length}</Text>
              </View>
              {logs.length === 0 ? (
                <Text style={styles.emptyText}>No entries logged</Text>
              ) : (
                logs.map(log => (
                  <View key={log.id} style={styles.logRow}>
                    <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
                    <View style={styles.logActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleEditLog('habit', log.id, log.timestamp)}
                      >
                        <Text style={styles.actionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDeleteLog('habit', log.id)}
                      >
                        <Text style={styles.deleteText}>Del</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => handleAddHabitLog(habit.id)}
              >
                <Text style={styles.addButtonText}>+ Add entry</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {habits.length === 0 && (
          <Text style={styles.noHabitsText}>
            No habits created yet. Add habits from the Home screen.
          </Text>
        )}
      </ScrollView>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              maximumDate={new Date()}
              textColor="#fff"
              themeVariant="dark"
            />
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal visible={showTimePicker} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={handleTimePickerCancel}>
                <Text style={styles.pickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>
                {editingLog ? 'Edit Time' : 'Select Time'}
              </Text>
              <TouchableOpacity onPress={handleTimePickerDone}>
                <Text style={styles.pickerDone}>
                  {addingForHabit ? 'Next' : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              key={timePickerKey}
              value={timePickerValue}
              mode="time"
              display="spinner"
              onChange={handleTimePickerChange}
              textColor="#fff"
              themeVariant="dark"
            />
          </View>
        </View>
      </Modal>

      {/* Quantity Modal */}
      <QuantityModal
        visible={showQuantityModal}
        onConfirm={handleQuantityConfirm}
        onCancel={handleQuantityCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  arrowButton: {
    width: 44,
    height: 44,
    backgroundColor: '#16213e',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    opacity: 0.4,
  },
  arrowText: {
    fontSize: 24,
    color: '#fff',
  },
  arrowTextDisabled: {
    color: '#666',
  },
  dateButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#16213e',
    borderRadius: 8,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    backgroundColor: '#16213e',
    borderRadius: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  totalCount: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4a',
  },
  logTime: {
    fontSize: 16,
    color: '#fff',
  },
  logActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3d3d5c',
    borderRadius: 6,
  },
  actionText: {
    fontSize: 14,
    color: '#aaa',
  },
  deleteButton: {
    backgroundColor: '#4a2a2a',
  },
  deleteText: {
    fontSize: 14,
    color: '#e74c3c',
  },
  addButton: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#1a1a3e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4a69bd',
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 14,
    color: '#4a69bd',
    fontWeight: '500',
  },
  noHabitsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 32,
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
