'use client';

import { useEffect, useMemo, useState, type FC } from 'react';
import { ArrowLeft, ArrowRight, Pencil, Plus, RefreshCw, Shuffle, Star, Trash2 } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  cardKey,
  formatReviewInterval,
  getReviewIntervalMinutes,
  getCardScheduleLabel,
  readFlashcardReviews,
  type ReviewRating,
} from '@/lib/spaced-repetition';

export interface Flashcard {
  question: string;
  answer: string;
  emoji: string;
  color: string;
}

interface Props {
  flashcards: Flashcard[];
  onReview?: (card: Flashcard, rating: ReviewRating) => void;
  onCardsChange?: (cards: Flashcard[]) => void;
  onStarredChange?: (card: Flashcard, starred: boolean) => void;
  sourceTopic?: string;
  onGenerateNew?: () => void;
  onBackToGenerator?: () => void;
  onSessionComplete?: (reviewed: number, remembered: number) => void;
}

const STAR_KEY = 'scripto_starred_flashcards';

const FlashcardsDisplay: FC<Props> = ({
  flashcards,
  onReview,
  onCardsChange,
  onStarredChange,
  sourceTopic,
  onGenerateNew,
  onBackToGenerator,
  onSessionComplete,
}) => {
  const [cards, setCards] = useState(flashcards);
  const [filter, setFilter] = useState<'all' | 'due' | 'starred'>('all');
  const [flippedStates, setFlippedStates] = useState<boolean[]>(() => cards.map(() => false));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [api, setApi] = useState<CarouselApi>();
  const [editing, setEditing] = useState(false);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [adding, setAdding] = useState(false);
  const [addFront, setAddFront] = useState('');
  const [addBack, setAddBack] = useState('');
  const [starred, setStarred] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(window.localStorage.getItem(STAR_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const [sessionComplete, setSessionComplete] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [remembered, setRemembered] = useState(0);
  const [missed, setMissed] = useState<Flashcard[]>([]);

  useEffect(() => {
    setCards(flashcards);
    setCurrentIndex(0);
    setFlippedStates(flashcards.map(() => false));
    setSessionComplete(false);
    const savedStars = readFlashcardReviews()
      .filter(review => review.starred)
      .map(review => review.key);
    setStarred(current => [...new Set([...current, ...savedStars])]);
  }, [flashcards]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STAR_KEY, JSON.stringify(starred));
    }
  }, [starred]);

  const activeCards = useMemo(() => {
    if (filter === 'starred') return cards.filter(card => starred.includes(cardKey(card)));
    if (filter === 'due') {
      const now = Date.now();
      return cards.filter(card => {
        const review = readFlashcardReviews().find(item => item.key === cardKey(card));
        return !review || new Date(review.nextReviewAt ?? review.dueAt).getTime() <= now;
      });
    }
    return cards;
  }, [cards, filter, starred]);

  useEffect(() => {
    setCurrentIndex(0);
    setFlippedStates(activeCards.map(() => false));
    setSessionComplete(false);
    api?.scrollTo(0);
  }, [filter, activeCards.length, api]);

  useEffect(() => {
    if (!api) return;
    const update = () => setCurrentIndex(api.selectedScrollSnap());
    api.on('select', update);
    return () => { void api.off('select', update); };
  }, [api]);

  const persistCards = (next: Flashcard[]) => {
    setCards(next);
    onCardsChange?.(next);
  };

  const flip = (index = currentIndex) => {
    setFlippedStates(states => states.map((value, i) => i === index ? !value : value));
  };

  const goTo = (index: number) => {
    if (index < 0 || index >= activeCards.length) return;
    api?.scrollTo(index);
  };

  const toggleStar = (card: Flashcard) => {
    const key = cardKey(card);
    const nextStarred = !starred.includes(key);
    setStarred(current => nextStarred
      ? [...current, key]
      : current.filter(item => item !== key));
    onStarredChange?.(card, nextStarred);
  };

  const rateCard = (card: Flashcard, rating: ReviewRating) => {
    onReview?.(card, rating);
    const nextReviewed = reviewed + 1;
    const nextRemembered = remembered + (rating !== 'again' ? 1 : 0);
    setReviewed(nextReviewed);
    setRemembered(nextRemembered);
    if (rating === 'again') {
      setMissed(current => current.some(item => cardKey(item) === cardKey(card)) ? current : [...current, card]);
    }
    setFlippedStates(activeCards.map(() => false));
    if (currentIndex >= activeCards.length - 1) {
      setSessionComplete(true);
      onSessionComplete?.(nextReviewed, nextRemembered);
    } else {
      api?.scrollNext();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (sessionComplete) return;
      if (event.code === 'Space') {
        event.preventDefault();
        flip();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(currentIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(currentIndex + 1);
      } else if (['1', '2', '3'].includes(event.key) && flippedStates[currentIndex]) {
        event.preventDefault();
        const ratings: ReviewRating[] = ['again', 'good', 'easy'];
        const card = activeCards[currentIndex];
        if (card) rateCard(card, ratings[Number(event.key) - 1]);
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        const card = activeCards[currentIndex];
        if (card) toggleStar(card);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const startEdit = (card: Flashcard) => {
    setEditing(true);
    setEditFront(card.question);
    setEditBack(card.answer);
  };

  const saveEdit = () => {
    if (!editFront.trim() || !editBack.trim()) return;
    const target = activeCards[currentIndex];
    if (!target) return;
    const targetKey = cardKey(target);
    persistCards(cards.map(card => cardKey(card) === targetKey
      ? { ...card, question: editFront.trim(), answer: editBack.trim() }
      : card));
    setEditing(false);
  };

  const deleteCard = (card: Flashcard) => {
    persistCards(cards.filter(item => cardKey(item) !== cardKey(card)));
  };

  const addCard = () => {
    if (!addFront.trim() || !addBack.trim()) return;
    persistCards([...cards, { question: addFront.trim(), answer: addBack.trim(), emoji: '🧠', color: '#3b82f6' }]);
    setAddFront('');
    setAddBack('');
    setAdding(false);
  };

  const shuffleCards = () => {
    persistCards([...cards].sort(() => Math.random() - 0.5));
  };

  if (!activeCards.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">No cards match this filter.</p>
        <Button variant="outline" onClick={() => setFilter('all')}>Show All Cards</Button>
      </div>
    );
  }

  if (sessionComplete) {
    const isDueDrill = sourceTopic === 'Due-card review';
    const nextDueAt = readFlashcardReviews()
      .map(review => new Date(review.dueAt))
      .filter(date => date.getTime() > Date.now())
      .sort((left, right) => left.getTime() - right.getTime())[0];
    return (
      <Card className="mx-auto w-full max-w-xl text-center">
        <CardContent className="space-y-5 p-8">
          <div className="text-5xl">🎉</div>
          <h2 className="text-2xl font-bold">{isDueDrill ? 'All caught up!' : 'Session Complete'}</h2>
          <p className="text-muted-foreground">{isDueDrill
            ? nextDueAt ? `Next review: ${nextDueAt.toLocaleDateString()}` : 'No upcoming reviews scheduled.'
            : `${reviewed} reviewed · ${remembered} remembered`}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => { setSessionComplete(false); setReviewed(0); setRemembered(0); api?.scrollTo(0); }}>
              Review Again
            </Button>
            {missed.length > 0 && (
              <Button variant="outline" onClick={() => {
                persistCards(missed);
                setSessionComplete(false);
                setReviewed(0);
                setRemembered(0);
                setMissed([]);
              }}>Drill Missed/Hard Cards</Button>
            )}
            <Button variant="outline" onClick={onGenerateNew}>Generate New Deck</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentCard = activeCards[currentIndex];
  const dueCount = cards.filter(card => {
    const review = readFlashcardReviews().find(item => item.key === cardKey(card));
    return !review || new Date(review.dueAt) <= new Date();
  }).length;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border p-1">
          {(['all', 'due', 'starred'] as const).map(value => (
            <Button key={value} type="button" size="sm" variant={filter === value ? 'default' : 'ghost'}
              onClick={() => setFilter(value)}>
              {value === 'all' ? 'All Cards' : value === 'due' ? 'Due Only' : 'Starred'}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={shuffleCards}><Shuffle className="mr-2 h-4 w-4" />Shuffle</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(value => !value)}><Plus className="mr-2 h-4 w-4" />Add Card</Button>
        </div>
      </div>

      {adding && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <Textarea value={addFront} onChange={event => setAddFront(event.target.value)} placeholder="Card front" />
            <Textarea value={addBack} onChange={event => setAddBack(event.target.value)} placeholder="Card back" />
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={addCard} disabled={!addFront.trim() || !addBack.trim()}>Save Card</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Card {activeCards.length ? currentIndex + 1 : 0} of {activeCards.length}</span>
          <Badge variant="secondary">Due: {dueCount}</Badge>
        </div>
        <Progress value={activeCards.length ? ((currentIndex + 1) / activeCards.length) * 100 : 0} className="h-1.5" />
      </div>

      <Carousel setApi={setApi} className="mx-auto w-full max-w-md">
        <CarouselContent>
          {activeCards.map((card, index) => (
            <CarouselItem key={`${cardKey(card)}-${index}`}>
              <div className="p-1">
                <div className={cn('flip-card h-80 w-full rounded-lg', flippedStates[index] && 'flipped')}>
                  <div className="flip-card-inner relative h-full w-full">
                    <div className="flip-card-front absolute h-full w-full">
                      <Card className="flex h-full w-full flex-col">
                        <CardContent className="relative flex flex-1 flex-col items-center justify-center p-6 text-center">
                          <Button type="button" size="icon" variant="ghost" className="absolute right-2 top-2"
                            aria-label="Star card" onClick={() => toggleStar(card)}>
                            <Star className={cn('h-5 w-5', starred.includes(cardKey(card)) && 'fill-yellow-400 text-yellow-500')} />
                          </Button>
                          <Badge variant="outline" className="absolute left-2 top-2">
                            {getCardScheduleLabel(card)}
                          </Badge>
                          <div className="mb-4 text-6xl">{card.emoji}</div>
                          {editing && index === currentIndex ? (
                            <Textarea value={editFront} onChange={event => setEditFront(event.target.value)} className="max-w-sm" />
                          ) : (
                            <p className="text-lg font-semibold">{card.question}</p>
                          )}
                        </CardContent>
                        <div className="flex border-t p-3">
                          <Button variant="ghost" className="flex-1" onClick={() => flip(index)}><RefreshCw className="mr-2 h-4 w-4" />Flip to Answer</Button>
                          <Button variant="ghost" size="icon" onClick={() => startEdit(card)} aria-label="Edit card"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteCard(card)} aria-label="Delete card"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        {editing && index === currentIndex && (
                          <div className="flex justify-end gap-2 border-t p-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                            <Button size="sm" onClick={saveEdit}>Save</Button>
                          </div>
                        )}
                      </Card>
                    </div>
                    <div className="flip-card-back absolute h-full w-full">
                      <Card className="flex h-full w-full flex-col">
                        <CardContent className="relative flex flex-1 flex-col items-center justify-center p-6 text-center">
                          <Badge variant="outline" className="absolute left-2 top-2">{getCardScheduleLabel(card)}</Badge>
                          <div className="mb-3 text-5xl">{card.emoji}</div>
                          {editing && index === currentIndex ? (
                            <Textarea value={editBack} onChange={event => setEditBack(event.target.value)} className="max-w-sm" />
                          ) : (
                            <p className="text-lg">{card.answer}</p>
                          )}
                        </CardContent>
                        <div className="border-t p-3">
                          {onReview ? (
                            <div className="grid grid-cols-3 gap-2">
                              {([
                                ['again', 'destructive'],
                                ['good', 'secondary'],
                                ['easy', 'default'],
                              ] as const).map(([rating, variant]) => (
                                <Button key={rating} type="button" size="sm" variant={variant}
                                  onClick={() => rateCard(card, rating)}>
                                  {rating[0].toUpperCase() + rating.slice(1)} · {formatReviewInterval(getReviewIntervalMinutes(rating))}
                                </Button>
                              ))}
                            </div>
                          ) : (
                            <Button variant="ghost" className="w-full" onClick={() => flip(index)}>Flip to Question</Button>
                          )}
                          {sourceTopic && (
                            <Button variant="link" size="sm" className="mt-2 h-auto px-0 text-xs"
                              onClick={() => window.location.assign(`/notes?topic=${encodeURIComponent(sourceTopic)}`)}>
                              See in Notes →
                            </Button>
                          )}
                        </div>
                      </Card>
                    </div>
                  </div>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>

      <div className="text-center text-xs text-muted-foreground">
        Space Flip · ←/→ Navigate · 1 Again · 2 Good · 3 Easy · S Star
      </div>
    </div>
  );
};

export default FlashcardsDisplay;
