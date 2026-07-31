import type { Express, Server } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage, type InventoryItem } from "../storage";
import { supabaseAdmin } from "../supabase";
import { batchFetchPrices } from "../justtcg";
import { resolveProductIds } from "../productIdResolver";
import { parseCSV, mapCsvRow, checkRepricingThreshold, upgradeTcgPlayerImageUrl } from "./csvHelpers";
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
  uploadId: string | null = null,
) {
  try {
    if (!itemIdsToPrice.length) return 0;

    // FIX (2026-07-20): a single .in("id", itemIdsToPrice) with 400+ UUIDs
    // built a request URL long enough to fail outright ("TypeError: fetch
    // failed", seen in production with 430 stale items) before it ever
    // reached Supabase. Chunk the id lookup so each request stays small.
    const ID_LOOKUP_CHUNK = 100;
    const itemRows: any[] = [];
    for (let i = 0; i < itemIdsToPrice.length; i += ID_LOOKUP_CHUNK) {
      const idChunk = itemIdsToPrice.slice(i, i + ID_LOOKUP_CHUNK);
      const { data, error: fetchErr } = await supabaseAdmin
        .from("inventory_items")
        .select("id, product_name, number, condition, source_product_id, source_tcgplayer_sku_id, match_metadata_json, current_raw_market_price, current_quantity, photo_url, label_status, game")
        .eq("user_id", userId)
        .in("id", idChunk);

      if (fetchErr) {
        console.error("[JustTCG] Failed to load items chunk:", fetchErr.message);
        continue; // skip this chunk, keep processing the rest
      }
      if (data?.length) itemRows.push(...data);
    }

    if (!itemRows.length) {
      console.error("[JustTCG] Failed to load any items for pricing");
      return 0;
    }

    // Map snake_case DB columns directly — no toCamel needed
    const itemsToPrice = itemRows
      .filter(r => r.source_product_id && (game === "all" || r.game === game))
      .map(r => ({
        id:                      r.id as string,
        productName:             r.product_name as string,
        number:                  r.number as string | null,
        game:                    r.game as string | null,
        condition:               r.condition as string,
        sourceProductId:         r.source_product_id as string,
        sourceTcgplayerSkuId:    r.source_tcgplayer_sku_id as string | null,
        matchMetadataJson:       r.match_metadata_json as any,
        currentRawMarketPrice:   r.current_raw_market_price as number | null,
        currentQuantity:         r.current_quantity as number,
        photoUrl:                r.photo_url as string | null,
        labelStatus:             r.label_status as string,
      }));

    if (!itemsToPrice.length) {
      console.warn("[JustTCG] No items with sourceProductId to price");
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
          if (typeof val === "object") return val;
          try { return JSON.parse(val); } catch { return {}; }
        })();
        return {
          id:             item.id,
          tcgplayerId:    item.sourceProductId,
          tcgplayerSkuId: item.sourceTcgplayerSkuId ?? metadata.sourceTcgplayerSkuId ?? null,
          condition:      item.condition ?? "Near Mint",
          printing:       metadata.sourcePrinting || null,
          // Fallback routing fields — without these, batchFetchPrices cannot route
          // to PokéWallet/BerryWallet and unpriced items stay unpriced forever.
          game:           item.game ?? null,
          groupId:        item.sourceProductId ?? null,
          cardNumber:     item.number ?? null,
        };
      });

      const priceMap = await batchFetchPrices(priceRequests);

      const latestSnapshots = await storage.getLatestSnapshotsByItems(userId, chunk.map(i => i.id));
      const now = new Date();

      for (const item of chunk) {
        const priceResult = priceMap.get(item.id);
        if (!priceResult) {
          console.warn(`[JustTCG] No price for item ${item.id} (${item.productName}) productId=${item.sourceProductId}`);
          continue;
        }

        const itemUpdate: Record<string, any> = {
          current_raw_market_price:    priceResult.price,
          current_rounded_print_price: Math.ceil(priceResult.price),
          price_last_fetched_at:       now.toISOString(),
          price_source:                "justtcg",
          price_change_24hr:           priceResult.priceChange24hr,
          price_change_7d:             priceResult.priceChange7d,
          justtcg_card_uuid:           priceResult.cardUuid,
          justtcg_variant_uuid:        priceResult.variantUuid,
        };

        const { error: updateErr } = await supabaseAdmin
          .from("inventory_items")
          .update(itemUpdate)
          .eq("id", item.id)
          .eq("user_id", userId);

        if (updateErr) {
          console.error(`[JustTCG] DB update failed for ${item.id}:`, updateErr.message);
          continue;
        }

        pricedCount++;

        // Labels are created with NULL prices at merge time (CSV prices are never
        // recorded). Backfill the queued label now that a real price resolved.
        await supabaseAdmin
          .from("label_queue_items")
          .update({
            current_raw_price:   priceResult.price,
            rounded_print_price: Math.ceil(priceResult.price),
            updated_at:          now.toISOString(),
          })
          .eq("user_id", userId)
          .eq("inventory_item_id", item.id)
          .eq("export_status", "pending")
          .is("current_raw_price", null);

        const oldPrice = item.currentRawMarketPrice ?? null;
        if (oldPrice !== null) {
          const { triggered } = checkRepricingThreshold(priceResult.price, oldPrice, thr);
          if (triggered && item.labelStatus !== "needs_label") {
            await supabaseAdmin
              .from("inventory_items")
              .update({ label_status: "needs_repricing" })
              .eq("id", item.id)
              .eq("user_id", userId);
          }
        }

        const latestSnap = latestSnapshots.get(item.id);
        const reconciled = await storage.reconcileFreshSnapshotWithLivePrice(
          userId,
          latestSnap,
          { rawMarketPrice: priceResult.price, roundedPrintPrice: Math.ceil(priceResult.price) },
          now,
          5 * 60 * 1000,
        );

        if (!reconciled) {
          await storage.createWeeklySnapshotIfStale(
            userId,
            item.id,
            latestSnap,
            { rawMarketPrice: priceResult.price, roundedPrintPrice: Math.ceil(priceResult.price), quantityAfterMerge: item.currentQuantity ?? 0 },
            now,
            uploadId,
          );
        }
      }

      if (i + BATCH < itemsToPrice.length) {
        await new Promise(r => setTimeout(r, 6000));
      }
    }

    console.log(`[JustTCG] Priced ${pricedCount}/${itemsToPrice.length} items`);
    return pricedCount;
  } catch (err: any) {
    console.error("[JustTCG] refreshInventoryPrices error:", err.message);
    return 0;
  }
}

// Retry helper: attempts fn up to maxAttempts times with delayMs between tries.
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayMs: number,
  label: string,
): Promise<T | undefined> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (attempt < maxAttempts) {
        console.warn(`[approve] ${label} attempt ${attempt} failed (${e.message}), retrying in ${delayMs / 1000}s...`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        console.error(`[approve] ${label} failed after ${maxAttempts} attempts:`, e.message);
      }
    }
  }
  return undefined;
}

// ─── CSV retention ────────────────────────────────────────────────────────────
// Every uploaded file is kept in the private `csv-uploads` bucket so a merge can
// be replayed later. Without this, a failed merge is unrecoverable: parsed_rows
// is the only trace and it gets deleted with the upload.
const CSV_BUCKET = "csv-uploads";

function storageKeyFor(userId: string, uploadId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return `${userId}/${uploadId}/${safe}`;
}

async function retainRawFile(
  userId: string,
  uploadId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const key = storageKeyFor(userId, uploadId, filename);
  const { error } = await supabaseAdmin.storage
    .from(CSV_BUCKET)
    .upload(key, buffer, { contentType: mimeType || "text/csv", upsert: true });

  if (error) {
    // Retention failing must not block the import, but it must be loud.
    console.error(`[upload] CSV retention FAILED for upload ${uploadId}: ${error.message}`);
    return null;
  }
  return key;
}

interface PipelineArgs {
  userId: string;
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  game: string;
  sourceType: string;
  progressToken?: string;
  /** Set when this run is a replay of an earlier upload. */
  replayOfUploadId?: string | null;
}

/**
 * Parse a CSV/XLSX buffer into parsed_rows + a pending merge review.
 * Shared by POST /api/uploads and POST /api/uploads/:id/replay.
 */
export async function runUploadPipeline(args: PipelineArgs) {
  const { userId, buffer, originalFilename, mimeType, game, sourceType, progressToken } = args;

  const progress = (label: string, pct: number) => {
    if (progressToken) sendProgress(progressToken, label, pct);
  };

  const fail = (message: string, httpStatus = 500) => {
    const err: any = new Error(message);
    err.httpStatus = httpStatus;
    return err;
  };

  const isXlsx =
    originalFilename.toLowerCase().endsWith(".xlsx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  progress("Parsing file…", 10);

  let rawRows: Record<string, string>[];
  try {
    if (isXlsx) {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      rawRows = rows.map(row => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) out[k] = String(v);
        return out;
      });
    } else {
      rawRows = parseCSV(buffer.toString("utf-8"));
    }
  } catch (e: any) {
    throw fail(e.message, 400);
  }

  progress("Saving rows…", 25);

  const now = new Date().toISOString();
  const newUpload = await storage.createUpload(userId, {
    sourceType, game,
    originalFilename,
    uploadedAt: now,
    rawFileContent: null,
    totalRows: rawRows.length,
    parseStatus: "pending",
    summaryJson: null,
  });

  const uploadId = newUpload.id;

  // Retain the raw file before doing anything destructive, so the import is
  // always replayable even if the rest of this run dies.
  const storageKey = await retainRawFile(userId, uploadId, originalFilename, buffer, mimeType);
  if (storageKey) {
    await storage.updateUpload(userId, uploadId, { rawFileStorageKey: storageKey });
  }

  const parsedRowData = rawRows
    .filter(r => Object.values(r).some(v => v))
    .map((r, i) => mapCsvRow(r, game, i, uploadId));

  try {
    await storage.createParsedRows(userId, parsedRowData);
  } catch (e: any) {
    // Never leave an upload sitting at "pending" after a failed row write —
    // that is what made the last bad merge look successful.
    await storage.updateUpload(userId, uploadId, { parseStatus: "error" });
    throw fail(`Failed to save parsed rows: ${e.message}`);
  }

  const validRows = parsedRowData.filter(r => r.productName !== "(unknown)");

  // ── Recover missing TCGplayer product ids by name + set ────────────────────
  // A row without one can never be priced by JustTCG, PokéWallet or BerryWallet.
  const missingIdRows = validRows.filter(r => !r.sourceProductId);
  let resolverSummary = { attempted: 0, resolved: 0, unresolved: 0, skippedOverCap: 0 };

  if (missingIdRows.length > 0) {
    progress(`Resolving ${missingIdRows.length} missing product IDs…`, 32);
    try {
      const { results, summary } = await resolveProductIds(
        missingIdRows.map(r => ({
          id: r.id,
          productName: r.productName,
          number: r.number ?? null,
          setName: (r as any).sourceSetName ?? null,
          game: r.game ?? game,
          condition: r.condition ?? null,
          printing: (r as any).sourcePrinting ?? null,
        })),
      );
      resolverSummary = summary;

      const patches = missingIdRows
        .map(row => {
          const hit = results.get(row.id);
          if (!hit) return null;
          // Patch in memory so matching and the review use the recovered id.
          (row as any).sourceProductId = hit.sourceProductId;
          if (hit.sourceTcgplayerSkuId) (row as any).sourceTcgplayerSkuId = hit.sourceTcgplayerSkuId;
          return {
            id: row.id,
            sourceProductId: hit.sourceProductId,
            sourceTcgplayerSkuId: hit.sourceTcgplayerSkuId,
            parseFlags: JSON.stringify([
              "product_id_resolved",
              `resolver:${hit.provider}`,
              `confidence:${hit.confidence}`,
            ]),
          };
        })
        .filter(Boolean) as {
          id: string; sourceProductId: string; sourceTcgplayerSkuId: string | null; parseFlags: string;
        }[];

      if (patches.length) await storage.patchParsedRowIdentifiers(userId, patches);
    } catch (e: any) {
      // Resolution is best-effort; an unresolved row still imports, just unpriced.
      console.error("[upload] product id resolution failed:", e.message);
    }
  }

  progress("Loading inventory…", 40);

  const newItems: any[] = [];
  const matchedItems: any[] = [];
  const ambiguousItems: any[] = [];

  const lookupMaps = await storage.getInventoryLookupMaps(userId);
  const { byProductId, byMatchKey } = lookupMaps;

  progress("Matching rows…", 55);

  for (const row of validRows) {
    const existing =
      (row.sourceProductId && byProductId.get(row.sourceProductId)) ||
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
      condition: r.condition,
      addToQuantity: r.addToQuantity,
    })),
    matchedItems: matchedItems.map(({ row, existingItem, qtyDelta, csvQty, existingQty }) => ({
      rowId: row.id, game: row.game, productName: row.productName, number: row.number,
      condition: row.condition,
      csvQty, existingQty, qtyDelta,
      existingId: existingItem.id, existingPrice: existingItem.currentRawMarketPrice,
    })),
    ambiguousItems,
    repricingCandidates: [],
  });

  const review = await storage.createMergeReview(userId, {
    uploadId, status: "pending",
    newItemCount: newItems.length,
    matchedItemCount: matchedItems.filter(m => m.qtyDelta !== 0).length,
    repricingCandidateCount: 0,
    duplicateWarningCount: ambiguousItems.length,
    reviewPayload, reviewedAt: null, reviewedBy: null,
  });

  const summary = {
    newItems: newItems.length,
    matchedItems: matchedItems.length,
    matchedNoChangeCount,
    repricingCandidates: 0,
    ambiguousItems: ambiguousItems.length,
    totalParsed: validRows.length,
    totalRaw: rawRows.length,
    // Visibility so a row can never go missing without a number to point at.
    rowsSaved: parsedRowData.length,
    rowsSkippedUnknown: parsedRowData.length - validRows.length,
    rowsMissingProductId: validRows.filter(r => !r.sourceProductId).length,
    productIdsResolved: resolverSummary.resolved,
    productIdsUnresolved: resolverSummary.unresolved + resolverSummary.skippedOverCap,
    rawFileRetained: !!storageKey,
    replayOfUploadId: args.replayOfUploadId ?? null,
  };
  await storage.updateUpload(userId, uploadId, { summaryJson: JSON.stringify(summary), parseStatus: "success" });

  const result = { upload: { ...newUpload, rawFileStorageKey: storageKey }, review, summary };

  if (progressToken) {
    const job = pendingJobs.get(progressToken);
    if (job) {
      job.steps.push({ label: "Done!", pct: 100 });
      job.result = result;
      job.status = "done";
    }
  }

  return result;
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
        return res.status(400).json({ error: "File too large \u2014 maximum size is 10 MB" });
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  }, async (req: any, res: any) => {
    const progressToken = req.body?.progressToken;
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const { game = "unknown", sourceType = "tcgplayer" } = req.body;

      const result = await runUploadPipeline({
        userId: req.user.id,
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        game,
        sourceType,
        progressToken,
      });

      res.json(result);
    } catch (e: any) {
      console.error("[upload]", e);
      if (progressToken) {
        const job = pendingJobs.get(progressToken);
        if (job) { job.status = "error"; job.error = e.message; }
      }
      res.status(e.httpStatus ?? 500).json({ error: e.message });
    }
  });

  // ── Replay a retained upload ──────────────────────────────────────────
  // Re-parses the original file from storage into a NEW upload + pending review.
  // The original upload row is left untouched so nothing is lost on a bad replay.
  app.post("/api/uploads/:id/replay", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const original = await storage.getUpload(userId, req.params.id);
      if (!original) return res.status(404).json({ error: "Upload not found" });

      if (!original.rawFileStorageKey) {
        return res.status(409).json({
          error: "This upload has no retained file — it predates CSV retention and cannot be replayed. Re-upload the file instead.",
        });
      }

      const { data: blob, error: dlError } = await supabaseAdmin.storage
        .from(CSV_BUCKET)
        .download(original.rawFileStorageKey);

      if (dlError || !blob) {
        return res.status(500).json({ error: `Could not read retained file: ${dlError?.message ?? "missing"}` });
      }

      const buffer = Buffer.from(await blob.arrayBuffer());
      const { game, sourceType, progressToken } = req.body ?? {};

      const result = await runUploadPipeline({
        userId,
        buffer,
        originalFilename: original.originalFilename,
        mimeType: blob.type || "text/csv",
        game: game || original.game,
        sourceType: sourceType || original.sourceType,
        progressToken,
        replayOfUploadId: original.id,
      });

      res.json({ ...result, replayedFrom: original.id });
    } catch (e: any) {
      console.error("[upload replay]", e);
      res.status(e.httpStatus ?? 500).json({ error: e.message });
    }
  });

  // ── Download the retained original file (signed, 5 min) ───────────────────
  app.get("/api/uploads/:id/file", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const u = await storage.getUpload(userId, req.params.id);
      if (!u) return res.status(404).json({ error: "Upload not found" });
      if (!u.rawFileStorageKey) return res.status(404).json({ error: "No retained file for this upload" });

      const { data, error } = await supabaseAdmin.storage
        .from(CSV_BUCKET)
        .createSignedUrl(u.rawFileStorageKey, 300);

      if (error || !data) return res.status(500).json({ error: error?.message ?? "Could not sign URL" });
      res.json({ url: data.signedUrl, filename: u.originalFilename, expiresInSeconds: 300 });
    } catch (e: any) {
      console.error("[upload file]", e);
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
    const { parseProductName } = await import("../../shared/lib/parseProductName.js");
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
        const resolvedGame = (overrides[row.id] as any)?.game || (parsed as any)?.game || row.game || uploadLevelGame;

        let photoUrl: string | null = null;
        try {
          const src = JSON.parse(parsed?.sourcePayload || "{}");
          const rawUrl = src._photoUrl || src["Photo URL"] || null;
          // Upgrade any TCGPlayer URL to max resolution (1000x1000)
          photoUrl = upgradeTcgPlayerImageUrl(rawUrl);
        } catch {}

        const finalCondition = (overrides[row.id] as any)?.condition || row.condition;
        const rawName = (row.productName ?? "").trim();
        const csvNumber = (row.number ?? "").trim();
        const { cleanName, displaySuffix } = parseProductName(rawName, resolvedGame, csvNumber);

        return {
          inventoryItemId: crypto.randomUUID(),
          parsedRowId: parsed?.id ?? null,
          game: resolvedGame,
          productName: row.productName,
          number: row.number ?? null,
          condition: finalCondition ?? null,
          addToQuantity: row.addToQuantity ?? 1,
          priceSource: "pending",
          normalizedMatchKey: parsed?.normalizedMatchKey ?? null,
          matchMetadataJson: JSON.stringify({
            sourceProductId:       parsed?.sourceProductId ?? null,
            sourceTcgplayerSkuId:  parsed?.sourceTcgplayerSkuId ?? null,
            sourceSetName:         parsed?.sourceSetName ?? null,
            sourcePrinting:        parsed?.sourcePrinting ?? null,
            sourceProductLine:     parsed?.sourceProductLine ?? null,
            sourceRarity:          parsed?.sourceRarity ?? null,
            cleanName,
            displaySuffix: displaySuffix ?? null,
          }),
          sourceProductId:      parsed?.sourceProductId ?? null,
          sourceTcgplayerSkuId: parsed?.sourceTcgplayerSkuId ?? null,
          photoUrl,
        };
      });

      const rpcMatchedItems = (payload.matchedItems || []).map((match: any) => {
        const parsed = parsedById.get(match.rowId);
        const resolvedGame = (overrides[match.rowId] as any)?.game || (parsed as any)?.game || match.game || uploadLevelGame;
        return {
          parsedRowId:    parsed?.id ?? null,
          existingId:     match.existingId,
          game:           resolvedGame,
          newQty:         overrides[match.rowId]?.csvQty ?? match.csvQty ?? match.existingQty ?? 0,
          priceSource:    "pending",
        };
      });

      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("approve_upload", {
        p_user_id:      userId,
        p_upload_id:    uploadId,
        p_review_id:    review.id,
        p_new_items:    rpcNewItems,
        p_matched_items: rpcMatchedItems,
        p_repricing:    [],
        p_now:          now,
      });

      // approve_upload is all-or-nothing: it verifies every submitted item landed
      // on disk and raises (rolling the whole merge back) if the counts disagree,
      // so an error here means nothing was written and the upload is still pending.
      if (rpcError) {
        console.error("[approve_upload RPC error]", rpcError);
        return res.status(500).json({
          error: rpcError.message,
          merged: false,
          hint: "No rows were written — the merge was rolled back. Re-approve to retry.",
        });
      }

      const counts = (rpcResult ?? {}) as Record<string, number>;
      console.log(
        `[approve_upload] upload=${uploadId} inserted=${counts.newInserted ?? 0} ` +
        `merged=${counts.newMergedIntoExisting ?? 0} matched=${counts.matchedUpdated ?? 0} ` +
        `parsedLinked=${counts.parsedRowsLinked ?? 0} expectedNew=${counts.expectedNew ?? 0}`,
      );

      const newItemIds = rpcNewItems.map((i: any) => i.inventoryItemId);

      if (newItemIds.length > 0) {
        await supabaseAdmin
          .from("inventory_items")
          .update({ label_status: "needs_label" })
          .eq("user_id", userId)
          .in("id", newItemIds);
      }

      // Fetch live JustTCG prices for all touched items (new + matched).
      // Always use "all" so mixed-game uploads are never filtered out.
      // Retry once after 30s if the first attempt hits a transient network error.
      const matchedItemIds = rpcMatchedItems.map((i: any) => i.existingId).filter(Boolean);
      const allToPrice = [...newItemIds, ...matchedItemIds];

      if (allToPrice.length > 0) {
        setImmediate(async () => {
          await withRetry(
            () => refreshInventoryPrices(userId, allToPrice, "all", uploadId),
            2,
            30_000,
            "JustTCG post-approve price refresh",
          );

          // Sweep: anything still unpriced after the first pass gets one more try
          // (JustTCG rate limits and the PokeWallet/BerryWallet fallback quota are
          // both transient). Whatever is still pending after this is picked up by
          // the daily refresh job, which also targets price_source = 'pending'.
          try {
            const { data: stillPending } = await supabaseAdmin
              .from("inventory_items")
              .select("id")
              .eq("user_id", userId)
              .eq("latest_upload_id", uploadId)
              .eq("price_source", "pending");

            const pendingIds = (stillPending ?? []).map(r => r.id as string);
            if (pendingIds.length > 0) {
              console.warn(`[approve_upload] ${pendingIds.length} item(s) unpriced after first pass — retrying`);
              const priced = await refreshInventoryPrices(userId, pendingIds, "all", uploadId);
              const left = pendingIds.length - priced;
              if (left > 0) {
                console.warn(
                  `[approve_upload] ${left} item(s) from upload ${uploadId} remain unpriced ` +
                  `(no JustTCG/PokeWallet match or missing source_product_id) — daily job will retry`,
                );
              }
            } else {
              console.log(`[approve_upload] all ${allToPrice.length} item(s) priced for upload ${uploadId}`);
            }
          } catch (e: any) {
            console.error("[approve_upload] pending price sweep failed:", e.message);
          }
        });
      }

      res.json({ success: true, merged: true, counts });
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
    res.json({ success: true });
  });

  app.delete("/api/uploads/:id", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const uploadId = req.params.id;

      const u = await storage.getUpload(userId, uploadId);
      if (!u) return res.status(404).json({ error: "Not found" });

      if (u.rawFileStorageKey) {
        const { error: rmError } = await supabaseAdmin.storage.from(CSV_BUCKET).remove([u.rawFileStorageKey]);
        if (rmError) console.warn(`[delete upload] could not remove retained file: ${rmError.message}`);
      }

      await storage.deleteUpload(userId, uploadId);

      res.json({ success: true });
    } catch (e: any) {
      console.error("[delete upload]", e);
      res.status(500).json({ error: e.message });
    }
  });
}
