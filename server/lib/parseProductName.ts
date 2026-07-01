export type ParsedName = {
  cleanName: string;
  displaySuffix?: string;
};

/**
 * Patterns that should become a badge (displaySuffix).
 * These are variant / print-run / promo distinguishers — NOT card numbers.
 *
 * One Piece examples:  (Parallel), (Alternate Art), (Winner Pack Vol. 6),
 *   (Premium Card Collection -ONE PIECE FILM RED Edition-),
 *   (Sealed Battle 2024 Vol. 2), (Gift Collection 2023),
 *   (Tournament Pack Vol. 5), (Event Pack Vol. 4),
 *   (OP-07 Pre-Release Tournament), (Retail Promo),
 *   [Winner], [Participant]
 *
 * DBS / other examples: (SPR), (SR), (R), (SSP)
 *
 * Never a badge: bare card numbers like (099), (100), (104)
 *   or inline suffixes like " - OP14-120" / " - FB02-085"
 */
const RARITY_TAGS = /^(SPR|SR|SSP|R|C|UC|AA|SEC|UR|PR|RR|RRR|ACE\s*SPEC)$/i;

/** Returns true for tokens that are ONLY a bare collector number, e.g. "099", "100" */
function isBareNumber(token: string): boolean {
  return /^\d{2,4}$/.test(token.trim());
}

/** Returns true for inline set-code suffixes like "OP14-120" or "FB02-085" */
function isInlineSetCode(s: string): boolean {
  return /^[A-Z]{1,4}\d{1,2}-\d{3,4}$/.test(s.trim());
}

export function parseProductName(
  rawName: string,
  game: string,
  existingNumber?: string
): ParsedName {
  const name = rawName.trim();

  // ── One Piece ─────────────────────────────────────────────────────────────
  if (game === "one-piece") {
    let working = name;

    // Strip trailing " - OPXX-NNN" style embedded card number (e.g. "Crocodile - OP14-120")
    working = working.replace(/\s*-\s*[A-Z]{1,4}\d{1,2}-\d{3,4}\s*$/, "").trim();
    // Also strip " (P-NNN)" or " - P-NNN" promo number patterns
    working = working.replace(/\s*-\s*P-\d{3,4}\s*$/, "").trim();

    // Collect ALL trailing parenthetical / bracket tokens, but:
    //   - DROP tokens that are ONLY bare numbers like (099)
    //   - KEEP everything else as badge parts
    const badgeParts: string[] = [];
    const parenRe = /\s*(?:\(([^)]+)\)|\[([^\]]+)\])\s*$/;
    let safety = 10;
    while (safety-- > 0) {
      const m = working.match(parenRe);
      if (!m) break;
      const token = (m[1] ?? m[2]).trim();
      working = working.slice(0, working.length - m[0].length).trim();
      // Skip pure number tokens — they duplicate the card number column
      if (isBareNumber(token) || isInlineSetCode(token)) continue;
      badgeParts.unshift(token);
    }

    return {
      cleanName: working,
      displaySuffix: badgeParts.length ? badgeParts.join(" · ") : undefined,
    };
  }

  // ── Dragon Ball Super / other (DBS uses SPR, SR, SSP etc.) ────────────────
  if (game === "dragon-ball" || game === "other") {
    let working = name;

    // Strip trailing " - XXXX-NNN" embedded card number
    working = working.replace(/\s*-\s*[A-Z]{1,4}\d{1,2}-\d{3,4}\s*$/, "").trim();

    // Pull trailing rarity tag in parens, e.g. (SPR), (SR), (SSP)
    let displaySuffix: string | undefined;
    const rarityMatch = working.match(/\s*\(([^)]+)\)\s*$/);
    if (rarityMatch && RARITY_TAGS.test(rarityMatch[1].trim())) {
      displaySuffix = rarityMatch[1].trim().toUpperCase();
      working = working.slice(0, working.length - rarityMatch[0].length).trim();
    }

    return { cleanName: working, displaySuffix };
  }

  // ── Pokémon (both EN and JP) ───────────────────────────────────────────────
  // NOTE: detectGameFromProductLine() in routes.ts emits "pokemon-jp" for
  // "Pokemon Japan" product lines. These two IDs must stay in sync.
  if (game === "pokemon" || game === "pokemon-jp") {
    let working = name;
    working = working.replace(/\s*-\s*\d+\/\d+\s*$/, "").trim();
    const suffixMatch = working.match(/\s*\(([^)]+)\)\s*$/);
    let displaySuffix: string | undefined;
    if (suffixMatch) {
      displaySuffix = suffixMatch[1].trim();
      working = working.slice(0, working.length - suffixMatch[0].length).trim();
    }
    return { cleanName: working, displaySuffix };
  }

  // ── Star Wars ─────────────────────────────────────────────────────────────
  if (game === "star-wars") {
    let working = name.replace(/\s*\(foil\)\s*$/i, "").trim();
    const suffixMatch = working.match(/\s*\(([^)]+)\)\s*$/);
    let displaySuffix: string | undefined;
    if (suffixMatch) {
      displaySuffix = suffixMatch[1].trim();
      working = working.slice(0, working.length - suffixMatch[0].length).trim();
    }
    return { cleanName: working, displaySuffix };
  }

  // ── Sorcery ───────────────────────────────────────────────────────────────
  if (game === "sorcery") {
    return { cleanName: name.replace(/\s*\(foil\)\s*$/i, "").trim() };
  }

  // ── MTG / default ─────────────────────────────────────────────────────────
  return { cleanName: name };
}
