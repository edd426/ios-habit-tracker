/**
 * Per-key async write queues.
 *
 * AsyncStorage read-modify-write cycles on the same key must not interleave:
 * two concurrent cycles would read the same base value, mutate independently,
 * and the second write would erase the first (lost update). `serializeWrite`
 * chains every job for a key behind the previous one, making each cycle
 * atomic with respect to the others.
 *
 * Lives in its own module (not storage.ts) so sync.ts can serialize its
 * merge-writes through the same queues without a storage → sync → storage
 * import cycle.
 */
const writeQueues: Record<string, Promise<unknown>> = {};

export function serializeWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Chain regardless of whether the previous job succeeded — one failed
  // write must not block all future writes to that key.
  const queued = (writeQueues[key] ?? Promise.resolve()).then(fn, fn);
  writeQueues[key] = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}
