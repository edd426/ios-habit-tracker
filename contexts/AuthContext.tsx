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

// Minimum gap between foreground-triggered syncs. Rapid background/foreground
// cycles otherwise stack up native bridge work on the JS thread and risk the
// "TurboModuleManager: Timed out waiting for modules to be invalidated" crash.
const FOREGROUND_SYNC_THROTTLE_MS = 10_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const appState = useRef(AppState.currentState);
  const lastForegroundSyncRef = useRef<number>(0);
  const syncBusyRef = useRef(false);

  // Initialize local identity on mount. This is FAST (single AsyncStorage read)
  // so we await it. iCloud setup and the initial sync are then kicked off in
  // the background — they MUST NOT block setIsLoading(false), or a slow iCloud
  // hangs the splash screen and the user thinks the app is broken.
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const id = await initializeUser();
        if (cancelled) return;
        setUserId(id);

        // Release the UI immediately. Everything below runs in the background.
        setIsLoading(false);

        // Fire-and-forget iCloud setup + initial sync.
        (async () => {
          try {
            const icloudAvailable = await setupICloudSync();
            if (cancelled) return;

            if (!icloudAvailable) {
              setSyncStatus('unavailable');
              return;
            }

            if (syncBusyRef.current) return;
            syncBusyRef.current = true;
            setSyncStatus('syncing');
            try {
              await syncAllData(id);
              if (!cancelled) {
                setSyncStatus('synced');
                lastForegroundSyncRef.current = Date.now();
              }
            } catch (error) {
              console.error('Initial sync failed:', error);
              if (!cancelled) setSyncStatus('error');
            } finally {
              syncBusyRef.current = false;
            }
          } catch (error) {
            console.error('iCloud setup failed:', error);
            if (!cancelled) setSyncStatus('error');
          }
        })();
      } catch (error) {
        console.error('Failed to initialize user:', error);
        if (!cancelled) {
          setSyncStatus('error');
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync when app comes to foreground. Guards:
  //   1. Reentrancy guard (syncBusyRef) — one sync at a time.
  //   2. Throttle — at most one sync per FOREGROUND_SYNC_THROTTLE_MS.
  // Without these, fast app-switching could pile up syncs and exhaust the
  // JS thread, triggering iOS's TurboModule invalidation watchdog.
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const previous = appState.current;
      appState.current = nextAppState;

      const cameToForeground =
        previous.match(/inactive|background/) && nextAppState === 'active';
      if (!cameToForeground) return;

      const currentUserId = getCurrentUserId();
      if (!currentUserId || !isICloudSyncAvailable()) return;
      if (syncBusyRef.current) return;
      if (Date.now() - lastForegroundSyncRef.current < FOREGROUND_SYNC_THROTTLE_MS) return;

      syncBusyRef.current = true;
      lastForegroundSyncRef.current = Date.now();
      setSyncStatus('syncing');
      try {
        await syncAllData(currentUserId);
        setSyncStatus('synced');
      } catch (error) {
        console.error('Foreground sync failed:', error);
        setSyncStatus('error');
      } finally {
        syncBusyRef.current = false;
      }
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

    if (syncBusyRef.current) return;
    syncBusyRef.current = true;
    setSyncStatus('syncing');
    try {
      await syncAllData(currentUserId);
      setSyncStatus('synced');
      lastForegroundSyncRef.current = Date.now();
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncStatus('error');
    } finally {
      syncBusyRef.current = false;
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
