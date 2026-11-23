'use client';

import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { GuestAction } from '@/lib/guest-mode';

const messages: Record<GuestAction, string> = {
  'save-note': 'Create an account to save this note and keep it across devices.',
  progress: 'Sign in to sync study progress across devices.',
  badges: 'Sign in to save badge progress across devices.',
  generation: "You've used your 2 guest runs — sign in to keep locking in.",
};

export default function GuestAuthModal({
  open,
  onOpenChange,
  action,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: GuestAction;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Continue with Scripto</DialogTitle>
          <DialogDescription>{messages[action]}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Link href="/sign-up" className="w-full">
            <Button className="w-full">Sign up</Button>
          </Link>
          <Link href="/sign-in" className="w-full">
            <Button variant="outline" className="w-full">Sign in</Button>
          </Link>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Keep browsing as guest</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
