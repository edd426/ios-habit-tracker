import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
  signInAnonymously,
  getCurrentUser,
  onAuthStateChanged,
  getSavedUserId,
} from '@/lib/auth';
import { syncAllData, SyncStatus } from '@/lib/sync';

interface AuthContextType {
  user: FirebaseAuthTypes.User | null;
  userId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  syncStatus: SyncStatus;
  triggerSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // Initialize auth on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // User is signed in, trigger initial sync
        setSyncStatus('syncing');
        try {
          await syncAllData(firebaseUser.uid);
          setSyncStatus('synced');
        } catch (error) {
          console.error('Initial sync failed:', error);
          setSyncStatus('error');
        }
      }

      setIsLoading(false);
    });

    // Auto sign-in anonymously on app launch
    const initAuth = async () => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) {
          await signInAnonymously();
        }
      } catch (error) {
        console.error('Auto sign-in failed:', error);
        setIsLoading(false);
      }
    };

    initAuth();

    return unsubscribe;
  }, []);

  const triggerSync = useCallback(async () => {
    if (!user) return;

    setSyncStatus('syncing');
    try {
      await syncAllData(user.uid);
      setSyncStatus('synced');
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncStatus('error');
    }
  }, [user]);

  const value: AuthContextType = {
    user,
    userId: user?.uid ?? null,
    isLoading,
    isAuthenticated: !!user,
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
