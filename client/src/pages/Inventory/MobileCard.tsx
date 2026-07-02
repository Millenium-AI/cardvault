import { useState } from "react";
import { ChevronDown, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConditionBadge } from "@/components/ConditionBadge";
import { LabelStatusBadge } from "./DetailPanel";
import { ExpandedDetail } from "./ExpandedDetailRow";

export function MobileInventoryCard({
  item, selected, onSelect, selectMode,
}: {
  item: any; selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  selectMode: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const meta = (() => { try { return JSON.parse(item.matchMetadataJson || "{}"); } catch { return {}; } })();

  function toggle() {
    if (selectMode) { onSelect(item.id, !selected); return; }
    const next = !expanded;
    setExpanded(next);
    if (!next) setEditing(false);
  }

  return (
    <div
      data-testid={`row-inventory-${item.id}`}
      className={cn(
        "border-b border-border/50 last:border-b-0 transition-colors",
        selected ? "bg-primary/8" : "bg-transparent",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-3 cursor-pointer active:bg-accent/40" onClick={toggle}>
        <div className="shrink-0">
          {selectMode ? (
            <button onClick={e => { e.stopPropagation(); onSelect(item.id, !selected); }}
              className="text-muted-foreground hover:text-primary transition-colors">
              {selected
                ? <CheckSquare size={16} className="text-primary" />
                : <Square size={16} className="text-muted-foreground" />}
            </button>
          ) : (
            <div className={cn(
              "transition-transform duration-200 text-muted-foreground",
              expanded ? "rotate-0" : "-rotate-90"
            )}>
              <ChevronDown size={15} />
            </div>
          )}
        </div>

        {item.photoUrl ? (
          <img src={item.photoUrl} alt="" crossOrigin="anonymous"
            className="w-9 h-[50px] rounded object-contain bg-muted shrink-0" />
        ) : (
          <div className="w-9 h-[50px] rounded bg-muted/60 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate leading-tight">
                {meta.cleanName || item.productName}
              </div>
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                {item.number && (
                  <span className="text-[11px] text-muted-foreground">#{item.number}</span>
                )}
                {item.number && meta.sourceSetName && <span className="text-muted-foreground/50 text-[11px]">·</span>}
                {meta.sourceSetName && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[130px]">{meta.sourceSetName}</span>
                )}
              </div>
            </div>
            <ConditionBadge condition={item.condition} abbreviated />
          </div>

          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Qty</span>
              <span className="text-xs font-mono font-medium text-foreground">{item.currentQuantity}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Mkt</span>
              <span className="text-xs font-mono text-foreground">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Print</span>
              <span className="text-xs font-mono font-bold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
            </div>
            {item.labelStatus && item.labelStatus !== "label_created" && (
              <LabelStatusBadge status={item.labelStatus} />
            )}
          </div>
        </div>
      </div>

      {expanded && !selectMode && (
        <div className="px-3 pb-3">
          <ExpandedDetail item={item} meta={meta} editing={editing} setEditing={setEditing} stopProp />
        </div>
      )}
    </div>
  );
}
