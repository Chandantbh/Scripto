'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { History, Trash2, Flame, Star, TrendingUp } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { clearUserHistoryAction, getUserProgressAction } from '@/app/actions/user-data';
import {
  clearLocalProgress,
  createEmptyGamificationStats,
  readLocalProgress,
  type ActivityRecord,
  type GamificationStats,
} from '@/lib/gamification';

export default function HistoryPage() {
  const [activityHistory, setActivityHistory] = useState<ActivityRecord[]>([]);
  const [stats, setStats] = useState<GamificationStats>(createEmptyGamificationStats());
  const [isClient, setIsClient] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [syncWarning, setSyncWarning] = useState(false);

  useEffect(() => {
    let active = true;
    const loadProgress = async () => {
      try {
        const accountProgress = await getUserProgressAction();
        if (!active) return;
        const progress = accountProgress ?? readLocalProgress();
        setActivityHistory(progress.history);
        setStats(progress.stats);
      } catch (error) {
        console.error('Could not load account activity history.', error);
        if (!active) return;
        const progress = readLocalProgress();
        setActivityHistory(progress.history);
        setStats(progress.stats);
        setSyncWarning(true);
      } finally {
        if (active) setIsClient(true);
      }
    };
    void loadProgress();
    return () => {
      active = false;
    };
  }, []);

  const clearHistory = async () => {
    setIsClearing(true);
    try {
      await clearUserHistoryAction();
      clearLocalProgress();
      setActivityHistory([]);
      setStats(createEmptyGamificationStats());
      setSyncWarning(false);
    } catch (error) {
      console.error('Could not clear account activity history.', error);
      setSyncWarning(true);
    } finally {
      setIsClearing(false);
    }
  };
  
  const StatCard = ({ icon, label, value, unit }: { icon: React.ElementType, label: string, value: number, unit?: string }) => {
    const Icon = icon;
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">
                    {value}
                    {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
                </div>
            </CardContent>
        </Card>
    );
  };

  const renderHistory = () => {
    if (!isClient) {
      return <div className="flex flex-col items-center justify-center h-full text-center p-8"><History className="h-16 w-16 text-muted-foreground/50 mb-4" /></div>;
    }
    
    if (activityHistory.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <History className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold">No Activity History</h3>
          <p className="text-sm text-muted-foreground">Your past quiz and exam results will be saved here.</p>
        </div>
      );
    }

    const sortedHistory = [...activityHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
      <ScrollArea className="h-full">
        <div className="space-y-4">
          {sortedHistory.map((result, index) => (
            <Card key={index}>
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                <p className="font-semibold capitalize">{result.topic || `General ${result.type}`}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(result.date).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">
                  {result.score}/{result.total}
                  </p>
                  <p className="text-sm text-muted-foreground">
                  {result.type === 'quiz' ? 'Score' : 'Marks'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    );
  };
  
  return (
    <div className="flex flex-col flex-1 p-4 md:p-6">
        <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-primary/10 rounded-full border border-primary/20">
                <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Your Progress</h1>
                <p className="text-muted-foreground">Keep up the great work!</p>
            </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
            <StatCard icon={Star} label="Total XP" value={stats.xp} unit="XP" />
            <StatCard icon={Flame} label="Current Streak" value={stats.streak} unit="days" />
            <StatCard icon={TrendingUp} label="Longest Streak" value={stats.longestStreak} unit="days" />
        </div>

        <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Activity History</h2>
            {isClient && activityHistory.length > 0 && (
            <AlertDialog>
                <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isClearing}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isClearing ? 'Clearing...' : 'Clear All Data'}
                </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                    This will permanently delete your activity history and progress data. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearHistory}>Continue</AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            )}
        </div>
        {syncWarning && (
          <div role="status" className="mb-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            Account sync is unavailable. Showing activity saved on this device.
          </div>
        )}
        <Card className="flex-1">
            <CardContent className="p-6 h-[400px]">
            {renderHistory()}
            </CardContent>
        </Card>
    </div>
  );
}
