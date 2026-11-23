'use client';

import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, HelpCircle, Layers, Network, Send, Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { generateQuiz } from '@/ai/flows/generate-quiz';
import { generateFlashcards } from '@/ai/flows/generate-flashcards';
import { unwrapAIActionResult } from '@/lib/ai-action-result';
import { reserveGuestGeneration } from '@/lib/guest-mode';
import { useAuth } from '@clerk/nextjs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import GuestAuthModal from '@/components/app/guest-auth-modal';
import { createStudyPackAction } from '@/app/actions/user-data';
import { useToast } from '@/hooks/use-toast';

type StudioTab = 'quiz' | 'cards' | 'map' | 'ask';

export type StudyAction = 'explain' | 'cards' | 'quiz';

export default function StudyStudio({
  notes,
  selectedText = '',
  selectedAction,
  title = 'Study Pack',
}: {
  notes: string;
  selectedText?: string;
  selectedAction?: StudyAction;
  title?: string;
}) {
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<StudioTab>('quiz');
  const [mastery, setMastery] = useState(18);
  const [questionText, setQuestionText] = useState('');
  const [answer, setAnswer] = useState('');
  const [items, setItems] = useState<{ question: string; answer?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const lastActionRef = useRef('');
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setMastery(notes ? Math.min(100, 18 + Math.round(notes.length / 180)) : 0);
  }, [notes]);

  useEffect(() => {
    if (!selectedAction || !selectedText) return;
    const actionKey = `${selectedAction}:${selectedText}`;
    if (lastActionRef.current === actionKey) return;
    lastActionRef.current = actionKey;
    if (selectedAction === 'explain') {
      setTab('ask');
      setQuestionText(`Explain this more simply: ${selectedText}`);
      setAnswer('');
    } else if (selectedAction === 'cards') {
      setTab('cards');
      void generateRecall('cards', selectedText);
    } else {
      setTab('quiz');
      void generateRecall('quiz', selectedText);
    }
  }, [selectedAction, selectedText]);

  const generateRecall = async (kind: 'quiz' | 'cards', focusText = '') => {
    if (!notes.trim()) return;
    if (!reserveGuestGeneration(Boolean(isSignedIn))) return;
    setLoading(true);
    try {
      const source = focusText ? `${notes}\n\nFocus especially on: ${focusText}` : notes;
      if (kind === 'quiz') {
        const result = unwrapAIActionResult(await generateQuiz({ text: source, questionCount: 5 }));
        setItems(result.questions.map(question => ({
          question: question.question,
          answer: question.answer,
        })));
        setMastery(value => Math.min(100, value + 12));
      } else {
        const result = unwrapAIActionResult(await generateFlashcards({ text: source }));
        setItems(result.flashcards.map(card => ({
          question: card.question,
          answer: card.answer,
        })));
        setMastery(value => Math.min(100, value + 8));
      }
    } finally {
      setLoading(false);
    }
  };

  const askMargin = () => {
    if (!questionText.trim()) return;
    setAnswer(`From the current notes: “${questionText.trim().replace(/\?+$/, '')}”`);
    setMastery(value => Math.min(100, value + 4));
  };

  const handleShare = async () => {
    if (!isSignedIn) {
      setShareOpen(true);
      return;
    }
    if (sharing) return;
    setSharing(true);
    try {
      const pack = await createStudyPackAction({
        title,
        notes,
        quiz: tab === 'quiz' ? items : [],
        flashcards: tab === 'cards' ? items : [],
      });
      if (!pack) {
        setShareOpen(true);
        return;
      }
      const url = `${window.location.origin}/s/${pack.slug}`;
      await navigator.clipboard.writeText(url);
      toast({
        title: 'Share link ready',
        description: 'The public study pack link was copied to your clipboard.',
      });
    } catch (error) {
      console.error('Could not create study pack.', error);
      toast({
        variant: 'destructive',
        title: 'Could not share',
        description: 'Please try creating the public study pack again.',
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <aside className="flex min-h-[560px] flex-col border-l border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">Topic mastery</span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{mastery}%</span>
            <Button variant="outline" size="sm" onClick={() => void handleShare()} disabled={sharing}>
              {sharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
              Share
            </Button>
          </div>
        </div>
        <Progress value={mastery} className="h-1.5" />
      </div>
      <div className="grid grid-cols-4 border-b border-border">
        {([
          ['quiz', HelpCircle, 'Quiz'],
          ['cards', Layers, 'Flashcards'],
          ['map', Network, 'Concept Map'],
          ['ask', Send, 'Ask Margin'],
        ] as const).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex flex-col items-center gap-1 px-1 py-3 text-[11px] ${tab === value ? 'border-b-2 border-foreground text-foreground' : 'text-muted-foreground'}`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === 'quiz' && (
          <div className="space-y-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button data-enter-submit="true" className="w-full" variant="secondary" disabled={loading} onClick={() => void generateRecall('quiz')}>
                  Generate quiz from these notes
                </Button>
              </TooltipTrigger>
              <TooltipContent>Enter ↵ to submit</TooltipContent>
            </Tooltip>
            {items.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setMastery(value => Math.min(100, value + 3))}
                className="w-full rounded-lg border border-border p-3 text-left"
              >
                <p className="text-sm font-medium">{item.question}</p>
                {item.answer && <p className="mt-2 text-xs text-muted-foreground">Answer: {item.answer}</p>}
              </button>
            ))}
          </div>
        )}
        {tab === 'cards' && (
          <div className="space-y-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button data-enter-submit="true" className="w-full" variant="secondary" disabled={loading} onClick={() => void generateRecall('cards')}>
                  Make flashcards
                </Button>
              </TooltipTrigger>
              <TooltipContent>Enter ↵ to submit</TooltipContent>
            </Tooltip>
            {items.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setMastery(value => Math.min(100, value + 4))}
                className="w-full rounded-lg border border-border p-3 text-left"
              >
                <p className="text-sm font-medium">{item.question}</p>
                {item.answer && <p className="mt-2 text-xs text-muted-foreground">{item.answer}</p>}
              </button>
            ))}
          </div>
        )}
        {tab === 'map' && (
          <div className="relative min-h-64 rounded-lg border border-dashed border-border p-4">
            {notes
              .split('\n')
              .filter(line => /^#{1,3}\s/.test(line))
              .slice(0, 6)
              .map((line, index) => (
                <div
                  key={line}
                  className="mx-auto mb-3 w-fit rounded-md border border-border bg-background px-3 py-2 text-xs"
                  style={{ marginLeft: `${(index % 3) * 12}%` }}
                >
                  {line.replace(/^#+\s/, '')}
                </div>
              ))}
            {notes && !/^#{1,3}\s/m.test(notes) && (
              <div className="grid min-h-56 place-items-center text-sm text-muted-foreground">
                <span className="flex items-center gap-2"><BrainCircuit className="h-4 w-4" /> Topic map ready</span>
              </div>
            )}
          </div>
        )}
        {tab === 'ask' && (
          <div className="space-y-3">
            <Textarea
              value={questionText}
              onChange={event => setQuestionText(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  askMargin();
                }
              }}
              placeholder="Ask about the current notes..."
              className="min-h-24"
            />
            <Button className="w-full" onClick={askMargin}>Ask in margin</Button>
            {answer && <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{answer}</div>}
          </div>
        )}
      </div>
      <GuestAuthModal open={shareOpen} onOpenChange={setShareOpen} action="share" />
    </aside>
  );
}
