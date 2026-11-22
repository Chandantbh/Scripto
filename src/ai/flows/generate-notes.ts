
'use server';

/**
 * @fileOverview Generates notes from input text or YouTube video.
 *
 * - generateNotes - A function that generates notes from the input.
 * - GenerateNotesInput - The input type for the generateNotes function.
 * - GenerateNotesOutput - The return type for the generateNotes function.
 */

import {ai} from '@/ai/genkit';
import {generateWithModelFallback} from '@/ai/model-retry';
import {executeAIAction} from '@/ai/action-guard';
import {AIInputError} from '@/ai/errors';
import {MAX_AI_TEXT_CHARACTERS} from '@/ai/generation-limits';
import { getYouTubeSource } from '@/services/youtube';
import {z} from 'genkit';
import {type AIActionResult} from '@/types/ai-action';

const GenerateNotesInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_AI_TEXT_CHARACTERS).optional().describe('The text to generate notes from.'),
  youtubeUrl: z.string().trim().min(1).max(2_048).optional().describe('A YouTube video URL to generate notes from.'),
}).refine(input => Boolean(input.text || input.youtubeUrl), 'Provide text or a YouTube URL.')
  .refine(input => !(input.text && input.youtubeUrl), 'Provide only one content source.');
export type GenerateNotesInput = z.infer<typeof GenerateNotesInputSchema>;

const GenerateNotesOutputSchema = z.object({
  notes: z.string().describe('The generated notes.'),
});
export type GenerateNotesOutput = z.infer<typeof GenerateNotesOutputSchema>;

export async function generateNotes(input: GenerateNotesInput): Promise<AIActionResult<GenerateNotesOutput>> {
  return executeAIAction('generateNotes', input, GenerateNotesInputSchema, generateNotesFlow);
}

const generateNotesPrompt = ai.definePrompt({
  name: 'generateNotesPrompt',
  input: { schema: z.object({ content: z.string().optional(), youtubeUrl: z.string().optional() }) },
  output: {schema: GenerateNotesOutputSchema},
  prompt: `You are an expert note-taker. Generate detailed, well-structured, and easy-to-understand notes from the following content. Use markdown for formatting, including headings, lists, and bold text to highlight key points.

  {{#if content}}Content to analyze: {{{content}}}{{/if}}
  {{#if youtubeUrl}}YouTube video: {{media url=youtubeUrl}}{{/if}}
  `,
});

const generateNotesFlow = ai.defineFlow(
  {
    name: 'generateNotesFlow',
    inputSchema: GenerateNotesInputSchema,
    outputSchema: GenerateNotesOutputSchema,
  },
  async input => {
    let content = input.text || '';
    let youtubeUrl: string | undefined;
    
    if (input.youtubeUrl) {
      const source = await getYouTubeSource(input.youtubeUrl);
      if (source.kind === 'transcript') content = source.text;
      else youtubeUrl = source.canonicalUrl;
    }

    if (!content.trim() && !youtubeUrl) {
      throw new AIInputError('No usable content was found. Please check the source and try again.');
    }
    
    const {output} = await generateWithModelFallback(model =>
      generateNotesPrompt({ content: content || undefined, youtubeUrl }, model ? {model} : undefined)
    );

    if (!output) {
      throw new Error("Failed to generate notes.");
    }

    return output;
  }
);
