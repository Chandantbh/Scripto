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
  if (error instanceof AIActionFailure) return error.message;
  return 'The AI service could not complete your request. Please try again.';
}
