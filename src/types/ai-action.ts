export type AIActionErrorCode =
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'AI_UNAVAILABLE';

export type AIActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        status: 400 | 429 | 503;
        code: AIActionErrorCode;
        message: string;
        retryAfterSeconds?: number;
      };
    };
