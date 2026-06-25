import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: {
      // Custom storage using memory — avoids localStorage (blocked in iframe)
      _data: {} as Record<string, string>,
      getItem(key: string) { return this._data[key] ?? null; },
      setItem(key: string, value: string) { this._data[key] = value; },
      removeItem(key: string) { delete this._data[key]; },
    },
  },
});
