import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getReviewDueAt, getReviewIntervalMinutes, initializeFlashcardReview } from './spaced-repetition';

test('uses the expected Again, Good, and Easy intervals', () => {
  assert.equal(getReviewIntervalMinutes('again'), 0);
  assert.equal(getReviewIntervalMinutes('good'), 24 * 60);
  assert.equal(getReviewIntervalMinutes('easy'), 4 * 24 * 60);
});

test('calculates due dates from the review timestamp', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const card = { question: 'What is Scripto?', answer: 'An AI study workspace.' };

  assert.equal(getReviewDueAt(card, 'again', now).dueAt, '2026-11-24T12:00:00.000Z');
  assert.equal(getReviewDueAt(card, 'good', now).dueAt, '2026-11-25T12:00:00.000Z');
  assert.equal(getReviewDueAt(card, 'easy', now).dueAt, '2026-11-28T12:00:00.000Z');
});

test('tracks repetitions and resets Again reviews', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const card = { question: 'A', answer: 'B' };
  const good = getReviewDueAt(card, 'good', now);
  assert.equal(good.repetitions, 1);
  const goodAgain = getReviewDueAt(card, 'good', now, good);
  assert.equal(goodAgain.repetitions, 2);
  assert.equal(getReviewDueAt(card, 'again', now, goodAgain).repetitions, 0);
});

test('initializes new cards as immediately due with SM-2 defaults', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const review = initializeFlashcardReview({
    question: 'New card',
    answer: 'New answer',
  }, now);
  assert.equal(review.nextReviewAt, now.toISOString());
  assert.equal(review.interval, 0);
  assert.equal(review.repetition, 0);
  assert.equal(review.easeFactor, 2.5);
});
