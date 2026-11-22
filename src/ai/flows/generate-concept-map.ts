'use server';

import {executeAIAction} from '@/ai/action-guard';
import { z } from 'genkit';
import { ai } from '@/ai/genkit';
import {MAX_TOPIC_CHARACTERS} from '@/ai/generation-limits';
import {type AIActionResult} from '@/types/ai-action';
import {AIInputError} from '@/ai/errors';

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
  concepts: z.array(ConceptMapNodeSchema),
  relationships: z.array(ConceptMapRelationshipSchema),
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
    Generate between 8 and 18 distinct concepts.
    Give each concept a unique short slug ID, a concise label, and a one-sentence description.
    Generate between 8 and 28 directed relationships.
    Every relationship source and target must strictly match an existing concept id.
    Do not create self-loops or relationships with unknown IDs.
    Use unique, short slug IDs (for example "photosynthesis", "chlorophyll").`
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
    return sanitizeConceptMapOutput(result.output);
});

function sanitizeConceptMapOutput(output: ConceptMapOutput): ConceptMapOutput {
  const concepts: ConceptMapOutput['concepts'] = [];
  const conceptIds = new Set<string>();

  for (const concept of output.concepts) {
    const id = concept.id.trim();
    const label = concept.label.trim();
    const description = concept.description?.trim();
    if (!id || !label || conceptIds.has(id)) continue;

    conceptIds.add(id);
    concepts.push({
      id,
      label,
      ...(description ? { description } : {}),
    });
  }

  if (concepts.length < 2) {
    throw new AIInputError('Not enough valid concepts were generated. Please try a different topic.');
  }

  const relationships: ConceptMapOutput['relationships'] = [];
  const relationshipKeys = new Set<string>();

  for (const relationship of output.relationships) {
    const source = relationship.source.trim();
    const target = relationship.target.trim();
    const relation = relationship.relation.trim();
    if (
      !source ||
      !target ||
      !relation ||
      source === target ||
      !conceptIds.has(source) ||
      !conceptIds.has(target)
    ) continue;

    const key = `${source}\u0000${target}`;
    if (relationshipKeys.has(key)) continue;

    relationshipKeys.add(key);
    relationships.push({ source, target, relation });
  }

  return { concepts, relationships };
}

export async function generateConceptMap(input: ConceptMapInput): Promise<AIActionResult<ConceptMapOutput>> {
  return executeAIAction('generateConceptMap', input, ConceptMapInputSchema, generateConceptMapFlow);
}
