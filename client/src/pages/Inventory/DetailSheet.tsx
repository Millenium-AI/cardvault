import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConditionBadge } from "@/components/ConditionBadge";
import { RecentSalesPanel } from "@/components/RecentSalesPanel";
import { gameLabel } from "@shared/gameLabels";
import { PriceHistory, InlineEditPanel, Chip, LabelStatusBadge } from "./DetailPanel";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";

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
    <div className="modal-scroll-area overflow-y-auto flex-1">
      {/* Two-column layout — this component only renders on desktop viewports,
          gated by the parent, so no responsive stacking fallback is needed here. */}
      <div className="flex gap-0 h-full">
        {/* Left col: image + meta + stats */}
        <div className="w-[300px] shrink-0 border-r border-border/40 flex flex-col">
          <div className="w-full bg-muted/30 flex items-center justify-center py-5 px-4">
            <CardImagePlaceholder
              photoUrl={item.photoUrl}
              size="lg"
              className="max-h-52 max-w-full rounded-xl shadow-lg"
            />
          </div>
          <div className="px-4 pb-4 pt-3 space-y-3 flex-1">
            <div>
              <div className="text-base font-semibold text-foreground leading-tight">{item.productName}</div>
              {item.number && <div className="text-xs text-muted-foreground mt-0.5">#{item.number}</div>}
            </div>
            {hasChips && (
              <div className="flex flex-wrap gap-1">
                {meta.sourceSetName  && <Chip variant="set">{meta.sourceSetName}</Chip>}
                {meta.sourcePrinting && <Chip variant="printing">{meta.sourcePrinting}</Chip>}
                {meta.sourceRarity   && <Chip variant="rarity">{meta.sourceRarity}</Chip>}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <ConditionBadge condition={item.condition} abbreviated />
              <span className="text-xs text-muted-foreground">{gameLabel(item.game)}</span>
              <LabelStatusBadge status={item.labelStatus} />
            </div>
            {/* Stat tiles */}
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: "Qty",    value: String(item.currentQuantity),                              highlight: false },
                { label: "Market", value: `$${item.currentRawMarketPrice?.toFixed(2) ?? "\u2014"}`,  highlight: false },
                { label: "Print",  value: `$${item.currentRoundedPrintPrice ?? "\u2014"}`,           highlight: true  },
              ] as const).map(({ label, value, highlight }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/30 px-2 py-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
                  <div className={`text-xs font-mono font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
                </div>
              ))}
            </div>
            {/* Notes */}
            {!editing && item.notes && (
              <div className="text-xs bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
                <span className="text-muted-foreground font-medium">Notes: </span>
                <span className="italic text-foreground/80">{item.notes}</span>
              </div>
            )}
            {/* Actions */}
            {editing ? (
              <InlineEditPanel item={item} onDone={() => setEditing(false)} />
            ) : (
              <div className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 flex-1 rounded-lg" onClick={() => setEditing(true)}>
                    <Pencil size={11} /> Edit
                  </Button>
                  <Button variant="outline" size="sm" disabled={deleteMut.isPending}
                    className="h-9 text-xs gap-1.5 rounded-lg border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                    onClick={handleDelete}>
                    <Trash2 size={11} /> {deleteMut.isPending ? "\u2026" : "Delete"}
                  </Button>
                </div>
                {item.tcgplayerUrl ? (
                  <a href={item.tcgplayerUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-blue-500/40 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors">
                    TCGplayer <ExternalLink size={11} />
                  </a>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed">
                    TCGplayer <ExternalLink size={11} />
                  </div>
                )}
                {/* eBay sold listings link */}
                {(() => {
                  const parts = [item.productName, item.condition]
                    .filter(Boolean)
                    .map((v) => String(v).trim())
                    .filter((v) => v.length > 0);
                  const query = parts.join(" ");
                  if (!query) return null;
                  const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
                  return (
                    <button
                      onClick={() => window.open(ebayUrl, "_blank", "noopener,noreferrer")}
                      className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/60 transition-colors">
                      eBay Sold Listings <ExternalLink size={11} />
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Right col: chart fills remaining width. This is the roomiest of
            the three surfaces (only bounded by the dialog's max-h-[88vh]),
            so the chart can take a taller, more legible height here than
            in the table-row or mobile-drawer versions. */}
        <div className="flex-1 min-w-0 px-5 py-4 overflow-y-auto space-y-6">
          <PriceHistory itemId={item.id} item={item} height={190} />
          <RecentSalesPanel item={item} />
        </div>
      </div>

    </div>
  );
}

// ── Dialog wrapper (desktop centered popup — grid + list detail view) ───────
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function InventoryDetailModal({
  item,
  open,
  onClose,
}: {
  item: any;
  open: boolean;
  onClose: () => void;
}) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="w-[min(880px,92vw)] max-w-none p-0 flex flex-col gap-0 overflow-hidden max-h-[88vh] rounded-2xl"
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0 text-left">
          <DialogTitle className="text-base font-semibold leading-tight pr-6">{item.productName}</DialogTitle>
        </DialogHeader>
        <ItemDetailBody item={item} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
