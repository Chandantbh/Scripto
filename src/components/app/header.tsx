
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
            'flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5',
            pathname.startsWith(item.href)
              ? 'border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/10'
              : 'border-slate-200/80 bg-white/50 text-muted-foreground backdrop-blur-md hover:border-primary/25 hover:bg-primary/5 hover:text-foreground dark:border-white/10 dark:bg-slate-900/45 dark:hover:bg-white/10 dark:hover:shadow-lg dark:hover:shadow-primary/10'
          )}
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60">
      <div className="container flex h-16 items-center gap-3">
        <div className="flex min-w-0 items-center">
           <Link href="/" className="mr-5 flex shrink-0 items-center gap-2.5 pr-2">
            <BrainCircuit className="h-9 w-9 text-primary" />
            <span className="font-heading text-xl font-bold tracking-tight">Scripto</span>
          </Link>
          <nav className="hidden min-w-0 items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden 2xl:flex">
            {navLinks}
          </nav>
        </div>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
            <Show when="signed-in">
                <UserButton />
            </Show>
            <Show when="signed-out">
                <SignInButton mode="modal">
                    <Button variant="default" size="sm">
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
                  className="h-10 w-10 rounded-xl border border-slate-200/80 bg-white/60 text-foreground shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 dark:border-white/10 dark:bg-slate-900/50 dark:hover:bg-white/10"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-40 rounded-xl border-slate-200/80 bg-white/85 p-1.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90"
              >
                <DropdownMenuItem
                  onSelect={() => setTheme('light')}
                  className="rounded-lg px-3 py-2.5"
                >
                  <Sun className="h-4 w-4 text-amber-500" />
                  <span>Light Mode</span>
                  {theme === 'light' && <Check className="ml-auto h-4 w-4 text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setTheme('dark')}
                  className="rounded-lg px-3 py-2.5"
                >
                  <Moon className="h-4 w-4 text-indigo-500" />
                  <span>Dark Mode</span>
                  {theme === 'dark' && <Check className="ml-auto h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-xl border-slate-200/80 bg-white/60 text-foreground backdrop-blur-md dark:border-white/10 dark:bg-slate-900/50 2xl:hidden"
                >
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90 sm:w-[350px]">
                 <SheetHeader>
                    <SheetTitle className="text-left">Menu</SheetTitle>
                    <SheetDescription className="text-left">
                        Navigate to different sections of Scripto
                    </SheetDescription>
                  </SheetHeader>
                 <Link href="/" className="my-5 flex items-center gap-2.5" onClick={() => setIsMobileMenuOpen(false)}>
                    <BrainCircuit className="h-9 w-9 text-primary" />
                    <span className="font-heading text-xl font-bold">Scripto</span>
                </Link>
                <div className="flex flex-col gap-2">
                    {navLinks}
                </div>
              </SheetContent>
            </Sheet>
        </div>
      </div>
    </header>
  );
}
