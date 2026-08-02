import { ChevronRight, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConditionBadge } from "@/components/ConditionBadge";
import { PriceDivergenceBadge } from "@/components/PriceDivergenceBadge";
import { gameLabel } from "@shared/gameLabels";
import { LabelStatusBadge } from "./DetailPanel";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";
import { parseMatchMetadata, getPricingSummary } from "./utils";

export function MobileInventoryCard({
  item,
  selected,
  onSelect,
  selectMode,
  onOpen,
}: {
  item: any;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  selectMode: boolean;
  onOpen: (item: any) => void;
}) {
  const meta = parseMatchMetadata(item.matchMetadataJson);
  const pricing = getPricingSummary(item);

  function tap() {
    if (selectMode) {
      onSelect(item.id, !selected);
      return;
    }
    onOpen(item);
  }

  return (
    <div
      data-testid={`row-inventory-${item.id}`}
      className={cn(
        "transition-colors",
        selected ? "bg-primary/8" : "bg-transparent",
      )}
    >
      <div
        className="flex items-center gap-3 px-3 py-3 cursor-pointer active:bg-accent/40"
        onClick={tap}
      >
        {/* Left: select checkbox or chevron */}
        <div className="shrink-0">
          {selectMode ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item.id, !selected);
              }}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {selected ? (
                <CheckSquare size={16} className="text-primary" />
              ) : (
                <Square size={16} className="text-muted-foreground" />
              )}
            </button>
          ) : (
            <ChevronRight size={15} className="text-muted-foreground/50" />
          )}
        </div>

        {/* Thumbnail */}
        <CardImagePlaceholder
          photoUrl={item.photoUrl}
          size="xs"
          className="w-9 h-[50px] rounded shrink-0"
        />

        {/* Info — 4-row grid layout, no row separators */}
        <div
          className="flex-1 min-w-0"
          style={{ display: "grid", gridTemplateRows: "22px 20px 16px auto", gridTemplateColumns: "1fr" }}
        >
          {/* Row 1: Card name (left) | Condition (right) */}
          <div className="flex items-center justify-between gap-2 overflow-hidden">
            <div className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">
              {meta.cleanName || item.productName}
            </div>
            <div className="shrink-0">
              <ConditionBadge condition={item.condition} abbreviated />
            </div>
          </div>

          {/* Row 2: Number + Set (left) | Label (right) */}
          <div className="flex items-center justify-between gap-2 overflow-hidden">
            <div className="flex items-center gap-0.5 min-w-0 flex-1 text-[10px] text-muted-foreground">
              {item.number && <span className="shrink-0">{item.number}</span>}
              {item.number && meta.sourceSetName && <span className="shrink-0">·</span>}
              {meta.sourceSetName && <span className="truncate">{meta.sourceSetName}</span>}
            </div>
            <div className="shrink-0">
              {item.labelStatus && item.labelStatus !== "label_created" && (
                <LabelStatusBadge status={item.labelStatus} />
              )}
            </div>
          </div>

          {/* Row 3: Game */}
          <div className="flex items-center overflow-hidden">
            {item.game && (
              <span className="text-[10px] text-muted-foreground truncate">
                {gameLabel(item.game)}
              </span>
            )}
          </div>

          {/* Row 4: Pricing — compact 2x2 layout */}
          <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 overflow-hidden text-[8px]">
            <div className="flex items-center justify-between gap-1 min-w-0">
              <span className="text-muted-foreground/70 leading-none">Qty</span>
              <span className="text-primary font-mono font-bold text-[9px]">
                {pricing.quantityLabel}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 min-w-0">
              <span className="text-muted-foreground/70 leading-none">Mkt</span>
              <span className="text-muted-foreground font-mono text-[9px] truncate">
                {pricing.marketDisplay}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 min-w-0">
              <span className="text-muted-foreground/70 leading-none">Rec</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-mono text-[9px] truncate">
                {pricing.rawMarketDisplay}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1 min-w-0">
              <span className="text-muted-foreground/70 leading-none">Print</span>
              <span className="text-primary font-mono font-bold text-xs truncate">
                {pricing.printDisplay}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
