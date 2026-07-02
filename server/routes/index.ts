import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { requireAuth } from "./helpers";
import { registerAuthRoutes } from "./auth";
import { registerAdminRoutes } from "./admin";
import { registerDashboardRoutes } from "./dashboard";
import { registerSettingsRoutes } from "./settings";
import { registerPricesRoutes } from "./prices";
import { registerUploadsRoutes } from "./uploads";
import { registerInventoryRoutes } from "./inventory";
import { registerShowsRoutes } from "./shows";
import { registerSnapshotsRoutes } from "./snapshots";

export function registerRoutes(httpServer: Server, app: Express) {
  // Auth routes (no auth requirement for validate-invite)
  registerAuthRoutes(app);

  // Admin routes
  registerAdminRoutes(app);

  // Apply auth middleware to all subsequent routes
  app.use("/api", requireAuth);

  // Protected routes
  registerDashboardRoutes(app);
  registerSettingsRoutes(app);
  registerPricesRoutes(app);
  registerUploadsRoutes(httpServer, app);
  registerInventoryRoutes(app);
  registerShowsRoutes(app);
  registerSnapshotsRoutes(app);
}
