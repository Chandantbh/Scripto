'use server';

/**
 * @fileOverview Generates a quiz from a given text input or YouTube URL.
 *
 * - generateQuiz - A function that handles the quiz generation process.
 * - GenerateQuizInput - The input type for the generateQuiz function.
 * - GenerateQuizOutput - The return type for the generateQuiz function.
 */

import {ai, generateWithFallback} from '@/ai/genkit';
import {executeAIAction} from '@/ai/action-guard';
import {AIInputError} from '@/ai/errors';
import {MAX_AI_TEXT_CHARACTERS} from '@/ai/generation-limits';
import { getYouTubeSource } from '@/services/youtube';
import {z} from 'genkit';
import {type AIActionResult} from '@/types/ai-action';
import {PROMPT_SYSTEM_INSTRUCTIONS} from '@/ai/prompt-security';
import { QuizOutputSchema, type QuizQuestion } from '@/ai/schemas/quiz-schemas';

const GenerateQuizInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_AI_TEXT_CHARACTERS).optional().describe('The text to generate a quiz from.'),
  youtubeUrl: z.string().trim().min(1).max(2_048).optional().describe('A YouTube video URL to generate a quiz from.'),
  questionCount: z.number().int().min(1).max(15).optional().describe('Number of questions to generate.'),
}).refine(input => Boolean(input.text || input.youtubeUrl), 'Provide text or a YouTube URL.')
  .refine(input => !(input.text && input.youtubeUrl), 'Provide only one content source.');
export type GenerateQuizInput = z.infer<typeof GenerateQuizInputSchema>;

const GenerateQuizOutputSchema = QuizOutputSchema;
export type GenerateQuizOutput = { questions: QuizQuestion[] };

export async function generateQuiz(input: GenerateQuizInput): Promise<AIActionResult<GenerateQuizOutput>> {
  return executeAIAction('generateQuiz', input, GenerateQuizInputSchema, generateQuizFlow);
}

const prompt = ai.definePrompt({
  name: 'generateQuizPrompt',
  input: { schema: z.object({ content: z.string().optional(), youtubeUrl: z.string().optional(), questionCount: z.number().optional() }) },
  output: {schema: GenerateQuizOutputSchema},
  prompt: `${PROMPT_SYSTEM_INSTRUCTIONS}
  You are a quiz generator. Generate exactly {{{questionCount}}} questions based on the following content.
  {{#if content}}<study_material>{{{content}}}</study_material>{{/if}}
  {{#if youtubeUrl}}YouTube video: {{media url=youtubeUrl}}{{/if}}
  Each question must have a unique, non-empty prompt; exactly 4 distinct non-empty options; a correctIndex from 0 to 3; a non-empty explanation; and optionally a single relevant emoji.`,
});

const generateQuizFlow = ai.defineFlow(
  {
    name: 'generateQuizFlow',
    inputSchema: GenerateQuizInputSchema,
    outputSchema: GenerateQuizOutputSchema,
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

    const promptInput = {
        content: content || undefined,
        youtubeUrl,
        questionCount: input.questionCount ?? 10,
    };
    return generateWithFallback(async model => {
      const { output } = await prompt(promptInput, {
        model,
        config: { maxOutputTokens: 4096 },
      });
      return GenerateQuizOutputSchema.parse(output);
    });
  }
);
