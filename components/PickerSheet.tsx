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
 * Stand-in for "no upper bound". Every sheet sends a concrete maximumDate so
 * the native prop never goes from set to absent.
 *
 * Why: under the New Architecture, datetimepicker 8.4.4 recycles its native
 * view and diffs incoming props against the PREVIOUS owner's props. An absent
 * maximumDate reaches native as 0, which 8.4.4 applies as
 * `maximumDate = epoch` (1970-01-01 01:00 in Budapest). So opening a time
 * picker with no max, after any picker that had one (History's date picker,
 * the Home backdate pickers), clamped the wheels to 1:00 AM and snapped every
 * spin back there until an app restart emptied the recycle pool. 8.5.1 fixes
 * this natively; this guard keeps it fixed if the library is ever downgraded
 * (e.g. by `expo install --fix`, since Expo SDK 54 pins 8.4.4).
 */
export const NO_MAX_DATE = new Date(2100, 0, 1);

/**
 * Shared date/time picker sheet. The native wheels mount only after the modal
 * has fully presented (onShow), inside a fixed-height slot so the sheet
 * doesn't resize. The DateTimePicker is a CONTROLLED component: `value` comes
 * from props and every change flows back out via onChange.
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
                maximumDate={maximumDate ?? NO_MAX_DATE}
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
