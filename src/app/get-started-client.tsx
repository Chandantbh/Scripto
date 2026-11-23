'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BrainCircuit,
  ClipboardCheck,
  FileText,
  Flame,
  Layers,
  MessageCircleQuestion,
  Network,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { enableGuestMode } from '@/lib/guest-mode';

const features = [
  { icon: FileText, title: 'Structured Study Notes', copy: 'Turn lecture walls, PDFs, DOCX files, and YouTube links into clean, exportable Markdown and PDF guides.' },
  { icon: ClipboardCheck, title: 'Active Recall Quizzes', copy: 'Get instant multiple-choice checks from your material, with score tracking and XP rewards.' },
  { icon: Layers, title: 'Spaced Flashcards', copy: 'Flip-card decks built around key concepts so formulas and definitions actually stick.' },
  { icon: MessageCircleQuestion, title: 'ELI5 Breakdowns', copy: 'Turn dense, jargon-heavy topics into plain English when the textbook makes zero sense.' },
  { icon: Network, title: 'Visual Concept Maps', copy: 'Explore interactive node-and-edge graphs showing how every concept connects at a glance.' },
  { icon: Flame, title: 'Timed Exam Prep & Streaks', copy: 'Practice with timed exams, AI feedback, daily study streaks, and progress tracking.' },
];

export default function GetStartedClient({
  isSignedIn,
  isGuest,
}: {
  isSignedIn: boolean;
  isGuest: boolean;
}) {
  const router = useRouter();
  const hasAccess = isSignedIn || isGuest;

  const continueAsGuest = () => {
    enableGuestMode();
    router.push('/workspace');
  };

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10">
        <Link href="/" className="flex items-center gap-3 font-heading text-3xl font-extrabold tracking-tight">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border bg-card">
            <BrainCircuit className="h-7 w-7" />
          </span>
          Scripto
        </Link>
        <div className="flex items-center gap-2">
          {!isSignedIn && (
            <Link href="/sign-in"><Button variant="ghost" size="sm">Sign in</Button></Link>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-12 pt-8 md:px-10">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-semibold text-muted-foreground">A study workspace built for recall</p>
            <h1 className="font-heading text-5xl leading-[1.06] tracking-tight md:text-7xl">
              Stop rereading. Start actually remembering.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Drop your notes, PDFs, or 2-hour lecture links. Scripto turns topics and documents into structured
              notes and active recall sessions before the exam cooks you.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {hasAccess ? (
                <Link href="/workspace"><Button size="lg" className="h-12 px-5">Open workspace →</Button></Link>
              ) : (
                <>
                  <Link href="/sign-up"><Button size="lg" className="h-12 px-5">Get started →</Button></Link>
                  <Button variant="ghost" size="lg" className="h-12 px-4" onClick={continueAsGuest}>Continue as guest</Button>
                </>
              )}
              {hasAccess ? (
                <a href="#features"><Button variant="ghost" size="lg" className="h-12 px-4">Explore features</Button></a>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_12px_40px_rgba(37,99,235,0.08)]">
            <p className="text-sm font-semibold text-foreground">How a Study Session Works</p>
            <div className="mt-4 space-y-2">
              {[
                ['01', 'Drop any source', 'Topic, PDF, YouTube'],
                ['02', 'Read & test', 'in the 2-pane studio'],
                ['03', 'Lock in recall', 'with quizzes & cards'],
              ].map(([number, title, detail], index) => (
                <div key={number} className="flex items-start gap-3 rounded-xl bg-muted/50 px-4 py-3">
                  <span className="mt-0.5 text-xs font-bold text-[#2563EB]">{number}</span>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
                  </div>
                  {index < 2 && <span className="sr-only">Next step</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 pb-20 md:px-10">
        <div className="mb-6">
          <p className="text-sm font-semibold text-muted-foreground">The whole study loop</p>
          <h2 className="mt-2 text-2xl font-semibold">Six tools. One workspace.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(feature => (
            <article key={feature.title} className="hover-column rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-150 ease-out hover:border-[#93C5FD]">
              <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-[#EFF6FF] text-[#2563EB] dark:border-[#1F2229] dark:bg-[rgba(59,130,246,0.14)] dark:text-[#60A5FA]">
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-12 md:flex-row md:items-center md:px-10">
          <div>
            <h2 className="text-2xl font-semibold">Your next study session can start here.</h2>
            <p className="mt-2 text-sm text-muted-foreground">Try the workspace now or save progress across devices.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasAccess ? (
              <Link href="/workspace"><Button>Open workspace →</Button></Link>
            ) : (
              <>
                <Button variant="outline" onClick={continueAsGuest}>Continue as guest</Button>
                <Link href="/sign-up"><Button>Create free account <ArrowRight className="h-4 w-4" /></Button></Link>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground sm:flex-row md:px-10">
          <p>© 2026 Scripto. All rights reserved.</p>
          <a
            href="https://github.com/Chandantbh/Scripto"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}
