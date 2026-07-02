import type { Express } from "express";
import { storage, type InventoryItem } from "../storage";
import { supabaseAdmin } from "../supabase";
import { batchFetchPrices, fetchSinglePrice } from "../justtcg";
import { checkRepricingThreshold } from "./csvHelpers";

export function registerPricesRoutes(app: Express) {
  app.post("/api/prices/refresh", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { ids } = req.body as { ids?: string[] };

      const allItems = await storage.listInventoryItems(userId);

      const toRefresh = ids
        ? allItems.filter(i => ids.includes(i.id) && i.sourceTcgplayerId)
        : allItems.filter(i => {
            if (!i.sourceTcgplayerId) return false;
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
          chunk.map(item => ({
            id: item.id,
            tcgplayerId: item.sourceTcgplayerId!,
            condition: item.condition ?? "Near Mint",
            printing: (() => {
              try { return JSON.parse(item.matchMetadataJson || "{}").sourcePrinting ?? null; }
              catch { return null; }
            })(),
          }))
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
            console.error(
              `[prices/refresh] Failed to update price for item ${item.id}:`,
              updateErr.message
            );
          }

          await storage.createWeeklySnapshotIfStale(
            userId,
            item.id,
            latestSnapshots.get(item.id),
            {
              rawMarketPrice: priceResult.price,
              roundedPrintPrice: Math.ceil(priceResult.price),
              quantityAfterMerge: item.currentQuantity ?? 0,
            },
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
