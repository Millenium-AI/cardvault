/**
 * JustTCG API client — native fetch, zero npm dependencies.
 * Docs: https://justtcg.com/docs/sdk
 *
 * Caching model: `price_cache` has no user_id column — it is a single
 * table shared across every user of the app, keyed purely on
 * tcgplayerId|condition|printing. A cache hit from one user's upload
 * transparently serves every other user's lookup for the same
 * card+condition+printing. This file also de-dupes concurrent in-flight
 * requests for the same card and caches every variant returned by a
 * single card lookup (not just the one condition/printing requested),
 * so the app burns as few JustTCG API calls as possible as usage grows
 * across many users.
 */
import { supabaseAdmin } from './supabase.js';

const BASE_URL = 'https://api.justtcg.com/v1';

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
export function buildPriceCacheKey(
  tcgplayerId: string,
  condition: string,
  printing?: string | null
): string {
  return [tcgplayerId, condition, printing ?? 'Normal'].join('|').toLowerCase();
}

// ── Dynamic TTL based on card value ──────────────────────────────────────────
function expiresAt(price: number): string {
  const hours = price > 50 ? 6 : price > 10 ? 12 : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

// ── Low-level GET /v1/cards (batch) ──────────────────────────────────────────
// A single call returns ALL variants (every condition + printing) for each
// tcgplayerId requested — condition/printing are not sent as filters, so we
// always get the full picture and can cache it all in one shot.
async function getBatchCards(
  tcgplayerIds: string[]
): Promise<{ data: any[]; usage?: any }> {
  const params = new URLSearchParams();
  for (const id of tcgplayerIds) {
    params.append('tcgplayerId', id);
  }

  const res = await fetch(`${BASE_URL}/cards?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey(),
    },
  });

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
// If two callers (different users, concurrent uploads) ask for the same
// tcgplayerId at the same moment, only one live JustTCG call should happen —
// everyone else awaits that same in-flight promise instead of firing their
// own duplicate request. This matters once many users can trigger uploads
// concurrently: without this, a burst of simultaneous uploads containing the
// same popular cards would multiply API calls needlessly.
const inFlightCardFetches = new Map<string, Promise<any[]>>();

async function getCardsDeduped(tcgplayerIds: string[]): Promise<any[]> {
  const uniqueIds = Array.from(new Set(tcgplayerIds));
  const idsToFetch: string[] = [];
  const waiters: Promise<any[]>[] = [];

  for (const id of uniqueIds) {
    const existing = inFlightCardFetches.get(id);
    if (existing) {
      waiters.push(existing);
    } else {
      idsToFetch.push(id);
    }
  }

  let ownPromise: Promise<any[]> | null = null;
  if (idsToFetch.length) {
    ownPromise = getBatchCards(idsToFetch)
      .then(response => response?.data ?? [])
      .finally(() => {
        for (const id of idsToFetch) inFlightCardFetches.delete(id);
      });
    for (const id of idsToFetch) inFlightCardFetches.set(id, ownPromise);
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
  printing?: string | null
): PriceResult | null {
  const jtCondition = condition || 'Near Mint';
  const jtPrinting  = printing ?? 'Normal';

  const variant =
    card.variants?.find((v: any) => v.condition === jtCondition && v.printing === jtPrinting) ??
    card.variants?.find((v: any) => v.condition === jtCondition) ??
    card.variants?.[0];

  if (!variant?.price) return null;

  return {
    price:           variant.price,
    priceChange24hr: variant.priceChange24hr ?? null,
    priceChange7d:   variant.priceChange7d   ?? null,
    variantUuid:     variant.uuid            ?? null,
    cardUuid:        card.uuid               ?? null,
  };
}

// ── Cache every variant on a card response, not just the one requested ───────
// A single JustTCG response for one tcgplayerId includes ALL conditions and
// printings for that card. Caching only the variant the current upload asked
// for throws away data that would satisfy other lookups (other rows in the
// same upload, or a different user entirely) for a different condition of
// the same card. Writing every variant means the very next lookup for ANY
// condition/printing of this card, by any user, is a cache hit instead of
// another billed API call.
async function cacheAllVariants(card: any): Promise<void> {
  const variants: any[] = card?.variants ?? [];
  if (!variants.length || !card?.tcgplayerId) return;

  const rows = variants
    .filter(v => v?.price != null && v?.condition)
    .map(v => ({
      cache_key:      buildPriceCacheKey(card.tcgplayerId, v.condition, v.printing),
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
    id:           string;   // inventory item UUID (for mapping results back)
    tcgplayerId:  string;
    condition:    string;
    printing?:    string | null;
  }[]
): Promise<Map<string, PriceResult>> {
  const resultMap = new Map<string, PriceResult>();
  if (!items.length) return resultMap;

  // 1. Check Supabase cache first — one batched IN() query instead of N
  // sequential round-trips, so this scales with concurrent uploads instead
  // of serializing on Supabase latency per item.
  const cacheKeys = items.map(item => buildPriceCacheKey(item.tcgplayerId, item.condition, item.printing));
  const { data: cachedRows } = await supabaseAdmin
    .from('price_cache')
    .select('cache_key, price, price_24hr_chg, price_7d_chg, variant_uuid, card_uuid')
    .in('cache_key', cacheKeys)
    .gt('expires_at', new Date().toISOString());

  const cacheByKey = new Map((cachedRows ?? []).map((row: any) => [row.cache_key, row]));
  const toFetch: typeof items = [];

  for (const item of items) {
    const cacheKey = buildPriceCacheKey(item.tcgplayerId, item.condition, item.printing);
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

  // 2. Call JustTCG for cache misses, deduped against any identical
  // in-flight request from a concurrent upload (possibly a different user).
  try {
    const uniqueTcgplayerIds = Array.from(new Set(toFetch.map(i => i.tcgplayerId)));
    const cards = await getCardsDeduped(uniqueTcgplayerIds);

    // 3. Cache EVERY variant on every card returned, not just the requested
    // condition/printing — this is what lets a future lookup for a
    // different condition of the same card, by any user, hit the cache.
    await Promise.all(cards.map(cacheAllVariants));

    // 4. Map results back to the requesting items
    for (const item of toFetch) {
      const card = cards.find((c: any) => String(c.tcgplayerId) === String(item.tcgplayerId));
      if (!card) continue;

      const priceResult = extractPrice(card, item.condition, item.printing);
      if (!priceResult) continue;

      resultMap.set(item.id, priceResult);
    }
  } catch (err: any) {
    console.error('[JustTCG] batchFetchPrices error:', err.message);
  }

  return resultMap;
}

// ── Single card live lookup ───────────────────────────────────────────────────
export async function fetchSinglePrice(
  tcgplayerId: string,
  condition: string,
  printing?: string | null
): Promise<PriceResult | null> {
  const cacheKey = buildPriceCacheKey(tcgplayerId, condition, printing);

  // Cache check
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

  // Live fetch — deduped against any identical in-flight request, and
  // caches every variant returned so future lookups for other
  // conditions/printings of this same card hit cache too.
  try {
    const cards = await getCardsDeduped([tcgplayerId]);
    const card = cards[0];
    if (!card) return null;

    await cacheAllVariants(card);

    return extractPrice(card, condition, printing);
  } catch (err: any) {
    console.error('[JustTCG] fetchSinglePrice error:', err.message);
    return null;
  }
}
