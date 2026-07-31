import { ChevronRight, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConditionBadge } from "@/components/ConditionBadge";
import { PriceDivergenceBadge } from "@/components/PriceDivergenceBadge";
import { LabelStatusBadge } from "./DetailPanel";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";

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
  const meta = (() => {
    try {
      return JSON.parse(item.matchMetadataJson || "{}");
    } catch {
      return {};
    }
  })();

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
        "border-b border-border/50 last:border-b-0 transition-colors",
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

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate leading-tight">
                {meta.cleanName || item.productName}
              </div>
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                {item.number && (
                  <span className="text-[11px] text-muted-foreground">
                    #{item.number}
                  </span>
                )}
                {item.number && meta.sourceSetName && (
                  <span className="text-muted-foreground/50 text-[11px]">·</span>
                )}
                {meta.sourceSetName && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[130px]">
                    {meta.sourceSetName}
                  </span>
                )}
              </div>
            </div>
            <ConditionBadge condition={item.condition} abbreviated />
          </div>

          {/* Price row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Qty</span>
              <span className="text-xs font-mono font-medium text-foreground">
                {item.currentQuantity}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Mkt</span>
              <span className="text-xs font-mono text-foreground">
                ${item.currentRawMarketPrice?.toFixed(2) ?? "—"}
              </span>
              <PriceDivergenceBadge item={item} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Print</span>
              <span className="text-xs font-mono font-bold text-primary">
                ${item.currentRoundedPrintPrice ?? "—"}
              </span>
            </div>
            {item.labelStatus && item.labelStatus !== "label_created" && (
              <LabelStatusBadge status={item.labelStatus} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
