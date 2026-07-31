// ─── Product ID resolver ──────────────────────────────────────────────────────
// A CSV row with no TCGplayer "Product ID" column can never be priced: every
// provider (JustTCG, PokéWallet, BerryWallet) keys off that id. This module
// recovers the id from the card's name + set + number by searching JustTCG,
// falling back to PokéWallet (Pokémon) and BerryWallet (One Piece).
//
// Design rules:
//  - A wrong id is far worse than no id, so an ambiguous match resolves to null.
//  - Lookups are deduped by name|number|set|game and throttled, and capped per
//    upload so a pathological CSV cannot stall a parse indefinitely.

import { searchCards, type SearchResultCard } from './justtcg';
import { pokeWalletSearchCards, berryWalletSearchCards } from './pokewallet';

export interface ResolveTarget {
  /** Caller's row/item id, echoed back as the map key. */
  id: string;
  productName: string;
  number?: string | null;
  setName?: string | null;
  game?: string | null;
  condition?: string | null;
  printing?: string | null;
}

export interface ResolveResult {
  sourceProductId: string;
  sourceTcgplayerSkuId: string | null;
  matchedName: string;
  matchedSetName: string | null;
  matchedNumber: string | null;
  confidence: 'number+name' | 'name+set' | 'name-only';
  provider: 'justtcg' | 'pokewallet' | 'berrywallet';
}

const MAX_LOOKUPS_PER_RUN = 150;
const THROTTLE_MS = 250;

/** Lowercase, strip punctuation/edition noise, collapse whitespace. */
export function normalizeName(raw: string | null | undefined): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(holo|reverse|foil|1st|first|edition|unlimited|promo|full|art|alt|alternate)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a card number for comparison: "148/165" -> "148",
 * "OP01-001" -> "op01001", "SV03  #12" -> "12".
 */
export function normalizeNumber(raw: string | null | undefined): string {
  const s = (raw ?? '').toLowerCase().trim();
  if (!s) return '';
  const slash = s.split('/')[0];
  return slash.replace(/[^a-z0-9]/g, '');
}

function nameScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = Array.from(new Set(a.split(' ')));
  const bTokens = new Set(b.split(' '));
  let shared = 0;
  for (const t of aTokens) if (bTokens.has(t)) shared++;
  const union = new Set(aTokens.concat(Array.from(bTokens))).size;
  return union ? shared / union : 0;
}

interface Scored {
  card: SearchResultCard;
  score: number;
  numberMatch: boolean;
  setMatch: boolean;
}

function scoreCandidates(target: ResolveTarget, cards: SearchResultCard[]): Scored[] {
  const wantName = normalizeName(target.productName);
  const wantNumber = normalizeNumber(target.number);
  const wantSet = normalizeName(target.setName);

  return cards
    .filter(c => c.tcgplayerId)
    .map(card => {
      const name = nameScore(wantName, normalizeName(card.name));
      const numberMatch = !!wantNumber && normalizeNumber(card.number) === wantNumber;
      const setMatch = !!wantSet && nameScore(wantSet, normalizeName(card.setName)) >= 0.6;

      let score = name;
      if (numberMatch) score += 1.0;
      if (setMatch) score += 0.35;

      return { card, score, numberMatch, setMatch };
    })
    .sort((a, b) => b.score - a.score);
}

/** Pick the variant whose condition/printing best matches, for the SKU id. */
function pickSkuId(card: SearchResultCard, target: ResolveTarget): string | null {
  const variants = card.variants ?? [];
  if (!variants.length) return null;

  const wantCondition = (target.condition ?? '').toLowerCase().trim();
  const wantPrinting = (target.printing ?? '').toLowerCase().trim();

  const exact = variants.find(v =>
    (v.condition ?? '').toLowerCase().trim() === wantCondition &&
    (!wantPrinting || (v.printing ?? '').toLowerCase().trim() === wantPrinting),
  );
  if (exact?.tcgplayerSkuId) return exact.tcgplayerSkuId;

  const byCondition = variants.find(v => (v.condition ?? '').toLowerCase().trim() === wantCondition);
  if (byCondition?.tcgplayerSkuId) return byCondition.tcgplayerSkuId;

  return variants.find(v => v.tcgplayerSkuId)?.tcgplayerSkuId ?? null;
}

function decide(target: ResolveTarget, scored: Scored[]): ResolveResult | null {
  if (!scored.length) return null;

  const [top, second] = scored;

  // A number match is the strongest signal available.
  if (top.numberMatch && top.score >= 1.2) {
    return build(target, top, 'number+name');
  }

  // No number to lean on: require a clear name match AND a clear winner,
  // otherwise we risk stamping the wrong card's id onto the row.
  const clearWinner = !second || top.score - second.score >= 0.25;
  if (!clearWinner) return null;

  if (top.setMatch && top.score >= 0.75) return build(target, top, 'name+set');
  if (top.score >= 0.9) return build(target, top, 'name-only');

  return null;
}

function build(target: ResolveTarget, s: Scored, confidence: ResolveResult['confidence']): ResolveResult {
  return {
    sourceProductId: String(s.card.tcgplayerId),
    sourceTcgplayerSkuId: pickSkuId(s.card, target),
    matchedName: s.card.name,
    matchedSetName: s.card.setName ?? null,
    matchedNumber: s.card.number ?? null,
    confidence,
    provider: 'justtcg',
  };
}

async function searchWithFallback(target: ResolveTarget): Promise<{ cards: SearchResultCard[]; provider: ResolveResult['provider'] }> {
  const game = (target.game ?? '').toLowerCase().trim();
  const query = [target.productName, target.number].filter(Boolean).join(' ').trim();

  try {
    const cards = await searchCards({
      query: target.productName,
      game: game || null,
      set: target.setName ?? null,
      limit: 20,
    });
    if (cards.length) return { cards, provider: 'justtcg' };
  } catch (err: any) {
    if (err?.status !== 429) {
      console.warn(`[resolver] JustTCG search failed for "${target.productName}":`, err.message);
    } else {
      console.warn('[resolver] JustTCG 429 — routing to fallback');
    }
  }

  if (game === 'pokemon') {
    const cards = await pokeWalletSearchCards(query, 20, target.setName ?? null);
    if (cards.length) return { cards, provider: 'pokewallet' };
  } else if (game === 'one-piece' || game === 'one_piece') {
    const cards = await berryWalletSearchCards(query, 20, target.setName ?? null);
    if (cards.length) return { cards, provider: 'berrywallet' };
  }

  return { cards: [], provider: 'justtcg' };
}

export interface ResolveSummary {
  attempted: number;
  resolved: number;
  unresolved: number;
  skippedOverCap: number;
}

/**
 * Resolve TCGplayer product ids for targets that are missing one.
 * Returns a map keyed by target.id, plus a summary for logging/reporting.
 */
export async function resolveProductIds(
  targets: ResolveTarget[],
): Promise<{ results: Map<string, ResolveResult>; summary: ResolveSummary }> {
  const results = new Map<string, ResolveResult>();
  const summary: ResolveSummary = { attempted: 0, resolved: 0, unresolved: 0, skippedOverCap: 0 };
  if (!targets.length) return { results, summary };

  // Group identical cards so a 400-row CSV with repeats costs one lookup each.
  const groups = new Map<string, ResolveTarget[]>();
  for (const t of targets) {
    if (!t.productName?.trim() || t.productName === '(unknown)') continue;
    const key = [
      normalizeName(t.productName),
      normalizeNumber(t.number),
      normalizeName(t.setName),
      (t.game ?? '').toLowerCase().trim(),
    ].join('|');
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  let lookups = 0;

  for (const [, members] of Array.from(groups.entries())) {
    if (lookups >= MAX_LOOKUPS_PER_RUN) {
      summary.skippedOverCap += members.length;
      continue;
    }

    const probe = members[0];
    lookups++;
    summary.attempted += members.length;

    try {
      const { cards, provider } = await searchWithFallback(probe);
      const decision = decide(probe, scoreCandidates(probe, cards));

      if (decision) {
        for (const m of members) {
          results.set(m.id, {
            ...decision,
            provider,
            // SKU is condition-specific, so re-pick per member.
            sourceTcgplayerSkuId: pickSkuId(
              cards.find(c => String(c.tcgplayerId) === decision.sourceProductId)!,
              m,
            ),
          });
          summary.resolved++;
        }
      } else {
        summary.unresolved += members.length;
        console.warn(
          `[resolver] no confident match for "${probe.productName}" ` +
          `(number=${probe.number ?? '-'}, set=${probe.setName ?? '-'}, game=${probe.game ?? '-'})`,
        );
      }
    } catch (err: any) {
      summary.unresolved += members.length;
      console.error(`[resolver] lookup failed for "${probe.productName}":`, err.message);
    }

    if (lookups < groups.size) await new Promise(r => setTimeout(r, THROTTLE_MS));
  }

  console.log(
    `[resolver] ${summary.resolved} resolved / ${summary.unresolved} unresolved / ` +
    `${summary.skippedOverCap} over cap (${lookups} provider lookups)`,
  );

  return { results, summary };
}
