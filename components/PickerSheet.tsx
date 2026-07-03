import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Props {
  visible: boolean;
  title: string;
  doneLabel?: string;
  value: Date;
  mode: 'date' | 'time';
  maximumDate?: Date;
  onChange: (date: Date) => void;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Shared date/time picker sheet. Encapsulates the hardened iOS pattern: the
 * native wheels mount only after the modal has fully presented (onShow), inside
 * a fixed-height slot. Mounting UIDatePicker wheels mid-presentation is what
 * occasionally left them stuck at their unapplied default — epoch, i.e. 1:00 AM
 * local time. The DateTimePicker is a CONTROLLED component: `value` comes from
 * props and every change flows back out via onChange.
 */
export default function PickerSheet({
  visible,
  title,
  doneLabel = 'Done',
  value,
  mode,
  maximumDate,
  onChange,
  onDone,
  onCancel,
}: Props) {
  // The native picker mounts only after the modal has fully presented (onShow).
  // Reset to false whenever the sheet closes so reopening re-gates the mount.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!visible) setReady(false);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onShow={() => setReady(true)}
    >
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>{title}</Text>
            <TouchableOpacity onPress={onDone}>
              <Text style={styles.pickerDone}>{doneLabel}</Text>
            </TouchableOpacity>
          </View>
          {/* Fixed-height slot so the modal doesn't resize when the picker
              mounts after the modal finishes presenting. */}
          <View style={styles.pickerSlot}>
            {ready && (
              <DateTimePicker
                value={value}
                mode={mode}
                display="spinner"
                onChange={(_event, date) => {
                  if (date) onChange(date);
                }}
                maximumDate={maximumDate}
                textColor="#fff"
                themeVariant="dark"
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  pickerSlot: {
    // Standard UIDatePicker wheels height; reserves space while the picker
    // waits for the modal's onShow before mounting.
    minHeight: 216,
    justifyContent: 'center',
  },
});
