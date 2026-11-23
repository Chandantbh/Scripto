import { Metadata } from 'next';
import { Suspense } from 'react';
import NotesPageClient from './page-client';

export const metadata: Metadata = {
  title: 'AI Note Generator',
  description: 'Generate comprehensive study notes from text, PDFs, or YouTube videos instantly with AI.',
  openGraph: {
    title: 'AI Note Generator | Scripto',
    description: 'Turn any content into structured study notes in seconds.',
  }
};

export default function NotesPage() {
  return (
    <Suspense fallback={null}>
      <NotesPageClient />
    </Suspense>
  );
}
