export function SearchRecentSalesPanel({
  salesData,
  isLoading,
  variant,
}: {
  salesData: any;
  isLoading: boolean;
  variant?: any;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center">
        <p className="text-xs text-muted-foreground">Loading sales data…</p>
      </div>
    );
  }

  if (!salesData || !salesData.sales || salesData.sales.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          No recent sales on TCGplayer for this product
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          This usually means an illiquid card whose market price may be stale
        </p>
      </div>
    );
  }

  const { sales, avgPrice, salePrices, priceCount, calculationMethod } = salesData;
  const outlierCount = sales.filter((s: any) => s.isOutlier).length;

  // Calculate price divergence %
  const tcgplayerPrice = variant?.price ?? null;
  const priceDivergencePct = tcgplayerPrice && avgPrice
    ? ((avgPrice - tcgplayerPrice) / tcgplayerPrice) * 100
    : null;

  return (
    <div className="space-y-4">
      {/* Stats tiles */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <div className="text-[10px] text-muted-foreground">TCGplayer</div>
          <div className="text-sm font-mono font-semibold text-foreground">
            ${tcgplayerPrice?.toFixed(2) ?? "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <div className="text-[10px] text-muted-foreground">Sales Avg</div>
          <div className="text-sm font-mono font-semibold text-foreground">
            ${avgPrice?.toFixed(2) ?? "—"}
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
            ${tcgplayerPrice != null ? Math.ceil(tcgplayerPrice) : "—"}
          </div>
        </div>
      </div>

      {/* Sales table */}
      {sales.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground px-1">
            Sales history ({sales.length} total)
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">
                    Date
                  </th>
                  <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">
                    Price
                  </th>
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">
                    Cond
                  </th>
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">
                    Printing
                  </th>
                  <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale: any, idx: number) => {
                  const isOutlier = sale.isOutlier;
                  const saleDate = new Date(sale.orderDate);
                  const dateStr = saleDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <tr
                      key={idx}
                      className={`border-b border-border/50 last:border-b-0 ${
                        isOutlier
                          ? "bg-muted/15 text-muted-foreground/60"
                          : "hover:bg-muted/10"
                      }`}
                    >
                      <td className="px-2 py-1.5">{dateStr}</td>
                      <td className={`text-right px-2 py-1.5 font-mono ${isOutlier ? "line-through" : ""}`}>
                        ${sale.purchasePrice.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5">{sale.condition ?? "—"}</td>
                      <td className="px-2 py-1.5">{sale.variant ?? "Normal"}</td>
                      <td className="text-center px-2 py-1.5">{sale.quantity}</td>
                      {isOutlier && (
                        <td className="px-2 py-1.5">
                          <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                            outlier
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
      <p className="text-xs text-muted-foreground/70 px-1">
        {calculationMethod || `Based on ${priceCount} sales`}
      </p>
    </div>
  );
}
