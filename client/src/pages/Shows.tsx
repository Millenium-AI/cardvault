import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, TrendingUp, DollarSign, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const val = Number(n);
  return (val >= 0 ? "+" : "") + "$" + Math.abs(val).toFixed(2);
}

function fmtDollar(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return "$" + Number(n).toFixed(2);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(parseISO(d), "MMM d, yyyy"); } catch { return d; }
}

function calcShow(show: any) {
  const cashResult = (show.cashSalesIn || 0) - (show.cashSpentOnBuys || 0) - (show.otherCashOut || 0) - (show.expensesTotal || 0);
  const invEdge = (show.purchasedInventoryMarketValue || 0) - (show.purchasedInventoryCostBasis || 0);
  const invDelta = (show.endingInventoryMarketValue || 0) - (show.startingInventoryMarketValue || 0);
  const combined = cashResult + invEdge;
  return { cashResult, invEdge, invDelta, combined };
}

function NumInput({ label, hint, name, register, placeholder }: any) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-0.5">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground/70 mb-1">{hint}</p>}
      <Input
        type="number"
        step="0.01"
        placeholder={placeholder || "0.00"}
        className="h-9 text-sm"
        {...register(name, { valueAsNumber: true })}
      />
    </div>
  );
}

function ShowModal({ show, onClose }: { show?: any; onClose: () => void }) {
  const { toast } = useToast();
  const isEdit = !!show;

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: show || {
      showName: "", location: "", showDate: "",
      startingInventoryMarketValue: null, endingInventoryMarketValue: null,
      purchasedInventoryCostBasis: null, purchasedInventoryMarketValue: null,
      cashSalesIn: null, cashSpentOnBuys: null, otherCashOut: null, expensesTotal: null,
      notes: "",
    },
  });

  const saveMut = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit) {
        return apiRequest("PATCH", `/api/shows/${show.id}`, data);
      } else {
        return apiRequest("POST", "/api/shows", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: isEdit ? "Show updated" : "Show created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto bg-card border-border">
      <DialogHeader>
        <DialogTitle className="text-foreground">{isEdit ? "Edit Show" : "New Show"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit(d => saveMut.mutate(d))} className="space-y-4">
        {/* Name, location, date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground block mb-0.5">Show Name *</label>
            <Input data-testid="input-show-name" className="h-9 text-sm" placeholder="e.g. Tampa Card Show — Mar 2026" {...register("showName", { required: true })} />
            {errors.showName && <span className="text-xs text-red-400">Required</span>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Location</label>
            <Input data-testid="input-show-location" className="h-9 text-sm" placeholder="e.g. Tampa Convention Center" {...register("location")} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Date *</label>
            <Input data-testid="input-show-date" type="date" className="h-9 text-sm" {...register("showDate", { required: true })} />
            {errors.showDate && <span className="text-xs text-red-400">Required</span>}
          </div>
        </div>

        {/* Cash Flow */}
        <div className="border border-border rounded-lg p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Cash Flow</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumInput label="Cash Sales In" hint="All cash you took in from sales at the show" name="cashSalesIn" register={register} />
            <NumInput label="Cash Spent on Buys" hint="Cash you spent buying cards at the show" name="cashSpentOnBuys" register={register} />
            <NumInput label="Other Cash Out" hint="ATM fees, food, parking, misc cash expenses" name="otherCashOut" register={register} />
            <NumInput label="Show Expenses" hint="Table fee, entry, and any non-cash show costs" name="expensesTotal" register={register} />
          </div>
        </div>

        {/* Inventory Values */}
        <div className="border border-border rounded-lg p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Inventory Values</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumInput label="Starting Inventory Value" hint="Market value of inventory you brought to the show" name="startingInventoryMarketValue" register={register} />
            <NumInput label="Ending Inventory Value" hint="Market value of inventory you brought back home" name="endingInventoryMarketValue" register={register} />
            <NumInput label="Purchased — Cost Basis" hint="Total you paid for cards you bought at the show" name="purchasedInventoryCostBasis" register={register} />
            <NumInput label="Purchased — Market Value" hint="Estimated market value of the cards you bought" name="purchasedInventoryMarketValue" register={register} />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-muted-foreground block mb-0.5">Notes</label>
          <p className="text-[11px] text-muted-foreground/70 mb-1">What worked, what didn't, key pickups, thoughts for next time</p>
          <Textarea className="text-sm resize-none" rows={2} {...register("notes")} />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          <Button type="submit" disabled={saveMut.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saveMut.isPending ? "Saving…" : "Save Show"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/** Shared Show Summary block used in both mobile + desktop expanded views */
function ShowSummary({ cashResult, invEdge, invDelta, combined }: { cashResult: number; invEdge: number; invDelta: number; combined: number }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3 mb-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Show Summary</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-[11px] text-muted-foreground">Cash Profit</div>
          <div className={`font-mono font-semibold text-sm ${cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(cashResult)}</div>
          <div className="text-[10px] text-muted-foreground/60">Sales − buys − cash out − expenses</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">New Inventory Edge</div>
          <div className={`font-mono font-semibold text-sm ${invEdge >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(invEdge)}</div>
          <div className="text-[10px] text-muted-foreground/60">Market value of buys − what you paid</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Total Gain (Cash + Edge)</div>
          <div className={`font-mono font-bold text-base ${combined >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(combined)}</div>
          <div className="text-[10px] text-muted-foreground/60">Cash Profit + New Inventory Edge</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Inventory Value Change</div>
          <div className={`font-mono font-semibold text-sm ${invDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(invDelta)}</div>
          <div className="text-[10px] text-muted-foreground/60">Ending inventory − starting inventory</div>
        </div>
      </div>
    </div>
  );
}

/** Mobile card for a single show */
function ShowCard({ show, onEdit }: { show: any; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const { cashResult, invEdge, invDelta, combined } = calcShow(show);

  const deleteMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/shows/${show.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: "Show deleted" });
    },
  });

  return (
    <div data-testid={`card-show-${show.id}`} className="stat-card p-0 overflow-hidden">
      {/* Summary row */}
      <button
        className="w-full flex items-start gap-3 p-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="mt-0.5 text-muted-foreground shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-foreground text-sm truncate">{show.showName}</span>
            <span className="ml-auto text-xs text-muted-foreground mono shrink-0">{fmtDate(show.showDate)}</span>
          </div>
          {show.location && <div className="text-xs text-muted-foreground mb-1.5">{show.location}</div>}
          {/* Mini stat pills */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`font-mono font-medium ${cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              Cash Profit {fmt(cashResult)}
            </span>
            <span className={`font-mono font-medium ${invEdge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              Inv Edge {fmt(invEdge)}
            </span>
            <span className={`font-mono font-semibold ${combined >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              Total Gain {fmt(combined)}
            </span>
          </div>
        </div>
        <div className="flex gap-1 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={() => deleteMut.mutate()}
            className="p-2 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
          <ShowSummary cashResult={cashResult} invEdge={invEdge} invDelta={invDelta} combined={combined} />
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Raw Inputs</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground block">Cash Sales In</span><span className="font-mono text-foreground">{fmtDollar(show.cashSalesIn)}</span></div>
            <div><span className="text-muted-foreground block">Cash Spent on Buys</span><span className="font-mono text-foreground">{fmtDollar(show.cashSpentOnBuys)}</span></div>
            <div><span className="text-muted-foreground block">Other Cash Out</span><span className="font-mono text-foreground">{fmtDollar(show.otherCashOut)}</span></div>
            <div><span className="text-muted-foreground block">Show Expenses</span><span className="font-mono text-foreground">{fmtDollar(show.expensesTotal)}</span></div>
            <div><span className="text-muted-foreground block">Starting Inv Value</span><span className="font-mono text-foreground">{fmtDollar(show.startingInventoryMarketValue)}</span></div>
            <div><span className="text-muted-foreground block">Ending Inv Value</span><span className="font-mono text-foreground">{fmtDollar(show.endingInventoryMarketValue)}</span></div>
            <div><span className="text-muted-foreground block">Purchased Cost Basis</span><span className="font-mono text-foreground">{fmtDollar(show.purchasedInventoryCostBasis)}</span></div>
            <div><span className="text-muted-foreground block">Purchased Market Value</span><span className="font-mono text-foreground">{fmtDollar(show.purchasedInventoryMarketValue)}</span></div>
            {show.notes && (
              <div className="col-span-2">
                <span className="text-muted-foreground block">Notes</span>
                <span className="text-foreground">{show.notes}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Desktop table row */
function ShowRow({ show, onEdit }: { show: any; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const { cashResult, invEdge, invDelta, combined } = calcShow(show);

  const deleteMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/shows/${show.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: "Show deleted" });
    },
  });

  return (
    <>
      <tr
        data-testid={`row-show-${show.id}`}
        className="border-b border-border/50 hover:bg-accent/30 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-3 py-2.5 w-8 text-muted-foreground">{expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}</td>
        <td className="px-3 py-2.5 font-medium text-foreground">{show.showName}</td>
        <td className="px-3 py-2.5 text-muted-foreground text-sm">{show.location || "—"}</td>
        <td className="px-3 py-2.5 text-sm mono">{fmtDate(show.showDate)}</td>
        <td className={`px-3 py-2.5 text-right mono text-sm font-medium ${cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {fmt(cashResult)}
        </td>
        <td className={`px-3 py-2.5 text-right mono text-sm font-medium ${invEdge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {fmt(invEdge)}
        </td>
        <td className={`px-3 py-2.5 text-right mono text-sm font-semibold ${combined >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {fmt(combined)}
        </td>
        <td className={`px-3 py-2.5 text-right mono text-xs ${invDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {fmt(invDelta)}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={onEdit} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent">
              <Edit2 size={13} />
            </button>
            <button onClick={() => deleteMut.mutate()} className="text-muted-foreground hover:text-red-400 p-1 rounded hover:bg-red-500/10">
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={9} className="px-6 py-3">
            <ShowSummary cashResult={cashResult} invEdge={invEdge} invDelta={invDelta} combined={combined} />
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Raw Inputs</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div><span className="text-muted-foreground">Cash Sales In</span><div className="font-mono text-foreground">{fmtDollar(show.cashSalesIn)}</div></div>
              <div><span className="text-muted-foreground">Cash Spent on Buys</span><div className="font-mono text-foreground">{fmtDollar(show.cashSpentOnBuys)}</div></div>
              <div><span className="text-muted-foreground">Other Cash Out</span><div className="font-mono text-foreground">{fmtDollar(show.otherCashOut)}</div></div>
              <div><span className="text-muted-foreground">Show Expenses</span><div className="font-mono text-foreground">{fmtDollar(show.expensesTotal)}</div></div>
              <div><span className="text-muted-foreground">Starting Inv Value</span><div className="font-mono text-foreground">{fmtDollar(show.startingInventoryMarketValue)}</div></div>
              <div><span className="text-muted-foreground">Ending Inv Value</span><div className="font-mono text-foreground">{fmtDollar(show.endingInventoryMarketValue)}</div></div>
              <div><span className="text-muted-foreground">Purchased Cost Basis</span><div className="font-mono text-foreground">{fmtDollar(show.purchasedInventoryCostBasis)}</div></div>
              <div><span className="text-muted-foreground">Purchased Market Value</span><div className="font-mono text-foreground">{fmtDollar(show.purchasedInventoryMarketValue)}</div></div>
              {show.notes && <div className="col-span-4"><span className="text-muted-foreground">Notes:</span><div className="text-foreground">{show.notes}</div></div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Shows() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editShow, setEditShow] = useState<any>(null);

  const { data: shows = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/shows"] });

  const chartData = [...shows].reverse().map(s => {
    const { cashResult, invEdge, combined } = calcShow(s);
    return {
      name: s.showName,
      cashResult: Math.round(cashResult * 100) / 100,
      invEdge: Math.round(invEdge * 100) / 100,
      combined: Math.round(combined * 100) / 100,
    };
  });

  const totals = shows.reduce((acc, s) => {
    const { cashResult, invEdge, combined } = calcShow(s);
    acc.cashResult += cashResult;
    acc.invEdge += invEdge;
    acc.combined += combined;
    return acc;
  }, { cashResult: 0, invEdge: 0, combined: 0 });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Shows</h1>
        <Button
          data-testid="button-new-show"
          onClick={() => { setEditShow(null); setModalOpen(true); }}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={15} className="mr-2" /> New Show
        </Button>
      </div>

      {/* Summary cards */}
      {shows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="stat-card">
            <div className="text-xs text-muted-foreground mb-0.5">Total Cash Profit</div>
            <div className="text-[10px] text-muted-foreground/60 mb-1">Sales − buys − cash out − expenses</div>
            <div className={`text-xl font-bold mono ${totals.cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmt(totals.cashResult)}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-muted-foreground mb-0.5">Total New Inventory Edge</div>
            <div className="text-[10px] text-muted-foreground/60 mb-1">Market value of buys − what you paid</div>
            <div className={`text-xl font-bold mono ${totals.invEdge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmt(totals.invEdge)}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-muted-foreground mb-0.5">Total Gain (Cash + Edge)</div>
            <div className="text-[10px] text-muted-foreground/60 mb-1">Cash Profit + New Inventory Edge</div>
            <div className={`text-xl font-bold mono ${totals.combined >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmt(totals.combined)}
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {chartData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="stat-card">
            <div className="text-sm font-semibold mb-3">Cash Profit by Show</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                <Bar dataKey="cashResult" name="Cash Profit" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="stat-card">
            <div className="text-sm font-semibold mb-3">New Inventory Edge by Show</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
                <Bar dataKey="invEdge" name="New Inv Edge" fill="hsl(199 89% 48%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Mobile: card list */}
      <div className="sm:hidden space-y-2">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          : shows.length === 0
          ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                No shows yet — tap "New Show" to add your first record
              </div>
            )
          : shows.map((show: any) => (
              <ShowCard
                key={show.id}
                show={show}
                onEdit={() => { setEditShow(show); setModalOpen(true); }}
              />
            ))
        }
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block stat-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="w-8"></th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Show</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Location</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Cash Profit</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">New Inv Edge</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Total Gain</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Inv Value Δ</th>
                <th className="px-3 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={9} className="px-3 py-2.5"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ))
                : shows.length === 0
                ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground text-sm">
                        No shows yet — create your first show record
                      </td>
                    </tr>
                  )
                : shows.map((show: any) => (
                    <ShowRow
                      key={show.id}
                      show={show}
                      onEdit={() => { setEditShow(show); setModalOpen(true); }}
                    />
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={v => { if (!v) { setModalOpen(false); setEditShow(null); } }}>
        {modalOpen && <ShowModal show={editShow} onClose={() => { setModalOpen(false); setEditShow(null); }} />}
      </Dialog>
    </div>
  );
}
