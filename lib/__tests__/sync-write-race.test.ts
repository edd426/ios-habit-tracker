import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncAllData } from '../sync';
import { logHabit, getHabitLogs } from '../storage';

// Controllable iCloud mock: reports "available", but remote reads stay pending
// until the test releases them — letting us interleave a local write while a
// sync is mid-flight. (sync-merge.test.ts mocks iCloud as unavailable and only
// covers the pure merge; this file covers the sync/write serialization.)
const mockPendingRemoteReads: Array<(value: string | null) => void> = [];
jest.mock('../icloud', () => ({
  initializeICloud: jest.fn(async () => true),
  isICloudAvailable: jest.fn(() => true),
  getICloudItem: jest.fn(
    () =>
      new Promise<string | null>((resolve) => {
        mockPendingRemoteReads.push(resolve);
      })
  ),
  setICloudItem: jest.fn(async () => true),
}));

describe('sync/write serialization', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockPendingRemoteReads.length = 0;
  });

  it('a habit logged while a sync is in flight is not erased by the merge write', async () => {
    // Start a sync; all three collections read local state, then block on
    // their (mocked) remote reads.
    const syncPromise = syncAllData('user-1');
    await new Promise((r) => setImmediate(r));
    expect(mockPendingRemoteReads).toHaveLength(3);

    // A local write lands mid-sync. Without per-key serialization, the sync's
    // merged write-back (computed from the PRE-write local read) would erase it.
    const logPromise = logHabit('habit-x');
    await new Promise((r) => setImmediate(r));

    // Release the (empty) remote reads and let everything settle.
    mockPendingRemoteReads.forEach((resolve) => resolve(null));
    await syncPromise;
    await logPromise;

    expect(await getHabitLogs()).toHaveLength(1);
  });
});
