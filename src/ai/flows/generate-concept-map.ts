'use server';

import {executeAIAction} from '@/ai/action-guard';
import { z } from 'genkit';
import { ai } from '@/ai/genkit';
import {MAX_TOPIC_CHARACTERS} from '@/ai/generation-limits';
import {type AIActionResult} from '@/types/ai-action';

const ConceptMapInputSchema = z.object({
  topic: z.string().trim().min(1).max(MAX_TOPIC_CHARACTERS),
  additionalDetails: z.string().trim().max(5_000).optional(),
}).refine(input => !input.additionalDetails || input.additionalDetails.length > 0, 'Additional details cannot be blank.');
export type ConceptMapInput = z.infer<typeof ConceptMapInputSchema>;

const ConceptMapNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});

const ConceptMapRelationshipSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
});

const ConceptMapOutputSchema = z.object({
  concepts: z.array(ConceptMapNodeSchema).max(100),
  relationships: z.array(ConceptMapRelationshipSchema).max(200),
});
export type ConceptMapOutput = z.infer<typeof ConceptMapOutputSchema>;

const generateConceptMapPrompt = ai.definePrompt({
    name: 'generateConceptMap',
    input: { schema: ConceptMapInputSchema },
    output: { schema: ConceptMapOutputSchema },
    config: {
        temperature: 0.5,
    },
    prompt: `Generate a concept map for the topic: {{topic}}. 
    {{#if additionalDetails}}Additional context: {{additionalDetails}}{{/if}}
    
    Identify key concepts and how they are related. 
    Create a list of nodes (concepts) and edges (relationships).
    Ensure the IDs are unique simple strings (e.g. "c1", "c2").`
});

const generateConceptMapFlow = ai.defineFlow({
    name: 'generateConceptMapFlow',
    inputSchema: ConceptMapInputSchema,
    outputSchema: ConceptMapOutputSchema,
}, async (input) => {
    const result = await generateConceptMapPrompt(input);
    if (!result.output) {
        throw new Error('Failed to generate concept map');
    }
    return result.output;
});

export async function generateConceptMap(input: ConceptMapInput): Promise<AIActionResult<ConceptMapOutput>> {
  return executeAIAction('generateConceptMap', input, ConceptMapInputSchema, generateConceptMapFlow);
}
