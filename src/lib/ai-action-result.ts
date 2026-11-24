import { type AIActionResult } from '@/types/ai-action';

export class AIActionFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'AIActionFailure';
  }
}

export function unwrapAIActionResult<T>(result: AIActionResult<T>): T {
  if (result.ok) return result.data;
  throw new AIActionFailure(result.error.message, result.error.status, result.error.code);
}

export function getAIErrorMessage(error: unknown): string {
  return classifyAIError(error).message;
}

export interface FriendlyAIError {
  message: string;
  kind: 'rate-limit' | 'auth' | 'youtube' | 'file' | 'generic';
  status?: number;
  code?: string;
}

export function classifyAIError(error: unknown): FriendlyAIError {
  if (error instanceof AIActionFailure) {
    const raw = `${error.message} ${error.code}`.toLowerCase();
    if (error.status === 429 || error.code === 'RATE_LIMITED' || raw.includes('429') || raw.includes('cooldown')) {
      return { message: "You've hit the generation cooldown—wait a minute and try again.", kind: 'rate-limit', status: error.status, code: error.code };
    }
    if (error.status === 401 || error.status === 403 || error.code === 'UNAUTHENTICATED' || raw.includes('guest limit') || raw.includes('sign in')) {
      return { message: 'Guest limit reached. Sign in free to keep generating.', kind: 'auth', status: error.status, code: error.code };
    }
    if (raw.includes('caption') || raw.includes('transcript') || raw.includes('private video')) {
      return { message: "Couldn't grab captions from this video—try pasting the transcript or uploading notes instead.", kind: 'youtube', status: error.status, code: error.code };
    }
  }

  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lowered = raw.toLowerCase();
  if (lowered.includes('pdf') || lowered.includes('docx') || lowered.includes('10 mb') || lowered.includes('page') || lowered.includes('file type')) {
    return { message: 'File must be a PDF or DOCX under 10 MB (max 30 pages).', kind: 'file' };
  }
  if (lowered.includes('caption') || lowered.includes('transcript') || lowered.includes('private video') || lowered.includes('youtube')) {
    return { message: "Couldn't grab captions from this video—try pasting the transcript or uploading notes instead.", kind: 'youtube' };
  }
  return { message: 'Something went wrong generating your study material. Check your connection and try again.', kind: 'generic' };
}
