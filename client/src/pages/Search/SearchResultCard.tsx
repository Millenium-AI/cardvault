import { gameLabel } from "@shared/gameLabels";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";

// A single search result tile. Clicking opens the expanded detail view
// (SearchDetailModal/Drawer) where the user can review pricing and add it
// to their inventory.
export function SearchResultCard({ card, game, onOpen }: { card: any; game: string; onOpen: () => void }) {
  const bestVariant = card.variants?.[0] ?? null;
  const price = bestVariant?.price ?? null;

  return (
    <div
      data-testid="search-result-card"
      onClick={onOpen}
      className="rounded-lg border border-border/50 bg-card hover:border-primary/40 transition-colors p-2 flex flex-col gap-1.5 cursor-pointer"
    >
      {/* Image */}
      <CardImagePlaceholder photoUrl={card.imageUrl} size="md" className="w-full h-32 rounded-md object-contain" />

      {/* Title */}
      <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
        {card.name}
      </p>

      {/* Metadata: set + number */}
      <p className="text-[10px] text-muted-foreground/70 truncate">
        {[card.setName, card.number].filter(Boolean).join(" · ") || gameLabel(game)}
      </p>

      {/* Footer: price and printing */}
      <div className="flex items-center justify-between gap-2 pt-0.5 mt-auto border-t border-border/30">
        <span className="text-sm font-mono font-bold text-primary tabular-nums">
          {price != null ? `$${price.toFixed(2)}` : "—"}
        </span>
        {bestVariant?.printing && (
          <span className="text-[9px] text-muted-foreground/70 text-right truncate max-w-[50%]">
            {bestVariant.printing}
          </span>
        )}
      </div>
    </div>
  );
}
