'use server';

/**
 * @fileOverview Explains a topic in simple terms from various sources.
 *
 * - explainLikeImFive - A function that explains content simply.
 * - ExplainLikeImFiveInput - The input type for the function.
 * - ExplainLikeImFiveOutput - The return type for the function.
 */

import {ai, generateWithFallback} from '@/ai/genkit';
import {executeAIAction} from '@/ai/action-guard';
import {MAX_AI_TEXT_CHARACTERS} from '@/ai/generation-limits';
import {AIInputError} from '@/ai/errors';
import {getYouTubeSource} from '@/services/youtube';
import {z} from 'genkit';
import {type AIActionResult} from '@/types/ai-action';
import {PROMPT_SYSTEM_INSTRUCTIONS} from '@/ai/prompt-security';

const ExplainLikeImFiveInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_AI_TEXT_CHARACTERS).optional().describe('The text content to explain.'),
  imageDataUri: z
    .string()
    .optional()
    .describe(
      "An image for OCR analysis, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'"
    ),
  youtubeUrl: z.string().trim().min(1).max(2_048).optional().describe('A YouTube video URL to summarize and explain.'),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('easy').describe("The difficulty level for the explanation. 'easy' is for a 5-year-old.")
}).refine(
  input => Boolean(input.text || input.imageDataUri || input.youtubeUrl),
  'Provide text, an image, or a YouTube URL.'
);
export type ExplainLikeImFiveInput = z.infer<typeof ExplainLikeImFiveInputSchema>;

const ExplainLikeImFiveOutputSchema = z.object({
  explanation: z.string().describe('The simple explanation of the topic, formatted in markdown.'),
  imageHint: z.string().optional().describe('A one or two word hint for a relevant image search query.'),
});
export type ExplainLikeImFiveOutput = z.infer<typeof ExplainLikeImFiveOutputSchema>;

export async function explainLikeImFive(input: ExplainLikeImFiveInput): Promise<AIActionResult<ExplainLikeImFiveOutput>> {
    return executeAIAction('explainLikeImFive', input, ExplainLikeImFiveInputSchema, eli5Flow);
}

const generateContentPrompt = ai.definePrompt({
    name: 'eli5Prompt',
    input: { schema: ExplainLikeImFiveInputSchema },
    output: { schema: ExplainLikeImFiveOutputSchema },
    prompt: `${PROMPT_SYSTEM_INSTRUCTIONS}
You are an expert at explaining complex topics in a simple and easy-to-understand way.
    
    Your task is to analyze the provided content and:
    1. Explain it based on the requested difficulty level. Use simple words, short sentences, and relatable analogies for 'easy'. For 'medium', assume a high school level of understanding. For 'hard', assume a college level. Format the output as markdown.
    2. Provide a 1-2 word hint for an image search that would create a relevant illustration for the topic.

    Content to Explain:
    {{#if text}}<study_material>{{{text}}}</study_material>{{/if}}
    {{#if imageDataUri}}{{media url=imageDataUri}}{{/if}}
    {{#if youtubeUrl}}YouTube video: {{media url=youtubeUrl}}{{/if}}

    Difficulty: {{{difficulty}}}
    `,
});


const eli5Flow = ai.defineFlow(
  {
    name: 'eli5Flow',
    inputSchema: ExplainLikeImFiveInputSchema,
    outputSchema: ExplainLikeImFiveOutputSchema,
  },
  async (input) => {
    let processedInput = { ...input };
    if (input.youtubeUrl) {
      const source = await getYouTubeSource(input.youtubeUrl);
      if (source.kind === 'transcript') {
        processedInput = {
          ...processedInput,
          text: source.text,
          youtubeUrl: undefined,
        };
      } else {
        processedInput.youtubeUrl = source.canonicalUrl;
      }
    }

    if (
      !processedInput.text?.trim() &&
      !processedInput.imageDataUri &&
      !processedInput.youtubeUrl
    ) {
      throw new AIInputError('No usable content was found. Please check the source and try again.');
    }

    const { output } = await generateWithFallback(model =>
      generateContentPrompt(
        processedInput,
        model
          ? { model, config: { maxOutputTokens: 2048 } }
          : { config: { maxOutputTokens: 2048 } }
      )
    );
    
    if (!output) {
      throw new Error("Failed to generate explanation.");
    }

    return output;
  }
);
