import 'server-only';

import TranscriptClient from 'youtube-transcript-api';
import {AIInputError} from '@/ai/errors';
import {MAX_AI_TEXT_CHARACTERS} from '@/ai/generation-limits';

/**
 * Extracts the YouTube video ID from a URL.
 * @param url A YouTube watch URL or direct ID.
 * @returns The video ID.
 * @throws If no ID is found.
 */
function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (!match) throw new AIInputError('Enter a valid YouTube video URL.');
  return match[1];
}

let client: TranscriptClient | null = null;

/**
 * Fetches the transcript text for a YouTube video.
 * @param url YouTube video URL or ID.
 * @returns Full transcript text, or an empty string if unavailable.
 */
export async function getYouTubeTranscript(url: string): Promise<string> {
  const videoId = extractVideoId(url);

  if (!client) {
    client = new TranscriptClient({
      headers: { 'User-Agent': 'Mozilla/5.0' },
      // optional: timeout, proxy, etc
    });
    await client.ready;
  }

  let result;
  try {
    result = await client.getTranscript(videoId);
  } catch (error) {
    console.error('YouTube transcript retrieval failed.', error);
    throw new AIInputError('A transcript could not be retrieved for this video.');
  }

  if (!result?.transcript?.length) {
    throw new AIInputError('No transcript was found for this video.');
  }

  const transcriptParts: string[] = [];
  let transcriptLength = 0;
  for (const segment of result.transcript) {
    transcriptLength += segment.text.length;
    if (transcriptLength > MAX_AI_TEXT_CHARACTERS) {
      throw new AIInputError(`Video transcripts must be ${MAX_AI_TEXT_CHARACTERS.toLocaleString()} characters or fewer.`);
    }
    transcriptParts.push(segment.text);
  }

  return transcriptParts.join(' ');
}
