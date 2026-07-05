import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConditionBadge } from "@/components/ConditionBadge";
import { gameLabel } from "@shared/gameLabels";
import { PriceHistory, InlineEditPanel, Chip, LabelStatusBadge } from "./DetailPanel";

export function ItemDetailBody({ item, onClose }: { item: any; onClose: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const meta = (() => { try { return JSON.parse(item.matchMetadataJson || "{}"); } catch { return {}; } })();
  const hasChips = meta.sourceSetName || meta.sourcePrinting || meta.sourceRarity;

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/inventory/${item.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Deleted", description: "Item removed from inventory." });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" }),
  });

  function handleDelete() {
    if (confirm(`Delete "${item?.productName}"? This cannot be undone.`)) deleteMut.mutate();
  }

  return (
    <div className="overflow-y-auto flex-1">
      {item.photoUrl && (
        <div className="w-full bg-muted/30 flex items-center justify-center py-6">
          <img src={item.photoUrl} alt=""
            className="max-h-52 max-w-full object-contain rounded-xl shadow-lg" />
        </div>
      )}
      <div className="px-5 pb-5 pt-4 space-y-4">
        <div>
          <div className="text-lg font-semibold text-foreground leading-tight pr-6">{item.productName}</div>
          {item.number && <div className="text-xs text-muted-foreground mt-1">#{item.number}</div>}
        </div>
        {hasChips && (
          <div className="flex flex-wrap gap-1.5">
            {meta.sourceSetName  && <Chip>{meta.sourceSetName}</Chip>}
            {meta.sourcePrinting && <Chip>{meta.sourcePrinting}</Chip>}
            {meta.sourceRarity   && <Chip>{meta.sourceRarity}</Chip>}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <ConditionBadge condition={item.condition} abbreviated />
          <span className="text-xs text-muted-foreground">{gameLabel(item.game)}</span>
          <LabelStatusBadge status={item.labelStatus} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {([
            { label: "Qty",    value: String(item.currentQuantity),                             highlight: false },
            { label: "Market", value: `$${item.currentRawMarketPrice?.toFixed(2) ?? "\u2014"}`, highlight: false },
            { label: "Print",  value: `$${item.currentRoundedPrintPrice ?? "\u2014"}`,          highlight: true  },
          ] as const).map(({ label, value, highlight }) => (
            <div key={label} className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
              <div className={`text-base font-mono font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
            </div>
          ))}
        </div>
        <PriceHistory itemId={item.id} item={item} />
        {!editing && item.notes && (
          <div className="text-xs bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
            <span className="text-muted-foreground font-medium">Notes: </span>
            <span className="italic text-foreground/80">{item.notes}</span>
          </div>
        )}
        {editing ? (
          <InlineEditPanel item={item} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 flex-1 rounded-xl" onClick={() => setEditing(true)}>
                <Pencil size={12} /> Edit item
              </Button>
              <Button variant="outline" size="sm" disabled={deleteMut.isPending}
                className="h-9 text-xs gap-1.5 rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                onClick={handleDelete}>
                <Trash2 size={12} /> {deleteMut.isPending ? "Deleting\u2026" : "Delete"}
              </Button>
            </div>
            {item.tcgplayerUrl ? (
              <a href={item.tcgplayerUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-blue-500/40 px-3 py-2.5 text-sm font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors">
                View on TCGplayer <ExternalLink size={14} />
              </a>
            ) : (
              <div className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground opacity-40 cursor-not-allowed">
                View on TCGplayer <ExternalLink size={14} />
              </div>
            )}
          </>
        )}
        <div className="h-2" />
      </div>
    </div>
  );
}

import { Sheet, SheetContent } from "@/components/ui/sheet";

export function InventoryDetailSheet({ item, open, onClose }: { item: any; open: boolean; onClose: () => void }) {
  if (!item) return null;
  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col overflow-hidden">
        <ItemDetailBody item={item} onClose={onClose} />
      </SheetContent>
    </Sheet>
  );
}

export function InventoryDetailModal({ item, open, onClose }: { item: any; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in-0 duration-200"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="
          relative z-10
          w-full sm:w-[520px]
          flex flex-col
          rounded-t-[2rem] sm:rounded-[1.75rem]
          bg-card
          border border-border/40
          shadow-[0_32px_80px_rgba(0,0,0,0.8)]
          animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-250
          overflow-hidden
          sm:mb-0
        "
        style={{
          maxHeight: "min(86dvh, 720px)",
          marginBottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex flex-col items-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        {/* Close button */}
        <div className="flex items-center justify-end px-5 pt-3 pb-0 shrink-0">
          <button
            onClick={onClose}
            className="flex items-center justify-center h-8 w-8 rounded-full bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
            <X size={15} />
          </button>
        </div>
        <ItemDetailBody item={item} onClose={onClose} />
      </div>
    </div>
  );
}
