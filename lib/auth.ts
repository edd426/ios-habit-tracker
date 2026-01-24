import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_ID_KEY = 'firebase_user_id';

/**
 * Sign in anonymously. Creates a new anonymous account if none exists.
 * Returns the user object on success.
 */
export async function signInAnonymously(): Promise<FirebaseAuthTypes.User> {
  const currentUser = auth().currentUser;

  if (currentUser) {
    // Already signed in
    await saveUserId(currentUser.uid);
    return currentUser;
  }

  // Sign in anonymously
  const userCredential = await auth().signInAnonymously();
  await saveUserId(userCredential.user.uid);
  return userCredential.user;
}

/**
 * Get the current user's UID, or null if not signed in.
 */
export function getCurrentUserId(): string | null {
  return auth().currentUser?.uid ?? null;
}

/**
 * Get the current user object.
 */
export function getCurrentUser(): FirebaseAuthTypes.User | null {
  return auth().currentUser;
}

/**
 * Subscribe to auth state changes.
 */
export function onAuthStateChanged(
  callback: (user: FirebaseAuthTypes.User | null) => void
): () => void {
  return auth().onAuthStateChanged(callback);
}

/**
 * Save user ID to AsyncStorage for recovery purposes.
 * This allows the user to see their ID in Settings if they need to recover their account.
 */
async function saveUserId(uid: string): Promise<void> {
  await AsyncStorage.setItem(USER_ID_KEY, uid);
}

/**
 * Get the saved user ID from AsyncStorage.
 * Useful for displaying in Settings for recovery purposes.
 */
export async function getSavedUserId(): Promise<string | null> {
  return AsyncStorage.getItem(USER_ID_KEY);
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  await auth().signOut();
}
