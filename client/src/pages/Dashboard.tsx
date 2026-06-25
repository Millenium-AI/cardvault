import { useQuery } from "@tanstack/react-query";
import { Package, Tag, RefreshCcw, Upload, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";

function StatCard({
  label, value, icon: Icon, sub, accent = false
}: { label: string; value: string | number; icon: any; sub?: string; accent?: boolean }) {
  return (
    <div className="stat-card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none">{label}</span>
        <div className={`p-1.5 rounded-md ${accent ? "bg-primary/15 text-primary" : "bg-accent text-muted-foreground"}`}>
          <Icon size={14} />
        </div>
      </div>
      <div>
        <div className="text-xl font-bold text-foreground mono leading-none">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color }} className="font-medium">
          {typeof p.value === "number"
            ? `$${p.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : p.value}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<any>({ queryKey: ["/api/dashboard/stats"] });
  const { data: history = [], isLoading: histLoading } = useQuery<any[]>({ queryKey: ["/api/snapshots/history"] });
  const { data: movers = [], isLoading: moversLoading } = useQuery<any[]>({ queryKey: ["/api/snapshots/movers"] });
  const { data: shows = [] } = useQuery<any[]>({ queryKey: ["/api/shows"] });

  const chartData = history.map(h => ({
    date: (() => { try { return format(parseISO(h.date), "M/d"); } catch { return h.date; } })(),
    value: h.value,
  }));

  const recentShows = shows.slice(0, 3);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <div className="text-xs text-muted-foreground hidden sm:block">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* KPI grid — 2 cols on mobile, 3 on sm, 6 on lg */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-4 md:mb-6">
        {statsLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="stat-card"><Skeleton className="h-14 w-full" /></div>
          ))
        ) : (
          <>
            <StatCard label="Total SKUs" value={(stats?.totalItems ?? 0).toLocaleString()} icon={Package} />
            <StatCard label="Total Units" value={(stats?.totalQuantity ?? 0).toLocaleString()} icon={Package} />
            <StatCard
              label="Market Value"
              value={`$${((stats?.totalMarketValue ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={DollarSign}
              accent
            />
            <StatCard label="New Labels" value={stats?.newLabelsPending ?? 0} icon={Tag} sub="pending export" />
            <StatCard label="Reprice Queue" value={stats?.repricingPending ?? 0} icon={RefreshCcw} sub="pending review" />
            <StatCard label="Uploads / Week" value={stats?.uploadsThisWeek ?? 0} icon={Upload} />
          </>
        )}
      </div>

      {/* Charts — stack on mobile, side-by-side on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        {/* Value chart */}
        <div className="lg:col-span-2 stat-card">
          <div className="text-sm font-semibold text-foreground mb-3">Inventory Value Over Time</div>
          {histLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : chartData.length <= 1 ? (
            <div className="h-40 flex items-center justify-center text-center text-muted-foreground text-xs px-4">
              {chartData.length === 0
                ? "No price history yet — upload inventory to start tracking"
                : "Upload more CSVs over time to see value trends. First snapshot recorded today."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={36} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" name="Market Value" stroke="hsl(142 71% 45%)" fill="url(#valueGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Price movers */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-3">Top Price Movers (7d)</div>
          {moversLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : movers.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-xs text-center px-4">
              No price movement data yet
            </div>
          ) : (
            <div className="space-y-1.5 overflow-y-auto max-h-44">
              {movers.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 py-1 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{m.productName}</div>
                    <div className="text-[10px] text-muted-foreground">{m.number}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.pctChange > 0
                      ? <TrendingUp size={11} className="text-emerald-400" />
                      : <TrendingDown size={11} className="text-red-400" />}
                    <span className={`text-xs font-mono font-medium ${m.pctChange > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {m.pctChange > 0 ? "+" : ""}{m.pctChange}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent shows */}
      {recentShows.length > 0 && (
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-3">Recent Shows</div>
          {/* Mobile: stacked cards */}
          <div className="flex flex-col gap-2 sm:hidden">
            {recentShows.map((show: any) => {
              const cashResult = (show.cashSalesIn || 0) - (show.cashSpentOnBuys || 0) - (show.otherCashOut || 0) - (show.expensesTotal || 0);
              const invEdge = (show.purchasedInventoryMarketValue || 0) - (show.purchasedInventoryCostBasis || 0);
              return (
                <div key={show.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <div className="text-sm font-medium text-foreground">{show.showName}</div>
                    <div className="text-xs text-muted-foreground">{show.showDate}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-mono font-medium ${cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {cashResult >= 0 ? "+" : ""}${cashResult.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">cash</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Show</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground">Cash Result</th>
                  <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground">Inv Edge</th>
                  <th className="text-right py-2 text-xs font-medium text-muted-foreground">Inv Δ</th>
                </tr>
              </thead>
              <tbody>
                {recentShows.map((show: any) => {
                  const cashResult = (show.cashSalesIn || 0) - (show.cashSpentOnBuys || 0) - (show.otherCashOut || 0) - (show.expensesTotal || 0);
                  const invEdge = (show.purchasedInventoryMarketValue || 0) - (show.purchasedInventoryCostBasis || 0);
                  const invDelta = (show.endingInventoryMarketValue || 0) - (show.startingInventoryMarketValue || 0);
                  return (
                    <tr key={show.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                      <td className="py-2 pr-4 font-medium text-foreground">{show.showName}</td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{show.showDate}</td>
                      <td className={`py-2 pr-4 text-right mono text-xs ${cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {cashResult >= 0 ? "+" : ""}${cashResult.toFixed(2)}
                      </td>
                      <td className={`py-2 pr-4 text-right mono text-xs ${invEdge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {invEdge >= 0 ? "+" : ""}${invEdge.toFixed(2)}
                      </td>
                      <td className={`py-2 text-right mono text-xs ${invDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {invDelta >= 0 ? "+" : ""}${invDelta.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
