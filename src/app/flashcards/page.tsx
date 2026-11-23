import { Metadata } from 'next';
import { Suspense } from 'react';
import FlashcardsPageClient from './page-client';

export const metadata: Metadata = {
  title: 'AI Flashcard Maker',
  description: 'Create flashcards automatically from your study materials using AI. Test your knowledge effectively.',
  openGraph: {
    title: 'AI Flashcard Maker | Scripto',
    description: 'Instant flashcards from your notes or textbooks.',
  }
};

export default function FlashcardsPage() {
  return (
    <Suspense fallback={null}>
      <FlashcardsPageClient />
    </Suspense>
  );
}
