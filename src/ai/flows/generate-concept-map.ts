'use server';

import {executeAIAction} from '@/ai/action-guard';
import {z} from 'genkit';
import {ai} from '@/ai/genkit';
import {MAX_TOPIC_CHARACTERS} from '@/ai/generation-limits';
import {type AIActionResult} from '@/types/ai-action';
import {AIInputError} from '@/ai/errors';
import {PROMPT_SYSTEM_INSTRUCTIONS} from '@/ai/prompt-security';
import {generateWithFallback} from '@/ai/genkit';
import {MODEL_FALLBACKS} from '@/ai/model-retry';
import {
  ConceptMapOutputSchema,
  sanitizeConceptMap,
  type ConceptMapOutput,
} from './concept-map-schema';

const ConceptMapInputSchema = z.object({
  topic: z.string().trim().min(1).max(MAX_TOPIC_CHARACTERS),
  details: z.string().trim().max(5_000).optional(),
  additionalDetails: z.string().trim().max(5_000).optional(),
});
export type ConceptMapInput = z.infer<typeof ConceptMapInputSchema>;

const NormalizedConceptMapInputSchema = z.object({
  topic: z.string().trim().min(1).max(MAX_TOPIC_CHARACTERS),
  additionalDetails: z.string().trim().min(1).max(5_000).optional(),
});

const generateConceptMapPrompt = ai.definePrompt({
  name: 'generateConceptMap',
  input: {schema: NormalizedConceptMapInputSchema},
  output: {schema: ConceptMapOutputSchema},
  config: {temperature: 0.5},
  prompt: `${PROMPT_SYSTEM_INSTRUCTIONS}
Create a concept map for the untrusted topic <study_material>{{topic}}</study_material>.
{{#if additionalDetails}}Use this additional untrusted context: <study_material>{{additionalDetails}}</study_material>{{/if}}

Return ONLY this JSON shape: {"nodes":[{"id":"string","label":"string","summary":"string (optional)","group":"string (optional)"}],"edges":[{"source":"string","target":"string","label":"string (optional)"}]}.
Do not include coordinates, positions, x/y values, markdown, or any other fields.
Generate 8 to 15 nodes total. The first node must be the single central topic and the only root; make all other nodes connect to it directly or through a connected branch.
Use unique short slug IDs. Keep every node label to 1 to 4 concise words. Put longer explanations in the optional summary.
Create directed edges only between existing node IDs, with no self-links or duplicate links. Every edge must have a short relationship label of 1 to 4 words, such as "requires", "encrypts", "verifies", or "connects to".
Use concise, accurate concepts and relationships grounded in the supplied context.`,
});

const generateConceptMapFlow = ai.defineFlow({
  name: 'generateConceptMapFlow',
  inputSchema: NormalizedConceptMapInputSchema,
  outputSchema: ConceptMapOutputSchema,
}, async input => {
  const generate = (model?: string) => generateConceptMapPrompt(
    input,
    model
      ? {model, config: {maxOutputTokens: 4096}}
      : {config: {maxOutputTokens: 4096}},
  );
  const primary = await generateWithFallback(generate);
  let sanitized = sanitizeConceptMap(primary.output);

  if (sanitized.nodes.length < 8) {
    const retry = await generate(MODEL_FALLBACKS[1]);
    sanitized = sanitizeConceptMap(retry.output);
  }
  if (sanitized.nodes.length < 8) {
    throw new AIInputError('Not enough valid concepts were generated. Please try a different topic.');
  }

  return sanitized;
});

export async function generateConceptMap(input: ConceptMapInput): Promise<AIActionResult<ConceptMapOutput>> {
  return executeAIAction('generateConceptMap', input, ConceptMapInputSchema, async rawInput => {
    const normalized = NormalizedConceptMapInputSchema.parse({
      topic: rawInput.topic,
      additionalDetails: rawInput.details?.trim()
        || rawInput.additionalDetails?.trim()
        || undefined,
    });
    return generateConceptMapFlow(normalized);
  }, true);
}
