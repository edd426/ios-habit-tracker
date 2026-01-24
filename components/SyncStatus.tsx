import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SyncStatus as SyncStatusType } from '@/lib/sync';

interface SyncStatusProps {
  status: SyncStatusType;
  onPress?: () => void;
}

export function SyncStatus({ status, onPress }: SyncStatusProps) {
  const getStatusInfo = () => {
    switch (status) {
      case 'syncing':
        return {
          icon: null,
          text: 'Syncing...',
          color: '#4a69bd',
          showSpinner: true,
        };
      case 'synced':
        return {
          icon: 'cloud' as const,
          text: 'Synced',
          color: '#2ecc71',
          showSpinner: false,
        };
      case 'error':
        return {
          icon: 'exclamation-circle' as const,
          text: 'Sync failed',
          color: '#e74c3c',
          showSpinner: false,
        };
      default:
        return {
          icon: 'cloud-upload' as const,
          text: 'Tap to sync',
          color: '#888',
          showSpinner: false,
        };
    }
  };

  const { icon, text, color, showSpinner } = getStatusInfo();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      disabled={status === 'syncing'}
    >
      {showSpinner ? (
        <ActivityIndicator size="small" color={color} />
      ) : icon ? (
        <FontAwesome name={icon} size={16} color={color} />
      ) : null}
      <Text style={[styles.text, { color }]}>{text}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#16213e',
    borderRadius: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
});
