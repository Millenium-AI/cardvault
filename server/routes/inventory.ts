import type { Express } from "express";
import * as XLSX from "xlsx";
import { storage } from "../storage";
import { enrichLabelItems, resolveInventoryItem, buildTcgplayerUrl, CONDITION_SHORT } from "./helpers";
import { buildLabelCsv } from "./csvHelpers";

export function registerInventoryRoutes(app: Express) {
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
    try {
      const item = await resolveInventoryItem(req.user.id, req.params.id, res);
      if (item) res.json(item);
    } catch (err: any) {
      console.error('[route] error:', err);
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
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

      const csvContent = buildLabelCsv(enriched, stickerMode, CONDITION_SHORT);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
      res.send(csvContent);

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
