import { useState } from "react";
import { CheckSquare, Square, ChevronDown } from "lucide-react";
import { ConditionBadge } from "@/components/ConditionBadge";
import { gameLabel } from "@shared/gameLabels";
import { cn } from "@/lib/utils";
import { LabelStatusBadge } from "./DetailPanel";
import { ColumnKey } from "./constants";
import { ExpandedDetail } from "./ExpandedDetailRow";

export function InventoryRow({
  item, selected, onSelect, selectMode, columnOrder,
}: {
  item: any; selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  selectMode: boolean; columnOrder: ColumnKey[];
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

  function renderCell(col: ColumnKey) {
    switch (col) {
      case "card": return (
        <td key="card" className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            {selectMode ? (
              <button onClick={e => { e.stopPropagation(); onSelect(item.id, !selected); }}
                className="text-muted-foreground/50 hover:text-primary transition-colors shrink-0">
                {selected ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
              </button>
            ) : (
              <ChevronDown size={12}
                className={`text-muted-foreground/40 transition-transform duration-200 shrink-0 ${expanded ? "" : "-rotate-90"}`} />
            )}
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[13px] font-medium text-foreground truncate max-w-[300px] leading-snug">
                  {meta.cleanName || item.productName}
                </span>
                {meta.displaySuffix && (
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary leading-tight">
                    {meta.displaySuffix}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 min-w-0 text-[11px] text-muted-foreground/50">
                {item.number && <span className="shrink-0 tabular-nums">{item.number}</span>}
                {item.number && meta.sourceSetName && <span className="shrink-0 mx-0.5">·</span>}
                {meta.sourceSetName && <span className="truncate max-w-[180px]">{meta.sourceSetName}</span>}
                {item.labelCreatedAt && <LabelStatusBadge status={item.labelStatus} />}
              </div>
            </div>
          </div>
        </td>
      );
      case "condition": return (
        <td key="condition" className="px-4 py-3 text-center whitespace-nowrap">
          <ConditionBadge condition={item.condition} abbreviated />
        </td>
      );
      case "game": return (
        <td key="game" className="px-4 py-3 text-[11px] text-muted-foreground/40 whitespace-nowrap">
          {gameLabel(item.game)}
        </td>
      );
      case "qty": return (
        <td key="qty" className="px-4 py-3 text-right whitespace-nowrap">
          <span className="text-sm font-mono tabular-nums font-medium text-foreground">{item.currentQuantity}</span>
        </td>
      );
      case "market": return (
        <td key="market" className="px-4 py-3 text-right whitespace-nowrap">
          <span className="text-sm font-mono tabular-nums text-muted-foreground">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
        </td>
      );
      case "print": return (
        <td key="print" className="px-4 py-3 text-right whitespace-nowrap">
          <span className="text-sm font-mono tabular-nums font-semibold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
        </td>
      );
      case "total": return (
        <td key="total" className="px-4 py-3 text-right whitespace-nowrap">
          <span className="text-xs font-mono tabular-nums text-muted-foreground/50">
            ${((item.currentRawMarketPrice || 0) * item.currentQuantity).toFixed(2)}
          </span>
        </td>
      );
      default: return null;
    }
  }

  return (
    <>
      <tr data-testid={`row-inventory-${item.id}`}
        className={cn(
          "border-b border-border/20 cursor-pointer transition-colors group/row",
          selected
            ? "bg-primary/8 hover:bg-primary/12"
            : "hover:bg-accent/15"
        )}
        onClick={toggle}>
        {columnOrder.map(col => renderCell(col))}
      </tr>
      {expanded && !selectMode && (
        <tr className="border-b border-border/20 bg-muted/10">
          <td colSpan={columnOrder.length} className="px-6 py-4">
            <ExpandedDetail item={item} meta={meta} editing={editing} setEditing={setEditing} stopProp />
          </td>
        </tr>
      )}
    </>
  );
}
