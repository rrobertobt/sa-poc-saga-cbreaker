export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  /** If it returns false, the error propagates without further attempts. */
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void | Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retries `fn` with exponential backoff: baseDelayMs, 2x, 4x... */
export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = options.shouldRetry?.(err) ?? true;
      if (attempt >= options.attempts || !retryable) throw err;
      const delayMs = options.baseDelayMs * 2 ** (attempt - 1);
      await options.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}
