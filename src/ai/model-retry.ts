const FALLBACK_MODEL = 'googleai/gemini-3.5-flash-lite';
const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 500;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const FALLBACK_STATUSES = new Set([500, 502, 503, 504]);

type ModelCall<T> = (model?: string) => Promise<T>;
type Delay = (milliseconds: number) => Promise<void>;

const delay: Delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

export async function generateWithModelFallback<T>(
  generate: ModelCall<T>,
  wait: Delay = delay
): Promise<T> {
  let lastError: unknown;

  for (const model of [undefined, FALLBACK_MODEL]) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await generate(model);
      } catch (error) {
        lastError = error;
        const status = getHttpStatus(error);

        if (status === undefined || !RETRYABLE_STATUSES.has(status)) {
          throw error;
        }

        if (attempt < MAX_ATTEMPTS) {
          await wait(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }

        if (model === undefined && FALLBACK_STATUSES.has(status)) {
          break;
        }

        throw unavailableError(lastError);
      }
    }
  }

  throw unavailableError(lastError);
}

function getHttpStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('status' in error) {
    const status = parseStatus(error.status);
    if (status !== undefined) return status;
  }

  if ('statusCode' in error) {
    const status = parseStatus(error.statusCode);
    if (status !== undefined) return status;
  }

  if ('response' in error) {
    const status = getHttpStatus(error.response, depth + 1);
    if (status !== undefined) return status;
  }

  if ('cause' in error) {
    const status = getHttpStatus(error.cause, depth + 1);
    if (status !== undefined) return status;
  }

  if ('message' in error && typeof error.message === 'string') {
    const match = error.message.match(
      /\[(\d{3})\s*\]|(?:HTTP\s+|status(?:Code)?\s*[:=]\s*)(\d{3})/i
    );
    return parseStatus(match?.[1] ?? match?.[2]);
  }

  return undefined;
}

function parseStatus(value: unknown): number | undefined {
  const status = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d{3}$/.test(value)
      ? Number(value)
      : undefined;

  return status !== undefined && status >= 100 && status <= 599
    ? status
    : undefined;
}

function unavailableError(cause: unknown): Error {
  return new Error(
    'Gemini is temporarily busy. Please try again in a few minutes.',
    { cause }
  );
}
