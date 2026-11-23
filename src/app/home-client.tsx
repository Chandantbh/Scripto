'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BarChart3,
  ClipboardCheck,
  FileText,
  Layers3,
  MessageCircleQuestion,
  Network,
  Timer,
} from 'lucide-react';
import type { UserDashboardData } from '@/app/actions/user-data';

const tools = [
  {
    icon: FileText,
    title: 'Study Notes',
    href: '/notes',
    description: 'Turn topics, PDFs, or YouTube videos into structured study guides.',
  },
  {
    icon: ClipboardCheck,
    title: 'Active Recall Quiz',
    href: '/quiz',
    description: 'Test your memory with instant multiple-choice quizzes.',
  },
  {
    icon: Layers3,
    title: 'Flashcards',
    href: '/flashcards',
    description: 'Flip through key concepts and formulas until they stick.',
  },
  {
    icon: MessageCircleQuestion,
    title: 'ELI5 Explainer',
    href: '/eli5',
    description: 'Break down confusing topics into plain, simple English.',
  },
  {
    icon: Timer,
    title: 'Timed Exam',
    href: '/exam',
    description: 'Take a full practice test with AI grading and feedback.',
  },
  {
    icon: Network,
    title: 'Concept Map',
    href: '/concept-map',
    description: 'Explore how ideas connect on an interactive node graph.',
  },
  {
    icon: BarChart3,
    title: 'Progress & Streaks',
    href: '/progress',
    description: 'Check your XP, daily study streak, and past sessions.',
  },
  {
    icon: Award,
    title: 'Badges',
    href: '/achievements',
    description: 'View the milestones you have unlocked so far.',
  },
];

export default function HomeClient({
  firstName,
}: {
  isSignedIn: boolean;
  isGuest?: boolean;
  firstName: string | null;
  dashboard: UserDashboardData | null;
}) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16 pt-8 md:px-10">
      <div className="mb-10 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-card px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Get Started
        </Link>
      </div>

      <h1 className="mb-8 max-w-3xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
        What would you like to study today?
      </h1>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Study tools">
        {tools.map(tool => (
          <Link
            key={tool.title}
            href={tool.href}
            className="group hover-column flex min-h-32 flex-col justify-between rounded-xl border border-border bg-card p-5 transition-all duration-200 ease-out hover:border-[#2563EB] motion-reduce:transition-none"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-[#EFF6FF] text-[#2563EB] dark:border-[#1F2229] dark:bg-[rgba(59,130,246,0.14)] dark:text-[#60A5FA]">
                <tool.icon className="h-5 w-5" />
              </span>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{tool.title}</h2>
              <p className="mt-0 max-h-0 overflow-hidden text-sm leading-5 text-muted-foreground opacity-0 transition-all duration-200 ease-out group-hover:mt-2 group-hover:max-h-20 group-hover:opacity-100 motion-reduce:transition-none">
                {tool.description}
              </p>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
