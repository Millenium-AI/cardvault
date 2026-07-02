import type { Express } from "express";
import { storage } from "../storage";

export function registerSnapshotsRoutes(app: Express) {
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
}
