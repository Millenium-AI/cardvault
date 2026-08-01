import { useState, useEffect } from "react";
import { Drawer } from "vaul";
import { X, ExternalLink, Pencil, Trash2, TrendingDown, Eye } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConditionBadge } from "@/components/ConditionBadge";
import { RecentSalesPanel } from "@/components/RecentSalesPanel";
import { gameLabel } from "@shared/gameLabels";
import { PriceHistory, InlineEditPanel, Chip, LabelStatusBadge } from "./DetailPanel";

// ── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex-1 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div
        className={`text-sm font-mono font-bold tabular-nums ${
          highlight ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({
  item,
  meta,
  onDelete,
  deleting,
}: {
  item: any;
  meta: any;
  onDelete: () => void;
  deleting: boolean;
}) {
  const hasChips = meta.sourceSetName || meta.sourcePrinting || meta.sourceRarity;

  return (
    <div className="space-y-4">
      {/* Card image */}
      {item.photoUrl && (
        <div className="flex justify-center rounded-xl bg-muted/30 py-5">
          <img
            src={item.photoUrl}
            alt=""
            className="max-h-64 max-w-[80%] object-contain rounded-lg shadow-md"
          />
        </div>
      )}

      {/* Chips */}
      {hasChips && (
        <div className="flex flex-wrap gap-1.5">
          {meta.sourceSetName && <Chip variant="set">{meta.sourceSetName}</Chip>}
          {meta.sourcePrinting && <Chip variant="printing">{meta.sourcePrinting}</Chip>}
          {meta.sourceRarity && <Chip variant="rarity">{meta.sourceRarity}</Chip>}
        </div>
      )}

      {/* Stat tiles */}
      <div className="flex gap-2">
        <StatTile label="Qty" value={String(item.currentQuantity)} />
        <StatTile
          label="Recent Avg Sale"
          value={`$${item.currentRawMarketPrice?.toFixed(2) ?? "—"}`}
        />
        <StatTile
          label="Print"
          value={`$${item.currentRoundedPrintPrice ?? "—"}`}
          highlight
        />
      </div>

      {/* Notes */}
      {item.notes && (
        <div className="rounded-xl border border-border/50 bg-muted/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground font-medium">Notes: </span>
          <span className="italic text-foreground/80">{item.notes}</span>
        </div>
      )}

      {/* TCGplayer link */}
      {item.tcgplayerUrl ? (
        <a
          href={item.tcgplayerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-blue-500/40 px-4 py-3 text-sm font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
        >
          View on TCGplayer <ExternalLink size={14} />
        </a>
      ) : (
        <div className="flex items-center justify-center gap-2 w-full rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground opacity-40 cursor-not-allowed">
          TCGplayer unavailable <ExternalLink size={14} />
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
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-amber-500/40 px-4 py-3 text-sm font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            Search eBay Sold Listings <ExternalLink size={14} />
          </button>
        );
      })()}

      {/* Delete */}
      <Button
        variant="outline"
        className="w-full h-11 gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50 rounded-xl"
        onClick={onDelete}
        disabled={deleting}
      >
        <Trash2 size={15} />
        {deleting ? "Deleting…" : "Delete Item"}
      </Button>
    </div>
  );
}

// ── Main drawer ──────────────────────────────────────────────────────────────
export function MobileDetailDrawer({
  item,
  open,
  onClose,
}: {
  item: any;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [snap, setSnap] = useState<number | string | null>(0.92);

  const meta = (() => {
    try {
      return JSON.parse(item?.matchMetadataJson || "{}");
    } catch {
      return {};
    }
  })();

  // Always re-open at the max snap point on the Overview tab, even if a
  // previous open was left dragged down or on a different tab.
  useEffect(() => {
    if (open) {
      setSnap(0.92);
      setActiveTab("overview");
    }
  }, [open]);

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
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to delete item.",
        variant: "destructive",
      }),
  });

  function handleDelete() {
    if (confirm(`Delete "${item?.productName}"? This cannot be undone.`))
      deleteMut.mutate();
  }

  if (!item) return null;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(v) => !v && onClose()}
      snapPoints={[0.6, 0.92]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        {/* Backdrop */}
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50" />

        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none"
          style={{ height: "92dvh", maxHeight: "92dvh" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between px-4 pt-2 pb-3 border-b border-border/50 shrink-0">
            <div className="flex-1 min-w-0 pr-3">
              <div className="text-base font-semibold text-foreground leading-tight">
                {meta.cleanName || item.productName}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {item.number && (
                  <span className="text-xs text-muted-foreground">#{item.number}</span>
                )}
                <ConditionBadge condition={item.condition} abbreviated />
                <span className="text-xs text-muted-foreground">
                  {gameLabel(item.game)}
                </span>
                <LabelStatusBadge status={item.labelStatus} />
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col flex-1 min-h-0"
          >
            <TabsList className="shrink-0 mx-4 mt-3 mb-1 grid grid-cols-3 h-9 bg-muted/50">
              <TabsTrigger value="overview" className="text-xs gap-1">
                <Eye size={11} /> Overview
              </TabsTrigger>
              <TabsTrigger value="sales" className="text-xs gap-1">
                <TrendingDown size={11} /> TCG Player Sales
              </TabsTrigger>
              <TabsTrigger value="edit" className="text-xs gap-1">
                <Pencil size={11} /> Edit
              </TabsTrigger>
            </TabsList>

            {/* Scrollable tab body */}
            <div
              className="flex-1 overflow-y-auto modal-scroll-area"
              style={{
                paddingBottom:
                  "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
              }}
            >
              <TabsContent value="overview" className="mt-0 px-4 pt-3 pb-2">
                <OverviewTab
                  item={item}
                  meta={meta}
                  onDelete={handleDelete}
                  deleting={deleteMut.isPending}
                />
              </TabsContent>

              <TabsContent value="sales" className="mt-0 px-4 pt-3 pb-2">
                <div className="space-y-4">
                  <RecentSalesPanel item={item} />
                </div>
              </TabsContent>

              <TabsContent value="edit" className="mt-0 px-4 pt-3 pb-2">
                <InlineEditPanel
                  item={item}
                  onDone={() => setActiveTab("overview")}
                />
              </TabsContent>
            </div>
          </Tabs>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}