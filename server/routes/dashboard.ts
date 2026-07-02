import type { Express } from "express";
import { storage } from "../storage";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard/stats", async (req: any, res) => {
    try {
      res.json(await storage.getDashboardStats(req.user.id));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
