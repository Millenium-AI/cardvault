import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConditionBadge } from "@/components/ConditionBadge";
import { gameLabel } from "@shared/gameLabels";
import { PriceHistory, InlineEditPanel, Chip, LabelStatusBadge } from "./DetailPanel";

export function InventoryDetailSheet({ item, open, onClose }: { item: any; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const meta = item ? (() => { try { return JSON.parse(item.matchMetadataJson || "{}"); } catch { return {}; } })() : {};

  useEffect(() => { if (!open) setEditing(false); }, [open]);

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

  if (!item) return null;
  const hasChips = meta.sourceSetName || meta.sourcePrinting || meta.sourceRarity;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
        {item.photoUrl && (
          <div className="w-full bg-muted/30 flex items-center justify-center pt-10">
            <img src={item.photoUrl} alt="" crossOrigin="anonymous" className="w-full max-h-48 object-contain rounded-lg" />
          </div>
        )}
        {!item.photoUrl && <div className="pt-10" />}
        <div className="p-5 space-y-4">
          <div>
            <div className="text-lg font-semibold text-foreground leading-tight pr-6">{item.productName}</div>
            {item.number && <div className="text-xs text-muted-foreground mt-0.5">#{item.number}</div>}
          </div>
          {hasChips && (
            <div className="flex flex-wrap gap-1.5">
              {meta.sourceSetName && <Chip>{meta.sourceSetName}</Chip>}
              {meta.sourcePrinting && <Chip>{meta.sourcePrinting}</Chip>}
              {meta.sourceRarity && <Chip>{meta.sourceRarity}</Chip>}
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
              { label: "Market", value: `$${item.currentRawMarketPrice?.toFixed(2) ?? "—"}`, highlight: false },
              { label: "Print",  value: `$${item.currentRoundedPrintPrice ?? "—"}`,           highlight: true  },
            ] as const).map(({ label, value, highlight }) => (
              <div key={label} className="rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-center">
                <div className="text-[10px] text-muted-foreground">{label}</div>
                <div className={`text-sm font-mono font-semibold mt-0.5 ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
              </div>
            ))}
          </div>
          <PriceHistory itemId={item.id} />
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
                  <Trash2 size={12} /> {deleteMut.isPending ? "Deleting…" : "Delete"}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
