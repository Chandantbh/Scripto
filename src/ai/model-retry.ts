export const MODEL_FALLBACKS = [
  'googleai/gemini-3.5-flash-lite',
  'googleai/gemini-3.8-flash',
  'googleai/gemini-3.6-flash',
  'googleai/gemini-4-hydrogen',
] as const;
const RETRYABLE_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504]);
const STATUS_CODES: Record<string, number> = {
  DEADLINE_EXCEEDED: 504,
  INTERNAL: 500,
  RESOURCE_EXHAUSTED: 429,
  UNAVAILABLE: 503,
};

type ModelCall<T> = (model: string) => Promise<T>;
type Delay = (milliseconds: number) => Promise<void>;

const delay: Delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

export async function generateWithModelFallback<T>(
  generate: ModelCall<T>,
  wait: Delay = delay
): Promise<T> {
  let lastError: unknown;

  for (const [index, model] of MODEL_FALLBACKS.entries()) {
    try {
      return await generate(model);
    } catch (error) {
      lastError = error;
      const status = getHttpStatus(error);
      const retryable = status === undefined
        ? isTransientNetworkError(error)
        : RETRYABLE_STATUSES.has(status);

      if (!retryable) throw error;
      if (index < MODEL_FALLBACKS.length - 1) {
        await wait(500);
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

  if ('message' in error && typeof error.message === 'string') {
    const message = error.message.toLowerCase();
    if (
      message.includes('404') ||
      message.includes('503') ||
      message.includes('429') ||
      message.includes('high demand') ||
      message.includes('overloaded') ||
      message.includes('resource_exhausted') ||
      message.includes('unavailable') ||
      /generativelanguage\.googleapis\.com/i.test(error.message)
    ) {
      return true;
    }
  }

  return 'cause' in error && isTransientNetworkError(error.cause, depth + 1);
}

function unavailableError(cause: unknown): Error {
  const raw = cause instanceof Error ? cause.message : String(cause ?? '');
  const lowered = raw.toLowerCase();
  const status = getHttpStatus(cause);
  if (lowered.includes('429') || lowered.includes('rate limit')) {
    return new Error("You've hit the generation cooldown—wait a minute and try again.", { cause });
  }
  if (
    status === 503 ||
    lowered.includes('503') ||
    lowered.includes('high demand') ||
    lowered.includes('overloaded') ||
    lowered.includes('unavailable')
  ) {
    return new Error('The AI servers are experiencing a brief traffic spike. Please wait a few seconds and click Try Again.', { cause });
  }
  return new Error('The AI service is temporarily unavailable. Please try again.', { cause });
}
