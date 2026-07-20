import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAdmin } from "./helpers";
import { syncSetsForGame, toJustTcgGame } from "../justtcg";

export function registerAdminRoutes(app: Express) {
  // ── POST /api/admin/sync-sets ─────────────────────────────────────────────
  // Manually refresh the cached JustTCG set list for one game (the Search
  // "Set" filter reads from this cache). Run once per game after deploy, and
  // re-run whenever new sets are released.
  //
  // Accepts game as either a query param or JSON body field:
  //   POST /api/admin/sync-sets?game=pokemon
  //   POST /api/admin/sync-sets  { "game": "pokemon" }
  //
  // Valid internal game slugs: pokemon, pokemon-jp, one-piece, sorcery,
  // dragon-ball, mtg, star-wars, lorcana, yugioh, digimon
  app.post("/api/admin/sync-sets", requireAdmin, async (req: any, res) => {
    const game = (req.query.game ?? req.body?.game) as string | undefined;
    if (!game) {
      return res.status(400).json({ error: "game is required" });
    }

    // Validate the game slug has a known JustTCG mapping before hitting the API
    const justTcgGame = toJustTcgGame(game);
    if (!justTcgGame) {
      return res.status(400).json({
        error: `Unknown game slug "${game}". Valid values: pokemon, pokemon-jp, one-piece, sorcery, dragon-ball, mtg, star-wars, lorcana, yugioh, digimon`,
      });
    }

    try {
      await syncSetsForGame(game);
      res.json({ ok: true, game, justTcgGame });
    } catch (err: any) {
      console.error("[admin/sync-sets]", err);
      res.status(500).json({ error: err.message ?? "Failed to sync sets" });
    }
  });

  // ── POST /api/admin/sync-sets/all ─────────────────────────────────────────
  // Convenience endpoint — syncs all known games in sequence.
  // Errors on individual games are logged but do not abort the rest.
  app.post("/api/admin/sync-sets/all", requireAdmin, async (_req, res) => {
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
        console.error(`[admin/sync-sets/all] failed for "${game}":`, err.message);
        results[game] = { ok: false, error: err.message };
      }
    }

    const failed = Object.entries(results).filter(([, v]) => !v.ok);
    res.status(failed.length ? 207 : 200).json({ results });
  });

  // ── POST /api/admin/invite-codes ──────────────────────────────────────────
  // Generate N invite codes and insert into invite_codes table.
  // Body: { count?: number (max 50, default 5), note?: string }
  app.post("/api/admin/invite-codes", requireAdmin, async (req: any, res) => {
    const { count = 5, note = "" } = req.body;
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codes = Array.from({ length: Math.min(count, 50) }, () =>
      Array.from({ length: 8 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join("")
    );

    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .insert(codes.map(code => ({ code, note, used: false })))
      .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ codes: data });
  });

  // ── GET /api/admin/invite-codes ───────────────────────────────────────────
  // List all invite codes, most recent first.
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