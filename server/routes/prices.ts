import type { Express } from "express";
import { storage } from "../storage";
import { supabaseAdmin } from "../supabase";
import { batchFetchPrices, fetchSinglePrice } from "../justtcg";
import { checkRepricingThreshold } from "./csvHelpers";

const BASE_URL = "https://api.justtcg.com/v1";

function apiKey(): string {
  const key = process.env.JUSTTCG_API_KEY;
  if (!key) throw new Error("JUSTTCG_API_KEY env var is not set");
  return key;
}

// In-memory cache: variantUuid|window -> { data, expiresAt }
const historyCache = new Map<string, { data: any; expiresAt: number }>();
const HISTORY_TTL_MS = 30 * 60 * 1000; // 30 minutes

const VALID_WINDOWS = ["7d", "30d", "90d", "180d", "1y"] as const;
type HistoryWindow = typeof VALID_WINDOWS[number];

export function registerPricesRoutes(app: Express) {
  // ── GET /api/inventory/:id/price-history?window=7d ───────────────────────
  // Called lazily — only when the user opens expanded view and clicks a window.
  // Uses variantId (fastest path) for JustTCG lookup.
  // Returns: { history: [{t, p}], stats: {7d,30d,90d,allTime}, current: number }
  app.get("/api/inventory/:id/price-history", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const window = (req.query.window as string) || "7d";

      if (!VALID_WINDOWS.includes(window as HistoryWindow)) {
        return res.status(400).json({ error: `Invalid window. Must be one of: ${VALID_WINDOWS.join(", ")}` });
      }

      // Load item — verify ownership and get variant UUID
      const { data: item, error: itemErr } = await supabaseAdmin
        .from("inventory_items")
        .select("id, justtcg_variant_uuid, source_product_id, source_tcgplayer_sku_id, condition, match_metadata_json, current_raw_market_price")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (itemErr || !item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const variantUuid: string | null = item.justtcg_variant_uuid;

      if (!variantUuid && !item.source_product_id) {
        return res.status(422).json({ error: "Item has no JustTCG identifier — price history unavailable" });
      }

      // Check in-memory cache
      const cacheKey = `${variantUuid ?? item.source_product_id}|${window}`;
      const cached = historyCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }

      // Build GET request to JustTCG
      const params = new URLSearchParams({
        include_price_history: "true",
        priceHistoryDuration: window,
        include_statistics: "7d,30d,90d,allTime",
      });

      if (variantUuid) {
        params.set("variantId", variantUuid);
      } else if (item.source_tcgplayer_sku_id) {
        params.set("tcgplayerSkuId", item.source_tcgplayer_sku_id);
      } else {
        params.set("tcgplayerId", item.source_product_id);
        // Also apply condition filter when looking up by productId
        const metadata = (() => { try { return JSON.parse(item.match_metadata_json || "{}"); } catch { return {}; } })();
        const condition = item.condition ?? "Near Mint";
        params.set("condition", condition);
        if (metadata.sourcePrinting) params.set("printing", metadata.sourcePrinting);
      }

      const jtRes = await fetch(`${BASE_URL}/cards?${params.toString()}`, {
        headers: { "x-api-key": apiKey() },
      });

      if (!jtRes.ok) {
        const text = await jtRes.text().catch(() => jtRes.statusText);
        console.error(`[price-history] JustTCG ${jtRes.status}: ${text}`);
        return res.status(502).json({ error: "JustTCG API error" });
      }

      const json = await jtRes.json();
      const card = json?.data?.[0];
      if (!card) return res.status(404).json({ error: "Card not found in JustTCG" });

      // Pick the right variant
      const variants: any[] = card.variants ?? [];
      let variant = variantUuid
        ? variants.find((v: any) => v.uuid === variantUuid)
        : variants[0];

      if (!variant) {
        // Fallback: match by condition
        const metadata = (() => { try { return JSON.parse(item.match_metadata_json || "{}"); } catch { return {}; } })();
        variant = variants.find((v: any) => v.condition === (item.condition ?? "Near Mint") && v.printing === (metadata.sourcePrinting ?? "Normal"))
          ?? variants.find((v: any) => v.condition === (item.condition ?? "Near Mint"))
          ?? variants[0];
      }

      if (!variant) return res.status(404).json({ error: "No matching variant found" });

      const responseData = {
        cardName:  card.name,
        cardGame:  card.game,
        setName:   card.set_name,
        condition: variant.condition,
        printing:  variant.printing,
        current:   variant.price ?? null,
        priceChange24hr: variant.priceChange24hr ?? null,
        priceChange7d:   variant.priceChange7d   ?? null,
        lastUpdated:     variant.lastUpdated      ?? null,
        history:   (variant.priceHistory ?? []).map((pt: any) => ({ t: pt.t, p: pt.p })),
        stats:     variant.statistics ?? null,
        variantUuid: variant.uuid ?? null,
      };

      // Store variant UUID on item if we didn't have it
      if (!variantUuid && variant.uuid) {
        await supabaseAdmin
          .from("inventory_items")
          .update({ justtcg_variant_uuid: variant.uuid })
          .eq("id", id)
          .eq("user_id", userId);
      }

      historyCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + HISTORY_TTL_MS });
      res.json(responseData);
    } catch (e: any) {
      console.error("[price-history]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/prices/refresh ─────────────────────────────────────────────
  app.post("/api/prices/refresh", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { ids } = req.body as { ids?: string[] };

      const allItems = await storage.listInventoryItems(userId);

      const toRefresh = ids
        ? allItems.filter(i => ids.includes(i.id) && i.sourceProductId)
        : allItems.filter(i => {
            if (!i.sourceProductId) return false;
            if (!i.priceLastFetchedAt) return true;
            const staleMs = Date.now() - new Date(i.priceLastFetchedAt).getTime();
            return staleMs > 6 * 60 * 60 * 1000;
          });

      if (!toRefresh.length) return res.json({ updated: 0, total: 0, message: "All prices are fresh" });

      const BATCH = 20;
      let updated = 0;

      for (let i = 0; i < toRefresh.length; i += BATCH) {
        const chunk = toRefresh.slice(i, i + BATCH);

        const priceMap = await batchFetchPrices(
          chunk.map(item => {
            const metadata = (() => {
              try { return JSON.parse(item.matchMetadataJson || "{}"); }
              catch { return {}; }
            })();
            return {
              id: item.id,
              tcgplayerId: item.sourceProductId!,
              tcgplayerSkuId: metadata.sourceTcgplayerSkuId ?? null,
              condition: item.condition ?? "Near Mint",
              printing: metadata.sourcePrinting ?? null,
            };
          })
        );

        const latestSnapshots = await storage.getLatestSnapshotsByItems(userId, chunk.map(i => i.id));
        const now = new Date();

        for (const item of chunk) {
          const priceResult = priceMap.get(item.id);
          if (!priceResult) continue;

          const { error: updateErr } = await supabaseAdmin
            .from("inventory_items")
            .update({
              current_raw_market_price:    priceResult.price,
              current_rounded_print_price: Math.ceil(priceResult.price),
              price_last_fetched_at:       now.toISOString(),
              price_change_24hr:           priceResult.priceChange24hr,
              price_change_7d:             priceResult.priceChange7d,
              justtcg_card_uuid:           priceResult.cardUuid,
              justtcg_variant_uuid:        priceResult.variantUuid,
            })
            .eq("id", item.id)
            .eq("user_id", userId);

          if (updateErr) {
            console.error(`[prices/refresh] Failed to update price for item ${item.id}:`, updateErr.message);
          }

          await storage.createWeeklySnapshotIfStale(
            userId, item.id, latestSnapshots.get(item.id),
            { rawMarketPrice: priceResult.price, roundedPrintPrice: Math.ceil(priceResult.price), quantityAfterMerge: item.currentQuantity ?? 0 },
            now,
          );

          updated++;
        }

        if (i + BATCH < toRefresh.length) {
          await new Promise(r => setTimeout(r, 6000));
        }
      }

      res.json({ updated, total: toRefresh.length });
    } catch (e: any) {
      console.error("[prices/refresh]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/prices/live ─────────────────────────────────────────────────
  app.get("/api/prices/live", async (req: any, res) => {
    try {
      const { tcgplayerId, condition, printing } = req.query as Record<string, string>;
      if (!tcgplayerId) return res.status(400).json({ error: "tcgplayerId is required" });
      const result = await fetchSinglePrice(tcgplayerId, condition ?? "Near Mint", printing ?? null);
      if (!result) return res.status(404).json({ error: "No price found for this card" });
      res.json(result);
    } catch (e: any) {
      console.error("[prices/live]", e);
      res.status(500).json({ error: e.message });
    }
  });
}
