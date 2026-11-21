/**
 * @fileOverview Schemas and types for exam generation.
 */
import { z } from 'zod';

export const ExamQuestionSchema = z.object({
  question_type: z.enum(['mcq', 'short_answer', 'descriptive']),
  question_text: z.string().trim().min(1).max(2_000).describe('The full text of the question.'),
  options: z.array(z.string().trim().min(1).max(1_000)).max(4).optional().describe('An array of 4 multiple-choice options. Required only for MCQ type.'),
  correct_answer: z.string().trim().min(1).max(2_000).describe('The correct answer for the question. For MCQ, it must be one of the options.'),
  marks: z.number().int().min(1).max(1_000).describe('The marks allocated to this question.'),
});
export type ExamQuestion = z.infer<typeof ExamQuestionSchema>;

export const GenerateExamInputSchema = z.object({
  subject: z.string().trim().min(1).max(200).describe('The subject of the exam (e.g., "Biology").'),
  chapters: z.string().trim().min(1).max(5_000).describe('The specific chapters or topics to be covered (e.g., "5, 6, 7" or "Cell Structure, Photosynthesis").'),
  grade: z.string().trim().min(1).max(100).describe('The academic grade or level for which the exam is intended (e.g., "High School", "University Level", "10th Grade").'),
  totalMarks: z.number().int().min(1).max(1_000).describe('The total marks for the entire exam.'),
  questionTypes: z.array(z.enum(['mcq', 'short_answer', 'descriptive'])).min(1).max(3).describe('An array of question types to include in the exam.'),
});
export type GenerateExamInput = z.infer<typeof GenerateExamInputSchema>;

export const GenerateExamOutputSchema = z.object({
  title: z.string().max(200).describe('A suitable title for the exam paper.'),
  timeLimitMinutes: z.number().int().min(1).describe('The suggested time limit for the exam in minutes.'),
  instructions: z.string().max(5_000).describe('General instructions for the exam.'),
  questions: z.array(ExamQuestionSchema).min(1).max(50).describe('An array of exam questions.'),
});
export type GenerateExamOutput = z.infer<typeof GenerateExamOutputSchema>;
