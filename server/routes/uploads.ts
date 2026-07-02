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

async function refreshInventoryPrices(
  userId: string,
  newItemIds: string[],
  game: string,
) {
  try {
    let newItems: Array<InventoryItem & { isNew: true }> = [];
    if (newItemIds.length) {
      const { data: newItemRows, error: fetchErr } = await supabaseAdmin
        .from("inventory_items")
        .select("*")
        .eq("user_id", userId)
        .in("id", newItemIds);

      if (fetchErr) {
        console.error("[JustTCG] Failed to load new inventory items:", fetchErr.message);
        return;
      }

      const { toCamel } = await import("../storage");
      newItems = (newItemRows || []).map(r => ({ ...toCamel<InventoryItem>(r), isNew: true }));

      const returnedIds = new Set(newItems.map(i => i.id));
      for (const id of newItemIds) {
        if (!returnedIds.has(id)) {
          console.warn(`[JustTCG] Newly approved item ${id} not found in inventory_items yet (RPC commit lag?)`);
        }
      }

      newItems = newItems.filter(i => {
        if (!i.sourceTcgplayerId) {
          console.warn(`[JustTCG] Item ${i.id} (${i.productName}) has no sourceTcgplayerId — skipping price fetch`);
          return false;
        }
        return true;
      });
    }

    let staleItems: Array<InventoryItem & { isNew: false }> = [];
    const allItems = await storage.listInventoryItems(userId, { game: game !== "all" ? game : undefined });
    staleItems = allItems
      .filter(i => {
        if (newItemIds.includes(i.id)) return false;
        if (!i.sourceTcgplayerId) return false;
        const fetchedAt = i.priceLastFetchedAt;
        if (!fetchedAt) return true;
        return Date.now() - new Date(fetchedAt).getTime() > 6 * 60 * 60 * 1000;
      })
      .map(i => ({ ...i, isNew: false }));

    const allItemsToPrice = [...newItems, ...staleItems];
    if (!allItemsToPrice.length) {
      if (newItems.length === 0 && staleItems.length === 0) {
        console.log("[JustTCG] No new or stale items to price");
      }
      return;
    }

    const thr = await storage.getRepricingThresholds(userId);
    const BATCH = 20;
    let pricedNew = 0;
    let pricedExisting = 0;

    for (let i = 0; i < allItemsToPrice.length; i += BATCH) {
      const chunk = allItemsToPrice.slice(i, i + BATCH);

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
        try {
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
              `[JustTCG] Failed to update price for item ${item.id}:`,
              updateErr.message
            );
            continue;
          }

          if (item.isNew) {
            pricedNew++;
            await storage.reconcileFreshSnapshotWithLivePrice(
              userId,
              latestSnapshots.get(item.id),
              { rawMarketPrice: priceResult.price, roundedPrintPrice: Math.ceil(priceResult.price) },
              now,
            );
          } else {
            pricedExisting++;
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
          }
        } catch (itemErr: any) {
          console.error(
            `[JustTCG] Failed to process item ${item.id} (${item.productName}):`,
            itemErr.message
          );
        }
      }

      if (i + BATCH < allItemsToPrice.length) {
        await new Promise(r => setTimeout(r, 6000));
      }
    }

    console.log(`[JustTCG] Priced ${pricedNew} new items, refreshed ${pricedExisting} existing items for user ${userId}`);
  } catch (err: any) {
    console.error("[JustTCG] refreshInventoryPrices error:", err.message);
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

          if (existing.currentRawMarketPrice && row.rawMarketPrice) {
            const { triggered, rule } = checkRepricingThreshold(row.rawMarketPrice, existing.currentRawMarketPrice, thr);
            if (triggered) repricingCandidates.push({ row, existingItem: existing, rule, qtyDelta, csvQty, existingQty });
          }
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
          rawMarketPrice: finalPrice ?? null,
          roundedPrintPrice: finalPrice ? ceilPrice(finalPrice) : null,
          normalizedMatchKey: parsed?.normalizedMatchKey ?? null,
          matchMetadataJson: JSON.stringify({
            sourceProductId: parsed?.sourceProductId ?? null,
            sourceTcgplayerId: parsed?.sourceTcgplayerId ?? null,
            sourceSetName: parsed?.sourceSetName ?? null,
            sourcePrinting: parsed?.sourcePrinting ?? null,
            sourceProductLine: parsed?.sourceProductLine ?? null,
            sourceRarity: parsed?.sourceRarity ?? null,
            cleanName,
            displaySuffix: displaySuffix ?? null,
          }),
          sourceProductId: parsed?.sourceProductId ?? null,
          sourceTcgplayerId: parsed?.sourceTcgplayerId ?? null,
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
          rawMarketPrice: match.rawMarketPrice ?? null,
          roundedPrintPrice: match.roundedPrintPrice ?? null,
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

      setTimeout(() => refreshInventoryPrices(userId, newItemIds, uploadLevelGame), 2000);

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
