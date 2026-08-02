import { CheckSquare, Square } from "lucide-react";
import { ConditionBadge } from "@/components/ConditionBadge";
import { PriceDivergenceBadge } from "@/components/PriceDivergenceBadge";
import { gameLabel } from "@shared/gameLabels";
import { LabelStatusBadge } from "./DetailPanel";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";
import { parseMatchMetadata, getPricingSummary } from "./utils";

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
  const meta = parseMatchMetadata(item.matchMetadataJson);
  const pricing = getPricingSummary(item);

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
          gridTemplateRows: "auto 18px 16px 14px 38px",
          gridTemplateColumns: "1fr",
          gap: 0,
        }}
      >
        {/* Select checkbox */}
        {selectMode && (
          <div className="absolute top-0 left-0 z-10">
            {selected
              ? <CheckSquare size={12} className="text-primary drop-shadow" />
              : <Square size={12} className="text-muted-foreground" />}
          </div>
        )}

        {/* Divergence badge */}
        <div className="absolute top-0 right-0 z-10">
          <PriceDivergenceBadge item={item} />
        </div>

        {/* Image row */}
        <div className="relative w-full" style={{ aspectRatio: "3/4", margin: 0, padding: 0 }}>
          <CardImagePlaceholder
            photoUrl={item.photoUrl}
            size="sm"
            className="absolute inset-0 w-full h-full object-cover bg-muted rounded-none"
          />
        </div>

        {/* Row 1 */}
        <div
          className="flex items-center justify-between gap-1 overflow-hidden"
          style={{ paddingLeft: "0.25px", paddingRight: "0.25px" }}
        >
          <div className="min-w-0 flex-1 text-[10px] font-medium text-foreground truncate">
            {meta.cleanName || item.productName}
          </div>
          <div className="shrink-0">
            <ConditionBadge condition={item.condition} abbreviated />
          </div>
        </div>

        {/* Row 2 */}
        <div
          className="flex items-center justify-between gap-1 overflow-hidden"
          style={{ paddingLeft: "0.25px", paddingRight: "0.25px" }}
        >
          <div className="flex items-center gap-0.5 min-w-0 flex-1 text-[9px] text-muted-foreground">
            {item.number && <span className="shrink-0">{item.number}</span>}
            {item.number && meta.sourceSetName && <span className="shrink-0">·</span>}
            {meta.sourceSetName && <span className="truncate text-[9px]">{meta.sourceSetName}</span>}
          </div>
          <div className="shrink-0">
            <LabelStatusBadge status={item.labelStatus} />
          </div>
        </div>

        {/* Row 3 */}
        <div
          className="flex items-center overflow-hidden"
          style={{ paddingLeft: "0.25px", paddingRight: "0.25px" }}
        >
          {item.game && (
            <span className="text-[9px] text-muted-foreground truncate">
              {gameLabel(item.game)}
            </span>
          )}
        </div>

        {/* Row 4 */}
        <div
          className="grid grid-cols-2 gap-x-1 gap-y-0.5 overflow-hidden text-[8px]"
          style={{
            paddingLeft: "0.25px",
            paddingRight: "0.25px",
            paddingTop: 0,
            paddingBottom: 0,
          }}
        >
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="text-muted-foreground/70 leading-none">Qty</span>
            <span className="text-primary font-mono font-bold text-[9px]">{pricing.quantityLabel}</span>
          </div>

          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="text-muted-foreground/70 leading-none">Mkt</span>
            <span className="text-muted-foreground font-mono text-[9px] truncate">{pricing.marketDisplay}</span>
          </div>

          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="text-muted-foreground/70 leading-none">Rec</span>
            <span className="text-cyan-600 dark:text-cyan-400 font-mono text-[9px] truncate">{pricing.rawMarketDisplay}</span>
          </div>

          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="text-muted-foreground/70 leading-none">Print</span>
            <span className="text-primary font-mono font-bold text-sm truncate">{pricing.printDisplay}</span>
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
          className="absolute inset-0 w-full h-full object-cover bg-muted rounded-none"
        />
      </div>

      {/* Row 1: Card name (left) | Condition (right) — 28px */}
      <div className="px-2 flex items-center justify-between gap-2 overflow-hidden" style={{ padding: 0 }}>
        <div className="min-w-0 flex-1 text-xs font-medium text-foreground truncate">
          {meta.cleanName || item.productName}
        </div>
        <div className="shrink-0">
          <ConditionBadge condition={item.condition} abbreviated />
        </div>
      </div>

      {/* Row 2: Number + Set (left) | Label badge (right) — 24px */}
      <div className="px-2 flex items-center justify-between gap-2 overflow-hidden" style={{ padding: 0 }}>
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
      <div className="px-2 flex items-center overflow-hidden" style={{ padding: 0 }}>
        {item.game && (
          <span className="text-[10px] text-muted-foreground truncate">
            {gameLabel(item.game)}
          </span>
        )}
      </div>

      {/* Row 4: Pricing — compact 2x2 layout */}
      <div className="px-2 py-1.5 grid grid-cols-2 gap-x-1.5 gap-y-0.5 overflow-hidden text-[9px]" style={{ padding: 0 }}>
        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="text-muted-foreground/70 leading-none">Qty</span>
          <span className="text-primary font-mono font-bold text-[10px]">
            {pricing.quantityLabel}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="text-muted-foreground/70 leading-none">Mkt</span>
          <span className="text-muted-foreground font-mono text-[10px] truncate">
            {pricing.marketDisplay}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="text-muted-foreground/70 leading-none">Rec</span>
          <span className="text-cyan-600 dark:text-cyan-400 font-mono text-[10px] truncate">
            {pricing.rawMarketDisplay}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1 min-w-0">
          <span className="text-muted-foreground/70 leading-none">Print</span>
          <span className="text-primary font-mono font-bold text-sm truncate">
            {pricing.printDisplay}
          </span>
        </div>
      </div>
    </div>
  );
}
