/**
 * JustTCG API client — native fetch, zero npm dependencies.
 * Docs: https://justtcg.com/docs/sdk
 */
import { supabaseAdmin } from './supabase.js';

const BASE_URL = 'https://api.justtcg.com/v1';

function apiKey(): string {
  const key = process.env.JUSTTCG_API_KEY;
  if (!key) throw new Error('JUSTTCG_API_KEY env var is not set');
  return key;
}

// ── Condition mapping: CardVault → JustTCG ────────────────────────────────────
const CONDITION_MAP: Record<string, string> = {
  'Near Mint':         'NM',
  'Lightly Played':    'LP',
  'Moderately Played': 'MP',
  'Heavily Played':    'HP',
  'Damaged':           'DMG',
};

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
// JustTCG batch lookup uses GET with a JSON body (not POST).
// Each item is looked up by tcgplayerId + optional condition/printing filters.
async function getBatchCards(
  items: { tcgplayerId: string; condition?: string; printing?: string }[]
): Promise<{ data: any[]; usage?: any }> {
  // Build query string: tcgplayerId can appear multiple times for batch
  const params = new URLSearchParams();
  for (const item of items) {
    params.append('tcgplayerId', item.tcgplayerId);
  }

  const res = await fetch(`${BASE_URL}/cards?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey()}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`JustTCG API ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Extract the matching variant price from a card response ──────────────────
export function extractPrice(
  card: any,
  condition: string,
  printing?: string | null
): PriceResult | null {
  const jtCondition = CONDITION_MAP[condition] ?? 'NM';
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

// ── Batch fetch up to 20 cards, with Supabase cache layer ────────────────────
export async function batchFetchPrices(
  items: {
    id:           string;   // inventory item UUID (for mapping results back)
    tcgplayerId:  string;
    condition:    string;
    printing?:    string | null;
  }[]
): Promise<Map<string, PriceResult>> {
  const resultMap = new Map<string, PriceResult>();
  const toFetch:   typeof items = [];

  // 1. Check Supabase cache first
  for (const item of items) {
    const cacheKey = buildPriceCacheKey(item.tcgplayerId, item.condition, item.printing);
    const { data: cached } = await supabaseAdmin
      .from('price_cache')
      .select('price, price_24hr_chg, price_7d_chg, variant_uuid, card_uuid')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

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

  // 2. Call JustTCG for cache misses — GET /v1/cards with tcgplayerIds
  try {
    const response = await getBatchCards(
      toFetch.map(i => ({
        tcgplayerId: i.tcgplayerId,
        condition:   CONDITION_MAP[i.condition] ?? 'NM',
        printing:    i.printing ?? 'Normal',
      }))
    );

    const cards: any[] = response?.data ?? [];
    const remaining    = response?.usage?.apiDailyRequestsRemaining;
    if (remaining !== undefined) {
      console.log(`[JustTCG] Daily calls remaining: ${remaining}`);
      if (remaining < 10) console.warn('[JustTCG] ⚠️  Approaching daily API limit!');
    }

    // 3. Map results back by tcgplayerId, write to cache
    for (const item of toFetch) {
      const card = cards.find((c: any) => String(c.tcgplayerId) === String(item.tcgplayerId));
      if (!card) continue;

      const priceResult = extractPrice(card, item.condition, item.printing);
      if (!priceResult) continue;

      resultMap.set(item.id, priceResult);

      const cacheKey = buildPriceCacheKey(item.tcgplayerId, item.condition, item.printing);
      await supabaseAdmin.from('price_cache').upsert({
        cache_key:      cacheKey,
        price:          priceResult.price,
        price_24hr_chg: priceResult.priceChange24hr,
        price_7d_chg:   priceResult.priceChange7d,
        variant_uuid:   priceResult.variantUuid,
        card_uuid:      priceResult.cardUuid,
        fetched_at:     new Date().toISOString(),
        expires_at:     expiresAt(priceResult.price),
      }, { onConflict: 'cache_key' });
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

  // Live fetch — single item
  try {
    const response = await getBatchCards([{
      tcgplayerId,
      condition: CONDITION_MAP[condition] ?? 'NM',
      printing:  printing ?? 'Normal',
    }]);

    const card = response?.data?.[0];
    if (!card) return null;

    const priceResult = extractPrice(card, condition, printing);
    if (!priceResult) return null;

    await supabaseAdmin.from('price_cache').upsert({
      cache_key:      cacheKey,
      price:          priceResult.price,
      price_24hr_chg: priceResult.priceChange24hr,
      price_7d_chg:   priceResult.priceChange7d,
      variant_uuid:   priceResult.variantUuid,
      card_uuid:      priceResult.cardUuid,
      fetched_at:     new Date().toISOString(),
      expires_at:     expiresAt(priceResult.price),
    }, { onConflict: 'cache_key' });

    return priceResult;
  } catch (err: any) {
    console.error('[JustTCG] fetchSinglePrice error:', err.message);
    return null;
  }
}
