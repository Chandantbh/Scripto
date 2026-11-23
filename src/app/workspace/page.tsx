import { auth, currentUser } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import HomeClient from '@/app/home-client';
import {
  getUserDashboardDataAction,
  type UserDashboardData,
} from '@/app/actions/user-data';

function createDashboardFallback(): UserDashboardData {
  const stats = {
    xp: 0,
    streak: 0,
    longestStreak: 0,
    lastActivityDate: null,
    achievements: [],
  };
  return {
    progress: { stats, history: [] },
    savedNotes: [],
    recentActivity: [],
    stats,
    recentNotes: [],
    recentActivities: [],
    synced: false,
    averageQuizScore: 0,
  };
}

export default async function WorkspacePage() {
  const { userId } = await auth();
  const cookieStore = await cookies();
  const isGuest = cookieStore.get('scripto_guest')?.value === '1';
  if (!userId && !isGuest) redirect('/');

  if (!userId) {
    return <HomeClient isSignedIn={false} isGuest={true} firstName={null} dashboard={null} />;
  }

  let user = null;
  let dashboard = createDashboardFallback();
  try {
    [user, dashboard] = await Promise.all([
      currentUser(),
      getUserDashboardDataAction().then(value => value ?? createDashboardFallback()),
    ]);
  } catch {
    console.warn('Scripto dashboard could not be loaded; showing local fallback.');
  }

  return (
    <HomeClient
      isSignedIn={true}
      firstName={user?.firstName ?? null}
      dashboard={dashboard}
    />
  );
}
