import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client — full access, server-side only
// Realtime WebSocket is disabled: this server only uses REST + Auth APIs.
// On Node < 22, @supabase/realtime-js throws if no native WebSocket exists.
// Providing a no-op class prevents the crash without affecting any functionality.
class NoopWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 3;
  constructor() {}
  close() {}
  send() {}
  addEventListener() {}
  removeEventListener() {}
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: NoopWebSocket as any },
});

// Bootstrap invite_codes table if it doesn't exist
export async function bootstrapInviteCodes() {
  const { error } = await supabaseAdmin.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS invite_codes (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        code text UNIQUE NOT NULL,
        used boolean DEFAULT false,
        used_by uuid REFERENCES auth.users(id),
        used_at timestamptz,
        created_at timestamptz DEFAULT now(),
        note text
      );
    `,
  });
  // rpc may not exist — use raw query fallback via REST
  if (error) {
    // Table might already exist or rpc not available — handled gracefully
    console.log("[supabase] invite_codes bootstrap note:", error.message);
  }
}

export async function verifyToken(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
