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
  // #5: dedicated indexed columns — queried directly instead of JSON casting
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genId(): string {
  return crypto.randomUUID();
}

// camelCase <-> snake_case mappers
function toSnake(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const snake = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    out[snake] = v;
  }
  return out;
}

function toCamel(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

function mapRow<T>(row: Record<string, any>): T {
  return toCamel(row) as T;
}

function mapRows<T>(rows: Record<string, any>[]): T[] {
  return rows.map(r => toCamel(r) as T);
}

// ─── Storage class ────────────────────────────────────────────────────────────
class SupabaseStorage {
  // ── uploads ────────────────────────────────────────────────────────────────
  async createUpload(userId: string, data: Omit<Upload, 'id' | 'userId'>): Promise<Upload> {
    const row = toSnake({ ...data, id: genId(), userId });
    const { data: d, error } = await supabaseAdmin.from('uploads').insert(row).select().single();
    if (error) throw new Error(error.message);
    return mapRow<Upload>(d);
  }

  async getUpload(userId: string, id: string): Promise<Upload | undefined> {
    const { data } = await supabaseAdmin.from('uploads').select('*').eq('id', id).eq('user_id', userId).single();
    return data ? mapRow<Upload>(data) : undefined;
  }

  async listUploads(userId: string): Promise<Upload[]> {
    const { data } = await supabaseAdmin.from('uploads').select('*').eq('user_id', userId).order('uploaded_at', { ascending: false });
    return mapRows<Upload>(data || []);
  }

  async updateUpload(userId: string, id: string, data: Partial<Upload>): Promise<Upload | undefined> {
    const { id: _, userId: __, ...rest } = data as any;
    const { data: d } = await supabaseAdmin.from('uploads').update(toSnake(rest)).eq('id', id).eq('user_id', userId).select().single();
    return d ? mapRow<Upload>(d) : undefined;
  }

  // ── parsed rows ────────────────────────────────────────────────────────────
  async createParsedRows(userId: string, rows: Omit<ParsedRow, 'userId'>[]): Promise<void> {
    const mapped = rows.map(r => toSnake({ ...r, userId }));
    const { error } = await supabaseAdmin.from('parsed_rows').insert(mapped);
    if (error) throw new Error(error.message);
  }

  async getParsedRowsByUpload(userId: string, uploadId: string): Promise<ParsedRow[]> {
    const { data } = await supabaseAdmin.from('parsed_rows').select('*').eq('upload_id', uploadId).eq('user_id', userId);
    return mapRows<ParsedRow>(data || []);
  }

  async updateParsedRow(userId: string, id: string, data: Partial<ParsedRow>): Promise<void> {
    const { id: _, userId: __, ...rest } = data as any;
    await supabaseAdmin.from('parsed_rows').update(toSnake(rest)).eq('id', id).eq('user_id', userId);
  }

  // ── inventory ──────────────────────────────────────────────────────────────
  async createInventoryItem(userId: string, data: Omit<InventoryItem, 'id' | 'userId'>): Promise<InventoryItem> {
    const row = toSnake({ ...data, id: genId(), userId });
    const { data: d, error } = await supabaseAdmin.from('inventory_items').insert(row).select().single();
    if (error) throw new Error(error.message);
    return mapRow<InventoryItem>(d);
  }

  async getInventoryItem(userId: string, id: string): Promise<InventoryItem | undefined> {
    const { data } = await supabaseAdmin.from('inventory_items').select('*').eq('id', id).eq('user_id', userId).single();
    return data ? mapRow<InventoryItem>(data) : undefined;
  }

  async getInventoryItemByMatchKey(userId: string, key: string): Promise<InventoryItem | undefined> {
    const { data } = await supabaseAdmin.from('inventory_items').select('*')
      .eq('user_id', userId).eq('normalized_match_key', key).eq('status', 'active').maybeSingle();
    return data ? mapRow<InventoryItem>(data) : undefined;
  }

  // #5: Query dedicated indexed columns instead of casting match_metadata_json
  // on every row. source_product_id and source_tcgplayer_id are now first-class
  // columns with partial indexes on (user_id, column) WHERE column IS NOT NULL.
  async getInventoryItemByExternalIds(
    userId: string,
    productId?: string,
    tcgplayerId?: string,
  ): Promise<InventoryItem | undefined> {
    if (!productId && !tcgplayerId) return undefined;

    if (productId) {
      const { data } = await supabaseAdmin
        .from('inventory_items')
        .select('*')
        .eq('user_id', userId)
        .eq('source_product_id', productId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (data) return mapRow<InventoryItem>(data);
    }

    if (tcgplayerId) {
      const { data } = await supabaseAdmin
        .from('inventory_items')
        .select('*')
        .eq('user_id', userId)
        .eq('source_tcgplayer_id', tcgplayerId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (data) return mapRow<InventoryItem>(data);
    }

    return undefined;
  }

  async listInventoryItems(userId: string, filters?: { game?: string; condition?: string; status?: string; search?: string }): Promise<InventoryItem[]> {
    let query = supabaseAdmin.from('inventory_items').select('*').eq('user_id', userId);
    const status = filters?.status || 'active';
    query = query.eq('status', status);
    if (filters?.game) query = query.eq('game', filters.game);
    if (filters?.condition) query = query.eq('condition', filters.condition);
    query = query.order('last_seen_at', { ascending: false });
    const { data } = await query;
    let items = mapRows<InventoryItem>(data || []);
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      items = items.filter(i =>
        i.productName.toLowerCase().includes(s) ||
        (i.number && i.number.toLowerCase().includes(s))
      );
    }
    return items;
  }

  async updateInventoryItem(userId: string, id: string, data: Partial<InventoryItem>): Promise<InventoryItem | undefined> {
    const { id: _, userId: __, ...rest } = data as any;
    const { data: d } = await supabaseAdmin.from('inventory_items').update(toSnake(rest)).eq('id', id).eq('user_id', userId).select().single();
    return d ? mapRow<InventoryItem>(d) : undefined;
  }

  // ── price snapshots ────────────────────────────────────────────────────────
  async createPriceSnapshot(userId: string, data: Omit<PriceSnapshot, 'id' | 'userId'>): Promise<PriceSnapshot> {
    const row = toSnake({ ...data, id: genId(), userId });
    const { data: d, error } = await supabaseAdmin.from('price_snapshots').insert(row).select().single();
    if (error) throw new Error(error.message);
    return mapRow<PriceSnapshot>(d);
  }

  async getSnapshotsByItem(userId: string, inventoryItemId: string): Promise<PriceSnapshot[]> {
    const { data } = await supabaseAdmin.from('price_snapshots').select('*')
      .eq('inventory_item_id', inventoryItemId).eq('user_id', userId).order('snapshot_date', { ascending: false });
    return mapRows<PriceSnapshot>(data || []);
  }

  async getLatestSnapshot(userId: string, inventoryItemId: string): Promise<PriceSnapshot | undefined> {
    const { data } = await supabaseAdmin.from('price_snapshots').select('*')
      .eq('inventory_item_id', inventoryItemId).eq('user_id', userId).order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
    return data ? mapRow<PriceSnapshot>(data) : undefined;
  }

  // ── merge reviews ──────────────────────────────────────────────────────────
  async createMergeReview(userId: string, data: Omit<MergeReview, 'id' | 'userId'>): Promise<MergeReview> {
    const row = toSnake({ ...data, id: genId(), userId });
    const { data: d, error } = await supabaseAdmin.from('merge_reviews').insert(row).select().single();
    if (error) throw new Error(error.message);
    return mapRow<MergeReview>(d);
  }

  async getMergeReviewByUpload(userId: string, uploadId: string): Promise<MergeReview | undefined> {
    const { data } = await supabaseAdmin.from('merge_reviews').select('*').eq('upload_id', uploadId).eq('user_id', userId).maybeSingle();
    return data ? mapRow<MergeReview>(data) : undefined;
  }

  async updateMergeReview(userId: string, id: string, data: Partial<MergeReview>): Promise<MergeReview | undefined> {
    const { id: _, userId: __, ...rest } = data as any;
    const { data: d } = await supabaseAdmin.from('merge_reviews').update(toSnake(rest)).eq('id', id).eq('user_id', userId).select().single();
    return d ? mapRow<MergeReview>(d) : undefined;
  }

  // ── label queue ────────────────────────────────────────────────────────────
  async createLabelQueueItem(userId: string, data: Omit<LabelQueueItem, 'id' | 'userId'>): Promise<LabelQueueItem> {
    const row = toSnake({ ...data, id: genId(), userId });
    const { data: d, error } = await supabaseAdmin.from('label_queue_items').insert(row).select().single();
    if (error) throw new Error(error.message);
    return mapRow<LabelQueueItem>(d);
  }

  async listLabelQueueItems(userId: string, queueType?: string, exportStatus?: string): Promise<LabelQueueItem[]> {
    let query = supabaseAdmin.from('label_queue_items').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (queueType) query = query.eq('queue_type', queueType);
    if (exportStatus) query = query.eq('export_status', exportStatus);
    const { data } = await query;
    return mapRows<LabelQueueItem>(data || []);
  }

  async getLabelQueueItem(userId: string, id: string): Promise<LabelQueueItem | undefined> {
    const { data } = await supabaseAdmin.from('label_queue_items').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    return data ? mapRow<LabelQueueItem>(data) : undefined;
  }

  async updateLabelQueueItem(userId: string, id: string, data: Partial<LabelQueueItem>): Promise<LabelQueueItem | undefined> {
    const { id: _, userId: __, ...rest } = data as any;
    const { data: d } = await supabaseAdmin.from('label_queue_items').update(toSnake(rest)).eq('id', id).eq('user_id', userId).select().single();
    return d ? mapRow<LabelQueueItem>(d) : undefined;
  }

  async bulkUpdateLabelQueueExportStatus(userId: string, ids: string[], exportStatus: string): Promise<void> {
    await supabaseAdmin.from('label_queue_items').update({ export_status: exportStatus })
      .in('id', ids).eq('user_id', userId);
  }

  // ── app settings ───────────────────────────────────────────────────────────
  async getSetting(userId: string, key: string): Promise<string | undefined> {
    const { data } = await supabaseAdmin.from('app_settings').select('value').eq('user_id', userId).eq('key', key).maybeSingle();
    return data?.value;
  }

  async setSetting(userId: string, key: string, value: string): Promise<void> {
    await supabaseAdmin.from('app_settings')
      .upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' });
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
    const row = toSnake({ ...data, id: genId(), userId, createdAt: new Date().toISOString() });
    const { data: d, error } = await supabaseAdmin.from('show_ledgers').insert(row).select().single();
    if (error) throw new Error(error.message);
    return mapRow<ShowLedger>(d);
  }

  async getShowLedger(userId: string, id: string): Promise<ShowLedger | undefined> {
    const { data } = await supabaseAdmin.from('show_ledgers').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    return data ? mapRow<ShowLedger>(data) : undefined;
  }

  async listShowLedgers(userId: string): Promise<ShowLedger[]> {
    const { data } = await supabaseAdmin.from('show_ledgers').select('*').eq('user_id', userId).order('show_date', { ascending: false });
    return mapRows<ShowLedger>(data || []);
  }

  async updateShowLedger(userId: string, id: string, data: Partial<ShowLedger>): Promise<ShowLedger | undefined> {
    const { id: _, userId: __, ...rest } = data as any;
    const { data: d } = await supabaseAdmin.from('show_ledgers').update(toSnake(rest)).eq('id', id).eq('user_id', userId).select().single();
    return d ? mapRow<ShowLedger>(d) : undefined;
  }

  async deleteShowLedger(userId: string, id: string): Promise<void> {
    await supabaseAdmin.from('show_ledgers').delete().eq('id', id).eq('user_id', userId);
  }

  // ── dashboard stats ────────────────────────────────────────────────────────
  async getDashboardStats(userId: string): Promise<{
    totalItems: number; totalQuantity: number; totalMarketValue: number;
    newLabelsPending: number; repricingPending: number; uploadsThisWeek: number;
  }> {
    const [{ data: items }, { data: newLabels }, { data: repricing }, { data: recentUploads }] = await Promise.all([
      supabaseAdmin.from('inventory_items').select('current_quantity,current_raw_market_price').eq('user_id', userId).eq('status', 'active'),
      supabaseAdmin.from('label_queue_items').select('id').eq('user_id', userId).eq('queue_type', 'new').eq('export_status', 'pending'),
      supabaseAdmin.from('label_queue_items').select('id').eq('user_id', userId).eq('queue_type', 'reprice').eq('export_status', 'pending'),
      supabaseAdmin.from('uploads').select('id').eq('user_id', userId).gte('uploaded_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);
    const totalItems = items?.length || 0;
    const totalQuantity = (items || []).reduce((s: number, i: any) => s + (i.current_quantity || 0), 0);
    const totalMarketValue = (items || []).reduce((s: number, i: any) => s + (i.current_raw_market_price || 0) * (i.current_quantity || 0), 0);
    return {
      totalItems,
      totalQuantity,
      totalMarketValue,
      newLabelsPending: newLabels?.length || 0,
      repricingPending: repricing?.length || 0,
      uploadsThisWeek: recentUploads?.length || 0,
    };
  }
}

export const storage = new SupabaseStorage();
