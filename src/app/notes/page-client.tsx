
'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BrainCircuit,
  BookmarkPlus,
  ChevronDown,
  Loader2,
  Wand2,
  FileText,
  BookOpen,
  FileType,
  Download,
  Volume2,
  Youtube,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { SignInButton, useAuth } from '@clerk/nextjs';

import { generateNotes, type GenerateNotesInput } from '@/ai/flows/generate-notes';
import { generateFromTopic } from '@/ai/flows/generate-from-topic';
import { searchUnsplashImage } from '@/services/unsplash';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import NotesDisplay from '@/components/app/notes-display';
import { Skeleton } from '@/components/ui/skeleton';
import { extractTextFromFile } from '@/lib/file-parser';
import { textToSpeech } from '@/ai/flows/text-to-speech';
import AudioPlayer from '@/components/app/audio-player';
import AIErrorBanner from '@/components/app/ai-error-banner';
import { getAIErrorMessage, unwrapAIActionResult } from '@/lib/ai-action-result';
import {
  deleteSavedNoteAction,
  getSavedNotesAction,
  saveNoteAction,
} from '@/app/actions/user-data';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { NoteSourceType, SavedNote } from '@/types/user-data';
import GenerationSkeleton from '@/components/app/generation-skeleton';
import { readStudyPreferences } from '@/components/app/settings-dialog';
import GuestAuthModal from '@/components/app/guest-auth-modal';
import { consumeGuestGeneration, isGuestMode } from '@/lib/guest-mode';
import StudyStudio from '@/components/app/study-studio';

type InputMode = 'from-text' | 'from-topic' | 'from-youtube' | 'from-file';

interface GeneratedContent {
  notes?: string;
  quiz?: { questions: any[] };
  flashcards?: any[];
  imageHint?: string;
  sourceTopic?: string;
  sourceFileName?: string;
}

function getNoteSourceType(inputMode: InputMode): NoteSourceType {
  switch (inputMode) {
    case 'from-topic':
      return 'topic';
    case 'from-youtube':
      return 'youtube';
    case 'from-file':
      return 'file';
    default:
      return 'text';
  }
}

function getInputMode(sourceType: NoteSourceType): InputMode {
  switch (sourceType) {
    case 'topic':
      return 'from-topic';
    case 'youtube':
      return 'from-youtube';
    case 'file':
      return 'from-file';
    default:
      return 'from-text';
  }
}

const LOCAL_SAVED_NOTES_KEY = 'savedStudyNotes';

function readLocalSavedNotes(): SavedNote[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(LOCAL_SAVED_NOTES_KEY) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (note): note is SavedNote =>
        typeof note === 'object' &&
        note !== null &&
        typeof note.id === 'string' &&
        typeof note.title === 'string' &&
        typeof note.content === 'string' &&
        typeof note.sourceType === 'string' &&
        typeof note.createdAt === 'string' &&
        typeof note.updatedAt === 'string',
    );
  } catch (error) {
    console.error('Could not read notes saved on this device.', error);
    return [];
  }
}

function saveLocalNote(note: Omit<SavedNote, 'id' | 'createdAt' | 'updatedAt' | 'localOnly'>): SavedNote {
  const now = new Date().toISOString();
  const savedNote: SavedNote = {
    ...note,
    id: window.crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    localOnly: true,
  };
  window.localStorage.setItem(
    LOCAL_SAVED_NOTES_KEY,
    JSON.stringify([savedNote, ...readLocalSavedNotes()]),
  );
  return savedNote;
}

function deleteLocalNote(id: string): void {
  window.localStorage.setItem(
    LOCAL_SAVED_NOTES_KEY,
    JSON.stringify(readLocalSavedNotes().filter(note => note.id !== id)),
  );
}

export default function NotesPage() {
  const searchParams = useSearchParams();
  const [inputMode, setInputMode] = useState<InputMode>('from-text');
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [isLoadingSavedNotes, setIsLoadingSavedNotes] = useState(true);
  const [isSavedNotesOpen, setIsSavedNotesOpen] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [savedNotesError, setSavedNotesError] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const { toast } = useToast();
  const { isLoaded, isSignedIn } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationInProgressRef = useRef(false);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState<string | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [guestModalAction, setGuestModalAction] = useState<'save-note' | 'generation'>('save-note');
  const [selectedText, setSelectedText] = useState('');

  useEffect(() => {
    const mode = searchParams.get('mode');
    const textValue = searchParams.get('text');
    const topicValue = searchParams.get('topic');
    const urlValue = searchParams.get('url');
    if (mode === 'topic') setInputMode('from-topic');
    if (mode === 'text') setInputMode('from-text');
    if (mode === 'youtube') setInputMode('from-youtube');
    if (mode === 'file') setInputMode('from-file');
    if (textValue) setText(textValue);
    if (topicValue) setTopic(topicValue);
    if (urlValue) setYoutubeUrl(urlValue);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    const loadSavedNotes = async () => {
      try {
        const notes = await getSavedNotesAction();
        if (active) {
          const localNotes = readLocalSavedNotes();
          const accountNotes = notes ?? [];
          const accountIds = new Set(accountNotes.map(note => note.id));
          const localOnlyNotes = localNotes.filter(
            note => note.localOnly && !accountIds.has(note.id),
          );
          setSavedNotes(notes === null ? localNotes : [...localOnlyNotes, ...accountNotes]);
        }
      } catch (error) {
        console.error('Could not load saved notes.', error);
        if (active) {
          setSavedNotes(readLocalSavedNotes());
          setSavedNotesError('Account sync is unavailable. Showing notes saved on this device.');
        }
      } finally {
        if (active) setIsLoadingSavedNotes(false);
      }
    };

    void loadSavedNotes();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (inputMode === 'from-topic' && generatedContent?.imageHint) {
      const fetchImage = async () => {
        setIsGeneratingImage(true);
        try {
          const resultUrl = await searchUnsplashImage(generatedContent.imageHint!);
          setImageUrl(resultUrl);
        } catch (error) {
          console.error("Image fetch failed:", error);
           toast({
              variant: 'destructive',
              title: 'Image Fetch Failed',
              description: 'Could not load a cover image from Unsplash. Please check your API key.',
           });
        } finally {
          setIsGeneratingImage(false);
        }
      };
      fetchImage();
    }
  }, [generatedContent, inputMode, toast]);

  const handlePlayAudio = async (textToPlay: string, id: string) => {
    if (isSynthesizing) return; 

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

  const handleExportPdf = async () => {
    const notes = generatedContent?.notes;
    if (!notes || isExportingPdf) return;

    setIsExportingPdf(true);
    try {
      const { exportNotesPdf, resolveNotesTitle } = await import('@/lib/export-notes-pdf');
      const resolvedTitle = resolveNotesTitle({
        explicitTopic: inputMode === 'from-topic'
          ? generatedContent.sourceTopic || topic
          : undefined,
        uploadedFileName: inputMode === 'from-file'
          ? generatedContent.sourceFileName
          : undefined,
        markdown: notes,
      });
      exportNotesPdf({
        topic: resolvedTitle,
        markdown: notes,
      });
      toast({ title: 'PDF Exported', description: 'Your study notes have been downloaded.' });
    } catch (error) {
      console.error('Notes PDF export failed.', error);
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: 'Could not create the PDF. Please try again.',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportMarkdown = () => {
    const notes = generatedContent?.notes;
    if (!notes) return;
    const blob = new Blob([notes], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scripto-notes.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveNote = async () => {
    const notes = generatedContent?.notes;
    if (!notes || isSavingNote || !isLoaded) return;
    const { resolveNotesTitle } = await import('@/lib/export-notes-pdf');
    const resolvedTitle = resolveNotesTitle({
      explicitTopic: inputMode === 'from-topic'
        ? generatedContent.sourceTopic || topic
        : undefined,
      uploadedFileName: inputMode === 'from-file'
        ? generatedContent.sourceFileName
        : undefined,
      markdown: notes,
    });
    if (!isSignedIn) {
      setGuestModalAction('save-note');
      setGuestModalOpen(true);
      return;
    }

    setIsSavingNote(true);
    setSavedNotesError(null);
    try {
      const savedNote = await saveNoteAction({
        title: resolvedTitle,
        content: notes,
        sourceType: getNoteSourceType(inputMode),
      });
      if (!savedNote) {
        setShowSignInPrompt(true);
        return;
      }

      setSavedNotes(current => [savedNote, ...current]);
      setIsSavedNotesOpen(true);
      toast({ title: 'Note Saved', description: 'Your note is now available from your account.' });
    } catch (error) {
      console.error('Could not save study note.', error);
      try {
        const savedNote = saveLocalNote({
          title: resolvedTitle,
          content: notes,
          sourceType: getNoteSourceType(inputMode),
        });
        setSavedNotes(current => [savedNote, ...current]);
        setIsSavedNotesOpen(true);
        setSavedNotesError('Account sync is unavailable. This note was saved on this device only.');
        toast({
          title: 'Saved on This Device',
          description: 'Account sync is unavailable. You can export this note or try again later.',
        });
      } catch (storageError) {
        console.error('Could not save note on this device.', storageError);
        toast({
          variant: 'destructive',
          title: 'Save Failed',
          description: 'Could not save this note. Please try again.',
        });
      }
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleOpenSavedNote = (note: SavedNote) => {
    setInputMode(getInputMode(note.sourceType));
    setGeneratedContent({
      notes: note.content,
      ...(note.sourceType === 'topic'
        ? { sourceTopic: note.title }
        : note.sourceType === 'file'
          ? { sourceFileName: note.title }
          : {}),
    });
    setGenerationError(null);
    setImageUrl(null);
    setAudioSrc(null);
    setShowSignInPrompt(false);
  };

  const handleExportSavedNote = async (note: SavedNote) => {
    try {
      const { exportNotesPdf } = await import('@/lib/export-notes-pdf');
      exportNotesPdf({ topic: note.title, markdown: note.content });
      toast({ title: 'PDF Exported', description: 'Your saved notes have been downloaded.' });
    } catch (error) {
      console.error('Saved notes PDF export failed.', error);
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: 'Could not create the PDF. Please try again.',
      });
    }
  };

  const handleDeleteSavedNote = async (note: SavedNote) => {
    setDeletingNoteId(note.id);
    setSavedNotesError(null);
    try {
      if (note.localOnly) {
        deleteLocalNote(note.id);
        setSavedNotes(current => current.filter(savedNote => savedNote.id !== note.id));
        toast({ title: 'Note Deleted', description: 'The note was removed from this device.' });
        return;
      }
      if (!isSignedIn) {
        setShowSignInPrompt(true);
        return;
      }

      const deleted = await deleteSavedNoteAction(note.id);
      if (!deleted) {
        setShowSignInPrompt(true);
        return;
      }
      setSavedNotes(current => current.filter(savedNote => savedNote.id !== note.id));
      toast({ title: 'Note Deleted', description: 'The saved note was removed from your account.' });
    } catch (error) {
      console.error('Could not delete saved note.', error);
      setSavedNotesError('The note could not be deleted. Please try again.');
    } finally {
      setDeletingNoteId(null);
    }
  };
  
  const resetState = () => {
    setGenerationError(null);
    setGeneratedContent(null);
    setImageUrl(null);
    setAudioSrc(null);
    setIsGeneratingImage(false);
  }

  const handleGenerate = async () => {
    if (generationInProgressRef.current) return;
    if (!isSignedIn && isGuestMode() && consumeGuestGeneration() === 'limited') {
      setGuestModalAction('generation');
      setGuestModalOpen(true);
      return;
    }

    generationInProgressRef.current = true;
    setIsLoading(true);
    setGenerationError(null);
    resetState();

    try {
      let result: GeneratedContent;
      if (inputMode === 'from-topic') {
        if (!topic.trim()) {
            setGenerationError('Enter a topic to generate study materials.');
            setIsLoading(false);
            return;
        }
        const noteFormat = readStudyPreferences().noteFormat;
        const topicResult = unwrapAIActionResult(await generateFromTopic({ topic, noteFormat }));
        result = {
          notes: topicResult.notes,
          quiz: topicResult.quiz,
          flashcards: topicResult.flashcards,
          imageHint: topicResult.imageHint,
          sourceTopic: topic,
        };
      } else {
        let notesInput: GenerateNotesInput = {
          format: readStudyPreferences().noteFormat,
        };
        let sourceFileName: string | undefined;
        if (inputMode === 'from-text') {
            if (!text.trim()) {
                setGenerationError('Enter text to generate notes.');
                setIsLoading(false);
                return;
            }
            notesInput.text = text;
        } else if (inputMode === 'from-youtube') {
            if (!youtubeUrl.trim()) {
                setGenerationError('Enter a YouTube video URL.');
                setIsLoading(false);
                return;
            }
            notesInput.youtubeUrl = youtubeUrl;
        } else if (inputMode === 'from-file') {
             const file = fileInputRef.current?.files?.[0];
             if (!file) {
                 setGenerationError('Choose a file to generate notes.');
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
                 notesInput.text = extractedText;
                 sourceFileName = file.name;
             } catch (error) {
                 setGenerationError('Could not read the file. Use a supported document no larger than 10 MB.');
                 setIsLoading(false);
                 return;
             }
        }

        const notesResult = unwrapAIActionResult(await generateNotes(notesInput));
        result = {
          notes: notesResult.notes,
          sourceFileName,
        };
      }

      setGeneratedContent(result);
    } catch (error) {
      setGenerationError(getAIErrorMessage(error));
    } finally {
      generationInProgressRef.current = false;
      setIsLoading(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <GenerationSkeleton />;
    }

    if (!generatedContent?.notes) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <BrainCircuit className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">Nothing to study yet.</h3>
          <p className="text-sm text-muted-foreground">
            Enter some text, a topic, or import a file to get started.
          </p>
        </div>
      );
    }

    return (
      <NotesDisplay
        notes={generatedContent.notes}
        onPlayAudio={handlePlayAudio}
        isSynthesizing={isSynthesizing}
      />
    );
  };

  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
      <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-primary/10 rounded-full border border-primary/20">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Generate Notes</h1>
            <p className="text-muted-foreground">Turn any content into concise, easy-to-read notes.</p>
          </div>
      </div>

      <AIErrorBanner message={generationError} />
      {showSignInPrompt && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          <span className="text-muted-foreground">Sign in to save notes and access them across devices.</span>
          <div className="flex items-center gap-2">
            <SignInButton mode="modal">
              <Button size="sm">Sign In</Button>
            </SignInButton>
            <Button size="sm" variant="ghost" onClick={() => setShowSignInPrompt(false)}>Dismiss</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 items-start flex-1 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left panel */}
        <div className="space-y-6">
          <Card>
            <Tabs
              value={inputMode}
              onValueChange={(value) => {
                setInputMode(value as InputMode);
                resetState();
              }}
              className="w-full"
            >
              <CardHeader>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="from-text">
                    <FileText className="mr-2 h-4 w-4" />
                    Text
                  </TabsTrigger>
                  <TabsTrigger value="from-topic">
                    <BookOpen className="mr-2 h-4 w-4" />
                    Topic
                  </TabsTrigger>
                   <TabsTrigger value="from-youtube">
                    <Youtube className="mr-2 h-4 w-4" />
                    YouTube
                  </TabsTrigger>
                  <TabsTrigger value="from-file">
                    <FileType className="mr-2 h-4 w-4" />
                    File
                  </TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent>
                <TabsContent value="from-text" className="mt-0">
                  <CardTitle className="mb-2 text-xl">Enter Your Study Material</CardTitle>
                  <CardDescription className="mb-4">
                    Paste your text below to get started.
                  </CardDescription>
                  <Textarea
                    placeholder="Paste the wall of text you're pretending to read..."
                    className="min-h-[250px] text-base"
                    value={text}
                    maxLength={15000}
                    onChange={e => setText(e.target.value)}
                  />
                </TabsContent>
                <TabsContent value="from-topic" className="mt-0">
                    <CardTitle className="mb-2 text-xl">Generate From Topic</CardTitle>
                    <CardDescription className="mb-4">
                        Enter a topic and we'll generate notes for you.
                    </CardDescription>
                    <Input
                        placeholder="Drop a topic before the syllabus humbles you..."
                        value={topic}
                        maxLength={200}
                        onChange={e => setTopic(e.target.value)}
                    />
                </TabsContent>
                <TabsContent value="from-youtube" className="mt-0">
                    <CardTitle className="mb-2 text-xl">Generate From YouTube</CardTitle>
                    <CardDescription className="mb-4">
                        Enter a YouTube URL to generate notes from the video.
                    </CardDescription>
                    <Input
                        placeholder="Paste that 2x-speed lecture link..."
                        value={youtubeUrl}
                        maxLength={2048}
                        onChange={e => setYoutubeUrl(e.target.value)}
                    />
                </TabsContent>
                <TabsContent value="from-file" className="mt-0">
                    <CardTitle className="mb-2 text-xl">Upload Document</CardTitle>
                    <CardDescription className="mb-4">
                        Upload a PDF, DOCX, or text file to generate notes from.
                    </CardDescription>
                    <Input
                        type="file"
                        ref={fileInputRef}
                        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    />
                </TabsContent>
              </CardContent>
              <CardFooter className="flex-col sm:flex-row gap-2">
                <Button data-enter-submit="true" onClick={handleGenerate} disabled={isLoading} className="group relative w-full" size="lg">
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  {isLoading ? 'Generating...' : 'Generate Notes'}
                </Button>
              </CardFooter>
            </Tabs>
          </Card>

          <AudioPlayer src={audioSrc} onEnded={() => setAudioSrc(null)} />

          <Card>
            <Collapsible open={isSavedNotesOpen} onOpenChange={setIsSavedNotesOpen}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Saved Notes</CardTitle>
                    <CardDescription>Reopen, export, or delete notes saved to your account or this device.</CardDescription>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={isSavedNotesOpen ? 'Collapse saved notes' : 'Expand saved notes'}>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isSavedNotesOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-3">
                  {savedNotesError && (
                    <p role="status" className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {savedNotesError}
                    </p>
                  )}
                  {isLoadingSavedNotes ? (
                    <p className="text-sm text-muted-foreground">Loading saved notes...</p>
                  ) : savedNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No saved notes yet. Main character arc starts with one topic.</p>
                  ) : (
                    savedNotes.map(note => (
                      <div key={note.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{note.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Saved {new Date(note.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleOpenSavedNote(note)}>
                            Open
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleExportSavedNote(note)}>
                            <Download className="h-4 w-4" />
                            PDF
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${note.title}`}
                            disabled={deletingNoteId === note.id}
                            onClick={() => handleDeleteSavedNote(note)}
                          >
                            {deletingNoteId === note.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>

        {/* Right panel */}
        <Card className="lg:sticky top-24 flex-1 flex flex-col overflow-hidden">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle>Generated Notes</CardTitle>
                    <CardDescription>{generatedContent?.sourceTopic ? `Notes on ${generatedContent.sourceTopic}` : 'Your AI-generated notes.'}</CardDescription>
                </div>
                {generatedContent?.notes && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportPdf}
                      disabled={isExportingPdf}
                    >
                      {isExportingPdf ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Export PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportMarkdown}>
                      <Download className="h-4 w-4" />
                      Markdown
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveNote}
                      disabled={isSavingNote || !isLoaded}
                    >
                      {isSavingNote ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <BookmarkPlus className="h-4 w-4" />
                      )}
                      Save Note
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePlayAudio(generatedContent.notes!, 'full-notes')}
                      disabled={!!isSynthesizing}
                    >
                      {isSynthesizing === 'full-notes' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Volume2 className="mr-2 h-4 w-4" />
                      )}
                      Listen to All
                    </Button>
                  </div>
                )}
            </div>
          </CardHeader>
          <CardContent
            className="relative flex-1 overflow-auto p-0"
            onMouseUp={() => {
              const selection = window.getSelection()?.toString().trim() ?? '';
              setSelectedText(selection);
            }}
          >
            {isGeneratingImage ? (
              <Skeleton className="w-full h-48 rounded-lg" />
            ) : imageUrl ? (
              <div className="mb-4">
                <Image
                    src={imageUrl}
                    alt={generatedContent?.sourceTopic || "Generated image"}
                    width={500}
                    height={300}
                    className="w-full h-auto object-cover rounded-lg"
                 />
              </div>
            ) : null}
            {selectedText && generatedContent?.notes && (
              <div className="frosted-overlay absolute left-1/2 top-3 z-20 flex -translate-x-1/2 gap-1 rounded-lg p-1">
                <Button size="sm" variant="ghost" onClick={() => setSelectedText('')}>Explain simpler</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedText('')}>Make flashcard</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedText('')}>Quiz this</Button>
              </div>
            )}
            {generatedContent?.notes ? (
              <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
                <div className="min-w-0">{renderContent()}</div>
                <StudyStudio notes={generatedContent.notes} />
              </div>
            ) : renderContent()}
          </CardContent>
        </Card>
      </div>
      <GuestAuthModal
        open={guestModalOpen}
        onOpenChange={setGuestModalOpen}
        action={guestModalAction}
      />
    </div>
  );
}
