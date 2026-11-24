
'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrainCircuit, Loader2, Wand2, FileQuestion, BookOpen, Upload, Download, FileType, Youtube } from 'lucide-react';

import { generateQuiz, type GenerateQuizInput } from '@/ai/flows/generate-quiz';
import { type QuizQuestion } from '@/ai/schemas/quiz-schemas';
import { generateFromTopic } from '@/ai/flows/generate-from-topic';
import { textToSpeech } from '@/ai/flows/text-to-speech';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import QuizDisplay from '@/components/app/quiz-display';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { extractTextFromFile } from '@/lib/file-parser';
import AudioPlayer from '@/components/app/audio-player';
import { achievements } from '@/lib/achievements';
import { recordActivityAction, recordStudyAttemptAction, syncStudyFlashcardsAction } from '@/app/actions/user-data';
import { recordActivityLocally, type ActivityProgressUpdate, type ActivityInput } from '@/lib/gamification';
import AIErrorBanner from '@/components/app/ai-error-banner';
import { classifyAIError, unwrapAIActionResult } from '@/lib/ai-action-result';
import GenerationSkeleton from '@/components/app/generation-skeleton';
import { readStudyPreferences } from '@/components/app/settings-dialog';
import { useAuth } from '@clerk/nextjs';
import { reserveGuestGeneration } from '@/lib/guest-mode';
import { readWeakTopics, recordWeakTopics, WEAK_TOPICS_STORAGE_KEY } from '@/lib/weak-topics';
import { initializeFlashcardDeck, readFlashcardReviews, REVIEW_STORAGE_KEY } from '@/lib/spaced-repetition';
import { calculateTopicMastery } from '@/lib/topic-mastery';

type InputMode = 'from-text' | 'from-topic' | 'from-youtube' | 'from-file';

interface Question {
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
  emoji?: string;
}

interface GeneratedContent {
    notes?: string;
    quiz: { questions: Question[] };
    flashcards?: any[];
    imageHint?: string;
    sourceTopic?: string;
}


export default function QuizPage() {
  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();
  const [inputMode, setInputMode] = useState<InputMode>('from-text');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationInProgressRef = useRef(false);
  const [composerOpen, setComposerOpen] = useState(true);
  const [weakTopics, setWeakTopics] = useState(() => readWeakTopics());
  const [weakMode, setWeakMode] = useState(false);
  const missedQuestionsRef = useRef<Question[]>([]);
  const quizStartedAtRef = useRef(Date.now());

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'topic') setInputMode('from-topic');
    if (mode === 'text') setInputMode('from-text');
    if (mode === 'youtube') setInputMode('from-youtube');
    if (mode === 'file') setInputMode('from-file');
    if (searchParams.get('text')) setText(searchParams.get('text') ?? '');
    if (searchParams.get('topic')) setTopic(searchParams.get('topic') ?? '');
    if (searchParams.get('url')) setYoutubeUrl(searchParams.get('url') ?? '');
  }, [searchParams]);

  useEffect(() => {
    const refresh = () => setWeakTopics(readWeakTopics());
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  useEffect(() => {
    if (searchParams.get('weak') === '1') {
      setWeakMode(true);
      const weak = readWeakTopics();
      if (weak.length) {
        setGeneratedContent({
          quiz: {
            questions: weak.slice(0, 15).map(item => ({
              question: item.question,
              options: [item.answer, 'Review this concept again', 'None of the above', 'Unsure'],
              answer: item.answer,
              explanation: item.answer,
              emoji: '🎯',
            })),
          },
          sourceTopic: 'Weak-topic review',
        });
        setComposerOpen(false);
      }
    }
  }, [searchParams]);

  const handleDrillWeakTopics = () => {
    const weak = readWeakTopics();
    if (!weak.length) {
      setGenerationError('No weak topics recorded yet. Missed questions will appear here.');
      return;
    }
    setWeakMode(true);
    setGeneratedContent({
      quiz: {
        questions: weak.slice(0, 15).map(item => ({
          question: item.question,
          options: [item.answer, 'Review this concept again', 'None of the above', 'Unsure'],
          answer: item.answer,
          explanation: item.answer,
          emoji: '🎯',
        })),
      },
      sourceTopic: 'Weak-topic review',
    });
    setComposerOpen(false);
  };

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState<string | null>(null);

  const handlePlayAudio = async (textToPlay: string, id: string) => {
      if (isSynthesizing === id) return;
      
      setGenerationError(null);
      setIsSynthesizing(id);
      setAudioSrc(null);

      try {
          const { audioDataUri } = unwrapAIActionResult(await textToSpeech({ text: textToPlay }));
          setAudioSrc(audioDataUri);
      } catch (error) {
          const friendly = classifyAIError(error);
          setGenerationError(friendly.message);
          toast({ variant: 'destructive', title: 'Could not create audio', description: friendly.message });
      } finally {
          setIsSynthesizing(null);
      }
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
      if (inputMode === 'from-topic') {
        if (!topic.trim()) {
            setGenerationError('Enter a topic to generate a quiz.');
            setIsLoading(false);
            return;
        }
        const preferences = readStudyPreferences();
        const topicResult = unwrapAIActionResult(await generateFromTopic({
          topic,
          noteFormat: preferences.noteFormat,
          quizLength: preferences.quizLength,
        }));
        if (topicResult.quiz && topicResult.quiz.questions) {
           result = { 
                notes: topicResult.notes,
                quiz: { questions: mapQuizQuestions(topicResult.quiz.questions) },
                flashcards: topicResult.flashcards,
                imageHint: topicResult.imageHint,
                sourceTopic: topic,
            };
        } else {
          throw new Error("Quiz could not be generated from the topic.");
        }
      } else { // from-text or from-youtube
        let quizInput: GenerateQuizInput = {};
        if (inputMode === 'from-text') {
            if (!text.trim()) {
                setGenerationError('Enter text to generate a quiz.');
                setIsLoading(false);
                return;
            }
            quizInput.text = text;
        } else if (inputMode === 'from-youtube') {
            if (!youtubeUrl.trim()) {
                setGenerationError('Enter a YouTube video URL.');
                setIsLoading(false);
                return;
            }
            quizInput.youtubeUrl = youtubeUrl;
        } else if (inputMode === 'from-file') {
             const file = fileInputRef.current?.files?.[0];
             if (!file) {
                 setGenerationError('Choose a file to generate a quiz.');
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
                quizInput.text = extractedText;
             } catch (err) {
                setGenerationError('Could not read the file. Use a supported document no larger than 10 MB.');
                setIsLoading(false);
                return;
            }
        }
        const textResult = unwrapAIActionResult(await generateQuiz({
          ...quizInput,
          questionCount: readStudyPreferences().quizLength,
        }));
        result = { quiz: { questions: mapQuizQuestions(textResult.questions) } }
      }
      quizStartedAtRef.current = Date.now();
      setGeneratedContent(result);
      setComposerOpen(false);
    } catch (error) {
      const friendly = classifyAIError(error);
      setGenerationError(friendly.message);
      toast({ variant: 'destructive', title: 'Could not generate quiz', description: friendly.message });
    } finally {
      generationInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  // Removed unused handleFileUpload
  
  const saveQuizResult = async (score: number, totalQuestions: number) => {
    const resultTopic = generatedContent?.sourceTopic
      || (inputMode === 'from-topic' ? topic : inputMode === 'from-youtube' ? 'YouTube Video' : 'Custom Content');

    const activity: ActivityInput = {
      type: 'quiz',
      topic: resultTopic,
      score,
      total: totalQuestions,
    };

    let update: Pick<ActivityProgressUpdate, 'earnedXp' | 'newAchievements'> | null = null;
    let syncUnavailable = false;
    const saveLocally = () => {
      try {
        return recordActivityLocally(activity);
      } catch (error) {
        console.error('Could not save quiz activity on this device.', error);
        toast({
          variant: 'destructive',
          title: 'Progress Not Saved',
          description: 'Could not save this result. Please try again.',
        });
        return null;
      }
    };
    try {
      update = await recordActivityAction(activity);
      if (!update) update = saveLocally();
    } catch (error) {
      console.error('Could not sync quiz activity.', error);
      syncUnavailable = true;
      update = saveLocally();
    }

    if (!update) return;
    const masteryInput = {
      sourceTitle: resultTopic,
      mode: 'quiz' as const,
      score,
      total: totalQuestions,
      durationSeconds: Math.max(0, Math.floor((Date.now() - quizStartedAtRef.current) / 1000)),
      missedQuestions: missedQuestionsRef.current.map(question => ({
        prompt: question.question,
        explanation: question.explanation,
      })),
    };
    try {
      await recordStudyAttemptAction(masteryInput);
    } catch (error) {
      console.error('Could not sync quiz attempt and topic mastery.', error);
      syncUnavailable = true;
    }
    updateLocalTopicMastery(resultTopic, (score / totalQuestions) * 100);
    toast({
      title: `+${update.earnedXp} XP Earned!`,
      description: syncUnavailable
        ? 'Progress sync is unavailable; your result was saved on this device.'
        : 'Your progress has been saved.',
    });
    update.newAchievements.forEach(id => {
      const achievement = achievements.find(item => item.id === id);
      if (achievement) {
        toast({
          title: `Achievement Unlocked: ${achievement.name}!`,
          description: achievement.description,
          className: 'bg-accent text-accent-foreground',
        });
      }
    });
  }


  const renderContent = () => {
    if (isLoading) {
      return <GenerationSkeleton kind="cards" />;
    }

    if (!generatedContent || !generatedContent.quiz || !generatedContent.quiz.questions) {
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
        <QuizDisplay 
            questions={generatedContent.quiz.questions} 
            onQuizSubmit={saveQuizResult}
            onMissedQuestions={missed => {
              missedQuestionsRef.current = missed;
              recordWeakTopics(missed.map(question => ({
                question: question.question,
                answer: question.answer,
                concept: generatedContent.sourceTopic || 'Quiz',
                source: 'quiz',
              })));
            }}
            onConvertMissedQuestions={async missed => {
              const now = new Date();
              const cards = missed.map(question => ({
                question: question.question,
                answer: `${question.answer}\n\n${question.explanation}`,
              }));
              const existing = readFlashcardReviews();
              const knownKeys = new Set(existing.map(review => review.key));
              const initializedDeck = initializeFlashcardDeck(cards, now, existing);
              const deck = initializedDeck.map(review => knownKeys.has(review.key)
                ? review
                : { ...review, sourceTitle: generatedContent.sourceTopic || 'Quiz review' });
              window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(deck));
              const newCards = deck.filter(review => !knownKeys.has(review.key));
              try {
                await syncStudyFlashcardsAction(newCards.map(review => ({
                  id: review.id ?? crypto.randomUUID(),
                  sourceTitle: review.sourceTitle ?? generatedContent.sourceTopic ?? 'Quiz review',
                  front: review.card.question,
                  back: review.card.answer,
                  ease: review.ease,
                  intervalDays: review.intervalDays,
                  reps: review.reps,
                  dueAt: review.dueAt,
                  lastReviewedAt: review.lastReviewedAt ?? null,
                  starred: review.starred ?? false,
                })));
                toast({ title: 'Missed questions added to flashcards.' });
              } catch (error) {
                console.error('Could not sync missed-question flashcards.', error);
                toast({ title: 'Flashcards saved on this device', description: 'Account sync is unavailable.', variant: 'destructive' });
              }
            }}
            onPlayAudio={handlePlayAudio}
            isSynthesizing={isSynthesizing}
        />
    );
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
       <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-primary/10 rounded-full border border-primary/20">
          <FileQuestion className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Generate Quiz</h1>
          <p className="text-muted-foreground">Test your knowledge on any topic.</p>
        </div>
        <Button variant="outline" className="ml-auto" onClick={handleDrillWeakTopics} disabled={weakTopics.length === 0}>
          Drill Weak Topics
        </Button>
      </div>
       <AIErrorBanner
         message={generationError}
         onRetry={generationError ? handleGenerate : undefined}
         showSignIn={generationError?.toLowerCase().includes('sign in') ?? false}
       />
        {generatedContent && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{generatedContent.sourceTopic || 'Custom quiz'}</p>
              <p className="text-xs text-muted-foreground">Active quiz practice</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setComposerOpen(true)}>
              + New topic / Edit input
            </Button>
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
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="from-text"><FileQuestion className="mr-2"/>Use my text</TabsTrigger>
                            <TabsTrigger value="from-topic"><BookOpen className="mr-2"/>From a topic</TabsTrigger>
                            <TabsTrigger value="from-youtube"><Youtube className="mr-2"/>From YouTube</TabsTrigger>
                        </TabsList>
                    </CardHeader>
                    <CardContent>
                        <TabsContent value="from-text">
                             <CardTitle className="mb-2 text-xl">Enter Your Study Material</CardTitle>
                             <CardDescription className="mb-4">Paste your text or import a document below to get started.</CardDescription>
                             <Textarea
                                placeholder="Paste the wall of text you're pretending to read..."
                                className="min-h-[250px] text-base"
                                value={text}
                                maxLength={15000}
                                onChange={(e) => setText(e.target.value)}
                            />
                        </TabsContent>
                         <TabsContent value="from-topic">
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
                        <TabsContent value="from-youtube">
                             <CardTitle className="mb-2 text-xl">Generate From YouTube</CardTitle>
                             <CardDescription className="mb-4">Enter a video URL and we'll make a quiz from its transcript.</CardDescription>
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
                            Generate Quiz
                        </Button>
                    </CardFooter>
                </Tabs>
            </Card>
            <AudioPlayer src={audioSrc} onEnded={() => setAudioSrc(null)} />
          </div>

          <Card className={`${generatedContent && !composerOpen ? '' : 'mt-6'} min-h-[400px] lg:min-h-[600px] flex flex-col`}>
            <CardHeader>
              <CardTitle>Generated Quiz</CardTitle>
              <CardDescription>Test your knowledge.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center">
              {renderContent()}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}

function mapQuizQuestions(questions: QuizQuestion[]): Question[] {
  return questions.map(question => ({
    question: question.prompt,
    options: question.options,
    answer: question.options[question.correctIndex],
    explanation: question.explanation,
    emoji: question.emoji,
  }));
}

function updateLocalTopicMastery(topicName: string, latestScore: number) {
  const key = 'scripto_topic_mastery';
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    const mastery: Array<{ topic: string; masteryScore: number; updatedAt: string }> =
      Array.isArray(stored) ? stored.filter(item =>
        item && typeof item.topic === 'string' && typeof item.masteryScore === 'number',
      ) : [];
    const previous = mastery.find(item => item.topic === topicName);
    const newMastery = calculateTopicMastery(previous?.masteryScore ?? 0, latestScore);
    const updated = [
      { topic: topicName, masteryScore: newMastery, updatedAt: new Date().toISOString() },
      ...mastery.filter(item => item.topic !== topicName),
    ];
    window.localStorage.setItem(key, JSON.stringify(updated));
  } catch (error) {
    console.error('Could not save topic mastery on this device.', error);
  }
}
