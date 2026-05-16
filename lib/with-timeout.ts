/**
 * Race a promise against a timeout. If the promise doesn't settle in `ms`,
 * the returned promise rejects with a labeled timeout error.
 *
 * Why: native bridge calls (iCloud, notifications) can block the JS thread
 * indefinitely if iOS is in an odd state. With New Architecture on, a stuck
 * JS thread during background/foreground transitions causes
 * "TurboModuleManager: Timed out waiting for modules to be invalidated"
 * and the app dies. A hard timeout on every native call prevents that.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
