import { useQuery } from "@tanstack/react-query";
import {
  Package, RefreshCcw, DollarSign,
  TrendingUp, TrendingDown, Trophy, AlertCircle, Store,
  BarChart2, ArrowRight, Clock, AlertTriangle, Wallet,
  ArrowDownRight, ArrowUpRight, Boxes,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
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

/* ── monthly cashflow ──
 * Full-picture monthly result: real cash in/out plus the market value of
 * inventory that moved in or out during the month.
 *
 * Cash in    = direct (non-show) transaction cash + show ledger cashSalesIn
 * Cash out   = show cashSpentOnBuys + otherCashOut + expensesTotal
 *              + cash paid on non-show trade-ins (cashAmount < 0)
 * Inv in     = show purchasedInventoryMarketValue + trade-in market value
 * Inv out    = allocated price of outgoing items on all transactions
 * Net cash   = cash in - cash out
 * Total      = net cash + (inv in - inv out)
 *
 * Transactions attached to a show are excluded from cash so they are not
 * double counted against that show's ledger totals.
 */
function monthBounds(ref = new Date()) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  return { start, end };
}

function inMonth(dateStr: string | null | undefined, start: Date, end: Date) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d >= start && d < end;
}

function calcMonthlyCashflow(transactions: any[], shows: any[], ref = new Date()) {
  const { start, end } = monthBounds(ref);

  const monthTxns = transactions.filter(t => inMonth(t.occurredAt, start, end));
  const monthShows = shows.filter(s => inMonth(s.showDate, start, end));

  let salesCashIn = 0;
  let tradeCashOut = 0;
  let invInTrades = 0;
  let invOut = 0;
  let tradeCreditIssued = 0;
  let cardsSold = 0;

  for (const t of monthTxns) {
    const cash = Number(t.cashAmount || 0);
    // show-attached cash rolls up through the show ledger instead
    if (!t.showId) {
      if (cash > 0) salesCashIn += cash;
      else if (cash < 0) tradeCashOut += Math.abs(cash);
    }
    for (const it of (t.items || [])) {
      const qty = Number(it.quantity || 1);
      invOut += Number(it.allocatedPrice || 0) * qty;
      cardsSold += qty;
    }
    for (const it of (t.incomingItems || [])) {
      if (it.status === "rejected") continue;
      const qty = Number(it.quantity || 1);
      invInTrades += Number(it.cachedMarketPrice || 0) * qty;
      tradeCreditIssued += Number(it.tradeCreditValue || 0);
    }
  }

  let showCashIn = 0;
  let showBuys = 0;
  let showOtherOut = 0;
  let showExpenses = 0;
  let invInShows = 0;

  for (const s of monthShows) {
    showCashIn += Number(s.cashSalesIn || 0);
    showBuys += Number(s.cashSpentOnBuys || 0);
    showOtherOut += Number(s.otherCashOut || 0);
    showExpenses += Number(s.expensesTotal || 0);
    invInShows += Number(s.purchasedInventoryMarketValue || 0);
  }

  const cashIn = salesCashIn + showCashIn;
  const cashOut = showBuys + showOtherOut + showExpenses + tradeCashOut;
  const netCash = cashIn - cashOut;
  const invIn = invInShows + invInTrades;
  const invNet = invIn - invOut;

  return {
    monthLabel: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    cashIn, salesCashIn, showCashIn,
    cashOut, showBuys, showOtherOut, showExpenses, tradeCashOut,
    netCash,
    invIn, invInShows, invInTrades, invOut, invNet,
    tradeCreditIssued,
    cardsSold,
    total: netCash + invNet,
    txnCount: monthTxns.length,
    showCount: monthShows.length,
  };
}

/** Days since a date string */
function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/* ─────────────────────── sub-components ─────────────────────── */

function StatCard({
  label, value, icon: Icon, sub, accent = false, warn = false, trend,
}: {
  label: string;
  value: string | number;
  icon: any;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
  trend?: { value: string; up: boolean | null };
}) {
  const iconBg = warn
    ? "bg-amber-500/15 text-amber-400"
    : accent
    ? "bg-primary/15 text-primary"
    : "bg-accent text-muted-foreground";

  return (
    <div className="stat-card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-none">{label}</span>
        <div className={`p-1.5 rounded-md ${iconBg}`}>
          <Icon size={14} />
        </div>
      </div>
      <div>
        <div className={`text-xl font-bold leading-none mono ${warn ? "text-amber-400" : "text-foreground"}`}>{value}</div>
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
          {p.name}: {typeof p.value === "number"
            ? p.name?.toLowerCase().includes("value") || p.name?.toLowerCase().includes("$")
              ? `$${p.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : p.value.toLocaleString()
            : p.value}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── inventory health (aging) ─────────────────────── */

const AGE_BUCKETS = [
  { label: "0–30d",   min: 0,   max: 30,  color: "hsl(142 71% 45%)" },
  { label: "31–90d",  min: 31,  max: 90,  color: "hsl(199 89% 48%)" },
  { label: "91–180d", min: 91,  max: 180, color: "hsl(38 92% 50%)"  },
  { label: "180d+",   min: 181, max: Infinity, color: "hsl(0 72% 51%)" },
];

function InventoryHealth({ items }: { items: any[] }) {
  if (!items.length) return (
    <div className="stat-card h-full flex items-center justify-center py-10 text-center">
      <div>
        <Clock size={24} className="text-muted-foreground/40 mb-2 mx-auto" />
        <div className="text-xs text-muted-foreground">No inventory yet — upload to see aging</div>
      </div>
    </div>
  );

  const buckets = AGE_BUCKETS.map(b => {
    const matches = items.filter(item => {
      const age = daysSince(item.lastSeenAt || item.firstSeenAt);
      return age >= b.min && age <= b.max;
    });
    const value = matches.reduce((s, i) => s + (i.currentRawMarketPrice || 0) * (i.currentQuantity || 1), 0);
    return { label: b.label, skus: matches.length, value: Math.round(value * 100) / 100, color: b.color };
  });

  const totalSkus = items.length;

  return (
    <div className="stat-card">
      <SectionHeader title="Inventory Age" linkTo="/inventory" />
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={buckets} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="skus" name="SKUs" radius={[3, 3, 0, 0]}>
            {buckets.map((b, i) => (
              <Cell key={i} fill={b.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
        {buckets.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: b.color }} />
            <span className="text-[10px] text-muted-foreground flex-1">{b.label}</span>
            <span className="text-[10px] font-medium text-foreground mono">{b.skus}</span>
            <span className="text-[10px] text-muted-foreground/60 mono">{Math.round((b.skus / totalSkus) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── dead stock top cards ─────────────────────── */

function DeadStock({ items }: { items: any[] }) {
  if (!items.length) return null;

  const stale = items
    .filter(i => daysSince(i.lastSeenAt || i.firstSeenAt) >= 90)
    .map(i => ({
      ...i,
      age: daysSince(i.lastSeenAt || i.firstSeenAt),
      totalValue: (i.currentRawMarketPrice || 0) * (i.currentQuantity || 1),
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 6);

  if (!stale.length) return (
    <div className="stat-card h-full flex items-center justify-center py-8 text-center">
      <div>
        <Trophy size={22} className="text-emerald-400/60 mb-2 mx-auto" />
        <div className="text-xs font-medium text-foreground">No stale stock</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">All items seen within 90 days</div>
      </div>
    </div>
  );

  return (
    <div className="stat-card">
      <SectionHeader title="Stale Stock  ≥ 90d" linkTo="/inventory" />
      <div className="space-y-1.5 overflow-y-auto max-h-52">
        {stale.map((item: any) => (
          <div key={item.id} className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{item.productName}</div>
              <div className="text-[10px] text-muted-foreground flex gap-1.5">
                {item.game && <span>{item.game}</span>}
                {item.condition && <span>· {item.condition}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-mono font-semibold text-amber-400">{fmtUSD(item.totalValue)}</div>
              <div className="text-[10px] text-muted-foreground">{item.age}d old · qty {item.currentQuantity ?? 1}</div>
            </div>
          </div>
        ))}
      </div>
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
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-md bg-primary/15 text-primary">
          <Store size={14} />
        </div>
        <div className="text-sm font-semibold text-foreground">Vendor Performance</div>
        <div className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">{shows.length} show{shows.length !== 1 ? "s" : ""}</div>
      </div>

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
      const { cashResult, invEdge } = calcShow(s);
      return {
        name: s.showName.length > 12 ? s.showName.slice(0, 12) + "…" : s.showName,
        cashResult: Math.round(cashResult * 100) / 100,
        invEdge: Math.round(invEdge * 100) / 100,
      };
    });

  return (
    <div className="stat-card mb-4">
      <SectionHeader title="Show Gain Over Time" linkTo="/shows" />
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={chartData} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={42} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="cashResult" name="Cash Profit $" fill="hsl(142 71% 45%)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="invEdge" name="Inv Edge $" fill="hsl(199 89% 48%)" radius={[2, 2, 0, 0]} />
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

/* ─────────────────────── price movers ─────────────────────── */

function PriceMovers({ movers, isLoading }: { movers: any[]; isLoading: boolean }) {
  return (
    <div className="stat-card">
      <SectionHeader title="Top Price Movers (7d)" />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : movers.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground text-xs text-center px-4">
          No price movement data yet
        </div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto max-h-52">
          {movers.map((m: any) => (
            <div key={m.id} className="flex items-center gap-2 py-1 border-b border-border/50 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{m.productName}</div>
                <div className="text-[10px] text-muted-foreground">{m.number}</div>
              </div>
              <div className="flex flex-col items-end shrink-0 gap-0.5">
                <div className="flex items-center gap-1">
                  {m.pctChange > 0
                    ? <TrendingUp size={11} className="text-emerald-400" />
                    : <TrendingDown size={11} className="text-red-400" />}
                  <span className={`text-xs font-mono font-semibold ${m.pctChange > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {m.pctChange > 0 ? "+" : ""}{m.pctChange}%
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mono">
                  {fmtUSD(m.oldPrice)} → {fmtUSD(m.newPrice)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CashRow({ label, value, negative = false, muted = false }: {
  label: string; value: number; negative?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className={`text-xs ${muted ? "text-muted-foreground/70" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-xs mono font-medium ${negative ? "text-red-400" : "text-foreground"}`}>
        {negative ? "-" : ""}{fmtUSD(Math.abs(value))}
      </span>
    </div>
  );
}

function MonthlyCashflow({ cf }: { cf: ReturnType<typeof calcMonthlyCashflow> }) {
  const hasData = cf.txnCount > 0 || cf.showCount > 0;

  if (!hasData) {
    return (
      <div className="stat-card flex flex-col items-center py-8 text-center">
        <Wallet size={28} className="text-muted-foreground/40 mb-2" />
        <div className="text-sm text-muted-foreground font-medium">No activity in {cf.monthLabel}</div>
        <div className="text-xs text-muted-foreground/60 mt-1">
          Log a transaction or show to start tracking monthly cashflow.
        </div>
        <Link href="/transactions">
          <a className="mt-3 text-xs text-primary hover:underline flex items-center gap-1">
            Go to Transactions <ArrowRight size={11} />
          </a>
        </Link>
      </div>
    );
  }

  const headline = [
    { label: "Cash In", value: cf.cashIn, icon: ArrowDownRight, cls: "text-emerald-400" },
    { label: "Cash Out", value: -cf.cashOut, icon: ArrowUpRight, cls: "text-red-400" },
    { label: "Net Cash", value: cf.netCash, icon: Wallet, cls: cf.netCash >= 0 ? "text-emerald-400" : "text-red-400" },
    { label: "Inventory Δ", value: cf.invNet, icon: Boxes, cls: cf.invNet >= 0 ? "text-emerald-400" : "text-red-400" },
    { label: "Total Result", value: cf.total, icon: TrendingUp, cls: cf.total >= 0 ? "text-emerald-400" : "text-red-400" },
  ];

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Monthly Cashflow</div>
          <div className="text-[11px] text-muted-foreground">
            {cf.monthLabel} · {cf.txnCount} txn{cf.txnCount === 1 ? "" : "s"} · {cf.showCount} show{cf.showCount === 1 ? "" : "s"}
          </div>
        </div>
        <Link href="/transactions">
          <a className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            View all <ArrowRight size={11} />
          </a>
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3 mb-4">
        {headline.map(h => (
          <div key={h.label} className="bg-accent/40 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <h.icon size={11} className={h.cls} />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{h.label}</span>
            </div>
            <div className={`text-base font-bold mono leading-none ${h.cls}`}>{fmt(h.value)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1">
        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Cash In</div>
          <CashRow label="Direct sales" value={cf.salesCashIn} />
          <CashRow label="Show sales" value={cf.showCashIn} />
        </div>
        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Cash Out</div>
          <CashRow label="Buys at shows" value={cf.showBuys} negative />
          <CashRow label="Cash paid on trades" value={cf.tradeCashOut} negative />
          <CashRow label="Expenses" value={cf.showExpenses} negative />
          <CashRow label="Other cash out" value={cf.showOtherOut} negative />
        </div>
        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Inventory</div>
          <CashRow label="Value acquired" value={cf.invIn} />
          <CashRow label="Value sold / traded out" value={cf.invOut} negative />
          <CashRow label="Trade credit issued" value={cf.tradeCreditIssued} muted />
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground/70">Cards out</span>
            <span className="text-xs mono font-medium text-muted-foreground">{cf.cardsSold.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground/60 mt-3 pt-2 border-t border-border/40">
        Total Result = net cash + inventory value change. Show-attached transactions are counted through the show ledger to avoid double counting.
      </div>
    </div>
  );
}

/* ─────────────────────── page ─────────────────────── */

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<any>({ queryKey: ["/api/dashboard/stats"] });
  const { data: moversRaw, isLoading: moversLoading } = useQuery<any>({ queryKey: ["/api/snapshots/movers"] });
  const { data: showsRaw } = useQuery<any>({ queryKey: ["/api/shows"] });
  const { data: txnsRaw } = useQuery<any>({ queryKey: ["/api/transactions"] });
  const { data: inventoryRaw, isLoading: invLoading } = useQuery<any>({ queryKey: ["/api/inventory"] });

  const movers: any[] = Array.isArray(moversRaw) ? moversRaw : [];
  const shows: any[] = Array.isArray(showsRaw) ? showsRaw : [];
  const transactions: any[] = Array.isArray(txnsRaw) ? txnsRaw : [];
  const inventory: any[] = Array.isArray(inventoryRaw) ? inventoryRaw : [];

  const staleItems = inventory.filter(i => daysSince(i.lastSeenAt || i.firstSeenAt) >= 90);
  const staleValue = staleItems.reduce((s, i) => s + (i.currentRawMarketPrice || 0) * (i.currentQuantity || 1), 0);
  const deadItems = inventory.filter(i => daysSince(i.lastSeenAt || i.firstSeenAt) >= 180);
  const deadValue = deadItems.reduce((s, i) => s + (i.currentRawMarketPrice || 0) * (i.currentQuantity || 1), 0);
  const mismatchItems = inventory.filter(i => i.divergenceFlagged);
  const mismatchValue = mismatchItems.reduce((s, i) => s + Math.abs((i.adjustedMarketPrice || i.currentRawMarketPrice || 0) - (i.currentRawMarketPrice || 0)) * (i.currentQuantity || 1), 0);

  const recentShows = shows.slice(0, 3);
  const cashflow = calcMonthlyCashflow(transactions, shows);

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
        {statsLoading || invLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="stat-card"><Skeleton className="h-14 w-full" /></div>
          ))
        ) : (
          <>
            <StatCard
              label="Total Cards"
              value={(stats?.totalQuantity ?? 0).toLocaleString()}
              icon={Package}
              sub={`${(stats?.totalItems ?? 0).toLocaleString()} SKUs`}
            />
            <StatCard
              label="Market Value"
              value={fmtUSD(stats?.totalMarketValue ?? 0)}
              icon={DollarSign}
              accent
            />
            <StatCard
              label="Monthly Cashflow"
              value={fmt(cashflow.netCash)}
              icon={Wallet}
              sub={`${fmt(cashflow.total)} incl. inventory`}
              accent={cashflow.netCash >= 0}
              warn={cashflow.netCash < 0}
            />
            <Link href="/inventory?mismatch=1">
              <StatCard
                label="Price Mismatch"
                value={mismatchItems.length}
                icon={AlertCircle}
                sub={mismatchValue > 0 ? `${fmtUSD(mismatchValue)} impact` : "none"}
                warn={mismatchItems.length > 0}
              />
            </Link>
            <StatCard
              label="Stale ≥ 90d"
              value={staleItems.length}
              icon={Clock}
              sub={staleValue > 0 ? `${fmtUSD(staleValue)} tied up` : "none"}
              warn={staleItems.length > 0}
            />
            <StatCard
              label="Dead ≥ 180d"
              value={deadItems.length}
              icon={AlertTriangle}
              sub={deadValue > 0 ? `${fmtUSD(deadValue)} at risk` : "none"}
              warn={deadItems.length > 0}
            />
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

      {/* ── Monthly cashflow ── */}
      <div className="mb-4 md:mb-6">
        <MonthlyCashflow cf={cashflow} />
      </div>

      {/* ── Inventory Health + Price Movers + Channel Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="lg:col-span-1">
          {invLoading ? (
            <div className="stat-card"><Skeleton className="h-48 w-full" /></div>
          ) : (
            <InventoryHealth items={inventory} />
          )}
        </div>
        <div className="lg:col-span-1">
          <PriceMovers movers={movers} isLoading={moversLoading} />
        </div>
        <div className="lg:col-span-1">
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

      {/* ── Dead / Stale Stock detail ── */}
      {inventory.length > 0 && (
        <div className="mb-4 md:mb-6">
          <DeadStock items={inventory} />
        </div>
      )}

      {/* ── Show gain chart ── */}
      <div className="mb-4 md:mb-6">
        {shows.length >= 2 ? (
          <ShowGainChart shows={shows} />
        ) : (
          <div className="stat-card flex items-center justify-center py-10 text-center">
            <div>
              <BarChart2 size={24} className="text-muted-foreground/40 mb-2 mx-auto" />
              <div className="text-xs text-muted-foreground">Add 2+ shows to see a gain-per-show chart</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Recent shows table ── */}
      {recentShows.length > 0 && (
        <div className="stat-card">
          <SectionHeader title="Recent Shows" linkTo="/shows" />
          <div className="flex flex-col gap-2 sm:hidden">
            {recentShows.map((show: any) => {
              const { combined } = calcShow(show);
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
