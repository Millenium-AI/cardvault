import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── uploads ────────────────────────────────────────────────────────────────
export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull().default("tcgplayer"),
  game: text("game").notNull().default("pokemon"),
  originalFilename: text("original_filename").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  rawFilePath: text("raw_file_path"),
  rawFileContent: text("raw_file_content"), // stored CSV text
  totalRows: integer("total_rows").notNull().default(0),
  parseStatus: text("parse_status").notNull().default("pending"), // pending|parsed|failed|merged|rejected
  summaryJson: text("summary_json"), // JSON string
});

export const insertUploadSchema = createInsertSchema(uploads).omit({ summaryJson: true });
export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Upload = typeof uploads.$inferSelect;

// ─── parsed_rows ─────────────────────────────────────────────────────────────
export const parsedRows = sqliteTable("parsed_rows", {
  id: text("id").primaryKey(),
  uploadId: text("upload_id").notNull(),
  rowIndex: integer("row_index").notNull(),
  productName: text("product_name").notNull(),
  number: text("number"),
  condition: text("condition"),
  rawMarketPrice: real("raw_market_price"),
  roundedPrintPrice: integer("rounded_print_price"),
  addToQuantity: integer("add_to_quantity").notNull().default(1),
  normalizedMatchKey: text("normalized_match_key"),
  sourceProductId: text("source_product_id"),
  sourceTcgplayerId: text("source_tcgplayer_id"),
  sourceProductLine: text("source_product_line"),
  sourceSetName: text("source_set_name"),
  sourcePrinting: text("source_printing"),
  sourceRarity: text("source_rarity"),
  sourcePayload: text("source_payload"), // JSON string of full raw row
  parseFlags: text("parse_flags"), // JSON string of warnings
  matchStatus: text("match_status").default("pending"), // pending|new|matched|ambiguous|warning
  matchedInventoryId: text("matched_inventory_id"),
});

export const insertParsedRowSchema = createInsertSchema(parsedRows).omit({});
export type InsertParsedRow = z.infer<typeof insertParsedRowSchema>;
export type ParsedRow = typeof parsedRows.$inferSelect;

// ─── inventory_items ─────────────────────────────────────────────────────────
export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  game: text("game").notNull().default("pokemon"),
  productName: text("product_name").notNull(),
  number: text("number"),
  condition: text("condition"),
  currentQuantity: integer("current_quantity").notNull().default(0),
  currentRawMarketPrice: real("current_raw_market_price"),
  currentRoundedPrintPrice: integer("current_rounded_print_price"),
  latestUploadId: text("latest_upload_id"),
  normalizedMatchKey: text("normalized_match_key"),
  matchMetadataJson: text("match_metadata_json"), // JSON: productId, tcgplayerId, setName, printing, etc.
  photoUrl: text("photo_url"),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  status: text("status").notNull().default("active"), // active|archived
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({});
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

// ─── price_snapshots ──────────────────────────────────────────────────────────
export const priceSnapshots = sqliteTable("price_snapshots", {
  id: text("id").primaryKey(),
  inventoryItemId: text("inventory_item_id").notNull(),
  uploadId: text("upload_id").notNull(),
  snapshotDate: text("snapshot_date").notNull(),
  rawMarketPrice: real("raw_market_price").notNull(),
  roundedPrintPrice: integer("rounded_print_price").notNull(),
  quantityAfterMerge: integer("quantity_after_merge").notNull(),
});

export const insertPriceSnapshotSchema = createInsertSchema(priceSnapshots).omit({});
export type InsertPriceSnapshot = z.infer<typeof insertPriceSnapshotSchema>;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;

// ─── merge_reviews ────────────────────────────────────────────────────────────
export const mergeReviews = sqliteTable("merge_reviews", {
  id: text("id").primaryKey(),
  uploadId: text("upload_id").notNull(),
  status: text("status").notNull().default("pending"), // pending|approved|rejected
  newItemCount: integer("new_item_count").notNull().default(0),
  matchedItemCount: integer("matched_item_count").notNull().default(0),
  repricingCandidateCount: integer("repricing_candidate_count").notNull().default(0),
  duplicateWarningCount: integer("duplicate_warning_count").notNull().default(0),
  reviewPayload: text("review_payload"), // JSON detail data
  reviewedAt: text("reviewed_at"),
  reviewedBy: text("reviewed_by"),
});

export const insertMergeReviewSchema = createInsertSchema(mergeReviews).omit({});
export type InsertMergeReview = z.infer<typeof insertMergeReviewSchema>;
export type MergeReview = typeof mergeReviews.$inferSelect;

// ─── label_queue_items ────────────────────────────────────────────────────────
export const labelQueueItems = sqliteTable("label_queue_items", {
  id: text("id").primaryKey(),
  inventoryItemId: text("inventory_item_id").notNull(),
  queueType: text("queue_type").notNull(), // new|reprice
  sourceUploadId: text("source_upload_id"),
  priorRawPrice: real("prior_raw_price"),
  currentRawPrice: real("current_raw_price"),
  roundedPrintPrice: integer("rounded_print_price"),
  percentChange: real("percent_change"),
  thresholdRule: text("threshold_rule"), // >100/5%, 50-100/7%, <50/10%
  isSelectedForExport: integer("is_selected_for_export", { mode: "boolean" }).notNull().default(true),
  exportStatus: text("export_status").notNull().default("pending"), // pending|exported|skipped
  createdAt: text("created_at").notNull(),
  reviewedAt: text("reviewed_at"),
});

export const insertLabelQueueItemSchema = createInsertSchema(labelQueueItems).omit({});
export type InsertLabelQueueItem = z.infer<typeof insertLabelQueueItemSchema>;
export type LabelQueueItem = typeof labelQueueItems.$inferSelect;

// ─── app_settings ────────────────────────────────────────────────────────────
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── show_ledgers ─────────────────────────────────────────────────────────────
export const showLedgers = sqliteTable("show_ledgers", {
  id: text("id").primaryKey(),
  showName: text("show_name").notNull(),
  location: text("location"),
  showDate: text("show_date").notNull(),
  startingInventoryMarketValue: real("starting_inventory_market_value"),
  endingInventoryMarketValue: real("ending_inventory_market_value"),
  purchasedInventoryCostBasis: real("purchased_inventory_cost_basis"),
  purchasedInventoryMarketValue: real("purchased_inventory_market_value"),
  cashSalesIn: real("cash_sales_in"),
  cashSpentOnBuys: real("cash_spent_on_buys"),
  otherCashOut: real("other_cash_out"),
  expensesTotal: real("expenses_total"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertShowLedgerSchema = createInsertSchema(showLedgers).omit({ id: true, createdAt: true });
export type InsertShowLedger = z.infer<typeof insertShowLedgerSchema>;
export type ShowLedger = typeof showLedgers.$inferSelect;
