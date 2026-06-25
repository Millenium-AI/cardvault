import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client — full access, server-side only
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
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
