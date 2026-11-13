const FALLBACK_MODEL = 'googleai/gemini-3.8-flash';
const MAX_ATTEMPTS_PER_MODEL = 2;
const BASE_RETRY_DELAY_MS = 500;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const STATUS_CODES: Record<string, number> = {
  DEADLINE_EXCEEDED: 504,
  INTERNAL: 500,
  RESOURCE_EXHAUSTED: 429,
  UNAVAILABLE: 503,
};

type ModelCall<T> = (model?: string) => Promise<T>;
type Delay = (milliseconds: number) => Promise<void>;

const delay: Delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

export async function generateWithModelFallback<T>(
  generate: ModelCall<T>,
  wait: Delay = delay
): Promise<T> {
  let lastError: unknown;

  for (const [modelIndex, model] of [undefined, FALLBACK_MODEL].entries()) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await generate(model);
      } catch (error) {
        lastError = error;
        const status = getHttpStatus(error);

        if (
          status === undefined
            ? !isTransientNetworkError(error)
            : !RETRYABLE_STATUSES.has(status)
        ) {
          throw error;
        }

        if (attempt < MAX_ATTEMPTS_PER_MODEL) {
          await wait(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }

        if (modelIndex === 0) {
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
    : typeof value === 'string'
      ? /^\d{3}$/.test(value)
        ? Number(value)
        : STATUS_CODES[value.toUpperCase()]
      : undefined;

  return status !== undefined && status >= 100 && status <= 599
    ? status
    : undefined;
}

function isTransientNetworkError(error: unknown, depth = 0): boolean {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return false;
  }

  if (
    'name' in error &&
    error.name === 'GoogleGenerativeAIError' &&
    'message' in error &&
    typeof error.message === 'string' &&
    /^(\[GoogleGenerativeAI Error\]\s*)?Error fetching from https:\/\/generativelanguage\.googleapis\.com\//i.test(
      error.message
    )
  ) {
    return true;
  }

  return 'cause' in error && isTransientNetworkError(error.cause, depth + 1);
}

function unavailableError(cause: unknown): Error {
  return new Error(
    'Gemini is temporarily busy. Please try again in a few minutes.',
    { cause }
  );
}
