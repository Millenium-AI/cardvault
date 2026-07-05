import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConditionBadge } from "@/components/ConditionBadge";
import { gameLabel } from "@shared/gameLabels";
import { PriceHistory, InlineEditPanel, Chip, LabelStatusBadge } from "./DetailPanel";

// ── Shared card body ───────────────────────────────────────────────────────────────────────
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
        <div className="w-full bg-muted/30 flex items-center justify-center py-5">
          <img src={item.photoUrl} alt=""
            className="max-h-44 max-w-full object-contain rounded-lg" />
        </div>
      )}
      <div className="p-4 space-y-4">
        <div>
          <div className="text-base font-semibold text-foreground leading-tight pr-6">{item.productName}</div>
          {item.number && <div className="text-xs text-muted-foreground mt-0.5">#{item.number}</div>}
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
        <div className="grid grid-cols-3 gap-2">
          {([
            { label: "Qty",    value: String(item.currentQuantity),                        highlight: false },
            { label: "Market", value: `$${item.currentRawMarketPrice?.toFixed(2) ?? "\u2014"}`, highlight: false },
            { label: "Print",  value: `$${item.currentRoundedPrintPrice ?? "\u2014"}`,           highlight: true  },
          ] as const).map(({ label, value, highlight }) => (
            <div key={label} className="rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-center">
              <div className="text-[10px] text-muted-foreground">{label}</div>
              <div className={`text-sm font-mono font-semibold mt-0.5 ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
            </div>
          ))}
        </div>
        <PriceHistory itemId={item.id} item={item} />
        {!editing && item.notes && (
          <div className="text-xs">
            <span className="text-muted-foreground">Notes: </span>
            <span className="italic text-foreground/80">{item.notes}</span>
          </div>
        )}
        {editing ? (
          <InlineEditPanel item={item} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 flex-1" onClick={() => setEditing(true)}>
                <Pencil size={12} /> Edit item
              </Button>
              <Button variant="outline" size="sm" disabled={deleteMut.isPending}
                className="h-8 text-xs gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                onClick={handleDelete}>
                <Trash2 size={12} /> {deleteMut.isPending ? "Deleting\u2026" : "Delete"}
              </Button>
            </div>
            {item.tcgplayerUrl ? (
              <a href={item.tcgplayerUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full rounded-md border border-blue-500/40 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors">
                View on TCGplayer <ExternalLink size={14} />
              </a>
            ) : (
              <div className="flex items-center justify-center gap-1.5 w-full rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground opacity-40 cursor-not-allowed">
                View on TCGplayer <ExternalLink size={14} />
              </div>
            )}
          </>
        )}
        {/* Bottom spacer — ensures content clears the floating nav on mobile */}
        <div className="md:hidden h-2" />
      </div>
    </div>
  );
}

// ── Sidebar sheet (list view) ──────────────────────────────────────────────────────────────────
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

// ── Centred pop-out modal (grid views) ──────────────────────────────────────────────────────
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
    // z-[100] — well above bottom nav (z-50) and sidebar
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={onClose}
      />
      {/*
        Mobile: bottom sheet that sits ABOVE the nav bar.
        We use mb-[calc(72px+env(safe-area-inset-bottom,0px))] to push the panel
        clear of the floating pill nav (height ~62px + 10px padding = 72px).
        Desktop: centred modal, no bottom margin needed.
      */}
      <div
        className="relative z-10 w-full sm:w-[440px] flex flex-col
          rounded-t-3xl sm:rounded-2xl
          bg-card border border-border/50
          shadow-2xl shadow-black/60
          animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200
          overflow-hidden
          mb-[calc(72px+env(safe-area-inset-bottom,0px))] sm:mb-0"
        style={{
          // Max height: full viewport minus top safe area minus bottom nav clearance on mobile
          maxHeight: "calc(82dvh - env(safe-area-inset-top, 0px))",
        }}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex flex-col items-center pt-2.5 pb-1 shrink-0">
          <div className="w-12 h-1 rounded-full bg-muted-foreground/25" />
        </div>
        {/* Close button */}
        <div className="flex items-center justify-end px-4 pt-2 pb-0 shrink-0">
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-full bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>

        <ItemDetailBody item={item} onClose={onClose} />
      </div>
    </div>
  );
}
