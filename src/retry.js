const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(Number(status));
}

export async function withBoundedRetries(operation, {
  maxAttempts = 3,
  baseDelayMs = 250,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  shouldRetry = (error) => Boolean(error?.retryable),
} = {}) {
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 1));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation({ attempt, maxAttempts: attempts });
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error)) break;
      await sleep(Math.min(5000, Math.max(0, baseDelayMs) * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

export function retryableHttpError(status) {
  const error = new Error(`http_${status}`);
  error.status = Number(status);
  error.retryable = isRetryableStatus(status);
  return error;
}
