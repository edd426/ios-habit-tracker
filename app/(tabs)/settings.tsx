import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';

import {
  getHabits,
  addHabit,
  updateHabit,
  deleteHabit,
  buildExportPayload,
  getSyncDataSize,
  getOpenBugReports,
  resolveBugReport,
  formatBugReports,
  ICLOUD_KV_LIMIT_BYTES,
} from '@/lib/storage';
import { Habit, BugReport } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { SyncStatus } from '@/components/SyncStatus';

export default function SettingsScreen() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'increase' | 'decrease'>('decrease');
  const [syncBytes, setSyncBytes] = useState<number | null>(null);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);

  const { userId, syncStatus, triggerSync } = useAuth();

  const loadHabits = useCallback(async () => {
    const [h, size, bugs] = await Promise.all([
      getHabits(),
      getSyncDataSize(),
      getOpenBugReports(),
    ]);
    setHabits(h);
    setSyncBytes(size.totalBytes);
    setBugReports(bugs);
  }, []);

  const copyUserId = async () => {
    if (userId) {
      await Clipboard.setStringAsync(userId);
      Alert.alert('Copied', 'User ID copied to clipboard');
    }
  };

  const handleExport = async () => {
    try {
      const payload = await buildExportPayload();
      const json = JSON.stringify(payload, null, 2);
      await Clipboard.setStringAsync(json);
      const bytes = json.length;
      const kb = (bytes / 1024).toFixed(1);
      Alert.alert(
        'Exported',
        `Copied ${kb} KB to clipboard.\n\n` +
          `Habits: ${payload.habits.length}\n` +
          `Habit logs: ${payload.habitLogs.length}\n` +
          `Dose logs: ${payload.doseLogs.length}`
      );
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  };

  const handleExportBugs = async () => {
    try {
      const text = formatBugReports(bugReports);
      await Clipboard.setStringAsync(text);
      Alert.alert(
        'Copied',
        bugReports.length === 0
          ? 'No open bug reports.'
          : `${bugReports.length} open bug report${bugReports.length === 1 ? '' : 's'} copied to clipboard.`
      );
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  };

  const handleResolveBug = (bug: BugReport) => {
    Alert.alert('Resolve bug?', 'Mark this report as fixed. It will drop out of the bug export.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve',
        onPress: async () => {
          await resolveBugReport(bug.id);
          loadHabits();
        },
      },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      loadHabits();
    }, [loadHabits])
  );

  const openAddModal = () => {
    setEditingHabit(null);
    setName('');
    setType('decrease');
    setModalVisible(true);
  };

  const openEditModal = (habit: Habit) => {
    setEditingHabit(habit);
    setName(habit.name);
    setType(habit.type);
    setModalVisible(true);
  };

  const closeModal = () => {
    Keyboard.dismiss();
    setModalVisible(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    if (editingHabit) {
      await updateHabit(editingHabit.id, { name: name.trim(), type });
    } else {
      await addHabit(name.trim(), type);
    }

    closeModal();
    loadHabits();
  };

  const handleDelete = (habit: Habit) => {
    Alert.alert(
      'Delete Habit',
      `Delete "${habit.name}"? This will also delete all logged data for this habit.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteHabit(habit.id);
            loadHabits();
          },
        },
      ]
    );
  };

  // Sync-size gauge. Past ICLOUD_KV_LIMIT_BYTES the KV store fails silently, so
  // warn well before the ceiling: amber at ~70%, red at ~90%.
  const kb = (bytes: number) => Math.round(bytes / 1024).toLocaleString();
  const syncSizeText =
    syncBytes === null
      ? '…'
      : `${kb(syncBytes)} KB of ${kb(ICLOUD_KV_LIMIT_BYTES)} KB`;
  const syncSizeColor =
    syncBytes === null
      ? '#fff'
      : syncBytes >= 900 * 1024
        ? '#e74c3c'
        : syncBytes >= 700 * 1024
          ? '#f39c12'
          : '#fff';

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cloud Sync</Text>
          <View style={styles.syncRow}>
            <View style={styles.syncInfo}>
              <Text style={styles.syncLabel}>Status</Text>
              <SyncStatus status={syncStatus} onPress={triggerSync} />
            </View>
          </View>
          {userId && (
            <TouchableOpacity style={styles.userIdRow} onPress={copyUserId}>
              <View style={styles.userIdInfo}>
                <Text style={styles.userIdLabel}>User ID</Text>
                <Text style={styles.userIdValue} numberOfLines={1}>{userId}</Text>
              </View>
              <FontAwesome name="copy" size={16} color="#888" />
            </TouchableOpacity>
          )}
          <View style={styles.syncSizeRow}>
            <View style={styles.syncSizeInfo}>
              <Text style={styles.syncSizeLabel}>Sync data size</Text>
              <Text style={[styles.syncSizeValue, { color: syncSizeColor }]}>
                {syncSizeText}
              </Text>
              <Text style={styles.syncSizeHint}>
                iCloud sync stops silently past 1 MB — archive old logs before then
              </Text>
            </View>
          </View>
          <Text style={styles.syncHint}>
            Save your User ID to recover your data if you reinstall the app
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Export</Text>
          <TouchableOpacity style={styles.exportRow} onPress={handleExport}>
            <View style={styles.exportInfo}>
              <Text style={styles.exportLabel}>Copy all data to clipboard</Text>
              <Text style={styles.exportHint}>
                JSON snapshot of habits, habit logs, and dose logs
              </Text>
            </View>
            <FontAwesome name="copy" size={18} color="#888" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bug Reports</Text>
          {bugReports.length === 0 ? (
            <Text style={styles.bugEmptyText}>
              No open bugs. Tap the bug icon in any screen's header to report one.
            </Text>
          ) : (
            <>
              {bugReports.map((bug) => (
                <View key={bug.id} style={styles.bugRow}>
                  <View style={styles.bugInfo}>
                    <Text style={styles.bugText}>{bug.text}</Text>
                    <Text style={styles.bugMeta}>
                      {bug.createdAt ? new Date(bug.createdAt).toLocaleString() : ''}
                      {bug.screen ? ` · ${bug.screen}` : ''}
                      {bug.appVersion ? ` · v${bug.appVersion}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.resolveButton}
                    onPress={() => handleResolveBug(bug)}
                    accessibilityLabel="Mark bug resolved"
                  >
                    <FontAwesome name="check" size={18} color="#2ecc71" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.exportRow} onPress={handleExportBugs}>
                <View style={styles.exportInfo}>
                  <Text style={styles.exportLabel}>Copy open bugs to clipboard</Text>
                  <Text style={styles.exportHint}>
                    Readable list for the next dev session — resolved bugs are excluded
                  </Text>
                </View>
                <FontAwesome name="copy" size={18} color="#888" />
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Habits</Text>
          {habits.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No habits yet</Text>
              <Text style={styles.emptySubtext}>Tap + to add your first habit</Text>
            </View>
          ) : (
            habits.map(habit => (
              <View key={habit.id} style={styles.habitRow}>
                <TouchableOpacity style={styles.habitInfo} onPress={() => openEditModal(habit)}>
                  <Text style={styles.habitName}>{habit.name}</Text>
                  <Text style={[styles.habitType, habit.type === 'decrease' ? styles.decrease : styles.increase]}>
                    {habit.type === 'decrease' ? 'to reduce' : 'to increase'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(habit)}>
                  <FontAwesome name="trash" size={18} color="#e74c3c" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Build</Text>
            <Text style={styles.aboutValue}>
              v{Constants.expoConfig?.version ?? '?'}{' '}
              <Text style={Constants.debugMode ? styles.debugBadge : styles.releaseBadge}>
                {Constants.debugMode ? '(Debug)' : '(Release)'}
              </Text>
            </Text>
          </View>
          <View style={[styles.aboutRow, styles.aboutRowSpacing]}>
            <Text style={styles.aboutLabel}>Built</Text>
            <Text style={styles.aboutValue}>
              {Constants.expoConfig?.extra?.buildDate
                ? new Date(Constants.expoConfig.extra.buildDate as string).toLocaleString()
                : 'unknown'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <FontAwesome name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <TouchableWithoutFeedback onPress={closeModal}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>

          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>{editingHabit ? 'Edit Habit' : 'Add Habit'}</Text>

              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter habit name"
                placeholderTextColor="#666"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <Text style={styles.inputLabel}>Type</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'decrease' && styles.typeButtonActive]}
                  onPress={() => setType('decrease')}
                >
                  <Text style={[styles.typeButtonText, type === 'decrease' && styles.typeButtonTextActive]}>
                    To Reduce
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, type === 'increase' && styles.typeButtonActiveGreen]}
                  onPress={() => setType('increase')}
                >
                  <Text style={[styles.typeButtonText, type === 'increase' && styles.typeButtonTextActive]}>
                    To Increase
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#888',
    marginBottom: 16,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  habitInfo: {
    flex: 1,
    padding: 16,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  habitType: {
    fontSize: 12,
    marginTop: 2,
  },
  decrease: {
    color: '#e74c3c',
  },
  increase: {
    color: '#2ecc71',
  },
  deleteButton: {
    padding: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4a69bd',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#444',
    marginTop: 4,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#16213e',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#e74c3c',
  },
  typeButtonActiveGreen: {
    backgroundColor: '#2ecc71',
  },
  typeButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#16213e',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#4a69bd',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  syncRow: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  syncInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  syncLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  userIdRow: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userIdInfo: {
    flex: 1,
    marginRight: 12,
  },
  userIdLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  userIdValue: {
    fontSize: 12,
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  syncHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  syncSizeRow: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncSizeInfo: {
    flex: 1,
  },
  syncSizeLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  syncSizeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  syncSizeHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  exportRow: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exportInfo: {
    flex: 1,
    marginRight: 12,
  },
  exportLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  exportHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  bugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  bugInfo: {
    flex: 1,
    padding: 16,
  },
  bugText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  bugMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  resolveButton: {
    padding: 16,
  },
  bugEmptyText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  aboutRow: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aboutLabel: {
    fontSize: 14,
    color: '#888',
  },
  aboutValue: {
    fontSize: 14,
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  aboutRowSpacing: {
    marginTop: 8,
  },
  debugBadge: {
    color: '#e74c3c',
    fontWeight: '700',
  },
  releaseBadge: {
    color: '#2ecc71',
  },
});
