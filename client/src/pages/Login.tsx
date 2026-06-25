import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight } from "lucide-react";
import { SiGoogle } from "react-icons/si";

const API_BASE = ("__PORT_5000__" as string).startsWith("__") ? "" : "__PORT_5000__";
const ADMIN_EMAIL = "bonsaicollects@gmail.com";

type Mode = "login" | "signup";
// Signup has two steps: enter invite code first, then credentials
type SignupStep = "invite" | "credentials";

export default function Login() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [signupStep, setSignupStep] = useState<SignupStep>("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteValidating, setInviteValidating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // After Google OAuth redirect — check if user is brand new (not pre-existing)
  // If new and not admin, boot them out immediately
  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const user = session.user;
        const isAdmin = user.email === ADMIN_EMAIL;

        if (!isAdmin) {
          // Detect new account: created_at and last_sign_in_at are equal (within 10s)
          const createdAt = new Date(user.created_at).getTime();
          const lastSignIn = new Date(user.last_sign_in_at ?? user.created_at).getTime();
          const isNewAccount = Math.abs(createdAt - lastSignIn) < 10000;

          if (isNewAccount && user.app_metadata?.provider === "google") {
            // New Google user with no invite — delete and reject
            await supabase.auth.signOut();
            toast({
              title: "Access denied",
              description: "You need an invite code to create an account. Contact the app owner.",
              variant: "destructive",
            });
          }
        }
      }
    });
  }, []);

  // Reset signup step when switching modes
  function switchMode(m: Mode) {
    setMode(m);
    setSignupStep("invite");
    setInviteCode("");
    setEmail("");
    setPassword("");
  }

  // Step 1: validate invite code before showing signup form
  async function handleValidateInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteValidating(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/validate-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Invalid invite code", description: err.error, variant: "destructive" });
        return;
      }
      // Code valid — proceed to credentials step
      setSignupStep("credentials");
    } catch {
      toast({ title: "Error", description: "Could not validate invite code.", variant: "destructive" });
    } finally {
      setInviteValidating(false);
    }
  }

  // Step 2: create account with email+password
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      if (data.user) {
        await fetch(`${API_BASE}/api/auth/use-invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: inviteCode, userId: data.user.id }),
        });
      }
      toast({ title: "Account created", description: "Welcome to CardVault!" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // Sign in with email+password
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // Google login — only for existing users (admin always allowed)
  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setGoogleLoading(false);
    }
  }

  // Google signup — validate invite code first, store in sessionStorage for post-redirect
  async function handleGoogleSignup() {
    setGoogleLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/validate-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Invalid invite code", description: err.error, variant: "destructive" });
        setGoogleLoading(false);
        return;
      }
      sessionStorage.setItem("pendingInviteCode", inviteCode.trim().toUpperCase());
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-2">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-primary" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="12" height="16" rx="2" />
              <path d="M7 8h4M7 11h4M7 14h2" strokeLinecap="round" />
              <path d="M17 8l2 2-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">CardVault</h1>
          <p className="text-xs text-muted-foreground">Trading card inventory management</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-border p-1 bg-muted/30">
          <button
            onClick={() => switchMode("login")}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sign In
          </button>
          <button
            onClick={() => switchMode("signup")}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sign Up
          </button>
        </div>

        {/* ── SIGN IN ── */}
        {mode === "login" && (
          <div className="space-y-4">
            {/* Google sign in */}
            <Button
              variant="outline"
              className="w-full h-10 gap-2.5 text-sm"
              onClick={handleGoogle}
              disabled={googleLoading || loading}
            >
              {googleLoading ? <Loader2 size={15} className="animate-spin" /> : <SiGoogle size={15} />}
              Continue with Google
            </Button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                <Input
                  id="email"
                  data-testid="input-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-9 text-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                <Input
                  id="password"
                  data-testid="input-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-9 text-sm"
                  required
                  minLength={6}
                />
              </div>
              <Button
                data-testid="button-auth-submit"
                type="submit"
                className="w-full h-10 text-sm font-medium mt-1"
                disabled={loading || googleLoading}
              >
                {loading ? <Loader2 size={15} className="animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
          </div>
        )}

        {/* ── SIGN UP — Step 1: Invite code ── */}
        {mode === "signup" && signupStep === "invite" && (
          <form onSubmit={handleValidateInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite" className="text-xs font-medium">Invite Code</Label>
              <p className="text-[11px] text-muted-foreground">You need an invite code to create an account.</p>
              <Input
                id="invite"
                data-testid="input-invite-code"
                placeholder="XXXXXXXX"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                className="h-9 text-sm font-mono tracking-widest uppercase"
                required
                maxLength={8}
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="w-full h-10 text-sm font-medium gap-2"
              disabled={inviteValidating || inviteCode.length < 6}
            >
              {inviteValidating
                ? <Loader2 size={15} className="animate-spin" />
                : <ArrowRight size={15} />}
              {inviteValidating ? "Validating…" : "Continue"}
            </Button>
          </form>
        )}

        {/* ── SIGN UP — Step 2: Credentials ── */}
        {mode === "signup" && signupStep === "credentials" && (
          <div className="space-y-4">
            {/* Invite code confirmed badge */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              Invite code accepted — <span className="font-mono">{inviteCode}</span>
            </div>

            {/* Google signup option */}
            <Button
              variant="outline"
              className="w-full h-10 gap-2.5 text-sm"
              onClick={handleGoogleSignup}
              disabled={googleLoading || loading}
            >
              {googleLoading ? <Loader2 size={15} className="animate-spin" /> : <SiGoogle size={15} />}
              Sign up with Google
            </Button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleSignup} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="su-email" className="text-xs font-medium">Email</Label>
                <Input
                  id="su-email"
                  data-testid="input-signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-9 text-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-password" className="text-xs font-medium">Password</Label>
                <Input
                  id="su-password"
                  data-testid="input-signup-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-9 text-sm"
                  required
                  minLength={6}
                />
              </div>
              <Button
                data-testid="button-signup-submit"
                type="submit"
                className="w-full h-10 text-sm font-medium mt-1"
                disabled={loading || googleLoading}
              >
                {loading ? <Loader2 size={15} className="animate-spin mr-2" /> : null}
                Create Account
              </Button>
            </form>

            <button
              onClick={() => setSignupStep("invite")}
              className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              ← Use a different invite code
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
