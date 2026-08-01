import { Pencil, Trash2, ExternalLink, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ConditionBadge } from "@/components/ConditionBadge";
import { RecentSalesPanel } from "@/components/RecentSalesPanel";
import { gameLabel } from "@shared/gameLabels";
import { InlineEditPanel, Chip, LabelStatusBadge } from "./DetailPanel";
// import { PriceHistory } from "./DetailPanel"; // Disabled: price history removed from UI, kept for future
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ExpandedDetail({
  item, meta, editing, setEditing, stopProp = false,
}: {
  item: any; meta: any; editing: boolean; setEditing: (v: boolean) => void; stopProp?: boolean;
}) {
  const { toast } = useToast();
  const wrap = (e: React.MouseEvent) => { if (stopProp) e.stopPropagation(); };

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/inventory/${item.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Deleted", description: "Item removed from inventory." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" }),
  });

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(`Delete "${item.productName}"? This cannot be undone.`)) deleteMut.mutate();
  }

  const hasChips = meta.sourceSetName || meta.sourcePrinting || meta.sourceRarity;

  return (
    <div className="mx-auto max-w-[960px] py-1" onClick={wrap}>
      <div className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">

        {/* Mobile-only header: small thumbnail + chips together, since the
            larger photo column below is desktop-only (hidden sm:flex).
            Previously mobile users never saw the card photo anywhere in
            this panel — this restores it as a compact thumbnail instead of
            the full-size desktop treatment, which wouldn't fit here. */}
        <div className="flex sm:hidden items-center gap-3 px-5 pt-4 pb-3 border-b border-border/30">
          <CardImagePlaceholder
            photoUrl={item.photoUrl}
            size="sm"
            className="w-12 h-16 rounded-md shrink-0 border border-border/40"
          />
          {hasChips && (
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {meta.sourceSetName  && <Chip variant="set">{meta.sourceSetName}</Chip>}
              {meta.sourcePrinting && <Chip variant="printing">{meta.sourcePrinting}</Chip>}
              {meta.sourceRarity   && <Chip variant="rarity">{meta.sourceRarity}</Chip>}
            </div>
          )}
        </div>

        {/* Desktop chips now live inside the left column below (see body),
            matching DetailSheet's image → chips → condition → stats stack,
            instead of a separate strip above the whole row. */}

        {/* Body: stacks vertically on mobile, two-column on sm+ (was three
            columns — photo | chart | actions — which is why the left side
            felt too small for anything beyond a bare photo. Now it's a
            single richer meta column, like DetailSheet's left column, plus
            an uncapped chart column. */}
        <div className="flex flex-col sm:flex-row items-stretch">

          {/* Left column — widened from 130px (image-only) to 220px, and
              enriched to match DetailSheet's left column: image, chips,
              condition/game/label badges, and Qty/Market/Print stat tiles.
              This was the "missing info" — those fields already exist in
              the grid dialog's left column but were absent here entirely. */}
          <div className="hidden sm:flex sm:w-[220px] shrink-0 flex-col border-r border-border/30">
            <div className="w-full bg-muted/20 flex items-center justify-center py-4 px-4">
              <CardImagePlaceholder
                photoUrl={item.photoUrl}
                size="md"
                className="max-h-36 max-w-full rounded-lg shadow-sm"
              />
            </div>
            <div className="px-4 pb-4 pt-3 space-y-3 flex-1 flex flex-col">
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
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: "Qty",    value: String(item.currentQuantity),                             highlight: false },
                  { label: "Market", value: `$${item.currentRawMarketPrice?.toFixed(2) ?? "\u2014"}`,  highlight: false },
                  { label: "Print",  value: `$${item.currentRoundedPrintPrice ?? "\u2014"}`,           highlight: true  },
                ] as const).map(({ label, value, highlight }) => (
                  <div key={label} className="rounded-lg border border-border bg-muted/30 px-2 py-2 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
                    <div className={`text-xs font-mono font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sales panel column */}
          <div className="flex-1 min-w-0 px-5 py-4 sm:border-r border-border/30 space-y-6">
            {/* PRICE HISTORY DISABLED: Kept for future implementation
            <PriceHistory item={item} height={190} />
            */}
            <RecentSalesPanel item={item} />
          </div>

          {/* Actions sidebar — full width on mobile with top border, fixed 200px on desktop */}
          <div className="w-full sm:w-[200px] shrink-0 flex flex-col gap-3 px-4 py-4 bg-muted/20 border-t sm:border-t-0 border-border/30">
            {!editing && item.notes && (
              <div className="text-xs bg-muted/50 rounded-lg px-3 py-2 border border-border/50">
                <span className="text-muted-foreground font-medium">Notes: </span>
                <span className="italic text-foreground/80">{item.notes}</span>
              </div>
            )}

            {!editing && (
              <div className="flex flex-col gap-2 sm:mt-auto">
                <Button
                  data-testid="button-edit-item"
                  variant="outline" size="sm"
                  className="h-9 w-full text-xs gap-1.5 justify-start"
                  onClick={e => { e.stopPropagation(); setEditing(true); }}>
                  <Pencil size={12} /> Edit item
                </Button>
                <Button
                  data-testid="button-delete-item"
                  variant="outline" size="sm"
                  disabled={deleteMut.isPending}
                  className="h-9 w-full text-xs gap-1.5 justify-start border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                  onClick={handleDelete}>
                  <Trash2 size={12} /> {deleteMut.isPending ? "Deleting\u2026" : "Delete"}
                </Button>
                <div className="border-t border-border/30 pt-2 mt-1 space-y-2">
                  {item.tcgplayerUrl ? (
                    <a
                      href={item.tcgplayerUrl}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center justify-center gap-1.5 w-full rounded-md border border-blue-500/40 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors">
                      TCGplayer <ExternalLink size={11} />
                    </a>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed">
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
                        onClick={e => {
                          e.stopPropagation();
                          window.open(ebayUrl, "_blank", "noopener,noreferrer");
                        }}
                        className="flex items-center justify-center gap-1.5 w-full rounded-md border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/60 transition-colors">
                        eBay Sold Listings <ExternalLink size={11} />
                      </button>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Edit modal — floating overlay that covers left column */}
            <Dialog open={editing} onOpenChange={setEditing}>
              <DialogContent className="w-[320px] max-w-none p-0 flex flex-col gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl fixed bottom-auto top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-in slide-in-from-bottom-4 max-h-[90vh] z-50">
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/50">
                  <div className="text-sm font-semibold text-foreground">Edit Item</div>
                  <button
                    onClick={() => setEditing(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 px-4 py-4">
                  <InlineEditPanel item={item} onDone={() => setEditing(false)} />
                </div>
              </DialogContent>
            </Dialog>
          </div>

        </div>
      </div>
    </div>
  );
}
