import AsyncStorage from '@react-native-async-storage/async-storage';
import { HabitLog } from '../types';
import { KEYS, ICLOUD_KEYS } from '../keys';
import { gcCollection } from '../storage';

const mockPushCollectionToICloud = jest.fn(
  async (_localKey: string, _icloudKey: string): Promise<void> => {}
);
jest.mock('../sync', () => ({
  pushCollectionToICloud: (localKey: string, icloudKey: string) =>
    mockPushCollectionToICloud(localKey, icloudKey),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_30D = 30 * DAY_MS;

function seed(items: HabitLog[]) {
  return AsyncStorage.setItem(KEYS.HABIT_LOGS, JSON.stringify(items));
}

async function read(): Promise<HabitLog[]> {
  const raw = await AsyncStorage.getItem(KEYS.HABIT_LOGS);
  return JSON.parse(raw ?? '[]');
}

describe('gcCollection', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockPushCollectionToICloud.mockClear();
  });

  it('removes deleted records older than the grace window', async () => {
    const now = Date.now();
    await seed([
      { id: 'a', habitId: 'h', timestamp: 0, updatedAt: now - 31 * DAY_MS, deleted: true },
    ]);

    const result = await gcCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, GRACE_30D);
    expect(result.removed).toBe(1);
    expect(await read()).toHaveLength(0);
  });

  it('keeps deleted records still within the grace window', async () => {
    const now = Date.now();
    await seed([
      { id: 'a', habitId: 'h', timestamp: 0, updatedAt: now - 1 * DAY_MS, deleted: true },
    ]);

    const result = await gcCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, GRACE_30D);
    expect(result.removed).toBe(0);
    expect(await read()).toHaveLength(1);
  });

  it('preserves non-deleted records regardless of age', async () => {
    const now = Date.now();
    await seed([
      { id: 'a', habitId: 'h', timestamp: 0, updatedAt: now - 365 * DAY_MS },
    ]);

    const result = await gcCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, GRACE_30D);
    expect(result.removed).toBe(0);
    expect(await read()).toHaveLength(1);
  });

  it('uses createdAt fallback when updatedAt is missing', async () => {
    const now = Date.now();
    await seed([
      { id: 'a', habitId: 'h', timestamp: 0, createdAt: now - 31 * DAY_MS, deleted: true },
    ]);

    const result = await gcCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, GRACE_30D);
    expect(result.removed).toBe(1);
  });

  it('conservatively preserves deleted records with no timestamps', async () => {
    await seed([{ id: 'a', habitId: 'h', timestamp: 0, deleted: true }]);

    const result = await gcCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, GRACE_30D);
    // No timestamps → age = 0 → kept.
    expect(result.removed).toBe(0);
    expect(await read()).toHaveLength(1);
  });

  it('queues iCloud push after pruning', async () => {
    const now = Date.now();
    await seed([
      { id: 'a', habitId: 'h', timestamp: 0, updatedAt: now - 31 * DAY_MS, deleted: true },
    ]);

    await gcCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, GRACE_30D);

    await new Promise((r) => setImmediate(r));
    expect(mockPushCollectionToICloud).toHaveBeenCalledWith(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS);
  });

  it('handles a mixed batch correctly', async () => {
    const now = Date.now();
    await seed([
      { id: 'old-tombstone', habitId: 'h', timestamp: 0, updatedAt: now - 60 * DAY_MS, deleted: true },
      { id: 'recent-tombstone', habitId: 'h', timestamp: 0, updatedAt: now - 5 * DAY_MS, deleted: true },
      { id: 'alive', habitId: 'h', timestamp: 0, updatedAt: now - 100 * DAY_MS },
    ]);

    const result = await gcCollection<HabitLog>(KEYS.HABIT_LOGS, ICLOUD_KEYS.HABIT_LOGS, GRACE_30D);
    expect(result.removed).toBe(1);

    const ids = (await read()).map((r) => r.id).sort();
    expect(ids).toEqual(['alive', 'recent-tombstone']);
  });
});
