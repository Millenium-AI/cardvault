// Game tile selector shown when no game is selected. Counts are derived from
// whatever `items` array the page passes in (each item must have a `game`
// field). Images come from a per-page `images` map keyed by the game `value`
// so they can be swapped in later without touching this component.

// Fixed tiles, always shown (even at count 0), in this order. `value` is the
// stored game value used by the inventory filter + API; `label` is displayed.
const FIXED_GAMES: { value: string; label: string }[] = [
  { value: "all", label: "All Games" },
  { value: "pokemon", label: "Pokémon" },
  { value: "one-piece", label: "One Piece" },
  { value: "sorcery", label: "Sorcery" },
  { value: "dragon-ball", label: "Dragon Ball" },
];

/** "one-piece" -> "One Piece" for dynamically discovered games. */
function prettify(value: string): string {
  return value
    .split("-")
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Deterministic placeholder background colour from the game value. */
function hueFor(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) % 360;
  return h;
}

export function GameTileGrid({
  items,
  images,
  onSelect,
}: {
  items: any[];
  images: Record<string, string>;
  onSelect: (game: string) => void;
}) {
  // Count items per game value.
  const counts: Record<string, number> = {};
  for (const it of items) {
    const g = it?.game;
    if (!g) continue;
    counts[g] = (counts[g] || 0) + 1;
  }

  // Append any game present in the data that isn't a fixed tile, so nothing
  // is hidden.
  const fixedValues = new Set(FIXED_GAMES.map(g => g.value));
  const dynamic = Object.keys(counts)
    .filter(g => !fixedValues.has(g))
    .sort()
    .map(value => ({ value, label: prettify(value) }));

  const tiles = [...FIXED_GAMES, ...dynamic];
  const countFor = (value: string) => (value === "all" ? items.length : counts[value] || 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
      {tiles.map(({ value, label }) => {
        const src = images[value];
        const count = countFor(value);
        return (
          <button
            key={value}
            data-testid={`game-tile-${value}`}
            onClick={() => onSelect(value)}
            className="group block text-left transition-transform duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
          >
            <div className="relative aspect-[5/7] rounded-xl overflow-hidden border border-border bg-card shadow-sm transition-shadow duration-200 group-hover:shadow-xl group-hover:ring-1 group-hover:ring-primary/40">
              {/* Item count badge */}
              <span className="absolute top-2 right-2 z-20 px-1.5 py-0.5 rounded-full bg-background/80 backdrop-blur text-[11px] font-mono font-medium text-foreground border border-border">
                {count.toLocaleString()}
              </span>

              {/* Image area — placeholder until a real URL is added to the map */}
              {src ? (
                <img src={src} alt={label} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ backgroundColor: `hsl(${hueFor(value)} 45% 32%)` }}
                >
                  <span className="text-4xl font-bold text-white/90 select-none">{label.charAt(0)}</span>
                </div>
              )}

              {/* Name label */}
              <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/80 to-transparent px-2.5 pt-6 pb-2">
                <span className="text-sm font-semibold text-white drop-shadow">{label}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
