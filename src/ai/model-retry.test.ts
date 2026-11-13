import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateWithModelFallback } from './model-retry';

test('retries primary 503 responses with exponential backoff, then uses fallback', async () => {
  const models: Array<string | undefined> = [];
  const delays: number[] = [];
  const expected = { notes: 'Complete notes', quiz: { questions: [] } };

  const result = await generateWithModelFallback(
    async model => {
      models.push(model);
      if (model === undefined) {
        throw Object.assign(new Error('Model busy'), { status: 503 });
      }
      return expected;
    },
    async milliseconds => {
      delays.push(milliseconds);
    }
  );

  assert.equal(result, expected);
  assert.deepEqual(models, [undefined, undefined, undefined, 'googleai/gemini-3.5-flash-lite']);
  assert.deepEqual(delays, [500, 1000]);
});

test('retries 429 responses up to the limit without switching models', async () => {
  const models: Array<string | undefined> = [];
  const delays: number[] = [];

  await assert.rejects(
    generateWithModelFallback(
      async model => {
        models.push(model);
        throw Object.assign(new Error('Rate limited'), { status: 429 });
      },
      async milliseconds => {
        delays.push(milliseconds);
      }
    ),
    /Gemini is temporarily busy/
  );

  assert.deepEqual(models, [undefined, undefined, undefined]);
  assert.deepEqual(delays, [500, 1000]);
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
    /Gemini is temporarily busy/
  );

  assert.deepEqual(models, [
    undefined, undefined, undefined,
    'googleai/gemini-3.5-flash-lite',
    'googleai/gemini-3.5-flash-lite',
    'googleai/gemini-3.5-flash-lite',
  ]);
  assert.deepEqual(delays, [500, 1000, 500, 1000]);
});

test('does not retry or fall back for non-transient errors', async () => {
  let calls = 0;

  await assert.rejects(
    generateWithModelFallback(async () => {
      calls++;
      throw Object.assign(new Error('Invalid request'), { status: 400 });
    }),
    /Invalid request/
  );

  assert.equal(calls, 1);
});
