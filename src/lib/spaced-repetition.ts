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
  id?: string;
  sourceTitle?: string;
  starred?: boolean;
  card: ReviewCard;
  ease: number;
  intervalDays: number;
  reps: number;
  dueAt: string;
  lastReviewedAt: string | null;
  updatedAt: string;
  nextReviewAt: string;
  interval: number;
  intervalMinutes: number;
  repetition: number;
  repetitions: number;
  easeFactor: number;
}

export const REVIEW_STORAGE_KEY = 'scripto_flashcard_reviews';
const DAY_MS = 86_400_000;

export function getReviewIntervalMinutes(rating: ReviewRating): number {
  return rating === 'again' ? DAY_MS / 60_000 : rating === 'good' ? DAY_MS / 60_000 : 4 * DAY_MS / 60_000;
}

export function formatReviewInterval(intervalMinutes: number): string {
  if (intervalMinutes <= 0) return 'Now';
  if (intervalMinutes < 60) return `${intervalMinutes}m`;
  if (intervalMinutes < 24 * 60) return `${Math.round(intervalMinutes / 60)}h`;
  return `${Math.round(intervalMinutes / (24 * 60))}d`;
}

export function getCardScheduleLabel(card: ReviewCard, now = new Date(), reviews = readFlashcardReviews()): string {
  const review = reviews.find(item => item.key === cardKey(card));
  if (!review) return 'New card';
  const next = new Date(review.dueAt ?? review.nextReviewAt).getTime();
  if (next <= now.getTime()) return 'Due now';
  return `Next review in ${formatReviewInterval(Math.ceil((next - now.getTime()) / 60_000))}`;
}

export function reviewCard(
  card: ReviewCard,
  grade: ReviewRating,
  now = new Date(),
  existing?: Partial<FlashcardReview>,
): FlashcardReview {
  const q = grade === 'again' ? 1 : grade === 'good' ? 4 : 5;
  const previousReps = existing?.reps ?? existing?.repetition ?? existing?.repetitions ?? 0;
  const previousInterval = existing?.intervalDays
    ?? (existing?.intervalMinutes === undefined ? 0 : existing.intervalMinutes / (24 * 60));
  const ease = Math.max(
    1.3,
    (existing?.ease ?? existing?.easeFactor ?? 2.5)
      + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );
  const intervalDays = grade === 'again'
    ? 1
    : grade === 'good'
      ? previousReps === 0 ? 1 : previousReps === 1 ? 6 : Math.round(previousInterval * ease)
      : previousReps === 0 ? 4 : previousReps === 1 ? 8 : Math.round(previousInterval * ease * 1.3);
  const reps = grade === 'again' ? 0 : previousReps + 1;
  const dueAt = new Date(now.getTime() + intervalDays * DAY_MS).toISOString();
  const key = cardKey(card);

  return {
    key,
    id: existing?.id ?? crypto.randomUUID(),
    sourceTitle: existing?.sourceTitle,
    starred: existing?.starred ?? false,
    card: { ...card },
    ease,
    intervalDays,
    reps,
    dueAt,
    lastReviewedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    nextReviewAt: dueAt,
    interval: intervalDays,
    intervalMinutes: intervalDays * 24 * 60,
    repetition: reps,
    repetitions: reps,
    easeFactor: ease,
  };
}

export function getReviewDueAt(
  card: ReviewCard,
  rating: ReviewRating,
  now = new Date(),
  existing?: Partial<FlashcardReview>,
): FlashcardReview {
  return reviewCard(card, rating, now, existing);
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
    const value: unknown = JSON.parse(window.localStorage.getItem(REVIEW_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(isFlashcardReview) : [];
  } catch {
    return [];
  }
}

function isFlashcardReview(value: unknown): value is FlashcardReview {
  if (!value || typeof value !== 'object') return false;
  const review = value as Record<string, unknown>;
  const card = review.card as Record<string, unknown> | undefined;
  return typeof review.key === 'string'
    && typeof (review.dueAt ?? review.nextReviewAt) === 'string'
    && typeof (review.intervalDays ?? review.intervalMinutes) === 'number'
    && typeof (review.reps ?? review.repetitions) === 'number'
    && !!card
    && typeof card.question === 'string'
    && typeof card.answer === 'string';
}

export function getDueFlashcards(now = new Date(), reviews = readFlashcardReviews()): ReviewCard[] {
  return reviews
    .filter(review => new Date(review.dueAt ?? review.nextReviewAt).getTime() <= now.getTime())
    .map(review => review.card);
}

export function getDueFlashcardCount(now = new Date(), reviews = readFlashcardReviews()): number {
  return reviews.filter(review => new Date(review.dueAt ?? review.nextReviewAt).getTime() <= now.getTime()).length;
}

export function scheduleFlashcard(card: ReviewCard, rating: ReviewRating, now = new Date()): FlashcardReview[] {
  const reviews = readFlashcardReviews();
  const key = cardKey(card);
  const next = reviewCard(card, rating, now, reviews.find(review => review.key === key));
  const updated = [next, ...reviews.filter(review => review.key !== key)];
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

export function initializeFlashcardReview(card: ReviewCard, now = new Date(), key = cardKey(card)): FlashcardReview {
  return {
    key,
    id: crypto.randomUUID(),
    starred: false,
    card: { ...card },
    ease: 2.5,
    intervalDays: 0,
    reps: 0,
    dueAt: now.toISOString(),
    lastReviewedAt: null,
    updatedAt: now.toISOString(),
    nextReviewAt: now.toISOString(),
    interval: 0,
    intervalMinutes: 0,
    repetition: 0,
    repetitions: 0,
    easeFactor: 2.5,
  };
}

export function initializeFlashcardDeck(
  cards: ReviewCard[],
  now = new Date(),
  existing: FlashcardReview[] = readFlashcardReviews(),
): FlashcardReview[] {
  const byKey = new Map(existing.map(review => [
    review.key,
    review.id ? review : { ...review, id: crypto.randomUUID() },
  ]));
  const initializedByKey = new Map<string, FlashcardReview>();
  for (const card of cards) {
    const key = cardKey(card);
    if (!initializedByKey.has(key)) {
      initializedByKey.set(key, byKey.get(key) ?? initializeFlashcardReview(card, now));
    }
  }
  const initialized = [...initializedByKey.values()];
  const keys = new Set(initialized.map(review => review.key));
  return [
    ...initialized,
    ...existing
      .filter(review => !keys.has(review.key))
      .map(review => review.id ? review : { ...review, id: crypto.randomUUID() }),
  ];
}
