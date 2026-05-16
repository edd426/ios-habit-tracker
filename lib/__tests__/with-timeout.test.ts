import { withTimeout } from '../with-timeout';

describe('withTimeout', () => {
  jest.useFakeTimers();

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('resolves with the underlying promise value when it settles in time', async () => {
    const p = withTimeout(Promise.resolve(42), 1000, 'fast');
    await expect(p).resolves.toBe(42);
  });

  it('rejects with the underlying error when the promise rejects', async () => {
    const p = withTimeout(Promise.reject(new Error('boom')), 1000, 'fail');
    await expect(p).rejects.toThrow('boom');
  });

  it('rejects with a labeled timeout error when the promise never settles', async () => {
    const never = new Promise<number>(() => {});
    const p = withTimeout(never, 500, 'stuck-op');
    // Advance past the timeout
    jest.advanceTimersByTime(500);
    await expect(p).rejects.toThrow('stuck-op timed out after 500ms');
  });

  it('does not fire the timeout once the promise has already settled', async () => {
    const p = withTimeout(Promise.resolve('ok'), 1000, 'should-not-fire');
    await expect(p).resolves.toBe('ok');
    // Advance well past the timeout — nothing should explode.
    jest.advanceTimersByTime(5000);
  });
});
