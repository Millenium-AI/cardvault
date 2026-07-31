import type { Express } from "express";
import { searchCards, syncSetsForGame, type SearchResultCard } from "../justtcg";
import { pokeWalletSearchCards, berryWalletSearchCards } from "../pokewallet";
import { storage } from "../storage";
import { parseProductName } from "../../shared/lib/parseProductName";
import { supabaseAdmin } from "../supabase";

const searchCache = new Map<string, { data: SearchResultCard[]; expiresAt: number }>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(query: string, game: string | null, set: string | null): string {
  return `${query.trim().toLowerCase()}|${game ?? "all"}|${set ?? "any"}`;
}

// How old a justtcg_sets cache entry can be before auto-resyncing (7 days)
const SETS_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function registerSearchRoutes(app: Express) {

  // Search cards across all games via JustTCG, with PokéWallet/BerryWallet fallback
  app.get("/api/search/cards", async (req: any, res) => {
    try {
      const { q, game, set, limit } = req.query as Record<string, string>;
      const query = (q ?? "").trim();
      if (!query) return res.status(400).json({ error: "q (search query) is required" });

      const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 20, 20) : 20;
      const gameFilter = game && game !== "all" ? game : null;
      const setFilter = set?.trim() || null;
      const key = cacheKey(query, gameFilter, setFilter);

      const cached = searchCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json({ results: cached.data, source: "cache" });
      }

      let results: SearchResultCard[] = [];
      let source: "justtcg" | "pokewallet-fallback" = "justtcg";
      let justTcgRateLimited = false;

      try {
        results = await searchCards({ query, game: gameFilter, set: setFilter, limit: parsedLimit });
      } catch (err: any) {
        if (err?.status === 429) {
          justTcgRateLimited = true;
          console.warn("[search] JustTCG 429 — trying fallback");
        } else {
          throw err;
        }
      }

      const shouldFallback =
        (justTcgRateLimited || results.length === 0) &&
        (gameFilter === "pokemon" || gameFilter === "one-piece");

      if (shouldFallback) {
        source = "pokewallet-fallback";
        const fallbackResults = gameFilter === "pokemon"
          ? await pokeWalletSearchCards(query, parsedLimit, setFilter)
          : await berryWalletSearchCards(query, parsedLimit, setFilter);
        if (fallbackResults.length) results = fallbackResults;
      }

      searchCache.set(key, { data: results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
      res.json({ results, source });
    } catch (e: any) {
      console.error("[search/cards]", e);
      res.status(500).json({ error: e.message ?? "Search failed" });
    }
  });

  // Set filter options — reads from justtcg_sets cache.
  // Auto-syncs from JustTCG if cache is empty or stale (>7 days).
  app.get("/api/search/sets", async (req: any, res) => {
    try {
      const { game } = req.query as Record<string, string>;
      if (!game || game === "all") return res.json({ sets: [] });

      const { data, error } = await supabaseAdmin
        .from("justtcg_sets")
        .select("set_id, set_name, fetched_at")
        .eq("game", game)
        .order("set_name", { ascending: true });

      if (error) throw new Error(error.message);

      const isStale =
        !data?.length ||
        (data[0]?.fetched_at &&
          Date.now() - new Date(data[0].fetched_at).getTime() > SETS_STALE_MS);

      if (isStale) {
        try {
          await syncSetsForGame(game);
          const { data: fresh, error: freshError } = await supabaseAdmin
            .from("justtcg_sets")
            .select("set_id, set_name")
            .eq("game", game)
            .order("set_name", { ascending: true });
          if (freshError) throw new Error(freshError.message);
          return res.json({ sets: fresh ?? [] });
        } catch (syncErr: any) {
          console.warn(`[search/sets] auto-sync failed for "${game}":`, syncErr.message);
          // Return whatever we have rather than erroring
          return res.json({ sets: data?.map(({ set_id, set_name }) => ({ set_id, set_name })) ?? [] });
        }
      }

      res.json({ sets: data.map(({ set_id, set_name }) => ({ set_id, set_name })) });
    } catch (e: any) {
      console.error("[search/sets]", e);
      res.status(500).json({ error: e.message ?? "Failed to load sets" });
    }
  });

  // Add a search result card directly to inventory.
  // Dedupes by sourceProductId then normalizedMatchKey — bumps qty if exists.
  app.post("/api/inventory/from-search", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const {
        card,
        variantIndex = 0,
        game,
        quantity = 1,
        condition = "Near Mint",
        notes,
      } = req.body as {
        card: SearchResultCard;
        variantIndex?: number;
        game: string;
        quantity?: number;
        condition?: string;
        notes?: string;
      };

      if (!card?.name) return res.status(400).json({ error: "card is required" });
      if (!game) return res.status(400).json({ error: "game is required" });

      const qty = Math.max(1, parseInt(String(quantity), 10) || 1);
      const variant = card.variants?.[variantIndex] ?? card.variants?.[0] ?? null;
      const { cleanName, displaySuffix } = parseProductName(card.name, game, card.number ?? undefined);

      const normalizedMatchKey = [
        game.toLowerCase(),
        cleanName.trim().toLowerCase().replace(/\s+/g, " "),
        (card.number ?? "").trim(),
        condition.toLowerCase(),
        (variant?.printing ?? "").toLowerCase(),
        (card.setName ?? "").trim().toLowerCase(),
      ].join("|");

      const existing =
        (card.tcgplayerId && await storage.getInventoryItemByExternalIds(userId, card.tcgplayerId)) ||
        (await storage.getInventoryItemByMatchKey(userId, normalizedMatchKey)) ||
        undefined;

      if (existing) {
        const updated = await storage.updateInventoryItem(userId, existing.id, {
          currentQuantity: (existing.currentQuantity || 0) + qty,
        });
        return res.json({ item: updated, created: false });
      }

      const now = new Date().toISOString();
      const matchMetadataJson = JSON.stringify({
        sourceProductId:      card.tcgplayerId         ?? null,
        sourceTcgplayerSkuId: variant?.tcgplayerSkuId  ?? null,
        sourceSetName:        card.setName             ?? null,
        sourcePrinting:       variant?.printing        ?? null,
        sourceRarity:         card.rarity              ?? null,
        cleanName,
        displaySuffix: displaySuffix ?? null,
      });

      const created = await storage.createInventoryItem(userId, {
        game,
        productName:              card.name,
        number:                   card.number                                        ?? null,
        condition,
        currentQuantity:          qty,
        currentRawMarketPrice:    variant?.price                                     ?? null,
        currentRoundedPrintPrice: variant?.price != null ? Math.ceil(variant.price) : null,
        priceSource:              variant?.price != null ? "justtcg" : "pending",
        latestUploadId:           null,
        normalizedMatchKey,
        matchMetadataJson,
        sourceProductId:          card.tcgplayerId       ?? null,
        sourceTcgplayerId:        card.tcgplayerId       ?? null,
        sourceTcgplayerSkuId:     variant?.tcgplayerSkuId ?? null,
        photoUrl:                 card.imageUrl           ?? null,
        firstSeenAt:              now,
        lastSeenAt:               now,
        status:                   "active",
        notes:                    notes                  ?? null,
        justtcgCardUuid:          card.cardUuid          ?? null,
        justtcgVariantUuid:       variant?.variantUuid   ?? null,
      });

      res.json({ item: created, created: true });
    } catch (e: any) {
      console.error("[inventory/from-search]", e);
      res.status(500).json({ error: e.message ?? "Failed to add item" });
    }
  });
}