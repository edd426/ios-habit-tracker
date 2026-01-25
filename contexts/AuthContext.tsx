import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { initializeUser, getCurrentUserId } from '@/lib/auth';
import { syncAllData, setupICloudSync, isICloudSyncAvailable, SyncStatus } from '@/lib/sync';

interface AuthContextType {
  userId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  syncStatus: SyncStatus;
  triggerSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const appState = useRef(AppState.currentState);

  // Initialize local identity and iCloud on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize local user identity
        const id = await initializeUser();
        setUserId(id);

        // Initialize iCloud sync
        const icloudAvailable = await setupICloudSync();

        if (!icloudAvailable) {
          // iCloud not available - set status and continue
          setSyncStatus('unavailable');
          setIsLoading(false);
          return;
        }

        // Trigger initial sync
        setSyncStatus('syncing');
        try {
          await syncAllData(id);
          setSyncStatus('synced');
        } catch (error) {
          console.error('Initial sync failed:', error);
          setSyncStatus('error');
        }
      } catch (error) {
        console.error('Failed to initialize user:', error);
        setSyncStatus('error');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // Sync when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      // App is coming to foreground
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        const currentUserId = getCurrentUserId();
        if (currentUserId && isICloudSyncAvailable()) {
          setSyncStatus('syncing');
          try {
            await syncAllData(currentUserId);
            setSyncStatus('synced');
          } catch (error) {
            console.error('Foreground sync failed:', error);
            setSyncStatus('error');
          }
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  const triggerSync = useCallback(async () => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;

    if (!isICloudSyncAvailable()) {
      setSyncStatus('unavailable');
      return;
    }

    setSyncStatus('syncing');
    try {
      await syncAllData(currentUserId);
      setSyncStatus('synced');
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncStatus('error');
    }
  }, []);

  const value: AuthContextType = {
    userId,
    isLoading,
    isAuthenticated: !!userId,
    syncStatus,
    triggerSync,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
