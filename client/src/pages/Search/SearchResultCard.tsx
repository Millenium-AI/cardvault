import { gameLabel } from "@shared/gameLabels";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";

// A single search result tile. Clicking opens the expanded detail view
// (SearchDetailModal/Drawer) where the user can review pricing and add it
// to their inventory.
export function SearchResultCard({ card, game, onOpen }: { card: any; game: string; onOpen: () => void }) {
  // Show Unopened condition for sealed products, Near Mint for regular cards
  const variants = card.variants ?? [];
  const bestVariant = card.isSealed
    ? variants.find((v: any) => v.condition === "Unopened") ?? variants[0] ?? null
    : variants.find((v: any) => v.condition === "Near Mint") ?? variants[0] ?? null;
  const price = bestVariant?.price ?? null;

  return (
    <div
      data-testid="search-result-card"
      onClick={onOpen}
      className={`rounded-lg border bg-card hover:border-primary/40 transition-colors p-2 flex flex-col gap-1 cursor-pointer ${
        card.isSealed ? 'border-blue-500/40 bg-blue-500/5' : 'border-border/50'
      }`}
    >
      {/* Image */}
      <div className="relative">
        <CardImagePlaceholder photoUrl={card.imageUrl} size="md" className="w-full h-32 rounded-md object-contain" />
        {card.isSealed && (
          <div className="absolute top-1 right-1 px-2 py-1 rounded-md bg-blue-500/90 text-white text-[9px] font-bold">
            UNOPENED
          </div>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
        {card.name}
      </p>

      {/* Metadata: set or game label */}
      <p className="text-[10px] text-muted-foreground/70 truncate">
        {card.setName || gameLabel(game)}
      </p>

      {/* Footer: price and condition/printing */}
      <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-border/30">
        <span className="text-sm font-mono font-bold text-primary tabular-nums">
          {price != null ? `$${price.toFixed(2)}` : "—"}
        </span>
        {bestVariant && (
          <span className="text-[9px] text-muted-foreground/70 text-right truncate max-w-[50%]">
            {card.isSealed ? "Unopened" : (bestVariant.condition || bestVariant.printing)}
          </span>
        )}
      </div>
    </div>
  );
}
