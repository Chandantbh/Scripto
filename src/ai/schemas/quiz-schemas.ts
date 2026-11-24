import { z } from 'zod';

export const QuizQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(2_000),
  options: z.array(z.string().trim().min(1).max(1_000)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).max(2_000),
  emoji: z.string().optional(),
}).superRefine((question, context) => {
  const distinctOptions = new Set(question.options.map(option => option.toLocaleLowerCase()));
  if (distinctOptions.size !== 4) {
    context.addIssue({ code: 'custom', message: 'Quiz options must be distinct.', path: ['options'] });
  }
});

export const QuizQuestionsSchema = z.array(QuizQuestionSchema).min(1).max(15).superRefine((questions, context) => {
  const prompts = new Set<string>();
  questions.forEach((question, index) => {
    const prompt = question.prompt.toLocaleLowerCase();
    if (prompts.has(prompt)) {
      context.addIssue({ code: 'custom', message: 'Quiz prompts must be unique.', path: [index, 'prompt'] });
    }
    prompts.add(prompt);
  });
});

export const QuizOutputSchema = z.object({ questions: QuizQuestionsSchema });
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
