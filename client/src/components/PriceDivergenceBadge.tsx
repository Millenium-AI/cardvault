import { ArrowUp, ArrowDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function PriceDivergenceBadge({ item }: { item: any }) {
  if (item.priceDivergencePct == null) return null;

  const pct = item.priceDivergencePct;
  const isFlagged = item.divergenceFlagged;
  const isPositive = pct > 0; // Sales above market price
  const isWeakMatch = item.lastSaleMatch === "condition_only";
  const isPriceLocked = item.priceLocked;

  // Check if data is stale (older than 7 days)
  const staleMs = item.lastSaleFetchedAt ? Date.now() - new Date(item.lastSaleFetchedAt).getTime() : 0;
  const isStale = staleMs > 7 * 24 * 60 * 60 * 1000;

  // Format the tooltip date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "unknown";
    const date = new Date(dateStr);
    const now = new Date();
    const days = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  };

  const meta = (() => {
    try {
      return JSON.parse(item.matchMetadataJson || "{}");
    } catch {
      return {};
    }
  })();

  const printing = meta.sourcePrinting ?? "Normal";
  const condition = item.condition ?? "Unknown";
  const count = item.lastSaleCount ?? 0;
  const avgPrice = item.adjustedMarketPrice ? `$${item.adjustedMarketPrice.toFixed(2)}` : "unknown";
  const lastDate = formatDate(item.lastSaleFetchedAt);

  const tooltipText = `Avg of ${count} ${condition}${printing ? ` / ${printing}` : ""} sales · ${avgPrice} · ${lastDate}`;

  // Color classes
  const colorClasses = !isFlagged
    ? "bg-muted/80 text-muted-foreground" // Neutral grey when not flagged
    : isPositive
      ? "bg-amber-500/15 text-amber-400" // Amber for underpriced
      : "bg-red-500/15 text-red-400"; // Red for overpriced

  // Outline variant if weak match
  const variantClasses = isWeakMatch
    ? "border border-current/30"
    : "";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold tabular-nums",
        "transition-opacity duration-200",
        colorClasses,
        variantClasses,
        isStale && "opacity-50",
      )}
      title={tooltipText}
    >
      {isFlagged && isPositive && <ArrowUp size={10} className="shrink-0" />}
      {isFlagged && !isPositive && <ArrowDown size={10} className="shrink-0" />}
      <span>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>
      {isPriceLocked && <Lock size={9} className="shrink-0 ml-0.5" />}
    </div>
  );
}
