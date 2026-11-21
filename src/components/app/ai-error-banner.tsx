import { AlertCircle } from 'lucide-react';

export default function AIErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-zinc-300 bg-zinc-100 p-4 text-sm text-foreground dark:border-zinc-700 dark:bg-zinc-900"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
