# Scripto

**Scripto is a personal AI study workspace that turns text, topics, documents, and YouTube links into focused notes, quizzes, flashcards, exams, and visual knowledge maps.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Visit_Scripto-18181b?style=for-the-badge)](https://scripto-gules.vercel.app)

## Showcase

![Study Notes](./public/screenshots/notes.png)

![Concept Map](./public/screenshots/concept-map.png)

![Progress and Achievements](./public/screenshots/progress.png)

## Features

### Study tools

- **Study Notes** (`src/ai/flows/generate-notes.ts`) - Generate structured Markdown notes from pasted text, topics, PDF/DOCX/TXT documents, or YouTube links. Export them as PDFs with `jspdf` and save them to your account.
- **Interactive Quiz** (`src/ai/flows/generate-quiz.ts`) - Generate multiple-choice quizzes with instant scoring and XP tracking.
- **Flashcards** (`src/ai/flows/generate-flashcards.ts`, `src/ai/flows/generate-from-topic.ts`) - Flip through concise AI-generated flashcards from topics, uploaded files, or YouTube videos.
- **ELI5 Explainer** (`src/ai/flows/eli5.ts`) - Generate multi-difficulty explanations from text, documents, images, or YouTube content.
- **Concept Maps** (`src/ai/flows/generate-concept-map.ts`) - Explore interactive React Flow knowledge graphs with custom monochrome node cards and labeled directed edges.
- **Exam Prep and Grading** (`src/ai/flows/generate-exam.ts`, `src/ai/flows/evaluate-exam.ts`) - Create customizable practice exams and receive AI-generated grading and feedback.

### Progress and account storage

- **Progress, Streaks, and Achievements** (`src/app/actions/user-data.ts`, `src/lib/gamification.ts`) track XP, streaks, longest streaks, quiz and exam activity, and achievement unlocks.
- Authenticated user data is persisted in **Supabase PostgreSQL** in `user_stats`, `activity_history`, and `saved_notes`, with row-level security enabled.
- Clerk authenticates users and scopes server-side data access to the Clerk `user_id`.
- `localStorage` provides a fallback for signed-out users or when account synchronization is unavailable.

## Architecture

- Next.js App Router pages and server actions deliver the study tools and account workflows.
- Genkit prompts and Zod schemas run AI generation and validate AI inputs and outputs.
- Server Actions use a server-only Supabase service-role client for authenticated account operations.
- YouTube study sources support resilient transcript retrieval and canonical URL normalization.
- Clerk sessions protect account features, while API rate limiting limits AI requests per authenticated user or IP.

## Tech Stack

- Next.js 15 with the App Router
- TypeScript
- Tailwind CSS
- Clerk Authentication
- Supabase PostgreSQL with RLS enabled
- Google Gemini through Genkit
- React Flow
- jsPDF
- Vercel deployment

Legacy Firebase/IDX configuration has been removed.

## Quick Start

### Prerequisites

- Node.js 18 or newer
- npm
- A Clerk application
- A Supabase project
- A Google Gemini API key

### Clone and install

```bash
git clone https://github.com/Chandantbh/Scripto.git
cd Scripto
npm ci
```

### Environment variables

Create `.env.local` in the repository root:

```env
GEMINI_API_KEY=your_google_gemini_api_key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:9002](http://localhost:9002).

### Validation

```bash
npm run typecheck
npm run build
```

## AI Flow Reference

- `src/ai/flows/generate-notes.ts`
- `src/ai/flows/generate-quiz.ts`
- `src/ai/flows/generate-flashcards.ts`
- `src/ai/flows/generate-from-topic.ts`
- `src/ai/flows/eli5.ts`
- `src/ai/flows/generate-concept-map.ts`
- `src/ai/flows/generate-exam.ts`
- `src/ai/flows/evaluate-exam.ts`

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
