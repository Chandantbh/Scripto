'use server';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { generateExam } from '@/ai/flows/generate-exam';
import {
  GenerateExamActionInputSchema,
  GenerateExamOutputSchema,
  type GenerateExamActionInput,
  type GenerateExamInput,
  type GenerateExamOutput,
} from '@/ai/schemas/exam-schemas';
import { type EvaluateExamOutput } from '@/ai/schemas/evaluation-schemas';
import { evaluateExam } from '@/ai/flows/evaluate-exam';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { recordStudyAttemptAction } from '@/app/actions/user-data';

const PublicExamSchema = GenerateExamOutputSchema
  .omit({ questions: true })
  .extend({
    questions: z.array(GenerateExamOutputSchema.shape.questions.element.omit({ correct_answer: true })),
  });
type PublicExam = z.infer<typeof PublicExamSchema>;

const answersSchema = z.array(z.string().max(2_000)).max(50);
const sessionIdSchema = z.union([
  z.string().uuid(),
  z.string()
    .max(900_000)
    .regex(/^exam1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
]);
const IN_MEMORY_SESSION_TTL_MS = 12 * 60 * 60 * 1_000;
const MAX_IN_MEMORY_EXAM_SESSIONS = 100;
const EXAM_SESSION_TOKEN_AAD = Buffer.from('scripto-exam-session-v1');

const ValidExamSessionPayloadSchema = z.object({
  ownerId: z.string().min(1).max(256),
  sourceTitle: z.string().min(1).max(200),
  answerKey: GenerateExamOutputSchema,
  answers: answersSchema,
  startedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(60).max(36_000),
  completedAt: z.string().datetime().nullable(),
  expiresAt: z.number().int().positive(),
});

type ExamSessionPayload = z.infer<typeof ValidExamSessionPayloadSchema>;

type InMemoryExamSession = ExamSessionPayload & {
  publicExam: PublicExam;
  createdAt: number;
};

const inMemoryExamSessions = new Map<string, InMemoryExamSession>();

function isEncryptedExamSessionToken(sessionId: string): boolean {
  return sessionId.startsWith('exam1.');
}

function getExamSessionEncryptionKey(): Buffer | null {
  const secret = process.env.EXAM_SESSION_SECRET || process.env.CLERK_SECRET_KEY;
  if (!secret) return null;
  return createHash('sha256').update(`scripto-exam-session:${secret}`).digest();
}

function createExamSessionToken(payload: ExamSessionPayload): string | null {
  const key = getExamSessionEncryptionKey();
  if (!key) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(EXAM_SESSION_TOKEN_AAD);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const token = [
    'exam1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
  return token.length <= 900_000 ? token : null;
}

function readExamSessionToken(sessionId: string, ownerId: string): ExamSessionPayload {
  const key = getExamSessionEncryptionKey();
  if (!key) throw new Error('Exam session token encryption is not configured.');

  let payload: ExamSessionPayload;
  try {
    const [, encodedIv, encodedTag, encodedCiphertext] = sessionId.split('.');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
    decipher.setAAD(EXAM_SESSION_TOKEN_AAD);
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    payload = ValidExamSessionPayloadSchema.parse(JSON.parse(plaintext));
  } catch (error) {
    console.error('[EXAM_SESSION_TOKEN_INVALID]', error);
    throw new Error('Exam session token is invalid or expired.', { cause: error });
  }

  if (payload.expiresAt <= Date.now()) throw new Error('Exam session has expired.');
  if (payload.ownerId !== ownerId) throw new Error('Exam session does not belong to this account.');
  return payload;
}

function toPublicExam(fullExam: GenerateExamOutput): PublicExam {
  return {
    ...fullExam,
    questions: fullExam.questions.map(question => ({
      question_type: question.question_type,
      question_text: question.question_text,
      ...(question.options ? { options: question.options } : {}),
      marks: question.marks,
    })),
  };
}

function rememberExamSession(sessionId: string, session: InMemoryExamSession): void {
  const now = Date.now();
  for (const [id, existing] of inMemoryExamSessions) {
    if (existing.createdAt + IN_MEMORY_SESSION_TTL_MS <= now) {
      inMemoryExamSessions.delete(id);
    }
  }
  while (inMemoryExamSessions.size >= MAX_IN_MEMORY_EXAM_SESSIONS) {
    const oldestSessionId = inMemoryExamSessions.keys().next().value;
    if (!oldestSessionId) break;
    inMemoryExamSessions.delete(oldestSessionId);
  }
  inMemoryExamSessions.set(sessionId, session);
}

function findInMemoryExamSession(sessionId: string, ownerId: string): InMemoryExamSession | null {
  const session = inMemoryExamSessions.get(sessionId);
  if (!session) return null;
  if (session.createdAt + IN_MEMORY_SESSION_TTL_MS <= Date.now()) {
    inMemoryExamSessions.delete(sessionId);
    return null;
  }
  return session.ownerId === ownerId ? session : null;
}

export async function startExamSessionAction(input: GenerateExamActionInput): Promise<
  | {
      success: true;
      session: {
        sessionId: string;
        exam: PublicExam;
        startedAt: string;
        durationSeconds: number;
      };
      error?: never;
    }
  | { success: false; error: string; session?: never }
> {
  try {
    const session = await createExamSession(input);
    return { success: true, session };
  } catch (error) {
    console.error('[EXAM_GENERATION_FAILED]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function createExamSession(input: GenerateExamActionInput): Promise<{
  sessionId: string;
  exam: PublicExam;
  startedAt: string;
  durationSeconds: number;
}> {
  const parsedInput = GenerateExamActionInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const error = new Error('Exam details are invalid.', { cause: parsedInput.error });
    console.error('[EXAM_GENERATION_FAILED]', error);
    throw error;
  }

  let generated: Awaited<ReturnType<typeof generateExam>>;
  try {
    generated = await generateExam(parsedInput.data);
  } catch (error) {
    console.error('[EXAM_GENERATION_FAILED]', error);
    throw error;
  }
  if (!generated.ok) {
    const error = new Error(generated.error.message);
    console.error('[EXAM_GENERATION_FAILED]', error);
    throw error;
  }
  let fullExam: GenerateExamOutput;
  try {
    fullExam = GenerateExamOutputSchema.parse(generated.data);
  } catch (error) {
    console.error('[EXAM_GENERATION_FAILED]', error);
    throw error;
  }
  const durationSeconds = fullExam.timeLimitMinutes * 60;
  const startedAt = new Date().toISOString();
  const databaseSessionId = crypto.randomUUID();
  let sessionId = databaseSessionId;
  const publicExam = toPublicExam(fullExam);
  const { userId } = await auth();
  const ownerId = userId ?? `guest:${databaseSessionId}`;
  const client = getSupabaseServerClient();
  let useFallbackSession = !client;
  if (client) {
    try {
      const { error } = await client.from('exam_sessions').insert({
        id: databaseSessionId,
        user_id: ownerId,
        source_title: parsedInput.data.subject,
        questions: publicExam.questions,
        public_exam: publicExam,
        answer_key: fullExam,
        answers: fullExam.questions.map(() => ''),
        started_at: startedAt,
        duration_seconds: durationSeconds,
      });
      if (error) throw error;
    } catch (error) {
      console.error('Scripto exam session could not be created in Supabase; using a fallback session.', error);
      useFallbackSession = true;
    }
  } else {
    console.warn('Scripto exam session storage is not configured; using a fallback session.');
  }

  if (useFallbackSession) {
    const payload: ExamSessionPayload = {
      ownerId: userId ? `user:${userId}` : 'guest',
      sourceTitle: parsedInput.data.subject,
      answerKey: fullExam,
      answers: fullExam.questions.map(() => ''),
      startedAt,
      durationSeconds,
      completedAt: null,
      expiresAt: Date.now() + IN_MEMORY_SESSION_TTL_MS,
    };
    try {
      sessionId = createExamSessionToken(payload) ?? databaseSessionId;
    } catch (error) {
      console.error('[EXAM_SESSION_TOKEN_CREATE_FAILED]', error);
      sessionId = databaseSessionId;
    }
    if (sessionId === databaseSessionId) {
      rememberExamSession(databaseSessionId, {
        ...payload,
        ownerId,
        publicExam,
        createdAt: Date.now(),
      });
    }
  }

  return { sessionId, exam: publicExam, startedAt, durationSeconds };
}

export async function getExamSessionAction(sessionId: string): Promise<{
  exam: PublicExam;
  startedAt: string;
  durationSeconds: number;
  answers: string[];
  sourceTitle: string;
} | null> {
  if (!sessionIdSchema.safeParse(sessionId).success) return null;
  const { userId } = await auth();
  if (isEncryptedExamSessionToken(sessionId)) {
    const tokenSession = readExamSessionToken(
      sessionId,
      userId ? `user:${userId}` : 'guest',
    );
    if (tokenSession.completedAt) return null;
    return {
      exam: toPublicExam(tokenSession.answerKey),
      startedAt: tokenSession.startedAt,
      durationSeconds: tokenSession.durationSeconds,
      answers: tokenSession.answers,
      sourceTitle: tokenSession.sourceTitle,
    };
  }
  const memorySession = findInMemoryExamSession(sessionId, userId ?? `guest:${sessionId}`);
  if (memorySession) {
    if (memorySession.completedAt) return null;
    return {
      exam: memorySession.publicExam,
      startedAt: memorySession.startedAt,
      durationSeconds: memorySession.durationSeconds,
      answers: memorySession.answers,
      sourceTitle: memorySession.sourceTitle,
    };
  }
  const client = getSupabaseServerClient();
  if (!client) return null;

  let query = client.from('exam_sessions')
    .select('public_exam, answers, started_at, duration_seconds, source_title')
    .eq('id', sessionId)
    .is('completed_at', null);
  query = query.eq('user_id', userId ?? `guest:${sessionId}`);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error('Scripto exam session could not be loaded.', error);
    throw new Error('Exam session could not be restored. Please try again.');
  }
  if (!data) return null;
  return {
    exam: PublicExamSchema.parse(data.public_exam),
    startedAt: data.started_at,
    durationSeconds: data.duration_seconds,
    answers: answersSchema.parse(data.answers),
    sourceTitle: data.source_title,
  };
}

export async function saveExamAnswersAction(sessionId: string, answers: string[]): Promise<string> {
  if (!sessionIdSchema.safeParse(sessionId).success) throw new Error('Exam session is invalid.');
  const parsedAnswers = answersSchema.safeParse(answers);
  if (!parsedAnswers.success) throw new Error('Exam answers are invalid.');
  const { userId } = await auth();
  if (isEncryptedExamSessionToken(sessionId)) {
    const tokenSession = readExamSessionToken(
      sessionId,
      userId ? `user:${userId}` : 'guest',
    );
    if (tokenSession.completedAt) throw new Error('This exam session is no longer active.');
    if (parsedAnswers.data.length !== tokenSession.answerKey.questions.length) {
      throw new Error('Exam answers are incomplete.');
    }
    if (Date.now() > new Date(tokenSession.startedAt).getTime() + tokenSession.durationSeconds * 1000) {
      throw new Error('The exam time has expired.');
    }
    const updatedToken = createExamSessionToken({
      ...tokenSession,
      answers: parsedAnswers.data,
    });
    if (!updatedToken) throw new Error('Exam session token encryption is not configured.');
    return updatedToken;
  }
  const memorySession = findInMemoryExamSession(sessionId, userId ?? `guest:${sessionId}`);
  if (memorySession) {
    if (memorySession.completedAt) throw new Error('This exam session is no longer active.');
    if (parsedAnswers.data.length !== memorySession.answerKey.questions.length) {
      throw new Error('Exam answers are incomplete.');
    }
    if (Date.now() > new Date(memorySession.startedAt).getTime() + memorySession.durationSeconds * 1000) {
      throw new Error('The exam time has expired.');
    }
    memorySession.answers = parsedAnswers.data;
    return sessionId;
  }
  const client = getSupabaseServerClient();
  if (!client) throw new Error('Exam session storage is not configured.');

  const { data, error: loadError } = await client.from('exam_sessions')
    .select('public_exam, started_at, duration_seconds, completed_at')
    .eq('id', sessionId)
    .eq('user_id', userId ?? `guest:${sessionId}`)
    .maybeSingle();
  if (loadError) {
    console.error('Scripto exam answers could not be validated.', loadError);
    throw new Error('Exam answers could not be saved.');
  }
  if (!data || data.completed_at) throw new Error('This exam session is no longer active.');
  const exam = PublicExamSchema.parse(data.public_exam);
  if (parsedAnswers.data.length !== exam.questions.length) {
    throw new Error('Exam answers are incomplete.');
  }
  if (Date.now() > new Date(data.started_at).getTime() + data.duration_seconds * 1000) {
    throw new Error('The exam time has expired.');
  }

  const { error } = await client.from('exam_sessions')
    .update({ answers: parsedAnswers.data })
    .eq('id', sessionId)
    .eq('user_id', userId ?? `guest:${sessionId}`);
  if (error) {
    console.error('Scripto exam answers could not be saved.', error);
    throw new Error('Exam answers could not be saved.');
  }
  return sessionId;
}

export async function submitExamSessionAction(sessionId: string, answers: string[]): Promise<{
  result: EvaluateExamOutput;
  questions: GenerateExamOutput['questions'];
  timeTakenSeconds: number;
}> {
  if (!sessionIdSchema.safeParse(sessionId).success) throw new Error('Exam session is invalid.');
  const parsedAnswers = answersSchema.safeParse(answers);
  if (!parsedAnswers.success) throw new Error('Exam answers are invalid.');
  const { userId } = await auth();
  const ownerId = userId ?? `guest:${sessionId}`;
  const tokenSession = isEncryptedExamSessionToken(sessionId)
    ? readExamSessionToken(sessionId, userId ? `user:${userId}` : 'guest')
    : null;
  const memorySession = tokenSession ? null : findInMemoryExamSession(sessionId, ownerId);
  let client: ReturnType<typeof getSupabaseServerClient> = null;
  let sourceTitle: string;
  let fullExam: GenerateExamOutput;
  let savedAnswers: string[];
  let startedAt: string;
  let durationSeconds: number;

  if (tokenSession) {
    if (tokenSession.completedAt) throw new Error('This exam session is no longer active.');
    sourceTitle = tokenSession.sourceTitle;
    fullExam = tokenSession.answerKey;
    savedAnswers = tokenSession.answers;
    startedAt = tokenSession.startedAt;
    durationSeconds = tokenSession.durationSeconds;
  } else if (memorySession) {
    if (memorySession.completedAt) throw new Error('This exam session is no longer active.');
    sourceTitle = memorySession.sourceTitle;
    fullExam = memorySession.answerKey;
    savedAnswers = memorySession.answers;
    startedAt = memorySession.startedAt;
    durationSeconds = memorySession.durationSeconds;
  } else {
    client = getSupabaseServerClient();
    if (!client) throw new Error('Exam session storage is not configured.');
    const { data, error } = await client.from('exam_sessions')
      .select('source_title, answer_key, answers, started_at, duration_seconds, completed_at')
      .eq('id', sessionId)
      .eq('user_id', ownerId)
      .maybeSingle();
    if (error) {
      console.error('Scripto exam session could not be submitted.', error);
      throw new Error('Exam could not be submitted. Please try again.');
    }
    if (!data || data.completed_at) throw new Error('This exam session is no longer active.');

    sourceTitle = data.source_title;
    fullExam = GenerateExamOutputSchema.parse(data.answer_key);
    savedAnswers = answersSchema.parse(data.answers);
    startedAt = data.started_at;
    durationSeconds = Number(data.duration_seconds);
  }

  if (savedAnswers.length !== fullExam.questions.length || parsedAnswers.data.length !== fullExam.questions.length) {
    throw new Error('Submit one answer for every exam question.');
  }
  const startedAtMs = new Date(startedAt).getTime();
  const deadline = startedAtMs + durationSeconds * 1000;
  const timeExpired = Date.now() >= deadline;
  const timeTakenSeconds = Math.min(durationSeconds, Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
  const normalizedAnswers = (timeExpired ? savedAnswers : parsedAnswers.data).map(answer => answer.trim());
  const evaluated = await evaluateExam({
    examQuestions: fullExam.questions,
    userAnswers: normalizedAnswers,
  });
  if (!evaluated.ok) throw new Error(evaluated.error.message);
  const total = fullExam.questions.reduce((sum, question) => sum + question.marks, 0);
  const missedQuestions = evaluated.data.feedbackPerQuestion
    .map((feedback, index) => ({ feedback, question: fullExam.questions[index] }))
    .filter(item => item.feedback.isCorrect !== 'correct')
    .map(({ feedback, question }) => ({
      prompt: question.question_text,
      explanation: feedback.feedback,
    }));

  if (userId) {
    await recordStudyAttemptAction({
      sourceTitle,
      mode: 'exam',
      score: evaluated.data.totalScore,
      total,
      durationSeconds: timeTakenSeconds,
      missedQuestions,
    });
  }

  if (!tokenSession) {
    if (memorySession) {
      memorySession.answers = normalizedAnswers;
      memorySession.completedAt = new Date().toISOString();
    } else if (client) {
      const { error: completeError } = await client.from('exam_sessions')
        .update({
          answers: normalizedAnswers,
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('user_id', ownerId);
      if (completeError) {
        console.error('Scripto exam completion could not be saved.', completeError);
        throw new Error('Exam results could not be saved.');
      }
    } else {
      throw new Error('Exam session storage is not configured.');
    }
  }

  return {
    result: evaluated.data,
    questions: fullExam.questions,
    timeTakenSeconds,
  };
}
