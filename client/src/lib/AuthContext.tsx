import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

// ── Dev bypass ────────────────────────────────────────────────────────────────
// Set VITE_DEV_BYPASS=true in your .env to skip Google/Supabase auth locally.
// Never set this in production.
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS === "true";

const DEV_FAKE_SESSION = DEV_BYPASS
  ? ({
      access_token: "dev-bypass-token",
      token_type: "bearer",
      expires_in: 9999999,
      expires_at: 9999999999,
      refresh_token: "dev-bypass-refresh",
      user: {
        id: import.meta.env.VITE_DEV_BYPASS_USER_ID || "dev-user-id",
        email: import.meta.env.VITE_DEV_BYPASS_EMAIL || "dev@local.test",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
      },
    } as unknown as Session)
  : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEV_BYPASS ? DEV_FAKE_SESSION!.user : null);
  const [session, setSession] = useState<Session | null>(DEV_BYPASS ? DEV_FAKE_SESSION : null);
  const [isAdmin, setIsAdmin] = useState(import.meta.env.VITE_DEV_BYPASS_IS_ADMIN === "true");
  const [loading, setLoading] = useState(!DEV_BYPASS);
  const loadingResolved = useRef(DEV_BYPASS);

  function resolveLoading() {
    if (!loadingResolved.current) {
      loadingResolved.current = true;
      setLoading(false);
    }
  }

  async function fetchAdminStatus(token: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(Boolean(data.isAdmin));
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    } finally {
      clearTimeout(timeout);
    }
  }

  useEffect(() => {
    // Skip Supabase entirely in dev bypass mode
    if (DEV_BYPASS) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.access_token) {
        fetchAdminStatus(session.access_token).finally(resolveLoading);
      } else {
        resolveLoading();
      }
    }).catch(() => {
      resolveLoading();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.access_token) {
        fetchAdminStatus(session.access_token);

        if (_event === "SIGNED_IN" && session.user.app_metadata?.provider === "google") {
          const params = new URLSearchParams(window.location.search);
          const pendingCode = params.get("invite");
          if (pendingCode) {
            const cleanUrl = window.location.origin + window.location.hash;
            window.history.replaceState({}, "", cleanUrl);

            try {
              await fetch("/api/auth/use-invite", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ code: pendingCode, userId: session.user.id }),
              });
            } catch {
              // Non-fatal
            }
          }
        }
      } else {
        setIsAdmin(false);
      }

      resolveLoading();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    if (!DEV_BYPASS) await supabase.auth.signOut();
    setIsAdmin(false);
  }

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
