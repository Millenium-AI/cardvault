import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { supabaseAdmin, verifyToken } from "./supabase";

// ── #7: File type + size validation ──────────────────────────────────────────
// Only accept CSV files, max 10 MB.
const csvFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const isCsv =
    file.mimetype === "text/csv" ||
    file.mimetype === "application/vnd.ms-excel" ||
    file.originalname.toLowerCase().endsWith(".csv");
  if (isCsv) cb(null, true);
  else cb(new Error("Only CSV files are accepted"));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: csvFilter,
});

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

// ── #8: Robust CSV parser — BOM stripping, duplicate-header detection, empty-file guard ──
function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")   // strip UTF-8 BOM if it survived to a single header token
    .replace(/^"|"$/g, "")    // strip surrounding quotes
    .trim();
}

function parseCSV(content: string): Record<string, string>[] {
  // Strip UTF-8 BOM from the very start of the file content
  const cleaned = content.replace(/^\uFEFF/, "");

  const lines = cleaned.split(/\r?\n/);

  // Reject empty or header-only files early with a clear error
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  if (nonEmptyLines.length < 2) {
    throw new Error("The CSV is empty or contains only a header row with no data.");
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);

  // Detect duplicate headers — last-value-wins silently corrupts data
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const h of headers) {
    const key = h.toLowerCase();
    if (seen.has(key)) duplicates.push(h);
    else seen.add(key);
  }
  if (duplicates.length > 0) {
    throw new Error(
      `The CSV contains duplicate column headers: ${duplicates.map(d => `"${d}"`).join(", ")}. ` +
      `Please remove duplicate columns and re-upload.`
    );
  }

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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  console.warn("[WARNING] ADMIN_EMAIL environment variable is not set. Admin routes will be inaccessible.");
}

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
  if (!ADMIN_EMAIL || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: "Forbidden — admin only" });
  (req as any).user = user;
  next();
}

const useInviteAttempts = new Map<string, number[]>();
const USE_INVITE_WINDOW_MS = 15 * 60 * 1000;
const USE_INVITE_MAX_ATTEMPTS = 5;

function useInviteRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - USE_INVITE_WINDOW_MS;
  const attempts = (useInviteAttempts.get(ip) || []).filter(t => t > windowStart);
  if (attempts.length >= USE_INVITE_MAX_ATTEMPTS) return true;
  attempts.push(now);
  useInviteAttempts.set(ip, attempts);
  return false;
}

export function registerRoutes(httpServer: Server, app: Express) {
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
    const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    if (useInviteRateLimited(ip)) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.slice(7);
    const user = await verifyToken(token);
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    const { code, userId } = req.body;
    if (!code || !userId) return res.status(400).json({ error: "Missing params" });
    if (userId !== user.id) {
      return res.status(403).json({ error: "Forbidden — userId mismatch" });
    }
    const { error } = await supabaseAdmin
      .from("invite_codes")
      .update({ used: true, used_by: userId, used_at: new Date().toISOString() })
      .eq("code", code.trim().toUpperCase())
      .eq("used", false);
    if (error) return res.status(400).json({ error: "Could not redeem code" });
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    const token = auth.slice(7);
    const user = await verifyToken(token);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    const isAdmin = Boolean(ADMIN_EMAIL && user.email === ADMIN_EMAIL);
    res.json({ id: user.id, email: user.email, isAdmin });
  });

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

  app.get("/api/admin/invite-codes", requireAdmin, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.use("/api", requireAuth);

  app.get("/api/dashboard/stats", async (req: any, res) => {
    try {
      const stats = await storage.getDashboardStats(req.user.id);
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

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
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large — maximum size is 10 MB" });
      }
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  }, async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const userId = req.user.id;
      const { game = "pokemon", sourceType = "tcgplayer" } = req.body;
      const content = req.file.buffer.toString("utf-8");

      let rawRows: Record<string, string>[];
      try {
        rawRows = parseCSV(content);
      } catch (parseErr: any) {
        return res.status(400).json({ error: parseErr.message });
      }

      const now = new Date().toISOString();

      const newUpload = await storage.createUpload(userId, {
        sourceType,
        game,
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

      const allParsed = await storage.getParsedRowsByUpload(userId, uploadId);
      const parsedById = new Map(allParsed.map(r => [r.id, r]));

      const rpcNewItems = (payload.newItems || []).map((row: any) => {
        const parsedRow = parsedById.get(row.id);
        const matchMeta = {
          sourceProductId: parsedRow?.sourceProductId ?? null,
          sourceTcgplayerId: parsedRow?.sourceTcgplayerId ?? null,
          sourceSetName: parsedRow?.sourceSetName ?? null,
          sourcePrinting: parsedRow?.sourcePrinting ?? null,
          sourceProductLine: parsedRow?.sourceProductLine ?? null,
          sourceRarity: parsedRow?.sourceRarity ?? null,
        };
        let photoUrl: string | null = null;
        try {
          const rawPayload = JSON.parse(parsedRow?.sourcePayload || "{}");
          photoUrl = rawPayload._photoUrl || rawPayload["Photo URL"] || null;
        } catch {}

        return {
          inventoryItemId: crypto.randomUUID(),
          parsedRowId: parsedRow?.id ?? null,
          game,
          productName: row.productName,
          number: row.number ?? null,
          condition: row.condition ?? null,
          addToQuantity: row.addToQuantity ?? 1,
          rawMarketPrice: row.rawMarketPrice ?? null,
          roundedPrintPrice: row.roundedPrintPrice ?? null,
          normalizedMatchKey: parsedRow?.normalizedMatchKey ?? null,
          matchMetadataJson: JSON.stringify(matchMeta),
          sourceProductId: parsedRow?.sourceProductId ?? null,
          sourceTcgplayerId: parsedRow?.sourceTcgplayerId ?? null,
          photoUrl,
        };
      });

      const rpcMatchedItems = (payload.matchedItems || []).map((match: any) => {
        const parsedRow = parsedById.get(match.rowId);
        return {
          parsedRowId: parsedRow?.id ?? null,
          existingId: match.existingId,
          newQty: (match.existingQty ?? 0) + (match.addToQuantity ?? 1),
          rawMarketPrice: match.rawMarketPrice ?? null,
          roundedPrintPrice: match.roundedPrintPrice ?? null,
        };
      });

      const rpcRepricing = (payload.repricingCandidates || []).map((candidate: any) => {
        const matchedEntry = (payload.matchedItems || []).find((m: any) => m.rowId === candidate.rowId);
        return {
          existingId: matchedEntry?.existingId ?? null,
          priorPrice: candidate.priorPrice ?? null,
          newPrice: candidate.newPrice ?? null,
          roundedPrintPrice: candidate.roundedPrintPrice ?? null,
          percentChange: parseFloat(candidate.percentChange) || null,
          rule: candidate.rule ?? null,
        };
      }).filter((r: any) => r.existingId !== null);

      const { error: rpcError } = await supabaseAdmin.rpc("approve_upload", {
        p_user_id:       userId,
        p_upload_id:     uploadId,
        p_review_id:     review.id,
        p_new_items:     rpcNewItems,
        p_matched_items: rpcMatchedItems,
        p_repricing:     rpcRepricing,
        p_now:           now,
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

  app.get("/api/labels/new", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [items, allInventory] = await Promise.all([
        storage.listLabelQueueItems(userId, "new"),
        storage.listInventoryItems(userId),
      ]);
      const invMap = new Map(allInventory.map(i => [i.id, i]));
      const enriched = items.map(item => {
        const inv = invMap.get(item.inventoryItemId);
        return { ...item, productName: inv?.productName, number: inv?.number, condition: inv?.condition, game: inv?.game };
      });
      res.json(enriched);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/labels/reprice", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [items, allInventory] = await Promise.all([
        storage.listLabelQueueItems(userId, "reprice"),
        storage.listInventoryItems(userId),
      ]);
      const invMap = new Map(allInventory.map(i => [i.id, i]));
      const enriched = items.map(item => {
        const inv = invMap.get(item.inventoryItemId);
        return { ...item, productName: inv?.productName, number: inv?.number, condition: inv?.condition, game: inv?.game };
      });
      res.json(enriched);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
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

  // ── Snapshot history — returns a flat array (no pagination wrapper)
  app.get("/api/snapshots/history", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 90, 365);

      const items = await storage.listInventoryItems(userId);
      const allSnapshots = (await Promise.all(
        items.map(item => storage.getSnapshotsByItem(userId, item.id).then(snaps => snaps.map(s => ({ ...s, qty: s.quantityAfterMerge }))))
      )).flat();

      const byDate: Record<string, number> = {};
      for (const snap of allSnapshots) {
        const day = snap.snapshotDate.slice(0, 10);
        byDate[day] = (byDate[day] || 0) + snap.rawMarketPrice * snap.qty;
      }

      const sorted = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
        .slice(-limit);

      res.json(sorted);
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
