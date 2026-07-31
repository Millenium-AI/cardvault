import { useQuery } from "@tanstack/react-query";
import {
  Package, Tag, RefreshCcw, Upload, DollarSign,
  TrendingUp, TrendingDown, Trophy, AlertCircle, Store,
  BarChart2, ArrowRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";

/* ─────────────────────── helpers ─────────────────────── */

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  const v = Number(n);
  return (v >= 0 ? "+" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUSD(n: number | null | undefined) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcShow(show: any) {
  const cashResult =
    (show.cashSalesIn || 0) -
    (show.cashSpentOnBuys || 0) -
    (show.otherCashOut || 0) -
    (show.expensesTotal || 0);
  const invEdge =
    (show.purchasedInventoryMarketValue || 0) -
    (show.purchasedInventoryCostBasis || 0);
  const invDelta =
    (show.endingInventoryMarketValue || 0) -
    (show.startingInventoryMarketValue || 0);
  const combined = cashResult + invEdge;
  return { cashResult, invEdge, invDelta, combined };
}

/* ─────────────────────── sub-components ─────────────────────── */

function StatCard({
  label, value, icon: Icon, sub, accent = false, trend,
}: {
  label: string;
  value: string | number;
  icon: any;
  sub?: string;
  accent?: boolean;
  trend?: { value: string; up: boolean | null };
}) {
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
        {trend && (
          <div className={`text-[10px] mt-1 flex items-center gap-1 ${trend.up === true ? "text-emerald-400" : trend.up === false ? "text-red-400" : "text-muted-foreground"}`}>
            {trend.up === true && <TrendingUp size={9} />}
            {trend.up === false && <TrendingDown size={9} />}
            {trend.value}
          </div>
        )}
        {sub && !trend && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function SectionHeader({ title, linkTo }: { title: string; linkTo?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {linkTo && (
        <Link href={linkTo}>
          <a className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            View all <ArrowRight size={11} />
          </a>
        </Link>
      )}
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

/* ─────────────────────── vendor P&L band ─────────────────────── */

function VendorPnL({ shows }: { shows: any[] }) {
  if (!shows.length) return null;

  const totals = shows.reduce(
    (acc, s) => {
      const { cashResult, invEdge, combined } = calcShow(s);
      acc.cash += cashResult;
      acc.edge += invEdge;
      acc.combined += combined;
      return acc;
    },
    { cash: 0, edge: 0, combined: 0 },
  );

  const avgPerShow = shows.length > 0 ? totals.combined / shows.length : 0;

  const sorted = [...shows].sort((a, b) => calcShow(b).combined - calcShow(a).combined);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const bestCalc = calcShow(best);
  const worstCalc = calcShow(worst);

  return (
    <div className="stat-card mb-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-md bg-primary/15 text-primary">
          <Store size={14} />
        </div>
        <div className="text-sm font-semibold text-foreground">Vendor Performance</div>
        <div className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">{shows.length} show{shows.length !== 1 ? "s" : ""}</div>
      </div>

      {/* P&L summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 pb-4 border-b border-border/60">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Cash Profit</div>
          <div className={`text-lg font-bold mono ${totals.cash >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(totals.cash)}
          </div>
          <div className="text-[10px] text-muted-foreground/60">sales − buys − expenses</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Inv Edge</div>
          <div className={`text-lg font-bold mono ${totals.edge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(totals.edge)}
          </div>
          <div className="text-[10px] text-muted-foreground/60">market value of buys − cost</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Gain</div>
          <div className={`text-xl font-bold mono ${totals.combined >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(totals.combined)}
          </div>
          <div className="text-[10px] text-muted-foreground/60">cash + inventory edge</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Avg / Show</div>
          <div className={`text-lg font-bold mono ${avgPerShow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(avgPerShow)}
          </div>
          <div className="text-[10px] text-muted-foreground/60">combined gain average</div>
        </div>
      </div>

      {/* Best / worst show */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {best && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Trophy size={11} className="text-emerald-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Best Show</span>
            </div>
            <div className="text-sm font-medium text-foreground truncate">{best.showName}</div>
            <div className="text-[10px] text-muted-foreground mb-1">{best.showDate}</div>
            <div className="text-base font-bold mono text-emerald-400">{fmt(bestCalc.combined)}</div>
          </div>
        )}
        {worst && worst.id !== best?.id && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertCircle size={11} className="text-red-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Weakest Show</span>
            </div>
            <div className="text-sm font-medium text-foreground truncate">{worst.showName}</div>
            <div className="text-[10px] text-muted-foreground mb-1">{worst.showDate}</div>
            <div className="text-base font-bold mono text-red-400">{fmt(worstCalc.combined)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── show gain chart ─────────────────────── */

function ShowGainChart({ shows }: { shows: any[] }) {
  if (shows.length < 2) return null;

  const chartData = [...shows]
    .sort((a, b) => (a.showDate > b.showDate ? 1 : -1))
    .map(s => {
      const { cashResult, invEdge, combined } = calcShow(s);
      return {
        name: s.showName.length > 12 ? s.showName.slice(0, 12) + "…" : s.showName,
        cashResult: Math.round(cashResult * 100) / 100,
        invEdge: Math.round(invEdge * 100) / 100,
        combined: Math.round(combined * 100) / 100,
      };
    });

  return (
    <div className="stat-card mb-4">
      <SectionHeader title="Show Gain Over Time" linkTo="/shows" />
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={42} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="cashResult" name="Cash Profit" fill="hsl(142 71% 45%)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="invEdge" name="Inv Edge" fill="hsl(199 89% 48%)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <div className="w-2 h-2 rounded-sm bg-emerald-500" />
          Cash Profit
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <div className="w-2 h-2 rounded-sm bg-sky-500" />
          Inv Edge
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── channel breakdown ─────────────────────── */

const CHANNEL_COLORS: Record<string, string> = {
  show: "hsl(142 71% 45%)",
  in_person: "hsl(199 89% 48%)",
  online: "hsl(262 83% 58%)",
  other: "hsl(var(--muted-foreground))",
};

const CHANNEL_LABELS: Record<string, string> = {
  show: "Show",
  in_person: "In Person",
  online: "Online",
  other: "Other",
};

function ChannelBreakdown({ transactions }: { transactions: any[] }) {
  if (!transactions.length) return null;

  const channelMap: Record<string, { count: number; value: number }> = {};
  for (const tx of transactions) {
    const ch = tx.channel ?? "other";
    if (!channelMap[ch]) channelMap[ch] = { count: 0, value: 0 };
    channelMap[ch].count++;
    const v = tx.type === "sale"
      ? (tx.cashAmount ?? 0)
      : (tx.incomingItems ?? []).reduce((s: number, r: any) => s + (r.tradeCreditValue ?? 0) * (r.quantity ?? 1), 0);
    channelMap[ch].value += v;
  }

  const pieData = Object.entries(channelMap).map(([ch, d]) => ({
    name: CHANNEL_LABELS[ch] ?? ch,
    value: d.count,
    revenue: d.value,
    channel: ch,
  }));

  const totalTxns = transactions.length;
  const salesCount = transactions.filter(t => t.type === "sale").length;
  const tradeCount = transactions.filter(t => t.type === "trade").length;

  return (
    <div className="stat-card">
      <SectionHeader title="Transaction Channels" linkTo="/transactions" />
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <PieChart width={90} height={90}>
            <Pie
              data={pieData}
              cx={42}
              cy={42}
              innerRadius={26}
              outerRadius={42}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={CHANNEL_COLORS[entry.channel] ?? "hsl(var(--muted-foreground))"} />
              ))}
            </Pie>
          </PieChart>
        </div>
        <div className="flex-1 space-y-1.5">
          {pieData.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CHANNEL_COLORS[d.channel] ?? "hsl(var(--muted-foreground))" }} />
              <span className="text-muted-foreground flex-1">{d.name}</span>
              <span className="font-medium text-foreground mono">{d.value}</span>
              <span className="text-muted-foreground text-[10px]">{Math.round((d.value / totalTxns) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3 mt-3 pt-3 border-t border-border/60">
        <div className="flex-1 text-center">
          <div className="text-base font-bold mono text-foreground">{salesCount}</div>
          <div className="text-[10px] text-muted-foreground">Sales</div>
        </div>
        <div className="w-px bg-border/60" />
        <div className="flex-1 text-center">
          <div className="text-base font-bold mono text-foreground">{tradeCount}</div>
          <div className="text-[10px] text-muted-foreground">Trades</div>
        </div>
        <div className="w-px bg-border/60" />
        <div className="flex-1 text-center">
          <div className="text-base font-bold mono text-foreground">{totalTxns}</div>
          <div className="text-[10px] text-muted-foreground">Total</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── page ─────────────────────── */

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<any>({ queryKey: ["/api/dashboard/stats"] });
  const { data: historyRaw, isLoading: histLoading } = useQuery<any>({ queryKey: ["/api/snapshots/history"] });
  const { data: moversRaw, isLoading: moversLoading } = useQuery<any>({ queryKey: ["/api/snapshots/movers"] });
  const { data: showsRaw } = useQuery<any>({ queryKey: ["/api/shows"] });
  const { data: txnsRaw } = useQuery<any>({ queryKey: ["/api/transactions"] });

  const history: any[] = Array.isArray(historyRaw) ? historyRaw : [];
  const movers: any[] = Array.isArray(moversRaw) ? moversRaw : [];
  const shows: any[] = Array.isArray(showsRaw) ? showsRaw : [];
  const transactions: any[] = Array.isArray(txnsRaw) ? txnsRaw : [];

  const chartData = history.map(h => ({
    date: (() => { try { return format(parseISO(h.date), "M/d"); } catch { return h.date; } })(),
    value: h.value,
  }));

  const recentShows = shows.slice(0, 3);

  // Reprice queue dollar impact — market value of items pending reprice
  const repriceDollarSub = stats?.repricingPending > 0
    ? `${stats.repricingPending} pending review`
    : "up to date";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="hidden md:block text-xl font-semibold text-foreground">Dashboard</h1>
        <div className="text-xs text-muted-foreground hidden sm:block">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* ── KPI grid ── */}
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
              value={fmtUSD(stats?.totalMarketValue ?? 0)}
              icon={DollarSign}
              accent
            />
            <StatCard
              label="New Labels"
              value={stats?.newLabelsPending ?? 0}
              icon={Tag}
              sub="pending export"
            />
            <StatCard
              label="Reprice Queue"
              value={stats?.repricingPending ?? 0}
              icon={RefreshCcw}
              sub={repriceDollarSub}
              accent={(stats?.repricingPending ?? 0) > 0}
            />
            <StatCard label="Uploads / Week" value={stats?.uploadsThisWeek ?? 0} icon={Upload} />
          </>
        )}
      </div>

      {/* ── Vendor P&L ── */}
      {shows.length > 0 ? (
        <VendorPnL shows={shows} />
      ) : (
        <div className="stat-card mb-4 flex flex-col items-center py-8 text-center">
          <Store size={28} className="text-muted-foreground/40 mb-2" />
          <div className="text-sm text-muted-foreground font-medium">No show records yet</div>
          <div className="text-xs text-muted-foreground/60 mt-1">Add your first show to track vendor P&amp;L and performance.</div>
          <Link href="/shows">
            <a className="mt-3 text-xs text-primary hover:underline flex items-center gap-1">
              Go to Shows <ArrowRight size={11} />
            </a>
          </Link>
        </div>
      )}

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        {/* Inventory value chart */}
        <div className="lg:col-span-2 stat-card">
          <SectionHeader title="Inventory Value Over Time" />
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
          <SectionHeader title="Top Price Movers (7d)" />
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

      {/* ── Show gain chart + channel breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="lg:col-span-2">
          {shows.length >= 2 ? (
            <ShowGainChart shows={shows} />
          ) : (
            <div className="stat-card h-full flex items-center justify-center py-10 text-center">
              <div>
                <BarChart2 size={24} className="text-muted-foreground/40 mb-2 mx-auto" />
                <div className="text-xs text-muted-foreground">Add 2+ shows to see a gain-per-show chart</div>
              </div>
            </div>
          )}
        </div>
        <div>
          {transactions.length > 0 ? (
            <ChannelBreakdown transactions={transactions} />
          ) : (
            <div className="stat-card h-full flex items-center justify-center py-10 text-center">
              <div>
                <BarChart2 size={24} className="text-muted-foreground/40 mb-2 mx-auto" />
                <div className="text-xs text-muted-foreground">Log transactions to see channel breakdown</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent shows table ── */}
      {recentShows.length > 0 && (
        <div className="stat-card">
          <SectionHeader title="Recent Shows" linkTo="/shows" />
          {/* Mobile: stacked cards */}
          <div className="flex flex-col gap-2 sm:hidden">
            {recentShows.map((show: any) => {
              const { cashResult, invEdge, combined } = calcShow(show);
              return (
                <div key={show.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <div className="text-sm font-medium text-foreground">{show.showName}</div>
                    <div className="text-xs text-muted-foreground">{show.showDate}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-mono font-medium ${combined >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(combined)}
                    </div>
                    <div className="text-xs text-muted-foreground">total gain</div>
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
                  <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground">Cash Profit</th>
                  <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground">Inv Edge</th>
                  <th className="text-right py-2 pr-4 text-xs font-medium text-muted-foreground">Total Gain</th>
                  <th className="text-right py-2 text-xs font-medium text-muted-foreground">Inv Δ</th>
                </tr>
              </thead>
              <tbody>
                {recentShows.map((show: any) => {
                  const { cashResult, invEdge, invDelta, combined } = calcShow(show);
                  return (
                    <tr key={show.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                      <td className="py-2 pr-4 font-medium text-foreground">{show.showName}</td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{show.showDate}</td>
                      <td className={`py-2 pr-4 text-right mono text-xs ${cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmt(cashResult)}
                      </td>
                      <td className={`py-2 pr-4 text-right mono text-xs ${invEdge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmt(invEdge)}
                      </td>
                      <td className={`py-2 pr-4 text-right mono text-xs font-semibold ${combined >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmt(combined)}
                      </td>
                      <td className={`py-2 text-right mono text-xs ${invDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {fmt(invDelta)}
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
