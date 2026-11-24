export class AIInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIInputError';
  }
}

export function formatUserErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const message = raw
    .replace(/\[GoogleGenerativeAI Error\]/gi, '')
    .replace(/https?:\/\/[^\s)\]}]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const lowered = message.toLowerCase();

  if (
    lowered.includes('503') ||
    lowered.includes('high demand') ||
    lowered.includes('overloaded')
  ) {
    return 'The AI servers are experiencing a brief traffic spike. Please wait a few seconds and click Try Again.';
  }
  if (lowered.includes('429') || lowered.includes('rate limit') || lowered.includes('quota')) {
    return "You've hit the generation cooldown—wait a minute and try again.";
  }
  if (
    lowered.includes('api key') ||
    lowered.includes('401') ||
    lowered.includes('403') ||
    lowered.includes('unauthenticated') ||
    lowered.includes('permission denied')
  ) {
    return 'AI service configuration error. Please contact support.';
  }
  return message
    ? 'The AI service is temporarily unavailable. Please try again.'
    : 'The AI service is temporarily unavailable. Please try again.';
}
