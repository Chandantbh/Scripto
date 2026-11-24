import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateWithModelFallback, MODEL_FALLBACKS } from './model-retry';

test('tries the ordered model chain with a 500ms backoff for retryable HTTP errors', async () => {
  for (const status of [404, 408, 429, 500, 502, 503, 504]) {
    const models: string[] = [];
    const delays: number[] = [];
    const expected = { notes: 'Complete notes', quiz: { questions: [] } };

    const result = await generateWithModelFallback(
      async model => {
        models.push(model);
        if (model === MODEL_FALLBACKS[0]) {
          throw Object.assign(new Error('Temporary model error'), { status });
        }
        return expected;
      },
      async milliseconds => {
        delays.push(milliseconds);
      }
    );

    assert.equal(result, expected);
    assert.deepEqual(models, [MODEL_FALLBACKS[0], MODEL_FALLBACKS[1]]);
    assert.deepEqual(delays, [500]);
  }
});

test('returns a friendly error after all fallback models are exhausted', async () => {
  const models: string[] = [];
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

  assert.deepEqual(models, [...MODEL_FALLBACKS]);
  assert.deepEqual(delays, [500, 500, 500]);
});

test('retries recognized Google API network failures', async () => {
  const models: Array<string | undefined> = [];
  const expected = { notes: 'Complete notes' };

  const result = await generateWithModelFallback(
    async model => {
      models.push(model);
      if (model === MODEL_FALLBACKS[0]) {
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
  assert.deepEqual(models, [MODEL_FALLBACKS[0], MODEL_FALLBACKS[1]]);
});

test('continues through the fallback chain for any model error', async () => {
  for (const status of [400, 401, 403]) {
    const models: string[] = [];
    const result = await generateWithModelFallback(
      async model => {
        models.push(model);
        if (model === MODEL_FALLBACKS[0]) {
        throw Object.assign(new Error('Invalid request'), { status });
        }
        return {ok: true};
      },
      async () => {}
    );

    assert.deepEqual(result, {ok: true});
    assert.deepEqual(models, [MODEL_FALLBACKS[0], MODEL_FALLBACKS[1]]);
  }
});

test('falls through models for 404, high-demand, and unavailable messages', async () => {
  for (const message of ['404 Not Found', 'High demand at endpoint', 'Service unavailable']) {
    const models: string[] = [];
    const delays: number[] = [];
    const result = await generateWithModelFallback(
      async model => {
        models.push(model);
        if (model === MODEL_FALLBACKS[0]) throw new Error(message);
        return {ok: true};
      },
      async milliseconds => { delays.push(milliseconds); }
    );

    assert.deepEqual(result, {ok: true});
    assert.deepEqual(models, [MODEL_FALLBACKS[0], MODEL_FALLBACKS[1]]);
    assert.deepEqual(delays, [500]);
  }
});
