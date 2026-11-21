import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let serverClient: SupabaseClient | null | undefined;

export function getSupabaseServerClient(): SupabaseClient | null {
  if (serverClient !== undefined) return serverClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    serverClient = null;
    return serverClient;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    serverClient = null;
    return serverClient;
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    serverClient = null;
    return serverClient;
  }

  serverClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return serverClient;
}
