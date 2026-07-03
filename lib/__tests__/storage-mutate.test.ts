import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit } from '../types';
import { KEYS, ICLOUD_KEYS } from '../keys';
import {
  addHabit,
  updateHabit,
  deleteHabit,
  getHabits,
  getHabitLogs,
  logHabit,
  logHabitBatch,
  deleteLog,
  removeLastTodayLog,
  logDose,
  getDoseLogs,
  updateDoseLog,
  deleteDoseLog,
} from '../storage';

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

  it('deleteHabit cascades to logs, tombstoning both, and pushes both collections', async () => {
    const habit = await addHabit('To delete', 'decrease');
    await logHabit(habit.id);
    mockPushCollectionToICloud.mockClear();

    await deleteHabit(habit.id);

    expect(await getHabits()).toHaveLength(0);
    expect(await getHabitLogs()).toHaveLength(0);

    // Soft deletes: the raw blobs keep tombstones so the deletion propagates
    // through iCloud merge instead of being resurrected by a stale remote copy.
    const rawHabits = JSON.parse((await AsyncStorage.getItem(KEYS.HABITS))!);
    const rawLogs = JSON.parse((await AsyncStorage.getItem(KEYS.HABIT_LOGS))!);
    expect(rawHabits).toHaveLength(1);
    expect(rawHabits[0].deleted).toBe(true);
    expect(rawLogs).toHaveLength(1);
    expect(rawLogs[0].deleted).toBe(true);
    expect(rawLogs[0].updatedAt).toBeGreaterThanOrEqual(habit.createdAt);

    await new Promise((r) => setImmediate(r));
    // Two pushes: one for HABITS, one for HABIT_LOGS.
    const calls = mockPushCollectionToICloud.mock.calls.map((c) => c[0]);
    expect(calls).toContain(KEYS.HABITS);
    expect(calls).toContain(KEYS.HABIT_LOGS);
  });

  it('deleteLog and removeLastTodayLog tombstone instead of removing', async () => {
    const habit = await addHabit('Drink', 'decrease');
    const first = await logHabit(habit.id);
    await logHabit(habit.id);

    await deleteLog(first.id);
    expect(await removeLastTodayLog(habit.id)).toBe(true);

    // Filtered accessor sees nothing...
    expect(await getHabitLogs()).toHaveLength(0);

    // ...but both records remain as tombstones in the raw blob.
    const raw = JSON.parse((await AsyncStorage.getItem(KEYS.HABIT_LOGS))!);
    expect(raw).toHaveLength(2);
    for (const log of raw) {
      expect(log.deleted).toBe(true);
      expect(log.updatedAt).toBeGreaterThanOrEqual(first.createdAt!);
    }
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

describe('concurrent mutations (write queue)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockPushCollectionToICloud.mockClear();
  });

  it('concurrent logHabit calls all persist (no lost updates)', async () => {
    // Regression: the home-screen quantity modal used to fire N unawaited
    // logHabit calls; each read the same base array and the last write won,
    // leaving a single log no matter the quantity chosen.
    const habit = await addHabit('Drink', 'decrease');
    const timestamp = Date.now();

    await Promise.all([
      logHabit(habit.id, timestamp),
      logHabit(habit.id, timestamp),
      logHabit(habit.id, timestamp),
      logHabit(habit.id, timestamp),
      logHabit(habit.id, timestamp),
    ]);

    expect(await getHabitLogs()).toHaveLength(5);
  });

  it('a failing mutation does not block later writes to the same key', async () => {
    const habit = await addHabit('Exercise', 'increase');

    // The jest mock's setItem is already a jest.fn; a once-implementation
    // falls back to the real mock behavior afterwards (no restore needed).
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('disk full'))
    );

    await expect(logHabit(habit.id)).rejects.toThrow('disk full');

    // The queue must recover: the next write for the same key goes through.
    const log = await logHabit(habit.id);
    expect(log.id).toBeTruthy();
    expect(await getHabitLogs()).toHaveLength(1);
  });

  it('logHabitBatch appends N logs in one write with unique ids', async () => {
    const habit = await addHabit('Reading', 'increase');
    mockPushCollectionToICloud.mockClear();
    const timestamp = Date.now() - 60_000;

    const logs = await logHabitBatch(habit.id, timestamp, 4);

    expect(logs).toHaveLength(4);
    expect(new Set(logs.map((l) => l.id)).size).toBe(4);
    expect(logs.every((l) => l.timestamp === timestamp)).toBe(true);

    const stored = await getHabitLogs();
    expect(stored).toHaveLength(4);

    // One collection write → one iCloud push for HABIT_LOGS.
    await new Promise((r) => setImmediate(r));
    const pushes = mockPushCollectionToICloud.mock.calls.filter(
      (c) => c[0] === KEYS.HABIT_LOGS
    );
    expect(pushes).toHaveLength(1);
  });
});

describe('dose logs (typed + soft delete)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockPushCollectionToICloud.mockClear();
  });

  it('logDose persists the kind and defaults to fast', async () => {
    const def = await logDose();
    expect(def.kind).toBe('fast');
    const slow = await logDose(Date.now(), 'slow');
    expect(slow.kind).toBe('slow');
    expect(await getDoseLogs()).toHaveLength(2);
  });

  it('deleteDoseLog soft-deletes (tombstone) and hides it from getDoseLogs', async () => {
    const dose = await logDose(Date.now(), 'fast');
    await deleteDoseLog(dose.id);

    // Filtered accessor no longer returns it...
    expect(await getDoseLogs()).toHaveLength(0);

    // ...but the raw blob keeps the tombstone for sync propagation.
    const raw = JSON.parse((await AsyncStorage.getItem(KEYS.DOSE_LOGS))!);
    expect(raw).toHaveLength(1);
    expect(raw[0].deleted).toBe(true);
    expect(raw[0].updatedAt).toBeGreaterThanOrEqual(dose.createdAt!);
  });

  it('updateDoseLog can change the kind', async () => {
    const dose = await logDose(Date.now(), 'fast');
    await updateDoseLog(dose.id, { kind: 'slow' });
    const [updated] = await getDoseLogs();
    expect(updated.kind).toBe('slow');
  });
});
