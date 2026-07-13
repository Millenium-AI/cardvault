/**
 * JustTCG API client — native fetch, zero npm dependencies.
 * Docs: https://justtcg.com/docs/api/cards
 *
 * Identifier priority (per JustTCG docs):
 *   variantId → tcgplayerSkuId → tcgplayerId → ...
 *
 * tcgplayerSkuId (CSV column "TCGplayer Id") resolves directly to a
 * specific variant (condition + printing), giving the most accurate
 * price match. tcgplayerId (CSV column "Product ID") returns all
 * variants for a card and requires condition/printing matching.
 *
 * The API uses POST /v1/cards with a JSON body array of identifier
 * objects — NOT a GET with query params.
 *
 * Caching model: `price_cache` is shared across all users, keyed on
 * the best available identifier + condition + printing. SKU-keyed
 * entries use the skuId as the key prefix for maximum specificity.
 *
 * Fallback: when JustTCG returns a 429 (rate limited), remaining
 * Pokémon and One Piece items are handed off to pokeWalletFallbackFetch.
 * MTG items have no fallback and are skipped with a warning.
 */
import { supabaseAdmin } from './supabase.js';

const BASE_URL = 'https://api.justtcg.com/v1';

// Free tier: 20 cards per batch request.
// Set JUSTTCG_BATCH_SIZE env var to override when upgrading plans.
export const JUSTTCG_BATCH_SIZE = parseInt(process.env.JUSTTCG_BATCH_SIZE ?? '20', 10);

function apiKey(): string {
  const key = process.env.JUSTTCG_API_KEY;
  if (!key) throw new Error('JUSTTCG_API_KEY env var is not set');
  return key;
}

export interface PriceResult {
  price:           number;
  priceChange24hr: number | null;
  priceChange7d:   number | null;
  variantUuid:     string | null;
  cardUuid:        string | null;
}

// ── Build a deterministic cache key ──────────────────────────────────────────
// When we have a tcgplayerSkuId, use it as the key prefix — it already
// encodes the exact variant so condition/printing are redundant but
// included for human readability and collision safety.
export function buildPriceCacheKey(
  tcgplayerId: string,
  condition: string,
  printing?: string | null,
  tcgplayerSkuId?: string | null,
): string {
  const prefix = tcgplayerSkuId ? `sku:${tcgplayerSkuId}` : tcgplayerId;
  return [prefix, condition, printing ?? 'Normal'].join('|').toLowerCase();
}

// ── Dynamic TTL based on card value ──────────────────────────────────────────
function expiresAt(price: number): string {
  const hours = price > 50 ? 6 : price > 10 ? 12 : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

// ── Low-level POST /v1/cards (batch) ─────────────────────────────────────────
// JustTCG expects a POST with a JSON body containing an array of identifier
// objects. tcgplayerSkuId is sent as the primary identifier when available
// (higher precedence per docs), falling back to tcgplayerId.
async function postBatchCards(
  requests: Array<{ tcgplayerId: string; tcgplayerSkuId?: string | null }>
): Promise<{ data: any[]; usage?: any }> {
  const body = requests.map(req =>
    req.tcgplayerSkuId
      ? { tcgplayerSkuId: req.tcgplayerSkuId }
      : { tcgplayerId: req.tcgplayerId }
  );

  const res = await fetch(`${BASE_URL}/cards`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey(),
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    throw Object.assign(new Error('JustTCG rate limit hit (429)'), { status: 429 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`JustTCG API ${res.status}: ${text}`);
  }

  const json = await res.json();
  const remaining = json?.usage?.apiDailyRequestsRemaining;
  if (remaining !== undefined) {
    console.log(`[JustTCG] Daily calls remaining: ${remaining}`);
    if (remaining < 10) console.warn('[JustTCG] ⚠️  Approaching daily API limit!');
  }
  return json;
}

// ── In-flight request de-duplication ─────────────────────────────────────────
// Deduplication key is skuId when available, otherwise productId.
// This prevents concurrent uploads of the same card from burning
// multiple API calls.
const inFlightCardFetches = new Map<string, Promise<any[]>>();

async function getCardsDeduped(
  requests: Array<{ tcgplayerId: string; tcgplayerSkuId?: string | null }>
): Promise<any[]> {
  const dedupeKey = (r: typeof requests[0]) =>
    r.tcgplayerSkuId ? `sku:${r.tcgplayerSkuId}` : `pid:${r.tcgplayerId}`;

  const requestMap = new Map(requests.map(r => [dedupeKey(r), r]));
  const uniqueKeys = Array.from(requestMap.keys());
  const idsToFetch: typeof requests = [];
  const waiters: Promise<any[]>[] = [];

  for (const key of uniqueKeys) {
    const existing = inFlightCardFetches.get(key);
    if (existing) {
      waiters.push(existing);
    } else {
      idsToFetch.push(requestMap.get(key)!);
    }
  }

  let ownPromise: Promise<any[]> | null = null;
  if (idsToFetch.length) {
    ownPromise = postBatchCards(idsToFetch)
      .then(response => response?.data ?? [])
      .finally(() => {
        for (const req of idsToFetch) inFlightCardFetches.delete(dedupeKey(req));
      });
    for (const req of idsToFetch) inFlightCardFetches.set(dedupeKey(req), ownPromise);
  }

  const batches = await Promise.all([
    ...(ownPromise ? [ownPromise] : []),
    ...waiters,
  ]);

  const results: any[] = [];
  for (const batch of batches) results.push(...batch);
  return results;
}

// ── Extract the matching variant price from a card response ──────────────────
export function extractPrice(
  card: any,
  condition: string,
  printing?: string | null,
  resolvedBySkuId?: boolean,
): PriceResult | null {
  const variants: any[] = card.variants || [];

  if (!variants.length) {
    console.warn(`[JustTCG] No variants returned for card ${card.tcgplayerId ?? card.uuid}`);
    return null;
  }

  if (resolvedBySkuId) {
    const v = variants[0];
    if (!v?.price) return null;
    return {
      price:           v.price,
      priceChange24hr: v.priceChange24hr ?? null,
      priceChange7d:   v.priceChange7d   ?? null,
      variantUuid:     v.uuid            ?? null,
      cardUuid:        card.uuid         ?? null,
    };
  }

  const jtCondition = condition || 'Near Mint';
  const jtPrinting  = printing ?? 'Normal';

  let variant = variants.find(
    (v: any) => v.condition === jtCondition && v.printing === jtPrinting
  );

  if (!variant?.price) {
    variant = variants.find((v: any) => v.condition === jtCondition);
    if (variant?.price) {
      console.warn(
        `[JustTCG] Printing mismatch for ${jtCondition}/${jtPrinting} on card ${card.tcgplayerId}. ` +
        `Using fallback printing "${variant.printing}".`
      );
    }
  }

  if (!variant?.price) {
    const available = variants.map((v: any) => `${v.condition}/${v.printing}`).join(', ');
    console.warn(
      `[JustTCG] No variant for ${jtCondition}/${jtPrinting} on card ${card.tcgplayerId}. ` +
      `Available: [${available}]`
    );
    return null;
  }

  return {
    price:           variant.price,
    priceChange24hr: variant.priceChange24hr ?? null,
    priceChange7d:   variant.priceChange7d   ?? null,
    variantUuid:     variant.uuid            ?? null,
    cardUuid:        card.uuid               ?? null,
  };
}

// ── Cache every variant on a card response ───────────────────────────────────
async function cacheAllVariants(
  card: any,
  requestedSkuId?: string | null,
): Promise<void> {
  const variants: any[] = card?.variants ?? [];
  if (!variants.length) return;

  const rows = variants
    .filter(v => v?.price != null && v?.condition)
    .map(v => ({
      cache_key:      buildPriceCacheKey(
        card.tcgplayerId ?? '',
        v.condition,
        v.printing,
        variants.indexOf(v) === 0 && requestedSkuId ? requestedSkuId : null,
      ),
      price:          v.price,
      price_24hr_chg: v.priceChange24hr ?? null,
      price_7d_chg:   v.priceChange7d ?? null,
      variant_uuid:   v.uuid ?? null,
      card_uuid:      card.uuid ?? null,
      fetched_at:     new Date().toISOString(),
      expires_at:     expiresAt(v.price),
    }));

  if (!rows.length) return;
  const { error } = await supabaseAdmin.from('price_cache').upsert(rows, { onConflict: 'cache_key' });
  if (error) console.error('[JustTCG] cacheAllVariants upsert error:', error.message);
}

// ── Batch fetch prices, with a shared cross-user Supabase cache ──────────────
export async function batchFetchPrices(
  items: {
    id:                string;
    tcgplayerId:       string;
    tcgplayerSkuId?:   string | null;
    condition:         string;
    printing?:         string | null;
    game?:             string | null;       // used for fallback routing
    groupId?:          string | null;       // TCGPlayer set group id (Pokémon fallback)
    cardNumber?:       string | null;       // card number (Pokémon/OP fallback)
  }[]
): Promise<Map<string, PriceResult>> {
  const resultMap = new Map<string, PriceResult>();
  if (!items.length) return resultMap;

  // 1. Check Supabase cache
  const cacheKeys = items.map(item =>
    buildPriceCacheKey(item.tcgplayerId, item.condition, item.printing, item.tcgplayerSkuId)
  );

  const { data: cachedRows } = await supabaseAdmin
    .from('price_cache')
    .select('cache_key, price, price_24hr_chg, price_7d_chg, variant_uuid, card_uuid')
    .in('cache_key', cacheKeys)
    .gt('expires_at', new Date().toISOString());

  const cacheByKey = new Map((cachedRows ?? []).map((row: any) => [row.cache_key, row]));
  const toFetch: typeof items = [];

  for (const item of items) {
    const cacheKey = buildPriceCacheKey(item.tcgplayerId, item.condition, item.printing, item.tcgplayerSkuId);
    const cached = cacheByKey.get(cacheKey);

    if (cached?.price) {
      resultMap.set(item.id, {
        price:           cached.price,
        priceChange24hr: cached.price_24hr_chg,
        priceChange7d:   cached.price_7d_chg,
        variantUuid:     cached.variant_uuid,
        cardUuid:        cached.card_uuid,
      });
    } else {
      toFetch.push(item);
    }
  }

  if (!toFetch.length) return resultMap;

  // 2. POST to JustTCG for cache misses
  let justTcgHitRateLimit = false;
  const stillNeedsPricing: typeof items = [];

  try {
    const requestMap = new Map<string, typeof toFetch[0]>();
    for (const item of toFetch) {
      const key = item.tcgplayerSkuId ? `sku:${item.tcgplayerSkuId}` : `pid:${item.tcgplayerId}`;
      if (!requestMap.has(key)) requestMap.set(key, item);
    }

    const cards = await getCardsDeduped(
      Array.from(requestMap.values()).map(item => ({
        tcgplayerId:    item.tcgplayerId,
        tcgplayerSkuId: item.tcgplayerSkuId ?? null,
      }))
    );

    await Promise.all(
      cards.map((card, i) => {
        const req = Array.from(requestMap.values())[i];
        return cacheAllVariants(card, req?.tcgplayerSkuId ?? null);
      })
    );

    for (const item of toFetch) {
      const card = item.tcgplayerSkuId
        ? cards.find((c: any) =>
            c.variants?.some((v: any) => String(v.tcgplayerSkuId) === String(item.tcgplayerSkuId))
          ) ?? cards.find((c: any) => String(c.tcgplayerId) === String(item.tcgplayerId))
        : cards.find((c: any) => String(c.tcgplayerId) === String(item.tcgplayerId));

      if (!card) {
        console.warn(`[JustTCG] No card returned for item ${item.id} (skuId: ${item.tcgplayerSkuId}, productId: ${item.tcgplayerId})`);
        stillNeedsPricing.push(item);
        continue;
      }

      const resolvedBySkuId = !!item.tcgplayerSkuId;
      const priceResult = extractPrice(card, item.condition, item.printing, resolvedBySkuId);
      if (!priceResult) {
        stillNeedsPricing.push(item);
        continue;
      }

      resultMap.set(item.id, priceResult);
    }
  } catch (err: any) {
    if (err?.status === 429) {
      console.warn('[JustTCG] 429 rate limit — routing remaining items to PokéWallet fallback');
      justTcgHitRateLimit = true;
      for (const item of toFetch) {
        if (!resultMap.has(item.id)) stillNeedsPricing.push(item);
      }
    } else {
      console.error('[JustTCG] batchFetchPrices error:', err.message);
    }
  }

  // 3. PokéWallet / BerryWallet fallback for Pokémon + One Piece
  if (stillNeedsPricing.length > 0 && (justTcgHitRateLimit || stillNeedsPricing.length > 0)) {
    const fallbackItems = stillNeedsPricing.filter(item => {
      const game = (item.game ?? '').toLowerCase();
      return game === 'pokemon' || game === 'one_piece' || game === 'onepiece';
    });

    if (fallbackItems.length > 0 && process.env.POKEWALLET_API_KEY) {
      try {
        const { pokeWalletFallbackFetch } = await import('./pokewallet.js');
        const fallbackMap = await pokeWalletFallbackFetch(
          fallbackItems.map(item => ({
            id:          item.id,
            tcgplayerId: item.tcgplayerId,
            condition:   item.condition,
            printing:    item.printing,
            game:        item.game ?? '',
            groupId:     item.groupId ?? null,
            cardNumber:  item.cardNumber ?? null,
          }))
        );
        for (const [id, result] of fallbackMap) resultMap.set(id, result);
      } catch (fbErr: any) {
        console.error('[JustTCG] PokéWallet fallback error:', fbErr.message);
      }
    }

    // Log MTG misses (no fallback available)
    for (const item of stillNeedsPricing) {
      const game = (item.game ?? '').toLowerCase();
      if (game !== 'pokemon' && game !== 'one_piece' && game !== 'onepiece') {
        if (!resultMap.has(item.id)) {
          console.warn(`[JustTCG] No fallback for game "${item.game}" — item ${item.id} unpriced`);
        }
      }
    }
  }

  return resultMap;
}

// ── Single card live lookup ───────────────────────────────────────────────────
export async function fetchSinglePrice(
  tcgplayerId: string,
  condition: string,
  printing?: string | null,
  tcgplayerSkuId?: string | null,
): Promise<PriceResult | null> {
  const cacheKey = buildPriceCacheKey(tcgplayerId, condition, printing, tcgplayerSkuId);

  const { data: cached } = await supabaseAdmin
    .from('price_cache')
    .select('price, price_24hr_chg, price_7d_chg, variant_uuid, card_uuid')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (cached?.price) {
    return {
      price:           cached.price,
      priceChange24hr: cached.price_24hr_chg,
      priceChange7d:   cached.price_7d_chg,
      variantUuid:     cached.variant_uuid,
      cardUuid:        cached.card_uuid,
    };
  }

  try {
    const cards = await getCardsDeduped([{ tcgplayerId, tcgplayerSkuId: tcgplayerSkuId ?? null }]);
    const card = cards[0];
    if (!card) return null;

    await cacheAllVariants(card, tcgplayerSkuId ?? null);

    const resolvedBySkuId = !!tcgplayerSkuId;
    return extractPrice(card, condition, printing, resolvedBySkuId);
  } catch (err: any) {
    console.error('[JustTCG] fetchSinglePrice error:', err.message);
    return null;
  }
}
