'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrainCircuit, Loader2, Wand2, Layers, BookOpen, Upload, Download, FileType, Youtube } from 'lucide-react';

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
import { getAIErrorMessage, unwrapAIActionResult } from '@/lib/ai-action-result';
import GenerationSkeleton from '@/components/app/generation-skeleton';
import { useAuth } from '@clerk/nextjs';
import { reserveGuestGeneration } from '@/lib/guest-mode';

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
  const searchParams = useSearchParams();
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationInProgressRef = useRef(false);

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

  const handleGenerate = async () => {
    if (generationInProgressRef.current) return;
    if (!reserveGuestGeneration(Boolean(isSignedIn))) return;
    generationInProgressRef.current = true;
    setIsLoading(true);
    setGenerationError(null);
    setGeneratedContent(null);

    try {
       let result: GeneratedContent;

        if (inputMode === 'topic') {
            if (!topic.trim()) {
                setGenerationError('Enter a topic to generate flashcards.');
                setIsLoading(false);
                return;
            }
            const topicResult = unwrapAIActionResult(await generateFromTopic({ topic }));
            result = {
                flashcards: topicResult.flashcards,
                notes: topicResult.notes,
                quiz: topicResult.quiz,
                imageHint: topicResult.imageHint,
                sourceTopic: topic,
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
                 try {
                     const extractedText = await extractTextFromFile(file);
                     if (!extractedText.trim()) {
                         setGenerationError('No readable text was found in the selected file.');
                         setIsLoading(false);
                         return;
                     }
                    input.text = extractedText;
                 } catch (err) {
                    setGenerationError('Could not read the file. Use a supported document no larger than 10 MB.');
                    setIsLoading(false);
                    return;
                }
            }
            result = unwrapAIActionResult(await generateFlashcards(input));
        }

      setGeneratedContent(result);
    } catch (error) {
      setGenerationError(getAIErrorMessage(error));
    } finally {
      generationInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <GenerationSkeleton kind="cards" />;
    }

    if (!generatedContent || !generatedContent.flashcards || generatedContent.flashcards.length === 0) {
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

    return <FlashcardsDisplay flashcards={generatedContent.flashcards} />;
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-primary/10 rounded-full border border-primary/20">
          <Layers className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Generate Flashcards</h1>
          <p className="text-muted-foreground">Create interactive flashcards to memorize key info.</p>
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

          <Card className="lg:sticky top-24 min-h-[400px] lg:min-h-[600px] flex flex-col">
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
