import type { Express } from "express";
import { storage, type TransactionIncomingItem } from "../storage";
import { allocatePrices, tradeCreditValue } from "../../shared/lib/transactionMath";
import { buildMatchKey, normalizeCondition } from "./csvHelpers";
import { fetchSinglePrice } from "../justtcg";

const TX_TYPES = ["sale", "trade"];
const PAYMENT_METHODS = ["cash", "credit_card", "trade", "trade_plus_cash"];
const CHANNELS = ["in_person", "show", "online", "other"];

function ceilPrice(price: number | null | undefined): number {
  return price && !isNaN(price) ? Math.ceil(price) : 0;
}

export function registerTransactionsRoutes(app: Express) {
  // ── GET /api/transactions ──────────────────────────────────────────────────
  // Filters: type, channel, showId, attached (true|false)
  app.get("/api/transactions", async (req: any, res) => {
    try {
      const { type, channel, showId, attached } = req.query as Record<string, string>;
      const filters: { type?: string; channel?: string; showId?: string; attached?: boolean } = {};
      if (type) filters.type = type;
      if (channel) filters.channel = channel;
      if (showId) filters.showId = showId;
      if (attached === "true") filters.attached = true;
      if (attached === "false") filters.attached = false;

      const transactions = await storage.listTransactions(req.user.id, filters);
      const withItems = await Promise.all(
        transactions.map(async tx => ({
          ...tx,
          items: await storage.listTransactionItems(req.user.id, tx.id),
          incomingItems: await storage.listTransactionIncomingItems(req.user.id, tx.id),
        })),
      );
      res.json(withItems);
    } catch (e: any) {
      console.error("[transactions list]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/transactions/:id ──────────────────────────────────────────────
  app.get("/api/transactions/:id", async (req: any, res) => {
    try {
      const tx = await storage.getTransaction(req.user.id, req.params.id);
      if (!tx) return res.status(404).json({ error: "Not found" });
      res.json({
        ...tx,
        items: await storage.listTransactionItems(req.user.id, tx.id),
        incomingItems: await storage.listTransactionIncomingItems(req.user.id, tx.id),
      });
    } catch (e: any) {
      console.error("[transactions get]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/transactions ─────────────────────────────────────────────────
  // Create a transaction with nested outgoing items and/or incoming trade-ins.
  app.post("/api/transactions", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const {
        type,
        paymentMethod,
        cashAmount = null,
        defaultTradePercent = null,
        showId = null,
        channel = "in_person",
        notes = null,
        occurredAt,
        outgoingItems = [],
        incomingItems = [],
        allocationTotal,
      } = req.body as {
        type: string;
        paymentMethod: string;
        cashAmount?: number | null;
        defaultTradePercent?: number | null;
        showId?: string | null;
        channel?: string;
        notes?: string | null;
        occurredAt?: string;
        outgoingItems?: { inventoryItemId: string; quantity?: number; marketPrice?: number | null }[];
        incomingItems?: {
          productName: string;
          game: string;
          condition?: string | null;
          cachedMarketPrice?: number | null;
          tradePercent?: number | null;
          quantity?: number;
          tcgplayerId?: string | null;
          printing?: string | null;
        }[];
        allocationTotal?: number;
      };

      if (!TX_TYPES.includes(type))
        return res.status(400).json({ error: `type must be one of: ${TX_TYPES.join(", ")}` });
      if (!PAYMENT_METHODS.includes(paymentMethod))
        return res.status(400).json({ error: `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}` });
      if (!CHANNELS.includes(channel))
        return res.status(400).json({ error: `channel must be one of: ${CHANNELS.join(", ")}` });
      if (!outgoingItems.length && !incomingItems.length)
        return res.status(400).json({ error: "A transaction needs at least one outgoing or incoming item" });

      // Resolve outgoing inventory items up front so we can allocate by market value.
      const invItems = await Promise.all(
        outgoingItems.map(o => storage.getInventoryItem(userId, o.inventoryItemId)),
      );
      const missing = outgoingItems.filter((_, i) => !invItems[i]).map(o => o.inventoryItemId);
      if (missing.length)
        return res.status(404).json({ error: `Inventory item(s) not found: ${missing.join(", ")}` });

      // Build incoming rows first — their credit sum is the default allocation total for trades.
      const incomingRows: Omit<TransactionIncomingItem, "id" | "userId" | "transactionId" | "createdAt" | "updatedAt">[] = [];
      for (const inc of incomingItems) {
        const tradePercent = inc.tradePercent ?? defaultTradePercent ?? 1;
        let cachedMarketPrice = inc.cachedMarketPrice ?? null;
        // If the client didn't supply a price but gave a TCGplayer id, reuse the
        // shared price-cache lookup (same path Inventory/Uploads use).
        if (cachedMarketPrice == null && inc.tcgplayerId) {
          try {
            const priced = await fetchSinglePrice(inc.tcgplayerId, inc.condition ?? "Near Mint", inc.printing ?? null);
            if (priced?.price != null) cachedMarketPrice = priced.price;
          } catch (err: any) {
            console.warn("[transactions] price lookup failed:", err.message);
          }
        }
        incomingRows.push({
          productName: inc.productName,
          game: inc.game,
          condition: inc.condition ?? null,
          cachedMarketPrice,
          tradePercent,
          tradeCreditValue: tradeCreditValue(cachedMarketPrice, tradePercent),
          quantity: inc.quantity ?? 1,
          status: "pending",
          linkedInventoryItemId: null,
        });
      }

      const incomingCreditSum = incomingRows.reduce((s, r) => s + r.tradeCreditValue * r.quantity, 0);
      const outgoingMarketSum = outgoingItems.reduce((s, o, i) => {
        const mp = o.marketPrice ?? invItems[i]!.currentRawMarketPrice ?? 0;
        return s + mp * (o.quantity ?? 1);
      }, 0);

      // Sale total = full cash price. Trade total = credit received (+ any cash delta),
      // falling back to outgoing market value when no incoming rows exist.
      const total =
        allocationTotal ??
        (type === "sale"
          ? cashAmount ?? 0
          : incomingCreditSum > 0
            ? incomingCreditSum + (paymentMethod === "trade_plus_cash" ? cashAmount ?? 0 : 0)
            : outgoingMarketSum);

      const allocations = allocatePrices(
        outgoingItems.map((o, i) => ({
          marketPrice: o.marketPrice ?? invItems[i]!.currentRawMarketPrice ?? 0,
          qty: o.quantity ?? 1,
        })),
        total,
      );

      const tx = await storage.createTransaction(userId, {
        occurredAt: occurredAt || new Date().toISOString(),
        type,
        paymentMethod,
        cashAmount,
        defaultTradePercent,
        showId,
        channel,
        notes,
      });

      const items = await storage.createTransactionItems(
        userId,
        tx.id,
        outgoingItems.map((o, i) => ({
          inventoryItemId: o.inventoryItemId,
          quantity: o.quantity ?? 1,
          allocatedPrice: allocations[i],
        })),
      );

      // Outgoing cards leave inventory — decrement quantity (floored at 0),
      // matching how Uploads mutates current_quantity.
      await Promise.all(
        outgoingItems.map((o, i) => {
          const current = invItems[i]!.currentQuantity ?? 0;
          const nextQty = Math.max(0, current - (o.quantity ?? 1));
          return storage.updateInventoryItem(userId, o.inventoryItemId, { currentQuantity: nextQty });
        }),
      );

      const incoming = await storage.createTransactionIncomingItems(userId, tx.id, incomingRows);

      res.json({ ...tx, items, incomingItems: incoming });
    } catch (e: any) {
      console.error("[transactions create]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── PATCH /api/transactions/:id ────────────────────────────────────────────
  // Update mutable fields (attach to a show, edit notes, etc.).
  app.patch("/api/transactions/:id", async (req: any, res) => {
    try {
      const allowed = ["showId", "notes", "channel", "occurredAt", "cashAmount", "defaultTradePercent", "paymentMethod", "type"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) patch[key] = req.body[key];
      }
      if (patch.type !== undefined && !TX_TYPES.includes(patch.type))
        return res.status(400).json({ error: `type must be one of: ${TX_TYPES.join(", ")}` });
      if (patch.paymentMethod !== undefined && !PAYMENT_METHODS.includes(patch.paymentMethod))
        return res.status(400).json({ error: `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}` });
      if (patch.channel !== undefined && !CHANNELS.includes(patch.channel))
        return res.status(400).json({ error: `channel must be one of: ${CHANNELS.join(", ")}` });

      const updated = await storage.updateTransaction(req.user.id, req.params.id, patch);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) {
      console.error("[transactions patch]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/transactions/:id/incoming-items/:itemId/approve ──────────────
  // Merge a pending trade-in into real inventory (by normalized match key) and
  // link it back to the incoming row.
  app.post("/api/transactions/:id/incoming-items/:itemId/approve", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id: transactionId, itemId } = req.params;

      const incoming = await storage.getTransactionIncomingItem(userId, transactionId, itemId);
      if (!incoming) return res.status(404).json({ error: "Not found" });
      if (incoming.status !== "pending")
        return res.status(400).json({ error: `Already ${incoming.status}` });

      const condition = incoming.condition ? normalizeCondition(incoming.condition) : null;
      const matchKey = buildMatchKey(incoming.productName, null, condition, null, null, incoming.game);
      const now = new Date().toISOString();
      const rawPrice = incoming.cachedMarketPrice ?? null;

      const existing = await storage.getInventoryItemByMatchKey(userId, matchKey);
      let inventoryItemId: string;

      if (existing) {
        inventoryItemId = existing.id;
        await storage.updateInventoryItem(userId, existing.id, {
          currentQuantity: (existing.currentQuantity ?? 0) + incoming.quantity,
          lastSeenAt: now,
        });
      } else {
        const created = await storage.createInventoryItem(userId, {
          game: incoming.game,
          productName: incoming.productName,
          condition,
          currentQuantity: incoming.quantity,
          currentRawMarketPrice: rawPrice,
          currentRoundedPrintPrice: rawPrice != null ? ceilPrice(rawPrice) : null,
          normalizedMatchKey: matchKey,
          priceSource: rawPrice != null ? "trade_in" : "pending",
          firstSeenAt: now,
          lastSeenAt: now,
          status: "active",
        });
        inventoryItemId = created.id;
      }

      const updated = await storage.updateTransactionIncomingItem(userId, itemId, {
        status: "approved",
        linkedInventoryItemId: inventoryItemId,
      });

      res.json(updated);
    } catch (e: any) {
      console.error("[transactions approve incoming]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/transactions/:id/incoming-items/:itemId/reject ───────────────
  app.post("/api/transactions/:id/incoming-items/:itemId/reject", async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id: transactionId, itemId } = req.params;

      const incoming = await storage.getTransactionIncomingItem(userId, transactionId, itemId);
      if (!incoming) return res.status(404).json({ error: "Not found" });
      if (incoming.status === "approved")
        return res.status(400).json({ error: "Cannot reject an approved item" });

      const updated = await storage.updateTransactionIncomingItem(userId, itemId, { status: "rejected" });
      res.json(updated);
    } catch (e: any) {
      console.error("[transactions reject incoming]", e);
      res.status(500).json({ error: e.message });
    }
  });
}
