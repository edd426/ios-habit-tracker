import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getLastDose, logDose } from '@/lib/storage';
import { DoseLog } from '@/lib/types';
import {
  DoseKind,
  DOSE_PROTOCOLS,
  DEFAULT_DOSE_KIND,
  protocolFor,
  doseWindow,
  reminderDelaysSeconds,
} from '@/lib/dose-protocols';
import PickerSheet from './PickerSheet';

interface Props {
  onDoseLogged?: () => void;
}

// The non-default kind, for the "log the other one" link.
const SECONDARY_KIND: DoseKind = DEFAULT_DOSE_KIND === 'fast' ? 'slow' : 'fast';

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function DoseTimer({ onDoseLogged }: Props) {
  const [lastDose, setLastDose] = useState<DoseLog | null>(null);
  const [elapsed, setElapsed] = useState<string>('No dose logged');
  const [status, setStatus] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState(new Date());

  const loadLastDose = useCallback(async () => {
    setLastDose(await getLastDose());
  }, []);

  useEffect(() => {
    loadLastDose();
  }, [loadLastDose]);

  // Live elapsed time + protected-window status, refreshed each minute.
  useEffect(() => {
    if (!lastDose) {
      setElapsed('No dose logged');
      setStatus(null);
      return;
    }

    const protocol = protocolFor(lastDose);
    const { clearAt, stopBy } = doseWindow(lastDose);

    const tick = () => {
      const now = Date.now();
      const diff = now - lastDose.timestamp;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const ago = hours > 0 ? `${hours}h ${minutes}m ago` : `${minutes}m ago`;
      setElapsed(`${protocol.label} · ${ago}`);

      if (now < clearAt) {
        setStatus(`Wait — clear at ${formatClock(clearAt)}`);
      } else if (now <= stopBy) {
        setStatus(`Covered — stop by ${formatClock(stopBy)}`);
      } else {
        setStatus(`Window closed at ${formatClock(stopBy)}`);
      }
    };

    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [lastDose]);

  // Schedule the reminders whose milestones are still in the future, anchored
  // to the DOSE timestamp — so a back-dated dose ("Log earlier dose…") still
  // notifies at the true clear/stop-by times. Each is wrapped in its own
  // try/catch: a notification failure must never block dose logging, which
  // is the primary purpose of the app.
  const scheduleReminders = async (timestamp: number, kind: DoseKind) => {
    const { toClear, toStop } = reminderDelaysSeconds({ timestamp, kind }, Date.now());

    if (toClear !== null) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Dose active',
            body: "Protection is active — you're clear to proceed.",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: toClear,
          },
        });
      } catch (e) {
        console.warn('Failed to schedule lead-time reminder:', e);
      }
    }

    if (toStop !== null) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Window closing',
            body: 'Protection is wearing off — stop soon to stay covered.',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: toStop,
          },
        });
      } catch (e) {
        console.warn('Failed to schedule window-closing reminder:', e);
      }
    }
  };

  const saveDose = async (timestamp: number, kind: DoseKind) => {
    try {
      await logDose(timestamp, kind);
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

    await scheduleReminders(timestamp, kind);
  };

  // Earlier-dose flow: pick a time today, then choose which protocol it was.
  const confirmKindAndSave = (timestamp: number) => {
    Alert.alert(
      'Which dose?',
      `Log a dose at ${formatClock(timestamp)} today.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: DOSE_PROTOCOLS[DEFAULT_DOSE_KIND].label,
          onPress: () => saveDose(timestamp, DEFAULT_DOSE_KIND),
        },
        {
          text: DOSE_PROTOCOLS[SECONDARY_KIND].label,
          onPress: () => saveDose(timestamp, SECONDARY_KIND),
        },
      ]
    );
  };

  const handlePickerChange = (date: Date) => {
    setPickerValue(date);
  };

  const handlePickerDone = () => {
    setShowPicker(false);
    confirmKindAndSave(pickerValue.getTime());
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Last dose</Text>
      <Text style={styles.timer}>{elapsed}</Text>
      {status && <Text style={styles.status}>{status}</Text>}

      {/* Primary: log the default (1-hour) protocol now. */}
      <TouchableOpacity style={styles.button} onPress={() => saveDose(Date.now(), DEFAULT_DOSE_KIND)}>
        <Text style={styles.buttonText}>
          I took my {DOSE_PROTOCOLS[DEFAULT_DOSE_KIND].label} dose
        </Text>
      </TouchableOpacity>

      {/* Small link: the other protocol. */}
      <TouchableOpacity style={styles.linkButton} onPress={() => saveDose(Date.now(), SECONDARY_KIND)}>
        <Text style={styles.linkText}>Log {DOSE_PROTOCOLS[SECONDARY_KIND].label} dose instead</Text>
      </TouchableOpacity>

      {/* Small link: earlier dose today (kind chosen after picking the time). */}
      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => {
          setPickerValue(new Date());
          setShowPicker(true);
        }}
      >
        <Text style={styles.linkText}>Log earlier dose…</Text>
      </TouchableOpacity>

      <PickerSheet
        visible={showPicker}
        title="Select Time"
        doneLabel="Next"
        value={pickerValue}
        mode="time"
        maximumDate={new Date()}
        onChange={handlePickerChange}
        onDone={handlePickerDone}
        onCancel={() => setShowPicker(false)}
      />
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  status: {
    fontSize: 14,
    color: '#4a69bd',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#4a69bd',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 4,
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
    color: '#888',
    fontSize: 13,
  },
});
