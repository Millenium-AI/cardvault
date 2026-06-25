import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://qivbhfznfroajwgaowsl.supabase.co";
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdmJoZnpuZnJvYWp3Z2Fvd3NsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNDg1MDYsImV4cCI6MjA5NzkyNDUwNn0.mY9fD2fCUj5O1oFYFMzb8KYEBFOEqQl8Bp8u2slvdZA";

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
