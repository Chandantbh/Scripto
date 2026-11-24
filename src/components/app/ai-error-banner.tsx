import { AlertCircle, LogIn, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AIErrorBanner({
  message,
  onRetry,
  showSignIn = false,
}: {
  message: string | null;
  onRetry?: () => void;
  showSignIn?: boolean;
}) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-zinc-300 bg-zinc-100 p-4 text-sm text-foreground dark:border-zinc-700 dark:bg-zinc-900"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p>{message}</p>
        {(onRetry || showSignIn) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            )}
            {showSignIn && (
              <Button type="button" size="sm" onClick={() => window.location.assign('/sign-in')}>
                <LogIn className="mr-2 h-4 w-4" />
                Sign In
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
