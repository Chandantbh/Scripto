'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrainCircuit, Loader2, Wand2, Layers, BookOpen, Upload, Download, FileType, Youtube, ChevronDown, FileJson } from 'lucide-react';

import { generateFlashcards, type GenerateFlashcardsOutput, type GenerateFlashcardsInput } from '@/ai/flows/generate-flashcards';
import { generateFromTopic } from '@/ai/flows/generate-from-topic';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import FlashcardsDisplay from '@/components/app/flashcards-display';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { extractTextFromFile } from '@/lib/file-parser';
import AIErrorBanner from '@/components/app/ai-error-banner';
import { classifyAIError, unwrapAIActionResult } from '@/lib/ai-action-result';
import GenerationSkeleton from '@/components/app/generation-skeleton';
import { useAuth } from '@clerk/nextjs';
import { reserveGuestGeneration } from '@/lib/guest-mode';
import { getDueFlashcardCount, getDueFlashcards, scheduleFlashcard, readFlashcardReviews, REVIEW_STORAGE_KEY, initializeFlashcardDeck, type FlashcardReview, type ReviewCard } from '@/lib/spaced-repetition';
import { getFlashcardReviewsAction, syncFlashcardReviewsAction } from '@/app/actions/user-data';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';

type InputMode = 'text' | 'topic' | 'youtube' | 'file';

interface GeneratedContent {
    flashcards: GenerateFlashcardsOutput['flashcards'];
    notes?: string;
    quiz?: { questions: any[] };
    imageHint?: string;
    sourceTopic?: string;
}

export default function FlashcardsPage() {
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [dueCards, setDueCards] = useState<ReviewCard[]>([]);
  const [composerOpen, setComposerOpen] = useState(true);
  const [isDrilling, setIsDrilling] = useState(false);
  const [currentCards, setCurrentCards] = useState<GenerateFlashcardsOutput['flashcards']>([]);
  const [viewerKey, setViewerKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationInProgressRef = useRef(false);

  useEffect(() => {
    setGeneratedContent(null);
    setComposerOpen(true);
  }, []);

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'topic') setInputMode('topic');
    if (mode === 'text') setInputMode('text');
    if (mode === 'youtube') setInputMode('youtube');
    if (mode === 'file') setInputMode('file');
    if (searchParams.get('text')) setText(searchParams.get('text') ?? '');
    if (searchParams.get('topic')) setTopic(searchParams.get('topic') ?? '');
    if (searchParams.get('url')) setYoutubeUrl(searchParams.get('url') ?? '');
  }, [searchParams]);

  useEffect(() => {
    const refreshDue = () => {
      const reviews = readFlashcardReviews();
      setDueCount(getDueFlashcardCount(new Date(), reviews));
      setDueCards(getDueFlashcards(new Date(), reviews));
    };
    refreshDue();
    if (isSignedIn) {
      void getFlashcardReviewsAction().then(serverReviews => {
        if (serverReviews.length === 0) return;
        const local = readFlashcardReviews();
        const merged = new Map<string, FlashcardReview>();
        for (const review of local) merged.set(review.key, review);
        for (const review of serverReviews) {
          const serverReview = review as FlashcardReview;
          const existing = merged.get(serverReview.key);
          if (!existing || new Date(serverReview.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
            merged.set(serverReview.key, serverReview);
          }
        }
        const result = [...merged.values()];
        window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(result));
        setDueCount(getDueFlashcardCount(new Date(), result));
        setDueCards(getDueFlashcards(new Date(), result));
      });
    }
  }, [isSignedIn]);

  const handleReview = async (card: ReviewCard, rating: 'again' | 'good' | 'easy') => {
    const reviews = scheduleFlashcard(card, rating);
    const scheduled = reviews.find(review => review.card.question === card.question && review.card.answer === card.answer);
    const interval = scheduled?.intervalMinutes ?? 0;
    const feedback = rating === 'again'
      ? 'Scheduled: Next review is due immediately'
      : interval >= 24 * 60
        ? `Scheduled: Next review in ${interval >= 48 * 60 ? Math.round(interval / 1440) : 1} day${interval >= 2880 ? 's' : ''}`
        : `Scheduled: Next review in ${interval} minutes`;
    toast({ title: feedback });
    setDueCount(getDueFlashcardCount(new Date(), reviews));
    setDueCards(getDueFlashcards(new Date(), reviews));
    if (isSignedIn) {
      await syncFlashcardReviewsAction(reviews);
    }
  };

  const handleDrillDue = () => {
    const now = Date.now();
    const cards = readFlashcardReviews()
      .filter(review => new Date(review.nextReviewAt ?? review.dueAt).getTime() <= now)
      .map(review => review.card);
    if (cards.length > 0) {
      const drillingCards = cards.map(card => ({
        question: card.question,
        answer: card.answer,
        emoji: card.emoji ?? '🧠',
        color: card.color ?? 'blue',
      }));
      setCurrentCards(drillingCards);
      setGeneratedContent({ flashcards: drillingCards, sourceTopic: 'Due-card review' });
      setViewerKey(key => key + 1);
      setIsDrilling(true);
      setComposerOpen(false);
      requestAnimationFrame(() => {
        document.getElementById('generated-flashcards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      setGenerationError('Nothing is due right now. Your next review card will appear here.');
    }
  };

  const handleBackToGenerator = () => {
    setIsDrilling(false);
    setComposerOpen(true);
    setGeneratedContent(null);
    setCurrentCards([]);
  };

  const handleExportAnki = () => {
    if (!generatedContent?.flashcards?.length) return;
    const escapeCsv = (value: string) => {
      const cleaned = value.replace(/\r?\n/g, ' ').replace(/"/g, '""');
      return `"${cleaned}"`;
    };
    const rows = ['"Front","Back"', ...generatedContent.flashcards.map(card =>
      `${escapeCsv(card.question)},${escapeCsv(card.answer)}`
    )];
    const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scripto-anki-cards.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (!generatedContent?.flashcards?.length) return;
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text('Scripto Printable Study Sheet', 14, y);
    y += 12;
    generatedContent.flashcards.forEach((card, index) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      const question = doc.splitTextToSize(`Q${index + 1}: ${card.question}`, 180) as string[];
      doc.text(question, 14, y);
      y += question.length * 5 + 3;
      doc.setFont('helvetica', 'normal');
      const answer = doc.splitTextToSize(`A: ${card.answer}`, 180) as string[];
      doc.text(answer, 14, y);
      y += answer.length * 5 + 8;
    });
    doc.save('scripto-study-sheet.pdf');
  };

  const handleExportJson = () => {
    if (!generatedContent?.flashcards?.length) return;
    const blob = new Blob([JSON.stringify(generatedContent.flashcards, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scripto-flashcards.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleGenerate = async () => {
    if (generationInProgressRef.current) return;
    if (!reserveGuestGeneration(Boolean(isSignedIn))) return;
    generationInProgressRef.current = true;
    setIsLoading(true);
    setGenerationError(null);
    setGeneratedContent(null);

    try {
       let result: GeneratedContent;

        const shortTextTopic = inputMode === 'text' && text.trim().length > 0 && text.trim().length < 100
          ? text.trim()
          : null;

        if (inputMode === 'topic' || shortTextTopic) {
            const resolvedTopic = shortTextTopic ?? topic.trim();
            if (!resolvedTopic) {
                setGenerationError('Enter a topic to generate flashcards.');
                setIsLoading(false);
                return;
            }
            const topicResult = unwrapAIActionResult(await generateFromTopic({ topic: resolvedTopic }));
            result = {
                flashcards: topicResult.flashcards,
                notes: topicResult.notes,
                quiz: topicResult.quiz,
                imageHint: topicResult.imageHint,
                sourceTopic: resolvedTopic,
            };
        } else {
            let input: GenerateFlashcardsInput = {};
             if (inputMode === 'text') {
                if (!text.trim()) {
                  setGenerationError('Enter text to generate flashcards.');
                  setIsLoading(false);
                  return;
                }
                input.text = text;
            } else if (inputMode === 'youtube') {
                if (!youtubeUrl.trim()) {
                  setGenerationError('Enter a YouTube video URL.');
                  setIsLoading(false);
                  return;
                }
                input.youtubeUrl = youtubeUrl;
            } else if (inputMode === 'file') {
                 const file = fileInputRef.current?.files?.[0];
                 if (!file) {
                     setGenerationError('Choose a file to generate flashcards.');
                     setIsLoading(false);
                     return;
                 }
                 if (file.size > 10 * 1024 * 1024) {
                   setGenerationError('This file is larger than 10 MB. Choose a smaller PDF, DOCX, or text file.');
                   setIsLoading(false);
                   return;
                 }
                 try {
                     const extractedText = await extractTextFromFile(file);
                     if (!extractedText.trim()) {
                         setGenerationError('No readable text was found in the selected file.');
                         setIsLoading(false);
                         return;
                     }
                    input.text = extractedText;
                 } catch (err) {
                    setGenerationError(err instanceof Error ? err.message : 'Could not read the file. Use a supported document no larger than 10 MB.');
                    setIsLoading(false);
                    return;
                }
            }
            result = unwrapAIActionResult(await generateFlashcards(input));
        }

      const initialized = initializeFlashcardDeck(result.flashcards);
      window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(initialized));
      setDueCount(getDueFlashcardCount(new Date(), initialized));
      setDueCards(getDueFlashcards(new Date(), initialized));
      setIsDrilling(false);
      setCurrentCards(result.flashcards);
      setViewerKey(key => key + 1);
      setGeneratedContent(result);
      setComposerOpen(false);
      if (isSignedIn) {
        void syncFlashcardReviewsAction(initialized);
      }
      requestAnimationFrame(() => {
        document.getElementById('generated-flashcards')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (error) {
      const friendly = classifyAIError(error);
      setGenerationError(friendly.message);
      toast({ variant: 'destructive', title: 'Could not generate flashcards', description: friendly.message });
    } finally {
      generationInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <GenerationSkeleton kind="cards" />;
    }

    if (!currentCards || currentCards.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <BrainCircuit className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Nothing to quiz yet. Feed me a topic first.</h3>
          <p className="text-sm text-muted-foreground">
            Enter some text, a topic, or import a file to get started.
          </p>
        </div>
      );
    }

    return (
      <FlashcardsDisplay
        key={viewerKey}
        flashcards={currentCards}
        onReview={isDrilling ? handleReview : undefined}
      />
    );
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-primary/10 rounded-full border border-primary/20">
          <Layers className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Generate Flashcards</h1>
            <Badge variant="secondary" className="border border-primary/20 bg-primary/10 text-primary">
              Due for review: {dueCount}
            </Badge>
          </div>
          <p className="text-muted-foreground">Create interactive flashcards to memorize key info.</p>
        </div>
        <Button variant="outline" onClick={handleDrillDue} disabled={dueCount === 0}>
          Drill due cards
        </Button>
        {generatedContent?.flashcards?.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleExportAnki}>Anki Deck (.csv)</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportPdf}>Printable Study Sheet (.pdf)</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportJson}>
                <FileJson className="mr-2 h-4 w-4" />
                Raw Deck (.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <AIErrorBanner
        message={generationError}
        onRetry={generationError ? handleGenerate : undefined}
        showSignIn={generationError?.toLowerCase().includes('sign in') ?? false}
      />
      {generatedContent && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{generatedContent.sourceTopic || 'Flashcard review'}</p>
            <p className="text-xs text-muted-foreground">
              {isDrilling ? 'Due-card drill' : 'Active flashcard practice'}
            </p>
          </div>
          {isDrilling ? (
            <Button variant="outline" size="sm" onClick={handleBackToGenerator}>
              Back to Generator
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setComposerOpen(true)}>
              + New topic / Edit input
            </Button>
          )}
        </div>
      )}
      <div className={generatedContent
        ? composerOpen ? 'mx-auto w-full max-w-3xl' : 'w-full'
        : 'mx-auto w-full max-w-3xl'}>
          <div className={`space-y-6 ${generatedContent && !composerOpen ? 'hidden' : ''}`}>
             <Card>
                <Tabs value={inputMode} onValueChange={(v) => {
                    setInputMode(v as InputMode);
                    setGenerationError(null);
                }} className="w-full">
                    <CardHeader>
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="text"><Layers className="mr-2 h-4 w-4"/>Text</TabsTrigger>
                            <TabsTrigger value="file"><FileType className="mr-2 h-4 w-4"/>File</TabsTrigger>
                            <TabsTrigger value="topic"><BookOpen className="mr-2 h-4 w-4"/>Topic</TabsTrigger>
                            <TabsTrigger value="youtube"><Youtube className="mr-2 h-4 w-4"/>YouTube</TabsTrigger>
                        </TabsList>
                    </CardHeader>
                    <CardContent>
                        <TabsContent value="text" className="mt-0">
                             <CardTitle className="mb-2 text-xl">Enter Your Study Material</CardTitle>
                             <CardDescription className="mb-4">Paste your text below to get started.</CardDescription>
                             <Textarea
                                placeholder="Paste the wall of text you're pretending to read..."
                                className="min-h-[250px] text-base"
                                value={text}
                                maxLength={15000}
                                onChange={(e) => setText(e.target.value)}
                            />
                        </TabsContent>
                        <TabsContent value="file" className="mt-0">
                            <CardTitle className="mb-2 text-xl">Upload Document</CardTitle>
                            <CardDescription className="mb-4">Upload a PDF, DOCX, or text file to generate flashcards from.</CardDescription>
                            <Input
                                type="file"
                                ref={fileInputRef}
                                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                            />
                        </TabsContent>
                        <TabsContent value="topic" className="mt-0">
                            <CardTitle className="mb-2 text-xl">Generate From Topic</CardTitle>
                            <CardDescription className="mb-4">Enter a topic and we'll generate the study materials for you.</CardDescription>
                            <Input
                                placeholder="Drop a topic before the syllabus humbles you..."
                                className="text-base h-12"
                                value={topic}
                                maxLength={200}
                                onChange={(e) => setTopic(e.target.value)}
                            />
                        </TabsContent>
                         <TabsContent value="youtube" className="mt-0">
                            <CardTitle className="mb-2 text-xl">Generate From YouTube</CardTitle>
                            <CardDescription className="mb-4">Enter a YouTube video URL and we'll create flashcards from its transcript.</CardDescription>
                            <Input
                                type="url"
                                placeholder="Paste that 2x-speed lecture link..."
                                value={youtubeUrl}
                                maxLength={2048}
                                onChange={(e) => setYoutubeUrl(e.target.value)}
                            />
                        </TabsContent>
                    </CardContent>
                    <CardFooter className="flex-col sm:flex-row gap-2">
                        <Button data-enter-submit="true" onClick={handleGenerate} disabled={isLoading} className="group relative w-full" size="lg">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                            Generate Flashcards
                        </Button>
                    </CardFooter>
                </Tabs>
            </Card>
          </div>

          <Card id="generated-flashcards" className={`${generatedContent && !composerOpen ? '' : 'mt-6'} min-h-[400px] lg:min-h-[600px] flex flex-col scroll-mt-24`}>
            <CardHeader>
              <CardTitle>Generated Flashcards</CardTitle>
              <CardDescription>Review your key concepts.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center justify-center">
              {renderContent()}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}
