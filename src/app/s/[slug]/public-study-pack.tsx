'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Layers, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import NotesDisplay from '@/components/app/notes-display';
import type { PublicStudyPack } from '@/app/actions/user-data';

interface PreviewItem {
  question: string;
  answer?: string;
  emoji?: string;
}

export default function PublicStudyPackClient({ pack }: { pack: PublicStudyPack }) {
  const [preview, setPreview] = useState<'quiz' | 'cards'>(
    pack.flashcards.length ? 'cards' : 'quiz',
  );
  const [flipped, setFlipped] = useState(false);
  const [index, setIndex] = useState(0);

  const quiz = pack.quiz as PreviewItem[];
  const cards = pack.flashcards as PreviewItem[];
  const items = preview === 'quiz' ? quiz : cards;
  const current = items[index % Math.max(items.length, 1)];

  const next = () => {
    setFlipped(false);
    setIndex(value => (value + 1) % Math.max(items.length, 1));
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Shared study pack</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight">{pack.title}</h1>
        </div>
        <Link href="/workspace">
          <Button>
            Study in my workspace
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Structured notes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <NotesDisplay
              notes={pack.notes}
              onPlayAudio={() => undefined}
              isSynthesizing={null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Review preview</CardTitle>
              <Layers className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 rounded-md bg-muted p-1">
              <Button
                variant={preview === 'quiz' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => { setPreview('quiz'); setIndex(0); setFlipped(false); }}
                disabled={quiz.length === 0}
              >
                Quiz
              </Button>
              <Button
                variant={preview === 'cards' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => { setPreview('cards'); setIndex(0); setFlipped(false); }}
                disabled={cards.length === 0}
              >
                Flashcards
              </Button>
            </div>

            {current ? (
              <button
                type="button"
                className="flex min-h-64 w-full flex-col items-center justify-center rounded-xl border border-border bg-background p-6 text-center"
                onClick={() => setFlipped(value => !value)}
              >
                {preview === 'cards' && current.emoji ? (
                  <span className="mb-4 text-4xl">{current.emoji}</span>
                ) : null}
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {flipped ? 'Answer' : 'Question'}
                </p>
                <p className="mt-3 text-lg font-semibold">
                  {flipped
                      ? current.answer
                      : current.question}
                </p>
                {preview === 'cards' ? (
                  <span className="mt-6 inline-flex items-center text-sm text-muted-foreground">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Tap to flip
                  </span>
                ) : null}
              </button>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                This study pack has no review items yet.
              </p>
            )}

            {items.length > 0 ? (
              <Button variant="secondary" className="mt-4 w-full" onClick={next}>
                Next
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
