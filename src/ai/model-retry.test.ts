import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateWithModelFallback } from './model-retry';

const FALLBACK_MODEL = 'googleai/gemini-2.5-flash';

test('retries transient HTTP errors and falls back, including 429 quota errors', async () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    const models: Array<string | undefined> = [];
    const delays: number[] = [];
    const expected = { notes: 'Complete notes', quiz: { questions: [] } };

    const result = await generateWithModelFallback(
      async model => {
        models.push(model);
        if (model === undefined) {
          throw Object.assign(new Error('Temporary model error'), { status });
        }
        return expected;
      },
      async milliseconds => {
        delays.push(milliseconds);
      }
    );

    assert.equal(result, expected);
    assert.deepEqual(models, [undefined, FALLBACK_MODEL]);
    assert.deepEqual(delays, [800]);
  }
});

test('returns a friendly error after primary and fallback attempts are exhausted', async () => {
  const models: Array<string | undefined> = [];
  const delays: number[] = [];

  await assert.rejects(
    generateWithModelFallback(
      async model => {
        models.push(model);
        throw Object.assign(new Error('Model busy'), { status: 503 });
      },
      async milliseconds => {
        delays.push(milliseconds);
      }
    ),
    /traffic spike/
  );

  assert.deepEqual(models, [undefined, FALLBACK_MODEL, FALLBACK_MODEL]);
  assert.deepEqual(delays, [800, 800]);
});

test('retries recognized Google API network failures', async () => {
  const models: Array<string | undefined> = [];
  const expected = { notes: 'Complete notes' };

  const result = await generateWithModelFallback(
    async model => {
      models.push(model);
      if (model === undefined) {
        const error = new Error(
          'Error fetching from https://generativelanguage.googleapis.com/v1beta/models/example:generateContent'
        );
        error.name = 'GoogleGenerativeAIError';
        throw error;
      }
      return expected;
    },
    async () => {}
  );

  assert.equal(result, expected);
  assert.deepEqual(models, [undefined, FALLBACK_MODEL]);
});

test('does not retry or fall back for non-transient HTTP errors', async () => {
  for (const status of [400, 401, 403, 404]) {
    let calls = 0;

    await assert.rejects(
      generateWithModelFallback(async () => {
        calls++;
        throw Object.assign(new Error('Invalid request'), { status });
      }),
      /Invalid request/
    );

    assert.equal(calls, 1);
  }
});
