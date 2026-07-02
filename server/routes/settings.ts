import type { Express } from "express";
import { storage } from "../storage";
import { DEFAULT_COLUMN_ORDER } from "./helpers";

export function registerSettingsRoutes(app: Express) {
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
