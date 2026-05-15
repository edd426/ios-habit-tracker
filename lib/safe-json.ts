/**
 * Safely parse a JSON string, returning a fallback on failure.
 *
 * Why: AsyncStorage blobs can become corrupt after unexpected app termination,
 * power loss, or iCloud sync conflicts. A bare `JSON.parse` throws SyntaxError
 * and crashes the caller, then the whole screen, then sometimes the whole app.
 * This wrapper turns a crash into a silent empty-state, which is safer for an
 * app that's the user's source of truth for habits and medication logs.
 */
export function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn('safeParse: failed to parse blob, returning fallback', e);
    return fallback;
  }
}
