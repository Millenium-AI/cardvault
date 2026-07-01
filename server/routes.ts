import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import { supabaseAdmin, verifyToken } from "./supabase";
import { batchFetchPrices, fetchSinglePrice } from "./justtcg";

// ── File validation ───────────────────────────────────────────────────────────────
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

// ── CSV parsing ──────────────────────────────────────────────────────────────────
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

function detectGameFromProductLine(productLine: string | null, fallback: string): string {
  if (!productLine) return fallback;
  const pl = productLine.toLowerCase();
  if (pl.includes("pokemon") || pl.includes("pokémon")) {
    if (pl.includes("japan") || pl.includes(" jp") || pl.includes("(jp)")) return "pokemon-jp";
    return "pokemon";
  }
  if (pl.includes("one piece")) return "one-piece";
  if (pl.includes("sorcery")) return "sorcery";
  if (pl.includes("dragon ball")) return "dragon-ball";
  if (pl.includes("magic") || pl.includes("the gathering") || pl === "mtg") return "mtg";
  if (pl.includes("star wars")) return "star-wars";
  if (pl.includes("lorcana")) return "lorcana";
  if (pl.includes("yu-gi-oh") || pl.includes("yugioh")) return "yugioh";
  if (pl.includes("digimon")) return "digimon";
  if (pl.includes("flesh and blood") || pl.includes("flesh & blood")) return "fab";
  return fallback;
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
  const sourceProductLine   = k("Product Line", "product_line") || null;
  const resolvedGame        = detectGameFromProductLine(sourceProductLine, game);
  const sourceSetName       = k("Set Name", "set_name", "Set", "Expansion") || null;
  const sourcePrinting      = k("Printing", "printing", "Foil", "Edition") || null;
  const sourceRarity        = k("Rarity", "rarity") || null;
  const photoUrl            = k("Photo URL", "photo_url", "Image URL") || null;

  const flags: string[] = [];
  if (!productName) flags.push("missing_product_name");
  if (!rawMarketPrice) flags.push("price_pending_live_fetch");

  return {
    id: crypto.randomUUID(),
    uploadId,
    rowIndex,
    game: resolvedGame,
    productName: productName || "(unknown)",
    number: number || null,
    condition: condition || null,
    rawMarketPrice,
    roundedPrintPrice: ceilPrice(rawMarketPrice),
    addToQuantity,
    normalizedMatchKey: buildMatchKey(productName, number, condition, sourcePrinting, sourceSetName, resolvedGame),
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

// ── Repricing ───────────────────────────────────────────────────────────────────
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

// ── Niimbot single sticker CSV export ────────────────────────────────────────────────────
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

// ── Niimbot dual sticker CSV export — A/B side split ─────────────────────────────────────
function buildNiimbotDualCsv(items: any[]): string {
  const expanded: any[] = items.flatMap(item => {
    const qty = Math.max(1, parseInt(item.quantity) || 1);
    return Array(qty).fill(item);
  });

  const nA = Math.ceil(expanded.length / 2);
  const sideA = expanded.slice(0, nA);
  const sideB = expanded.slice(nA);

  const headers = [
    "Condition A", "Price A", "Name A", "Number A",
    "Condition B", "Price B", "Name B", "Number B",
  ];

  const rows = sideA.map((a, i) => {
    const b = sideB[i] ?? null;
    const cell = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [
      cell(CONDITION_SHORT[a.condition] || a.condition || ""),
      cell(`$${a.roundedPrintPrice || 0}`),
      cell(a.productName || ""),
      cell(a.number || ""),
      cell(b ? (CONDITION_SHORT[b.condition] || b.condition || "") : ""),
      cell(b ? `$${b.roundedPrintPrice || 0}` : ""),
      cell(b?.productName || ""),
      cell(b?.number || ""),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

// ── Auth ────────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  console.warn("[WARNING] ADMIN_EMAIL is not set. Admin routes will be inaccessible.");
}

const DEV_MODE = process.env.NODE_ENV === "development";
const DEV_BYPASS_USER_ID = process.env.DEV_BYPASS_USER_ID;
const DEV_BYPASS_EMAIL = process.env.DEV_BYPASS_EMAIL;
const DEV_BYPASS_IS_ADMIN = process.env.DEV_BYPASS_IS_ADMIN === "true";

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (DEV_MODE && DEV_BYPASS_USER_ID) {
    (req as any).user = {
      id: DEV_BYPASS_USER_ID,
      email: DEV_BYPASS_EMAIL || "dev@local.test",
    };
    return next();
  }
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const user = await verifyToken(token);
  if (!user) return res.status(401).json({ error: "Invalid token" });
  (req as any).user = user;
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (DEV_MODE && DEV_BYPASS_USER_ID && DEV_BYPASS_IS_ADMIN) {
    (req as any).user = {
      id: DEV_BYPASS_USER_ID,
      email: DEV_BYPASS_EMAIL || "dev@local.test",
    };
    return next();
  }
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

// ── Shared helpers ────────────────────────────────────────────────────────────────
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

// ── SSE progress helpers ─────────────────────────────────────────────────────────────
const pendingJobs = new Map<string, {
  status: "pending" | "done" | "error";
  steps: { label: string; pct: number }[];
  result?: any;
  error?: string;
}>();

function sendProgress(token: string, label: string, pct: number) {
  const job = pendingJobs.get(token);
  if (job) job.steps.push({ label, pct });
}

// ── Background price enrichment helper ──────────────────────────────────────────
async function enrichNewItemsWithLivePrices(
  userId: string,
  inventoryItemIds: string[]
) {
  if (!inventoryItemIds.length) return;

  try {
    const allItems = await storage.listInventoryItems(userId);
    const newItems = allItems.filter(i => inventoryItemIds.includes(i.id) && i.sourceTcgplayerId);

    if (!newItems.length) return;

    const BATCH = 20;
    for (let i = 0; i < newItems.length; i += BATCH) {
      const chunk = newItems.slice(i, i + BATCH);

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

      for (const item of chunk) {
        const priceResult = priceMap.get(item.id);
        if (!priceResult) continue;

        await supabaseAdmin
          .from("inventory_items")
          .update({
            current_raw_market_price:    priceResult.price,
            current_rounded_print_price: Math.ceil(priceResult.price),
            price_last_fetched_at:       new Date().toISOString(),
            price_change_24hr:           priceResult.priceChange24hr,
            price_change_7d:             priceResult.priceChange7d,
            justtcg_card_uuid:           priceResult.cardUuid,
            justtcg_variant_uuid:        priceResult.variantUuid,
          })
          .eq("id", item.id)
          .eq("user_id", userId);
      }

      if (i + BATCH < newItems.length) {
        await new Promise(r => setTimeout(r, 6000));
      }
    }

    console.log(`[JustTCG] Enriched ${newItems.length} new items with live prices for user ${userId}`);
  } catch (err: any) {
    console.error("[JustTCG] enrichNewItemsWithLivePrices error:", err.message);
  }
}

// ── Background price refresh for existing inventory ────────────────────────────
async function refreshExistingInventoryPrices(
  userId: string,
  excludeIds: string[],
  game: string,
) {
  try {
    const thr = await storage.getRepricingThresholds(userId);
    const allItems = await storage.listInventoryItems(userId, { game: game !== "all" ? game : undefined });
    const toRefresh = allItems.filter(i => {
      if (excludeIds.includes(i.id)) return false;
      if (!i.sourceTcgplayerId) return false;
      const fetchedAt = i.priceLastFetchedAt;
      if (!fetchedAt) return true;
      return Date.now() - new Date(fetchedAt).getTime() > 6 * 60 * 60 * 1000;
    });

    if (!toRefresh.length) return;

    const BATCH = 20;
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

      for (const item of chunk) {
        const priceResult = priceMap.get(item.id);
        if (!priceResult) continue;

        const newPrice = priceResult.price;
        const oldPrice = item.currentRawMarketPrice ?? null;
        const { triggered } = oldPrice !== null
          ? checkRepricingThreshold(newPrice, oldPrice, thr)
          : { triggered: false };

        const updates: Record<string, any> = {
          current_raw_market_price:    newPrice,
          current_rounded_print_price: Math.ceil(newPrice),
          price_last_fetched_at:       new Date().toISOString(),
          price_change_24hr:           priceResult.priceChange24hr,
          price_change_7d:             priceResult.priceChange7d,
          justtcg_card_uuid:           priceResult.cardUuid,
          justtcg_variant_uuid:        priceResult.variantUuid,
        };

        if (triggered && item.labelStatus !== "needs_label") {
          updates.label_status = "needs_repricing";
        }

        await supabaseAdmin
          .from("inventory_items")
          .update(updates)
          .eq("id", item.id)
          .eq("user_id", userId);
      }

      if (i + BATCH < toRefresh.length) {
        await new Promise(r => setTimeout(r, 6000));
      }
    }

    console.log("[JustTCG] refreshExistingInventoryPrices: refreshed " + toRefresh.length + " items for user " + userId);
  } catch (err: any) {
    console.error("[JustTCG] refreshExistingInventoryPrices error:", err.message);
  }
}

// ── TCGplayer URL builder ─────────────────────────────────────────────────────
function buildTcgplayerUrl(item: any): string | null {
  // 1. Try matchMetadataJson first (most items store IDs here)
  try {
    const meta = JSON.parse(item.matchMetadataJson || "{}");
    if (meta.sourceProductId) return `https://www.tcgplayer.com/product/${meta.sourceProductId}`;
    if (meta.sourceTcgplayerId) return `https://www.tcgplayer.com/product/${meta.sourceTcgplayerId}`;
  } catch {}
  // 2. Fall back to top-level columns on the inventory item
  if (item.sourceProductId) return `https://www.tcgplayer.com/product/${item.sourceProductId}`;
  if (item.sourceTcgplayerId) return `https://www.tcgplayer.com/product/${item.sourceTcgplayerId}`;
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────────────
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

  app.use("/api", requireAuth);

  app.get("/api/dashboard/stats", async (req: any, res) => {
    try {
      res.json(await storage.getDashboardStats(req.user.id));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const DEFAULT_COLUMN_ORDER = ["card", "condition", "game", "qty", "market", "print", "total"];

  app.get("/api/settings/inventory-columns", async (req: any, res) => {
    try {
      const raw = await storage.getSetting(req.user.id, "inventory_column_order");
      if (!raw) return res.json({ order: DEFAULT_COLUMN_ORDER });
      try {
        const parsed = JSON.parse(raw);
        const merged = [
          ...parsed.filter((c: string) => DEFAULT_COLUMN_ORDER.includes(c)),
          ...DEFAULT_COLUMN_ORDER.filter(c => !parsed.includes(c)),
        ];
        return res.json({ order: merged });
      } catch {
        return res.json({ order: DEFAULT_COLUMN_ORDER });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/settings/inventory-columns", async (req: any, res) => {
    try {
      const { order } = req.body as { order: string[] };
      if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array" });
      await storage.setSetting(req.user.id, "inventory_column_order", JSON.stringify(order));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/prices/refresh", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { ids } = req.body as { ids?: string[] };

      const allItems = await storage.listInventoryItems(userId);

      const toRefresh = ids
        ? allItems.filter(i => ids.includes(i.id) && i.sourceTcgplayerId)
        : allItems.filter(i => {
            if (!i.sourceTcgplayerId) return false;
            if (!i.priceFetchedAt) return true;
            const staleMs = Date.now() - new Date(i.priceFetchedAt).getTime();
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

        for (const item of chunk) {
          const priceResult = priceMap.get(item.id);
          if (!priceResult) continue;

          await supabaseAdmin
            .from("inventory_items")
            .update({
              current_raw_market_price:    priceResult.price,
              current_rounded_print_price: Math.ceil(priceResult.price),
              price_last_fetched_at:       new Date().toISOString(),
              price_change_24hr:           priceResult.priceChange24hr,
              price_change_7d:             priceResult.priceChange7d,
              justtcg_card_uuid:           priceResult.cardUuid,
              justtcg_variant_uuid:        priceResult.variantUuid,
            })
            .eq("id", item.id)
            .eq("user_id", userId);

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
    const { parseProductName } = await import("./lib/parseProductName.js");
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

      const newItemIds = rpcNewItems.map((i: any) => i.inventoryItemId);

      // Set label_status = 'needs_label' for all newly created items
      if (newItemIds.length > 0) {
        await supabaseAdmin
          .from("inventory_items")
          .update({ label_status: "needs_label" })
          .eq("user_id", userId)
          .in("id", newItemIds);
      }

      // Set label_status = 'needs_repricing' for items that triggered repricing
      // but only if they're not already marked needs_label
      const repricingIds = rpcRepricing.map((r: any) => r.existingId).filter(Boolean);
      if (repricingIds.length > 0) {
        await supabaseAdmin
          .from("inventory_items")
          .update({ label_status: "needs_repricing" })
          .eq("user_id", userId)
          .in("id", repricingIds)
          .neq("label_status", "needs_label");
      }

      setImmediate(() => enrichNewItemsWithLivePrices(userId, newItemIds));
      setImmediate(() => refreshExistingInventoryPrices(userId, newItemIds, uploadLevelGame));

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

  app.get("/api/inventory", async (req: any, res) => {
    const { game, condition, status, search } = req.query as Record<string, string>;
    const items = await storage.listInventoryItems(req.user.id, { game, condition, status, search });
    res.json(items.map(item => ({ ...item, tcgplayerUrl: buildTcgplayerUrl(item) })));
  });

  app.get("/api/inventory/export", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const items = await storage.listInventoryItems(userId);

      const rows = items.flatMap(item => {
        const qty = Math.max(1, item.currentQuantity || 1);
        const row = {
          "Name": item.productName,
          "Condition": CONDITION_SHORT[item.condition ?? ""] || (item.condition ?? ""),
          "Price": `$${item.currentRoundedPrintPrice || 0}`,
        };
        return Array(qty).fill(row);
      });

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

    const allowed = ["currentQuantity", "currentRawMarketPrice", "currentRoundedPrintPrice", "condition", "notes", "productName", "game", "status"];
    const patch: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.currentRawMarketPrice !== undefined) {
      patch.currentRoundedPrintPrice = Math.ceil(patch.currentRawMarketPrice);
    }
    res.json(await storage.updateInventoryItem(req.user.id, req.params.id, patch));
  });

  app.patch("/api/inventory/bulk", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { ids, condition, currentQuantity } = req.body as {
        ids: string[];
        condition?: string;
        currentQuantity?: number;
      };
      if (!Array.isArray(ids) || ids.length === 0)
        return res.status(400).json({ error: "ids must be a non-empty array" });
      await storage.bulkPatchInventoryItems(userId, ids, { condition, currentQuantity });
      res.json({ success: true, updated: ids.length });
    } catch (e: any) {
      console.error("[bulk patch inventory]", e);
      res.status(500).json({ error: e.message });
    }
  });

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

  app.delete("/api/labels/:id", async (req: any, res) => {
    try {
      await storage.deleteLabelQueueItem(req.user.id, req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[delete label]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/labels/export ─────────────────────────────────────────────────────────
  // Queries inventory_items by label_status (needs_label | needs_repricing), exports, then
  // marks all exported items as label_created. Body: { game?, format?, stickerMode? }
  app.post("/api/labels/export", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { game = "all", format = "xlsx", stickerMode = "single" } = req.body as {
        game?: string;
        format?: "xlsx" | "csv";
        stickerMode?: "single" | "dual";
      };

      const pendingItems = await storage.listInventoryItems(userId, {
        game: game !== "all" ? game : undefined,
        labelStatuses: ["needs_label", "needs_repricing"],
      });

      if (!pendingItems.length) {
        return res.status(400).json({ error: "No items pending label export" });
      }

      const exportedIds = pendingItems.map(i => i.id);

      const enriched = pendingItems.map(item => ({
        id: item.id,
        inventoryItemId: item.id,
        condition: item.condition || "",
        roundedPrintPrice: item.currentRoundedPrintPrice ?? 0,
        productName: item.productName || "",
        number: item.number || "",
        quantity: item.currentQuantity || 1,
      }));

      // Mark all as label_created
      await storage.bulkUpdateLabelStatus(userId, exportedIds, "label_created");

      const isDual = stickerMode === "dual";
      const gamePart = game !== "all" ? `-${game}` : "";
      const filename = `niimbot-labels${gamePart}-${isDual ? "AB-" : ""}${Date.now()}`;

      if (format === "xlsx") {
        let sheetRows: object[];

        if (isDual) {
          const expanded: any[] = enriched.flatMap(item => {
            const qty = Math.max(1, item.quantity || 1);
            return Array(qty).fill(item);
          });
          const nA = Math.ceil(expanded.length / 2);
          const sideA = expanded.slice(0, nA);
          const sideB = expanded.slice(nA);
          sheetRows = sideA.map((a: any, i: number) => {
            const b: any = sideB[i] ?? null;
            return {
              "Condition A": CONDITION_SHORT[a.condition] || a.condition || "",
              "Price A": `$${a.roundedPrintPrice || 0}`,
              "Name A": a.productName || "",
              "Number A": a.number || "",
              "Condition B": b ? (CONDITION_SHORT[b.condition] || b.condition || "") : "",
              "Price B": b ? `$${b.roundedPrintPrice || 0}` : "",
              "Name B": b?.productName || "",
              "Number B": b?.number || "",
            };
          });
        } else {
          sheetRows = enriched.flatMap(item => {
            const qty = Math.max(1, item.quantity || 1);
            const row = {
              "Condition": CONDITION_SHORT[item.condition] || item.condition || "",
              "Current Market Price": `$${item.roundedPrintPrice || 0}`,
              "Product Name": item.productName || "",
              "Number": item.number || "",
              "Internal ID": item.inventoryItemId || "",
            };
            return Array(qty).fill(row);
          });
        }

        const ws = XLSX.utils.json_to_sheet(sheetRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Labels");
        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
        return res.send(buffer);
      }

      // CSV — fallback for Mac / non-Niimbot users
      const csvContent = isDual ? buildNiimbotDualCsv(enriched) : buildNiimbotCsv(enriched);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
      res.send(csvContent);

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
