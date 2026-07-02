import { CheckSquare, Square } from "lucide-react";
import { ConditionBadge } from "@/components/ConditionBadge";
import { gameLabel } from "@shared/gameLabels";
import { LabelStatusBadge } from "./DetailPanel";

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

  if (size === "sm") {
    return (
      <div data-testid={`card-grid-sm-${item.id}`} onClick={handleClick}
        className={`relative stat-card p-2.5 cursor-pointer transition-colors ${
          selected ? "ring-1 ring-primary bg-primary/5" : "hover:bg-accent/20"
        }`}>
        {selectMode && (
          <div className="absolute top-2 left-2 z-10">
            {selected ? <CheckSquare size={15} className="text-primary drop-shadow" /> : <Square size={15} className="text-muted-foreground" />}
          </div>
        )}
        <div className="flex justify-center mb-2">
          {item.photoUrl
            ? <img src={item.photoUrl} alt="" crossOrigin="anonymous" className="w-14 h-[78px] rounded object-contain bg-muted" />
            : <div className="w-14 h-[78px] rounded bg-muted" />}
        </div>
        <div className="text-xs font-medium text-foreground truncate leading-tight">{item.productName}</div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <ConditionBadge condition={item.condition} abbreviated />
          <LabelStatusBadge status={item.labelStatus} />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground font-mono">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
          <span className="text-[10px] font-mono font-bold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid={`card-grid-lg-${item.id}`} onClick={handleClick}
      className={`relative stat-card p-3 cursor-pointer transition-colors ${
        selected ? "ring-1 ring-primary bg-primary/5" : "hover:bg-accent/20"
      }`}>
      {selectMode && (
        <div className="absolute top-3 left-3 z-10">
          {selected ? <CheckSquare size={15} className="text-primary drop-shadow" /> : <Square size={15} className="text-muted-foreground" />}
        </div>
      )}
      <div className="flex gap-3">
        <div className="shrink-0">
          {item.photoUrl
            ? <img src={item.photoUrl} alt="" crossOrigin="anonymous" className="w-[88px] h-[123px] rounded object-contain bg-muted" />
            : <div className="w-[88px] h-[123px] rounded bg-muted" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground line-clamp-2 leading-tight">{item.productName}</div>
          {meta.sourceSetName && <div className="text-xs text-muted-foreground truncate mt-0.5">{meta.sourceSetName}</div>}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <ConditionBadge condition={item.condition} abbreviated />
            <span className="text-[10px] text-muted-foreground">{gameLabel(item.game)}</span>
          </div>
          <div className="mt-0.5"><LabelStatusBadge status={item.labelStatus} /></div>
          <div className="mt-2 space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Market</span>
              <span className="font-mono text-foreground">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Print</span>
              <span className="font-mono font-bold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Qty</span>
              <span className="font-mono text-foreground">{item.currentQuantity}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
