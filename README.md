# Scripto

An AI-powered active recall study workspace that turns topics, PDFs, DOCX files, and YouTube lectures into structured notes, quizzes, spaced-repetition flashcards, and concept maps.

[![CI](https://github.com/Chandantbh/Scripto/actions/workflows/ci.yml/badge.svg)](https://github.com/Chandantbh/Scripto/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/Live_Demo-scripto--gules.vercel.app-2563EB?style=flat)](https://scripto-gules.vercel.app)

## Screenshots

<!--
![Get Started](./docs/screenshots/get-started.png)
![Workspace](./docs/screenshots/workspace.png)
![Study Studio](./docs/screenshots/study-studio.png)
-->

## Core Features

### Get Started & Guest Mode (`/` & `/workspace`)

- Zero-friction entry through the Get Started page and workspace launcher.
- Persistent guest sessions use friendly `Guest #XXXX` identities stored locally.
- Custom study and music avatars are available in the app's profile experience.
- Light and Dark themes preserve the cobalt-blue visual palette across the workspace.
- Guest activity can continue locally, with Clerk sign-in available when account persistence and cross-device sync are needed.

### Split-Pane Active Recall Study Studio (`/notes`)

- Generate structured Markdown notes from text, topics, YouTube lectures, PDFs, DOCX files, and text files.
- Read in a focused Markdown/PDF-ready canvas with text-to-speech playback and PDF or Markdown export.
- Highlight text to reveal floating actions for simplified explanations, flashcard creation, and focused quizzes.
- Study beside live Quiz, Flashcards, Concept Map, and Ask Margin tools.
- Track session progress with a Topic Mastery Meter.
- Use responsive tabbed Notes and Study Studio views on mobile and tablet screen sizes.

### Spaced-Repetition Flashcards (`/flashcards`)

- Schedule reviews locally with lightweight spaced-repetition intervals.
- Use `Again` for a 10-minute review, `Good` for a 1-day interval, and `Easy` for a 4-day interval.
- Drill a "Due for review" queue from the flashcard page or workspace launcher.
- Sync review schedules to Supabase when a user is signed in.

### Timed Exams, ELI5 Breakdowns & Concept Maps (`/exam`, `/eli5`, `/concept-map`)

- Create customizable timed practice exams and receive AI-generated grading and feedback.
- Translate complex material into simple ELI5 explanations.
- Explore interactive React Flow knowledge graphs with connected concepts and relationships.

### Shareable Study Packs (`/s/[slug]`)

- Share a clean public read-only `/s/[slug]` link from the Study Studio toolbar.
- Read structured notes alongside an interactive quiz or flashcard preview.
- Sign in through the guest authentication flow before creating public study packs.
- Use the "Study in my workspace" call to action to continue in Scripto.

## Tech Stack

- Next.js 15 with the App Router
- TypeScript
- Tailwind CSS
- Clerk Authentication
- Supabase PostgreSQL
- Google Genkit / Gemini
- React Flow
- jsPDF

## Local Setup

### Prerequisites

- Node.js 18 or newer
- npm
- A Clerk application
- A Supabase project
- A Google Gemini API key

### 1. Clone and install

```bash
git clone https://github.com/Chandantbh/Scripto.git
cd Scripto
npm install
```

### 2. Configure environment variables

Create `.env.local` in the repository root and add the variables used by Scripto:

```env
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
UNSPLASH_ACCESS_KEY=
```

Use values from your own Clerk, Supabase, Google Gemini, and Unsplash accounts. Leave optional variables blank when they are not configured.

For a new Supabase project, apply the SQL migrations in `supabase/migrations/` before using account sync or public study packs.

### 3. Start the development server

```bash
npm run dev
```

Scripto runs at [http://localhost:9002](http://localhost:9002).

### Validation

```bash
npm run typecheck
npm run build
```

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
