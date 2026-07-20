import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAdmin } from "./helpers";
import { syncSetsForGame } from "../justtcg";

export function registerAdminRoutes(app: Express) {

  // Sync JustTCG set list for a single game — no auth required, public cache refresh
  app.post("/api/admin/sync-sets", async (req: any, res) => {
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

  // Sync all games at once
  app.post("/api/admin/sync-sets/all", async (_req, res) => {
    const games = [
      "pokemon", "pokemon-jp", "one-piece", "sorcery",
      "dragon-ball", "mtg", "star-wars", "lorcana", "yugioh", "digimon",
    ];
    const results: Record<string, { ok: boolean; error?: string }> = {};
    for (const game of games) {
      try {
        await syncSetsForGame(game);
        results[game] = { ok: true };
      } catch (err: any) {
        console.error(`[admin/sync-sets/all] "${game}":`, err.message);
        results[game] = { ok: false, error: err.message };
      }
    }
    const failed = Object.entries(results).filter(([, v]) => !v.ok);
    res.status(failed.length ? 207 : 200).json({ results });
  });

  // Generate invite codes
  app.post("/api/admin/invite-codes", requireAdmin, async (req: any, res) => {
    const { count = 5, note = "" } = req.body;
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codes = Array.from({ length: Math.min(count, 50) }, () =>
      Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
    );
    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .insert(codes.map(code => ({ code, note, used: false })))
      .select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ codes: data });
  });

  // List invite codes
  app.get("/api/admin/invite-codes", requireAdmin, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("invite_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      console.error("[admin/invite-codes]", err);
      res.status(500).json({ error: err.message ?? "Internal server error" });
    }
  });
}