'use client';

import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTheme } from './theme-provider';
import { useUser } from '@clerk/nextjs';
import { AVATAR_OPTIONS, AvatarGraphic } from './avatars';

export type StudyPreferences = {
  theme: 'light' | 'dark';
  noteFormat: 'Concise' | 'Detailed' | 'Cornell';
  quizLength: 5 | 10 | 15;
  explainerDepth: 'Simple' | 'Standard' | 'Technical';
  dailyXpGoal: 50 | 100 | 200;
};

export const DEFAULT_PREFERENCES: StudyPreferences = {
  theme: 'light',
  noteFormat: 'Detailed',
  quizLength: 10,
  explainerDepth: 'Standard',
  dailyXpGoal: 100,
};

export function readStudyPreferences(): StudyPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem('scripto-preferences') ?? '{}',
    ) as Partial<StudyPreferences>;
    return {
      theme: stored.theme === 'dark' ? 'dark' : 'light',
      noteFormat: ['Concise', 'Detailed', 'Cornell'].includes(stored.noteFormat ?? '')
        ? stored.noteFormat as StudyPreferences['noteFormat']
        : DEFAULT_PREFERENCES.noteFormat,
      quizLength: [5, 10, 15].includes(Number(stored.quizLength))
        ? Number(stored.quizLength) as StudyPreferences['quizLength']
        : DEFAULT_PREFERENCES.quizLength,
      explainerDepth: ['Simple', 'Standard', 'Technical'].includes(stored.explainerDepth ?? '')
        ? stored.explainerDepth as StudyPreferences['explainerDepth']
        : DEFAULT_PREFERENCES.explainerDepth,
      dailyXpGoal: [50, 100, 200].includes(Number(stored.dailyXpGoal))
        ? Number(stored.dailyXpGoal) as StudyPreferences['dailyXpGoal']
        : DEFAULT_PREFERENCES.dailyXpGoal,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export default function SettingsDialog({
  open,
  onOpenChange,
  compact = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compact?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const { user } = useUser();
  const [avatar, setAvatar] = useState('account');
  const [preferences, setPreferences] = useState<StudyPreferences>({
    ...DEFAULT_PREFERENCES,
    theme,
  });

  useEffect(() => {
    if (open) {
      setPreferences({ ...readStudyPreferences(), theme });
      setAvatar(window.localStorage.getItem('scripto-avatar') ?? 'account');
    }
  }, [open, theme]);

  const updatePreference = <K extends keyof StudyPreferences>(
    key: K,
    value: StudyPreferences[K],
  ) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    window.localStorage.setItem('scripto-preferences', JSON.stringify(next));
  };

  const changeTheme = (nextTheme: 'light' | 'dark') => {
    setTheme(nextTheme);
    updatePreference('theme', nextTheme);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'icon' : 'default'}
          className={compact ? 'h-9 w-9' : 'h-9 justify-start gap-2 px-2'}
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" />
          {!compact && <span>Settings</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Set your study defaults and workspace appearance.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold">Appearance</h3>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map(option => (
                <Button
                  key={option}
                  type="button"
                  variant={preferences.theme === option ? 'secondary' : 'outline'}
                  className="flex-1 capitalize"
                  onClick={() => changeTheme(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <PreferenceSelect
              label="Default note format"
              value={preferences.noteFormat}
              options={['Concise', 'Detailed', 'Cornell']}
              onChange={value => updatePreference('noteFormat', value as StudyPreferences['noteFormat'])}
            />
            <PreferenceSelect
              label="Default quiz length"
              value={String(preferences.quizLength)}
              options={['5', '10', '15']}
              onChange={value => updatePreference('quizLength', Number(value) as StudyPreferences['quizLength'])}
            />
            <PreferenceSelect
              label="Explainer depth"
              value={preferences.explainerDepth}
              options={['Simple', 'Standard', 'Technical']}
              onChange={value => updatePreference('explainerDepth', value as StudyPreferences['explainerDepth'])}
            />
            <PreferenceSelect
              label="Daily XP goal"
              value={String(preferences.dailyXpGoal)}
              options={['50', '100', '200']}
              onChange={value => updatePreference('dailyXpGoal', Number(value) as StudyPreferences['dailyXpGoal'])}
            />
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">Avatar</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {AVATAR_OPTIONS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => {
                    setAvatar(id);
                    window.localStorage.setItem('scripto-avatar', id);
                  }}
                  className={`hover-column flex aspect-square flex-col items-center justify-center rounded-lg border transition-all duration-150 ease-out ${avatar === id ? 'border-foreground bg-secondary' : 'border-border hover:border-foreground/30 hover:bg-muted'}`}
                >
                  <AvatarGraphic id={id} imageUrl={id === 'account' ? user?.imageUrl : undefined} />
                  <span className="sr-only">{label}</span>
                </button>
              ))}
            </div>
          </section>

        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreferenceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option} value={option}>
              {option}{label === 'Default quiz length' || label === 'Daily XP goal' ? (label === 'Daily XP goal' ? ' XP' : ' questions') : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
