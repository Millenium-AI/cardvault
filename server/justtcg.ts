import { supabaseAdmin } from './supabase.js';

const BASE_URL_V1 = 'https://api.justtcg.com/v1';
const BASE_URL_V2 = 'https://api.justtcg.com/v2';

export const JUSTTCG_BATCH_SIZE = parseInt(process.env.JUSTTCG_BATCH_SIZE ?? '20', 10);

function apiKey(keyIndex: 1 | 2 = 1): string {
  const key = keyIndex === 1 ? process.env.JUSTTCG_API_KEY : process.env.JUSTTCG_API_KEY2;
  if (!key) throw new Error(`JUSTTCG_API_KEY${keyIndex} env var is not set`);
  return key;
}

export interface PriceResult {
  price: number;
  priceChange24hr: number | null;
  priceChange7d: number | null;
  variantUuid: string | null;
  cardUuid: string | null;
}

export function buildPriceCacheKey(
  tcgplayerId: string,
  condition: string,
  printing?: string | null,
  tcgplayerSkuId?: string | null,
): string {
  const prefix = tcgplayerSkuId ? `sku:${tcgplayerSkuId}` : tcgplayerId;
  return [prefix, condition, printing ?? 'Normal'].join('|').toLowerCase();
}

function expiresAt(price: number): string {
  const hours = price > 50 ? 6 : price > 10 ? 12 : 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function normaliseGame(game?: string | null): string {
  const g = (game ?? '').toLowerCase().trim();
  if (g === 'one_piece' || g === 'onepiece' || g === 'one-piece') return 'one-piece';
  return g;
}

async function postBatchCards(
  requests: Array<{ tcgplayerId: string; tcgplayerSkuId?: string | null }>
): Promise<{ data: any[]; usage?: any }> {
  const body = requests.map(req =>
    req.tcgplayerSkuId
      ? { tcgplayerSkuId: req.tcgplayerSkuId }
      : { tcgplayerId: req.tcgplayerId }
  );

  const url = `${BASE_URL_V1}/cards`;
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey(1) },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    console.warn('[JustTCG] API key 1 returned 401, trying key 2');
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey(2) },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        console.log('[JustTCG] API key 2 succeeded');
      }
    } catch (err: any) {
      console.error('[JustTCG] API key 2 also failed:', err.message);
      throw Object.assign(new Error('JustTCG API 401 — both keys failed'), { status: 401 });
    }
  }

  if (res.status === 429) throw Object.assign(new Error('JustTCG rate limit hit (429)'), { status: 429 });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`JustTCG API ${res.status}: ${text}`);
  }

  const json = await res.json();
  const remaining = json?.usage?.apiDailyRequestsRemaining;
  if (remaining !== undefined) {
    console.log(`[JustTCG] Daily calls remaining: ${remaining}`);
    if (remaining < 10) console.warn('[JustTCG] ⚠️ Approaching daily API limit!');
  }

  return json;
}

const inFlightCardFetches = new Map<string, Promise<any[]>>();

async function getCardsDeduped(
  requests: Array<{ tcgplayerId: string; tcgplayerSkuId?: string | null }>
): Promise<any[]> {
  const dedupeKey = (r: typeof requests[0]) =>
    r.tcgplayerSkuId ? `sku:${r.tcgplayerSkuId}` : `pid:${r.tcgplayerId}`;

  const requestMap = new Map(requests.map(r => [dedupeKey(r), r]));
  const idsToFetch: typeof requests = [];
  const waiters: Promise<any[]>[] = [];

  for (const key of Array.from(requestMap.keys())) {
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

  const batches = await Promise.all([...(ownPromise ? [ownPromise] : []), ...waiters]);
  const results: any[] = [];
  for (const batch of batches) results.push(...batch);
  return results;
}

export function extractPrice(
  card: any,
  condition: string,
  printing?: string | null,
  resolvedBySkuId?: boolean,
): PriceResult | null {
  const variants: any[] = card.variants || [];

  if (!variants.length) {
    const cardId = card.tcgplayerId ?? card.tcgplayer_id ?? card.uuid ?? card.id;
    console.warn(`[JustTCG] No variants for card ${cardId}`);
    return null;
  }

  if (resolvedBySkuId) {
    const v = variants[0];
    if (!v?.price) return null;
    const price = v.price ?? null;
    const priceChange24hr = v.priceChange24hr ?? v.price_change_24hr ?? null;
    const priceChange7d = v.priceChange7d ?? v.price_change_7d ?? null;
    const uuid = v.uuid ?? v.variant_uuid ?? null;
    const cardUuid = card.uuid ?? card.card_uuid ?? null;

    return {
      price,
      priceChange24hr,
      priceChange7d,
      variantUuid: uuid,
      cardUuid,
    };
  }

  const jtCondition = condition || 'Near Mint';
  const jtPrinting = printing ?? 'Normal';

  const rawVariants = variants.filter((v: any) => {
    const type = v.type ?? 'raw';
    return type === 'raw' || !v.type;
  });

  const availableVariants = rawVariants.length > 0 ? rawVariants : variants;

  let variant = availableVariants.find((v: any) => {
    const vCondition = v.condition ?? v.grade ?? null;
    const vPrinting = v.printing ?? 'Normal';
    return vCondition === jtCondition && vPrinting === jtPrinting;
  });

  if (!variant?.price) {
    variant = availableVariants.find((v: any) => {
      const vCondition = v.condition ?? v.grade ?? null;
      return vCondition === jtCondition;
    });

    if (variant?.price) {
      const vPrinting = variant.printing ?? 'Normal';
      console.warn(
        `[JustTCG] Printing mismatch for ${jtCondition}/${jtPrinting} on ${card.tcgplayerId ?? card.tcgplayer_id} — using "${vPrinting}"`
      );
    }
  }

  if (!variant?.price) {
    const cardId = card.tcgplayerId ?? card.tcgplayer_id ?? card.uuid ?? card.id;
    const available = availableVariants
      .map((v: any) => {
        const cond = v.condition ?? v.grade ?? '?';
        const print = v.printing ?? 'Normal';
        return `${cond}/${print}`;
      })
      .join(', ');

    console.warn(`[JustTCG] No variant for ${jtCondition}/${jtPrinting} on ${cardId}. Available: [${available}]`);
    return null;
  }

  const price = variant.price ?? null;
  const priceChange24hr = variant.priceChange24hr ?? variant.price_change_24hr ?? null;
  const priceChange7d = variant.priceChange7d ?? variant.price_change_7d ?? null;
  const variantUuid = variant.uuid ?? variant.variant_uuid ?? null;
  const cardUuid = card.uuid ?? card.card_uuid ?? null;

  return {
    price,
    priceChange24hr,
    priceChange7d,
    variantUuid,
    cardUuid,
  };
}

async function cacheAllVariants(card: any, requestedSkuId?: string | null): Promise<void> {
  const variants: any[] = card?.variants ?? [];
  if (!variants.length) return;

  const cardId = card.tcgplayerId ?? card.tcgplayer_id ?? '';
  const cardUuid = card.uuid ?? card.card_uuid ?? null;

  const rows = variants
    .filter(v => {
      const price = v.price ?? null;
      const condition = v.condition ?? v.grade ?? null;
      return price != null && condition;
    })
    .map(v => {
      const price = v.price ?? null;
      const condition = v.condition ?? v.grade ?? null;
      const printing = v.printing ?? 'Normal';
      const tcgplayerSkuId = v.tcgplayerSkuId ?? v.tcgplayer_sku_id ?? null;

      const isSkuMatch =
        requestedSkuId != null &&
        tcgplayerSkuId != null &&
        String(tcgplayerSkuId) === String(requestedSkuId);

      return {
        cache_key: buildPriceCacheKey(cardId, condition, printing, isSkuMatch ? requestedSkuId : null),
        price,
        price_24hr_chg: v.priceChange24hr ?? v.price_change_24hr ?? null,
        price_7d_chg: v.priceChange7d ?? v.price_change_7d ?? null,
        variant_uuid: v.uuid ?? v.variant_uuid ?? null,
        card_uuid: cardUuid,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt(price),
      };
    });

  if (!rows.length) return;
  const { error } = await supabaseAdmin.from('price_cache').upsert(rows, { onConflict: 'cache_key' });
  if (error) console.error('[JustTCG] cacheAllVariants error:', error.message);
}

export async function batchFetchPrices(
  items: {
    id: string;
    tcgplayerId: string;
    tcgplayerSkuId?: string | null;
    condition: string;
    printing?: string | null;
    game?: string | null;
    groupId?: string | null;
    cardNumber?: string | null;
  }[]
): Promise<Map<string, PriceResult>> {
  const resultMap = new Map<string, PriceResult>();
  if (!items.length) return resultMap;

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
    const key = buildPriceCacheKey(item.tcgplayerId, item.condition, item.printing, item.tcgplayerSkuId);
    const cached = cacheByKey.get(key);

    if (cached?.price) {
      resultMap.set(item.id, {
        price: cached.price,
        priceChange24hr: cached.price_24hr_chg,
        priceChange7d: cached.price_7d_chg,
        variantUuid: cached.variant_uuid,
        cardUuid: cached.card_uuid,
      });
    } else {
      toFetch.push(item);
    }
  }

  if (!toFetch.length) return resultMap;

  const stillNeedsPricing: typeof items = [];

  try {
    const requestMap = new Map<string, (typeof items)[number]>();

    for (const item of toFetch) {
      const key = item.tcgplayerSkuId ? `sku:${item.tcgplayerSkuId}` : `pid:${item.tcgplayerId}`;
      if (!requestMap.has(key)) requestMap.set(key, item);
    }

    const cards = await getCardsDeduped(
      Array.from(requestMap.values()).map(item => ({
        tcgplayerId: item.tcgplayerId,
        tcgplayerSkuId: item.tcgplayerSkuId ?? null,
      }))
    );

    await Promise.all(
      cards.map((card: any) => {
        const req = Array.from(requestMap.values()).find(item =>
          item.tcgplayerSkuId
            ? card.variants?.some((v: any) => String(v.tcgplayerSkuId) === String(item.tcgplayerSkuId))
            : String(card.tcgplayerId) === String(item.tcgplayerId)
        );
        return cacheAllVariants(card, req?.tcgplayerSkuId ?? null);
      })
    );

    for (const item of toFetch) {
      const card = item.tcgplayerSkuId
        ? cards.find((c: any) => c.variants?.some((v: any) => String(v.tcgplayerSkuId) === String(item.tcgplayerSkuId))) ??
          cards.find((c: any) => String(c.tcgplayerId) === String(item.tcgplayerId))
        : cards.find((c: any) => String(c.tcgplayerId) === String(item.tcgplayerId));

      if (!card) {
        console.warn(`[JustTCG] No card for item ${item.id} (sku: ${item.tcgplayerSkuId}, pid: ${item.tcgplayerId})`);
        stillNeedsPricing.push(item);
        continue;
      }

      const priceResult = extractPrice(card, item.condition, item.printing, !!item.tcgplayerSkuId);
      if (!priceResult) {
        stillNeedsPricing.push(item);
        continue;
      }

      resultMap.set(item.id, priceResult);
    }
  } catch (err: any) {
    if (err?.status === 429) {
      console.warn('[JustTCG] 429 — routing to fallback');
      for (const item of toFetch) {
        if (!resultMap.has(item.id)) stillNeedsPricing.push(item);
      }
    } else {
      console.error('[JustTCG] batchFetchPrices error:', err.message);
    }
  }

  if (stillNeedsPricing.length > 0 && process.env.POKEWALLET_API_KEY) {
    const fallbackItems = stillNeedsPricing.filter(item => {
      const game = normaliseGame(item.game);
      return game === 'pokemon' || game === 'one-piece';
    });

    if (fallbackItems.length > 0) {
      try {
        const { pokeWalletFallbackFetch } = await import('./pokewallet.js');
        const fallbackMap = await pokeWalletFallbackFetch(
          fallbackItems.map(item => ({
            id: item.id,
            tcgplayerId: item.tcgplayerId,
            condition: item.condition,
            printing: item.printing,
            game: normaliseGame(item.game).replace('one-piece', 'one_piece'),
            groupId: item.groupId ?? null,
            cardNumber: item.cardNumber ?? null,
          }))
        );
        for (const [id, result] of fallbackMap) resultMap.set(id, result);
      } catch (fbErr: any) {
        console.error('[JustTCG] PokéWallet fallback error:', fbErr.message);
      }
    }

    for (const item of stillNeedsPricing) {
      const game = normaliseGame(item.game);
      if (game !== 'pokemon' && game !== 'one-piece' && !resultMap.has(item.id)) {
        console.warn(`[JustTCG] No fallback for game "${item.game}" — item ${item.id} unpriced`);
      }
    }
  }

  return resultMap;
}

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
      price: cached.price,
      priceChange24hr: cached.price_24hr_chg,
      priceChange7d: cached.price_7d_chg,
      variantUuid: cached.variant_uuid,
      cardUuid: cached.card_uuid,
    };
  }

  try {
    const cards = await getCardsDeduped([{ tcgplayerId, tcgplayerSkuId: tcgplayerSkuId ?? null }]);
    const card = cards[0];
    if (!card) return null;
    await cacheAllVariants(card, tcgplayerSkuId ?? null);
    return extractPrice(card, condition, printing, !!tcgplayerSkuId);
  } catch (err: any) {
    console.error('[JustTCG] fetchSinglePrice error:', err.message);
    return null;
  }
}

const GAME_SLUG_TO_JUSTTCG: Record<string, string> = {
  pokemon: 'pokemon',
  'pokemon-jp': 'pokemon-japan',
  'one-piece': 'one-piece-card-game',
  sorcery: 'sorcery-contested-realm',
  'dragon-ball': 'dragon-ball-super-fusion-world',
  mtg: 'magic-the-gathering',
  'star-wars': 'star-wars-unlimited',
  lorcana: 'disney-lorcana',
  yugioh: 'yugioh',
  digimon: 'digimon-card-game',
};

export function toJustTcgGame(internalGame?: string | null): string | null {
  if (!internalGame) return null;
  return GAME_SLUG_TO_JUSTTCG[internalGame.toLowerCase().trim()] ?? null;
}

export interface SearchResultVariant {
  variantUuid: string | null;
  condition: string | null;
  printing: string | null;
  price: number | null;
  priceChange24hr: number | null;
  priceChange7d: number | null;
  tcgplayerSkuId: string | null;
  grade?: string | null;
  gradingCompany?: string | null;
  type?: string | null;
}

export interface SearchResultCard {
  source: 'justtcg';
  cardUuid: string | null;
  name: string;
  game: string | null;
  setName: string | null;
  number: string | null;
  rarity: string | null;
  tcgplayerId: string | null;
  imageUrl: string | null;
  isSealed: boolean;
  variants: SearchResultVariant[];
}

function isSealedProduct(card: any, name: string, variants: any[]): boolean {
  const cardIsSealed =
    card?.isSealed ?? card?.is_sealed ?? card?.sealed ?? card?.issealed ?? false;

  const sealedKeywords = [
    'booster box',
    'booster pack',
    'booster bundle',
    'booster case',
    'elite trainer box',
    'build & battle',
    'build and battle',
    'blister',
    'blister pack',
    'bundle',
    'bundle case',
    'case',
    'box',
  ];

  const nameLower = (name ?? '').toLowerCase();
  const hasKeyword = sealedKeywords.some(keyword => nameLower.includes(keyword));

  const hasSealedCondition = variants.some((v: any) => {
    const condition = String(v.condition ?? v.grade ?? v.type ?? '').toLowerCase();
    const printing = String(v.printing ?? '').toLowerCase();
    const type = String(v.type ?? '').toLowerCase();

    return (
      condition.includes('sealed') ||
      condition.includes('unopened') ||
      printing.includes('sealed') ||
      type.includes('sealed') ||
      condition === 'sealed'
    );
  });

  if (cardIsSealed) return true;
  if (hasSealedCondition) return true;
  if (hasKeyword) return true;

  return false;
}

function mapJustTcgCardToSearchResult(card: any, isV2 = false): SearchResultCard {
  const variants: any[] = card.variants ?? [];

  const getField = (camelCase: string, snakeCase: string) =>
    isV2 ? (card[snakeCase] ?? card[camelCase]) : (card[camelCase] ?? card[snakeCase]);

  const tcgplayerId = getField('tcgplayerId', 'tcgplayer_id');
  const uuid = getField('uuid', 'uuid');
  const name = getField('name', 'name');
  const game = getField('game', 'game');
  const setName = getField('setName', 'set_name') ?? getField('set', 'set');
  const number = getField('number', 'number');
  const rarity = getField('rarity', 'rarity');

  return {
    source: 'justtcg',
    cardUuid: uuid ?? null,
    name,
    game: game ?? null,
    setName: setName ?? null,
    number: number ?? null,
    rarity: rarity ?? null,
    tcgplayerId: tcgplayerId ?? null,
    imageUrl: tcgplayerId
      ? `https://product-images.tcgplayer.com/fit-in/1000x1000/${tcgplayerId}.jpg`
      : null,
    isSealed: isSealedProduct(card, name, variants),
    variants: variants.map((v: any) => {
      const getVField = (camelCase: string, snakeCase: string) =>
        isV2 ? (v[snakeCase] ?? v[camelCase]) : (v[camelCase] ?? v[snakeCase]);

      const condition = getVField('condition', 'condition') ?? getVField('grade', 'grade') ?? null;

      return {
        variantUuid: getVField('uuid', 'uuid') ?? getVField('variantUuid', 'variant_uuid') ?? null,
        condition,
        printing: getVField('printing', 'printing') ?? null,
        price: getVField('price', 'price') ?? null,
        priceChange24hr: getVField('priceChange24hr', 'price_change_24hr') ?? null,
        priceChange7d: getVField('priceChange7d', 'price_change_7d') ?? null,
        tcgplayerSkuId: getVField('tcgplayerSkuId', 'tcgplayer_sku_id') ?? null,
        grade: getVField('grade', 'grade') ?? null,
        gradingCompany: getVField('gradingCompany', 'grading_company') ?? null,
        type: getVField('type', 'type') ?? null,
      };
    }),
  };
}

export interface SearchCardsParams {
  query: string;
  game?: string | null;
  set?: string | null;
  limit?: number;
  graded?: 'exclude' | 'only' | 'include';
  gradingCompany?: string | null;
  grade?: string | null;
}

function buildSearchParams(params: SearchCardsParams, version: 'v1' | 'v2'): URLSearchParams {
  const search = new URLSearchParams();
  search.set('q', params.query.trim());
  search.set('limit', String(Math.min(params.limit ?? 20, 20)));

  const justTcgGame = toJustTcgGame(params.game);
  if (justTcgGame) search.set('game', justTcgGame);
  if (params.set?.trim()) search.set('set', params.set.trim());

  if (version === 'v2') {
    if (params.graded) search.set('graded', params.graded);
    if (params.gradingCompany?.trim()) search.set('grading_company', params.gradingCompany.trim());
    if (params.grade?.trim()) search.set('grade', params.grade.trim());
  }

  return search;
}

function needsV2Search(params: SearchCardsParams): boolean {
  return Boolean(
    (params.graded && params.graded !== 'exclude') ||
      params.gradingCompany?.trim() ||
      params.grade?.trim()
  );
}

async function fetchSearchEndpoint(url: string, label: string): Promise<Response> {
  let res = await fetch(url, {
    headers: { 'x-api-key': apiKey(1) },
  });

  if (res.status === 401) {
    console.warn(`[JustTCG] Search (${label}): API key 1 returned 401, trying key 2`);
    try {
      res = await fetch(url, {
        headers: { 'x-api-key': apiKey(2) },
      });
      if (res.status === 401) {
        console.error(`[JustTCG] Search (${label}): API key 2 also returned 401`);
        throw Object.assign(new Error(`JustTCG search ${label} API 401 — both keys failed`), { status: 401 });
      }
      if (res.ok) {
        console.log(`[JustTCG] Search (${label}): API key 2 succeeded`);
      }
    } catch (err: any) {
      if (err?.status === 401) throw err;
      console.error(`[JustTCG] Search (${label}): Fallback key network error:`, err.message);
      throw Object.assign(new Error(`JustTCG search ${label} API 401`), { status: 401 });
    }
  }

  if (res.status === 429) throw Object.assign(new Error('JustTCG rate limit hit (429)'), { status: 429 });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`JustTCG search ${label} API ${res.status}: ${text}`);
  }

  return res;
}

export async function searchCards(params: SearchCardsParams): Promise<SearchResultCard[]> {
  const query = params.query?.trim();
  if (!query) return [];

  const useV2 = needsV2Search(params);
  const version: 'v1' | 'v2' = useV2 ? 'v2' : 'v1';
  const baseUrl = version === 'v2' ? BASE_URL_V2 : BASE_URL_V1;
  const search = buildSearchParams({ ...params, query }, version);
  const url = `${baseUrl}/cards?${search.toString()}`;

  const res = await fetchSearchEndpoint(url, version);
  const json = await res.json();

  console.log(`[JustTCG] Search: ${version} endpoint returned ${json?.data?.length ?? 0} results`);

  return (json?.data ?? []).map((card: any) => mapJustTcgCardToSearchResult(card, version === 'v2'));
}

interface JustTcgSetRow {
  game: string;
  set_id: string;
  set_name: string;
  fetched_at: string;
  release_date: string | null;
  set_value_usd: number | null;
  variants_count: number | null;
  sealed_count: number | null;
}

export async function syncSetsForGame(internalGame: string): Promise<void> {
  const justTcgGame = toJustTcgGame(internalGame);
  if (!justTcgGame) throw new Error(`No JustTCG game mapping for "${internalGame}"`);

  const url = `${BASE_URL_V1}/sets?game=${encodeURIComponent(justTcgGame)}`;
  let res = await fetch(url, {
    headers: { 'x-api-key': apiKey(1) },
  });

  if (res.status === 401) {
    console.warn('[JustTCG] Sync sets: API key 1 returned 401, trying key 2');
    try {
      res = await fetch(url, {
        headers: { 'x-api-key': apiKey(2) },
      });
      if (res.status === 401) {
        console.error('[JustTCG] Sync sets: API key 2 also returned 401');
        throw Object.assign(new Error('JustTCG sets API 401 — both keys failed'), { status: 401 });
      }

      if (res.ok) {
        console.log('[JustTCG] Sync sets: API key 2 succeeded');
      }
    } catch (err: any) {
      if (err?.status === 401) throw err;
      console.error('[JustTCG] Sync sets: Fallback key network error:', err.message);
      throw Object.assign(new Error('JustTCG sets API 401'), { status: 401 });
    }
  }

  if (res.status === 429) throw Object.assign(new Error('JustTCG rate limit hit (429)'), { status: 429 });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`JustTCG sets API ${res.status}: ${text}`);
  }

  const json = await res.json();
  const fetchedAt = new Date().toISOString();

  const rows = (json?.data ?? [])
    .map((s: any): JustTcgSetRow | null => {
      const setId = s.id ?? s.set_id ?? s.slug ?? null;
      const setName = s.name ?? s.set_name ?? s.set ?? null;
      if (!setId || !setName) return null;
      return {
        game: internalGame,
        set_id: String(setId),
        set_name: String(setName),
        fetched_at: fetchedAt,
        release_date: s.release_date ?? null,
        set_value_usd: s.set_value_usd ?? null,
        variants_count: s.variants_count ?? null,
        sealed_count: s.sealed_count ?? null,
      };
    })
    .filter((r: JustTcgSetRow | null): r is JustTcgSetRow => r !== null);

  if (!rows.length) {
    console.warn(`[JustTCG] syncSetsForGame("${internalGame}") returned no usable sets`);
    return;
  }

  const { error } = await supabaseAdmin
    .from('justtcg_sets')
    .upsert(rows, { onConflict: 'game,set_id' });

  if (error) throw new Error(`justtcg_sets upsert failed: ${error.message}`);

  console.log(`[JustTCG] Synced ${rows.length} sets for "${internalGame}"`);
}
