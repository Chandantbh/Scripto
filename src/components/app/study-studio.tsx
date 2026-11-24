'use client';

import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, HelpCircle, Layers, Network, MessageCircle, Loader2 } from 'lucide-react';
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
import { explainLikeImFive } from '@/ai/flows/eli5';

type StudioTab = 'quiz' | 'cards' | 'map' | 'chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [items, setItems] = useState<{ question: string; answer?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const lastActionRef = useRef('');
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMastery(notes ? Math.min(100, 18 + Math.round(notes.length / 180)) : 0);
    setChatMessages([]);
    setQuestionText('');
  }, [notes]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    const shareListener = () => {
      void handleShare();
    };
    window.addEventListener('scripto:study-share', shareListener);
    return () => window.removeEventListener('scripto:study-share', shareListener);
  });

  useEffect(() => {
    if (!selectedAction || !selectedText) return;
    const actionKey = `${selectedAction}:${selectedText}`;
    if (lastActionRef.current === actionKey) return;
    lastActionRef.current = actionKey;
    if (selectedAction === 'explain') {
      setTab('chat');
      setQuestionText(`Explain this more simply: ${selectedText}`);
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

  const sendChatMessage = async (prompt = questionText) => {
    const message = prompt.trim();
    if (!message || chatLoading) return;
    if (!reserveGuestGeneration(Boolean(isSignedIn))) return;

    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: message }];
    setChatMessages(nextMessages);
    setQuestionText('');
    setChatLoading(true);
    try {
      const history = nextMessages
        .map(item => `${item.role === 'user' ? 'Student' : 'Tutor'}: ${item.content}`)
        .join('\n');
      const result = unwrapAIActionResult(await explainLikeImFive({
        text: `${notes}\n\nConversation so far:\n${history}\n\nRespond helpfully to the latest student question.`,
        difficulty: 'medium',
      }));
      setChatMessages(current => [
        ...current,
        { role: 'assistant', content: result.explanation },
      ]);
      setMastery(value => Math.min(100, value + 4));
    } catch (error) {
      setChatMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: 'I could not answer that follow-up right now. Please try sending it again.',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
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
          <span className="text-muted-foreground">{mastery}%</span>
        </div>
        <Progress value={mastery} className="h-1.5" />
      </div>
      <div className="grid grid-cols-4 border-b border-border">
        {([
          ['quiz', HelpCircle, 'Quiz'],
          ['cards', Layers, 'Flashcards'],
          ['map', Network, 'Concept Map'],
          ['chat', MessageCircle, 'Chat'],
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
        {tab === 'chat' && (
          <div className="flex min-h-[420px] flex-col">
            {chatMessages.length === 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  'Go deeper on this',
                  'Give a real-world example',
                  'What might appear on an exam?',
                ].map(prompt => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-auto whitespace-normal rounded-full px-3 py-1.5 text-xs"
                    onClick={() => void sendChatMessage(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {chatMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                    message.role === 'user'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {message.content}
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {chatMessages.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Go deeper',
                    'Give an example',
                    'Quiz me',
                  ].map(prompt => (
                    <Button
                      key={prompt}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full border border-border px-2.5 text-xs"
                      onClick={() => void sendChatMessage(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              )}
              <Textarea
                value={questionText}
                onChange={event => setQuestionText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendChatMessage();
                  }
                }}
                placeholder="Ask a follow-up..."
                className="min-h-20 resize-none"
              />
              <Button
                className="w-full"
                disabled={chatLoading || !questionText.trim()}
                onClick={() => void sendChatMessage()}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Send
              </Button>
            </div>
          </div>
        )}
      </div>
      <GuestAuthModal open={shareOpen} onOpenChange={setShareOpen} action="share" />
    </aside>
  );
}
