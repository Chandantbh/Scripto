'use client';

export type ReviewRating = 'again' | 'good' | 'easy';

export interface ReviewCard {
  question: string;
  answer: string;
  emoji?: string;
  color?: string;
}

export interface FlashcardReview {
  key: string;
  card: ReviewCard;
  dueAt: string;
  intervalMinutes: number;
  repetitions: number;
  updatedAt: string;
}

export const REVIEW_STORAGE_KEY = 'scripto_flashcard_reviews';

function cardKey(card: ReviewCard): string {
  const source = `${card.question}\u0000${card.answer}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return `card-${Math.abs(hash).toString(36)}`;
}

export function readFlashcardReviews(): FlashcardReview[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(REVIEW_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(isFlashcardReview) : [];
  } catch {
    return [];
  }
}

function isFlashcardReview(value: unknown): value is FlashcardReview {
  if (!value || typeof value !== 'object') return false;
  const review = value as Record<string, unknown>;
  return typeof review.key === 'string'
    && typeof review.dueAt === 'string'
    && typeof review.intervalMinutes === 'number'
    && typeof review.repetitions === 'number'
    && typeof review.updatedAt === 'string'
    && !!review.card
    && typeof (review.card as ReviewCard).question === 'string'
    && typeof (review.card as ReviewCard).answer === 'string';
}

export function getDueFlashcards(now = new Date(), reviews = readFlashcardReviews()): ReviewCard[] {
  const cutoff = now.getTime();
  const due = reviews.filter(review => new Date(review.dueAt).getTime() <= cutoff);
  return due.map(review => review.card);
}

export function getDueFlashcardCount(now = new Date(), reviews = readFlashcardReviews()): number {
  return reviews.filter(review => new Date(review.dueAt).getTime() <= now.getTime()).length;
}

export function scheduleFlashcard(card: ReviewCard, rating: ReviewRating, now = new Date()): FlashcardReview[] {
  const reviews = readFlashcardReviews();
  const key = cardKey(card);
  const existing = reviews.find(review => review.key === key);
  const intervalMinutes = rating === 'again' ? 10 : rating === 'good' ? 24 * 60 : 4 * 24 * 60;
  const next: FlashcardReview = {
    key,
    card: {
      question: card.question,
      answer: card.answer,
      emoji: card.emoji,
      color: card.color,
    },
    dueAt: new Date(now.getTime() + intervalMinutes * 60 * 1000).toISOString(),
    intervalMinutes,
    repetitions: rating === 'again' ? 0 : (existing?.repetitions ?? 0) + 1,
    updatedAt: now.toISOString(),
  };

  const updated = [next, ...reviews.filter(review => review.key !== key)];
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}
