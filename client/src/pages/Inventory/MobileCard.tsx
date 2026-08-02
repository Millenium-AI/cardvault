import { ChevronRight, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConditionBadge } from "@/components/ConditionBadge";
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
        selected ? "bg-primary/8" : "bg-transparent"
      )}
    >
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer active:bg-accent/40"
        onClick={tap}
      >
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

        <CardImagePlaceholder
          photoUrl={item.photoUrl}
          size="xs"
          className="w-9 h-[50px] rounded shrink-0"
        />

        <div
          className="flex-1 min-w-0"
          style={{
            display: "grid",
            gridTemplateRows: "22px 20px 16px 40px",
            gridTemplateColumns: "1fr",
            rowGap: "2px",
          }}
        >
          <div className="flex items-center justify-between gap-2 overflow-hidden">
            <div className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">
              {meta.cleanName || item.productName}
            </div>
            <div className="shrink-0">
              <ConditionBadge condition={item.condition} abbreviated />
            </div>
          </div>

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

          <div className="flex items-center overflow-hidden">
            {item.game && (
              <span className="text-[10px] text-muted-foreground truncate">
                {gameLabel(item.game)}
              </span>
            )}
          </div>

          <div
            className="grid grid-cols-4 gap-1 items-stretch overflow-hidden"
            style={{
              display: "grid",
              gridTemplateRows: "10px 24px",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              rowGap: "1px",
            }}
          >
            <div className="min-w-0 flex items-end justify-center text-[7px] uppercase tracking-wide text-muted-foreground/70 leading-none">
              Qty
            </div>
            <div className="min-w-0 flex items-end justify-center text-[7px] uppercase tracking-wide text-muted-foreground/70 leading-none">
              Mkt
            </div>
            <div className="min-w-0 flex items-end justify-center text-[7px] uppercase tracking-wide text-muted-foreground/70 leading-none">
              Rec
            </div>
            <div className="min-w-0 flex items-end justify-end text-[7px] uppercase tracking-wide text-muted-foreground/70 leading-none pr-[1px]">
              Print
            </div>

            <div className="min-w-0 flex items-start justify-center text-primary font-mono font-bold text-[9px] leading-[10px] break-all">
              {pricing.quantityLabel}
            </div>
            <div className="min-w-0 flex items-start justify-center text-muted-foreground font-mono text-[9px] leading-[10px] break-all">
              {pricing.marketDisplay}
            </div>
            <div className="min-w-0 flex items-start justify-center text-cyan-600 dark:text-cyan-400 font-mono text-[9px] leading-[10px] break-all">
              {pricing.rawMarketDisplay}
            </div>
            <div className="min-w-0 flex items-start justify-end text-primary font-mono font-bold text-[10px] leading-[10px] break-all pr-[1px]">
              {pricing.printDisplay}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
