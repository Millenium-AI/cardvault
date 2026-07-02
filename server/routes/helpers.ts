import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { verifyToken } from "../supabase";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  console.warn("[WARNING] ADMIN_EMAIL is not set. Admin routes will be inaccessible.");
}

export const DEV_MODE = process.env.NODE_ENV === "development";
export const DEV_BYPASS_USER_ID = process.env.DEV_BYPASS_USER_ID;
export const DEV_BYPASS_EMAIL = process.env.DEV_BYPASS_EMAIL;
export const DEV_BYPASS_IS_ADMIN = process.env.DEV_BYPASS_IS_ADMIN === "true";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
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

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
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

export const useInviteAttempts = new Map<string, number[]>();
export function useInviteRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const attempts = (useInviteAttempts.get(ip) || []).filter(t => t > now - window);
  if (attempts.length >= 5) return true;
  useInviteAttempts.set(ip, [...attempts, now]);
  return false;
}

export async function enrichLabelItems(userId: string, queueType: string) {
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

export async function resolveInventoryItem(userId: string, id: string, res: Response) {
  const item = await storage.getInventoryItem(userId, id);
  if (!item) res.status(404).json({ error: "Not found" });
  return item;
}

export const pendingJobs = new Map<string, {
  status: "pending" | "done" | "error";
  steps: { label: string; pct: number }[];
  result?: any;
  error?: string;
}>();

export function sendProgress(token: string, label: string, pct: number) {
  const job = pendingJobs.get(token);
  if (job) job.steps.push({ label, pct });
}

export function buildTcgplayerUrl(item: any): string | null {
  try {
    const meta = JSON.parse(item.matchMetadataJson || "{}");
    if (meta.sourceProductId) return `https://www.tcgplayer.com/product/${meta.sourceProductId}`;
    if (meta.sourceTcgplayerId) return `https://www.tcgplayer.com/product/${meta.sourceTcgplayerId}`;
  } catch {}
  if (item.sourceProductId) return `https://www.tcgplayer.com/product/${item.sourceProductId}`;
  if (item.sourceTcgplayerId) return `https://www.tcgplayer.com/product/${item.sourceTcgplayerId}`;
  return null;
}

export const CONDITION_SHORT: Record<string, string> = {
  "Near Mint": "NM",
  "Lightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
  "Damaged": "DMG",
};

export const DEFAULT_COLUMN_ORDER = ["card", "condition", "game", "qty", "market", "print", "total"];
