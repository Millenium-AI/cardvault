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
  totalRows: number;
  parseStatus: string;
  summaryJson?: string | null;
}

export interface ParsedRow {
  id: string;
  userId: string;
  uploadId: string;
  rowIndex: number;
  productName: string;
  number?: string | null;
  condition?: string | null;
  rawMarketPrice?: number | null;
  roundedPrintPrice?: number | null;
  addToQuantity: number;
  normalizedMatchKey?: string | null;
  sourceProductId?: string | null;
  sourceTcgplayerId?: string | null;
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
  sourceTcgplayerId?: string | null;
  photoUrl?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  status: string;
}

export interface PriceSnapshot {
  id: string;
  userId: string;
  inventoryItemId: string;
  uploadId: string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = v;
  }
  return out;
}

function toCamel<T>(obj: Record<string, any>): T {
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
  if (error) throw new Error(error.message);
  return toCamel<T>(data!);
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
    const { error } = await supabaseAdmin.from('parsed_rows').insert(rows.map(r => toSnake({ ...r, userId })));
    if (error) throw new Error(error.message);
  }

  async getParsedRowsByUpload(userId: string, uploadId: string): Promise<ParsedRow[]> {
    const { data } = await supabaseAdmin.from('parsed_rows').select('*').eq('upload_id', uploadId).eq('user_id', userId);
    return (data || []).map(toCamel<ParsedRow>);
  }

  async updateParsedRow(userId: string, id: string, data: Partial<ParsedRow>): Promise<void> {
    await supabaseAdmin.from('parsed_rows').update(toSnake(stripMeta(data as any))).eq('id', id).eq('user_id', userId);
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

  async getInventoryItemByExternalIds(userId: string, productId?: string, tcgplayerId?: string): Promise<InventoryItem | undefined> {
    if (!productId && !tcgplayerId) return undefined;

    for (const [col, val] of [['source_product_id', productId], ['source_tcgplayer_id', tcgplayerId]] as const) {
      if (!val) continue;
      const { data } = await supabaseAdmin.from('inventory_items').select('*')
        .eq('user_id', userId).eq(col, val).eq('status', 'active').limit(1).maybeSingle();
      if (data) return toCamel<InventoryItem>(data);
    }
    return undefined;
  }

  /**
   * Bulk-fetch all active inventory for a user and return two lookup Maps:
   * one keyed by source_product_id, one by normalized_match_key.
   * Used during CSV upload matching to avoid N×DB-round-trips.
   */
  async getInventoryLookupMaps(userId: string): Promise<{
    byProductId: Map<string, InventoryItem>;
    byTcgplayerId: Map<string, InventoryItem>;
    byMatchKey: Map<string, InventoryItem>;
  }> {
    const { data, error } = await supabaseAdmin
      .from('inventory_items')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) throw new Error(error.message);

    const byProductId = new Map<string, InventoryItem>();
    const byTcgplayerId = new Map<string, InventoryItem>();
    const byMatchKey = new Map<string, InventoryItem>();

    for (const raw of data || []) {
      const item = toCamel<InventoryItem>(raw);
      if (item.sourceProductId) byProductId.set(item.sourceProductId, item);
      if (item.sourceTcgplayerId) byTcgplayerId.set(item.sourceTcgplayerId, item);
      if (item.normalizedMatchKey) byMatchKey.set(item.normalizedMatchKey, item);
    }

    return { byProductId, byTcgplayerId, byMatchKey };
  }

  async listInventoryItems(userId: string, filters?: { game?: string; condition?: string; status?: string; search?: string }): Promise<InventoryItem[]> {
    let query = supabaseAdmin.from('inventory_items').select('*')
      .eq('user_id', userId)
      .eq('status', filters?.status || 'active')
      .order('last_seen_at', { ascending: false });

    if (filters?.game) query = query.eq('game', filters.game);
    if (filters?.condition) query = query.eq('condition', filters.condition);

    const { data } = await query;
    let items = (data || []).map(toCamel<InventoryItem>);

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      items = items.filter(i =>
        i.productName.toLowerCase().includes(s) ||
        i.number?.toLowerCase().includes(s)
      );
    }
    return items;
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
    const { data } = await supabaseAdmin.from('price_snapshots').select('*')
      .eq('inventory_item_id', inventoryItemId).eq('user_id', userId).order('snapshot_date', { ascending: false });
    return (data || []).map(toCamel<PriceSnapshot>);
  }

  async getLatestSnapshot(userId: string, inventoryItemId: string): Promise<PriceSnapshot | undefined> {
    const { data } = await supabaseAdmin.from('price_snapshots').select('*')
      .eq('inventory_item_id', inventoryItemId).eq('user_id', userId)
      .order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
    return data ? toCamel<PriceSnapshot>(data) : undefined;
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
    let query = supabaseAdmin.from('label_queue_items').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (queueType) query = query.eq('queue_type', queueType);
    if (exportStatus) query = query.eq('export_status', exportStatus);
    const { data } = await query;
    return (data || []).map(toCamel<LabelQueueItem>);
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

  // ── dashboard stats ────────────────────────────────────────────────────────
  async getDashboardStats(userId: string): Promise<{
    totalItems: number; totalQuantity: number; totalMarketValue: number;
    newLabelsPending: number; repricingPending: number; uploadsThisWeek: number;
  }> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: items }, { data: newLabels }, { data: repricing }, { data: recentUploads }] = await Promise.all([
      supabaseAdmin.from('inventory_items').select('current_quantity,current_raw_market_price').eq('user_id', userId).eq('status', 'active'),
      supabaseAdmin.from('label_queue_items').select('id').eq('user_id', userId).eq('queue_type', 'new').eq('export_status', 'pending'),
      supabaseAdmin.from('label_queue_items').select('id').eq('user_id', userId).eq('queue_type', 'reprice').eq('export_status', 'pending'),
      supabaseAdmin.from('uploads').select('id').eq('user_id', userId).gte('uploaded_at', oneWeekAgo),
    ]);

    return {
      totalItems: items?.length || 0,
      totalQuantity: (items || []).reduce((s, i: any) => s + (i.current_quantity || 0), 0),
      totalMarketValue: (items || []).reduce((s, i: any) => s + (i.current_raw_market_price || 0) * (i.current_quantity || 0), 0),
      newLabelsPending: newLabels?.length || 0,
      repricingPending: repricing?.length || 0,
      uploadsThisWeek: recentUploads?.length || 0,
    };
  }
}

export const storage = new SupabaseStorage();
