'use client';

export interface WeakTopic {
  question: string;
  answer: string;
  concept: string;
  source: 'quiz' | 'exam';
  missedAt: string;
}

export const WEAK_TOPICS_STORAGE_KEY = 'scripto_weak_topics';

export function readWeakTopics(): WeakTopic[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(WEAK_TOPICS_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is WeakTopic =>
      !!item && typeof item.question === 'string' && typeof item.answer === 'string'
      && typeof item.concept === 'string' && typeof item.source === 'string'
    ) : [];
  } catch {
    return [];
  }
}

export function recordWeakTopics(items: Array<Omit<WeakTopic, 'missedAt'>>) {
  if (typeof window === 'undefined' || items.length === 0) return;
  const existing = readWeakTopics();
  const next = [...items.map(item => ({ ...item, missedAt: new Date().toISOString() })), ...existing]
    .filter((item, index, all) =>
      all.findIndex(candidate => candidate.question === item.question && candidate.answer === item.answer) === index
    )
    .slice(0, 100);
  window.localStorage.setItem(WEAK_TOPICS_STORAGE_KEY, JSON.stringify(next));
}
