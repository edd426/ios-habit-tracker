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

import { getHabits, addHabit, updateHabit, deleteHabit } from '@/lib/storage';
import { Habit } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { SyncStatus } from '@/components/SyncStatus';

export default function SettingsScreen() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'increase' | 'decrease'>('decrease');

  const { userId, syncStatus, triggerSync } = useAuth();

  const loadHabits = useCallback(async () => {
    const h = await getHabits();
    setHabits(h);
  }, []);

  const copyUserId = async () => {
    if (userId) {
      await Clipboard.setStringAsync(userId);
      Alert.alert('Copied', 'User ID copied to clipboard');
    }
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
          <Text style={styles.syncHint}>
            Save your User ID to recover your data if you reinstall the app
          </Text>
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
});
