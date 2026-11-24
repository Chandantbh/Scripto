import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GenerateExamActionInputSchema,
  normalizeGeneratedExamOutput,
} from './schemas/exam-schemas';

test('normalizes Exam Simulator field and question-type aliases', () => {
  const input = GenerateExamActionInputSchema.parse({
    subject: 'Biology',
    classGrade: 'Grade 10',
    topics: 'Cells',
    totalMarks: 10,
    questionTypes: ['Multiple Choice', 'Short Answer'],
  });

  assert.deepEqual(input, {
    subject: 'Biology',
    grade: 'Grade 10',
    chapters: 'Cells',
    totalMarks: 10,
    questionTypes: ['mcq', 'short_answer'],
  });

  const gradeLevelInput = GenerateExamActionInputSchema.parse({
    subject: 'Physics',
    gradeLevel: 'Class 12',
    chapters: 'Motion',
    totalMarks: 5,
    questionTypes: ['mcq'],
  });
  assert.equal(gradeLevelInput.grade, 'Class 12');
  assert.equal(gradeLevelInput.chapters, 'Motion');
});

test('normalizes MCQ correctIndex and permits answer-only non-MCQ questions', () => {
  const output = normalizeGeneratedExamOutput({
    title: 'Cell Biology',
    timeLimitMinutes: 30,
    instructions: 'Answer all questions.',
    questions: [
      {
        question_type: 'Multiple Choice',
        question_text: 'Which structure contains DNA?',
        options: ['Ribosome', 'Nucleus', 'Membrane', 'Cytoplasm'],
        correctIndex: 1,
        marks: 5,
      },
      {
        question_type: 'Short Answer',
        question_text: 'Define a cell.',
        correct_answer: 'The basic unit of life.',
        marks: 5,
      },
      {
        question_type: 'Descriptive',
        question_text: 'Explain the function of the nucleus.',
        correct_answer: 'It stores DNA and controls cell activities.',
        marks: 5,
      },
    ],
  });

  assert.equal(output.questions[0].question_type, 'mcq');
  assert.equal(output.questions[0].correct_answer, 'Nucleus');
  assert.equal(output.questions[1].question_type, 'short_answer');
  assert.equal(output.questions[1].options, undefined);
  assert.equal(output.questions[2].question_type, 'descriptive');
  assert.equal(output.questions[2].options, undefined);
});

test('rejects MCQs without four options and a valid correct answer', () => {
  assert.throws(() => normalizeGeneratedExamOutput({
    title: 'Invalid exam',
    timeLimitMinutes: 10,
    instructions: '',
    questions: [{
      question_type: 'mcq',
      question_text: 'Pick an answer.',
      correct_answer: 'A',
      marks: 1,
    }],
  }));
});
