import { pgTable, text, integer, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── uploads ────────────────────────────────────────────────────────────────
export const uploads = pgTable("uploads", {
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
export const parsedRows = pgTable("parsed_rows", {
  id: text("id").primaryKey(),
  uploadId: text("upload_id").notNull(),
  rowIndex: integer("row_index").notNull(),
  productName: text("product_name").notNull(),
  number: text("number"),
  condition: text("condition"),
  rawMarketPrice: doublePrecision("raw_market_price"),
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
export const inventoryItems = pgTable("inventory_items", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  game: text("game").notNull().default("pokemon"),
  productName: text("product_name").notNull(),
  number: text("number"),
  condition: text("condition"),
  currentQuantity: integer("current_quantity").notNull().default(0),
  currentRawMarketPrice: doublePrecision("current_raw_market_price"),
  currentRoundedPrintPrice: integer("current_rounded_print_price"),
  priceSource: text("price_source").notNull().default("pending"), // pending|csv|justtcg
  csvMarketPrice: doublePrecision("csv_market_price"), // Audit field: CSV-provided price, never used as live price
  latestUploadId: text("latest_upload_id"),
  normalizedMatchKey: text("normalized_match_key"),
  matchMetadataJson: text("match_metadata_json"), // JSON: productId, tcgplayerId, setName, printing, etc.
  sourceProductId: text("source_product_id"),
  /** Legacy TCGplayer product-level ID column */
  sourceTcgplayerId: text("source_tcgplayer_id"),
  /** Preferred: SKU-level ID column */
  sourceTcgplayerSkuId: text("source_tcgplayer_sku_id"),
  photoUrl: text("photo_url"),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  updatedAt: text("updated_at"),
  status: text("status").notNull().default("active"), // active|archived
  labelStatus: text("label_status"), // needs_label|needs_repricing|label_created
  labelCreatedAt: text("label_created_at"),
  priceLastFetchedAt: text("price_last_fetched_at"),
  priceChange24hr: doublePrecision("price_change_24hr"),
  priceChange7d: doublePrecision("price_change_7d"),
  notes: text("notes"),
  justtcgCardUuid: text("justtcg_card_uuid"),
  justtcgVariantUuid: text("justtcg_variant_uuid"),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({});
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

// ─── price_snapshots ──────────────────────────────────────────────────────────
export const priceSnapshots = pgTable("price_snapshots", {
  id: text("id").primaryKey(),
  inventoryItemId: text("inventory_item_id").notNull(),
  uploadId: text("upload_id").notNull(),
  snapshotDate: text("snapshot_date").notNull(),
  rawMarketPrice: doublePrecision("raw_market_price").notNull(),
  roundedPrintPrice: integer("rounded_print_price").notNull(),
  quantityAfterMerge: integer("quantity_after_merge").notNull(),
});

export const insertPriceSnapshotSchema = createInsertSchema(priceSnapshots).omit({});
export type InsertPriceSnapshot = z.infer<typeof insertPriceSnapshotSchema>;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;

// ─── merge_reviews ────────────────────────────────────────────────────────────
export const mergeReviews = pgTable("merge_reviews", {
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
export const labelQueueItems = pgTable("label_queue_items", {
  id: text("id").primaryKey(),
  inventoryItemId: text("inventory_item_id").notNull(),
  queueType: text("queue_type").notNull(), // new|reprice
  sourceUploadId: text("source_upload_id"),
  priorRawPrice: doublePrecision("prior_raw_price"),
  currentRawPrice: doublePrecision("current_raw_price"),
  roundedPrintPrice: integer("rounded_print_price"),
  percentChange: doublePrecision("percent_change"),
  thresholdRule: text("threshold_rule"), // >100/5%, 50-100/7%, <50/10%
  isSelectedForExport: boolean("is_selected_for_export").notNull().default(true),
  exportStatus: text("export_status").notNull().default("pending"), // pending|exported|skipped
  createdAt: text("created_at").notNull(),
  reviewedAt: text("reviewed_at"),
});

export const insertLabelQueueItemSchema = createInsertSchema(labelQueueItems).omit({});
export type InsertLabelQueueItem = z.infer<typeof insertLabelQueueItemSchema>;
export type LabelQueueItem = typeof labelQueueItems.$inferSelect;

// ─── app_settings ────────────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── show_ledgers ─────────────────────────────────────────────────────────────
export const showLedgers = pgTable("show_ledgers", {
  id: text("id").primaryKey(),
  showName: text("show_name").notNull(),
  location: text("location"),
  showDate: text("show_date").notNull(),
  startingInventoryMarketValue: doublePrecision("starting_inventory_market_value"),
  endingInventoryMarketValue: doublePrecision("ending_inventory_market_value"),
  purchasedInventoryCostBasis: doublePrecision("purchased_inventory_cost_basis"),
  purchasedInventoryMarketValue: doublePrecision("purchased_inventory_market_value"),
  cashSalesIn: doublePrecision("cash_sales_in"),
  cashSpentOnBuys: doublePrecision("cash_spent_on_buys"),
  otherCashOut: doublePrecision("other_cash_out"),
  expensesTotal: doublePrecision("expenses_total"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertShowLedgerSchema = createInsertSchema(showLedgers).omit({ id: true, createdAt: true });
export type InsertShowLedger = z.infer<typeof insertShowLedgerSchema>;
export type ShowLedger = typeof showLedgers.$inferSelect;
