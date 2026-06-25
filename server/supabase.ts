import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Disable Realtime WebSocket — this server only uses REST + Auth APIs.
// On Node < 22, @supabase/realtime-js throws if no native WebSocket exists.
class NoopWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 3;
  constructor() {}
  close() {}
  send() {}
  addEventListener() {}
  removeEventListener() {}
}

// Admin client — uses service_role key, bypasses RLS, server-side only
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: NoopWebSocket as any },
});

export async function verifyToken(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
