import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Plus, Edit2, Trash2, ChevronDown, ChevronRight, X,
  ArrowLeft, ArrowRight, Check, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer, DrawerContent, DrawerTitle,
} from "@/components/ui/drawer";
import { useForm } from "react-hook-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { useIsDesktop } from "@/hooks/use-is-desktop";

/* ─────────────────────── helpers ─────────────────────── */

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

/* ─────────────────────── shared form fields ─────────────────────── */

function InfoTip({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
          aria-label="More info"
        >
          <Info size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 text-xs text-muted-foreground">
        {text}
      </PopoverContent>
    </Popover>
  );
}

function NumInput({ label, hint, name, register, placeholder }: any) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-0.5">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <InfoTip text={hint} />}
      </div>
      <Input
        type="number"
        step="0.01"
        placeholder={placeholder || "0.00"}
        className="h-11 text-sm"
        {...register(name, { valueAsNumber: true })}
      />
    </div>
  );
}

/* ─────────────────────── step content components ─────────────────────── */

function StepDetails({ register, errors }: any) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted-foreground block mb-0.5">Show Name *</label>
        <Input
          data-testid="input-show-name"
          className="h-11 text-sm"
          placeholder="e.g. Tampa Card Show — Mar 2026"
          {...register("showName", { required: true })}
        />
        {errors.showName && <span className="text-xs text-red-400">Required</span>}
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-0.5">Location</label>
        <Input
          data-testid="input-show-location"
          className="h-11 text-sm"
          placeholder="e.g. Tampa Convention Center"
          {...register("location")}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-0.5">Date *</label>
        <Input
          data-testid="input-show-date"
          type="date"
          className="h-11 text-sm"
          {...register("showDate", { required: true })}
        />
        {errors.showDate && <span className="text-xs text-red-400">Required</span>}
      </div>
    </div>
  );
}

function StepCashFlow({ register }: any) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">All cash movement at the show.</p>
      <NumInput
        label="Cash Sales In"
        hint="All cash you took in from sales"
        name="cashSalesIn"
        register={register}
      />
      <NumInput
        label="Cash Spent on Buys"
        hint="Cash you spent buying cards"
        name="cashSpentOnBuys"
        register={register}
      />
      <NumInput
        label="Other Cash Out"
        hint="ATM fees, food, parking, misc"
        name="otherCashOut"
        register={register}
      />
      <NumInput
        label="Show Expenses"
        hint="Table fee, entry, non-cash costs"
        name="expensesTotal"
        register={register}
      />
    </div>
  );
}

function StepInventory({ register }: any) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Inventory values before, after, and what you bought.</p>
      <NumInput
        label="Starting Inventory Value"
        hint="Market value of inventory you brought"
        name="startingInventoryMarketValue"
        register={register}
      />
      <NumInput
        label="Ending Inventory Value"
        hint="Market value of inventory you took home"
        name="endingInventoryMarketValue"
        register={register}
      />
      <NumInput
        label="Purchased — Cost Basis"
        hint="What you paid for cards you bought"
        name="purchasedInventoryCostBasis"
        register={register}
      />
      <NumInput
        label="Purchased — Market Value"
        hint="Estimated market value of cards bought"
        name="purchasedInventoryMarketValue"
        register={register}
      />
      <div>
        <div className="flex items-center gap-1 mb-0.5">
          <label className="text-xs text-muted-foreground">Notes</label>
          <InfoTip text="What worked, key pickups, thoughts for next time" />
        </div>
        <Textarea className="text-sm resize-none" rows={3} {...register("notes")} />
      </div>
    </div>
  );
}

/* ─────────────────────── step indicator ─────────────────────── */

const STEPS = ["Details", "Cash Flow", "Inventory"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2.5">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 transition-colors ${
            i < current
              ? "bg-primary text-primary-foreground"
              : i === current
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}>
            {i < current ? <Check size={10} /> : i + 1}
          </div>
          <span className={`text-[11px] font-medium hidden xs:block transition-colors ${
            i === current ? "text-foreground" : "text-muted-foreground"
          }`}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-6 sm:w-10 transition-colors ${i < current ? "bg-primary" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── shared form logic hook ─────────────────────── */

function useShowForm(show: any, onClose: () => void) {
  const { toast } = useToast();
  const isEdit = !!show;

  const { register, handleSubmit, trigger, formState: { errors } } =
    useForm({
      defaultValues: show || {
        showName: "", location: "", showDate: "",
        startingInventoryMarketValue: null,
        endingInventoryMarketValue: null,
        purchasedInventoryCostBasis: null,
        purchasedInventoryMarketValue: null,
        cashSalesIn: null, cashSpentOnBuys: null,
        otherCashOut: null, expensesTotal: null,
        notes: "",
      },
    });

  const saveMut = useMutation({
    mutationFn: async (data: any) => {
      if (isEdit) return apiRequest("PATCH", `/api/shows/${show.id}`, data);
      return apiRequest("POST", "/api/shows", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: isEdit ? "Show updated" : "Show created" });
      onClose();
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return { register, handleSubmit, trigger, errors, saveMut, isEdit };
}

/* ─────────────────────── MOBILE: Vaul bottom drawer with steps ─────────────────────── */

function ShowDrawer({
  show, open, onClose,
}: { show?: any; open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const { register, handleSubmit, trigger, errors, saveMut, isEdit } =
    useShowForm(show, () => { setStep(0); onClose(); });

  async function goNext() {
    // Validate step 1 fields before advancing
    if (step === 0) {
      const ok = await trigger(["showName", "showDate"]);
      if (!ok) return;
    }
    setStep(s => Math.min(s + 1, 2));
  }

  function goBack() {
    setStep(s => Math.max(s - 1, 0));
  }

  // Reset step when drawer opens fresh
  function handleOpenChange(v: boolean) {
    if (!v) { setStep(0); onClose(); }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="bg-card border-border max-h-[92dvh] flex flex-col focus:outline-none">
        {/* Drag handle is built into DrawerContent via drawer.tsx */}

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-1 pb-2 border-b border-border shrink-0">
          <DrawerTitle className="text-base font-semibold text-foreground">
            {isEdit ? "Edit Show" : "New Show"}
          </DrawerTitle>
          <button
            type="button"
            onClick={() => { setStep(0); onClose(); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:text-foreground active:bg-muted transition-colors"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Step bar */}
        <StepBar current={step} />

        {/* Scrollable step body */}
        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {step === 0 && <StepDetails register={register} errors={errors} />}
          {step === 1 && <StepCashFlow register={register} />}
          {step === 2 && <StepInventory register={register} />}
        </div>

        {/* Sticky footer */}
        <div
          className="shrink-0 px-4 pt-3 pb-4 border-t border-border bg-card"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <div className="flex gap-3">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                className="border-border gap-1.5"
              >
                <ArrowLeft size={14} /> Back
              </Button>
            )}
            {step < 2 ? (
              <Button
                type="button"
                onClick={goNext}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
              >
                Next <ArrowRight size={14} />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit(d => saveMut.mutate(d))}
                disabled={saveMut.isPending}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saveMut.isPending ? "Saving…" : isEdit ? "Update Show" : "Save Show"}
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ─────────────────────── DESKTOP: Dialog (unchanged layout) ─────────────────────── */

function ShowModal({ show, onClose }: { show?: any; onClose: () => void }) {
  const { register, handleSubmit, errors, saveMut, isEdit } = useShowForm(show, onClose);
  const [notesOpen, setNotesOpen] = useState(!!show?.notes);

  return (
    <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[88dvh] overflow-y-auto bg-card border-border">
      <DialogHeader>
        <DialogTitle className="text-foreground pr-6">{isEdit ? "Edit Show" : "New Show"}</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit(d => saveMut.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground block mb-0.5">Show Name *</label>
            <Input
              data-testid="input-show-name"
              className="h-10 text-sm"
              placeholder="e.g. Tampa Card Show — Mar 2026"
              {...register("showName", { required: true })}
            />
            {errors.showName && <span className="text-xs text-red-400">Required</span>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Location</label>
            <Input
              data-testid="input-show-location"
              className="h-10 text-sm"
              placeholder="e.g. Tampa Convention Center"
              {...register("location")}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Date *</label>
            <Input
              data-testid="input-show-date"
              type="date"
              className="h-10 text-sm"
              {...register("showDate", { required: true })}
            />
            {errors.showDate && <span className="text-xs text-red-400">Required</span>}
          </div>
        </div>

        <div className="border border-border rounded-lg p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Cash Flow</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumInput label="Cash Sales In" hint="All cash you took in from sales at the show" name="cashSalesIn" register={register} />
            <NumInput label="Cash Spent on Buys" hint="Cash you spent buying cards at the show" name="cashSpentOnBuys" register={register} />
            <NumInput label="Other Cash Out" hint="ATM fees, food, parking, misc cash expenses" name="otherCashOut" register={register} />
            <NumInput label="Show Expenses" hint="Table fee, entry, and any non-cash show costs" name="expensesTotal" register={register} />
          </div>
        </div>

        <div className="border border-border rounded-lg p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Inventory Values</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NumInput label="Starting Inventory Value" hint="Market value of inventory you brought to the show" name="startingInventoryMarketValue" register={register} />
            <NumInput label="Ending Inventory Value" hint="Market value of inventory you brought back home" name="endingInventoryMarketValue" register={register} />
            <NumInput label="Purchased — Cost Basis" hint="Total you paid for cards you bought at the show" name="purchasedInventoryCostBasis" register={register} />
            <NumInput label="Purchased — Market Value" hint="Estimated market value of the cards you bought" name="purchasedInventoryMarketValue" register={register} />
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors">
            <button
              type="button"
              onClick={() => setNotesOpen(o => !o)}
              className="flex-1 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Notes
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <InfoTip text="What worked, what didn't, key pickups, thoughts for next time" />
              <button
                type="button"
                onClick={() => setNotesOpen(o => !o)}
                aria-label="Toggle notes"
                className="text-muted-foreground"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform ${notesOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </div>
          {notesOpen && (
            <div className="px-3 pb-3">
              <Textarea className="text-sm resize-none" rows={2} {...register("notes")} />
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-2 pb-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          <Button
            type="submit"
            disabled={saveMut.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saveMut.isPending ? "Saving…" : "Save Show"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/* ─────────────────────── ShowSummary ─────────────────────── */

function ShowSummary({
  cashResult, invEdge, invDelta, combined,
}: { cashResult: number; invEdge: number; invDelta: number; combined: number }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3 mb-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Show Summary
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-[11px] text-muted-foreground">Cash Profit</div>
          <div className={`font-mono font-semibold text-sm ${cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(cashResult)}
          </div>
          <div className="text-[10px] text-muted-foreground/60">Sales − buys − cash out − expenses</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">New Inventory Edge</div>
          <div className={`font-mono font-semibold text-sm ${invEdge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(invEdge)}
          </div>
          <div className="text-[10px] text-muted-foreground/60">Market value of buys − what you paid</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Total Gain (Cash + Edge)</div>
          <div className={`font-mono font-bold text-base ${combined >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(combined)}
          </div>
          <div className="text-[10px] text-muted-foreground/60">Cash Profit + New Inventory Edge</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Inventory Value Change</div>
          <div className={`font-mono font-semibold text-sm ${invDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(invDelta)}
          </div>
          <div className="text-[10px] text-muted-foreground/60">Ending inventory − starting inventory</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── mobile ShowCard ─────────────────────── */

function ShowCard({ show, onEdit }: { show: any; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const { cashResult, invEdge, invDelta, combined } = calcShow(show);

  const deleteShowMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/shows/${show.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      toast({ title: "Show deleted" });
    },
  });

  return (
    <div data-testid={`card-show-${show.id}`} className="stat-card p-0 overflow-hidden">
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
            <span className="ml-auto text-xs text-muted-foreground mono shrink-0">
              {fmtDate(show.showDate)}
            </span>
          </div>
          {show.location && (
            <div className="text-xs text-muted-foreground mb-1.5">{show.location}</div>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`font-mono font-medium ${cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              Cash {fmt(cashResult)}
            </span>
            <span className={`font-mono font-medium ${invEdge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              Edge {fmt(invEdge)}
            </span>
            <span className={`font-mono font-semibold ${combined >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              Total {fmt(combined)}
            </span>
          </div>
        </div>
        <div className="flex gap-1 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent"
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={() => deleteShowMut.mutate()}
            className="p-2 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/15"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
          <ShowSummary cashResult={cashResult} invEdge={invEdge} invDelta={invDelta} combined={combined} />
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Raw Inputs
          </div>
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

/* ─────────────────────── desktop ShowRow ─────────────────────── */

function ShowRow({ show, onEdit }: { show: any; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const { cashResult, invEdge, invDelta, combined } = calcShow(show);

  const deleteShowMut = useMutation({
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
        <td className="px-3 py-2.5 w-8 text-muted-foreground">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </td>
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
            <button
              onClick={onEdit}
              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={() => deleteShowMut.mutate()}
              className="text-muted-foreground hover:text-red-400 p-1 rounded hover:bg-red-500/10"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={9} className="px-6 py-3">
            <ShowSummary cashResult={cashResult} invEdge={invEdge} invDelta={invDelta} combined={combined} />
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Raw Inputs
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div><span className="text-muted-foreground">Cash Sales In</span><div className="font-mono text-foreground">{fmtDollar(show.cashSalesIn)}</div></div>
              <div><span className="text-muted-foreground">Cash Spent on Buys</span><div className="font-mono text-foreground">{fmtDollar(show.cashSpentOnBuys)}</div></div>
              <div><span className="text-muted-foreground">Other Cash Out</span><div className="font-mono text-foreground">{fmtDollar(show.otherCashOut)}</div></div>
              <div><span className="text-muted-foreground">Show Expenses</span><div className="font-mono text-foreground">{fmtDollar(show.expensesTotal)}</div></div>
              <div><span className="text-muted-foreground">Starting Inv Value</span><div className="font-mono text-foreground">{fmtDollar(show.startingInventoryMarketValue)}</div></div>
              <div><span className="text-muted-foreground">Ending Inv Value</span><div className="font-mono text-foreground">{fmtDollar(show.endingInventoryMarketValue)}</div></div>
              <div><span className="text-muted-foreground">Purchased Cost Basis</span><div className="font-mono text-foreground">{fmtDollar(show.purchasedInventoryCostBasis)}</div></div>
              <div><span className="text-muted-foreground">Purchased Market Value</span><div className="font-mono text-foreground">{fmtDollar(show.purchasedInventoryMarketValue)}</div></div>
              {show.notes && (
                <div className="col-span-4">
                  <span className="text-muted-foreground">Notes:</span>
                  <div className="text-foreground">{show.notes}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─────────────────────── page ─────────────────────── */

export default function Shows() {
  const isDesktop = useIsDesktop();
  const [modalOpen, setModalOpen] = useState(false);
  const [editShow, setEditShow] = useState<any>(null);

  const { data: shows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/shows"],
  });

  const chartData = [...shows].reverse().map(s => {
    const { cashResult, invEdge, combined } = calcShow(s);
    return {
      name: s.showName,
      cashResult: Math.round(cashResult * 100) / 100,
      invEdge: Math.round(invEdge * 100) / 100,
      combined: Math.round(combined * 100) / 100,
    };
  });

  const totals = shows.reduce(
    (acc, s) => {
      const { cashResult, invEdge, combined } = calcShow(s);
      acc.cashResult += cashResult;
      acc.invEdge += invEdge;
      acc.combined += combined;
      return acc;
    },
    { cashResult: 0, invEdge: 0, combined: 0 },
  );

  function openNew() { setEditShow(null); setModalOpen(true); }
  function openEdit(show: any) { setEditShow(show); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditShow(null); }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Shows</h1>
        <Button
          data-testid="button-new-show"
          onClick={openNew}
          className="hidden sm:flex bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={15} className="mr-2" /> New Show
        </Button>
      </div>

      {/* Mobile FAB */}
      <button
        data-testid="button-new-show-fab"
        onClick={openNew}
        className="sm:hidden fixed z-30 w-14 h-14 rounded-full shadow-lg flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors right-4"
        aria-label="New Show"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
      >
        <Plus size={24} />
      </button>

      {/* Summary cards */}
      {shows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="stat-card">
            <div className="text-xs text-muted-foreground mb-0.5">Total Cash Profit</div>
            <div className="text-[10px] text-muted-foreground/60 mb-1">
              Sales − buys − cash out − expenses
            </div>
            <div className={`text-xl font-bold mono ${totals.cashResult >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmt(totals.cashResult)}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-muted-foreground mb-0.5">Total New Inventory Edge</div>
            <div className="text-[10px] text-muted-foreground/60 mb-1">
              Market value of buys − what you paid
            </div>
            <div className={`text-xl font-bold mono ${totals.invEdge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmt(totals.invEdge)}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-muted-foreground mb-0.5">Total Gain (Cash + Edge)</div>
            <div className="text-[10px] text-muted-foreground/60 mb-1">
              Cash Profit + New Inventory Edge
            </div>
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
          ? Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))
          : shows.length === 0
          ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                No shows yet — tap the + button to add your first record
              </div>
            )
          : shows.map((show: any) => (
              <ShowCard key={show.id} show={show} onEdit={() => openEdit(show)} />
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
                      <td colSpan={9} className="px-3 py-2.5">
                        <Skeleton className="h-10 w-full" />
                      </td>
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
                    <ShowRow key={show.id} show={show} onEdit={() => openEdit(show)} />
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {isDesktop ? (
        <Dialog
          open={modalOpen}
          onOpenChange={v => { if (!v) closeModal(); }}
        >
          {modalOpen && <ShowModal show={editShow} onClose={closeModal} />}
        </Dialog>
      ) : (
        <ShowDrawer show={editShow} open={modalOpen} onClose={closeModal} />
      )}
    </div>
  );
}