
'use client';

import { useState, useRef } from 'react';
import { BrainCircuit, Loader2, Wand2, FileQuestion, BookOpen, Upload, Download, FileType, Youtube } from 'lucide-react';

import { generateQuiz, type GenerateQuizOutput, type GenerateQuizInput } from '@/ai/flows/generate-quiz';
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
import { recordActivityAction } from '@/app/actions/user-data';
import { recordActivityLocally, type ActivityProgressUpdate, type ActivityInput } from '@/lib/gamification';
import AIErrorBanner from '@/components/app/ai-error-banner';
import { getAIErrorMessage, unwrapAIActionResult } from '@/lib/ai-action-result';

type InputMode = 'from-text' | 'from-topic' | 'from-youtube' | 'from-file';

interface Question {
  question: string;
  options: string[];
  answer: string;
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
          setGenerationError(getAIErrorMessage(error));
      } finally {
          setIsSynthesizing(null);
      }
  };

  const handleGenerate = async () => {
    if (generationInProgressRef.current) return;
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
        const topicResult = unwrapAIActionResult(await generateFromTopic({ topic }));
        if (topicResult.quiz && topicResult.quiz.questions) {
           result = { 
                notes: topicResult.notes,
                quiz: topicResult.quiz,
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
        const textResult = unwrapAIActionResult(await generateQuiz(quizInput));
        result = { quiz: { questions: textResult.questions } }
      }
      setGeneratedContent(result);
    } catch (error) {
      setGenerationError(getAIErrorMessage(error));
    } finally {
      generationInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  // Removed unused handleFileUpload
  
  const saveQuizResult = async (score: number, totalQuestions: number) => {
    let resultTopic = 'Custom Content';
    if(inputMode === 'from-topic') resultTopic = topic;
    if(inputMode === 'from-youtube') resultTopic = 'YouTube Video';

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
      return (
        <div className="p-6 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      );
    }

    if (!generatedContent || !generatedContent.quiz || !generatedContent.quiz.questions) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <BrainCircuit className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Your quiz will appear here</h3>
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
      </div>
       <AIErrorBanner message={generationError} />
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-6">
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
                                placeholder="Paste your notes, an article, or any text you want to study..."
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
                                placeholder="e.g., 'The basics of photosynthesis'"
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
                                placeholder="https://www.youtube.com/watch?v=..."
                                value={youtubeUrl}
                                maxLength={2048}
                                onChange={(e) => setYoutubeUrl(e.target.value)}
                            />
                        </TabsContent>
                    </CardContent>
                    <CardFooter className="flex-col sm:flex-row gap-2">
                        <Button onClick={handleGenerate} disabled={isLoading} className="w-full" size="lg">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                            Generate Quiz
                        </Button>
                    </CardFooter>
                </Tabs>
            </Card>
            <AudioPlayer src={audioSrc} onEnded={() => setAudioSrc(null)} />
          </div>

          <Card className="lg:sticky top-24 min-h-[400px] lg:min-h-[600px] flex flex-col">
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
