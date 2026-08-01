export function SearchRecentSalesPanel({
  salesData,
  isLoading,
}: {
  salesData: any;
  isLoading: boolean;
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

  const { sales, avgPrice, salePrices, priceCount } = salesData;
  const validSales = sales.filter((s: any) => !s.is_outlier);

  return (
    <div className="space-y-4">
      {/* Stats tiles */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <div className="text-[10px] text-muted-foreground">Avg Price</div>
          <div className="text-sm font-mono font-semibold text-emerald-400">
            ${avgPrice?.toFixed(2) ?? "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <div className="text-[10px] text-muted-foreground">High</div>
          <div className="text-sm font-mono font-semibold text-foreground">
            ${salePrices?.length ? Math.max(...salePrices).toFixed(2) : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <div className="text-[10px] text-muted-foreground">Low</div>
          <div className="text-sm font-mono font-semibold text-foreground">
            ${salePrices?.length ? Math.min(...salePrices).toFixed(2) : "—"}
          </div>
        </div>
      </div>

      {/* Sales table */}
      {validSales.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground px-1">
            Sales ({priceCount} recent)
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
                  <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {validSales.map((sale: any, idx: number) => {
                  const saleDate = new Date(sale.order_date);
                  const dateStr = saleDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <tr
                      key={idx}
                      className="border-b border-border/50 last:border-b-0 hover:bg-muted/10"
                    >
                      <td className="px-2 py-1.5">{dateStr}</td>
                      <td className="text-right px-2 py-1.5 font-mono">
                        ${sale.purchase_price.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5">{sale.condition ?? "—"}</td>
                      <td className="text-center px-2 py-1.5">{sale.quantity}</td>
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
        Based on {priceCount} recent sales
      </p>
    </div>
  );
}
