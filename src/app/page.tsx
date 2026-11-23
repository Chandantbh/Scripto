import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import GetStartedClient from './get-started-client';

export default async function HomePage() {
  const { userId } = await auth();
  const cookieStore = await cookies();
  return (
    <GetStartedClient
      isSignedIn={Boolean(userId)}
      isGuest={cookieStore.get('scripto_guest')?.value === '1'}
    />
  );
}
