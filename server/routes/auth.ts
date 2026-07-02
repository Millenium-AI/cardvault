import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, useInviteRateLimited, ADMIN_EMAIL } from "./helpers";

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/validate-invite", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Code required" });
      const { data, error } = await supabaseAdmin
        .from("invite_codes")
        .select("*")
        .eq("code", code.trim().toUpperCase())
        .eq("used", false)
        .single();
      if (error || !data) return res.status(400).json({ error: "Invalid or already used invite code" });
      res.json({ valid: true });
    } catch (err: any) {
      console.error('[route] error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  });

  app.post("/api/auth/use-invite", async (req, res) => {
    try {
      const ip = ((req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown").split(",")[0].trim();
      if (useInviteRateLimited(ip)) return res.status(429).json({ error: "Too many requests. Please try again later." });

      const token = req.headers.authorization?.slice(7);
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      const { verifyToken } = await import("../supabase");
      const user = await verifyToken(token);
      if (!user) return res.status(401).json({ error: "Invalid or expired token" });

      const { code, userId } = req.body;
      if (!code || !userId) return res.status(400).json({ error: "Missing params" });
      if (userId !== user.id) return res.status(403).json({ error: "Forbidden — userId mismatch" });

      const { error } = await supabaseAdmin
        .from("invite_codes")
        .update({ used: true, used_by: userId, used_at: new Date().toISOString() })
        .eq("code", code.trim().toUpperCase())
        .eq("used", false);
      if (error) return res.status(400).json({ error: "Could not redeem code" });
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[route] error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const token = req.headers.authorization?.slice(7);
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      const { verifyToken } = await import("../supabase");
      const user = await verifyToken(token);
      if (!user) return res.status(401).json({ error: "Invalid token" });
      res.json({ id: user.id, email: user.email, isAdmin: Boolean(ADMIN_EMAIL && user.email === ADMIN_EMAIL) });
    } catch (err: any) {
      console.error('[route] error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  });
}
