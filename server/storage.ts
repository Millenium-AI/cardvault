import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, or, like, sql } from "drizzle-orm";
import {
  uploads, parsedRows, inventoryItems, priceSnapshots,
  mergeReviews, labelQueueItems, showLedgers, appSettings,
  type Upload, type InsertUpload,
  type ParsedRow, type InsertParsedRow,
  type InventoryItem, type InsertInventoryItem,
  type PriceSnapshot, type InsertPriceSnapshot,
  type MergeReview, type InsertMergeReview,
  type LabelQueueItem, type InsertLabelQueueItem,
  type ShowLedger, type InsertShowLedger,
} from "@shared/schema";

// Use /app/data/data.db on Railway (persistent volume), fallback to local data/ dir
const DB_PATH = process.env.DB_PATH ||
  (process.env.NODE_ENV === "production" && process.env.RAILWAY_ENVIRONMENT ? "/app/data/data.db" : "data/data.db");
const sqliteDb = new Database(DB_PATH);
sqliteDb.pragma("journal_mode = WAL");
const db = drizzle(sqliteDb);

// ─── migrations (run once) ───────────────────────────────────────────────────
sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL DEFAULT 'tcgplayer',
    game TEXT NOT NULL DEFAULT 'pokemon',
    original_filename TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    raw_file_path TEXT,
    raw_file_content TEXT,
    total_rows INTEGER NOT NULL DEFAULT 0,
    parse_status TEXT NOT NULL DEFAULT 'pending',
    summary_json TEXT
  );
  CREATE TABLE IF NOT EXISTS parsed_rows (
    id TEXT PRIMARY KEY,
    upload_id TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    number TEXT,
    condition TEXT,
    raw_market_price REAL,
    rounded_print_price INTEGER,
    add_to_quantity INTEGER NOT NULL DEFAULT 1,
    normalized_match_key TEXT,
    source_product_id TEXT,
    source_tcgplayer_id TEXT,
    source_product_line TEXT,
    source_set_name TEXT,
    source_printing TEXT,
    source_rarity TEXT,
    source_payload TEXT,
    parse_flags TEXT,
    match_status TEXT DEFAULT 'pending',
    matched_inventory_id TEXT
  );
  CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL DEFAULT 'pokemon',
    product_name TEXT NOT NULL,
    number TEXT,
    condition TEXT,
    current_quantity INTEGER NOT NULL DEFAULT 0,
    current_raw_market_price REAL,
    current_rounded_print_price INTEGER,
    latest_upload_id TEXT,
    normalized_match_key TEXT,
    match_metadata_json TEXT,
    photo_url TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE TABLE IF NOT EXISTS price_snapshots (
    id TEXT PRIMARY KEY,
    inventory_item_id TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    raw_market_price REAL NOT NULL,
    rounded_print_price INTEGER NOT NULL,
    quantity_after_merge INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS merge_reviews (
    id TEXT PRIMARY KEY,
    upload_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    new_item_count INTEGER NOT NULL DEFAULT 0,
    matched_item_count INTEGER NOT NULL DEFAULT 0,
    repricing_candidate_count INTEGER NOT NULL DEFAULT 0,
    duplicate_warning_count INTEGER NOT NULL DEFAULT 0,
    review_payload TEXT,
    reviewed_at TEXT,
    reviewed_by TEXT
  );
  CREATE TABLE IF NOT EXISTS label_queue_items (
    id TEXT PRIMARY KEY,
    inventory_item_id TEXT NOT NULL,
    queue_type TEXT NOT NULL,
    source_upload_id TEXT,
    prior_raw_price REAL,
    current_raw_price REAL,
    rounded_print_price INTEGER,
    percent_change REAL,
    threshold_rule TEXT,
    is_selected_for_export INTEGER NOT NULL DEFAULT 1,
    export_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    reviewed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS show_ledgers (
    id TEXT PRIMARY KEY,
    show_name TEXT NOT NULL,
    location TEXT,
    show_date TEXT NOT NULL,
    starting_inventory_market_value REAL,
    ending_inventory_market_value REAL,
    purchased_inventory_cost_basis REAL,
    purchased_inventory_market_value REAL,
    cash_sales_in REAL,
    cash_spent_on_buys REAL,
    other_cash_out REAL,
    expenses_total REAL,
    notes TEXT,
    created_at TEXT NOT NULL
  );
`);

export interface IStorage {
  // uploads
  createUpload(data: InsertUpload & { summaryJson?: string }): Upload;
  getUpload(id: string): Upload | undefined;
  listUploads(): Upload[];
  updateUpload(id: string, data: Partial<Upload>): Upload | undefined;

  // parsed rows
  createParsedRows(rows: InsertParsedRow[]): void;
  getParsedRowsByUpload(uploadId: string): ParsedRow[];
  updateParsedRow(id: string, data: Partial<ParsedRow>): void;

  // inventory
  createInventoryItem(data: InsertInventoryItem): InventoryItem;
  getInventoryItem(id: string): InventoryItem | undefined;
  getInventoryItemByMatchKey(key: string): InventoryItem | undefined;
  getInventoryItemByExternalIds(productId?: string, tcgplayerId?: string): InventoryItem | undefined;
  listInventoryItems(filters?: { game?: string; condition?: string; status?: string; search?: string }): InventoryItem[];
  updateInventoryItem(id: string, data: Partial<InventoryItem>): InventoryItem | undefined;

  // price snapshots
  createPriceSnapshot(data: InsertPriceSnapshot): PriceSnapshot;
  getSnapshotsByItem(inventoryItemId: string): PriceSnapshot[];
  getLatestSnapshot(inventoryItemId: string): PriceSnapshot | undefined;

  // merge reviews
  createMergeReview(data: InsertMergeReview): MergeReview;
  getMergeReviewByUpload(uploadId: string): MergeReview | undefined;
  updateMergeReview(id: string, data: Partial<MergeReview>): MergeReview | undefined;

  // label queue
  createLabelQueueItem(data: InsertLabelQueueItem): LabelQueueItem;
  listLabelQueueItems(queueType?: string, exportStatus?: string): LabelQueueItem[];
  getLabelQueueItem(id: string): LabelQueueItem | undefined;
  updateLabelQueueItem(id: string, data: Partial<LabelQueueItem>): LabelQueueItem | undefined;
  bulkUpdateLabelQueueExportStatus(ids: string[], exportStatus: string): void;

  // app settings
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
  getRepricingThresholds(): { over100Pct: number; mid50to100Pct: number; under50Pct: number };
  setRepricingThresholds(t: { over100Pct: number; mid50to100Pct: number; under50Pct: number }): void;

  // show ledgers
  createShowLedger(data: Omit<ShowLedger, "id" | "createdAt">): ShowLedger;
  getShowLedger(id: string): ShowLedger | undefined;
  listShowLedgers(): ShowLedger[];
  updateShowLedger(id: string, data: Partial<ShowLedger>): ShowLedger | undefined;
  deleteShowLedger(id: string): void;

  // dashboard stats
  getDashboardStats(): {
    totalItems: number;
    totalQuantity: number;
    totalMarketValue: number;
    newLabelsPending: number;
    repricingPending: number;
    uploadsThisWeek: number;
  };
}

function genId(): string {
  return crypto.randomUUID();
}

class SqliteStorage implements IStorage {
  createUpload(data: InsertUpload & { summaryJson?: string }): Upload {
    const row = { ...data, id: data.id || genId() };
    db.insert(uploads).values(row as any).run();
    return db.select().from(uploads).where(eq(uploads.id, row.id)).get()!;
  }
  getUpload(id: string): Upload | undefined {
    return db.select().from(uploads).where(eq(uploads.id, id)).get();
  }
  listUploads(): Upload[] {
    return db.select().from(uploads).orderBy(desc(uploads.uploadedAt)).all();
  }
  updateUpload(id: string, data: Partial<Upload>): Upload | undefined {
    db.update(uploads).set(data as any).where(eq(uploads.id, id)).run();
    return db.select().from(uploads).where(eq(uploads.id, id)).get();
  }

  createParsedRows(rows: InsertParsedRow[]): void {
    for (const row of rows) {
      db.insert(parsedRows).values(row as any).run();
    }
  }
  getParsedRowsByUpload(uploadId: string): ParsedRow[] {
    return db.select().from(parsedRows).where(eq(parsedRows.uploadId, uploadId)).all();
  }
  updateParsedRow(id: string, data: Partial<ParsedRow>): void {
    db.update(parsedRows).set(data as any).where(eq(parsedRows.id, id)).run();
  }

  createInventoryItem(data: InsertInventoryItem): InventoryItem {
    const row = { ...data, id: data.id || genId() };
    db.insert(inventoryItems).values(row as any).run();
    return db.select().from(inventoryItems).where(eq(inventoryItems.id, row.id)).get()!;
  }
  getInventoryItem(id: string): InventoryItem | undefined {
    return db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
  }
  getInventoryItemByMatchKey(key: string): InventoryItem | undefined {
    return db.select().from(inventoryItems)
      .where(and(eq(inventoryItems.normalizedMatchKey, key), eq(inventoryItems.status, "active")))
      .get();
  }
  getInventoryItemByExternalIds(productId?: string, tcgplayerId?: string): InventoryItem | undefined {
    if (!productId && !tcgplayerId) return undefined;
    const allItems = db.select().from(inventoryItems).where(eq(inventoryItems.status, "active")).all();
    for (const item of allItems) {
      if (!item.matchMetadataJson) continue;
      try {
        const meta = JSON.parse(item.matchMetadataJson);
        if (productId && meta.sourceProductId === productId) return item;
        if (tcgplayerId && meta.sourceTcgplayerId === tcgplayerId) return item;
      } catch {}
    }
    return undefined;
  }
  listInventoryItems(filters?: { game?: string; condition?: string; status?: string; search?: string }): InventoryItem[] {
    let items = db.select().from(inventoryItems).orderBy(desc(inventoryItems.lastSeenAt)).all();
    if (filters?.status) items = items.filter(i => i.status === filters.status);
    else items = items.filter(i => i.status === "active");
    if (filters?.game) items = items.filter(i => i.game === filters.game);
    if (filters?.condition) items = items.filter(i => i.condition === filters.condition);
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      items = items.filter(i =>
        i.productName.toLowerCase().includes(s) ||
        (i.number && i.number.toLowerCase().includes(s))
      );
    }
    return items;
  }
  updateInventoryItem(id: string, data: Partial<InventoryItem>): InventoryItem | undefined {
    db.update(inventoryItems).set(data as any).where(eq(inventoryItems.id, id)).run();
    return db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
  }

  createPriceSnapshot(data: InsertPriceSnapshot): PriceSnapshot {
    const row = { ...data, id: data.id || genId() };
    db.insert(priceSnapshots).values(row as any).run();
    return db.select().from(priceSnapshots).where(eq(priceSnapshots.id, row.id)).get()!;
  }
  getSnapshotsByItem(inventoryItemId: string): PriceSnapshot[] {
    return db.select().from(priceSnapshots)
      .where(eq(priceSnapshots.inventoryItemId, inventoryItemId))
      .orderBy(desc(priceSnapshots.snapshotDate))
      .all();
  }
  getLatestSnapshot(inventoryItemId: string): PriceSnapshot | undefined {
    return db.select().from(priceSnapshots)
      .where(eq(priceSnapshots.inventoryItemId, inventoryItemId))
      .orderBy(desc(priceSnapshots.snapshotDate))
      .get();
  }

  createMergeReview(data: InsertMergeReview): MergeReview {
    const row = { ...data, id: data.id || genId() };
    db.insert(mergeReviews).values(row as any).run();
    return db.select().from(mergeReviews).where(eq(mergeReviews.id, row.id)).get()!;
  }
  getMergeReviewByUpload(uploadId: string): MergeReview | undefined {
    return db.select().from(mergeReviews).where(eq(mergeReviews.uploadId, uploadId)).get();
  }
  updateMergeReview(id: string, data: Partial<MergeReview>): MergeReview | undefined {
    db.update(mergeReviews).set(data as any).where(eq(mergeReviews.id, id)).run();
    return db.select().from(mergeReviews).where(eq(mergeReviews.id, id)).get();
  }

  createLabelQueueItem(data: InsertLabelQueueItem): LabelQueueItem {
    const row = { ...data, id: data.id || genId() };
    db.insert(labelQueueItems).values(row as any).run();
    return db.select().from(labelQueueItems).where(eq(labelQueueItems.id, row.id)).get()!;
  }
  listLabelQueueItems(queueType?: string, exportStatus?: string): LabelQueueItem[] {
    let items = db.select().from(labelQueueItems).orderBy(desc(labelQueueItems.createdAt)).all();
    if (queueType) items = items.filter(i => i.queueType === queueType);
    if (exportStatus) items = items.filter(i => i.exportStatus === exportStatus);
    return items;
  }
  getLabelQueueItem(id: string): LabelQueueItem | undefined {
    return db.select().from(labelQueueItems).where(eq(labelQueueItems.id, id)).get();
  }
  updateLabelQueueItem(id: string, data: Partial<LabelQueueItem>): LabelQueueItem | undefined {
    db.update(labelQueueItems).set(data as any).where(eq(labelQueueItems.id, id)).run();
    return db.select().from(labelQueueItems).where(eq(labelQueueItems.id, id)).get();
  }
  bulkUpdateLabelQueueExportStatus(ids: string[], exportStatus: string): void {
    for (const id of ids) {
      db.update(labelQueueItems).set({ exportStatus } as any).where(eq(labelQueueItems.id, id)).run();
    }
  }

  createShowLedger(data: Omit<ShowLedger, "id" | "createdAt">): ShowLedger {
    const row = { ...data, id: genId(), createdAt: new Date().toISOString() };
    db.insert(showLedgers).values(row as any).run();
    return db.select().from(showLedgers).where(eq(showLedgers.id, row.id)).get()!;
  }
  getShowLedger(id: string): ShowLedger | undefined {
    return db.select().from(showLedgers).where(eq(showLedgers.id, id)).get();
  }
  listShowLedgers(): ShowLedger[] {
    return db.select().from(showLedgers).orderBy(desc(showLedgers.showDate)).all();
  }
  updateShowLedger(id: string, data: Partial<ShowLedger>): ShowLedger | undefined {
    db.update(showLedgers).set(data as any).where(eq(showLedgers.id, id)).run();
    return db.select().from(showLedgers).where(eq(showLedgers.id, id)).get();
  }
  deleteShowLedger(id: string): void {
    db.delete(showLedgers).where(eq(showLedgers.id, id)).run();
  }

  getSetting(key: string): string | undefined {
    const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    return row?.value;
  }
  setSetting(key: string, value: string): void {
    db.insert(appSettings).values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } })
      .run();
  }
  getRepricingThresholds(): { over100Pct: number; mid50to100Pct: number; under50Pct: number } {
    const raw = this.getSetting("repricing_thresholds");
    if (raw) {
      try { return JSON.parse(raw); } catch {}
    }
    return { over100Pct: 5, mid50to100Pct: 7, under50Pct: 10 };
  }
  setRepricingThresholds(t: { over100Pct: number; mid50to100Pct: number; under50Pct: number }): void {
    this.setSetting("repricing_thresholds", JSON.stringify(t));
  }

  getDashboardStats() {
    const items = db.select().from(inventoryItems).where(eq(inventoryItems.status, "active")).all();
    const totalItems = items.length;
    const totalQuantity = items.reduce((s, i) => s + i.currentQuantity, 0);
    const totalMarketValue = items.reduce((s, i) => s + (i.currentRawMarketPrice || 0) * i.currentQuantity, 0);

    const newLabels = db.select().from(labelQueueItems)
      .where(and(eq(labelQueueItems.queueType, "new"), eq(labelQueueItems.exportStatus, "pending")))
      .all();
    const repricing = db.select().from(labelQueueItems)
      .where(and(eq(labelQueueItems.queueType, "reprice"), eq(labelQueueItems.exportStatus, "pending")))
      .all();

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentUploads = db.select().from(uploads).all()
      .filter(u => u.uploadedAt >= oneWeekAgo);

    return {
      totalItems,
      totalQuantity,
      totalMarketValue,
      newLabelsPending: newLabels.length,
      repricingPending: repricing.length,
      uploadsThisWeek: recentUploads.length,
    };
  }
}

export const storage = new SqliteStorage();
