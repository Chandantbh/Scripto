import { Metadata } from 'next';
import { Suspense } from 'react';
import QuizPageClient from './page-client';

export const metadata: Metadata = {
  title: 'AI Quiz Generator',
  description: 'Generate multiple-choice quizzes to practice for exams. Customize difficulty and question count.',
  openGraph: {
    title: 'AI Quiz Generator | Scripto',
    description: 'Test yourself with AI-generated quizzes tailored to your study material.',
  }
};

export default function QuizPage() {
  return (
    <Suspense fallback={null}>
      <QuizPageClient />
    </Suspense>
  );
}
