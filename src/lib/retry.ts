import { logClientTelemetry } from "@/lib/telemetry";

export const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const DEFAULT_ATTEMPT_TIMEOUT_MS = 4000;

// Supabase's client can occasionally stall indefinitely on a single call
// (observed: internal session-lock contention when several requests race
// each other right after a fresh page load). Without a per-attempt timeout,
// a stuck call here means callers sit on a loading skeleton forever instead
// of ever reaching their error/retry state. Racing each attempt against a
// timeout turns that hang into an ordinary retryable failure.
const withAttemptTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("This is taking longer than expected. Please try again.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export const withRetry = async <T>(
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
    source?: string;
    timeoutMs?: number;
  },
): Promise<T> => {
  const retries = options?.retries ?? 2;
  const initialDelayMs = options?.initialDelayMs ?? 250;
  const backoffFactor = options?.backoffFactor ?? 1.8;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;

  let attempt = 0;
  let delay = initialDelayMs;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await withAttemptTimeout(operation(), timeoutMs);
    } catch (error) {
      lastError = error;
      logClientTelemetry({
        type: "fetch-error",
        source: options?.source ?? "withRetry",
        message: error instanceof Error ? error.message : "Unknown fetch error",
        metadata: {
          attempt,
          retries,
        },
      });

      if (attempt >= retries) {
        break;
      }

      await sleep(delay);
      delay = Math.round(delay * backoffFactor);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Operation failed");
};