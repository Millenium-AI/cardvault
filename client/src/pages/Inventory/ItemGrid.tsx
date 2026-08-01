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
  const meta = (() => { 
    try { 
      const data = item.matchMetadataJson;
      return typeof data === 'string' ? JSON.parse(data) : (data || {});
    } catch { 
      return {}; 
    } 
  })();

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
        className={`relative stat-card cursor-pointer transition-colors overflow-hidden rounded-lg ${
          selected ? "ring-1 ring-primary bg-primary/5" : "hover:bg-accent/20"
        }`}
        style={{
          display: "grid",
          gridTemplateRows: "auto 24px 20px 16px 48px",
          gridTemplateColumns: "1fr",
        }}
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

        {/* Image row */}
        <div className="relative w-full" style={{ aspectRatio: "3/4" }}>
          <CardImagePlaceholder
            photoUrl={item.photoUrl}
            size="sm"
            className="absolute inset-0 w-full h-full object-contain bg-muted rounded-t-lg"
          />
        </div>

        {/* Row 1: Card name (left) | Condition (right) — 24px */}
        <div className="px-2 flex items-center justify-between gap-1 border-b border-border/20 overflow-hidden">
          <div className="min-w-0 flex-1 text-[10px] font-medium text-foreground truncate">
            {meta.cleanName || item.productName}
          </div>
          <div className="shrink-0">
            <ConditionBadge condition={item.condition} abbreviated />
          </div>
        </div>

        {/* Row 2: Number + Set (left) | Label (right) — 20px */}
        <div className="px-2 flex items-center justify-between gap-1 border-b border-border/20 overflow-hidden">
          <div className="flex items-center gap-0.5 min-w-0 flex-1 text-[9px] text-muted-foreground">
            {item.number && <span className="shrink-0">{item.number}</span>}
            {item.number && meta.sourceSetName && <span className="shrink-0">·</span>}
            {meta.sourceSetName && <span className="truncate text-[9px]">{meta.sourceSetName}</span>}
          </div>
          <div className="shrink-0">
            <LabelStatusBadge status={item.labelStatus} />
          </div>
        </div>

        {/* Row 3: Game — 16px */}
        <div className="px-2 flex items-center border-b border-border/20 overflow-hidden">
          {item.game && (
            <span className="text-[9px] text-muted-foreground truncate">
              {gameLabel(item.game)}
            </span>
          )}
        </div>

        {/* Row 4: Pricing — 48px */}
        <div className="px-2 py-1 flex items-center justify-between gap-1 overflow-hidden text-[8px]">
          <div className="flex flex-col items-center gap-0">
            <span className="text-muted-foreground/70 leading-none">Qty</span>
            <span className="text-primary font-mono font-bold text-[9px]">{item.currentQuantity}</span>
          </div>
          <div className="flex flex-col items-center gap-0">
            <span className="text-muted-foreground/70 leading-none">Mkt</span>
            <span className="text-muted-foreground font-mono text-[9px]">
              ${item.adjustedMarketPrice != null ? item.adjustedMarketPrice.toFixed(2) : (item.currentRawMarketPrice?.toFixed(2) ?? "—")}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0">
            <span className="text-muted-foreground/70 leading-none">Rec</span>
            <span className="text-cyan-600 dark:text-cyan-400 font-mono text-[9px]">
              ${item.currentRawMarketPrice?.toFixed(2) ?? "—"}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0">
            <span className="text-muted-foreground/70 leading-none">Print</span>
            <span className="text-primary font-mono font-bold text-sm">
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
      className={`relative stat-card cursor-pointer transition-colors overflow-hidden rounded-lg ${
        selected ? "ring-1 ring-primary bg-primary/5" : "hover:bg-accent/20"
      }`}
      style={{
        display: "grid",
        gridTemplateRows: "auto 28px 24px 20px 56px",
        gridTemplateColumns: "1fr",
      }}
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

      {/* Image row */}
      <div className="relative w-full" style={{ aspectRatio: "3/4" }}>
        <CardImagePlaceholder
          photoUrl={item.photoUrl}
          size="md"
          className="absolute inset-0 w-full h-full object-contain bg-muted rounded-t-lg"
        />
      </div>

      {/* Row 1: Card name (left) | Condition (right) — 28px */}
      <div className="px-2 flex items-center justify-between gap-2 border-b border-border/20 overflow-hidden">
        <div className="min-w-0 flex-1 text-xs font-medium text-foreground truncate">
          {meta.cleanName || item.productName}
        </div>
        <div className="shrink-0">
          <ConditionBadge condition={item.condition} abbreviated />
        </div>
      </div>

      {/* Row 2: Number + Set (left) | Label badge (right) — 24px */}
      <div className="px-2 flex items-center justify-between gap-2 border-b border-border/20 overflow-hidden">
        <div className="flex items-center gap-1 min-w-0 flex-1 text-[10px] text-muted-foreground">
          {item.number && <span className="shrink-0">{item.number}</span>}
          {item.number && meta.sourceSetName && <span className="shrink-0">·</span>}
          {meta.sourceSetName && <span className="truncate">{meta.sourceSetName}</span>}
        </div>
        <div className="shrink-0">
          <LabelStatusBadge status={item.labelStatus} />
        </div>
      </div>

      {/* Row 3: Game name (left) — 20px */}
      <div className="px-2 flex items-center border-b border-border/20 overflow-hidden">
        {item.game && (
          <span className="text-[10px] text-muted-foreground truncate">
            {gameLabel(item.game)}
          </span>
        )}
      </div>

      {/* Row 4: Pricing — 56px */}
      <div className="px-2 py-1.5 flex items-center justify-between gap-2 overflow-hidden text-[9px]">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-muted-foreground/70 leading-none">Qty</span>
          <span className="text-primary font-mono font-bold text-[10px]">{item.currentQuantity}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-muted-foreground/70 leading-none">Mkt</span>
          <span className="text-muted-foreground font-mono text-[10px]">
            ${item.adjustedMarketPrice != null ? item.adjustedMarketPrice.toFixed(2) : (item.currentRawMarketPrice?.toFixed(2) ?? "—")}
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-muted-foreground/70 leading-none">Rec</span>
          <span className="text-cyan-600 dark:text-cyan-400 font-mono text-[10px]">
            ${item.currentRawMarketPrice?.toFixed(2) ?? "—"}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-muted-foreground/70 leading-none">Print</span>
          <span className="text-primary font-mono font-bold text-lg">
            ${item.currentRoundedPrintPrice ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
