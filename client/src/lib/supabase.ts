import { createClient } from "@supabase/supabase-js";

// VITE_ vars are set via .env files locally but Railway needs them as build vars.
// Anon key is safe to hardcode — it's a public key, not a secret.
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
    detectSessionInUrl: true,
    // Use sessionStorage — persists across SPA navigation within the same tab,
    // cleared when the tab closes. Works on Railway (no iframe restrictions).
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
  },
});
