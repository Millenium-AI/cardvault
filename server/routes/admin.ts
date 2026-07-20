import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAdmin } from "./helpers";
import { syncSetsForGame } from "../justtcg";

export function registerAdminRoutes(app: Express) {
  // Manually refresh the cached JustTCG set list for one game (the Search
  // "Set" filter reads from this cache). Run once per game after deploy, and
  // re-run whenever new sets are released.
  app.post("/api/admin/sync-sets", requireAdmin, async (req: any, res) => {
    const game = (req.query.game ?? req.body?.game) as string | undefined;
    if (!game) return res.status(400).json({ error: "game is required" });
    try {
      await syncSetsForGame(game);
      res.json({ ok: true, game });
    } catch (err: any) {
      console.error("[admin/sync-sets]", err);
      res.status(500).json({ error: err.message ?? "Failed to sync sets" });
    }
  });

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
