import type { Express, Server } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage, type InventoryItem } from "../storage";
import { supabaseAdmin } from "../supabase";
import { batchFetchPrices } from "../justtcg";
import { parseCSV, mapCsvRow, checkRepricingThreshold } from "./csvHelpers";
import { pendingJobs, sendProgress } from "./helpers";

const csvFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ok =
    file.mimetype === "text/csv" ||
    file.mimetype === "application/vnd.ms-excel" ||
    file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.originalname.toLowerCase().endsWith(".csv") ||
    file.originalname.toLowerCase().endsWith(".xlsx");
  ok ? cb(null, true) : cb(new Error("Only CSV or XLSX files are accepted"));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: csvFilter,
});

function ceilPrice(price: number | null | undefined): number {
  return price && !isNaN(price) ? Math.ceil(price) : 0;
}

export async function refreshInventoryPrices(
  userId: string,
  itemIdsToPrice: string[],
  game: string,
) {
  try {
    let itemsToPrice: Array<InventoryItem & { isNew: boolean }> = [];

    if (!itemIdsToPrice.length) {
      console.log("[JustTCG] No items to price");
      return 0;
    }

    console.log(`[JustTCG] Loading ${itemIdsToPrice.length} items to price`);
    const { data: itemRows, error: fetchErr } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq("user_id", userId)
      .in("id", itemIdsToPrice);

    if (fetchErr) {
      console.error("[JustTCG] Failed to load items:", fetchErr.message);
      return 0;
    }

    console.log(`[JustTCG] Loaded ${itemRows?.length || 0} item rows`);
    if (itemRows && itemRows.length > 0) {
      console.log(`[JustTCG] Sample item: ${JSON.stringify(itemRows[0])}`);
    }

    const { toCamel } = await import("../storage");
    itemsToPrice = (itemRows || []).map(r => ({ ...toCamel<InventoryItem>(r), isNew: false }));

    itemsToPrice = itemsToPrice.filter(i => {
      if (!i.sourceTcgplayerId) {
        console.warn(`[JustTCG] Item ${i.id} (${i.productName}) has no sourceTcgplayerId — skipping price fetch`);
        return false;
      }
      if (game !== "all" && i.game !== game) {
        return false;
      }
      return true;
    });

    if (!itemsToPrice.length) {
      console.log("[JustTCG] No items to price after filtering");
      return 0;
    }

    const thr = await storage.getRepricingThresholds(userId);
    const BATCH = 20;
    let pricedCount = 0;

    for (let i = 0; i < itemsToPrice.length; i += BATCH) {
      const chunk = itemsToPrice.slice(i, i + BATCH);

      const priceRequests = chunk.map(item => {
        const metadata = (() => {
          const val = item.matchMetadataJson;
          if (!val) return {};
          if (typeof val === 'object') return val;
          try { return JSON.parse(val); }
          catch { return {}; }
        })();

        const condition = item.condition ?? "Near Mint";
        const printing = metadata.sourcePrinting ?? null;

        return {
          id: item.id,
          tcgplayerId: item.sourceProductId!,
          condition,
          printing,
        };
      });

      console.log(`[JustTCG] Requesting prices for ${priceRequests.length} items: ${JSON.stringify(priceRequests.slice(0, 2))}`);
      const priceMap = await batchFetchPrices(priceRequests);
      console.log(`[JustTCG] Received priceMap with ${priceMap.size} results`);

      const latestSnapshots = await storage.getLatestSnapshotsByItems(userId, chunk.map(i => i.id));
      const now = new Date();

      for (const item of chunk) {
        try {
          const priceResult = priceMap.get(item.id);
          if (!priceResult) {
            const metadata = (() => {
              const val = item.matchMetadataJson;
              if (!val) return {};
              if (typeof val === 'object') return val;
              try { return JSON.parse(val); }
              catch { return {}; }
            })();
            const condition = item.condition ?? "Near Mint";
            const printing = metadata.sourcePrinting ?? "Normal";
            console.warn(
              `[JustTCG] No price found for ${condition}/${printing} on card ${item.sourceTcgplayerId} (item_id: ${item.id})`
            );
            continue;
          }

          console.log(`[JustTCG] Found price for item ${item.id}: $${priceResult.price}`);
          const { error: updateErr } = await supabaseAdmin
            .from("inventory_items")
            .update({
              current_raw_market_price:    priceResult.price,
              current_rounded_print_price: Math.ceil(priceResult.price),
              price_last_fetched_at:       now.toISOString(),
              price_source:                'justtcg',
              price_change_24hr:           priceResult.priceChange24hr,
              price_change_7d:             priceResult.priceChange7d,
              justtcg_card_uuid:           priceResult.cardUuid,
              justtcg_variant_uuid:        priceResult.variantUuid,
            })
            .eq("id", item.id)
            .eq("user_id", userId);

          if (updateErr) {
            console.error(
              `[JustTCG] Failed to update price for item ${item.id}: ${updateErr.message}`
            );
            continue;
          }

          console.log(`[JustTCG] Successfully updated price for item ${item.id}`);
          pricedCount++;
          const newPrice = priceResult.price;
          const oldPrice = item.currentRawMarketPrice ?? null;
          const { triggered } = oldPrice !== null
            ? checkRepricingThreshold(newPrice, oldPrice, thr)
            : { triggered: false };

          if (triggered && item.labelStatus !== "needs_label") {
            const { error: labelErr } = await supabaseAdmin
              .from("inventory_items")
              .update({ label_status: "needs_repricing" })
              .eq("id", item.id)
              .eq("user_id", userId);
            if (labelErr) {
              console.error(`[JustTCG] Failed to update label_status for item ${item.id}:`, labelErr.message);
            }
          }

          await storage.createWeeklySnapshotIfStale(
            userId,
            item.id,
            latestSnapshots.get(item.id),
            {
              rawMarketPrice: newPrice,
              roundedPrintPrice: Math.ceil(newPrice),
              quantityAfterMerge: item.currentQuantity ?? 0,
            },
            now,
          );
        } catch (itemErr: any) {
          console.error(
            `[JustTCG] Failed to process item ${item.id} (${item.productName}):`,
            itemErr.message
          );
        }
      }

      if (i + BATCH < itemsToPrice.length) {
        await new Promise(r => setTimeout(r, 6000));
      }
    }

    console.log(`[JustTCG] Priced ${pricedCount} items for user ${userId}`);
    return pricedCount;
  } catch (err: any) {
    console.error("[JustTCG] refreshInventoryPrices error:", err.message);
    return 0;
  }
}

export function registerUploadsRoutes(_httpServer: Server, app: Express) {
  app.get("/api/uploads", async (req: any, res) => {
    try {
      res.json(await storage.listUploads(req.user.id));
    } catch (err: any) {
      console.error('[route] error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  });

  app.get("/api/uploads/:id", async (req: any, res) => {
    try {
      const u = await storage.getUpload(req.user.id, req.params.id);
      if (!u) return res.status(404).json({ error: "Not found" });
      res.json(u);
    } catch (err: any) {
      console.error('[route] error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  });

  app.get("/api/uploads/:id/rows", async (req: any, res) => {
    try {
      res.json(await storage.getParsedRowsByUpload(req.user.id, req.params.id));
    } catch (err: any) {
      console.error('[route] error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  });

  app.get("/api/uploads/:id/review", async (req: any, res) => {
    try {
      const review = await storage.getMergeReviewByUpload(req.user.id, req.params.id);
      if (!review) return res.status(404).json({ error: "Not found" });
      res.json(review);
    } catch (err: any) {
      console.error('[route] error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  });

  app.get("/api/uploads/progress/:token", (req: any, res: any) => {
    const { token } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const interval = setInterval(() => {
      const job = pendingJobs.get(token);
      if (!job) { send({ error: "Job not found" }); clearInterval(interval); res.end(); return; }

      while (job.steps.length) {
        const step = job.steps.shift()!;
        send({ label: step.label, pct: step.pct });
      }

      if (job.status === "done") {
        send({ done: true, result: job.result });
        clearInterval(interval);
        res.end();
        pendingJobs.delete(token);
      } else if (job.status === "error") {
        send({ error: job.error });
        clearInterval(interval);
        res.end();
        pendingJobs.delete(token);
      }
    }, 200);

    req.on("close", () => clearInterval(interval));
  });

  app.post("/api/uploads", (req: any, res: any, next: any) => {
    upload.single("file")(req, res, (err: any) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE")
        return res.status(400).json({ error: "File too large — maximum size is 10 MB" });
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  }, async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const userId = req.user.id;
      const { game = "unknown", sourceType = "tcgplayer", progressToken } = req.body;

      const progress = (label: string, pct: number) => {
        if (progressToken) sendProgress(progressToken, label, pct);
      };

      const isXlsx =
        req.file.originalname.toLowerCase().endsWith(".xlsx") ||
        req.file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      progress("Parsing file…", 10);

      let rawRows: Record<string, string>[];
      try {
        if (isXlsx) {
          const wb = XLSX.read(req.file.buffer, { type: "buffer" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
          rawRows = rows.map(row => {
            const out: Record<string, string> = {};
            for (const [k, v] of Object.entries(row)) out[k] = String(v);
            return out;
          });
        } else {
          rawRows = parseCSV(req.file.buffer.toString("utf-8"));
        }
      } catch (e: any) {
        if (progressToken) {
          const job = pendingJobs.get(progressToken);
          if (job) { job.status = "error"; job.error = e.message; }
        }
        return res.status(400).json({ error: e.message });
      }

      progress("Saving rows…", 25);

      const now = new Date().toISOString();
      const newUpload = await storage.createUpload(userId, {
        sourceType, game,
        originalFilename: req.file.originalname,
        uploadedAt: now,
        rawFileContent: null,
        totalRows: rawRows.length,
        parseStatus: "parsed",
        summaryJson: null,
      });

      const uploadId = newUpload.id;
      const parsedRowData = rawRows
        .filter(r => Object.values(r).some(v => v))
        .map((r, i) => mapCsvRow(r, game, i, uploadId));

      await storage.createParsedRows(userId, parsedRowData);

      progress("Loading inventory…", 40);

      const validRows = parsedRowData.filter(r => r.productName !== "(unknown)");
      const newItems: any[] = [];
      const matchedItems: any[] = [];
      const ambiguousItems: any[] = [];
      const repricingCandidates: any[] = [];

      const [lookupMaps, thr] = await Promise.all([
        storage.getInventoryLookupMaps(userId),
        storage.getRepricingThresholds(userId),
      ]);
      const { byProductId, byTcgplayerId, byMatchKey } = lookupMaps;

      progress("Matching rows…", 55);

      for (const row of validRows) {
        let existing =
          (row.sourceProductId && byProductId.get(row.sourceProductId)) ||
          (row.sourceTcgplayerId && byTcgplayerId.get(row.sourceTcgplayerId)) ||
          (row.normalizedMatchKey && byMatchKey.get(row.normalizedMatchKey)) ||
          undefined;

        if (!existing) {
          newItems.push(row);
        } else {
          const csvQty = row.addToQuantity || 1;
          const existingQty = existing.currentQuantity || 0;
          const qtyDelta = csvQty !== existingQty ? csvQty - existingQty : 0;

          matchedItems.push({ row, existingItem: existing, qtyDelta, csvQty, existingQty });
        }
      }

      progress("Building review…", 80);

      const matchedNoChangeCount = matchedItems.filter(m => m.qtyDelta === 0).length;

      const reviewPayload = JSON.stringify({
        newItems: newItems.map(r => ({
          id: r.id, game: r.game, productName: r.productName, number: r.number,
          condition: r.condition, rawMarketPrice: r.rawMarketPrice,
          roundedPrintPrice: r.roundedPrintPrice, addToQuantity: r.addToQuantity,
        })),
        matchedItems: matchedItems.map(({ row, existingItem, qtyDelta, csvQty, existingQty }) => ({
          rowId: row.id, game: row.game, productName: row.productName, number: row.number,
          condition: row.condition, rawMarketPrice: row.rawMarketPrice,
          roundedPrintPrice: row.roundedPrintPrice, csvQty, existingQty, qtyDelta,
          existingId: existingItem.id, existingPrice: existingItem.currentRawMarketPrice,
        })),
        ambiguousItems,
        repricingCandidates: repricingCandidates.map(({ row, existingItem, rule, csvQty, existingQty }) => ({
          rowId: row.id, game: row.game, productName: row.productName,
          priorPrice: existingItem.currentRawMarketPrice, newPrice: row.rawMarketPrice,
          roundedPrintPrice: row.roundedPrintPrice,
          percentChange: existingItem.currentRawMarketPrice
            ? ((row.rawMarketPrice - existingItem.currentRawMarketPrice) / existingItem.currentRawMarketPrice * 100).toFixed(1)
            : null,
          rule, csvQty, existingQty,
        })),
      });

      const review = await storage.createMergeReview(userId, {
        uploadId, status: "pending",
        newItemCount: newItems.length,
        matchedItemCount: matchedItems.filter(m => m.qtyDelta !== 0).length,
        repricingCandidateCount: repricingCandidates.length,
        duplicateWarningCount: ambiguousItems.length,
        reviewPayload, reviewedAt: null, reviewedBy: null,
      });

      const summary = {
        newItems: newItems.length,
        matchedItems: matchedItems.length,
        matchedNoChangeCount,
        repricingCandidates: repricingCandidates.length,
        ambiguousItems: ambiguousItems.length,
        totalParsed: validRows.length,
        totalRaw: rawRows.length,
      };
      await storage.updateUpload(userId, uploadId, { summaryJson: JSON.stringify(summary), parseStatus: "parsed" });

      const result = { upload: newUpload, review, summary };

      if (progressToken) {
        const job = pendingJobs.get(progressToken);
        if (job) {
          job.steps.push({ label: "Done!", pct: 100 });
          job.result = result;
          job.status = "done";
        }
      }

      res.json(result);
    } catch (e: any) {
      console.error(e);
      if (req.body?.progressToken) {
        const job = pendingJobs.get(req.body.progressToken);
        if (job) { job.status = "error"; job.error = e.message; }
      }
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/uploads/progress-token", (_req: any, res: any) => {
    const token = crypto.randomUUID();
    pendingJobs.set(token, { status: "pending", steps: [] });
    setTimeout(() => pendingJobs.delete(token), 5 * 60 * 1000);
    res.json({ token });
  });

  app.post("/api/uploads/:id/approve", async (req: any, res) => {
    const { parseProductName } = await import("../lib/parseProductName.js");
    try {
      const userId = req.user.id;
      const uploadId = req.params.id;

      const review = await storage.getMergeReviewByUpload(userId, uploadId);
      if (!review) return res.status(404).json({ error: "Review not found" });
      if (review.status !== "pending") return res.status(400).json({ error: "Already processed" });

      const overrides: Record<string, { csvQty?: number }> = req.body?.overrides || {};
      const payload = JSON.parse(review.reviewPayload || "{}");
      const now = new Date().toISOString();
      const uploadRecord = await storage.getUpload(userId, uploadId);
      const uploadLevelGame = uploadRecord?.game || "unknown";

      const allParsed = await storage.getParsedRowsByUpload(userId, uploadId);
      const parsedById = new Map(allParsed.map(r => [r.id, r]));

      const rpcNewItems = (payload.newItems || []).map((row: any) => {
        const parsed = parsedById.get(row.id);
        const dbGame = (parsed as any)?.game;
        const reviewGame = row.game;
        const resolvedGame = dbGame || reviewGame || uploadLevelGame;
        console.log(`[Game resolution] id=${row.id}, dbGame=${dbGame}, reviewGame=${reviewGame}, final=${resolvedGame}`);
        let photoUrl: string | null = null;
        try {
          const src = JSON.parse(parsed?.sourcePayload || "{}");
          photoUrl = src._photoUrl || src["Photo URL"] || null;
        } catch {}

        const finalGame = (overrides[row.id] as any)?.game || resolvedGame;
        const finalCondition = (overrides[row.id] as any)?.condition || row.condition;
        const finalPrice = (overrides[row.id] as any)?.rawMarketPrice ?? row.rawMarketPrice;
        const rawName = (row.productName ?? "").trim();
        const csvNumber = (row.number ?? "").trim();
        const { cleanName, displaySuffix } = parseProductName(rawName, finalGame, csvNumber);

        return {
          inventoryItemId: crypto.randomUUID(),
          parsedRowId: parsed?.id ?? null,
          game: finalGame,
          productName: row.productName,
          number: row.number ?? null,
          condition: finalCondition ?? null,
          addToQuantity: row.addToQuantity ?? 1,
          rawMarketPrice: null,  // Keep NULL until JustTCG fetch
          roundedPrintPrice: null,  // Keep NULL until JustTCG fetch
          csvMarketPrice: finalPrice ?? null,  // Store CSV price as audit field
          priceSource: "pending",  // Mark as pending JustTCG fetch
          normalizedMatchKey: parsed?.normalizedMatchKey ?? null,
          matchMetadataJson: JSON.stringify({
            sourceProductId: parsed?.sourceProductId ?? null,
            sourceTcgplayerSkuId: parsed?.sourceTcgplayerSkuId ?? null,
            sourceSetName: parsed?.sourceSetName ?? null,
            sourcePrinting: parsed?.sourcePrinting ?? null,
            sourceProductLine: parsed?.sourceProductLine ?? null,
            sourceRarity: parsed?.sourceRarity ?? null,
            cleanName,
            displaySuffix: displaySuffix ?? null,
          }),
          sourceProductId: parsed?.sourceProductId ?? null,
          sourceTcgplayerSkuId: parsed?.sourceTcgplayerSkuId ?? null,
          photoUrl,
        };
      });

      const rpcMatchedItems = (payload.matchedItems || []).map((match: any) => {
        const parsed = parsedById.get(match.rowId);
        const dbGame = (parsed as any)?.game;
        const reviewGame = match.game;
        const resolvedGame = (overrides[match.rowId] as any)?.game || dbGame || reviewGame || uploadLevelGame;
        return {
          parsedRowId: parsed?.id ?? null,
          existingId: match.existingId,
          game: resolvedGame,
          newQty: overrides[match.rowId]?.csvQty ?? match.csvQty ?? match.existingQty ?? 0,
          csvMarketPrice: match.rawMarketPrice ?? null,  // Store CSV price as audit field
          priceSource: "csv",  // Mark that CSV data was available (price kept from existing)
        };
      });

      const rpcRepricing = (payload.repricingCandidates || [])
        .map((candidate: any) => {
          const matched = (payload.matchedItems || []).find((m: any) => m.rowId === candidate.rowId);
          return {
            existingId: matched?.existingId ?? null,
            priorPrice: candidate.priorPrice ?? null,
            newPrice: candidate.newPrice ?? null,
            roundedPrintPrice: candidate.roundedPrintPrice ?? null,
            percentChange: parseFloat(candidate.percentChange) || null,
            rule: candidate.rule ?? null,
          };
        })
        .filter((r: any) => r.existingId !== null);

      const { error: rpcError } = await supabaseAdmin.rpc("approve_upload", {
        p_user_id: userId,
        p_upload_id: uploadId,
        p_review_id: review.id,
        p_new_items: rpcNewItems,
        p_matched_items: rpcMatchedItems,
        p_repricing: rpcRepricing,
        p_now: now,
      });

      if (rpcError) {
        console.error("[approve_upload RPC error]", rpcError);
        return res.status(500).json({ error: rpcError.message });
      }

      const newItemIds = rpcNewItems.map((i: any) => i.inventoryItemId);

      if (newItemIds.length > 0) {
        await supabaseAdmin
          .from("inventory_items")
          .update({ label_status: "needs_label" })
          .eq("user_id", userId)
          .in("id", newItemIds);
      }

      const repricingIds = rpcRepricing.map((r: any) => r.existingId).filter(Boolean);
      if (repricingIds.length > 0) {
        await supabaseAdmin
          .from("inventory_items")
          .update({ label_status: "needs_repricing" })
          .eq("user_id", userId)
          .in("id", repricingIds)
          .neq("label_status", "needs_label");
      }

      try {
        await refreshInventoryPrices(userId, newItemIds, uploadLevelGame);
      } catch (e: any) {
        console.error('[approve] JustTCG enrichment failed — items remain price_source=pending:', e.message);
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/uploads/:id/reject", async (req: any, res) => {
    const userId = req.user.id;
    const review = await storage.getMergeReviewByUpload(userId, req.params.id);
    if (!review) return res.status(404).json({ error: "Not found" });
    await storage.updateMergeReview(userId, review.id, { status: "rejected", reviewedAt: new Date().toISOString() });
    await storage.updateUpload(userId, req.params.id, { parseStatus: "rejected" as any });
    res.json({ success: true });
  });

  app.delete("/api/uploads/:id", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const uploadId = req.params.id;

      const u = await storage.getUpload(userId, uploadId);
      if (!u) return res.status(404).json({ error: "Not found" });

      await storage.deleteUpload(userId, uploadId);

      res.json({ success: true });
    } catch (e: any) {
      console.error("[delete upload]", e);
      res.status(500).json({ error: e.message });
    }
  });
}
