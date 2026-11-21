'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  FileText,
  FileQuestion,
  Layers,
  BrainCircuit,
  TrendingUp,
  MessageCircleQuestion,
  Menu,
  ClipboardCheck,
  Share2,
  Award,
  Check,
  MoreVertical,
  Moon,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { UserButton, Show, SignInButton } from "@clerk/nextjs";
import { useTheme } from './theme-provider';

const navItems = [
  { href: '/notes', icon: FileText, label: 'Notes' },
  { href: '/quiz', icon: FileQuestion, label: 'Quiz' },
  { href: '/flashcards', icon: Layers, label: 'Flashcards' },
  { href: '/eli5', icon: MessageCircleQuestion, label: 'Explainer' },
  { href: '/exam', icon: ClipboardCheck, label: 'Exam' },
  { href: '/concept-map', icon: Share2, label: 'Concept Map'},
  { href: '/progress', icon: TrendingUp, label: 'Progress' },
  { href: '/achievements', icon: Award, label: 'Achievements'},
];

export default function AppHeader() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  // Removed check for landing page to show header everywhere
  // if (pathname === '/') {
  //   return null; 
  // }

  const navLinks = (
    <>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex h-[3.25rem] w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-6 text-sm font-medium transition-colors duration-200 xl:flex-1 xl:min-w-0 xl:px-2 xl:text-xs 2xl:px-2.5 2xl:text-sm',
            pathname.startsWith(item.href)
              ? 'border-zinc-300 bg-white text-zinc-950 shadow-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white'
              : 'border-slate-200 bg-secondary text-muted-foreground hover:border-slate-300 hover:bg-white hover:text-foreground dark:border-zinc-800 dark:bg-zinc-900/90 dark:hover:border-zinc-700 dark:hover:bg-zinc-800'
          )}
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <item.icon className="h-4 w-4 xl:hidden" />
          {item.label}
        </Link>
      ))}
    </>
  );

  return (
    <header className="relative z-50 w-full bg-transparent">
      <div className="container px-3 pt-8 pb-6 sm:px-6 lg:px-8">
        <div className="flex w-full items-center justify-between gap-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-secondary dark:border-zinc-800">
              <BrainCircuit className="h-7 w-7 text-foreground" />
            </span>
            <span className="flex flex-col">
              <span className="font-heading text-lg font-bold leading-tight tracking-tight sm:text-xl">Scripto</span>
              <span className="text-[8px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px] sm:tracking-[0.22em]">AI Study Assistant</span>
            </span>
          </Link>

          <nav className="mx-8 hidden min-w-0 flex-1 items-center justify-center gap-2.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-12 xl:flex">
            {navLinks}
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <Show when="signed-in">
              <UserButton />
            </Show>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <Button variant="default" size="sm" className="h-8 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm">
                  Sign In
                </Button>
              </SignInButton>
            </Show>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Choose color theme"
                  className="h-8 w-8 rounded-xl border-0 bg-transparent text-foreground shadow-none transition-colors hover:bg-secondary sm:h-10 sm:w-10"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-40 rounded-xl border-border bg-popover p-1.5 shadow-xl"
              >
                <DropdownMenuItem
                  onSelect={() => setTheme('light')}
                  className="rounded-lg px-3 py-2.5"
                >
                  <Sun className="h-4 w-4 text-muted-foreground" />
                  <span>Light Mode</span>
                  {theme === 'light' && <Check className="ml-auto h-4 w-4 text-foreground" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setTheme('dark')}
                  className="rounded-lg px-3 py-2.5"
                >
                  <Moon className="h-4 w-4 text-muted-foreground" />
                  <span>Dark Mode</span>
                  {theme === 'dark' && <Check className="ml-auto h-4 w-4 text-foreground" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="order-first h-8 w-8 rounded-xl border-border bg-card text-foreground xl:hidden sm:h-10 sm:w-10"
                >
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] border-border bg-background sm:w-[350px]">
                <SheetHeader>
                  <SheetTitle className="text-left">Menu</SheetTitle>
                  <SheetDescription className="text-left">
                    Navigate to different sections of Scripto
                  </SheetDescription>
                </SheetHeader>
                <Link href="/" className="my-5 flex items-center gap-3" onClick={() => setIsMobileMenuOpen(false)}>
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-secondary dark:border-zinc-800">
                    <BrainCircuit className="h-7 w-7 text-foreground" />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-heading text-xl font-bold leading-tight">Scripto</span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">AI Study Assistant</span>
                  </span>
                </Link>
                <div className="flex flex-col gap-2">
                  {navLinks}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div aria-hidden="true" className="mt-6 border-b border-slate-200 dark:border-zinc-800" />
      </div>
    </header>
  );
}
