'use server';

/**
 * @fileOverview An AI agent for semantic content analysis.
 *
 * - analyzeContent - A function that handles the content analysis process.
 * - AnalyzeContentInput - The input type for the analyzeContent function.
 * - AnalyzeContentOutput - The return type for the analyzeContent function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { getYouTubeSource } from '@/services/youtube';
import {executeAIAction} from '@/ai/action-guard';
import {AIInputError} from '@/ai/errors';
import {MAX_AI_TEXT_CHARACTERS} from '@/ai/generation-limits';
import {type AIActionResult} from '@/types/ai-action';

const ConceptSchema = z.object({
  id: z.string().describe('A unique identifier for the concept (e.g., "concept-1").'),
  name: z.string().describe('The name of the concept.'),
  description: z.string().describe('A brief description of the concept.'),
});

const RelationshipSchema = z.object({
  source: z.string().describe('The ID of the source concept.'),
  target: z.string().describe('The ID of the target concept.'),
  label: z.string().describe('A label describing the relationship (e.g., "is a type of", "leads to").'),
});

const AnalyzeContentInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_AI_TEXT_CHARACTERS).optional().describe('The text content to analyze.'),
  imageDataUri: z
    .string()
    .optional()
    .describe(
      "An image for OCR analysis, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
  audioDataUri: z
    .string()
    .optional()
    .describe(
      "An audio file for speech-to-text, as a data URI that must include a MIME type and use Base64 encoding."
    ),
  youtubeUrl: z.string().trim().min(1).max(2_048).optional().describe('A YouTube video URL to summarize and analyze.'),
}).refine(
  input => Boolean(input.text || input.imageDataUri || input.audioDataUri || input.youtubeUrl),
  'Provide text, media, or a YouTube URL.'
);

export type AnalyzeContentInput = z.infer<typeof AnalyzeContentInputSchema>;

const AnalyzeContentOutputSchema = z.object({
  concepts: z.array(ConceptSchema),
  relationships: z.array(RelationshipSchema),
});

export type AnalyzeContentOutput = z.infer<typeof AnalyzeContentOutputSchema>;

const analysisPrompt = ai.definePrompt({
    name: 'conceptMapAnalysisPrompt',
    input: { schema: AnalyzeContentInputSchema },
    output: { schema: AnalyzeContentOutputSchema },
    prompt: `You are an expert in semantic analysis and concept mapping. Your task is to analyze the provided content (which could be text, a YouTube video transcript, text from an image (OCR), or transcribed audio) and extract the main concepts and their relationships.

    Content to analyze:
    {{#if text}}Text: {{{text}}}{{/if}}
    {{#if imageDataUri}}{{media url=imageDataUri}}{{/if}}
    {{#if audioDataUri}}{{media url=audioDataUri}}{{/if}}
    {{#if youtubeUrl}}YouTube video: {{media url=youtubeUrl}}{{/if}}

    Based on the content:
    1. Identify the key concepts. For each concept, provide a unique ID, a name, and a short description.
    2. Identify the relationships between these concepts. Each relationship must link two concepts by their IDs and have a descriptive label.
    3. Format the output as a JSON object with two keys: "concepts" and "relationships".
    `,
});


export async function analyzeContent(input: AnalyzeContentInput): Promise<AIActionResult<AnalyzeContentOutput>> {
  return executeAIAction('analyzeContent', input, AnalyzeContentInputSchema, analyzeContentFlow);
}


const analyzeContentFlow = ai.defineFlow(
  {
    name: 'analyzeContentFlow',
    inputSchema: AnalyzeContentInputSchema,
    outputSchema: AnalyzeContentOutputSchema,
  },
  async (input) => {
    let processedInput = { ...input };

    if (input.youtubeUrl) {
      const source = await getYouTubeSource(input.youtubeUrl);
      if (source.kind === 'transcript') {
        if (!source.text.trim()) {
          throw new AIInputError('No usable transcript was found for this video.');
        }
        processedInput.text = source.text;
        processedInput.youtubeUrl = undefined;
      } else {
        processedInput.youtubeUrl = source.canonicalUrl;
      }
    }
    
    const { output } = await analysisPrompt(processedInput);
    
    if (!output) {
      throw new Error("Failed to generate concept map.");
    }

    return output;
  }
);
