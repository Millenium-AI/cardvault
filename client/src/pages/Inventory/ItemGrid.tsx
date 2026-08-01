import { CheckSquare, Square } from "lucide-react";
import { ConditionBadge } from "@/components/ConditionBadge";
import { PriceDivergenceBadge } from "@/components/PriceDivergenceBadge";
import { gameLabel } from "@shared/gameLabels";
import { LabelStatusBadge } from "./DetailPanel";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";

/**
 * Portrait tile card — inspired by Bonsai storefront grid.
 *
 * size="lg"  → ~160px wide, large portrait image (aspect 3/4), full info below
 * size="sm"  → ~100px wide, compact portrait image, price + condition only below
 */
export function InventoryGridCard({
  item, size, selected, onSelect, selectMode, onOpen,
}: {
  item: any; size: "sm" | "lg"; selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  selectMode: boolean; onOpen: () => void;
}) {
  const meta = (() => { try { return JSON.parse(item.matchMetadataJson || "{}"); } catch { return {}; } })();

  function handleClick() {
    if (selectMode) { onSelect(item.id, !selected); return; }
    onOpen();
  }

  /* ── SMALL TILE (~100px) ───────────────────────────────────────────────── */
  if (size === "sm") {
    return (
      <div
        data-testid={`card-grid-sm-${item.id}`}
        onClick={handleClick}
        className={`relative stat-card cursor-pointer transition-colors overflow-hidden rounded-lg flex flex-col ${
          selected ? "ring-1 ring-primary bg-primary/5" : "hover:bg-accent/20"
        }`}
      >
        {/* Select checkbox */}
        {selectMode && (
          <div className="absolute top-1.5 left-1.5 z-10">
            {selected
              ? <CheckSquare size={13} className="text-primary drop-shadow" />
              : <Square size={13} className="text-muted-foreground" />}
          </div>
        )}

        {/* Divergence badge */}
        <div className="absolute top-1.5 right-1.5 z-10">
          <PriceDivergenceBadge item={item} />
        </div>

        {/* Portrait image — 3/4 aspect ratio */}
        <div className="relative w-full" style={{ aspectRatio: "3/4" }}>
          <CardImagePlaceholder
            photoUrl={item.photoUrl}
            size="sm"
            className="absolute inset-0 w-full h-full object-contain bg-muted rounded-t-lg"
          />
        </div>

        {/* Info below image — tighter spacing */}
        <div className="px-1 py-1 flex flex-col gap-0.5 flex-1">
          {/* Title */}
          <div className="text-[10px] font-medium text-foreground line-clamp-2 leading-tight">
            {item.productName}
          </div>

          {/* Badges row */}
          <div className="flex items-center gap-0.5 flex-wrap">
            <ConditionBadge condition={item.condition} abbreviated />
            <LabelStatusBadge status={item.labelStatus} />
          </div>

          {/* Pricing footer */}
          <div className="flex items-center justify-between gap-1 mt-auto">
            <div className="flex flex-col items-start gap-0">
              <span className={`text-[9px] font-mono font-medium leading-tight ${
                item.adjustedMarketPrice != null ? 'text-primary' : 'text-muted-foreground'
              }`}>
                ${item.adjustedMarketPrice != null ? item.adjustedMarketPrice.toFixed(2) : (item.currentRawMarketPrice?.toFixed(2) ?? "—")}
              </span>
              {item.adjustedMarketPrice != null && (
                <span className="text-[7px] text-muted-foreground/50 font-mono leading-none">
                  was ${item.currentRawMarketPrice?.toFixed(2)}
                </span>
              )}
            </div>
            <span className="text-[9px] font-mono font-bold text-primary">
              ${item.currentRoundedPrintPrice ?? "—"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ── LARGE TILE (~160px) ───────────────────────────────────────────────── */
  return (
    <div
      data-testid={`card-grid-lg-${item.id}`}
      onClick={handleClick}
      className={`relative stat-card cursor-pointer transition-colors overflow-hidden rounded-lg flex flex-col ${
        selected ? "ring-1 ring-primary bg-primary/5" : "hover:bg-accent/20"
      }`}
    >
      {/* Select checkbox */}
      {selectMode && (
        <div className="absolute top-2 left-2 z-10">
          {selected
            ? <CheckSquare size={15} className="text-primary drop-shadow" />
            : <Square size={15} className="text-muted-foreground" />}
        </div>
      )}

      {/* Divergence badge */}
      <div className="absolute top-2 right-2 z-10">
        <PriceDivergenceBadge item={item} />
      </div>

      {/* Portrait image — 3/4 aspect ratio, full card face */}
      <div className="relative w-full" style={{ aspectRatio: "3/4" }}>
        <CardImagePlaceholder
          photoUrl={item.photoUrl}
          size="md"
          className="absolute inset-0 w-full h-full object-contain bg-muted rounded-t-lg"
        />
      </div>

      {/* Info below image — tighter, better organized */}
      <div className="px-2 py-1.5 flex flex-col gap-1 flex-1">
        {/* Title */}
        <div className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
          {item.productName}
        </div>

        {/* Metadata row: condition, set, game, label status */}
        <div className="flex items-center gap-1 flex-wrap">
          <ConditionBadge condition={item.condition} abbreviated />
          {meta.sourceSetName && (
            <span className="text-[10px] text-muted-foreground truncate">
              {meta.sourceSetName}
            </span>
          )}
          {item.game && (
            <span className="text-[10px] text-muted-foreground">
              {gameLabel(item.game)}
            </span>
          )}
          <LabelStatusBadge status={item.labelStatus} />
        </div>

        {/* Pricing footer — tighter, scannable */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-0.5 border-t border-border/20">
          {/* Left: Market price + was */}
          <div className="flex flex-col items-start gap-0">
            <span className={`text-[9px] font-mono font-medium leading-tight ${
              item.adjustedMarketPrice != null ? 'text-primary' : 'text-foreground'
            }`}>
              ${item.adjustedMarketPrice != null ? item.adjustedMarketPrice.toFixed(2) : (item.currentRawMarketPrice?.toFixed(2) ?? "—")}
            </span>
            {item.adjustedMarketPrice != null && (
              <span className="text-[8px] text-muted-foreground/50 font-mono leading-none">
                was ${item.currentRawMarketPrice?.toFixed(2)}
              </span>
            )}
            <span className="text-[8px] text-muted-foreground/40 mt-0.5">
              Qty {item.currentQuantity}
            </span>
          </div>
          {/* Right: Print price (strongest emphasis) */}
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-muted-foreground/60 leading-tight mb-0.5">Print</span>
            <span className="text-sm font-mono font-bold text-primary">
              ${item.currentRoundedPrintPrice ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
