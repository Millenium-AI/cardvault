// Canonical game slug -> display label mapping.
// This is the SINGLE source of truth for how a `game` value is rendered
// anywhere in the app (Merge Review, Inventory, tile grid, exports, etc.).
// The stored/queried value is always the lowercase-hyphenated slug
// (e.g. "one-piece"); use `gameLabel()` whenever displaying it to a user.

export const GAME_LABELS: Record<string, string> = {
  "pokemon": "Pokemon",
  "pokemon-jp": "Pokemon JP",
  "one-piece": "One Piece",
  "sorcery": "Sorcery",
  "dragon-ball": "Dragon Ball",
  "mtg": "MTG",
  "star-wars": "Star Wars",
  "lorcana": "Lorcana",
  "yugioh": "Yu-Gi-Oh!",
  "digimon": "Digimon",
  "fab": "Flesh and Blood",
  "other": "Other",
  "unknown": "Unknown",
};

/**
 * Turn a stored game slug (e.g. "one-piece") into a properly capitalized,
 * user-facing label (e.g. "One Piece"). Falls back to a title-cased version
 * of the slug for any value not in GAME_LABELS, so nothing ever renders as
 * raw lowercase.
 */
export function gameLabel(gameKey: string | null | undefined): string {
  const key = (gameKey ?? "").trim().toLowerCase();
  if (!key) return "Unknown";
  if (GAME_LABELS[key]) return GAME_LABELS[key];
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
