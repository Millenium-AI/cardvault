import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, RotateCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";

export function RecentSalesPanel({ item }: { item: any }) {
  const queryClient = useQueryClient();
  const [isToggling, setIsToggling] = useState(false);

  // Fetch sales data
  const { data: salesData, isLoading, isFetching } = useQuery({
    queryKey: [`/api/inventory/${item.id}/sales`],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/${item.id}/sales`);
      if (!res.ok) throw new Error("Failed to fetch sales");
      return res.json();
    },
  });

  // Manual re-check mutation
  const reCheckMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/prices/check-sales", {
        itemIds: [item.id],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: [`/api/inventory/${item.id}/sales`] });
    },
  });

  // Pin toggle mutation
  const pinMutation = useMutation({
    mutationFn: async (locked: boolean) => {
      return apiRequest("PATCH", `/api/inventory/${item.id}`, {
        priceLocked: locked,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
  });

  const togglePin = async () => {
    setIsToggling(true);
    try {
      await pinMutation.mutateAsync(!item.priceLocked);
    } finally {
      setIsToggling(false);
    }
  };

  if (!salesData) return null;

  const { sales, lastSaleMatch, lastSaleCount, lastSaleOutliers, adjustedMarketPrice, priceDivergencePct } = salesData;

  // Parse metadata for condition and printing
  const meta = (() => {
    try {
      return JSON.parse(item.matchMetadataJson || "{}");
    } catch {
      return {};
    }
  })();

  const condition = item.condition ?? "Unknown";
  const printing = meta.sourcePrinting ?? "Normal";

  // Format relative time for "checked"
  const formatCheckedTime = () => {
    if (!item.lastSaleFetchedAt) return "never";
    const date = new Date(item.lastSaleFetchedAt);
    const now = new Date();
    const days = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
    const hours = Math.floor(((now.getTime() - date.getTime()) % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days === 0 && hours === 0) return "just now";
    if (days === 0) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  };

  // Empty state
  if (!sales || sales.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Recent Sales</h3>
          <span className="text-xs text-muted-foreground">checked {formatCheckedTime()}</span>
        </div>
        <div className="p-4 rounded-lg border border-border/50 bg-muted/30 text-center">
          <p className="text-sm text-muted-foreground">
            No recent sales on TCGplayer for this product
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            This usually means an illiquid card whose market price may be stale
          </p>
        </div>
      </div>
    );
  }

  // Calculate stats
  const includedSales = sales.filter((s: any) => !s.isOutlier);
  const otherConditionCount = includedSales.filter(
    (s: any) => s.condition !== condition || (s.variant ?? "Normal") !== printing
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Recent Sales</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">checked {formatCheckedTime()}</span>
          <button
            onClick={() => reCheckMutation.mutate()}
            disabled={reCheckMutation.isPending || isFetching}
            className="text-xs px-2 py-1 rounded border border-border/50 hover:bg-accent/20 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            <RotateCw size={12} />
            Re-check
          </button>
        </div>
      </div>

      {/* Stats tiles */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <div className="text-[10px] text-muted-foreground">JustTCG</div>
          <div className="text-sm font-mono font-semibold text-foreground">
            ${item.currentRawMarketPrice?.toFixed(2) ?? "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <div className="text-[10px] text-muted-foreground">Sales Avg</div>
          <div className="text-sm font-mono font-semibold text-foreground">
            ${adjustedMarketPrice?.toFixed(2) ?? "—"}
          </div>
        </div>
        <div className={`rounded-lg border border-border bg-muted/30 p-2 ${
          priceDivergencePct != null && priceDivergencePct > 0 ? "bg-amber-500/10" :
          priceDivergencePct != null && priceDivergencePct < 0 ? "bg-red-500/10" : ""
        }`}>
          <div className="text-[10px] text-muted-foreground">Difference</div>
          <div className={`text-sm font-mono font-semibold ${
            priceDivergencePct != null && priceDivergencePct > 0 ? "text-amber-400" :
            priceDivergencePct != null && priceDivergencePct < 0 ? "text-red-400" : "text-foreground"
          }`}>
            {priceDivergencePct != null ? `${priceDivergencePct > 0 ? "+" : ""}${priceDivergencePct.toFixed(1)}%` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <div className="text-[10px] text-muted-foreground">Print Price</div>
          <div className="text-sm font-mono font-semibold text-primary">
            ${item.currentRoundedPrintPrice ?? "—"}
          </div>
        </div>
      </div>

      {/* Sales table */}
      {sales.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground px-1">
            Sales ({lastSaleCount} matching)
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">Date</th>
                  <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">Price</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">Cond</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">Printing</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Qty</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale: any, idx: number) => {
                  const isOutlier = sale.isOutlier;
                  const isOtherCondition = sale.condition !== condition || (sale.variant ?? "Normal") !== printing;
                  const saleDate = new Date(sale.orderDate);
                  const dateStr = saleDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

                  return (
                    <tr
                      key={idx}
                      className={`border-b border-border/50 last:border-b-0 ${
                        isOutlier || isOtherCondition
                          ? "bg-muted/15 text-muted-foreground/60"
                          : "hover:bg-muted/10"
                      }`}
                    >
                      <td className="px-2 py-1.5">{dateStr}</td>
                      <td className={`text-right px-2 py-1.5 font-mono ${isOutlier || isOtherCondition ? "line-through" : ""}`}>
                        ${sale.purchasePrice.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5">{sale.condition ?? "—"}</td>
                      <td className="px-2 py-1.5">{sale.variant ?? "Normal"}</td>
                      <td className="text-center px-2 py-1.5">{sale.quantity}</td>
                      {(isOutlier || isOtherCondition) && (
                        <td className="px-2 py-1.5">
                          <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded ${
                            isOutlier
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-muted/50 text-muted-foreground"
                          }`}>
                            {isOutlier ? "outlier" : "other condition"}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground/70">
          Average of {lastSaleCount} {condition}{printing !== "Normal" ? ` / ${printing}` : ""} sales
          {lastSaleOutliers > 0 && ` · ${lastSaleOutliers} outliers excluded`}
          {otherConditionCount > 0 && ` · ${otherConditionCount} other condition${otherConditionCount > 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Pin toggle */}
      <div className="pt-2 border-t border-border/50">
        <button
          onClick={togglePin}
          disabled={isToggling}
          className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            item.priceLocked
              ? "bg-accent/30 text-foreground hover:bg-accent/40"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
          } disabled:opacity-50`}
        >
          {item.priceLocked ? <Lock size={12} /> : <LockOpen size={12} />}
          <span className="flex-1 text-left">
            {item.priceLocked
              ? "Price pinned — automatic sales adjustment is off for this card"
              : "Pin price to prevent automatic adjustments"}
          </span>
        </button>
      </div>
    </div>
  );
}
