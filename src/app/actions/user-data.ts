'use server';

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import {
  calculateActivityProgress,
  createEmptyGamificationStats,
  type ActivityInput,
  type ActivityProgressUpdate,
  type ActivityRecord,
  type GamificationStats,
  type UserProgress,
} from '@/lib/gamification';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import type { NoteSourceType, SavedNote } from '@/types/user-data';

const activitySchema = z
  .object({
    type: z.enum(['quiz', 'exam']),
    topic: z.string().trim().min(1).max(200),
    score: z.number().finite().min(0).max(10000),
    total: z.number().finite().gt(0).max(10000),
    grade: z.string().trim().max(10).optional(),
  })
  .refine(activity => activity.score <= activity.total);

const saveNoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50000),
  sourceType: z.enum(['text', 'topic', 'youtube', 'file']),
});

const noteIdSchema = z.string().uuid();

export interface UserDashboardData {
  progress: UserProgress;
  savedNotes: SavedNote[];
  recentActivity: ActivityRecord[];
  stats: GamificationStats;
  recentNotes: SavedNote[];
  recentActivities: ActivityRecord[];
  synced: boolean;
  averageQuizScore: number;
}

export async function getUserDashboardDataAction(): Promise<UserDashboardData | null> {
  const { userId } = await auth();
  if (!userId) return null;

  try {
    const client = requireSupabaseClient();
    const [progress, savedNotes] = await Promise.all([
      loadUserProgress(client, userId),
      getSavedNotesForUser(client, userId),
    ]);

    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const distanceToMonday = day === 0 ? 6 : day - 1;
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - distanceToMonday);

    const quizThisWeek = progress.history.filter(activity =>
      activity.type === 'quiz' &&
      new Date(activity.date).getTime() >= startOfWeek.getTime()
    );
    const averageQuizScore = quizThisWeek.length
      ? Math.round(
          quizThisWeek.reduce(
            (sum, activity) => sum + (activity.total ? (activity.score / activity.total) * 100 : 0),
            0,
          ) / quizThisWeek.length,
        )
      : 0;
    const recentActivity = [...progress.history].reverse().slice(0, 6);
    const recentNotes = savedNotes.slice(0, 6);

    return {
      progress,
      savedNotes,
      recentActivity,
      stats: progress.stats,
      recentNotes,
      recentActivities: recentActivity,
      synced: true,
      averageQuizScore,
    };
  } catch (error) {
    console.warn('Scripto dashboard data unavailable.', getDatabaseErrorDetails(error));
    return createDashboardFallback();
  }
}

export async function getUserProgressAction(): Promise<UserProgress | null> {
  const { userId } = await auth();
  if (!userId) return null;

  try {
    const client = requireSupabaseClient();
    return loadUserProgress(client, userId);
  } catch (error) {
    console.warn('Scripto progress unavailable.', getDatabaseErrorDetails(error));
    return {
      stats: createEmptyGamificationStats(),
      history: [],
    };
  }
}

export async function recordActivityAction(
  entry: ActivityInput,
): Promise<Omit<ActivityProgressUpdate, 'history'> | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const parsedEntry = activitySchema.safeParse(entry);
  if (!parsedEntry.success) {
    throw new Error('Activity details are invalid.');
  }

  const client = requireSupabaseClient();
  const currentProgress = await loadUserProgress(client, userId);
  const update = calculateActivityProgress(
    currentProgress.history,
    currentProgress.stats,
    parsedEntry.data,
  );

  const { error: activityError } = await client.from('activity_history').insert({
    user_id: userId,
    type: update.activity.type,
    topic: update.activity.topic,
    score: update.activity.score,
    total: update.activity.total,
    grade: update.activity.grade ?? null,
    created_at: update.activity.date,
  });
  if (activityError) reportDatabaseError('recording activity', activityError);

  const { error: statsError } = await client.from('user_stats').upsert(
    toDatabaseStats(userId, update.stats),
    { onConflict: 'user_id' },
  );
  if (statsError) reportDatabaseError('updating user stats', statsError);

  const { history: _history, ...publicUpdate } = update;
  return publicUpdate;
}

export async function clearUserHistoryAction(): Promise<boolean | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const client = requireSupabaseClient();
  const { error: historyError } = await client
    .from('activity_history')
    .delete()
    .eq('user_id', userId);
  if (historyError) reportDatabaseError('clearing activity history', historyError);

  const { error: statsError } = await client
    .from('user_stats')
    .upsert(toDatabaseStats(userId, createEmptyGamificationStats()), {
      onConflict: 'user_id',
    });
  if (statsError) reportDatabaseError('resetting user stats', statsError);

  return true;
}

export async function getSavedNotesAction(): Promise<SavedNote[] | null> {
  const { userId } = await auth();
  if (!userId) return null;

  try {
    const client = requireSupabaseClient();
    return getSavedNotesForUser(client, userId);
  } catch (error) {
    console.warn('Scripto saved notes unavailable.', getDatabaseErrorDetails(error));
    return [];
  }
}

async function getSavedNotesForUser(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
): Promise<SavedNote[]> {
  try {
    const { data, error } = await client
      .from('saved_notes')
      .select('id, title, content, source_type, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Scripto saved notes unavailable.', getDatabaseErrorDetails(error));
      return [];
    }

    return (data ?? []).map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      sourceType: row.source_type as NoteSourceType,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.warn('Scripto saved notes unavailable.', getDatabaseErrorDetails(error));
    return [];
  }
}

export async function saveNoteAction(
  input: { title: string; content: string; sourceType: NoteSourceType },
): Promise<SavedNote | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const parsedNote = saveNoteSchema.safeParse(input);
  if (!parsedNote.success) {
    throw new Error('Notes must have a title and content within the allowed size.');
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from('saved_notes')
    .insert({
      user_id: userId,
      title: parsedNote.data.title,
      content: parsedNote.data.content,
      source_type: parsedNote.data.sourceType,
    })
    .select('id, title, content, source_type, created_at, updated_at')
    .single();
  if (error) reportDatabaseError('saving a note', error);

  return {
    id: data.id,
    title: data.title,
    content: data.content,
    sourceType: data.source_type as NoteSourceType,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteSavedNoteAction(id: string): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  if (!noteIdSchema.safeParse(id).success) {
    throw new Error('Saved note ID is invalid.');
  }

  const client = requireSupabaseClient();
  const { error } = await client
    .from('saved_notes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) reportDatabaseError('deleting a saved note', error);

  return true;
}

async function loadUserProgress(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
): Promise<UserProgress> {
  try {
    const [{ data: statsRow, error: statsError }, { data: historyRows, error: historyError }] =
      await Promise.all([
      client
        .from('user_stats')
        .select('xp, streak, longest_streak, last_activity_date, achievements')
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('activity_history')
        .select('type, topic, score, total, grade, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
      ]);

    if (statsError) {
      console.warn('Scripto user stats unavailable.', getDatabaseErrorDetails(statsError));
    }
    if (historyError) {
      console.warn('Scripto activity history unavailable.', getDatabaseErrorDetails(historyError));
    }

    return {
      stats: !statsError && statsRow
        ? {
            xp: Number(statsRow.xp),
            streak: Number(statsRow.streak),
            longestStreak: Number(statsRow.longest_streak),
            lastActivityDate: statsRow.last_activity_date,
            achievements: statsRow.achievements ?? [],
          }
        : createEmptyGamificationStats(),
      history: !historyError
        ? (historyRows ?? []).map(row => ({
            type: row.type,
            topic: row.topic,
            score: Number(row.score),
            total: Number(row.total),
            date: row.created_at,
            ...(row.grade ? { grade: row.grade } : {}),
          }))
        : [],
    };
  } catch (error) {
    console.warn('Scripto progress unavailable.', getDatabaseErrorDetails(error));
    return {
      stats: createEmptyGamificationStats(),
      history: [],
    };
  }
}

async function getActivityHistoryForUser(
  client: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
): Promise<ActivityRecord[]> {
  try {
    const { data, error } = await client
      .from('activity_history')
      .select('type, topic, score, total, grade, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Scripto activity history unavailable.', getDatabaseErrorDetails(error));
      return [];
    }
    return (data ?? []).map(row => ({
      type: row.type,
      topic: row.topic,
      score: Number(row.score),
      total: Number(row.total),
      date: row.created_at,
      ...(row.grade ? { grade: row.grade } : {}),
    }));
  } catch (error) {
    console.warn('Scripto activity history unavailable.', getDatabaseErrorDetails(error));
    return [];
  }
}

function requireSupabaseClient() {
  const client = getSupabaseServerClient();
  if (!client) {
    throw new Error('Account data storage is not configured.');
  }
  return client;
}

function toDatabaseStats(userId: string, stats: GamificationStats) {
  return {
    user_id: userId,
    xp: stats.xp,
    streak: stats.streak,
    longest_streak: stats.longestStreak,
    last_activity_date: stats.lastActivityDate,
    achievements: stats.achievements,
    updated_at: new Date().toISOString(),
  };
}

function createDashboardFallback(): UserDashboardData {
  const stats = createEmptyGamificationStats();
  return {
    progress: {
      stats,
      history: [],
    },
    savedNotes: [],
    recentActivity: [],
    stats,
    recentNotes: [],
    recentActivities: [],
    synced: false,
    averageQuizScore: 0,
  };
}

function getDatabaseErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    const code = typeof error === 'object' && 'code' in error
      ? ` code=${String(error.code)}`
      : '';
    return `${error.message}${code}`;
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : 'Unknown database error';
    const code = typeof record.code === 'string' ? ` code=${record.code}` : '';
    return `${message}${code}`;
  }
  return String(error);
}

function reportDatabaseError(operation: string, error: unknown): never {
  console.error(`Supabase error while ${operation}.`, error);
  throw new Error('Account data could not be synced. Please try again later.');
}
