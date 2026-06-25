import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { SiGoogle, SiApple } from "react-icons/si";

const API_BASE = ("__PORT_5000__" as string).startsWith("__") ? "" : "__PORT_5000__";

type Mode = "login" | "signup";

export default function Login() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        // Validate invite code first
        const res = await fetch(`${API_BASE}/api/auth/validate-invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: inviteCode }),
        });
        if (!res.ok) {
          const err = await res.json();
          toast({ title: "Invalid invite code", description: err.error, variant: "destructive" });
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // Mark invite code as used
        if (data.user) {
          await fetch(`${API_BASE}/api/auth/use-invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: inviteCode, userId: data.user.id }),
          });
        }
        toast({ title: "Account created", description: "Welcome to CardVault!" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setOauthLoading(provider);
    try {
      // For OAuth signup, we need the invite code pre-validated
      if (mode === "signup") {
        const res = await fetch(`${API_BASE}/api/auth/validate-invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: inviteCode }),
        });
        if (!res.ok) {
          const err = await res.json();
          toast({ title: "Invalid invite code", description: err.error, variant: "destructive" });
          setOauthLoading(null);
          return;
        }
        // Store code in memory for post-OAuth callback
        sessionStorage.setItem("pendingInviteCode", inviteCode.trim().toUpperCase());
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setOauthLoading(null);
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

        {/* Tab toggle */}
        <div className="flex rounded-lg border border-border p-1 bg-muted/30">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Sign Up
          </button>
        </div>

        {/* OAuth buttons */}
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full h-10 gap-2.5 text-sm"
            onClick={() => handleOAuth("google")}
            disabled={!!oauthLoading || loading}
          >
            {oauthLoading === "google" ? <Loader2 size={15} className="animate-spin" /> : <SiGoogle size={15} />}
            Continue with Google
          </Button>
          <Button
            variant="outline"
            className="w-full h-10 gap-2.5 text-sm"
            onClick={() => handleOAuth("apple")}
            disabled={!!oauthLoading || loading}
          >
            {oauthLoading === "apple" ? <Loader2 size={15} className="animate-spin" /> : <SiApple size={16} />}
            Continue with Apple
          </Button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="invite" className="text-xs font-medium">Invite Code</Label>
              <Input
                id="invite"
                data-testid="input-invite-code"
                placeholder="XXXXXXXX"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                className="h-9 text-sm font-mono tracking-widest uppercase"
                required
                maxLength={8}
              />
            </div>
          )}
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
            disabled={loading || !!oauthLoading}
          >
            {loading ? <Loader2 size={15} className="animate-spin mr-2" /> : null}
            {mode === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        {mode === "signup" && (
          <p className="text-[11px] text-center text-muted-foreground">
            Need an invite code? Contact the app owner.
          </p>
        )}
      </div>
    </div>
  );
}
