'use server';

/**
 * @fileOverview Converts text to speech.
 *
 * - textToSpeech - A function that converts text to audio.
 * - TextToSpeechInput - The input type for the function.
 * - TextToSpeechOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {executeAIAction} from '@/ai/action-guard';
import {MAX_AI_TEXT_CHARACTERS} from '@/ai/generation-limits';
import {z} from 'genkit';
import wav from 'wav';
import { googleAI } from '@genkit-ai/googleai';
import {type AIActionResult} from '@/types/ai-action';

const TextToSpeechInputSchema = z.object({
  text: z.string().trim().min(1).max(MAX_AI_TEXT_CHARACTERS).describe('The text to convert to speech.'),
});
export type TextToSpeechInput = z.infer<typeof TextToSpeechInputSchema>;

const TextToSpeechOutputSchema = z.object({
  audioDataUri: z.string().describe('The audio data URI for the generated speech (in WAV format).'),
});
export type TextToSpeechOutput = z.infer<typeof TextToSpeechOutputSchema>;


export async function textToSpeech(input: TextToSpeechInput): Promise<AIActionResult<TextToSpeechOutput>> {
    return executeAIAction('textToSpeech', input, TextToSpeechInputSchema, textToSpeechFlow);
}

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs: any[] = [];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

const textToSpeechFlow = ai.defineFlow(
  {
    name: 'textToSpeechFlow',
    inputSchema: TextToSpeechInputSchema,
    outputSchema: TextToSpeechOutputSchema,
  },
  async ({ text }) => {
    const { media } = await ai.generate({
      model: googleAI.model('gemini-2.5-flash-preview-tts'),
      config: {
        responseModalities: ['AUDIO'],
        maxOutputTokens: 2048,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' },
          },
        },
      },
      prompt: text,
    });
    if (!media) {
      throw new Error('No media returned from TTS model');
    }
    const audioBuffer = Buffer.from(
      media.url.substring(media.url.indexOf(',') + 1),
      'base64'
    );
    
    const wavBase64 = await toWav(audioBuffer);

    return {
      audioDataUri: 'data:audio/wav;base64,' + wavBase64,
    };
  }
);
