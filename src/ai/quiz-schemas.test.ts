import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QuizOutputSchema } from './schemas/quiz-schemas';

const question = {
  prompt: 'What is the answer?',
  options: ['One', 'Two', 'Three', 'Four'],
  correctIndex: 2,
  explanation: 'Three is correct because it follows the source material.',
};

test('accepts a complete quiz question with distinct choices', () => {
  assert.equal(QuizOutputSchema.safeParse({ questions: [question] }).success, true);
});

test('rejects malformed choices, indexes, prompts, and explanations', () => {
  const invalidQuestions = [
    { ...question, options: ['One', 'One', 'Three', 'Four'] },
    { ...question, options: ['One', 'Two', 'Three'] },
    { ...question, options: ['One', 'Two', 'Three', ' '] },
    { ...question, correctIndex: 4 },
    { ...question, prompt: ' ' },
    { ...question, explanation: '' },
  ];

  for (const invalid of invalidQuestions) {
    assert.equal(QuizOutputSchema.safeParse({ questions: [invalid] }).success, false);
  }
});

test('rejects duplicate prompts regardless of letter casing', () => {
  assert.equal(QuizOutputSchema.safeParse({
    questions: [question, { ...question, prompt: question.prompt.toUpperCase() }],
  }).success, false);
});
