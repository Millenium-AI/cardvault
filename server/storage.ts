import { supabaseAdmin } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Upload {
  id: string;
  userId: string;
  sourceType: string;
  game: string;
  originalFilename: string;
  uploadedAt: string;
  rawFileContent?: string | null;
  /** Key of the retained original file in the private `csv-uploads` bucket. */
  rawFileStorageKey?: string | null;
  totalRows: number;
  parseStatus: string;
  summaryJson?: string | null;
}

export interface ParsedRow {
  id: string;
  userId: string;
  uploadId: string;
  rowIndex: number;
  game?: string | null;
  productName: string;
  number?: string | null;
  condition?: string | null;
  rawMarketPrice?: number | null;
  roundedPrintPrice?: number | null;
  addToQuantity: number;
  normalizedMatchKey?: string | null;
  sourceProductId?: string | null;
  sourceTcgplayerSkuId?: string | null;
  sourceProductLine?: string | null;
  sourceSetName?: string | null;
  sourcePrinting?: string | null;
  sourceRarity?: string | null;
  sourcePayload?: string | null;
  parseFlags?: string | null;
  matchStatus?: string | null;
  matchedInventoryId?: string | null;
}

export interface InventoryItem {
  id: string;
  userId: string;
  game: string;
  productName: string;
  number?: string | null;
  condition?: string | null;
  currentQuantity: number;
  currentRawMarketPrice?: number | null;
  currentRoundedPrintPrice?: number | null;
  latestUploadId?: string | null;
  normalizedMatchKey?: string | null;
  matchMetadataJson?: string | null;
  sourceProductId?: string | null;
  /** Legacy TCGplayer product-level ID column (source_tcgplayer_id) */
  sourceTcgplayerId?: string | null;
  /** Preferred: SKU-level ID column (source_tcgplayer_sku_id) */
  sourceTcgplayerSkuId?: string | null;
  photoUrl?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt?: string | null;
  status: string;
  labelStatus?: string;
  priceSource?: string | null;
  isSealed?: boolean;
  // Sales-derived pricing (see server/tcgplayerSales.ts)
  adjustedMarketPrice?: number | null;
  lastSaleDate?: string | null;
  lastSaleCount?: number | null;
  lastSaleOutliers?: number | null;
  lastSaleMatch?: string | null;
  lastSaleFetchedAt?: string | null;
  priceDivergencePct?: number | null;
  priceLocked?: boolean | null;
  priceLastFetchedAt?: string | null;
  priceChange24hr?: number | null;
  priceChange7d?: number | null;
  notes?: string | null;
  justtcgCardUuid?: string | null;
  justtcgVariantUuid?: string | null;
}

export interface PriceSnapshot {
  id: string;
  userId: string;
  inventoryItemId: string;
  uploadId: string | null;
  snapshotDate: string;
  rawMarketPrice: number;
  roundedPrintPrice: number;
  quantityAfterMerge: number;
}

export interface MergeReview {
  id: string;
  userId: string;
  uploadId: string;
  status: string;
  newItemCount: number;
  matchedItemCount: number;
  repricingCandidateCount: number;
  duplicateWarningCount: number;
  reviewPayload?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export interface LabelQueueItem {
  id: string;
  userId: string;
  inventoryItemId: string;
  queueType: string;
  sourceUploadId?: string | null;
  priorRawPrice?: number | null;
  currentRawPrice?: number | null;
  roundedPrintPrice?: number | null;
  percentChange?: number | null;
  thresholdRule?: string | null;
  isSelectedForExport: boolean;
  exportStatus: string;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface ShowLedger {
  id: string;
  userId: string;
  showName: string;
  location?: string | null;
  showDate: string;
  startingInventoryMarketValue?: number | null;
  endingInventoryMarketValue?: number | null;
  purchasedInventoryCostBasis?: number | null;
  purchasedInventoryMarketValue?: number | null;
  cashSalesIn?: number | null;
  cashSpentOnBuys?: number | null;
  otherCashOut?: number | null;
  expensesTotal?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  occurredAt: string;
  type: string; // sale | trade
  paymentMethod: string; // cash | credit_card | trade | trade_plus_cash
  cashAmount?: number | null;
  defaultTradePercent?: number | null;
  showId?: string | null;
  channel: string; // in_person | show | online | other
  notes?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface TransactionItem {
  id: string;
  userId: string;
  transactionId: string;
  inventoryItemId: string;
  quantity: number;
  allocatedPrice: number;
  createdAt?: string | null;
}

export interface TransactionIncomingItem {
  id: string;
  userId: string;
  transactionId: string;
  productName: string;
  game: string;
  condition?: string | null;
  cachedMarketPrice?: number | null;
  tradePercent: number;
  tradeCreditValue: number;
  quantity: number;
  status: string; // pending | approved | rejected
  linkedInventoryItemId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = v;
  }
  return out;
}

export function toCamel<T>(obj: Record<string, any>): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out as T;
}

/** Strip id/userId before an update so they're never written back to the DB. */
function stripMeta(data: Record<string, any>): Record<string, any> {
  const { id: _id, userId: _uid, ...rest } = data;
  return rest;
}

/**
 * Run an insert or update query that ends in `.select().single()`,
 * throw on error, and return the camel-cased result.
 */
async function dbOp<T>(
  query: PromiseLike<{ data: Record<string, any> | null; error: any }>
): Promise<T> {
  const { data, error } = await query;
  if (error) {
    console.error("[DBOp Error] Full error object:", JSON.stringify(error, null, 2));
    console.error("[DBOp Error] Error code:", error.code);
    console.error("[DBOp Error] Error details:", error.details);
    throw new Error(error.message);
  }
  return toCamel<T>(data!);
}

/**
 * PostgREST caps every SELECT at 1000 rows (Supabase default). Any list query
 * that can exceed that MUST page through with .range() or it silently truncates —
 * which quietly under-reports inventory totals and, worse, makes the upload
 * matcher miss existing cards and create duplicates. Pass a builder that applies
 * the range to a fresh query.
 */
const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    out.push(...(batch as T[]));
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

// ─── Storage ──────────────────────────────────────────────────────────────────
class SupabaseStorage {

  // ── uploads ────────────────────────────────────────────────────────────────
  async createUpload(userId: string, data: Omit<Upload, 'id' | 'userId'>): Promise<Upload> {
    return dbOp<Upload>(
      supabaseAdmin.from('uploads').insert(toSnake({ ...data, id: crypto.randomUUID(), userId })).select().single()
    );
  }

  async getUpload(userId: string, id: string): Promise<Upload | undefined> {
    const { data } = await supabaseAdmin.from('uploads').select('*').eq('id', id).eq('user_id', userId).single();
    return data ? toCamel<Upload>(data) : undefined;
  }

  async listUploads(userId: string): Promise<Upload[]> {
    const { data } = await supabaseAdmin.from('uploads').select('*').eq('user_id', userId).order('uploaded_at', { ascending: false });
    return (data || []).map(toCamel<Upload>);
  }

  async updateUpload(userId: string, id: string, data: Partial<Upload>): Promise<Upload | undefined> {
    const { data: d } = await supabaseAdmin.from('uploads').update(toSnake(stripMeta(data as any))).eq('id', id).eq('user_id', userId).select().single();
    return d ? toCamel<Upload>(d) : undefined;
  }

  async deleteUpload(userId: string, id: string): Promise<void> {
    // DB ON DELETE CASCADE handles parsed_rows, merge_reviews, and price_snapshots.
    const { error } = await supabaseAdmin.from('uploads').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  // ── parsed rows ────────────────────────────────────────────────────────────
  async createParsedRows(userId: string, rows: Omit<ParsedRow, 'userId'>[]): Promise<void> {
    if (!rows.length) return;

    // Insert in chunks: a single request with several hundred rows (each carrying
    // a full source_payload) has failed outright in production on large uploads.
    const CHUNK = 200;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map(r => toSnake({ ...r, userId }));
      const { data, error } = await supabaseAdmin.from('parsed_rows').insert(chunk).select('id');
      if (error) throw new Error(`parsed_rows insert failed at row ${i}: ${error.message}`);
      inserted += data?.length ?? 0;
    }

    if (inserted !== rows.length) {
      throw new Error(`parsed_rows insert incomplete: wrote ${inserted} of ${rows.length} rows`);
    }
  }

  async getParsedRowsByUpload(userId: string, uploadId: string): Promise<ParsedRow[]> {
    const rows = await fetchAllPages<Record<string, any>>((from, to) =>
      supabaseAdmin.from('parsed_rows')
        .select('id, user_id, upload_id, row_index, game, product_name, number, condition, raw_market_price, rounded_print_price, add_to_quantity, normalized_match_key, source_product_id, source_tcgplayer_sku_id, source_product_line, source_set_name, source_printing, source_rarity, source_payload, parse_flags, match_status, matched_inventory_id')
        .eq('upload_id', uploadId).eq('user_id', userId)
        .order('row_index', { ascending: true })
        .range(from, to),
    );
    return rows.map(toCamel<ParsedRow>);
  }

  async updateParsedRow(userId: string, id: string, data: Partial<ParsedRow>): Promise<void> {
    await supabaseAdmin.from('parsed_rows').update(toSnake(stripMeta(data as any))).eq('id', id).eq('user_id', userId);
  }

  /**
   * Write back TCGplayer identifiers recovered by the product-id resolver.
   * Runs in small parallel batches — these are per-row updates by primary key.
   */
  async patchParsedRowIdentifiers(
    userId: string,
    patches: { id: string; sourceProductId: string; sourceTcgplayerSkuId: string | null; parseFlags?: string }[],
  ): Promise<number> {
    if (!patches.length) return 0;
    const BATCH = 20;
    let updated = 0;

    for (let i = 0; i < patches.length; i += BATCH) {
      const batch = patches.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async p => {
        const patch: Record<string, any> = {
          source_product_id: p.sourceProductId,
          updated_at: new Date().toISOString(),
        };
        if (p.sourceTcgplayerSkuId) patch.source_tcgplayer_sku_id = p.sourceTcgplayerSkuId;
        if (p.parseFlags) patch.parse_flags = p.parseFlags;

        const { error } = await supabaseAdmin.from('parsed_rows')
          .update(patch).eq('id', p.id).eq('user_id', userId);
        if (error) {
          console.error(`[resolver] failed to patch parsed row ${p.id}: ${error.message}`);
          return false;
        }
        return true;
      }));
      updated += results.filter(Boolean).length;
    }
    return updated;
  }

  // ── inventory ──────────────────────────────────────────────────────────────
  async createInventoryItem(userId: string, data: Omit<InventoryItem, 'id' | 'userId'>): Promise<InventoryItem> {
    return dbOp<InventoryItem>(
      supabaseAdmin.from('inventory_items').insert(toSnake({ ...data, id: crypto.randomUUID(), userId })).select().single()
    );
  }

  async getInventoryItem(userId: string, id: string): Promise<InventoryItem | undefined> {
    const { data } = await supabaseAdmin.from('inventory_items').select('*').eq('id', id).eq('user_id', userId).single();
    return data ? toCamel<InventoryItem>(data) : undefined;
  }

  async getInventoryItemByMatchKey(userId: string, key: string): Promise<InventoryItem | undefined> {
    const { data } = await supabaseAdmin.from('inventory_items').select('*')
      .eq('user_id', userId).eq('normalized_match_key', key).eq('status', 'active').maybeSingle();
    return data ? toCamel<InventoryItem>(data) : undefined;
  }

  async getInventoryItemByExternalIds(userId: string, productId?: string): Promise<InventoryItem | undefined> {
    if (!productId) return undefined;

    const { data } = await supabaseAdmin.from('inventory_items').select('*')
      .eq('user_id', userId).eq('source_product_id', productId).eq('status', 'active').limit(1).maybeSingle();
    if (data) return toCamel<InventoryItem>(data);

    return undefined;
  }

  /**
   * Bulk-fetch all active inventory for a user and return three lookup Maps:
   * keyed by source_product_id, normalized_match_key, and source_tcgplayer_id.
   * Used during CSV upload matching to avoid N×DB-round-trips.
   */
  async getInventoryLookupMaps(userId: string): Promise<{
    byProductId: Map<string, InventoryItem>;
    byTcgplayerId: Map<string, InventoryItem>;
    byMatchKey: Map<string, InventoryItem>;
  }> {
    const rows = await fetchAllPages<Record<string, any>>((from, to) =>
      supabaseAdmin
        .from('inventory_items')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(from, to),
    );

    const byProductId = new Map<string, InventoryItem>();
    const byTcgplayerId = new Map<string, InventoryItem>();
    const byMatchKey = new Map<string, InventoryItem>();

    for (const raw of rows) {
      const item = toCamel<InventoryItem>(raw);
      if (item.sourceProductId) byProductId.set(item.sourceProductId, item);
      if (item.sourceTcgplayerId) byTcgplayerId.set(item.sourceTcgplayerId, item);
      if (item.normalizedMatchKey) byMatchKey.set(item.normalizedMatchKey, item);
    }

    return { byProductId, byTcgplayerId, byMatchKey };
  }

  async listInventoryItems(userId: string, filters?: { game?: string; condition?: string; status?: string; search?: string; labelStatuses?: string[] }): Promise<InventoryItem[]> {
    const rows = await fetchAllPages<Record<string, any>>((from, to) => {
      let query = supabaseAdmin.from('inventory_items').select('*')
        .eq('user_id', userId)
        .eq('status', filters?.status || 'active')
        .order('last_seen_at', { ascending: false })
        .order('id', { ascending: true });

      if (filters?.game) query = query.eq('game', filters.game);
      if (filters?.condition) query = query.eq('condition', filters.condition);
      if (filters?.labelStatuses?.length) query = query.in('label_status', filters.labelStatuses);

      return query.range(from, to);
    });

    let items = rows.map(toCamel<InventoryItem>);

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      items = items.filter(i =>
        i.productName.toLowerCase().includes(s) ||
        i.number?.toLowerCase().includes(s)
      );
    }
    return items;
  }

  async bulkPatchInventoryItems(userId: string, ids: string[], patch: { condition?: string; currentQuantity?: number }): Promise<void> {
    if (!ids.length) return;
    const update: Record<string, any> = {};
    if (patch.condition !== undefined) update.condition = patch.condition;
    if (patch.currentQuantity !== undefined) update.current_quantity = patch.currentQuantity;
    if (!Object.keys(update).length) return;
    const { error } = await supabaseAdmin
      .from('inventory_items')
      .update(update)
      .eq('user_id', userId)
      .in('id', ids);
    if (error) throw new Error(error.message);
  }

  async bulkUpdateLabelStatus(userId: string, ids: string[], status: string): Promise<void> {
    if (!ids.length) return;
    const { error } = await supabaseAdmin
      .from('inventory_items')
      .update({ label_status: status })
      .eq('user_id', userId)
      .in('id', ids);
    if (error) throw new Error(error.message);
  }

  async updateInventoryItem(userId: string, id: string, data: Partial<InventoryItem>): Promise<InventoryItem | undefined> {
    const { data: d } = await supabaseAdmin.from('inventory_items').update(toSnake(stripMeta(data as any))).eq('id', id).eq('user_id', userId).select().single();
    return d ? toCamel<InventoryItem>(d) : undefined;
  }

  async deleteInventoryItem(userId: string, id: string): Promise<void> {
    // DB ON DELETE CASCADE handles label_queue_items and price_snapshots.
    const { error } = await supabaseAdmin.from('inventory_items').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  // ── price snapshots ────────────────────────────────────────────────────────
  async createPriceSnapshot(userId: string, data: Omit<PriceSnapshot, 'id' | 'userId'>): Promise<PriceSnapshot> {
    return dbOp<PriceSnapshot>(
      supabaseAdmin.from('price_snapshots').insert(toSnake({ ...data, id: crypto.randomUUID(), userId })).select().single()
    );
  }

  async getSnapshotsByItem(userId: string, inventoryItemId: string): Promise<PriceSnapshot[]> {
    const rows = await fetchAllPages<Record<string, any>>((from, to) =>
      supabaseAdmin.from('price_snapshots').select('*')
        .eq('inventory_item_id', inventoryItemId).eq('user_id', userId)
        .order('snapshot_date', { ascending: false })
        .range(from, to),
    );
    return rows.map(toCamel<PriceSnapshot>);
  }

  async getLatestSnapshot(userId: string, inventoryItemId: string): Promise<PriceSnapshot | undefined> {
    const { data } = await supabaseAdmin.from('price_snapshots').select('*')
      .eq('inventory_item_id', inventoryItemId).eq('user_id', userId)
      .order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
    return data ? toCamel<PriceSnapshot>(data) : undefined;
  }

  /**
   * Batch version of getLatestSnapshot: fetches the latest snapshot per
   * inventory item id in ONE query instead of N sequential round-trips.
   */
  async getLatestSnapshotsByItems(userId: string, inventoryItemIds: string[]): Promise<Map<string, PriceSnapshot>> {
    const result = new Map<string, PriceSnapshot>();
    if (!inventoryItemIds.length) return result;

    // Chunk the id filter (long URLs fail) and page each chunk.
    const ID_CHUNK = 100;
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < inventoryItemIds.length; i += ID_CHUNK) {
      const idChunk = inventoryItemIds.slice(i, i + ID_CHUNK);
      const page = await fetchAllPages<Record<string, any>>((from, to) =>
        supabaseAdmin.from('price_snapshots').select('*')
          .eq('user_id', userId)
          .in('inventory_item_id', idChunk)
          .order('snapshot_date', { ascending: false })
          .range(from, to),
      );
      rows.push(...page);
    }

    for (const row of rows) {
      const snap = toCamel<PriceSnapshot>(row);
      if (!result.has(snap.inventoryItemId)) result.set(snap.inventoryItemId, snap);
    }
    return result;
  }

  async updateSnapshotPrice(
    userId: string,
    snapshotId: string,
    result: { rawMarketPrice: number; roundedPrintPrice: number },
  ): Promise<void> {
    const { error } = await supabaseAdmin.from('price_snapshots')
      .update({ raw_market_price: result.rawMarketPrice, rounded_print_price: result.roundedPrintPrice })
      .eq('id', snapshotId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  async reconcileFreshSnapshotWithLivePrice(
    userId: string,
    latestSnapshot: PriceSnapshot | undefined,
    result: { rawMarketPrice: number; roundedPrintPrice: number },
    now: Date = new Date(),
    freshnessWindowMs: number = 5 * 60 * 1000,
  ): Promise<boolean> {
    if (!latestSnapshot) return false;
    const ageMs = now.getTime() - new Date(latestSnapshot.snapshotDate).getTime();
    if (ageMs > freshnessWindowMs) return false;

    await this.updateSnapshotPrice(userId, latestSnapshot.id, result);
    return true;
  }

  async createWeeklySnapshotIfStale(
    userId: string,
    inventoryItemId: string,
    latestSnapshot: PriceSnapshot | undefined,
    result: { rawMarketPrice: number; roundedPrintPrice: number; quantityAfterMerge: number },
    now: Date = new Date(),
    uploadId: string | null = null,
  ): Promise<PriceSnapshot | null> {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    if (latestSnapshot) {
      const ageMs = now.getTime() - new Date(latestSnapshot.snapshotDate).getTime();
      if (ageMs < SEVEN_DAYS_MS) return null;
    }

    return this.createPriceSnapshot(userId, {
      inventoryItemId,
      // Set for snapshots born from a CSV merge so price history stays
      // attributable to the upload that created the item.
      uploadId,
      snapshotDate: now.toISOString(),
      rawMarketPrice: result.rawMarketPrice,
      roundedPrintPrice: result.roundedPrintPrice,
      quantityAfterMerge: result.quantityAfterMerge,
    });
  }

  // ── merge reviews ──────────────────────────────────────────────────────────
  async createMergeReview(userId: string, data: Omit<MergeReview, 'id' | 'userId'>): Promise<MergeReview> {
    return dbOp<MergeReview>(
      supabaseAdmin.from('merge_reviews').insert(toSnake({ ...data, id: crypto.randomUUID(), userId })).select().single()
    );
  }

  async getMergeReviewByUpload(userId: string, uploadId: string): Promise<MergeReview | undefined> {
    const { data } = await supabaseAdmin.from('merge_reviews').select('*').eq('upload_id', uploadId).eq('user_id', userId).maybeSingle();
    return data ? toCamel<MergeReview>(data) : undefined;
  }

  async updateMergeReview(userId: string, id: string, data: Partial<MergeReview>): Promise<MergeReview | undefined> {
    const { data: d } = await supabaseAdmin.from('merge_reviews').update(toSnake(stripMeta(data as any))).eq('id', id).eq('user_id', userId).select().single();
    return d ? toCamel<MergeReview>(d) : undefined;
  }

  // ── label queue ────────────────────────────────────────────────────────────
  async createLabelQueueItem(userId: string, data: Omit<LabelQueueItem, 'id' | 'userId'>): Promise<LabelQueueItem> {
    return dbOp<LabelQueueItem>(
      supabaseAdmin.from('label_queue_items').insert(toSnake({ ...data, id: crypto.randomUUID(), userId })).select().single()
    );
  }

  async listLabelQueueItems(userId: string, queueType?: string, exportStatus?: string): Promise<LabelQueueItem[]> {
    const rows = await fetchAllPages<Record<string, any>>((from, to) => {
      let query = supabaseAdmin.from('label_queue_items').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
      if (queueType) query = query.eq('queue_type', queueType);
      if (exportStatus) query = query.eq('export_status', exportStatus);
      return query.range(from, to);
    });
    return rows.map(toCamel<LabelQueueItem>);
  }

  async getLabelQueueItem(userId: string, id: string): Promise<LabelQueueItem | undefined> {
    const { data } = await supabaseAdmin.from('label_queue_items').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    return data ? toCamel<LabelQueueItem>(data) : undefined;
  }

  async updateLabelQueueItem(userId: string, id: string, data: Partial<LabelQueueItem>): Promise<LabelQueueItem | undefined> {
    const { data: d } = await supabaseAdmin.from('label_queue_items').update(toSnake(stripMeta(data as any))).eq('id', id).eq('user_id', userId).select().single();
    return d ? toCamel<LabelQueueItem>(d) : undefined;
  }

  async bulkUpdateLabelQueueExportStatus(userId: string, ids: string[], exportStatus: string): Promise<void> {
    await supabaseAdmin.from('label_queue_items').update({ export_status: exportStatus }).in('id', ids).eq('user_id', userId);
  }

  async deleteLabelQueueItem(userId: string, id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('label_queue_items').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  // ── app settings ───────────────────────────────────────────────────────────
  async getSetting(userId: string, key: string): Promise<string | undefined> {
    const { data } = await supabaseAdmin.from('app_settings').select('value').eq('user_id', userId).eq('key', key).maybeSingle();
    return data?.value;
  }

  async setSetting(userId: string, key: string, value: string): Promise<void> {
    await supabaseAdmin.from('app_settings').upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' });
  }

  // ── product sales ───────────────────────────────────────────────────────
  /** Every stored sale for a product, newest first — including outliers, which
   *  the expanded view shows struck through rather than hiding. Fetches with a
   *  higher internal limit to ensure enough raw data remains after condition filtering. */
  async listProductSales(sourceProductId: string, limit = 25): Promise<any[]> {
    const { data } = await supabaseAdmin
      .from('product_sales')
      .select('condition, variant, language, quantity, purchase_price, order_date, is_outlier')
      .eq('source_product_id', sourceProductId)
      .order('order_date', { ascending: false })
      .limit(Math.max(200, limit * 10)); // Fetch more raw data to ensure filtering doesn't starve results

    return (data || []).map((r: any) => ({
      condition: r.condition,
      variant: r.variant,
      language: r.language,
      quantity: r.quantity,
      purchasePrice: Number(r.purchase_price),
      orderDate: r.order_date,
      isOutlier: r.is_outlier,
    }));
  }

  /** Items in the shape the sales sweep needs. */
  async listItemsForSalesSweep(
    userId: string,
    opts: { ids?: string[]; minValue?: number; staleHours?: number } = {},
  ): Promise<any[]> {
    const rows = await fetchAllPages<Record<string, any>>((from, to) => {
      let q = supabaseAdmin
        .from('inventory_items')
        .select('id, source_product_id, condition, match_metadata_json, current_raw_market_price, current_rounded_print_price, current_quantity, label_status, price_locked, last_sale_fetched_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('source_product_id', 'is', null)
        .order('id', { ascending: true });

      if (opts.ids?.length) q = q.in('id', opts.ids);
      if (opts.minValue) q = q.gte('current_raw_market_price', opts.minValue);
      if (opts.staleHours) {
        const cutoff = new Date(Date.now() - opts.staleHours * 3600_000).toISOString();
        q = q.or(`last_sale_fetched_at.is.null,last_sale_fetched_at.lt.${cutoff}`);
      }
      return q.range(from, to);
    });

    return rows.map(r => {
      const meta = (() => {
        if (!r.match_metadata_json) return {};
        if (typeof r.match_metadata_json === 'object') return r.match_metadata_json;
        try { return JSON.parse(r.match_metadata_json); } catch { return {}; }
      })();
      return {
        id: r.id as string,
        sourceProductId: r.source_product_id as string | null,
        condition: r.condition as string | null,
        printing: (meta.sourcePrinting ?? null) as string | null,
        currentRawMarketPrice: r.current_raw_market_price == null ? null : Number(r.current_raw_market_price),
        currentRoundedPrintPrice: r.current_rounded_print_price == null ? null : Number(r.current_rounded_print_price),
        currentQuantity: Number(r.current_quantity ?? 0),
        labelStatus: r.label_status as string | null,
        priceLocked: !!r.price_locked,
      };
    });
  }

  async getSalesCheckSettings(userId: string): Promise<{ enabled: boolean; autoAdjust: boolean; windowDays: number }> {
    const [enabled, autoAdjust, windowDays] = await Promise.all([
      this.getSetting(userId, 'sales_check_enabled'),
      this.getSetting(userId, 'sales_auto_adjust_enabled'),
      this.getSetting(userId, 'sales_check_window_days'),
    ]);
    return {
      enabled: enabled !== 'false',
      autoAdjust: autoAdjust !== 'false',
      windowDays: windowDays ? parseInt(windowDays, 10) || 30 : 30,
    };
  }

  async getRepricingThresholds(userId: string): Promise<{ over100Pct: number; mid50to100Pct: number; under50Pct: number }> {
    const raw = await this.getSetting(userId, 'repricing_thresholds');
    if (raw) { try { return JSON.parse(raw); } catch {} }
    return { over100Pct: 5, mid50to100Pct: 7, under50Pct: 10 };
  }

  async setRepricingThresholds(userId: string, t: { over100Pct: number; mid50to100Pct: number; under50Pct: number }): Promise<void> {
    await this.setSetting(userId, 'repricing_thresholds', JSON.stringify(t));
  }

  // ── show ledgers ───────────────────────────────────────────────────────────
  async createShowLedger(userId: string, data: Omit<ShowLedger, 'id' | 'userId' | 'createdAt'>): Promise<ShowLedger> {
    return dbOp<ShowLedger>(
      supabaseAdmin.from('show_ledgers').insert(toSnake({ ...data, id: crypto.randomUUID(), userId, createdAt: new Date().toISOString() })).select().single()
    );
  }

  async getShowLedger(userId: string, id: string): Promise<ShowLedger | undefined> {
    const { data } = await supabaseAdmin.from('show_ledgers').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    return data ? toCamel<ShowLedger>(data) : undefined;
  }

  async listShowLedgers(userId: string): Promise<ShowLedger[]> {
    const { data } = await supabaseAdmin.from('show_ledgers').select('*').eq('user_id', userId).order('show_date', { ascending: false });
    return (data || []).map(toCamel<ShowLedger>);
  }

  async updateShowLedger(userId: string, id: string, data: Partial<ShowLedger>): Promise<ShowLedger | undefined> {
    const { data: d } = await supabaseAdmin.from('show_ledgers').update(toSnake(stripMeta(data as any))).eq('id', id).eq('user_id', userId).select().single();
    return d ? toCamel<ShowLedger>(d) : undefined;
  }

  async deleteShowLedger(userId: string, id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('show_ledgers').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  // ── transactions ───────────────────────────────────────────────────────────
  async createTransaction(userId: string, data: Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
    return dbOp<Transaction>(
      supabaseAdmin.from('transactions').insert(toSnake({ ...data, id: crypto.randomUUID(), userId })).select().single()
    );
  }

  async getTransaction(userId: string, id: string): Promise<Transaction | undefined> {
    const { data } = await supabaseAdmin.from('transactions').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    return data ? toCamel<Transaction>(data) : undefined;
  }

  async listTransactions(userId: string, filters?: { type?: string; channel?: string; showId?: string; attached?: boolean }): Promise<Transaction[]> {
    const rows = await fetchAllPages<Record<string, any>>((from, to) => {
      let query = supabaseAdmin.from('transactions').select('*').eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: true });
      if (filters?.type) query = query.eq('type', filters.type);
      if (filters?.channel) query = query.eq('channel', filters.channel);
      if (filters?.showId) query = query.eq('show_id', filters.showId);
      if (filters?.attached === true) query = query.not('show_id', 'is', null);
      if (filters?.attached === false) query = query.is('show_id', null);
      return query.range(from, to);
    });
    return rows.map(toCamel<Transaction>);
  }

  async updateTransaction(userId: string, id: string, data: Partial<Transaction>): Promise<Transaction | undefined> {
    const patch = toSnake(stripMeta(data as any));
    patch.updated_at = new Date().toISOString();
    const { data: d } = await supabaseAdmin.from('transactions').update(patch).eq('id', id).eq('user_id', userId).select().single();
    return d ? toCamel<Transaction>(d) : undefined;
  }

  // ── transaction items (outgoing) ─────────────────────────────────────────────
  async createTransactionItems(userId: string, transactionId: string, rows: Omit<TransactionItem, 'id' | 'userId' | 'transactionId' | 'createdAt'>[]): Promise<TransactionItem[]> {
    if (!rows.length) return [];
    const insertRows = rows.map(r => toSnake({ ...r, id: crypto.randomUUID(), userId, transactionId }));
    const { data, error } = await supabaseAdmin.from('transaction_items').insert(insertRows).select();
    if (error) throw new Error(error.message);
    return (data || []).map(toCamel<TransactionItem>);
  }

  async listTransactionItems(userId: string, transactionId: string): Promise<TransactionItem[]> {
    const { data } = await supabaseAdmin.from('transaction_items').select('*').eq('user_id', userId).eq('transaction_id', transactionId);
    return (data || []).map(toCamel<TransactionItem>);
  }

  // ── transaction incoming items (trade-ins) ────────────────────────────────────
  async createTransactionIncomingItems(userId: string, transactionId: string, rows: Omit<TransactionIncomingItem, 'id' | 'userId' | 'transactionId' | 'createdAt' | 'updatedAt'>[]): Promise<TransactionIncomingItem[]> {
    if (!rows.length) return [];
    const insertRows = rows.map(r => toSnake({ ...r, id: crypto.randomUUID(), userId, transactionId }));
    const { data, error } = await supabaseAdmin.from('transaction_incoming_items').insert(insertRows).select();
    if (error) throw new Error(error.message);
    return (data || []).map(toCamel<TransactionIncomingItem>);
  }

  async listTransactionIncomingItems(userId: string, transactionId: string): Promise<TransactionIncomingItem[]> {
    const { data } = await supabaseAdmin.from('transaction_incoming_items').select('*').eq('user_id', userId).eq('transaction_id', transactionId);
    return (data || []).map(toCamel<TransactionIncomingItem>);
  }

  async getTransactionIncomingItem(userId: string, transactionId: string, id: string): Promise<TransactionIncomingItem | undefined> {
    const { data } = await supabaseAdmin.from('transaction_incoming_items').select('*').eq('id', id).eq('transaction_id', transactionId).eq('user_id', userId).maybeSingle();
    return data ? toCamel<TransactionIncomingItem>(data) : undefined;
  }

  async updateTransactionIncomingItem(userId: string, id: string, data: Partial<TransactionIncomingItem>): Promise<TransactionIncomingItem | undefined> {
    const patch = toSnake(stripMeta(data as any));
    patch.updated_at = new Date().toISOString();
    const { data: d } = await supabaseAdmin.from('transaction_incoming_items').update(patch).eq('id', id).eq('user_id', userId).select().single();
    return d ? toCamel<TransactionIncomingItem>(d) : undefined;
  }

  // ── dashboard stats ────────────────────────────────────────────────────────
  async getDashboardStats(userId: string): Promise<{
    totalItems: number; totalQuantity: number; totalMarketValue: number;
    newLabelsPending: number; repricingPending: number; uploadsThisWeek: number;
  }> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Totals must page (a plain select stops at 1000 rows and silently
    // under-reports Total Cards / Market Value); counts use an exact count
    // so they stay correct without pulling rows.
    const [items, newLabels, repricing, recentUploads] = await Promise.all([
      fetchAllPages<{ current_quantity: number; current_raw_market_price: number | null; adjusted_market_price: number | null; price_locked: boolean }>((from, to) =>
        supabaseAdmin.from('inventory_items')
          .select('current_quantity,current_raw_market_price,adjusted_market_price,price_locked')
          .eq('user_id', userId).eq('status', 'active')
          .order('id', { ascending: true })
          .range(from, to),
      ),
      supabaseAdmin.from('label_queue_items').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('queue_type', 'new').eq('export_status', 'pending'),
      supabaseAdmin.from('label_queue_items').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('queue_type', 'reprice').eq('export_status', 'pending'),
      supabaseAdmin.from('uploads').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('uploaded_at', oneWeekAgo),
    ]);

    // Effective price follows §2 resolution order: locked → adjusted → market
    const getEffectivePrice = (i: any) => {
      if (i.price_locked) return i.current_raw_market_price ?? 0;
      return (i.adjusted_market_price ?? i.current_raw_market_price) ?? 0;
    };

    return {
      totalItems: items.length,
      totalQuantity: items.reduce((s, i) => s + (i.current_quantity || 0), 0),
      totalMarketValue: items.reduce((s, i) => s + getEffectivePrice(i) * (i.current_quantity || 0), 0),
      newLabelsPending: newLabels.count ?? 0,
      repricingPending: repricing.count ?? 0,
      uploadsThisWeek: recentUploads.count ?? 0,
    };
  }
}

export const storage = new SupabaseStorage();
