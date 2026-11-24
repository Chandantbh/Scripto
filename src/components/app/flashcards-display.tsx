'use client';

import { useEffect, useState, type FC } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';

interface Flashcard {
  question: string;
  answer: string;
  emoji: string;
  color: string;
}

interface FlashcardsDisplayProps {
  flashcards: Flashcard[];
  onReview?: (card: Flashcard, rating: 'again' | 'good' | 'easy') => void;
}

const FlashcardsDisplay: FC<FlashcardsDisplayProps> = ({ flashcards, onReview }) => {
  // State for flipped cards
  const [flippedStates, setFlippedStates] = useState<boolean[]>(
      () => Array(flashcards?.length || 0).fill(false)
  );

  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleFlip = (index: number) => {
    const newFlippedStates = [...flippedStates];
    newFlippedStates[index] = !newFlippedStates[index];
    setFlippedStates(newFlippedStates);
  };

  useEffect(() => {
    if (!api) return;
    const update = () => setCurrentIndex(api.selectedScrollSnap());
    update();
    api.on('select', update);
    return () => {
      void api.off('select', update);
    };
  }, [api]);

  useEffect(() => {
    setFlippedStates(Array(flashcards.length).fill(false));
    setCurrentIndex(0);
    api?.scrollTo(0);
  }, [flashcards, api]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        handleFlip(currentIndex);
      } else if (event.key === '1' && flippedStates[currentIndex] && onReview) {
        event.preventDefault();
        onReview(flashcardAt(currentIndex), 'again');
        setFlippedStates(Array(flashcards.length).fill(false));
        api?.scrollNext();
      } else if (event.key === '2' && flippedStates[currentIndex] && onReview) {
        event.preventDefault();
        onReview(flashcardAt(currentIndex), 'good');
        setFlippedStates(Array(flashcards.length).fill(false));
        api?.scrollNext();
      } else if (event.key === '3' && flippedStates[currentIndex] && onReview) {
        event.preventDefault();
        onReview(flashcardAt(currentIndex), 'easy');
        setFlippedStates(Array(flashcards.length).fill(false));
        api?.scrollNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const flashcardAt = (index: number): Flashcard => flashcards[index];

  if (!flashcards || flashcards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center">
        <p className="text-muted-foreground">No flashcards generated.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <Carousel setApi={setApi} className="w-full max-w-md mx-auto">
        <CarouselContent>
          {flashcards.map((flashcard, index) => {
            return (
              <CarouselItem key={index}>
                <div className="p-1">
                  <div
                    className={cn(
                      'flip-card w-full h-80 rounded-lg',
                      flippedStates[index] && 'flipped'
                    )}
                  >
                    <div className="flip-card-inner relative w-full h-full">
                      {/* Front of card */}
                      <div className="flip-card-front absolute w-full h-full">
                        <Card className="flex h-full w-full flex-col">
                          <CardContent className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                            <div className="text-6xl mb-4">{flashcard.emoji}</div>
                            <p className="text-xs opacity-80 mb-2">QUESTION</p>
                            <ScrollArea className="h-24 w-full">
                              <p className="text-lg font-semibold">{flashcard.question}</p>
                            </ScrollArea>
                          </CardContent>
                          <div className="border-t border-border p-4">
                            <Button
                              variant="ghost"
                              className="w-full"
                              onClick={() => handleFlip(index)}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Flip to Answer
                            </Button>
                          </div>
                        </Card>
                      </div>
                      
                      {/* Back of card */}
                      <div className="flip-card-back absolute w-full h-full">
                        <Card className="flex h-full w-full flex-col">
                          <CardContent className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                            <div className="text-6xl mb-4">{flashcard.emoji}</div>
                            <p className="text-xs opacity-80 mb-2">ANSWER</p>
                            <ScrollArea className="h-24 w-full">
                              <p className="text-lg">{flashcard.answer}</p>
                            </ScrollArea>
                          </CardContent>
                          <div className="border-t border-border p-4">
                            {onReview ? (
                              <div className="grid grid-cols-3 gap-2">
                                <Button type="button" variant="destructive" size="sm" onClick={event => {
                                  event.stopPropagation();
                                  onReview(flashcard, 'again');
                                  setFlippedStates(Array(flashcards.length).fill(false));
                                  api?.scrollNext();
                                }}>Again</Button>
                                <Button type="button" variant="secondary" size="sm" onClick={event => {
                                  event.stopPropagation();
                                  onReview(flashcard, 'good');
                                  setFlippedStates(Array(flashcards.length).fill(false));
                                  api?.scrollNext();
                                }}>Good</Button>
                                <Button type="button" size="sm" onClick={event => {
                                  event.stopPropagation();
                                  onReview(flashcard, 'easy');
                                  setFlippedStates(Array(flashcards.length).fill(false));
                                  api?.scrollNext();
                                }}>Easy</Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                className="w-full"
                                onClick={() => handleFlip(index)}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Flip to Question
                              </Button>
                            )}
                          </div>
                        </Card>
                      </div>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
};

export default FlashcardsDisplay;
