import { differenceInCalendarDays, isSameWeek } from 'date-fns';

export type ActivityType = 'quiz' | 'exam';

export interface ActivityInput {
  type: ActivityType;
  topic: string;
  score: number;
  total: number;
  grade?: string;
}

export interface ActivityRecord extends ActivityInput {
  date: string;
}

export interface GamificationStats {
  xp: number;
  streak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  achievements: string[];
}

export interface UserProgress {
  stats: GamificationStats;
  history: ActivityRecord[];
}

export interface ActivityProgressUpdate {
  activity: ActivityRecord;
  history: ActivityRecord[];
  stats: GamificationStats;
  earnedXp: number;
  newAchievements: string[];
}

export function createEmptyGamificationStats(): GamificationStats {
  return {
    xp: 0,
    streak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    achievements: [],
  };
}

export function checkAndAwardAchievements(
  history: readonly ActivityRecord[],
  stats: GamificationStats,
  now = new Date(),
): string[] {
  const awarded = new Set(stats.achievements);
  const examHistory = history.filter(activity => activity.type === 'exam');
  const quizHistory = history.filter(activity => activity.type === 'quiz');

  const award = (id: string) => awarded.add(id);

  if (examHistory.length >= 1) award('exam_novice');
  if (examHistory.length >= 5) award('exam_pro');
  if (examHistory.length >= 15) award('exam_veteran');

  const lastExam = examHistory[examHistory.length - 1];
  if (lastExam) {
    const percentage = lastExam.total > 0 ? (lastExam.score / lastExam.total) * 100 : 0;
    if (percentage >= 90) award('top_scorer');
    if (percentage === 100) award('exam_ace');

    const sameSubjectExams = examHistory.filter(
      exam => exam.topic.toLowerCase() === lastExam.topic.toLowerCase(),
    );
    if (sameSubjectExams.length >= 3) award('subject_specialist');
  }

  if (quizHistory.length >= 1) award('quiz_taker');
  if (quizHistory.length >= 10) award('quiz_master');
  if (quizHistory.length >= 25) award('quiz_champion');

  const lastQuiz = quizHistory[quizHistory.length - 1];
  if (lastQuiz && lastQuiz.score === lastQuiz.total) award('perfect_quiz');

  if (stats.streak >= 3) award('scholars_streak_3');
  if (stats.streak >= 7) award('dedicated_learner_7');

  if (
    examHistory.length >= 3 &&
    examHistory.slice(-3).every(exam => ['A+', 'A'].includes(exam.grade ?? ''))
  ) {
    award('consistent_performer');
  }

  const examsThisWeek = examHistory.filter(activity =>
    isSameWeek(new Date(activity.date), now, { weekStartsOn: 1 }),
  );
  if (examsThisWeek.length >= 3) award('weekly_warrior');

  const quizzesThisWeek = quizHistory.filter(activity =>
    isSameWeek(new Date(activity.date), now, { weekStartsOn: 1 }),
  );
  if (quizzesThisWeek.length >= 5) award('quiz_whiz');

  return Array.from(awarded);
}

export function calculateActivityProgress(
  history: ActivityRecord[],
  currentStats: GamificationStats,
  entry: ActivityInput,
  now = new Date(),
): ActivityProgressUpdate {
  const activity: ActivityRecord = { ...entry, date: now.toISOString() };
  const updatedHistory = [...history, activity];
  const previousAchievements = new Set(currentStats.achievements);
  const earnedXp = entry.score * (entry.type === 'quiz' ? 10 : 1);
  const stats: GamificationStats = {
    ...currentStats,
    achievements: [...currentStats.achievements],
    xp: currentStats.xp + earnedXp,
  };

  const lastActivityDate = stats.lastActivityDate
    ? new Date(stats.lastActivityDate)
    : null;
  if (lastActivityDate && !Number.isNaN(lastActivityDate.getTime())) {
    const daysSinceLastActivity = differenceInCalendarDays(now, lastActivityDate);
    if (daysSinceLastActivity === 1) stats.streak += 1;
    else if (daysSinceLastActivity > 1) stats.streak = 1;
  } else {
    stats.streak = 1;
  }

  stats.longestStreak = Math.max(stats.longestStreak, stats.streak);
  stats.lastActivityDate = now.toISOString();
  stats.achievements = checkAndAwardAchievements(updatedHistory, stats, now);

  return {
    activity,
    history: updatedHistory,
    stats,
    earnedXp,
    newAchievements: stats.achievements.filter(id => !previousAchievements.has(id)),
  };
}

export function readLocalProgress(): UserProgress {
  const emptyProgress = { stats: createEmptyGamificationStats(), history: [] };
  if (typeof window === 'undefined') return emptyProgress;

  try {
    const parsedHistory: unknown = JSON.parse(
      window.localStorage.getItem('activityHistory') ?? '[]',
    );
    const parsedStats: unknown = JSON.parse(
      window.localStorage.getItem('gamificationStats') ?? '{}',
    );
    const history = Array.isArray(parsedHistory)
      ? parsedHistory.filter(isActivityRecord)
      : [];
    const statsRecord =
      typeof parsedStats === 'object' && parsedStats !== null
        ? (parsedStats as Partial<GamificationStats>)
        : {};

    return {
      history,
      stats: {
        xp: finiteNonNegative(statsRecord.xp),
        streak: finiteNonNegative(statsRecord.streak),
        longestStreak: finiteNonNegative(statsRecord.longestStreak),
        lastActivityDate:
          typeof statsRecord.lastActivityDate === 'string'
            ? statsRecord.lastActivityDate
            : null,
        achievements: Array.isArray(statsRecord.achievements)
          ? statsRecord.achievements.filter(
              (achievement): achievement is string => typeof achievement === 'string',
            )
          : [],
      },
    };
  } catch (error) {
    console.error('Unable to read local progress.', error);
    return emptyProgress;
  }
}

export function recordActivityLocally(entry: ActivityInput): ActivityProgressUpdate | null {
  if (typeof window === 'undefined') return null;

  const currentProgress = readLocalProgress();
  const update = calculateActivityProgress(
    currentProgress.history,
    currentProgress.stats,
    entry,
  );
  window.localStorage.setItem('activityHistory', JSON.stringify(update.history));
  window.localStorage.setItem('gamificationStats', JSON.stringify(update.stats));
  return update;
}

export function clearLocalProgress(): void {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem('activityHistory');
  window.localStorage.removeItem('gamificationStats');
  window.localStorage.removeItem('quizHistory');
}

function isActivityRecord(value: unknown): value is ActivityRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ActivityRecord>;
  return (
    (record.type === 'quiz' || record.type === 'exam') &&
    typeof record.topic === 'string' &&
    typeof record.score === 'number' &&
    Number.isFinite(record.score) &&
    typeof record.total === 'number' &&
    Number.isFinite(record.total) &&
    typeof record.date === 'string'
  );
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
