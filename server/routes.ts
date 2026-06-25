import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { supabaseAdmin, verifyToken } from "./supabase";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── CSV parser ──────────────────────────────────────────────────────────────
function normalizeCondition(raw: string): string {
  const s = (raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (s.includes("near mint") || s === "nm") return "Near Mint";
  if (s.includes("lightly played") || s === "lp") return "Lightly Played";
  if (s.includes("moderately played") || s === "mp") return "Moderately Played";
  if (s.includes("heavily played") || s === "hp") return "Heavily Played";
  if (s.includes("damaged") || s === "d") return "Damaged";
  return raw || "Near Mint";
}

function normalizeName(name: string): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"');
}

function normalizeNumber(n: string): string {
  return (n || "").trim().replace(/\s+/g, "");
}

function buildMatchKey(
  productName: string,
  number: string | null | undefined,
  condition: string | null | undefined,
  printing: string | null | undefined,
  setName: string | null | undefined,
  game: string
): string {
  return [
    game.toLowerCase(),
    normalizeName(productName),
    normalizeNumber(number || ""),
    (condition || "").toLowerCase(),
    (printing || "").toLowerCase(),
    normalizeName(setName || ""),
  ].join("|");
}

function ceilPrice(price: number | null | undefined): number {
  if (!price || isNaN(price)) return 0;
  return Math.ceil(price);
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || "").trim().replace(/^"|"$/g, "");
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function mapCsvRow(raw: Record<string, string>, game: string, rowIndex: number, uploadId: string): any {
  const k = (candidates: string[]): string => {
    for (const c of candidates) {
      const found = Object.keys(raw).find(k => k.toLowerCase() === c.toLowerCase());
      if (found && raw[found]) return raw[found];
    }
    return "";
  };

  const productName = k(["Product Name", "Name", "Card Name", "product_name"]);
  const number = k(["Number", "Card Number", "Collector Number", "number"]);
  const condition = normalizeCondition(k(["Condition", "condition", "Cond"]));
  const rawPriceStr = k(["TCG Market Price", "Market Price", "TCGplayer Market Price", "Price", "market_price"]);
  const rawMarketPrice = parseFloat(rawPriceStr.replace(/[^0-9.]/g, "")) || null;
  const roundedPrintPrice = ceilPrice(rawMarketPrice);
  const addToQuantityStr = k(["Add to Quantity", "add_to_quantity"]);
  const totalQuantityStr = k(["Total Quantity", "total_quantity", "Quantity", "Qty", "quantity"]);
  const addToQuantity = parseInt(addToQuantityStr) || parseInt(totalQuantityStr) || 1;

  const sourceProductId = k(["Product ID", "product_id"]);
  const sourceTcgplayerId = k(["TCGplayer Id", "TCGplayer ID", "tcgplayer_id", "TCGplayerId"]);
  const sourceProductLine = k(["Product Line", "product_line", "Game"]);
  const sourceSetName = k(["Set Name", "set_name", "Set", "Expansion"]);
  const sourcePrinting = k(["Printing", "printing", "Foil", "Edition"]);
  const sourceRarity = k(["Rarity", "rarity"]);
  const photoUrl = k(["Photo URL", "photo_url", "Image URL"]);

  const matchKey = buildMatchKey(productName, number, condition, sourcePrinting, sourceSetName, game);
  const id = crypto.randomUUID();

  const flags: string[] = [];
  if (!productName) flags.push("missing_product_name");
  if (!rawMarketPrice) flags.push("missing_market_price");

  return {
    id,
    uploadId,
    rowIndex,
    productName: productName || "(unknown)",
    number: number || null,
    condition: condition || null,
    rawMarketPrice,
    roundedPrintPrice,
    addToQuantity,
    normalizedMatchKey: matchKey,
    sourceProductId: sourceProductId || null,
    sourceTcgplayerId: sourceTcgplayerId || null,
    sourceProductLine: sourceProductLine || null,
    sourceSetName: sourceSetName || null,
    sourcePrinting: sourcePrinting || null,
    sourceRarity: sourceRarity || null,
    sourcePayload: JSON.stringify({ ...raw, _photoUrl: photoUrl || null }),
    parseFlags: flags.length ? JSON.stringify(flags) : null,
    matchStatus: "pending",
    matchedInventoryId: null,
  };
}

// ─── repricing threshold check ───────────────────────────────────────────────
const CONDITION_SHORT: Record<string, string> = {
  "Near Mint": "NM",
  "Lightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
  "Damaged": "DMG",
};

function checkRepricingThreshold(
  newPrice: number, oldPrice: number,
  thresholds: { over100Pct: number; mid50to100Pct: number; under50Pct: number }
): { triggered: boolean; rule: string } {
  if (!oldPrice || oldPrice === 0) return { triggered: false, rule: "" };
  const pct = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
  if (newPrice > 100 && pct > thresholds.over100Pct)
    return { triggered: true, rule: `>$100 / >${thresholds.over100Pct}%` };
  if (newPrice >= 50 && newPrice <= 100 && pct > thresholds.mid50to100Pct)
    return { triggered: true, rule: `$50-$100 / >${thresholds.mid50to100Pct}%` };
  if (newPrice < 50 && pct > thresholds.under50Pct)
    return { triggered: true, rule: `<$50 / >${thresholds.under50Pct}%` };
  return { triggered: false, rule: "" };
}

// ─── export CSV ──────────────────────────────────────────────────────────────
function buildNiimbotCsv(items: any[]): string {
  const headers = ["Condition", "Current Market Price", "Product Name", "Number", "Internal ID"];
  const rows = items.map(item => [
    `"${CONDITION_SHORT[item.condition] || (item.condition || "").replace(/"/g, '""')}"`,
    `"$${item.roundedPrintPrice || 0}"`,
    `"${(item.productName || "").replace(/"/g, '""')}"`,
    `"${(item.number || "").replace(/"/g, '""')}"`,
    `"${item.inventoryItemId || item.id || ""}"`,
  ].join(","));
  return [headers.join(","), ...rows].join("\n");
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "bonsaicollects@gmail.com";

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = auth.slice(7);
  const user = await verifyToken(token);
  if (!user) return res.status(401).json({ error: "Invalid token" });
  (req as any).user = user;
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = auth.slice(7);
  const user = await verifyToken(token);
  if (!user) return res.status(401).json({ error: "Invalid token" });
  if (user.email !== ADMIN_EMAIL) return res.status(403).json({ error: "Forbidden — admin only" });
  (req as any).user = user;
  next();
}

export function registerRoutes(httpServer: Server, app: Express) {
  // ── auth: validate invite code ────────────────────────────────────────────
  app.post("/api/auth/validate-invite", async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code required" });
    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("used", false)
      .single();
    if (error || !data) return res.status(400).json({ error: "Invalid or already used invite code" });
    res.json({ valid: true });
  });

  // ── auth: mark invite code used after signup ──────────────────────────────
  app.post("/api/auth/use-invite", async (req, res) => {
    const { code, userId } = req.body;
    if (!code || !userId) return res.status(400).json({ error: "Missing params" });
    const { error } = await supabaseAdmin
      .from("invite_codes")
      .update({ used: true, used_by: userId, used_at: new Date().toISOString() })
      .eq("code", code.trim().toUpperCase())
      .eq("used", false);
    if (error) return res.status(400).json({ error: "Could not redeem code" });
    res.json({ ok: true });
  });

  // ── admin: generate invite codes ─────────────────────────────────────────
  app.post("/api/admin/invite-codes", requireAdmin, async (req: any, res) => {
    const { count = 5, note = "" } = req.body;
    const codes = Array.from({ length: Math.min(count, 50) }, () => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    });
    const rows = codes.map(code => ({ code, note, used: false }));
    const { data, error } = await supabaseAdmin.from("invite_codes").insert(rows).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ codes: data });
  });

  // ── admin: list invite codes ──────────────────────────────────────────────
  app.get("/api/admin/invite-codes", requireAdmin, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── protect all remaining /api/* routes ───────────────────────────────────
  app.use("/api", requireAuth);

  // ── dashboard stats ───────────────────────────────────────────────────────
  app.get("/api/dashboard/stats", async (req: any, res) => {
    try {
      const stats = await storage.getDashboardStats(req.user.id);
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── uploads ───────────────────────────────────────────────────────────────
  app.get("/api/uploads", async (req: any, res) => {
    res.json(await storage.listUploads(req.user.id));
  });

  app.get("/api/uploads/:id", async (req: any, res) => {
    const u = await storage.getUpload(req.user.id, req.params.id);
    if (!u) return res.status(404).json({ error: "Not found" });
    res.json(u);
  });

  app.get("/api/uploads/:id/rows", async (req: any, res) => {
    res.json(await storage.getParsedRowsByUpload(req.user.id, req.params.id));
  });

  app.get("/api/uploads/:id/review", async (req: any, res) => {
    const review = await storage.getMergeReviewByUpload(req.user.id, req.params.id);
    if (!review) return res.status(404).json({ error: "Not found" });
    res.json(review);
  });

  // Upload CSV
  app.post("/api/uploads", upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const userId = req.user.id;
      const { game = "pokemon", sourceType = "tcgplayer" } = req.body;
      const content = req.file.buffer.toString("utf-8");
      const rawRows = parseCSV(content);

      const uploadId = crypto.randomUUID();
      const now = new Date().toISOString();

      const newUpload = await storage.createUpload(userId, {
        id: uploadId,
        sourceType,
        game,
        originalFilename: req.file.originalname,
        uploadedAt: now,
        rawFileContent: content,
        totalRows: rawRows.length,
        parseStatus: "parsed",
        summaryJson: null,
      });

      const parsedRowData = rawRows
        .filter(r => Object.values(r).some(v => v))
        .map((r, i) => mapCsvRow(r, game, i, uploadId));

      await storage.createParsedRows(userId, parsedRowData);

      const validRows = parsedRowData.filter(r => r.productName !== "(unknown)");
      const newItems: any[] = [];
      const matchedItems: any[] = [];
      const ambiguousItems: any[] = [];
      const repricingCandidates: any[] = [];

      for (const row of validRows) {
        let existingItem = await storage.getInventoryItemByExternalIds(userId, row.sourceProductId || undefined, row.sourceTcgplayerId || undefined);
        if (!existingItem && row.normalizedMatchKey) {
          existingItem = await storage.getInventoryItemByMatchKey(userId, row.normalizedMatchKey);
        }

        if (!existingItem) {
          newItems.push(row);
        } else {
          const prevPrice = existingItem.currentRawMarketPrice;
          const newPrice = row.rawMarketPrice;
          if (prevPrice && newPrice) {
            const thr = await storage.getRepricingThresholds(userId);
            const { triggered, rule } = checkRepricingThreshold(newPrice, prevPrice, thr);
            if (triggered) repricingCandidates.push({ row, existingItem, rule });
          }
          matchedItems.push({ row, existingItem });
        }
      }

      const reviewPayload = JSON.stringify({
        newItems: newItems.map(r => ({ id: r.id, productName: r.productName, number: r.number, condition: r.condition, rawMarketPrice: r.rawMarketPrice, roundedPrintPrice: r.roundedPrintPrice, addToQuantity: r.addToQuantity })),
        matchedItems: matchedItems.map(({ row, existingItem }) => ({ rowId: row.id, productName: row.productName, number: row.number, condition: row.condition, rawMarketPrice: row.rawMarketPrice, roundedPrintPrice: row.roundedPrintPrice, addToQuantity: row.addToQuantity, existingId: existingItem.id, existingQty: existingItem.currentQuantity, existingPrice: existingItem.currentRawMarketPrice })),
        ambiguousItems,
        repricingCandidates: repricingCandidates.map(({ row, existingItem, rule }) => ({ rowId: row.id, productName: row.productName, priorPrice: existingItem.currentRawMarketPrice, newPrice: row.rawMarketPrice, roundedPrintPrice: row.roundedPrintPrice, percentChange: existingItem.currentRawMarketPrice ? ((row.rawMarketPrice - existingItem.currentRawMarketPrice) / existingItem.currentRawMarketPrice * 100).toFixed(1) : null, rule })),
      });

      const review = await storage.createMergeReview(userId, {
        uploadId,
        status: "pending",
        newItemCount: newItems.length,
        matchedItemCount: matchedItems.length,
        repricingCandidateCount: repricingCandidates.length,
        duplicateWarningCount: ambiguousItems.length,
        reviewPayload,
        reviewedAt: null,
        reviewedBy: null,
      });

      const summary = { newItems: newItems.length, matchedItems: matchedItems.length, repricingCandidates: repricingCandidates.length, ambiguousItems: ambiguousItems.length, totalParsed: validRows.length, totalRaw: rawRows.length };
      await storage.updateUpload(userId, uploadId, { summaryJson: JSON.stringify(summary), parseStatus: "parsed" });

      res.json({ upload: newUpload, review, summary });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Approve merge
  app.post("/api/uploads/:id/approve", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const uploadId = req.params.id;
      const review = await storage.getMergeReviewByUpload(userId, uploadId);
      if (!review) return res.status(404).json({ error: "Review not found" });
      if (review.status !== "pending") return res.status(400).json({ error: "Already processed" });

      const payload = JSON.parse(review.reviewPayload || "{}");
      const now = new Date().toISOString();
      const uploadRecord = await storage.getUpload(userId, uploadId);
      const game = uploadRecord?.game || "pokemon";

      for (const row of (payload.newItems || [])) {
        const allParsed = await storage.getParsedRowsByUpload(userId, uploadId);
        const parsedRow = allParsed.find(r => r.id === row.id);
        const matchMeta = {
          sourceProductId: parsedRow?.sourceProductId,
          sourceTcgplayerId: parsedRow?.sourceTcgplayerId,
          sourceSetName: parsedRow?.sourceSetName,
          sourcePrinting: parsedRow?.sourcePrinting,
          sourceProductLine: parsedRow?.sourceProductLine,
          sourceRarity: parsedRow?.sourceRarity,
        };
        let photoUrl: string | null = null;
        try {
          const rawPayload = JSON.parse(parsedRow?.sourcePayload || "{}");
          photoUrl = rawPayload._photoUrl || rawPayload["Photo URL"] || null;
        } catch {}

        const item = await storage.createInventoryItem(userId, {
          game,
          productName: row.productName,
          number: row.number || null,
          condition: row.condition || null,
          currentQuantity: row.addToQuantity || 1,
          currentRawMarketPrice: row.rawMarketPrice,
          currentRoundedPrintPrice: row.roundedPrintPrice,
          latestUploadId: uploadId,
          normalizedMatchKey: parsedRow?.normalizedMatchKey || null,
          matchMetadataJson: JSON.stringify(matchMeta),
          photoUrl,
          firstSeenAt: now,
          lastSeenAt: now,
          status: "active",
        });

        if (row.rawMarketPrice) {
          await storage.createPriceSnapshot(userId, {
            inventoryItemId: item.id,
            uploadId,
            snapshotDate: now,
            rawMarketPrice: row.rawMarketPrice,
            roundedPrintPrice: row.roundedPrintPrice || 0,
            quantityAfterMerge: row.addToQuantity || 1,
          });
        }

        await storage.createLabelQueueItem(userId, {
          inventoryItemId: item.id,
          queueType: "new",
          sourceUploadId: uploadId,
          priorRawPrice: null,
          currentRawPrice: row.rawMarketPrice,
          roundedPrintPrice: row.roundedPrintPrice,
          percentChange: null,
          thresholdRule: null,
          isSelectedForExport: true,
          exportStatus: "pending",
          createdAt: now,
          reviewedAt: null,
        });

        if (parsedRow) {
          await storage.updateParsedRow(userId, parsedRow.id, { matchStatus: "new", matchedInventoryId: item.id });
        }
      }

      for (const match of (payload.matchedItems || [])) {
        const existingItem = await storage.getInventoryItem(userId, match.existingId);
        if (!existingItem) continue;
        const newQty = existingItem.currentQuantity + (match.addToQuantity || 1);
        await storage.updateInventoryItem(userId, existingItem.id, {
          currentQuantity: newQty,
          currentRawMarketPrice: match.rawMarketPrice,
          currentRoundedPrintPrice: match.roundedPrintPrice,
          latestUploadId: uploadId,
          lastSeenAt: now,
        });
        if (match.rawMarketPrice) {
          await storage.createPriceSnapshot(userId, {
            inventoryItemId: existingItem.id,
            uploadId,
            snapshotDate: now,
            rawMarketPrice: match.rawMarketPrice,
            roundedPrintPrice: match.roundedPrintPrice || 0,
            quantityAfterMerge: newQty,
          });
        }
        const allParsed = await storage.getParsedRowsByUpload(userId, uploadId);
        const parsedRow = allParsed.find(r => r.id === match.rowId);
        if (parsedRow) {
          await storage.updateParsedRow(userId, parsedRow.id, { matchStatus: "matched", matchedInventoryId: existingItem.id });
        }
      }

      for (const candidate of (payload.repricingCandidates || [])) {
        const matchedEntry = (payload.matchedItems || []).find((m: any) => m.rowId === candidate.rowId);
        const invItem = matchedEntry ? await storage.getInventoryItem(userId, matchedEntry.existingId) : null;
        if (!invItem) continue;
        await storage.createLabelQueueItem(userId, {
          inventoryItemId: invItem.id,
          queueType: "reprice",
          sourceUploadId: uploadId,
          priorRawPrice: candidate.priorPrice,
          currentRawPrice: candidate.newPrice,
          roundedPrintPrice: candidate.roundedPrintPrice,
          percentChange: parseFloat(candidate.percentChange) || null,
          thresholdRule: candidate.rule,
          isSelectedForExport: true,
          exportStatus: "pending",
          createdAt: now,
          reviewedAt: null,
        });
      }

      await storage.updateMergeReview(userId, review.id, { status: "approved", reviewedAt: now });
      await storage.updateUpload(userId, uploadId, { parseStatus: "merged" });

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Reject merge
  app.post("/api/uploads/:id/reject", async (req: any, res) => {
    const userId = req.user.id;
    const review = await storage.getMergeReviewByUpload(userId, req.params.id);
    if (!review) return res.status(404).json({ error: "Not found" });
    await storage.updateMergeReview(userId, review.id, { status: "rejected", reviewedAt: new Date().toISOString() });
    await storage.updateUpload(userId, req.params.id, { parseStatus: "rejected" as any });
    res.json({ success: true });
  });

  // ── inventory ─────────────────────────────────────────────────────────────
  app.get("/api/inventory", async (req: any, res) => {
    const { game, condition, status, search } = req.query as Record<string, string>;
    const items = await storage.listInventoryItems(req.user.id, { game, condition, status, search });
    const enriched = items.map(item => {
      let tcgplayerUrl: string | null = null;
      try {
        const meta = JSON.parse(item.matchMetadataJson || "{}");
        if (meta.sourceProductId) tcgplayerUrl = `https://www.tcgplayer.com/product/${meta.sourceProductId}`;
      } catch {}
      return { ...item, tcgplayerUrl };
    });
    res.json(enriched);
  });

  app.get("/api/inventory/:id", async (req: any, res) => {
    const item = await storage.getInventoryItem(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });

  app.patch("/api/inventory/:id", async (req: any, res) => {
    const item = await storage.getInventoryItem(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: "Not found" });
    const allowed = ["currentQuantity", "currentRawMarketPrice", "currentRoundedPrintPrice", "condition", "notes"];
    const patch: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.currentRawMarketPrice !== undefined) {
      patch.currentRoundedPrintPrice = Math.ceil(patch.currentRawMarketPrice);
    }
    const updated = await storage.updateInventoryItem(req.user.id, req.params.id, patch);
    res.json(updated);
  });

  app.get("/api/inventory/:id/snapshots", async (req: any, res) => {
    res.json(await storage.getSnapshotsByItem(req.user.id, req.params.id));
  });

  // ── label queue ───────────────────────────────────────────────────────────
  app.get("/api/labels/new", async (req: any, res) => {
    const items = await storage.listLabelQueueItems(req.user.id, "new");
    const enriched = await Promise.all(items.map(async item => {
      const inv = await storage.getInventoryItem(req.user.id, item.inventoryItemId);
      return { ...item, productName: inv?.productName, number: inv?.number, condition: inv?.condition, game: inv?.game };
    }));
    res.json(enriched);
  });

  app.get("/api/labels/reprice", async (req: any, res) => {
    const items = await storage.listLabelQueueItems(req.user.id, "reprice");
    const enriched = await Promise.all(items.map(async item => {
      const inv = await storage.getInventoryItem(req.user.id, item.inventoryItemId);
      return { ...item, productName: inv?.productName, number: inv?.number, condition: inv?.condition, game: inv?.game };
    }));
    res.json(enriched);
  });

  app.patch("/api/labels/:id", async (req: any, res) => {
    const updated = await storage.updateLabelQueueItem(req.user.id, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.post("/api/labels/export", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { ids, queueType } = req.body as { ids: string[]; queueType: string };
      const allItems = await storage.listLabelQueueItems(userId, queueType);
      const selectedItems = allItems.filter(i => ids.includes(i.id));
      const enriched = await Promise.all(selectedItems.map(async item => {
        const inv = await storage.getInventoryItem(userId, item.inventoryItemId);
        return { id: item.id, inventoryItemId: item.inventoryItemId, condition: inv?.condition || "", roundedPrintPrice: item.roundedPrintPrice, productName: inv?.productName || "", number: inv?.number || "" };
      }));
      const csv = buildNiimbotCsv(enriched);
      await storage.bulkUpdateLabelQueueExportStatus(userId, ids, "exported");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="niimbot-labels-${queueType}-${Date.now()}.csv"`);
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── shows ─────────────────────────────────────────────────────────────────
  app.get("/api/shows", async (req: any, res) => {
    res.json(await storage.listShowLedgers(req.user.id));
  });

  app.get("/api/shows/:id", async (req: any, res) => {
    const show = await storage.getShowLedger(req.user.id, req.params.id);
    if (!show) return res.status(404).json({ error: "Not found" });
    res.json(show);
  });

  app.post("/api/shows", async (req: any, res) => {
    try {
      const show = await storage.createShowLedger(req.user.id, req.body);
      res.json(show);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/shows/:id", async (req: any, res) => {
    const updated = await storage.updateShowLedger(req.user.id, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/shows/:id", async (req: any, res) => {
    await storage.deleteShowLedger(req.user.id, req.params.id);
    res.json({ success: true });
  });

  // ── price snapshot history & movers ──────────────────────────────────────
  app.get("/api/snapshots/history", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const items = await storage.listInventoryItems(userId);
      const allSnapshots = (await Promise.all(
        items.map(item => storage.getSnapshotsByItem(userId, item.id).then(snaps => snaps.map(s => ({ ...s, qty: s.quantityAfterMerge }))))
      )).flat();
      const byDate: Record<string, number> = {};
      for (const snap of allSnapshots) {
        const day = snap.snapshotDate.slice(0, 10);
        byDate[day] = (byDate[day] || 0) + snap.rawMarketPrice * snap.qty;
      }
      const result = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/snapshots/movers", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const items = await storage.listInventoryItems(userId);
      const movers: any[] = [];
      for (const item of items) {
        const snaps = (await storage.getSnapshotsByItem(userId, item.id)).filter(s => s.snapshotDate >= oneWeekAgo);
        if (snaps.length < 2) continue;
        const oldest = snaps[snaps.length - 1];
        const newest = snaps[0];
        if (!oldest.rawMarketPrice) continue;
        const pct = ((newest.rawMarketPrice - oldest.rawMarketPrice) / oldest.rawMarketPrice) * 100;
        movers.push({ id: item.id, productName: item.productName, number: item.number, condition: item.condition, oldPrice: oldest.rawMarketPrice, newPrice: newest.rawMarketPrice, pctChange: Math.round(pct * 10) / 10 });
      }
      movers.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
      res.json(movers.slice(0, 10));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── settings ──────────────────────────────────────────────────────────────
  app.get("/api/settings/thresholds", async (req: any, res) => {
    res.json(await storage.getRepricingThresholds(req.user.id));
  });

  app.put("/api/settings/thresholds", async (req: any, res) => {
    try {
      const { over100Pct, mid50to100Pct, under50Pct } = req.body;
      if (typeof over100Pct !== "number" || over100Pct <= 0 || typeof mid50to100Pct !== "number" || mid50to100Pct <= 0 || typeof under50Pct !== "number" || under50Pct <= 0) {
        return res.status(400).json({ error: "All thresholds must be positive numbers" });
      }
      await storage.setRepricingThresholds(req.user.id, { over100Pct, mid50to100Pct, under50Pct });
      res.json(await storage.getRepricingThresholds(req.user.id));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/settings/presets", (_req, res) => {
    res.json({
      tcgplayer: { productName: ["Product Name"], number: ["Number"], condition: ["Condition"], marketPrice: ["TCG Market Price", "Market Price"], quantity: ["Add to Quantity", "Quantity"], productId: ["Product ID"], tcgplayerId: ["TCGplayer ID"], setName: ["Set Name"], printing: ["Printing"], rarity: ["Rarity"], productLine: ["Product Line"] },
      generic: { productName: ["Name", "Card Name"], number: ["Card Number", "Collector Number"], condition: ["Condition", "Cond"], marketPrice: ["Price", "Market Price"], quantity: ["Qty", "Quantity"] },
    });
  });
}
