import { CheckSquare, Square } from "lucide-react";
import { ConditionBadge } from "@/components/ConditionBadge";
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
        className={`relative stat-card cursor-pointer transition-colors overflow-hidden rounded-lg ${
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

        {/* Portrait image — 3/4 aspect ratio */}
        <div className="relative w-full" style={{ aspectRatio: "3/4" }}>
          <CardImagePlaceholder
            photoUrl={item.photoUrl}
            size="sm"
            className="absolute inset-0 w-full h-full object-contain bg-muted rounded-t-lg"
          />
        </div>

        {/* Info below image */}
        <div className="px-1.5 py-1.5 flex flex-col gap-0.5">
          <div className="text-[10px] font-medium text-foreground truncate leading-tight">
            {item.productName}
          </div>
          <div className="flex items-center gap-1">
            <ConditionBadge condition={item.condition} abbreviated />
            <LabelStatusBadge status={item.labelStatus} />
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[9px] text-muted-foreground font-mono">
              ${item.currentRawMarketPrice?.toFixed(2) ?? "—"}
            </span>
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
      className={`relative stat-card cursor-pointer transition-colors overflow-hidden rounded-lg ${
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

      {/* Portrait image — 3/4 aspect ratio, full card face */}
      <div className="relative w-full" style={{ aspectRatio: "3/4" }}>
        <CardImagePlaceholder
          photoUrl={item.photoUrl}
          size="md"
          className="absolute inset-0 w-full h-full object-contain bg-muted rounded-t-lg"
        />
      </div>

      {/* Info below image */}
      <div className="px-2.5 py-2 flex flex-col gap-1">
        {/* Name */}
        <div className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
          {item.productName}
        </div>

        {/* Set name */}
        {meta.sourceSetName && (
          <div className="text-[10px] text-muted-foreground truncate">
            {meta.sourceSetName}
          </div>
        )}

        {/* Condition + game */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <ConditionBadge condition={item.condition} abbreviated />
          <span className="text-[10px] text-muted-foreground">{gameLabel(item.game)}</span>
        </div>

        {/* Label status */}
        <LabelStatusBadge status={item.labelStatus} />

        {/* Prices + qty */}
        <div className="mt-1 space-y-0.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Market</span>
            <span className="font-mono text-foreground">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Print</span>
            <span className="font-mono font-bold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Qty</span>
            <span className="font-mono text-foreground">{item.currentQuantity}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
