import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_ID_KEY = 'device_user_id';

// In-memory cache for the user ID (set after initialization)
let cachedUserId: string | null = null;

/**
 * Generate a unique user ID using crypto.randomUUID or fallback.
 */
function generateUserId(): string {
  // Use crypto.randomUUID if available (React Native 0.64+)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: generate UUID v4 manually
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Initialize the local user identity.
 * Creates a new UUID if none exists, otherwise loads the existing one.
 * Returns the user ID.
 */
export async function initializeUser(): Promise<string> {
  // Check if we already have a user ID stored
  let userId = await AsyncStorage.getItem(USER_ID_KEY);

  if (!userId) {
    // Generate a new user ID
    userId = generateUserId();
    await AsyncStorage.setItem(USER_ID_KEY, userId);
  }

  // Cache it for synchronous access
  cachedUserId = userId;
  return userId;
}

/**
 * Get the current user's ID, or null if not initialized.
 * This is synchronous and returns the cached value.
 */
export function getCurrentUserId(): string | null {
  return cachedUserId;
}

/**
 * Get the saved user ID from AsyncStorage.
 * Useful for displaying in Settings.
 */
export async function getSavedUserId(): Promise<string | null> {
  return AsyncStorage.getItem(USER_ID_KEY);
}

/**
 * Check if the user has been initialized.
 */
export function isInitialized(): boolean {
  return cachedUserId !== null;
}
