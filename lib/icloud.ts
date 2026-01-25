import { Platform } from 'react-native';

// Type for the iCloud storage module
interface ICloudStorageModule {
  set(key: string, value: string): void;
  getString(key: string): string | null;
  remove(key: string): void;
  getAllKeys(): string[];
}

let iCloudStorage: ICloudStorageModule | null = null;

/**
 * Initialize iCloud storage. Must be called before using other iCloud functions.
 * Returns true if iCloud is available and initialized successfully.
 */
export async function initializeICloud(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    console.log('iCloud not available: not running on iOS');
    return false;
  }

  try {
    const module = await import('expo-icloud-storage');
    iCloudStorage = module.default;
    console.log('iCloud storage initialized successfully');
    return true;
  } catch (error) {
    console.warn('Failed to initialize iCloud storage:', error);
    return false;
  }
}

/**
 * Check if iCloud storage is available and initialized.
 */
export function isICloudAvailable(): boolean {
  return iCloudStorage !== null;
}

/**
 * Get an item from iCloud key-value storage.
 * Returns null if iCloud is unavailable or if the key doesn't exist.
 */
export async function getICloudItem(key: string): Promise<string | null> {
  if (!iCloudStorage) return null;

  try {
    const value = iCloudStorage.getString(key);
    return value;
  } catch (error) {
    console.warn(`Failed to get iCloud item "${key}":`, error);
    return null;
  }
}

/**
 * Set an item in iCloud key-value storage.
 * Returns true if successful, false otherwise.
 */
export async function setICloudItem(key: string, value: string): Promise<boolean> {
  if (!iCloudStorage) return false;

  try {
    iCloudStorage.set(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to set iCloud item "${key}":`, error);
    return false;
  }
}

/**
 * Remove an item from iCloud key-value storage.
 * Returns true if successful, false otherwise.
 */
export async function removeICloudItem(key: string): Promise<boolean> {
  if (!iCloudStorage) return false;

  try {
    iCloudStorage.remove(key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove iCloud item "${key}":`, error);
    return false;
  }
}

/**
 * Get all keys from iCloud key-value storage.
 * Returns an empty array if iCloud is unavailable.
 */
export async function getAllICloudKeys(): Promise<string[]> {
  if (!iCloudStorage) return [];

  try {
    const keys = iCloudStorage.getAllKeys();
    return keys;
  } catch (error) {
    console.warn('Failed to get all iCloud keys:', error);
    return [];
  }
}
