import 'server-only';

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {MODEL_FALLBACKS} from '@/ai/model-retry';

export const ai = genkit({
  plugins: [googleAI()],
  model: MODEL_FALLBACKS[0],
});
export { googleAI };

export { generateWithFallback } from '@/ai/model-retry';
export { MODEL_FALLBACKS };

