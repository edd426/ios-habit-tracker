import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput } from 'react-native';

interface Props {
  visible: boolean;
  title?: string;
  initialValue?: number;
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}

export default function QuantityModal({
  visible,
  title = 'Quantity',
  initialValue = 1,
  onConfirm,
  onCancel
}: Props) {
  const [value, setValue] = useState(initialValue.toString());

  useEffect(() => {
    if (visible) {
      setValue(initialValue.toString());
    }
  }, [visible, initialValue]);

  const handleIncrement = () => {
    const num = parseInt(value || '0', 10);
    if (num < 100) {
      setValue((num + 1).toString());
    }
  };

  const handleDecrement = () => {
    const num = parseInt(value || '0', 10);
    if (num > 1) {
      setValue((num - 1).toString());
    }
  };

  const handleConfirm = () => {
    const qty = parseInt(value || '1', 10);
    if (qty > 0 && qty <= 100) {
      onConfirm(qty);
    } else {
      onConfirm(1);
    }
  };

  const handleTextChange = (text: string) => {
    // Only allow numeric input
    const numeric = text.replace(/[^0-9]/g, '');
    setValue(numeric);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.button} onPress={handleDecrement}>
              <Text style={styles.buttonText}>-</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              value={value}
              onChangeText={handleTextChange}
              keyboardType="number-pad"
              selectTextOnFocus
              maxLength={3}
            />

            <TouchableOpacity style={styles.button} onPress={handleIncrement}>
              <Text style={styles.buttonText}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  button: {
    width: 48,
    height: 48,
    backgroundColor: '#4a69bd',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '600',
    marginTop: -2,
  },
  input: {
    width: 80,
    height: 56,
    backgroundColor: '#16213e',
    borderRadius: 12,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#3d3d5c',
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#4a69bd',
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
