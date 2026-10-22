import { createClient } from "@supabase/supabase-js";

/** Cookie-less anonymous client for public, cacheable reads (sitemap). Row-level security still applies. */
export function publicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
