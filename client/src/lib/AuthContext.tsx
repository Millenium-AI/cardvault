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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  // Track whether loading has already been resolved so we only call
  // setLoading(false) once — whichever path (getSession or onAuthStateChange)
  // wins the race.
  const loadingResolved = useRef(false);

  function resolveLoading() {
    if (!loadingResolved.current) {
      loadingResolved.current = true;
      setLoading(false);
    }
  }

  async function fetchAdminStatus(token: string) {
    // Timeout after 5s so a slow/down API never leaves loading=true forever
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
      // Network error, timeout, or abort — non-fatal, default to not admin
      setIsAdmin(false);
    } finally {
      clearTimeout(timeout);
    }
  }

  useEffect(() => {
    // ── 1. Eagerly read the existing session (covers page refreshes) ──────────
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.access_token) {
        fetchAdminStatus(session.access_token).finally(resolveLoading);
      } else {
        resolveLoading();
      }
    }).catch(() => {
      // If getSession itself fails, still unblock the UI
      resolveLoading();
    });

    // ── 2. Listen for auth state changes (covers OAuth callbacks, sign-out) ───
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.access_token) {
        // Fire-and-forget admin check — resolveLoading unblocks the UI
        // immediately and the isAdmin flag updates when the fetch returns.
        fetchAdminStatus(session.access_token);

        // After a Google OAuth signup via invite, redeem the invite code that
        // was passed as ?invite= in the redirectTo URL. sessionStorage does not
        // survive the full-page OAuth redirect, so the URL param is used instead.
        if (_event === "SIGNED_IN" && session.user.app_metadata?.provider === "google") {
          const params = new URLSearchParams(window.location.search);
          const pendingCode = params.get("invite");
          if (pendingCode) {
            // Strip the param immediately so it doesn't re-fire on refresh
            const cleanUrl = window.location.origin + window.location.hash;
            window.history.replaceState({}, "", cleanUrl);

            try {
              // MUST include the Bearer token — /api/auth/use-invite requires
              // an authenticated user and validates userId === token.sub.
              await fetch("/api/auth/use-invite", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ code: pendingCode, userId: session.user.id }),
              });
            } catch {
              // Non-fatal — user is still signed in
            }
          }
        }
      } else {
        setIsAdmin(false);
      }

      // ── KEY FIX: always unblock the UI after the first auth event ──────────
      // This handles the race where onAuthStateChange fires before getSession()
      // resolves (common on Railway / cold-start environments). Without this,
      // loading stays true forever and no pages render.
      resolveLoading();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
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
