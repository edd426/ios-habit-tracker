import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit } from '../types';
import { KEYS, ICLOUD_KEYS } from '../keys';
import { addHabit, updateHabit, deleteHabit, getHabits } from '../storage';

// mockPushCollectionToICloud is fire-and-forget background work. Mock so we can
// verify the storage layer calls it without depending on the iCloud module.
const mockPushCollectionToICloud = jest.fn(
  async (_localKey: string, _icloudKey: string): Promise<void> => {}
);
jest.mock('../sync', () => ({
  pushCollectionToICloud: (localKey: string, icloudKey: string) =>
    mockPushCollectionToICloud(localKey, icloudKey),
}));

describe('storage mutateCollection (via CRUD)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockPushCollectionToICloud.mockClear();
  });

  it('addHabit writes a new habit and queues iCloud push', async () => {
    const habit = await addHabit('Exercise', 'increase');
    expect(habit.id).toBeTruthy();

    const raw = await AsyncStorage.getItem(KEYS.HABITS);
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Exercise');

    // Wait a tick for the fire-and-forget push.
    await new Promise((r) => setImmediate(r));
    expect(mockPushCollectionToICloud).toHaveBeenCalledWith(KEYS.HABITS, ICLOUD_KEYS.HABITS);
  });

  it('updateHabit modifies in place and pushes', async () => {
    const habit = await addHabit('Old name', 'increase');
    mockPushCollectionToICloud.mockClear();

    await updateHabit(habit.id, { name: 'New name' });

    const habits = await getHabits();
    expect(habits[0].name).toBe('New name');
    expect(habits[0].updatedAt).toBeGreaterThanOrEqual(habit.createdAt);

    await new Promise((r) => setImmediate(r));
    expect(mockPushCollectionToICloud).toHaveBeenCalledWith(KEYS.HABITS, ICLOUD_KEYS.HABITS);
  });

  it('deleteHabit cascades to logs and pushes both collections', async () => {
    const habit = await addHabit('To delete', 'decrease');
    mockPushCollectionToICloud.mockClear();

    await deleteHabit(habit.id);

    expect(await getHabits()).toHaveLength(0);

    await new Promise((r) => setImmediate(r));
    // Two pushes: one for HABITS, one for HABIT_LOGS.
    const calls = mockPushCollectionToICloud.mock.calls.map((c) => c[0]);
    expect(calls).toContain(KEYS.HABITS);
    expect(calls).toContain(KEYS.HABIT_LOGS);
  });

  it('corrupt blob falls back to empty array via safeParse', async () => {
    await AsyncStorage.setItem(KEYS.HABITS, '{not json');

    const habit = await addHabit('Recovery', 'increase');

    // Should not throw and the new habit should be the only item.
    const habits = await getHabits();
    expect(habits).toHaveLength(1);
    expect(habits[0].id).toBe(habit.id);
  });

  it('background sync rejection is swallowed', async () => {
    mockPushCollectionToICloud.mockImplementationOnce(() => Promise.reject(new Error('iCloud boom')));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Should resolve cleanly even though the push fails.
    const habit = await addHabit('Survives sync failure', 'increase');
    expect(habit.id).toBeTruthy();

    // Give the rejection a tick to propagate to the .catch.
    await new Promise((r) => setImmediate(r));
    expect(warnSpy).toHaveBeenCalledWith('Background sync failed:', expect.any(Error));

    warnSpy.mockRestore();
  });
});
