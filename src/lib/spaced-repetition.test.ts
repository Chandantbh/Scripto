import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDueFlashcardCount, getReviewDueAt, initializeFlashcardReview } from './spaced-repetition';

test('applies the SM-2 Again, Good, and Easy intervals', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const card = { question: 'What is Scripto?', answer: 'An AI study workspace.' };

  const again = getReviewDueAt(card, 'again', now);
  assert.equal(again.intervalDays, 1);
  assert.equal(again.reps, 0);
  assert.equal(again.dueAt, '2026-11-25T12:00:00.000Z');
  assert.equal(again.ease, 1.96);

  const firstGood = getReviewDueAt(card, 'good', now);
  assert.equal(firstGood.intervalDays, 1);
  assert.equal(firstGood.reps, 1);
  const secondGood = getReviewDueAt(card, 'good', now, firstGood);
  assert.equal(secondGood.intervalDays, 6);
  assert.equal(secondGood.reps, 2);

  const firstEasy = getReviewDueAt(card, 'easy', now);
  assert.equal(firstEasy.intervalDays, 4);
  const secondEasy = getReviewDueAt(card, 'easy', now, firstEasy);
  assert.equal(secondEasy.intervalDays, 8);
  assert.equal(secondEasy.reps, 2);
});

test('calculates later intervals from the prior interval and ease', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const card = { question: 'A', answer: 'B' };
  const firstGood = getReviewDueAt(card, 'good', now);
  const secondGood = getReviewDueAt(card, 'good', now, firstGood);
  const thirdGood = getReviewDueAt(card, 'good', now, secondGood);
  assert.equal(thirdGood.intervalDays, 15);
  assert.equal(thirdGood.dueAt, '2026-12-09T12:00:00.000Z');
});

test('initializes new cards as immediately due with SM-2 defaults', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const review = initializeFlashcardReview({
    question: 'New card',
    answer: 'New answer',
  }, now);
  assert.equal(review.dueAt, now.toISOString());
  assert.equal(review.intervalDays, 0);
  assert.equal(review.reps, 0);
  assert.equal(review.ease, 2.5);
});

test('computes the due queue from each current due date', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const due = initializeFlashcardReview({ question: 'Due', answer: 'Now' }, now);
  const upcoming = getReviewDueAt({ question: 'Later', answer: 'Tomorrow' }, 'good', now);
  assert.equal(getDueFlashcardCount(now, [due, upcoming]), 1);
  assert.equal(getDueFlashcardCount(new Date('2026-11-25T12:00:00.000Z'), [due, upcoming]), 2);
});
