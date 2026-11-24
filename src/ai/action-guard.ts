import 'server-only';

import { type ZodError, type ZodType, type ZodTypeDef } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { AIInputError } from '@/ai/errors';
import { MAX_AI_TEXT_CHARACTERS, MAX_TOPIC_CHARACTERS } from '@/ai/generation-limits';
import { checkAIRateLimit } from '@/lib/rate-limit';
import { normalizeYouTubeUrl } from '@/services/youtube';
import { type AIActionResult } from '@/types/ai-action';

const MAX_OTHER_FIELD_CHARACTERS = 5_000;
const MAX_TOTAL_TEXT_CHARACTERS = 50_000;
const GUEST_MAX_TEXT_CHARACTERS = 8_000;
const SIGNED_IN_MAX_TEXT_CHARACTERS = 40_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_INLINE_MEDIA_BYTES = 512 * 1024;
const TEMPORARY_ERROR_MESSAGE =
  'The AI service is temporarily busy. Please try again in a few minutes.';

export async function executeAIAction<ParsedInput, Output, SchemaInput = ParsedInput>(
  operation: string,
  input: unknown,
  schema: ZodType<ParsedInput, ZodTypeDef, SchemaInput>,
  action: (validatedInput: ParsedInput) => Promise<Output>,
  exposeActionError = false,
): Promise<AIActionResult<Output>> {
  const { userId } = await auth();
  const textLimit = userId ? SIGNED_IN_MAX_TEXT_CHARACTERS : GUEST_MAX_TEXT_CHARACTERS;
  const parsedInput = schema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: {
        status: 400,
        code: 'INVALID_INPUT',
        message: getValidationMessage(parsedInput.error),
      },
    };
  }

  const inputError = validateAIInput(parsedInput.data, textLimit);
  if (inputError) {
    return {
      ok: false,
      error: { status: 400, code: 'INVALID_INPUT', message: inputError },
    };
  }

  try {
    const limit = await checkAIRateLimit();
    if (!limit.allowed) {
      console.error('[SECURITY] rate_limit_hit', {
        operation,
        authenticated: Boolean(userId),
      });
      return {
        ok: false,
        error: {
          status: 429,
          code: 'RATE_LIMITED',
          message: userId
            ? 'You’ve reached the AI request limit (15 requests per 10 minutes). Please try again shortly.'
            : 'Guest AI limit reached (3 generations per hour). Please sign in or try again later.',
          retryAfterSeconds: limit.retryAfterSeconds,
        },
      };
    }

    return {
      ok: true,
      data: await action(parsedInput.data),
    };
  } catch (error) {
    if (operation === 'generateConceptMap') {
      console.error('[CONCEPT_MAP_ERROR]', error);
    }
    console.error('[AUTH] action_guard_error', {
      event: 'action_guard_error',
      operation,
      authenticated: Boolean(userId),
    });
    if (error instanceof AIInputError) {
      return {
        ok: false,
        error: { status: 400, code: 'INVALID_INPUT', message: error.message },
      };
    }

    console.error(`AI action "${operation}" failed.`, error);
    if (exposeActionError && error instanceof Error) {
      const message = error.message.trim();
      if (message && message.length <= 500 && !message.includes('\n')) {
        return {
          ok: false,
          error: {
            status: 503,
            code: 'AI_UNAVAILABLE',
            message,
          },
        };
      }
    }
    return {
      ok: false,
      error: {
        status: 503,
        code: 'AI_UNAVAILABLE',
        message: TEMPORARY_ERROR_MESSAGE,
      },
    };
  }
}

function getValidationMessage(error: ZodError): string {
  const paths = error.issues.map(issue => issue.path.join('.').toLowerCase());
  const safeMessages = new Set([
    'Provide text or a YouTube URL.',
    'Provide only one content source.',
    'Provide text, an image, or a YouTube URL.',
    'Provide text, media, or a YouTube URL.',
    'Submit one answer for every exam question.',
    'Enter at least one answer before submitting.',
    'Additional details cannot be blank.',
  ]);
  const safeMessage = error.issues.find(issue => safeMessages.has(issue.message))?.message;

  if (safeMessage) return safeMessage;

  if (error.issues.some(issue =>
    issue.code === 'too_small' &&
    (issue.path.includes('topic') || issue.path.includes('subject'))
  )) {
    return 'Enter a topic or subject; it must be 200 characters or fewer.';
  }
  if (paths.some(path => path.includes('topic') || path.includes('subject'))) {
    return `Topic and subject names must be ${MAX_TOPIC_CHARACTERS} characters or fewer.`;
  }
  if (paths.some(path => path.includes('youtubeurl'))) {
    return 'Enter a valid YouTube video URL.';
  }
  if (paths.some(path => path.includes('imagedatauri') || path.includes('audiodatauri'))) {
    return 'The uploaded media is invalid or too large. Please use a supported file under 512 KB.';
  }
  if (paths.some(path => path.includes('text') || path.includes('content'))) {
    return `Text must be non-empty and ${MAX_AI_TEXT_CHARACTERS.toLocaleString()} characters or fewer.`;
  }

  return 'Please check your input and try again.';
}

function validateAIInput(input: unknown, textLimit = MAX_AI_TEXT_CHARACTERS): string | undefined {
  let totalTextCharacters = 0;

  const visit = (value: unknown, fieldName = ''): string | undefined => {
    if (typeof value === 'string') {
      const field = fieldName.toLowerCase();

      if (field === 'youtubeurl' && !isValidYouTubeUrl(value)) {
        return 'Enter a valid YouTube video URL.';
      }

      if (field === 'imagedatauri' || field === 'audiodatauri') {
        if (!isValidInlineMedia(value, field)) {
          return 'The uploaded media is invalid or too large. Please use a supported file under 512 KB.';
        }
        return undefined;
      }

      if ((field === 'topic' || field === 'subject') && value.trim().length > MAX_TOPIC_CHARACTERS) {
        return `Topic and subject names must be ${MAX_TOPIC_CHARACTERS} characters or fewer.`;
      }

      if ((field === 'text' || field === 'content') && value.length > textLimit) {
        return `Text must be ${textLimit.toLocaleString()} characters or fewer.`;
      }

      const maxFieldLength = field === 'chapters' || field === 'additionaldetails'
        ? MAX_OTHER_FIELD_CHARACTERS
        : textLimit;
      if (value.length > maxFieldLength) {
        return `Each input field must be ${maxFieldLength.toLocaleString()} characters or fewer.`;
      }

      totalTextCharacters += value.length;
      return totalTextCharacters > MAX_TOTAL_TEXT_CHARACTERS
        ? `Combined input must be ${MAX_TOTAL_TEXT_CHARACTERS.toLocaleString()} characters or fewer.`
        : undefined;
    }

    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_ITEMS) {
        return `Input lists cannot contain more than ${MAX_ARRAY_ITEMS} items.`;
      }
      for (const item of value) {
        const error = visit(item, fieldName);
        if (error) return error;
      }
      return undefined;
    }

    if (typeof value === 'object' && value !== null) {
      for (const [key, nestedValue] of Object.entries(value)) {
        const error = visit(nestedValue, key);
        if (error) return error;
      }
    }

    return undefined;
  };

  return visit(input);
}

function isValidInlineMedia(value: string, field: string): boolean {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp)|audio\/(?:wav|mpeg|mp4));base64,([A-Za-z0-9+/]+={0,2})$/i);
  const expectedMimePrefix = field === 'imagedatauri' ? 'image/' : 'audio/';
  if (!match || !match[1].toLowerCase().startsWith(expectedMimePrefix) || match[2].length % 4 !== 0) {
    return false;
  }

  const encodedLength = match[2].length;
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
  const decodedSize = Math.floor(encodedLength * 3 / 4) - padding;
  return decodedSize > 0 && decodedSize <= MAX_INLINE_MEDIA_BYTES;
}

export function isValidYouTubeUrl(value: string): boolean {
  if (value.trim().length > 2_048) return false;
  return normalizeYouTubeUrl(value) !== null;
}
