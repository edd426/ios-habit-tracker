import { safeParse } from '../safe-json';

describe('safeParse', () => {
  it('returns fallback for null', () => {
    expect(safeParse<number[]>(null, [])).toEqual([]);
  });

  it('returns fallback for undefined', () => {
    expect(safeParse<number[]>(undefined, [])).toEqual([]);
  });

  it('returns fallback for empty string', () => {
    expect(safeParse<number[]>('', [])).toEqual([]);
  });

  it('parses valid JSON arrays', () => {
    expect(safeParse<number[]>('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it('parses valid JSON objects', () => {
    expect(safeParse<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
  });

  it('returns fallback on truncated JSON (corrupt blob)', () => {
    expect(safeParse<number[]>('[1,2', [])).toEqual([]);
  });

  it('returns fallback on garbage', () => {
    expect(safeParse<number[]>('not json at all', [])).toEqual([]);
  });

  it('returns fallback on partial corruption (mid-write crash)', () => {
    // Simulates what AsyncStorage might look like after an unexpected termination
    expect(safeParse<number[]>('[{"id":"abc","ts":12', [])).toEqual([]);
  });

  it('preserves the fallback identity', () => {
    const fallback: number[] = [];
    const result = safeParse<number[]>('{invalid', fallback);
    expect(result).toBe(fallback);
  });
});
