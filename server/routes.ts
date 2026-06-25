import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import { supabaseAdmin, verifyToken } from "./supabase";

// ── File validation ───────────────────────────────────────────────────────────
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

// ── CSV parsing ───────────────────────────────────────────────────────────────
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
  return price && !isNaN(price) ? Math.ceil(price) : 0;
}

function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim();
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

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length < 2) throw new Error("The CSV is empty or contains only a header row with no data.");

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const h of headers) {
    const key = h.toLowerCase();
    seen.has(key) ? duplicates.push(h) : seen.add(key);
  }
  if (duplicates.length > 0) {
    throw new Error(
      `The CSV contains duplicate column headers: ${duplicates.map(d => `"${d}"`).join(", ")}. ` +
      `Please remove duplicate columns and re-upload.`
    );
  }

  return lines
    .slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] || "").trim().replace(/^"|"$/g, "");
      });
      return row;
    });
}

function mapCsvRow(raw: Record<string, string>, game: string, rowIndex: number, uploadId: string): any {
  const k = (...candidates: string[]): string => {
    for (const c of candidates) {
      const found = Object.keys(raw).find(key => key.toLowerCase() === c.toLowerCase());
      if (found && raw[found]) return raw[found];
    }
    return "";
  };

  const productName     = k("Product Name", "Name", "Card Name", "product_name");
  const number          = k("Number", "Card Number", "Collector Number", "number");
  const condition       = normalizeCondition(k("Condition", "condition", "Cond"));
  const rawMarketPrice  = parseFloat(k("TCG Market Price", "Market Price", "TCGplayer Market Price", "Price", "market_price").replace(/[^0-9.]/g, "")) || null;
  const addToQuantity   = parseInt(k("Add to Quantity", "add_to_quantity")) || parseInt(k("Total Quantity", "total_quantity", "Quantity", "Qty", "quantity")) || 1;
  const sourceProductId     = k("Product ID", "product_id") || null;
  const sourceTcgplayerId   = k("TCGplayer Id", "TCGplayer ID", "tcgplayer_id", "TCGplayerId") || null;
  const sourceProductLine   = k("Product Line", "product_line", "Game") || null;
  const sourceSetName       = k("Set Name", "set_name", "Set", "Expansion") || null;
  const sourcePrinting      = k("Printing", "printing", "Foil", "Edition") || null;
  const sourceRarity        = k("Rarity", "rarity") || null;
  const photoUrl            = k("Photo URL", "photo_url", "Image URL") || null;

  const flags: string[] = [];
  if (!productName) flags.push("missing_product_name");
  if (!rawMarketPrice) flags.push("missing_market_price");

  return {
    id: crypto.randomUUID(),
    uploadId,
    rowIndex,
    productName: productName || "(unknown)",
    number: number || null,
    condition: condition || null,
    rawMarketPrice,
    roundedPrintPrice: ceilPrice(rawMarketPrice),
    addToQuantity,
    normalizedMatchKey: buildMatchKey(productName, number, condition, sourcePrinting, sourceSetName, game),
    sourceProductId,
    sourceTcgplayerId,
    sourceProductLine,
    sourceSetName,
    sourcePrinting,
    sourceRarity,
    sourcePayload: JSON.stringify({ ...raw, _photoUrl: photoUrl }),
    parseFlags: flags.length ? JSON.stringify(flags) : null,
    matchStatus: "pending",
    matchedInventoryId: null,
  };
}

// ── Repricing ─────────────────────────────────────────────────────────────────
const CONDITION_SHORT: Record<string, string> = {
  "Near Mint": "NM",
  "Lightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
  "Damaged": "DMG",
};

function checkRepricingThreshold(
  newPrice: number,
  oldPrice: number,
  thresholds: { over100Pct: number; mid50to100Pct: number; under50Pct: number }
): { triggered: boolean; rule: string } {
  if (!oldPrice) return { triggered: false, rule: "" };
  const pct = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
  if (newPrice > 100 && pct > thresholds.over100Pct)
    return { triggered: true, rule: `>$100 / >${thresholds.over100Pct}%` };
  if (newPrice >= 50 && newPrice <= 100 && pct > thresholds.mid50to100Pct)
    return { triggered: true, rule: `$50-$100 / >${thresholds.mid50to100Pct}%` };
  if (newPrice < 50 && pct > thresholds.under50Pct)
    return { triggered: true, rule: `<$50 / >${thresholds.under50Pct}%` };
  return { triggered: false, rule: "" };
}

// ── Niimbot CSV export ────────────────────────────────────────────────────────
function buildNiimbotCsv(items: any[]): string {
  const headers = ["Condition", "Current Market Price", "Product Name", "Number", "Internal ID"];
  const rows = items.flatMap(item => {
    const qty = Math.max(1, parseInt(item.quantity) || 1);
    const row = [
      `"${CONDITION_SHORT[item.condition] || (item.condition || "").replace(/"/g, '""')}"`,
      `"$${item.roundedPrintPrice || 0}"`,
      `"${(item.productName || "").replace(/"/g, '""')}"`,
      `"${(item.number || "").replace(/"/g, '""')}"`,
      `"${item.inventoryItemId || item.id || ""}"`,
    ].join(",");
    return Array(qty).fill(row);
  });
  return [headers.join(","), ...rows].join("\n");
}

// ── Auth ──────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  console.warn("[WARNING] ADMIN_EMAIL is not set. Admin routes will be inaccessible.");
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const user = await verifyToken(token);
  if (!user) return res.status(401).json({ error: "Invalid token" });
  (req as any).user = user;
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const user = (req as any).user;
    if (!ADMIN_EMAIL || user.email !== ADMIN_EMAIL)
      return res.status(403).json({ error: "Forbidden — admin only" });
    next();
  });
}

const useInviteAttempts = new Map<string, number[]>();
function useInviteRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const attempts = (useInviteAttempts.get(ip) || []).filter(t => t > now - window);
  if (attempts.length >= 5) return true;
  useInviteAttempts.set(ip, [...attempts, now]);
  return false;
}

// ── Shared helpers ────────────────────────────────────────────────────────────
async function enrichLabelItems(userId: string, queueType: string) {
  const [items, allInventory] = await Promise.all([
    storage.listLabelQueueItems(userId, queueType),
    storage.listInventoryItems(userId),
  ]);
  const invMap = new Map(allInventory.map(i => [i.id, i]));
  return items.map(item => {
    const inv = invMap.get(item.inventoryItemId);
    return { ...item, productName: inv?.productName, number: inv?.number, condition: inv?.condition, game: inv?.game };
  });
}

async function resolveInventoryItem(userId: string, id: string, res: Response) {
  const item = await storage.getInventoryItem(userId, id);
  if (!item) res.status(404).json({ error: "Not found" });
  return item;
}

// ── Routes ────────────────────────────────────────────────────────────────────
export function registerRoutes(httpServer: Server, app: Express) {

  // Public auth routes
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

  app.post("/api/auth/use-invite", async (req, res) => {
    const ip = ((req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    if (useInviteRateLimited(ip)) return res.status(429).json({ error: "Too many requests. Please try again later." });

    const token = req.headers.authorization?.slice(7);
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const user = await verifyToken(token);
    if (!user) return res.status(401).json({ error: "Invalid or expired token" });

    const { code, userId } = req.body;
    if (!code || !userId) return res.status(400).json({ error: "Missing params" });
    if (userId !== user.id) return res.status(403).json({ error: "Forbidden — userId mismatch" });

    const { error } = await supabaseAdmin
      .from("invite_codes")
      .update({ used: true, used_by: userId, used_at: new Date().toISOString() })
      .eq("code", code.trim().toUpperCase())
      .eq("used", false);
    if (error) return res.status(400).json({ error: "Could not redeem code" });
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = req.headers.authorization?.slice(7);
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const user = await verifyToken(token);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    res.json({ id: user.id, email: user.email, isAdmin: Boolean(ADMIN_EMAIL && user.email === ADMIN_EMAIL) });
  });

  // Admin routes
  app.post("/api/admin/invite-codes", requireAdmin, async (req: any, res) => {
    const { count = 5, note = "" } = req.body;
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codes = Array.from({ length: Math.min(count, 50) }, () =>
      Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
    );
    const { data, error } = await supabaseAdmin.from("invite_codes").insert(codes.map(code => ({ code, note, used: false }))).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ codes: data });
  });

  app.get("/api/admin/invite-codes", requireAdmin, async (_req, res) => {
    const { data, error } = await supabaseAdmin.from("invite_codes").select("*").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // All routes below require auth
  app.use("/api", requireAuth);

  // Dashboard
  app.get("/api/dashboard/stats", async (req: any, res) => {
    try {
      res.json(await storage.getDashboardStats(req.user.id));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Uploads
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
      const { game = "pokemon", sourceType = "tcgplayer" } = req.body;

      const isXlsx =
        req.file.originalname.toLowerCase().endsWith(".xlsx") ||
        req.file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
        return res.status(400).json({ error: e.message });
      }

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

      const validRows = parsedRowData.filter(r => r.productName !== "(unknown)");
      const newItems: any[] = [];
      const matchedItems: any[] = [];
      const ambiguousItems: any[] = [];
      const repricingCandidates: any[] = [];

      for (const row of validRows) {
        let existing = await storage.getInventoryItemByExternalIds(userId, row.sourceProductId ?? undefined, row.sourceTcgplayerId ?? undefined);
        if (!existing && row.normalizedMatchKey) {
          existing = await storage.getInventoryItemByMatchKey(userId, row.normalizedMatchKey);
        }

        if (!existing) {
          newItems.push(row);
        } else {
          const csvQty = row.addToQuantity || 1;
          const existingQty = existing.currentQuantity || 0;
          const qtyDelta = csvQty !== existingQty ? csvQty - existingQty : 0;

          if (existing.currentRawMarketPrice && row.rawMarketPrice) {
            const thr = await storage.getRepricingThresholds(userId);
            const { triggered, rule } = checkRepricingThreshold(row.rawMarketPrice, existing.currentRawMarketPrice, thr);
            if (triggered) repricingCandidates.push({ row, existingItem: existing, rule, qtyDelta, csvQty, existingQty });
          }
          matchedItems.push({ row, existingItem: existing, qtyDelta, csvQty, existingQty });
        }
      }

      const matchedNoChangeCount = matchedItems.filter(m => m.qtyDelta === 0).length;

      const reviewPayload = JSON.stringify({
        newItems: newItems.map(r => ({
          id: r.id, productName: r.productName, number: r.number,
          condition: r.condition, rawMarketPrice: r.rawMarketPrice,
          roundedPrintPrice: r.roundedPrintPrice, addToQuantity: r.addToQuantity,
        })),
        matchedItems: matchedItems.map(({ row, existingItem, qtyDelta, csvQty, existingQty }) => ({
          rowId: row.id, productName: row.productName, number: row.number,
          condition: row.condition, rawMarketPrice: row.rawMarketPrice,
          roundedPrintPrice: row.roundedPrintPrice, csvQty, existingQty, qtyDelta,
          existingId: existingItem.id, existingPrice: existingItem.currentRawMarketPrice,
        })),
        ambiguousItems,
        repricingCandidates: repricingCandidates.map(({ row, existingItem, rule, csvQty, existingQty }) => ({
          rowId: row.id, productName: row.productName,
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

      res.json({ upload: newUpload, review, summary });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/uploads/:id/approve", async (req: any, res) => {
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
      const game = uploadRecord?.game || "pokemon";

      const allParsed = await storage.getParsedRowsByUpload(userId, uploadId);
      const parsedById = new Map(allParsed.map(r => [r.id, r]));

      const rpcNewItems = (payload.newItems || []).map((row: any) => {
        const parsed = parsedById.get(row.id);
        let photoUrl: string | null = null;
        try {
          const src = JSON.parse(parsed?.sourcePayload || "{}");
          photoUrl = src._photoUrl || src["Photo URL"] || null;
        } catch {}
        return {
          inventoryItemId: crypto.randomUUID(),
          parsedRowId: parsed?.id ?? null,
          game,
          productName: row.productName,
          number: row.number ?? null,
          condition: row.condition ?? null,
          addToQuantity: row.addToQuantity ?? 1,
          rawMarketPrice: row.rawMarketPrice ?? null,
          roundedPrintPrice: row.roundedPrintPrice ?? null,
          normalizedMatchKey: parsed?.normalizedMatchKey ?? null,
          matchMetadataJson: JSON.stringify({
            sourceProductId: parsed?.sourceProductId ?? null,
            sourceTcgplayerId: parsed?.sourceTcgplayerId ?? null,
            sourceSetName: parsed?.sourceSetName ?? null,
            sourcePrinting: parsed?.sourcePrinting ?? null,
            sourceProductLine: parsed?.sourceProductLine ?? null,
            sourceRarity: parsed?.sourceRarity ?? null,
          }),
          sourceProductId: parsed?.sourceProductId ?? null,
          sourceTcgplayerId: parsed?.sourceTcgplayerId ?? null,
          photoUrl,
        };
      });

      const rpcMatchedItems = (payload.matchedItems || []).map((match: any) => ({
        parsedRowId: parsedById.get(match.rowId)?.id ?? null,
        existingId: match.existingId,
        newQty: overrides[match.rowId]?.csvQty ?? match.csvQty ?? match.existingQty ?? 0,
        rawMarketPrice: match.rawMarketPrice ?? null,
        roundedPrintPrice: match.roundedPrintPrice ?? null,
      }));

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

  // DELETE upload — DB ON DELETE CASCADE handles parsed_rows, merge_reviews, price_snapshots.
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

  // Inventory
  app.get("/api/inventory", async (req: any, res) => {
    const { game, condition, status, search } = req.query as Record<string, string>;
    const items = await storage.listInventoryItems(req.user.id, { game, condition, status, search });
    res.json(items.map(item => {
      let tcgplayerUrl: string | null = null;
      try {
        const meta = JSON.parse(item.matchMetadataJson || "{}");
        if (meta.sourceProductId) tcgplayerUrl = `https://www.tcgplayer.com/product/${meta.sourceProductId}`;
      } catch {}
      return { ...item, tcgplayerUrl };
    }));
  });

  // Export full active inventory as an .xlsx file — defined before /:id so the
  // param route doesn't shadow it.
  app.get("/api/inventory/export", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const items = await storage.listInventoryItems(userId);

      const rows = items.map(item => ({
        "Product Name": item.productName,
        "Number": item.number ?? "",
        "Condition": item.condition ?? "",
        "Game": item.game,
        "Quantity": item.currentQuantity,
        "Market Price": item.currentRawMarketPrice ?? "",
        "Print Price": item.currentRoundedPrintPrice ?? "",
        "Status": item.status,
        "First Seen": item.firstSeenAt,
        "Last Seen": item.lastSeenAt,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const timestamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="cardvault-inventory-${timestamp}.xlsx"`);
      res.send(buffer);
    } catch (e: any) {
      console.error("[export inventory]", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/inventory/:id", async (req: any, res) => {
    const item = await resolveInventoryItem(req.user.id, req.params.id, res);
    if (item) res.json(item);
  });

  app.patch("/api/inventory/:id", async (req: any, res) => {
    const item = await resolveInventoryItem(req.user.id, req.params.id, res);
    if (!item) return;

    const allowed = ["currentQuantity", "currentRawMarketPrice", "currentRoundedPrintPrice", "condition", "notes"];
    const patch: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.currentRawMarketPrice !== undefined) {
      patch.currentRoundedPrintPrice = Math.ceil(patch.currentRawMarketPrice);
    }
    res.json(await storage.updateInventoryItem(req.user.id, req.params.id, patch));
  });

  // Bulk delete — defined before /:id so "bulk" isn't captured as an :id param.
  app.delete("/api/inventory/bulk", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids)) return res.status(400).json({ error: "ids must be an array" });

      await Promise.all(ids.map(id => storage.deleteInventoryItem(userId, id)));

      res.json({ success: true });
    } catch (e: any) {
      console.error("[bulk delete inventory]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE inventory item — storage.deleteInventoryItem handles the cascade
  app.delete("/api/inventory/:id", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const itemId = req.params.id;

      const item = await storage.getInventoryItem(userId, itemId);
      if (!item) return res.status(404).json({ error: "Not found" });

      await storage.deleteInventoryItem(userId, itemId);

      res.json({ success: true });
    } catch (e: any) {
      console.error("[delete inventory]", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/inventory/:id/snapshots", async (req: any, res) => {
    res.json(await storage.getSnapshotsByItem(req.user.id, req.params.id));
  });

  // Labels
  app.get("/api/labels/new", async (req: any, res) => {
    try { res.json(await enrichLabelItems(req.user.id, "new")); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/labels/reprice", async (req: any, res) => {
    try { res.json(await enrichLabelItems(req.user.id, "reprice")); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
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
      const enriched = await Promise.all(
        allItems
          .filter(i => ids.includes(i.id))
          .map(async item => {
            const inv = await storage.getInventoryItem(userId, item.inventoryItemId);
            return {
              id: item.id,
              inventoryItemId: item.inventoryItemId,
              condition: inv?.condition || "",
              roundedPrintPrice: item.roundedPrintPrice,
              productName: inv?.productName || "",
              number: inv?.number || "",
              quantity: inv?.currentQuantity || 1,
            };
          })
      );
      await storage.bulkUpdateLabelQueueExportStatus(userId, ids, "exported");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="niimbot-labels-${queueType}-${Date.now()}.csv"`);
      res.send(buildNiimbotCsv(enriched));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Shows
  app.get("/api/shows", async (req: any, res) => {
    res.json(await storage.listShowLedgers(req.user.id));
  });

  app.get("/api/shows/:id", async (req: any, res) => {
    const show = await storage.getShowLedger(req.user.id, req.params.id);
    if (!show) return res.status(404).json({ error: "Not found" });
    res.json(show);
  });

  app.post("/api/shows", async (req: any, res) => {
    try { res.json(await storage.createShowLedger(req.user.id, req.body)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
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

  // Snapshots
  app.get("/api/snapshots/history", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 90, 365);
      const items = await storage.listInventoryItems(userId);
      const allSnaps = (await Promise.all(
        items.map(item => storage.getSnapshotsByItem(userId, item.id).then(snaps => snaps.map(s => ({ ...s, qty: s.quantityAfterMerge }))))
      )).flat();
      const byDate: Record<string, number> = {};
      for (const s of allSnaps) {
        const day = s.snapshotDate.slice(0, 10);
        byDate[day] = (byDate[day] || 0) + s.rawMarketPrice * s.qty;
      }
      res.json(
        Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
          .slice(-limit)
      );
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
        if (snaps.length < 2 || !snaps[snaps.length - 1].rawMarketPrice) continue;
        const oldest = snaps[snaps.length - 1];
        const newest = snaps[0];
        const pct = ((newest.rawMarketPrice - oldest.rawMarketPrice) / oldest.rawMarketPrice) * 100;
        movers.push({ id: item.id, productName: item.productName, number: item.number, condition: item.condition, oldPrice: oldest.rawMarketPrice, newPrice: newest.rawMarketPrice, pctChange: Math.round(pct * 10) / 10 });
      }
      movers.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
      res.json(movers.slice(0, 10));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Settings
  app.get("/api/settings/thresholds", async (req: any, res) => {
    res.json(await storage.getRepricingThresholds(req.user.id));
  });

  app.put("/api/settings/thresholds", async (req: any, res) => {
    try {
      const { over100Pct, mid50to100Pct, under50Pct } = req.body;
      if ([over100Pct, mid50to100Pct, under50Pct].some(v => typeof v !== "number" || v <= 0))
        return res.status(400).json({ error: "All thresholds must be positive numbers" });
      await storage.setRepricingThresholds(req.user.id, { over100Pct, mid50to100Pct, under50Pct });
      res.json(await storage.getRepricingThresholds(req.user.id));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/settings/presets", (_req, res) => {
    res.json({
      tcgplayer: {
        productName: ["Product Name"], number: ["Number"], condition: ["Condition"],
        marketPrice: ["TCG Market Price", "Market Price"], quantity: ["Add to Quantity", "Quantity"],
        productId: ["Product ID"], tcgplayerId: ["TCGplayer ID"], setName: ["Set Name"],
        printing: ["Printing"], rarity: ["Rarity"], productLine: ["Product Line"],
      },
      generic: {
        productName: ["Name", "Card Name"], number: ["Card Number", "Collector Number"],
        condition: ["Condition", "Cond"], marketPrice: ["Price", "Market Price"],
        quantity: ["Qty", "Quantity"],
      },
    });
  });
}
