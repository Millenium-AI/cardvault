import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight, Eye, EyeOff } from "lucide-react";
import { SiGoogle } from "react-icons/si";

const API_BASE = ("__PORT_5000__" as string).startsWith("__") ? "" : "__PORT_5000__";

const OAUTH_REDIRECT_URL = typeof window !== "undefined"
  ? window.location.origin
  : "";

type Mode = "login" | "signup";
type SignupStep = "invite" | "credentials";

function PasswordInput({ id, value, onChange, placeholder, testId }: {
  id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; testId?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        data-testid={testId}
        type={show ? "text" : "password"}
        placeholder={placeholder ?? "••••••••"}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 text-sm pr-9"
        required
        minLength={6}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

export default function Login() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [signupStep, setSignupStep] = useState<SignupStep>("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteValidating, setInviteValidating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  function switchMode(m: Mode) {
    setMode(m);
    setSignupStep("invite");
    setInviteCode("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  }

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
      setSignupStep("credentials");
    } catch {
      toast({ title: "Error", description: "Could not validate invite code.", variant: "destructive" });
    } finally {
      setInviteValidating(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are identical.", variant: "destructive" });
      return;
    }
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

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: OAUTH_REDIRECT_URL },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setGoogleLoading(false);
    }
  }

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

      // Pass the invite code in the redirectTo URL so it survives the OAuth
      // full-page redirect. sessionStorage is wiped on redirect and cannot be used.
      const redirectUrl = new URL(window.location.origin);
      redirectUrl.searchParams.set("invite", inviteCode.trim().toUpperCase());

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl.toString() },
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

        <div className="flex rounded-lg border border-border p-1 bg-muted/30">
          <button
            onClick={() => switchMode("login")}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
              mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => switchMode("signup")}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
              mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign Up
          </button>
        </div>

        {mode === "login" && (
          <div className="space-y-4">
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
                <PasswordInput id="password" value={password} onChange={setPassword} testId="input-password" />
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
              {inviteValidating ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {inviteValidating ? "Validating…" : "Continue"}
            </Button>
          </form>
        )}

        {mode === "signup" && signupStep === "credentials" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              Invite code accepted — <span className="font-mono">{inviteCode}</span>
            </div>

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
                <PasswordInput id="su-password" value={password} onChange={setPassword} testId="input-signup-password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-confirm" className="text-xs font-medium">Confirm Password</Label>
                <PasswordInput id="su-confirm" value={confirmPassword} onChange={setConfirmPassword} />
                {passwordMismatch && (
                  <p className="text-[11px] text-destructive">Passwords don't match</p>
                )}
              </div>
              <Button
                data-testid="button-auth-submit"
                type="submit"
                className="w-full h-10 text-sm font-medium mt-1"
                disabled={loading || googleLoading || passwordMismatch}
              >
                {loading ? <Loader2 size={15} className="animate-spin mr-2" /> : null}
                Create Account
              </Button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
