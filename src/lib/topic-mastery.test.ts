import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTopicMastery } from './topic-mastery';

test('blends each latest score with 70 percent of previous mastery', () => {
  assert.equal(calculateTopicMastery(0, 100), 30);
  assert.equal(calculateTopicMastery(30, 100), 51);
});
