export type GuestAction = 'save-note' | 'progress' | 'badges' | 'generation';

export const GUEST_GENERATION_KEY = 'scripto_guest_generations';
export const GUEST_MODE_KEY = 'scripto_guest';
export const GUEST_NAME_KEY = 'scripto-guest-name';

export function getGuestDisplayName(): string {
  if (typeof window === 'undefined') return 'Guest';

  try {
    const existing = window.localStorage.getItem(GUEST_NAME_KEY)?.trim();
    if (existing) return existing;

    const handle = `Guest #${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`;
    window.localStorage.setItem(GUEST_NAME_KEY, handle);
    return handle;
  } catch {
    return 'Guest';
  }
}

export function enableGuestMode(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GUEST_MODE_KEY, '1');
  getGuestDisplayName();
  document.cookie = 'scripto_guest=1; path=/; max-age=86400; samesite=lax';
}

export function isGuestMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.localStorage.getItem(GUEST_MODE_KEY) === '1' ||
    document.cookie.split('; ').some(cookie => cookie === 'scripto_guest=1')
  );
}

export function getGuestGenerationCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const value = Number(window.localStorage.getItem(GUEST_GENERATION_KEY) ?? '0');
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function consumeGuestGeneration(): 'allowed' | 'limited' {
  if (typeof window === 'undefined') return 'allowed';
  const count = getGuestGenerationCount();
  if (count >= 2) return 'limited';
  window.localStorage.setItem(GUEST_GENERATION_KEY, String(count + 1));
  return 'allowed';
}

export function requestGuestAuth(action: GuestAction): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<GuestAction>('scripto:guest-auth', { detail: action }));
}

export function reserveGuestGeneration(isSignedIn: boolean): boolean {
  if (isSignedIn) return true;
  if (!isGuestMode()) return true;
  if (consumeGuestGeneration() === 'limited') {
    requestGuestAuth('generation');
    return false;
  }
  return true;
}
