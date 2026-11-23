'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import AppHeader from './header';
import GuestAuthModal from './guest-auth-modal';
import type { GuestAction } from '@/lib/guest-mode';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [guestModalAction, setGuestModalAction] = useState<GuestAction>('generation');

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('scripto-sidebar-collapsed') === 'true');
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('scripto-sidebar-collapsed', String(next));
      return next;
    });
  };

  const [guest, setGuest] = useState(false);
  useEffect(() => {
    setGuest(window.localStorage.getItem('scripto_guest') === '1');
    const handleGuestAuth = (event: Event) => {
      setGuestModalAction((event as CustomEvent<GuestAction>).detail);
      setGuestModalOpen(true);
    };
    window.addEventListener('scripto:guest-auth', handleGuestAuth);
    const handleSubmitKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      const target = event.target as HTMLElement;
      const isInput = target instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'file', 'number'].includes(target.type);
      const isTextArea = target instanceof HTMLTextAreaElement;
      if ((!isInput && !(isTextArea && !event.shiftKey))) return;
      if (isTextArea && event.shiftKey) return;
      event.preventDefault();
      const form = target.closest('form');
      if (form) {
        form.requestSubmit();
        return;
      }
      const submitButton = document.querySelector<HTMLButtonElement>('main [data-enter-submit="true"]:not(:disabled)');
      submitButton?.click();
    };
    window.addEventListener('keydown', handleSubmitKey);
    return () => {
      window.removeEventListener('keydown', handleSubmitKey);
      window.removeEventListener('scripto:guest-auth', handleGuestAuth);
    };
  }, []);

  const workspaceLayout = isLoaded && (isSignedIn || guest);

  return (
    <div className="min-h-screen">
      <AppHeader collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className={
        workspaceLayout
          ? `transition-[padding] duration-200 ${collapsed ? 'md:pl-[68px]' : 'md:pl-[256px]'}`
          : ''
      }>
        {children}
      </div>
      <GuestAuthModal open={guestModalOpen} onOpenChange={setGuestModalOpen} action={guestModalAction} />
    </div>
  );
}
