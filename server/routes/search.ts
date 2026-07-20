/**
 * Search section — GET /api/search/cards
 *
 * Lets a user look up any card by name (optionally scoped to a game) and
 * get back expanded-detail-ready results, independent of their inventory.
 *
 * Source priority:
 *   1. JustTCG GET /v1/cards?q=&game=&limit= — covers all games we support.
 *   2. If JustTCG is rate-limited (429) or returns zero results AND the
 *      query is scoped to Pokémon or One Piece, fall back to PokéWallet /
 *      BerryWallet search so the user still gets results.
 *
 * Results are normalised to SearchResultCard (see server/justtcg.ts) so the
 * client always deals with one shape regardless of which source answered.
 */
import type { Express } from "express";
import { searchCards, type SearchResultCard } from "../justtcg";
import { pokeWalletSearchCards, berryWalletSearchCards } from "../pokewallet";
import { storage } from "../storage";
import { parseProductName } from "../lib/parseProductName";

// Very small in-memory cache to avoid burning API quota on repeated
// identical searches (e.g. user re-opening the same result, or typing
// then deleting a character and retyping the same query).
const searchCache = new Map<string, { data: SearchResultCard[]; expiresAt: number }>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(query: string, game: string | null): string {
  return `${query.trim().toLowerCase()}|${game ?? "all"}`;
}

export function registerSearchRoutes(app: Express) {
  app.get("/api/search/cards", async (req: any, res) => {
    try {
      const { q, game, limit } = req.query as Record<string, string>;
      const query = (q ?? "").trim();

      if (!query) {
        return res.status(400).json({ error: "q (search query) is required" });
      }

      const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 20, 20) : 20;
      const gameFilter = game && game !== "all" ? game : null;
      const key = cacheKey(query, gameFilter);

      const cached = searchCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json({ results: cached.data, source: "cache" });
      }

      let results: SearchResultCard[] = [];
      let source: "justtcg" | "pokewallet-fallback" = "justtcg";
      let justTcgRateLimited = false;

      try {
        results = await searchCards({ query, game: gameFilter, limit: parsedLimit });
      } catch (err: any) {
        if (err?.status === 429) {
          justTcgRateLimited = true;
          console.warn("[search] JustTCG 429 — trying PokéWallet/BerryWallet fallback");
        } else {
          throw err;
        }
      }

      // Fallback only makes sense when the query is scoped (or scopable)
      // to a game PokéWallet/BerryWallet actually cover.
      const shouldFallback =
        (justTcgRateLimited || results.length === 0) &&
        (gameFilter === "pokemon" || gameFilter === "one-piece");

      if (shouldFallback) {
        source = "pokewallet-fallback";
        const fallbackResults = gameFilter === "pokemon"
          ? await pokeWalletSearchCards(query, parsedLimit)
          : await berryWalletSearchCards(query, parsedLimit);
        if (fallbackResults.length) results = fallbackResults;
      }

      searchCache.set(key, { data: results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
      res.json({ results, source });
    } catch (e: any) {
      console.error("[search/cards]", e);
      res.status(500).json({ error: e.message ?? "Search failed" });
    }
  });

// ── Register search routes ───────────────────────────────────────────────────
// Register the search routes with the Express app
function cacheKey(query: string, game: string | null, set: string | null): string {
  return `${query.trim().toLowerCase()}|${game ?? "all"}|${set ?? "any"}`;
}

export function registerSearchRoutes(app: Express) {
  app.get("/api/search/cards", async (req: any, res) => {
    try {
      const { q, game, set, limit } = req.query as Record<string, string>;
      const query = (q ?? "").trim();

      if (!query) {
        return res.status(400).json({ error: "q (search query) is required" });
      }

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
          console.warn("[search] JustTCG 429 — trying PokéWallet/BerryWallet fallback");
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

  // ── POST /api/inventory/from-search — add a search result to inventory ────
  // Body: { card: SearchResultCard, variantIndex: number, game: string,
  //         quantity: number, condition?: string, notes?: string }
  //
  // Reuses the same dedupe logic as the CSV upload merge flow (match by
  // sourceProductId, then by normalizedMatchKey): if an active item already
  // exists for this exact card+condition+printing, its quantity is bumped
  // instead of creating a duplicate row.
  //
  // Price/variant data comes straight from the search result the user already
  // saw — no extra live API call, so this action never burns API quota.
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

      // Dedupe against existing active inventory, same convention as the
      // CSV upload merge flow (server/routes/uploads.ts).
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
        sourceProductId:      card.tcgplayerId ?? null,
        sourceTcgplayerSkuId: variant?.tcgplayerSkuId ?? null,
        sourceSetName:        card.setName ?? null,
        sourcePrinting:       variant?.printing ?? null,
        sourceRarity:         card.rarity ?? null,
        cleanName,
        displaySuffix: displaySuffix ?? null,
      });

      const created = await storage.createInventoryItem(userId, {
        game,
        productName: card.name,
        number: card.number ?? null,
        condition,
        currentQuantity: qty,
        currentRawMarketPrice: variant?.price ?? null,
        currentRoundedPrintPrice: variant?.price != null ? Math.ceil(variant.price) : null,
        priceSource: variant?.price != null ? "justtcg" : "pending",
        csvMarketPrice: null,
        latestUploadId: null,
        normalizedMatchKey,
        matchMetadataJson,
        sourceProductId: card.tcgplayerId ?? null,
        sourceTcgplayerId: card.tcgplayerId ?? null,
        sourceTcgplayerSkuId: variant?.tcgplayerSkuId ?? null,
        photoUrl: card.imageUrl ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
        status: "active",
        notes: notes ?? null,
        justtcgCardUuid: card.cardUuid ?? null,
        justtcgVariantUuid: variant?.variantUuid ?? null,
        priceChange24hr: variant?.priceChange24hr ?? null,
        priceChange7d: variant?.priceChange7d ?? null,
      });

      res.json({ item: created, created: true });
    } catch (e: any) {
      console.error("[inventory/from-search]", e);
      res.status(500).json({ error: e.message ?? "Failed to add item" });
    }
  });
}

