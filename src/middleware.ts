import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher(['/', '/welcome(.*)', '/sign-in(.*)', '/sign-up(.*)']);
const isWorkspaceRoute = createRouteMatcher([
  '/workspace(.*)',
  '/notes(.*)',
  '/quiz(.*)',
  '/flashcards(.*)',
  '/eli5(.*)',
  '/exam(.*)',
  '/concept-map(.*)',
  '/progress(.*)',
  '/achievements(.*)',
  '/history(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request) && isWorkspaceRoute(request)) {
    const { userId } = await auth();
    const isGuest = request.cookies.get('scripto_guest')?.value === '1';
    if (!userId && isGuest) return;
    await auth.protect({
      unauthenticatedUrl: new URL('/sign-in', request.url).toString(),
    });
  }
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/','/test/settings', '/(api|trpc)(.*)'],
};
