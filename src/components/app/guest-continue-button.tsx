'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { enableGuestMode } from '@/lib/guest-mode';

export default function GuestContinueButton() {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      className="mt-3 w-full"
      onClick={() => {
        enableGuestMode();
        router.push('/workspace');
      }}
    >
      Continue as guest →
    </Button>
  );
}
