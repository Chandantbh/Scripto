'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Award,
  BrainCircuit,
  ClipboardCheck,
  FileQuestion,
  FileText,
  Layers,
  Menu,
  MessageCircleQuestion,
  PanelLeft,
  PanelLeftClose,
  Share2,
  TrendingUp,
} from 'lucide-react';
import { useAuth, useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import SettingsDialog from './settings-dialog';
import { AvatarGraphic } from './avatars';
import { useEffect } from 'react';

const groups = [
  {
    label: 'CREATE',
    items: [
      { href: '/notes', icon: FileText, label: 'Notes', description: 'Structured summaries' },
      { href: '/quiz', icon: FileQuestion, label: 'Quiz', description: 'Test your recall' },
      { href: '/flashcards', icon: Layers, label: 'Cards', description: 'Spaced flashcards' },
      { href: '/eli5', icon: MessageCircleQuestion, label: 'Explain', description: 'Simple breakdowns' },
    ],
  },
  {
    label: 'PRACTICE',
    items: [
      { href: '/exam', icon: ClipboardCheck, label: 'Exam', description: 'Timed mock tests' },
      { href: '/concept-map', icon: Share2, label: 'Map', description: 'Visual concept graph' },
    ],
  },
  {
    label: 'YOU',
    items: [
      { href: '/progress', icon: TrendingUp, label: 'Progress', description: 'Streaks & stats' },
      { href: '/achievements', icon: Award, label: 'Badges', description: 'Earned milestones' },
    ],
  },
] as const;

export default function AppHeader({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarId, setAvatarId] = useState('account');
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    setAvatarId(window.localStorage.getItem('scripto-avatar') ?? 'account');
    setIsGuest(window.localStorage.getItem('scripto_guest') === '1');
  }, [settingsOpen]);

  if (!isLoaded || (!isSignedIn && !isGuest)) return null;

  const nav = (
    <nav className="space-y-5">
      {groups.map(group => (
        <div key={group.label}>
          {!collapsed && <p className="mb-1 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
            {group.label}
          </p>}
          <div className="space-y-0.5">
            {group.items.map(item => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.description}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'hover-column group relative flex items-center rounded-md transition-all duration-150 ease-out',
                    collapsed ? 'h-11 justify-center px-0' : 'gap-3 px-3 py-2.5',
                    active
                      ? 'border-l-2 border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] dark:border-[#60A5FA] dark:bg-[rgba(59,130,246,0.14)] dark:text-[#60A5FA]'
                      : 'text-muted-foreground hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:hover:bg-white/5 dark:hover:text-[#F4F4F6]',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-5">{item.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  )}
                  {collapsed && (
                    <span className="pointer-events-none absolute left-[calc(100%+8px)] z-[60] hidden w-44 rounded-md border border-border bg-popover px-3 py-2 text-left shadow-lg group-hover:block">
                      <span className="block text-xs font-semibold text-foreground">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 hidden border-r border-[#E2E8F0] bg-white py-4 backdrop-blur transition-[width] duration-200 dark:border-[#1F2229] dark:bg-[#0E0F12] md:flex md:flex-col',
        collapsed ? 'w-[68px] px-2' : 'w-[256px] px-3',
      )}>
        <div className={cn('mb-6 flex h-9 items-center', collapsed ? 'justify-center' : 'justify-between px-1')}>
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-border">
                <BrainCircuit className="h-5 w-5" />
              </span>
              <span className="font-heading text-lg font-bold">Scripto</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="group h-9 w-9"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            <span className="frosted-overlay pointer-events-none absolute left-[calc(100%+8px)] z-[70] hidden whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium group-hover:block">
              {collapsed ? 'Open sidebar' : 'Close sidebar'}
            </span>
          </Button>
        </div>
        <div className="flex-1">{nav}</div>
        <div className={cn(
          'mt-auto flex shrink-0 border-t border-border pb-3 pt-3',
          collapsed ? 'flex-col items-center gap-2' : 'items-center justify-between px-2',
        )}>
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'gap-2')}>
            <AvatarGraphic
              id={avatarId}
              imageUrl={user?.imageUrl}
              name={user?.fullName ?? user?.firstName ?? 'Account'}
              className="h-9 w-9"
            />
            {!collapsed && <span className="max-w-24 truncate text-sm font-medium">{user?.firstName ?? 'Account'}</span>}
          </div>
          <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} compact={collapsed} />
        </div>
      </aside>

      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 font-heading font-bold">
          <BrainCircuit className="h-5 w-5" /> Scripto
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 px-3">
            <SheetHeader className="mb-5">
              <SheetTitle className="text-left">Scripto</SheetTitle>
            </SheetHeader>
            {nav}
            {isGuest && (
              <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
                <Link href="/welcome" className="text-sm text-muted-foreground hover:text-foreground">Welcome</Link>
                <Link href="/sign-in"><Button size="sm">Sign in</Button></Link>
              </div>
            )}
            <div className="mt-5 border-t border-border pt-3">
              <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
