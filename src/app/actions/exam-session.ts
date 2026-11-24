'use server';

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { generateExam } from '@/ai/flows/generate-exam';
import {
  GenerateExamInputSchema,
  GenerateExamOutputSchema,
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
const sessionIdSchema = z.string().uuid();

export async function startExamSessionAction(input: GenerateExamInput): Promise<{
  sessionId: string;
  exam: PublicExam;
  startedAt: string;
  durationSeconds: number;
}> {
  const parsedInput = GenerateExamInputSchema.safeParse(input);
  if (!parsedInput.success) throw new Error('Exam details are invalid.');

  const generated = await generateExam(parsedInput.data);
  if (!generated.ok) throw new Error(generated.error.message);
  const fullExam = GenerateExamOutputSchema.parse(generated.data);
  const durationSeconds = fullExam.timeLimitMinutes * 60;
  const startedAt = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  const publicExam: PublicExam = {
    ...fullExam,
    questions: fullExam.questions.map(question => ({
      question_type: question.question_type,
      question_text: question.question_text,
      ...(question.options ? { options: question.options } : {}),
      marks: question.marks,
    })),
  };
  const { userId } = await auth();
  const client = getSupabaseServerClient();
  if (!client) throw new Error('Exam session storage is not configured.');

  const { error } = await client.from('exam_sessions').insert({
    id: sessionId,
    user_id: userId ?? `guest:${sessionId}`,
    source_title: parsedInput.data.subject,
    public_exam: publicExam,
    answer_key: fullExam,
    answers: fullExam.questions.map(() => ''),
    started_at: startedAt,
    duration_seconds: durationSeconds,
  });
  if (error) {
    console.error('Scripto exam session could not be created.', error);
    throw new Error('Exam session could not be saved. Please try again.');
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
  const client = getSupabaseServerClient();
  if (!client) throw new Error('Exam session storage is not configured.');

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

export async function saveExamAnswersAction(sessionId: string, answers: string[]): Promise<void> {
  if (!sessionIdSchema.safeParse(sessionId).success) throw new Error('Exam session is invalid.');
  const parsedAnswers = answersSchema.safeParse(answers);
  if (!parsedAnswers.success) throw new Error('Exam answers are invalid.');
  const { userId } = await auth();
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
  const client = getSupabaseServerClient();
  if (!client) throw new Error('Exam session storage is not configured.');
  const { data, error } = await client.from('exam_sessions')
    .select('source_title, answer_key, answers, started_at, duration_seconds, completed_at')
    .eq('id', sessionId)
    .eq('user_id', userId ?? `guest:${sessionId}`)
    .maybeSingle();
  if (error) {
    console.error('Scripto exam session could not be submitted.', error);
    throw new Error('Exam could not be submitted. Please try again.');
  }
  if (!data || data.completed_at) throw new Error('This exam session is no longer active.');

  const fullExam = GenerateExamOutputSchema.parse(data.answer_key);
  const savedAnswers = answersSchema.parse(data.answers);
  if (savedAnswers.length !== fullExam.questions.length || parsedAnswers.data.length !== fullExam.questions.length) {
    throw new Error('Submit one answer for every exam question.');
  }
  const startedAtMs = new Date(data.started_at).getTime();
  const durationSeconds = Number(data.duration_seconds);
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
      sourceTitle: data.source_title,
      mode: 'exam',
      score: evaluated.data.totalScore,
      total,
      durationSeconds: timeTakenSeconds,
      missedQuestions,
    });
  }

  const { error: completeError } = await client.from('exam_sessions')
    .update({
      answers: normalizedAnswers,
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('user_id', userId ?? `guest:${sessionId}`);
  if (completeError) {
    console.error('Scripto exam completion could not be saved.', completeError);
    throw new Error('Exam results could not be saved.');
  }

  return {
    result: evaluated.data,
    questions: fullExam.questions,
    timeTakenSeconds,
  };
}
