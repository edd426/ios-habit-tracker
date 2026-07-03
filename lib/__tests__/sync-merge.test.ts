// Stub the iCloud module so importing sync.ts never reaches native code.
jest.mock('../icloud', () => ({
  initializeICloud: jest.fn(),
  isICloudAvailable: jest.fn(() => false),
  getICloudItem: jest.fn(),
  setICloudItem: jest.fn(),
}));

import { mergeData } from '../sync';
import { DoseLog } from '../types';

const dose = (
  id: string,
  ts: number,
  updatedAt: number,
  extra: Partial<DoseLog> = {}
): DoseLog => ({ id, timestamp: ts, createdAt: ts, updatedAt, ...extra });

describe('mergeData (last-write-wins)', () => {
  it('keeps the item with the newer updatedAt (remote newer)', () => {
    const merged = mergeData(
      [dose('a', 1, 100, { kind: 'slow' })],
      [dose('a', 1, 200, { kind: 'fast' })]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].updatedAt).toBe(200);
    expect(merged[0].kind).toBe('fast');
  });

  it('keeps local when local is newer', () => {
    const merged = mergeData(
      [dose('a', 1, 300, { kind: 'fast' })],
      [dose('a', 1, 200, { kind: 'slow' })]
    );
    expect(merged[0].kind).toBe('fast');
  });

  it('on a tie, local wins (comparison is strict >)', () => {
    const merged = mergeData(
      [dose('a', 1, 200, { kind: 'fast' })],
      [dose('a', 1, 200, { kind: 'slow' })]
    );
    expect(merged[0].kind).toBe('fast');
  });

  it('adds remote-only items', () => {
    const merged = mergeData([dose('a', 1, 100)], [dose('b', 2, 100)]);
    expect(merged.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('falls back to createdAt when updatedAt is missing', () => {
    const local: DoseLog[] = [{ id: 'a', timestamp: 1, createdAt: 100 }];
    const remote: DoseLog[] = [{ id: 'a', timestamp: 1, createdAt: 200 }];
    const merged = mergeData(local, remote);
    expect(merged[0].createdAt).toBe(200); // remote createdAt newer → remote wins
  });

  it('a newer tombstone wins, so deletes propagate', () => {
    const merged = mergeData(
      [dose('a', 1, 100)],
      [dose('a', 1, 200, { deleted: true })]
    );
    expect(merged[0].deleted).toBe(true);
  });

  it('a back-filled kind survives a same-updatedAt un-kinded remote (migration safety)', () => {
    // Local was back-filled (kind set, updatedAt unchanged); remote still lacks kind.
    const local = [dose('a', 1, 100, { kind: 'fast' })];
    const remote: DoseLog[] = [{ id: 'a', timestamp: 1, createdAt: 1, updatedAt: 100 }];
    const merged = mergeData(local, remote);
    expect(merged[0].kind).toBe('fast'); // tie → local kept
  });
});
