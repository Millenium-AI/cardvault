/**
 * PokéWallet / BerryWallet fallback pricing client.
 * Used as a secondary price source when JustTCG hits its rate limit.
 *
 * PokéWallet  → Pokémon cards  → GET /api/v1/cards/search?q={groupId} {number}
 * BerryWallet → One Piece cards → GET /api/v1/op/cards/search?q={number}  (e.g. OP01-001)
 *
 * Both share the same API key (POKEWALLET_API_KEY) and the same
 * rate-limit budget: 100 req/hr, 1,000 req/day on the free tier.
 *
 * Rate limit headers returned on every response:
 *   X-RateLimit-Remaining-Hour
 *   X-RateLimit-Remaining-Day
 *
 * We track remaining quota in memory so callers can check before
 * spending a request they can't afford.
 *
 * Identifier mapping from your existing DB fields:
 *   Pokémon  → sourcePayload.groupId (set group id) + sourcePayload.number
 *   One Piece → sourcePayload.number  (e.g. "OP01-001")
 *
 * Both are stored in parsed_rows.source_payload / match_metadata_json
 * and are available on the inventory item via matchMetadataJson.
 */

import { supabaseAdmin } from './supabase.js';
import type { PriceResult } from './justtcg.js';
import { buildPriceCacheKey } from './justtcg.js';

const POKEWALLET_BASE = 'https://www.pokewallet.io/api/v1';
const BERRYWALLET_BASE = 'https://www.pokewallet.io/api/v1/op';

function apiKey(): string {
  const key = process.env.POKEWALLET_API_KEY;
  if (!key) throw new Error('POKEWALLET_API_KEY env var is not set');
  return key;
}

// ── In-memory rate limit tracking ────────────────────────────────────────────
let remainingHour = 100;
let remainingDay  = 1000;

export function getPokeWalletQuota() {
  return { remainingHour, remainingDay };
}

export function hasPokeWalletQuota(): boolean {
  return remainingHour > 0 && remainingDay > 0;
}

function updateQuotaFromHeaders(headers: Headers): void {
  const h = headers.get('X-RateLimit-Remaining-Hour');
  const d = headers.get('X-RateLimit-Remaining-Day');
  if (h !== null) remainingHour = parseInt(h, 10);
  if (d !== null) remainingDay  = parseInt(d, 10);
  if (remainingHour < 10) console.warn(`[PokéWallet] ⚠️  Only ${remainingHour} hourly requests remaining!`);
  if (remainingDay  < 20) console.warn(`[PokéWallet] ⚠️  Only ${remainingDay} daily requests remaining!`);
}

// ── Dynamic TTL (mirrors JustTCG logic) ──────────────────────────────────────
function expiresAt(price: number): string {
  const hours = price > 50 ? 6 : price > 10 ? 12 : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

// ── Low-level GET helper ──────────────────────────────────────────────────────
async function getJson(url: string): Promise<{ data: any; status: number }> {
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey() },
  });
  updateQuotaFromHeaders(res.headers);
  if (res.status === 429) throw Object.assign(new Error('PokéWallet rate limit hit'), { status: 429 });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`PokéWallet API ${res.status}: ${text}`);
  }
  return { data: await res.json(), status: res.status };
}

// ── Pokémon card lookup ───────────────────────────────────────────────────────
// Searches by TCGPlayer groupId (set) + card number for a precise match.
async function fetchPokemonPrice(
  groupId: string,
  cardNumber: string,
  condition: string,
  printing?: string | null,
): Promise<PriceResult | null> {
  const q = encodeURIComponent(`${groupId} ${cardNumber}`);
  const { data } = await getJson(`${POKEWALLET_BASE}/cards/search?q=${q}`);

  const card = Array.isArray(data?.results) ? data.results[0] : data?.card ?? null;
  if (!card) return null;

  // PokéWallet price object shape: card.tcgplayer.prices[condition].market
  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const jtCondition = condition || 'Near Mint';
  const conditionKey = jtCondition.toLowerCase().replace(/\s+/g, '_');
  const priceObj = prices[conditionKey] ?? prices['near_mint'] ?? null;
  if (!priceObj?.market) return null;

  return {
    price:           priceObj.market,
    priceChange24hr: null,
    priceChange7d:   null,
    variantUuid:     card.id ?? null,
    cardUuid:        card.id ?? null,
  };
}

// ── One Piece card lookup (BerryWallet) ───────────────────────────────────────
// Searches by card number (e.g. "OP01-001").
async function fetchOnePiecePrice(
  cardNumber: string,
  condition: string,
): Promise<PriceResult | null> {
  const q = encodeURIComponent(cardNumber);
  const { data } = await getJson(`${BERRYWALLET_BASE}/cards/search?q=${q}`);

  const card = Array.isArray(data?.results) ? data.results[0] : data?.card ?? null;
  if (!card) return null;

  const prices = card?.tcgplayer?.prices;
  if (!prices) return null;

  const jtCondition = condition || 'Near Mint';
  const conditionKey = jtCondition.toLowerCase().replace(/\s+/g, '_');
  const priceObj = prices[conditionKey] ?? prices['near_mint'] ?? null;
  if (!priceObj?.market) return null;

  return {
    price:           priceObj.market,
    priceChange24hr: null,
    priceChange7d:   null,
    variantUuid:     card.id ?? null,
    cardUuid:        card.id ?? null,
  };
}

// ── Write a price hit to the shared price_cache ───────────────────────────────
async function cachePokeWalletPrice(
  tcgplayerId: string,
  condition: string,
  printing: string | null | undefined,
  result: PriceResult,
): Promise<void> {
  const row = {
    cache_key:      buildPriceCacheKey(tcgplayerId, condition, printing),
    price:          result.price,
    price_24hr_chg: null,
    price_7d_chg:   null,
    variant_uuid:   result.variantUuid,
    card_uuid:      result.cardUuid,
    fetched_at:     new Date().toISOString(),
    expires_at:     expiresAt(result.price),
  };
  const { error } = await supabaseAdmin
    .from('price_cache')
    .upsert(row, { onConflict: 'cache_key' });
  if (error) console.error('[PokéWallet] cache upsert error:', error.message);
}

// ── Public: batch fallback fetch ──────────────────────────────────────────────
// Called by justtcg.ts batchFetchPrices when JustTCG returns a 429.
// Only processes Pokémon and One Piece items — MTG is skipped.
export async function pokeWalletFallbackFetch(
  items: {
    id:              string;
    tcgplayerId:     string;
    condition:       string;
    printing?:       string | null;
    game:            string;   // 'pokemon' | 'one_piece' | other
    groupId?:        string | null;  // TCGPlayer set group id (Pokémon)
    cardNumber?:     string | null;  // card number e.g. "OP01-001" or "148"
  }[]
): Promise<Map<string, PriceResult>> {
  const resultMap = new Map<string, PriceResult>();
  if (!items.length) return resultMap;
  if (!process.env.POKEWALLET_API_KEY) {
    console.warn('[PokéWallet] POKEWALLET_API_KEY not set — skipping fallback');
    return resultMap;
  }

  for (const item of items) {
    if (!hasPokeWalletQuota()) {
      console.warn('[PokéWallet] Daily/hourly quota exhausted — stopping fallback early');
      break;
    }

    const game = (item.game ?? '').toLowerCase();

    try {
      let result: PriceResult | null = null;

      if (game === 'pokemon' && item.groupId && item.cardNumber) {
        result = await fetchPokemonPrice(item.groupId, item.cardNumber, item.condition, item.printing);
      } else if ((game === 'one_piece' || game === 'onepiece') && item.cardNumber) {
        result = await fetchOnePiecePrice(item.cardNumber, item.condition);
      } else {
        // MTG or unknown game — no fallback available
        console.warn(`[PokéWallet] No fallback available for game "${item.game}" (item ${item.id})`);
        continue;
      }

      if (!result) {
        console.warn(`[PokéWallet] No price found for item ${item.id} (${item.game} / ${item.cardNumber})`);
        continue;
      }

      resultMap.set(item.id, result);
      await cachePokeWalletPrice(item.tcgplayerId, item.condition, item.printing, result);
    } catch (err: any) {
      if (err?.status === 429) {
        console.warn('[PokéWallet] 429 received mid-batch — stopping fallback');
        break;
      }
      console.error(`[PokéWallet] Error fetching item ${item.id}:`, err.message);
    }
  }

  console.log(`[PokéWallet] Fallback resolved ${resultMap.size}/${items.length} items`);
  return resultMap;
}
