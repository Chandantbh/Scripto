'use client';

import { useEffect, useState, useRef } from 'react';
import { BrainCircuit, Loader2, Wand2, MessageCircleQuestion, FileText, Upload, Youtube, FileType } from 'lucide-react';
import { explainLikeImFive, type ExplainLikeImFiveOutput, type ExplainLikeImFiveInput } from '@/ai/flows/eli5';
import { extractTextFromFile } from '@/lib/file-parser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import NotesDisplay from '@/components/app/notes-display';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import AIErrorBanner from '@/components/app/ai-error-banner';
import { AIActionFailure, getAIErrorMessage, unwrapAIActionResult } from '@/lib/ai-action-result';
import GenerationSkeleton from '@/components/app/generation-skeleton';
import { readStudyPreferences } from '@/components/app/settings-dialog';
import { useAuth } from '@clerk/nextjs';
import { reserveGuestGeneration } from '@/lib/guest-mode';

type Difficulty = 'easy' | 'medium' | 'hard';
type InputMode = 'text' | 'file' | 'image' | 'youtube';

class InputSelectionError extends Error {}

const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

const MAX_IMAGE_UPLOAD_BYTES = 512 * 1024;

export default function Eli5Page() {
  const { isSignedIn } = useAuth();
  const [inputText, setInputText] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [inputMode, setInputMode] = useState<InputMode>('text');
  
  const [generatedContent, setGeneratedContent] = useState<ExplainLikeImFiveOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const generationInProgressRef = useRef(false);
  const [composerOpen, setComposerOpen] = useState(true);

  useEffect(() => {
    const depth = readStudyPreferences().explainerDepth;
    setDifficulty(depth === 'Simple' ? 'easy' : depth === 'Technical' ? 'hard' : 'medium');
  }, []);

  const handleGenerate = async () => {
    if (generationInProgressRef.current) return;
    if (!reserveGuestGeneration(Boolean(isSignedIn))) return;
    generationInProgressRef.current = true;
    setIsLoading(true);
    setGenerationError(null);
    setGeneratedContent(null);

    try {
      let input: ExplainLikeImFiveInput = { difficulty };

      switch (inputMode) {
        case 'text':
          input.text = inputText;
          break;
        case 'file': {
          const docFile = docInputRef.current?.files?.[0];
          if (!docFile) throw new InputSelectionError('Choose a document file first.');
          let extractedText: string;
          try {
            extractedText = await extractTextFromFile(docFile);
          } catch {
            throw new InputSelectionError('Could not read the file. Use a supported document no larger than 10 MB.');
          }
          if (!extractedText.trim()) throw new InputSelectionError('No readable text was found in the selected file.');
          input.text = extractedText;
          break;
        }
        case 'youtube':
          input.youtubeUrl = youtubeUrl;
          break;
        case 'image': {
          const file = fileInputRef.current?.files?.[0];
          if (!file) throw new InputSelectionError('Choose an image file first.');
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            throw new InputSelectionError('Use a JPG, PNG, or WebP image.');
          }
          if (file.size === 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
            throw new InputSelectionError('Images must be non-empty and 512 KB or smaller.');
          }
          input.imageDataUri = await fileToDataURL(file);
          break;
        }
      }

      setGeneratedContent(unwrapAIActionResult(await explainLikeImFive(input)));
      setComposerOpen(false);
    } catch (error) {
      setGenerationError(error instanceof InputSelectionError
        ? error.message
        : error instanceof AIActionFailure
          ? error.message
          : getAIErrorMessage(error));
    } finally {
      generationInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <GenerationSkeleton />;
    }

    if (!generatedContent || !generatedContent.explanation) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <BrainCircuit className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Your explanation will appear here</h3>
          <p className="text-sm text-muted-foreground">
            Provide some content and select a difficulty to get started.
          </p>
        </div>
      );
    }

    return <NotesDisplay notes={generatedContent.explanation} onPlayAudio={() => {}} isSynthesizing={null} />;
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-primary/10 rounded-full border border-primary/20">
          <MessageCircleQuestion className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Concept Explainer</h1>
          <p className="text-muted-foreground">Get a tailored explanation for any topic from any source.</p>
        </div>
      </div>
      <AIErrorBanner message={generationError} />
      {generatedContent && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {inputMode === 'text' ? inputText.slice(0, 80) || 'Concept explanation' : inputMode === 'youtube' ? youtubeUrl : 'Uploaded source'}
            </p>
            <p className="text-xs text-muted-foreground">Active explanation</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setComposerOpen(true)}>+ New topic / Edit input</Button>
        </div>
      )}
      <div className={generatedContent
        ? composerOpen ? 'mx-auto w-full max-w-3xl' : 'w-full'
        : 'mx-auto w-full max-w-3xl'}>
        <div className={`space-y-6 ${generatedContent && !composerOpen ? 'hidden' : ''}`}>
          <Card>
            <Tabs
              value={inputMode}
              onValueChange={(value) => {
                setInputMode(value as InputMode);
                setGenerationError(null);
              }}
              className="w-full"
            >
              <CardHeader>
                <CardTitle className="mb-2 text-xl">What do you want to understand?</CardTitle>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="text"><FileText className="mr-2 h-4 w-4" />Text</TabsTrigger>
                    <TabsTrigger value="file"><FileType className="mr-2 h-4 w-4" />File</TabsTrigger>
                    <TabsTrigger value="image"><Upload className="mr-2 h-4 w-4" />Image</TabsTrigger>
                    <TabsTrigger value="youtube"><Youtube className="mr-2 h-4 w-4" />YouTube</TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent className="space-y-4">
                 <TabsContent value="text" className="mt-0">
                    <Textarea
                        placeholder="Paste that concept you're about to wing..."
                        value={inputText}
                        maxLength={15000}
                        onChange={(e) => setInputText(e.target.value)}
                        className="min-h-[200px]"
                    />
                </TabsContent>
                <TabsContent value="file" className="mt-0">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="doc-file">Document (PDF/DOCX/TXT)</Label>
                        <Input id="doc-file" type="file" ref={docInputRef} accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Upload a document to extract text for explanation.</p>
                </TabsContent>
                <TabsContent value="image" className="mt-0">
                    <Input
                        type="file"
                        ref={fileInputRef}
                        accept="image/png, image/jpeg, image/webp"
                    />
                    <p className="text-xs text-muted-foreground mt-2">Upload an image containing text to explain.</p>
                </TabsContent>
                <TabsContent value="youtube" className="mt-0">
                    <Input
                        type="url"
                        placeholder="Paste that 2x-speed lecture link..."
                        value={youtubeUrl}
                        maxLength={2048}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-2">Enter a YouTube video URL to explain its content.</p>
                </TabsContent>

                <div>
                  <Label htmlFor="difficulty-select">Difficulty</Label>
                    <Select value={difficulty} onValueChange={(value: Difficulty) => setDifficulty(value)}>
                      <SelectTrigger id="difficulty-select" className="h-12 mt-1">
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy (Explain Like I'm 5)</SelectItem>
                        <SelectItem value="medium">Medium (High School)</SelectItem>
                        <SelectItem value="hard">Hard (College Level)</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
              </CardContent>
              <CardFooter>
                <Button data-enter-submit="true" onClick={handleGenerate} disabled={isLoading} className="group relative w-full" size="lg">
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  Explain Topic
                </Button>
              </CardFooter>
            </Tabs>
          </Card>
        </div>

        <Card className={`${generatedContent && !composerOpen ? '' : 'mt-6'} min-h-[400px] lg:min-h-[600px] flex flex-col`}>
          <CardHeader>
            <CardTitle>Generated Explanation</CardTitle>
            <CardDescription>Here's the topic, explained for you.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {renderContent()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
