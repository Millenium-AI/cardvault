// client/src/lib/supabase.ts  (reusable)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Fail fast instead of using hardcoded fallbacks
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // detectSessionInUrl must be true so Supabase can parse the access_token
    // from the URL after OAuth redirect lands on the root (non-hash) URL.
    detectSessionInUrl: true,
    // localStorage persists the session across tab navigations and reloads.
    // This is safe on Railway (no iframe sandboxing).
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});