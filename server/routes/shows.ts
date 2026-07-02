import type { Express } from "express";
import { storage } from "../storage";

export function registerShowsRoutes(app: Express) {
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
}
