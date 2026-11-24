// src/ai/flows/generate-flashcards.ts
'use server';

/**
 * @fileOverview A flashcard generation AI agent.
 *
 * - generateFlashcards - A function that handles the flashcard generation process.
 * - GenerateFlashcardsInput - The input type for the generateFlashcards function.
 * - GenerateFlashcardsOutput - The return type for the generateFlashcards function.
 */

import {ai, generateWithFallback} from '@/ai/genkit';
import {executeAIAction} from '@/ai/action-guard';
import {AIInputError} from '@/ai/errors';
import {
  MAX_FLASHCARD_INPUT_CHARACTERS,
  MAX_FLASHCARDS,
} from '@/ai/generation-limits';
import { getYouTubeSource } from '@/services/youtube';
import {z} from 'genkit';
import {type AIActionResult} from '@/types/ai-action';
import {PROMPT_SYSTEM_INSTRUCTIONS} from '@/ai/prompt-security';

const GenerateFlashcardsInputSchema = z.object({
  text: z.string().trim().min(3).max(MAX_FLASHCARD_INPUT_CHARACTERS).optional().describe('The text to generate flashcards from.'),
  youtubeUrl: z.string().trim().min(1).max(2_048).optional().describe('A YouTube video URL to generate flashcards from.'),
}).refine(input => Boolean(input.text || input.youtubeUrl), 'Provide text or a YouTube URL.')
  .refine(input => !(input.text && input.youtubeUrl), 'Provide only one content source.');

export type GenerateFlashcardsInput = z.infer<typeof GenerateFlashcardsInputSchema>;

const GenerateFlashcardsOutputSchema = z.object({
  flashcards: z.array(
    z.object({
      question: z.string().describe('The flashcard question.'),
      answer: z.string().describe('The flashcard answer.'),
      emoji: z.string().describe('A single, valid emoji character relevant to the flashcard content. Example: "🧠"'),
      color: z.string().describe('A hex color code for the flashcard background (e.g., #FFFFFF).'),
    })
  ).describe('The generated flashcards.'),
});

export type GenerateFlashcardsOutput = z.infer<typeof GenerateFlashcardsOutputSchema>;

export async function generateFlashcards(input: GenerateFlashcardsInput): Promise<AIActionResult<GenerateFlashcardsOutput>> {
  return executeAIAction('generateFlashcards', input, GenerateFlashcardsInputSchema, generateFlashcardsFlow);
}

const prompt = ai.definePrompt({
  name: 'generateFlashcardsPrompt',
  input: {schema: z.object({ content: z.string().optional(), youtubeUrl: z.string().optional() }) },
  output: {schema: GenerateFlashcardsOutputSchema},
  prompt: `${PROMPT_SYSTEM_INSTRUCTIONS}
  You are an expert at creating flashcards for students.

  Given the following content, generate a set of flashcards. For each flashcard, provide:
  1. A "question".
  2. A concise "answer".
  3. A single, valid "emoji" character that is thematically related to the content.
  4. A "color" as a hex code that is visually appealing for a background. Ensure good contrast for dark text.
  Generate 8–10 highly focused cards. Use fewer only for extremely short source content. Keep each front and back to 1–2 concise sentences.

  {{#if content}}<study_material>{{{content}}}</study_material>{{/if}}
  {{#if youtubeUrl}}YouTube video: {{media url=youtubeUrl}}{{/if}}

  Return only the structured flashcards object requested by the output schema.
  `,
});

const generateFlashcardsFlow = ai.defineFlow(
  {
    name: 'generateFlashcardsFlow',
    inputSchema: GenerateFlashcardsInputSchema,
    outputSchema: GenerateFlashcardsOutputSchema,
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

    const {output} = await generateWithFallback(model =>
      prompt(
        { content: content || undefined, youtubeUrl },
        {
          ...(model ? {model} : {}),
          config: {maxOutputTokens: 2048},
        }
      )
    );
    if (!output) {
      throw new Error('Failed to generate flashcards.');
    }

    return {flashcards: output.flashcards.slice(0, MAX_FLASHCARDS)};
  }
);
