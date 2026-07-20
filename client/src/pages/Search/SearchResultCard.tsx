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
      className="rounded-lg border border-border/50 bg-card hover:border-primary/40 transition-colors p-2.5 flex flex-col gap-2 cursor-pointer"
    >
      <CardImagePlaceholder photoUrl={card.imageUrl} size="md" className="w-full h-32 rounded-md" />

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{card.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {[card.setName, card.number].filter(Boolean).join(" · ") || gameLabel(game)}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-semibold text-primary">
          {price != null ? `$${price.toFixed(2)}` : "—"}
        </span>
        {bestVariant?.printing && (
          <span className="text-[9px] text-muted-foreground">{bestVariant.printing}</span>
        )}
      </div>
    </div>
  );
}
