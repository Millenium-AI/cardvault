import { useState } from "react";
import { Pencil, Trash2, ExternalLink, Check, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { useItemUpdateMutation } from "./hooks/useInventoryMutations";

function formatSnapshotDate(iso: string): string {
  try {
    const date = parseISO(iso);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "EEE, MMM d");
  } catch {
    return "—";
  }
}

export function PriceHistory({ itemId }: { itemId: string }) {
  const { data: snaps = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory", itemId, "snapshots"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/inventory/${itemId}/snapshots`);
      return res.json();
    },
  });

  const Heading = () => (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Price History</div>
  );

  if (isLoading) return <div><Heading /><div className="text-xs text-muted-foreground">Loading…</div></div>;
  if (!snaps.length) return <div><Heading /><div className="text-xs text-muted-foreground">No price history yet</div></div>;

  const chrono = [...snaps].slice(0, 12).reverse();

  return (
    <div>
      <Heading />
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {chrono.map((s: any, i: number) => {
          const prev = chrono[i - 1];
          const change = prev && prev.rawMarketPrice
            ? ((s.rawMarketPrice - prev.rawMarketPrice) / prev.rawMarketPrice) * 100
            : null;
          const isLatest = i === chrono.length - 1;
          return (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              {change !== null && (
                <div className={`flex flex-col items-center justify-center px-0.5 ${change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                  {change > 0 ? <TrendingUp size={12} /> : change < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                  <span className="text-[9px] font-medium tabular-nums">{change > 0 ? "+" : ""}{change.toFixed(1)}%</span>
                </div>
              )}
              <div className={`flex flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 min-w-[72px] ${isLatest ? "border-primary/50 bg-primary/10 ring-1 ring-primary/20" : "border-border bg-muted/30"}`}>
                {isLatest && (
                  <span className="text-[8px] font-bold uppercase tracking-wider text-primary mb-0.5">Latest</span>
                )}
                <span className={`font-mono font-semibold tabular-nums leading-none ${isLatest ? "text-primary text-base" : "text-foreground text-sm"}`}>
                  ${s.rawMarketPrice.toFixed(2)}
                </span>
                <span className={`mt-1 leading-none ${isLatest ? "text-[11px] font-semibold text-foreground/80" : "text-[10px] font-medium text-muted-foreground"}`}>
                  {formatSnapshotDate(s.snapshotDate)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InlineEditPanel({ item, onDone }: { item: any; onDone: () => void }) {
  const { toast } = useToast();
  const [qty, setQty] = useState(String(item.currentQuantity ?? ""));
  const [price, setPrice] = useState(String(item.currentRawMarketPrice ?? ""));
  const [condition, setCondition] = useState(item.condition ?? "Near Mint");
  const [notes, setNotes] = useState(item.notes ?? "");

  const mutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/inventory/${item.id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Saved", description: "Item updated." });
      onDone();
    },
    onError: () => toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" }),
  });

  function handleSave() {
    const qtyNum = parseInt(qty, 10);
    const priceNum = parseFloat(price);
    if (isNaN(qtyNum) || qtyNum < 0) { toast({ title: "Invalid quantity", variant: "destructive" }); return; }
    if (isNaN(priceNum) || priceNum < 0) { toast({ title: "Invalid price", variant: "destructive" }); return; }
    mutation.mutate({ currentQuantity: qtyNum, currentRawMarketPrice: priceNum, condition, notes });
  }

  const printPrice = !isNaN(parseFloat(price)) && parseFloat(price) >= 0 ? Math.ceil(parseFloat(price)) : null;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Edit Item</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground font-medium">Quantity</div>
          <Input data-testid="input-edit-qty" type="number" min="0" value={qty}
            onChange={e => setQty(e.target.value)} className="h-8 text-sm font-mono" />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] text-muted-foreground font-medium">
            Market Price
            {printPrice !== null && <span className="ml-1.5 text-primary font-semibold">→ ${printPrice}</span>}
          </div>
          <Input data-testid="input-edit-price" type="number" min="0" step="0.01" value={price}
            onChange={e => setPrice(e.target.value)} className="h-8 text-sm font-mono" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground font-medium">Condition</div>
        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger data-testid="select-edit-condition" className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Near Mint">Near Mint (NM)</SelectItem>
            <SelectItem value="Lightly Played">Lightly Played (LP)</SelectItem>
            <SelectItem value="Moderately Played">Moderately Played (MP)</SelectItem>
            <SelectItem value="Heavily Played">Heavily Played (HP)</SelectItem>
            <SelectItem value="Damaged">Damaged (DMG)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground font-medium">Notes</div>
        <Textarea data-testid="input-edit-notes" value={notes} onChange={e => setNotes(e.target.value)}
          rows={2} className="text-sm resize-none" placeholder="e.g. scanner miscounted" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button data-testid="button-save-edit" size="sm" onClick={handleSave}
          disabled={mutation.isPending} className="h-8 text-xs gap-1.5">
          <Check size={12} />{mutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button data-testid="button-cancel-edit" variant="outline" size="sm" onClick={onDone}
          disabled={mutation.isPending} className="h-8 text-xs gap-1.5">
          <X size={12} />Cancel
        </Button>
      </div>
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground">
      {children}
    </span>
  );
}

export function LabelStatusBadge({ status }: { status?: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    needs_label:     { label: "Needs Label",     className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    needs_repricing: { label: "Needs Repricing", className: "bg-blue-500/15  text-blue-400  border-blue-500/30"  },
    label_created:   { label: "Label Created",   className: "bg-green-500/15 text-green-400 border-green-500/30" },
  };

  if (!status) return null;
  const cfg = statusConfig[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
