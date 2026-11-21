# Scripto

**Scripto** is your personal AI-powered study assistant. Transform any text, topic, or video into comprehensive study materials instantly.

**Live demo:** [Open Scripto](https://scripto-gules.vercel.app)

## Screenshots

![Scripto Dark Mode](./public/screenshots/dashboard-dark.png)
![Scripto Light Mode](./public/screenshots/dashboard-light.png)

## 🚀 Features

Scripto offers a suite of tools designed to help you learn faster and retain more information:

- **📝 Smart Notes**: Generate structured notes from pasted text, a topic, PDFs, DOCX/text files, or YouTube videos.
- **🗂️ AI Flashcards**: Create flashcards from study material, topics, uploaded files, or YouTube videos.
- **🧠 Quiz Generator**: Generate multiple-choice quizzes from pasted text, a topic, or a YouTube video.
- **👶 ELI5 (Explain Like I'm 5)**: Simplify text, uploaded files, images, or YouTube video content, with a selectable explanation difficulty.
- **🗺️ Concept Maps**: Visualize relationships between topics with interactive concept maps.
- **🎓 Exam Prep**: Generate and take practice exams with configurable subjects, marks, and question types.
- **📊 Progress Tracking**: Track study streaks, XP, quiz and exam scores, and activity history.
- **🏆 Achievements**: Unlock achievement badges through quiz, exam, and consistency milestones.
- **📚 Quiz History**: Review past quiz results, scores, and study streak statistics.

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/)
- **Authentication**: [Clerk](https://clerk.com/)
- **AI Engine**: [Genkit](https://firebase.google.com/docs/genkit) (Google AI SDK)
- **State Management**: React Hooks
- **Icons**: [Lucide React](https://lucide.dev/)

## 📦 Getting Started

Follow these steps to set up the project locally:

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Chandantbh/Scripto.git
   cd scripto
   ```

2. **Install dependencies**
   ```bash
   npm ci --legacy-peer-deps
   # or
   pnpm install
   ```

3. **Environment Setup**
   Create a `.env.local` file in the root directory and add the following variables:
   
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
   CLERK_SECRET_KEY=your_clerk_secret_key
   GOOGLE_GENAI_API_KEY=your_google_ai_key
   unsplash_access_key=your_unsplash_key
   ```

4. **Run the Development Server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:9002](http://localhost:9002) with your browser to see the result.

   **Windows:** Keep the project outside OneDrive-synced folders. Next.js writes generated files to `.next`, and OneDrive filesystem reparse points can cause `EINVAL` errors. If moving an existing copy, remove its generated `.next` directory before starting the server again.

## 🤖 AI Flows

The application uses Genkit for AI operations. The flows are defined in `src/ai/flows/`:

- `generate-notes.ts`: Structured note generation
- `generate-quiz.ts`: MCQ generation
- `generate-flashcards.ts`: Q&A flashcard pairs
- `eli5.ts`: Simplified explanations

To run the Genkit developer UI:

```bash
npm run genkit:dev
```

## 📱 Mobile Support

Scripto is fully responsive and optimized for mobile devices, featuring a touch-friendly navigation drawer and adaptive layouts.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
