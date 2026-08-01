import { ChevronRight, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConditionBadge } from "@/components/ConditionBadge";
import { PriceDivergenceBadge } from "@/components/PriceDivergenceBadge";
import { gameLabel } from "@shared/gameLabels";
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
      const data = item.matchMetadataJson;
      return typeof data === 'string' ? JSON.parse(data) : (data || {});
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

        {/* Info — 4-row grid layout */}
        <div className="flex-1 min-w-0" style={{ display: "grid", gridTemplateRows: "22px 20px 16px 40px", gridTemplateColumns: "1fr" }}>
          {/* Row 1: Card name (left) | Condition (right) — 22px */}
          <div className="flex items-center justify-between gap-2 border-b border-border/40 overflow-hidden">
            <div className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">
              {meta.cleanName || item.productName}
            </div>
            <div className="shrink-0">
              <ConditionBadge condition={item.condition} abbreviated />
            </div>
          </div>

          {/* Row 2: Number + Set (left) | Label (right) — 20px */}
          <div className="flex items-center justify-between gap-2 border-b border-border/40 overflow-hidden">
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

          {/* Row 3: Game — 16px */}
          <div className="flex items-center border-b border-border/40 overflow-hidden">
            {item.game && (
              <span className="text-[10px] text-muted-foreground truncate">
                {gameLabel(item.game)}
              </span>
            )}
          </div>

          {/* Row 4: Pricing — 40px */}
          <div className="flex items-center justify-between gap-1 overflow-hidden text-[8px]">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-muted-foreground/70 leading-none">Qty</span>
              <span className="text-primary font-mono font-bold text-[9px]">{item.currentQuantity}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-muted-foreground/70 leading-none">Mkt</span>
              <span className="text-muted-foreground font-mono text-[9px]">
                ${item.adjustedMarketPrice != null ? item.adjustedMarketPrice.toFixed(2) : (item.currentRawMarketPrice?.toFixed(2) ?? "—")}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-muted-foreground/70 leading-none">Rec</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-mono text-[9px]">
                ${item.currentRawMarketPrice?.toFixed(2) ?? "—"}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-muted-foreground/70 leading-none">Print</span>
              <span className="text-primary font-mono font-bold text-xs">
                ${item.currentRoundedPrintPrice ?? "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
