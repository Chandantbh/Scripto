import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getReviewDueAt, getReviewIntervalMinutes } from './spaced-repetition';

test('uses the expected Again, Good, and Easy intervals', () => {
  assert.equal(getReviewIntervalMinutes('again'), 10);
  assert.equal(getReviewIntervalMinutes('good'), 24 * 60);
  assert.equal(getReviewIntervalMinutes('easy'), 4 * 24 * 60);
});

test('calculates due dates from the review timestamp', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const card = { question: 'What is Scripto?', answer: 'An AI study workspace.' };

  assert.equal(getReviewDueAt(card, 'again', now).dueAt, '2026-11-24T12:10:00.000Z');
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
