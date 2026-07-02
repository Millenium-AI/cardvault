import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAdmin } from "./helpers";

export function registerAdminRoutes(app: Express) {
  app.post("/api/admin/invite-codes", requireAdmin, async (req: any, res) => {
    const { count = 5, note = "" } = req.body;
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codes = Array.from({ length: Math.min(count, 50) }, () =>
      Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
    );
    const { data, error } = await supabaseAdmin.from("invite_codes").insert(codes.map(code => ({ code, note, used: false }))).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ codes: data });
  });

  app.get("/api/admin/invite-codes", requireAdmin, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from("invite_codes").select("*").order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      console.error('[route] error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  });
}
