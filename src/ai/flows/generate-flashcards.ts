// src/ai/flows/generate-flashcards.ts
'use server';

/**
 * @fileOverview A flashcard generation AI agent.
 *
 * - generateFlashcards - A function that handles the flashcard generation process.
 * - GenerateFlashcardsInput - The input type for the generateFlashcards function.
 * - GenerateFlashcardsOutput - The return type for the generateFlashcards function.
 */

import {ai} from '@/ai/genkit';
import {generateWithModelFallback} from '@/ai/model-retry';
import {
  MAX_FLASHCARD_INPUT_CHARACTERS,
  MAX_FLASHCARDS,
} from '@/ai/generation-limits';
import { getYouTubeTranscript } from '@/services/youtube';
import {z} from 'genkit';

const GenerateFlashcardsInputSchema = z.object({
  text: z.string().optional().describe('The text to generate flashcards from.'),
  youtubeUrl: z.string().optional().describe('A YouTube video URL to generate flashcards from.'),
});

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

export async function generateFlashcards(input: GenerateFlashcardsInput): Promise<GenerateFlashcardsOutput> {
  return generateFlashcardsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateFlashcardsPrompt',
  input: {schema: z.object({ content: z.string() }) },
  output: {schema: GenerateFlashcardsOutputSchema},
  prompt: `You are an expert at creating flashcards for students.

  Given the following content, generate a set of flashcards. For each flashcard, provide:
  1. A "question".
  2. A concise "answer".
  3. A single, valid "emoji" character that is thematically related to the content.
  4. A "color" as a hex code that is visually appealing for a background. Ensure good contrast for dark text.
  Generate between 5 and ${MAX_FLASHCARDS} flashcards, using fewer only if the content is very short. Keep each answer concise.

  Content: {{{content}}}

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
    
    if (input.youtubeUrl) {
        try {
            content = await getYouTubeTranscript(input.youtubeUrl);
        } catch (e) {
            console.error("Failed to get YouTube transcript", e);
            throw new Error("Could not get transcript for the provided YouTube URL. The video might not have subtitles enabled.");
        }
    }

    if (!content) {
        throw new Error("No content provided to generate flashcards.");
    }
    if (content.length > MAX_FLASHCARD_INPUT_CHARACTERS) {
      throw new Error(
        `Please limit flashcard source content to ${MAX_FLASHCARD_INPUT_CHARACTERS.toLocaleString()} characters.`
      );
    }

    const {output} = await generateWithModelFallback(model =>
      prompt(
        { content },
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
