'use server';

/**
 * @fileOverview Generates an image from a text prompt.
 *
 * - generateImage - A function that handles the image generation process.
 * - GenerateImageInput - The input type for the generateImage function.
 * - GenerateImageOutput - The return type for the generateImage function.
 */

import { ai } from '@/ai/genkit';
import { executeAIAction } from '@/ai/action-guard';
import { z } from 'genkit';
import { type AIActionResult } from '@/types/ai-action';

const GenerateImageInputSchema = z.object({
  prompt: z.string().trim().min(1).max(2_000).describe('The text prompt for image generation.'),
});
export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

const GenerateImageOutputSchema = z.object({
  imageDataUri: z.string().describe('The generated image as a data URI.'),
});
export type GenerateImageOutput = z.infer<typeof GenerateImageOutputSchema>;

export async function generateImage(input: GenerateImageInput): Promise<AIActionResult<GenerateImageOutput>> {
  return executeAIAction('generateImage', input, GenerateImageInputSchema, generateImageFlow);
}

const generateImageFlow = ai.defineFlow(
  {
    name: 'generateImageFlow',
    inputSchema: GenerateImageInputSchema,
    outputSchema: GenerateImageOutputSchema,
  },
  async ({ prompt }) => {
    const { media } = await ai.generate({
      model: 'googleai/gemini-2.5-flash-preview-image-generation',
      prompt: `A vibrant, high-quality, professional illustration for a blog post about: ${prompt}`,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const imageDataUri = media?.url;
    if (!imageDataUri) {
      throw new Error('Image generation failed to produce an image.');
    }

    return { imageDataUri };
  }
);
