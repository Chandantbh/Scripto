/**
 * @fileOverview Schemas and types for exam generation.
 */
import { z } from 'zod';
import { AIOutputValidationError } from '@/ai/errors';

const normalizeQuestionType = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'mcq' || normalized === 'multiplechoice') return 'mcq';
  if (normalized === 'shortanswer') return 'short_answer';
  if (normalized === 'descriptive') return 'descriptive';
  return value;
};

const CanonicalQuestionTypeSchema = z.enum(['mcq', 'short_answer', 'descriptive']);

export const ExamQuestionSchema = z.object({
  question_type: z.enum(['mcq', 'short_answer', 'descriptive']),
  question_text: z.string().trim().min(1).max(2_000).describe('The full text of the question.'),
  options: z.array(z.string().trim().min(1).max(1_000)).length(4).optional().describe('An array of 4 multiple-choice options.'),
  correct_answer: z.string().trim().min(1).max(2_000).describe('The correct answer for the question. For MCQ, it must be one of the options.'),
  marks: z.number().int().min(1).max(1_000).describe('The marks allocated to this question.'),
});
export type ExamQuestion = z.infer<typeof ExamQuestionSchema>;

export const GenerateExamInputSchema = z.object({
  subject: z.string().trim().min(1).max(200).describe('The subject of the exam (e.g., "Biology").'),
  chapters: z.string().trim().min(1).max(5_000).describe('The specific chapters or topics to be covered (e.g., "5, 6, 7" or "Cell Structure, Photosynthesis").'),
  grade: z.string().trim().min(1).max(100).describe('The academic grade or level for which the exam is intended (e.g., "High School", "University Level", "10th Grade").'),
  totalMarks: z.number().int().min(1).max(1_000).describe('The total marks for the entire exam.'),
  questionTypes: z.array(CanonicalQuestionTypeSchema).min(1).max(3).describe('An array of question types to include in the exam.'),
});
export type GenerateExamInput = z.infer<typeof GenerateExamInputSchema>;

export type GenerateExamActionInput = Omit<GenerateExamInput, 'grade' | 'chapters' | 'questionTypes'> & {
  grade?: string;
  gradeLevel?: string;
  classGrade?: string;
  chapters?: string;
  topics?: string;
  questionTypes: Array<
    | GenerateExamInput['questionTypes'][number]
    | 'Multiple Choice'
    | 'Short Answer'
    | 'Descriptive'
  >;
};

export const GenerateExamActionInputSchema = z.preprocess(value => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const input = Object.fromEntries(Object.entries(value));
  return {
    ...input,
    chapters: input.chapters ?? input.topics,
    grade: input.grade ?? input.gradeLevel ?? input.classGrade,
    questionTypes: Array.isArray(input.questionTypes)
      ? input.questionTypes.map(normalizeQuestionType)
      : input.questionTypes,
  };
}, GenerateExamInputSchema);

const GeneratedExamQuestionSchema = z.object({
  question_type: z.string().trim().min(1).max(40),
  question_text: z.string().trim().min(1).max(2_000),
  options: z.array(z.string().trim().min(1).max(1_000)).max(4).optional(),
  correct_answer: z.string().trim().min(1).max(2_000).optional(),
  correctIndex: z.number().int().min(0).max(3).optional(),
  marks: z.number().int().min(1).max(1_000),
});

export const GeneratedExamOutputSchema = z.object({
  title: z.string().max(200),
  timeLimitMinutes: z.number().int().min(1).max(600),
  instructions: z.string().max(5_000),
  questions: z.array(GeneratedExamQuestionSchema).min(1).max(50),
});

export const GenerateExamOutputSchema = z.object({
  title: z.string().max(200).describe('A suitable title for the exam paper.'),
  timeLimitMinutes: z.number().int().min(1).max(600).describe('The suggested time limit for the exam in minutes.'),
  instructions: z.string().max(5_000).describe('General instructions for the exam.'),
  questions: z.array(ExamQuestionSchema).min(1).max(50).describe('An array of exam questions.'),
});
export type GenerateExamOutput = z.infer<typeof GenerateExamOutputSchema>;

export function normalizeGeneratedExamOutput(value: unknown): GenerateExamOutput {
  const generated = GeneratedExamOutputSchema.parse(value);
  const questions = generated.questions.map(question => {
    const questionType = CanonicalQuestionTypeSchema.parse(
      normalizeQuestionType(question.question_type),
    );
    let correctAnswer = question.correct_answer;
    if (questionType === 'mcq') {
      if (!question.options || question.options.length !== 4) {
        throw new AIOutputValidationError('Multiple-choice questions must include exactly four options.');
      }
      if (question.correctIndex !== undefined) {
        correctAnswer = question.options[question.correctIndex];
      }
      if (!correctAnswer || !question.options.includes(correctAnswer)) {
        throw new AIOutputValidationError('Multiple-choice answers must match one of the four options.');
      }
    } else if (!correctAnswer) {
      throw new AIOutputValidationError('Short-answer and descriptive questions must include a correct answer.');
    }

    return {
      question_type: questionType,
      question_text: question.question_text,
      ...(question.options ? { options: question.options } : {}),
      correct_answer: correctAnswer,
      marks: question.marks,
    };
  });

  return GenerateExamOutputSchema.parse({...generated, questions});
}
