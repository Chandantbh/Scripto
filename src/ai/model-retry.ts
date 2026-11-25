import { ZodError } from 'zod';
import { AIOutputValidationError } from '@/ai/errors';

export const MODEL_FALLBACKS = [
  'googleai/gemini-4-hydrogen',
  'googleai/gemini-4-hydrogen',
  'googleai/gemini-4-hydrogen',
] as const;
const STATUS_CODES: Record<string, number> = {
  DEADLINE_EXCEEDED: 504,
  INTERNAL: 500,
  RESOURCE_EXHAUSTED: 429,
  UNAVAILABLE: 503,
};

type ModelCall<T> = (model: string) => Promise<T>;
type Delay = (milliseconds: number) => Promise<void>;

export class AIModelFallbackError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'AIModelFallbackError';
  }
}

const delay: Delay = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

export async function generateWithFallback<T>(
  generate: ModelCall<T>,
  wait: Delay = delay
): Promise<T> {
  let lastError: unknown;

  for (const [index, model] of MODEL_FALLBACKS.entries()) {
    try {
      const result = await generate(model);
      return result;
    } catch (err) {
      lastError = err;
      const errorMessage = typeof err === 'object' && err !== null && 'message' in err
        ? err.message
        : undefined;
      console.error('[AI_MODEL_FAIL]', model, errorMessage);
      if (index < MODEL_FALLBACKS.length - 1) {
        await wait(500);
      }
    }
  }

  if (lastError instanceof ZodError || lastError instanceof AIOutputValidationError) {
    throw lastError;
  }
  if (!isGeminiApiError(lastError)) throw lastError;
  throw unavailableError(lastError);
}

export const generateWithModelFallback = generateWithFallback;

function isGeminiApiError(error: unknown): boolean {
  if (getHttpStatus(error) !== undefined) return true;
  if (typeof error !== 'object' || error === null || !('message' in error) || typeof error.message !== 'string') {
    return false;
  }
  return /generativelanguage\.googleapis\.com|fetch failed|network|econn|timed? ?out|socket|deadline|high demand|overloaded|unavailable|not found|resource_exhausted|rate limit/i.test(error.message);
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

function unavailableError(cause: unknown): AIModelFallbackError {
  const raw = cause instanceof Error ? cause.message : String(cause ?? '');
  const lowered = raw.toLowerCase();
  const status = getHttpStatus(cause);
  if (status === 401 || status === 403) {
    return new AIModelFallbackError('AI service configuration error. Please contact support.', cause);
  }
  if (status === 429 || lowered.includes('429') || lowered.includes('rate limit')) {
    return new AIModelFallbackError("You've hit the generation cooldown—wait a minute and try again.", cause);
  }
  if (
    status === 503 ||
    lowered.includes('503') ||
    lowered.includes('high demand') ||
    lowered.includes('overloaded') ||
    lowered.includes('unavailable')
  ) {
    return new AIModelFallbackError('The AI servers are experiencing a brief traffic spike. Please wait a few seconds and click Try Again.', cause);
  }
  return new AIModelFallbackError('The AI service is temporarily unavailable. Please try again.', cause);
}
