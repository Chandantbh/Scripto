import { Metadata } from 'next';
import ExamPageClient from './page-client';

export const metadata: Metadata = {
  title: 'AI Exam Prep',
  description: 'Simulate full exams to test your readiness. AI generates questions based on your study materials.',
  openGraph: {
    title: 'AI Exam Prep | Scripto',
    description: 'Master your subjects with AI-generated practice exams.',
  }
};

export default function ExamPage() {
  return <ExamPageClient />;
}
