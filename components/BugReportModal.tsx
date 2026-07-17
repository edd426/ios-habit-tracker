import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
  StyleSheet,
} from 'react-native';
import Constants from 'expo-constants';
import { addBugReport } from '@/lib/storage';

interface Props {
  visible: boolean;
  /** Which screen the user was on when they tapped the bug button. */
  screen: string;
  onClose: () => void;
}

/**
 * Quick bug capture sheet, opened from the bug icon in any screen's header.
 * The screen name and app version are captured automatically so the report
 * only needs the one thing a human has to provide: what went wrong.
 */
export default function BugReportModal({ visible, screen, onClose }: Props) {
  const [text, setText] = useState('');

  const close = () => {
    Keyboard.dismiss();
    setText('');
    onClose();
  };

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      Alert.alert('Empty report', 'Describe the bug in a few words first.');
      return;
    }
    try {
      await addBugReport(trimmed, screen, Constants.expoConfig?.version ?? undefined);
      close();
    } catch (e) {
      Alert.alert('Could not save', 'Something went wrong saving the report. Please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        <TouchableWithoutFeedback onPress={close}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Report a Bug</Text>
          <Text style={styles.contextLine}>
            {screen} screen · v{Constants.expoConfig?.version ?? '?'} — captured automatically
          </Text>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="What went wrong? What did you expect?"
            placeholderTextColor="#666"
            autoFocus
            multiline
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={close}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: 4,
  },
  contextLine: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
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
    minHeight: 90,
    textAlignVertical: 'top',
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
});
