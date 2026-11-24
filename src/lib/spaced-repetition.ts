'use client';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewCard {
  question: string;
  answer: string;
  emoji?: string;
  color?: string;
}

export interface FlashcardReview {
  key: string;
  card: ReviewCard;
  nextReviewAt: string;
  dueAt: string;
  interval: number;
  intervalMinutes: number;
  repetition: number;
  repetitions: number;
  easeFactor: number;
  updatedAt: string;
}

export const REVIEW_STORAGE_KEY = 'scripto_flashcard_reviews';

export function getReviewIntervalMinutes(rating: ReviewRating): number {
  return rating === 'again'
    ? 0
    : rating === 'hard'
      ? 12 * 60
      : rating === 'good'
        ? 24 * 60
        : 4 * 24 * 60;
}

export function formatReviewInterval(intervalMinutes: number): string {
  if (intervalMinutes <= 0) return 'Now';
  if (intervalMinutes < 60) return `${intervalMinutes}m`;
  if (intervalMinutes < 24 * 60) {
    const hours = Math.round(intervalMinutes / 60);
    return `${hours}h`;
  }
  const days = Math.round(intervalMinutes / (24 * 60));
  return `${days}d`;
}

export function getCardScheduleLabel(card: ReviewCard, now = new Date(), reviews = readFlashcardReviews()): string {
  const review = reviews.find(item => item.key === cardKey(card));
  if (!review) return 'New card';
  const next = new Date(review.nextReviewAt ?? review.dueAt).getTime();
  if (next <= now.getTime()) return 'Due now';
  const minutes = Math.max(0, Math.ceil((next - now.getTime()) / (60 * 1000)));
  return `Next review in ${formatReviewInterval(minutes)}`;
}

export function getReviewDueAt(card: ReviewCard, rating: ReviewRating, now = new Date(), existing?: FlashcardReview): FlashcardReview {
  const easeFactor = Math.max(
    1.3,
    (existing?.easeFactor ?? 2.5)
      + (rating === 'again' ? -0.2 : rating === 'hard' ? -0.15 : rating === 'good' ? 0 : 0.15),
  );
  let intervalMinutes: number;
  let repetition: number;

  if (rating === 'again') {
    intervalMinutes = 0;
    repetition = 0;
  } else if (rating === 'hard') {
    repetition = (existing?.repetition ?? existing?.repetitions ?? 0) + 1;
    intervalMinutes = repetition === 1 ? 12 * 60 : Math.max(12 * 60, Math.round((existing?.intervalMinutes ?? 12 * 60) * 1.2));
  } else if (rating === 'good') {
    repetition = (existing?.repetition ?? existing?.repetitions ?? 0) + 1;
    intervalMinutes = repetition === 1 ? 24 * 60 : Math.round((existing?.intervalMinutes ?? 24 * 60) * easeFactor);
  } else {
    repetition = (existing?.repetition ?? existing?.repetitions ?? 0) + 1;
    intervalMinutes = repetition === 1
      ? 4 * 24 * 60
      : Math.max(6 * 24 * 60, Math.round((existing?.intervalMinutes ?? 4 * 24 * 60) * easeFactor));
  }
  const nextReviewAt = new Date(now.getTime() + intervalMinutes * 60 * 1000).toISOString();
  return {
    key: cardKey(card),
    card: { ...card },
    nextReviewAt,
    dueAt: nextReviewAt,
    interval: intervalMinutes,
    intervalMinutes,
    repetition,
    repetitions: repetition,
    easeFactor,
    updatedAt: now.toISOString(),
  };
}

export function cardKey(card: ReviewCard): string {
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
    && typeof (review.nextReviewAt ?? review.dueAt) === 'string'
    && typeof review.intervalMinutes === 'number'
    && typeof review.repetitions === 'number'
    && typeof review.updatedAt === 'string'
    && !!review.card
    && typeof (review.card as ReviewCard).question === 'string'
    && typeof (review.card as ReviewCard).answer === 'string';
}

export function getDueFlashcards(now = new Date(), reviews = readFlashcardReviews()): ReviewCard[] {
  const cutoff = now.getTime();
  const due = reviews.filter(review => new Date(review.nextReviewAt ?? review.dueAt).getTime() <= cutoff);
  return due.map(review => review.card);
}

export function getDueFlashcardCount(now = new Date(), reviews = readFlashcardReviews()): number {
  return reviews.filter(review => new Date(review.nextReviewAt ?? review.dueAt).getTime() <= now.getTime()).length;
}

export function scheduleFlashcard(card: ReviewCard, rating: ReviewRating, now = new Date()): FlashcardReview[] {
  const reviews = readFlashcardReviews();
  const key = cardKey(card);
  const existing = reviews.find(review => review.key === key);
  const next = getReviewDueAt({
    question: card.question,
    answer: card.answer,
    emoji: card.emoji,
    color: card.color,
  }, rating, now, existing);

  const updated = [next, ...reviews.filter(review => review.key !== key)];
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

export function initializeFlashcardReview(card: ReviewCard, now = new Date(), key?: string): FlashcardReview {
  const resolvedKey = key ?? cardKey(card);
  const nextReviewAt = now.toISOString();
  return {
    key: resolvedKey,
    card: { ...card },
    nextReviewAt,
    dueAt: nextReviewAt,
    interval: 0,
    intervalMinutes: 0,
    repetition: 0,
    repetitions: 0,
    easeFactor: 2.5,
    updatedAt: now.toISOString(),
  };
}

export function initializeFlashcardDeck(cards: ReviewCard[], now = new Date(), existing: FlashcardReview[] = readFlashcardReviews()): FlashcardReview[] {
  const byKey = new Map(existing.map(review => [review.key, review]));
  const initialized = cards.map(card => {
    const key = cardKey(card);
    return byKey.get(key) ?? initializeFlashcardReview(card, now, key);
  });
  const keys = new Set(initialized.map(review => review.key));
  const untouched = existing.filter(review => !keys.has(review.key));
  return [...initialized, ...untouched];
}
