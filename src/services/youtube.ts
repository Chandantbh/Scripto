import 'server-only';

import TranscriptClient from 'youtube-transcript-api';
import {AIInputError} from '@/ai/errors';
import {MAX_AI_TEXT_CHARACTERS} from '@/ai/generation-limits';

export type YouTubeSource =
  | { kind: 'transcript'; text: string; canonicalUrl: string }
  | { kind: 'media'; canonicalUrl: string };

let client: TranscriptClient | null = null;

export function normalizeYouTubeUrl(url: string): string | null {
  const value = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
  if (!allowedHosts.has(hostname)) return null;
  let videoId: string | null = null;

  if (hostname === 'youtu.be') {
    videoId = parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(hostname)) {
    if (/^\/watch\/?$/.test(parsed.pathname)) {
      videoId = parsed.searchParams.get('v')?.match(/^([A-Za-z0-9_-]{11})$/)?.[1] ?? null;
    } else {
      videoId = parsed.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:\/)?$/)?.[1] ?? null;
    }
  }

  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export function extractVideoId(url: string): string {
  const canonicalUrl = normalizeYouTubeUrl(url);
  if (!canonicalUrl) throw new AIInputError('Enter a valid YouTube video URL.');
  return new URL(canonicalUrl).searchParams.get('v')!;
}

export async function getYouTubeSource(url: string): Promise<YouTubeSource> {
  const canonicalUrl = normalizeYouTubeUrl(url);
  if (!canonicalUrl) throw new AIInputError('Enter a valid YouTube video URL.');
  const videoId = new URL(canonicalUrl).searchParams.get('v')!;

  try {
    if (!client) client = createTranscriptClient();

    await client.ready;
    const result = await client.getTranscript(videoId);
    const transcript = normalizeTranscriptSegments(result?.transcript);
    if (transcript) return { kind: 'transcript', text: transcript, canonicalUrl };
  } catch (error) {
    console.error('YouTube transcript retrieval failed.', error);
    client = null;
  }

  try {
    const transcript = await fetchTranscriptFromWatchPage(canonicalUrl);
    if (transcript) return { kind: 'transcript', text: transcript, canonicalUrl };
  } catch (error) {
    console.error('YouTube watch-page transcript fallback failed.', error);
  }

  return { kind: 'media', canonicalUrl };
}

export async function getYouTubeTranscript(url: string): Promise<string> {
  const source = await getYouTubeSource(url);
  if (source.kind === 'media') {
    throw new AIInputError(
      'A transcript could not be retrieved for this video because captions are unavailable or YouTube blocked this request.'
    );
  }
  return source.text;
}

function createTranscriptClient(): TranscriptClient {
  return new TranscriptClient({
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36' },
  });
}

function normalizeTranscriptSegments(transcript: unknown): string {
  if (!Array.isArray(transcript)) return '';
  const transcriptParts: string[] = [];
  let transcriptLength = 0;
  for (const segment of transcript) {
    if (!segment || typeof segment !== 'object' || !('text' in segment)) continue;
    const text = cleanCaptionText(String(segment.text));
    if (!text) continue;
    transcriptLength += text.length;
    if (transcriptLength > MAX_AI_TEXT_CHARACTERS) {
      throw new AIInputError(`Video transcripts must be ${MAX_AI_TEXT_CHARACTERS.toLocaleString()} characters or fewer.`);
    }
    transcriptParts.push(text);
  }
  return transcriptParts.join(' ').trim().slice(0, MAX_AI_TEXT_CHARACTERS);
}

async function fetchTranscriptFromWatchPage(canonicalUrl: string): Promise<string> {
  const response = await fetch(canonicalUrl, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
    },
  });
  if (!response.ok) return '';

  const html = await response.text();
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/);
  if (!playerMatch) return '';

  const playerResponse = JSON.parse(playerMatch[1]) as {
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: Array<{
          baseUrl?: string;
          languageCode?: string;
          kind?: string;
        }>;
      };
    };
  };
  const tracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) return '';

  const rankedTracks = [...tracks].sort((left, right) => {
    const rank = (track: typeof left) => {
      const isEnglish = track.languageCode?.toLowerCase().startsWith('en') ? 0 : 1;
      const isManual = track.kind === 'asr' ? 1 : 0;
      return isEnglish * 2 + isManual;
    };
    return rank(left) - rank(right);
  });

  for (const track of rankedTracks) {
    if (!track.baseUrl) continue;
    const separator = track.baseUrl.includes('?') ? '&' : '?';
    const captionResponse = await fetch(`${track.baseUrl}${separator}fmt=vtt`, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      },
    });
    if (!captionResponse.ok) continue;
    const transcript = parseCaptionText(await captionResponse.text());
    if (transcript) return transcript.slice(0, MAX_AI_TEXT_CHARACTERS);
  }

  return '';
}

function parseCaptionText(caption: string): string {
  if (!caption.trim()) return '';

  try {
    if (caption.trimStart().startsWith('{')) {
      const json = JSON.parse(caption) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
      const text = (json.events ?? [])
        .flatMap(event => event.segs ?? [])
        .map(segment => segment.utf8 ?? '')
        .join('');
      const cleaned = cleanCaptionText(text);
      if (cleaned) return cleaned;
    }
  } catch {
    // Fall through to WEBVTT/XML parsing.
  }

  const lines = caption
    .replace(/\r\n?/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line =>
      line &&
      line !== 'WEBVTT' &&
      !/^Kind:\s/.test(line) &&
      !/^Language:\s/.test(line) &&
      !/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+/.test(line)
    );

  const uniqueLines: string[] = [];
  for (const line of lines) {
    if (uniqueLines[uniqueLines.length - 1] !== line) uniqueLines.push(line);
  }
  return cleanCaptionText(uniqueLines.join(' '));
}

function cleanCaptionText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
