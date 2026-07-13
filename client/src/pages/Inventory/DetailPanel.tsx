import { useState } from "react";
import { Check, X, ChevronLeft, ChevronRight, Pencil, Trash2, ExternalLink } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Chart } from "@/components/Chart";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConditionBadge } from "@/components/ConditionBadge";
import { gameLabel } from "@shared/gameLabels";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";

// ── Time window config ───────────────────────────────────────────────────────
const WINDOWS = [
  { key: "7d",   label: "7D"  },
  { key: "30d",  label: "30D" },
  { key: "90d",  label: "90D" },
  { key: "180d", label: "6M"  },
  { key: "1y",   label: "1Y"  },
] as const;
type HistoryWindow = typeof WINDOWS[number]["key"];

// Normalize stats keys to lowercase so "7D"/"30D" from JustTCG always resolve
function normalizeStats(stats: any): any {
  if (!stats || typeof stats !== "object") return stats;
  return Object.fromEntries(
    Object.entries(stats).map(([k, v]) => [k.toLowerCase(), v])
  );
}

// Resolve the % change decimal for a given window from the response data
function resolveChange(w: HistoryWindow, data: any): number | null {
  if (w === "180d") return data.priceChange180d ?? null;
  if (w === "1y")   return data.priceChange1y   ?? null;
  const stats = normalizeStats(data.stats);
  return stats?.[w]?.change ?? null;
}

// ── StatPill — exported so ItemDetailModal can reuse it ─────────────────────
export function StatPill({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-muted/30 px-3 py-1.5 min-w-[60px]">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono font-semibold tabular-nums mt-0.5 ${up ? "text-emerald-400" : "text-red-400"}`}>
        {up ? "+" : ""}{value.toFixed(1)}%
      </span>
    </div>
  );
}

// ── PriceChangeTiles ─────────────────────────────────────────────────────────
// Displays all 5 time windows as static read-only % change tiles simultaneously.
// Each tile shows the label + coloured % change — always visible at a glance.
// Props accept pre-resolved change values; pass null to show a skeleton state.
export interface PriceChangeTileValues {
  "7d":   number | null;
  "30d":  number | null;
  "90d":  number | null;
  "180d": number | null;
  "1y":   number | null;
}

export function PriceChangeTiles({
  values,
  loading = false,
}: {
  values?: PriceChangeTileValues;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {WINDOWS.map(w => {
        const chg = values?.[w.key] ?? null;
        const up  = chg != null && chg >= 0;

        return (
          <div
            key={w.key}
            className="flex flex-col items-center rounded-lg border border-border bg-muted/30 px-3 py-1.5 min-w-[52px]"
          >
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {w.label}
            </span>
            {loading || chg == null ? (
              <span className="text-[10px] font-mono text-muted-foreground/40 mt-0.5">—</span>
            ) : (
              <span className={`text-[11px] font-mono font-semibold tabular-nums mt-0.5 ${
                up ? "text-emerald-400" : "text-red-400"
              }`}>
                {up ? "+" : ""}{chg.toFixed(1)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── PriceChartWithSelector ───────────────────────────────────────────────────
// Renders window-selector BUTTONS (for chart navigation only) + the Recharts
// line chart below. Accepts pre-fetched data + loading/error state as props
// so the parent controls the query. Data wiring happens in a later step.
export function PriceChartWithSelector({
  data,
  isFetching = false,
  isError = false,
  activeWindow,
  onWindowChange,
  height = 150,
}: {
  data?: any;
  isFetching?: boolean;
  isError?: boolean;
  activeWindow: HistoryWindow;
  onWindowChange: (w: HistoryWindow) => void;
  height?: number;
}) {
  const normalizedStats = normalizeStats(data?.stats);
  const chartStats = normalizedStats?.[activeWindow]
    ?? normalizedStats?.["30d"]
    ?? normalizedStats?.["7d"]
    ?? null;

  return (
    <div>
      {/* Chart-view selector buttons */}
      <div className="flex items-center gap-1 mb-3">
        {WINDOWS.map(w => (
          <button
            key={w.key}
            onClick={() => onWindowChange(w.key)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeWindow === w.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isFetching && (
        <div className="flex items-center gap-2 py-2">
          <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs text-muted-foreground">Loading…</span>
        </div>
      )}

      {/* Error */}
      {isError && !isFetching && (
        <p className="text-xs text-red-400">Failed to load history. Try again.</p>
      )}

      {/* Chart */}
      {!isFetching && !isError && (
        <>
          {data?.history?.length >= 2 ? (
            <div className="rounded-lg border border-border bg-muted/20 px-2 pt-2 pb-1">
              <Chart
                points={data.history}
                stats={chartStats}
                showStats={false}
                height={height}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border/40 bg-muted/10 px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                {data ? "Not enough data points for this window." : "Select a window to load chart data."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── PriceHistory (original — unchanged, keeps all existing usages working) ───
export function PriceHistory({ item, itemId: itemIdProp }: { item?: any; itemId?: string }) {
  const [activeWindow, setActiveWindow] = useState<HistoryWindow>("30d");

  const resolvedItem = item ?? null;
  const resolvedId   = itemIdProp ?? item?.id ?? null;
  const hasIdentifier = !!(resolvedItem?.justtcgVariantUuid || resolvedItem?.sourceProductId) || !!itemIdProp;

  const { data, isFetching, isError } = useQuery({
    queryKey: ["/api/inventory", resolvedId, "price-history", activeWindow],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/inventory/${resolvedId}/price-history?window=${activeWindow}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!resolvedId && hasIdentifier,
    staleTime: 30 * 60 * 1000,
  });

  const normalizedStats = normalizeStats(data?.stats);
  const chartStats = normalizedStats?.[activeWindow as string]
    ?? normalizedStats?.["30d"]
    ?? normalizedStats?.["7d"]
    ?? null;

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Price History</div>

      <div className="flex items-center gap-1 mb-3">
        {WINDOWS.map(w => {
          const chg = data ? resolveChange(w.key, data) : null;
          return (
            <button
              key={w.key}
              onClick={() => setActiveWindow(w.key)}
              className={`flex flex-col items-center px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeWindow === w.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>{w.label}</span>
              {chg != null && (
                <span className={`text-[9px] font-mono tabular-nums leading-none mt-0.5 ${
                  activeWindow === w.key
                    ? "text-primary-foreground/80"
                    : chg >= 0 ? "text-emerald-400" : "text-red-400"
                }`}>
                  {chg >= 0 ? "+" : ""}{(chg * 100).toFixed(1)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isFetching && (
        <div className="flex items-center gap-2 py-2">
          <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs text-muted-foreground">Loading…</span>
        </div>
      )}

      {isError && !isFetching && (
        <p className="text-xs text-red-400">Failed to load history. Try again.</p>
      )}

      {data && !isFetching && (
        <div className="space-y-3">
          {data.history?.length >= 2 ? (
            <div className="rounded-lg border border-border bg-muted/20 px-2 pt-2 pb-1">
              <Chart
                points={data.history}
                stats={chartStats}
                showStats={false}
                height={150}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Not enough data points for this window.</p>
          )}

          <div className="flex items-center gap-3">
            {data.current != null && (
              <div className="flex flex-col">
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Current</span>
                <span className="text-base font-mono font-bold text-primary tabular-nums">${data.current.toFixed(2)}</span>
              </div>
            )}
            <StatPill label="7d" value={data.priceChange7d ?? null} />
          </div>

          {normalizedStats && Object.keys(normalizedStats).length > 0 && (
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Statistics</div>
              <div className="flex flex-wrap gap-1.5">
                {["7d", "30d", "90d", "alltime"].map(key => {
                  const stat = normalizedStats[key];
                  if (!stat) return null;
                  return (
                    <div key={key} className="rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 min-w-[80px] space-y-0.5">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{key === "alltime" ? "All Time" : key}</div>
                      {stat.high != null && <div className="flex justify-between gap-2"><span className="text-[10px] text-muted-foreground">H</span><span className="text-[10px] font-mono font-semibold text-emerald-400 tabular-nums">${stat.high.toFixed(2)}</span></div>}
                      {stat.low  != null && <div className="flex justify-between gap-2"><span className="text-[10px] text-muted-foreground">L</span><span className="text-[10px] font-mono font-semibold text-red-400 tabular-nums">${stat.low.toFixed(2)}</span></div>}
                      {stat.avg  != null && <div className="flex justify-between gap-2"><span className="text-[10px] text-muted-foreground">Avg</span><span className="text-[10px] font-mono font-semibold text-foreground/80 tabular-nums">${stat.avg.toFixed(2)}</span></div>}
                      {stat.change != null && <div className="flex justify-between gap-2"><span className="text-[10px] text-muted-foreground">Chg</span><span className={`text-[10px] font-mono font-semibold tabular-nums ${stat.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>{stat.change >= 0 ? "+" : ""}{(stat.change * 100).toFixed(1)}%</span></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(data.condition || data.printing) && (
            <p className="text-[10px] text-muted-foreground">{[data.condition, data.printing].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── InlineEditPanel ──────────────────────────────────────────────────────────
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

// ── Desktop popout modal — opened from grid tile click ───────────────────────
export function DetailPanel({
  item, onClose, onNavigate, hasPrev, hasNext,
}: {
  item: any;
  onClose: () => void;
  onNavigate: (dir: "prev" | "next") => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const meta = (() => { try { return JSON.parse(item?.matchMetadataJson || "{}"); } catch { return {}; } })();
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

  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-4xl w-[calc(100vw-2rem)] p-0 gap-0 overflow-hidden flex flex-col"
        style={{ maxHeight: "88vh" }}
      >
        {/* Header: title + prev/next nav */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border/40 shrink-0">
          <div className="min-w-0">
            <div className="text-base font-semibold text-foreground leading-tight truncate pr-6">{item.productName}</div>
            {item.number && <div className="text-xs text-muted-foreground mt-0.5">#{item.number}</div>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline" size="icon"
              className="h-7 w-7"
              disabled={!hasPrev}
              onClick={() => onNavigate("prev")}
              aria-label="Previous item"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="outline" size="icon"
              className="h-7 w-7"
              disabled={!hasNext}
              onClick={() => onNavigate("next")}
              aria-label="Next item"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>

        {/* Body: two-column desktop layout */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex gap-0 min-h-full">
            {/* Left col: image + meta + stats + actions */}
            <div className="w-[240px] shrink-0 border-r border-border/40 flex flex-col">
              <div className="w-full bg-muted/30 flex items-center justify-center py-5 px-4">
                <CardImagePlaceholder
                  photoUrl={item.photoUrl}
                  size="lg"
                  className="max-h-52 max-w-full rounded-xl shadow-lg"
                />
              </div>
              <div className="px-4 pb-4 pt-3 space-y-3 flex-1">
                {hasChips && (
                  <div className="flex flex-wrap gap-1">
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
                    { label: "Qty",    value: String(item.currentQuantity),                             highlight: false },
                    { label: "Market", value: `$${item.currentRawMarketPrice?.toFixed(2) ?? "\u2014"}`, highlight: false },
                    { label: "Print",  value: `$${item.currentRoundedPrintPrice ?? "\u2014"}`,           highlight: true  },
                  ] as const).map(({ label, value, highlight }) => (
                    <div key={label} className="rounded-lg border border-border bg-muted/30 px-2 py-2 text-center">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
                      <div className={`text-xs font-mono font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
                    </div>
                  ))}
                </div>
                {!editing && item.notes && (
                  <div className="text-xs bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
                    <span className="text-muted-foreground font-medium">Notes: </span>
                    <span className="italic text-foreground/80">{item.notes}</span>
                  </div>
                )}
                {editing ? (
                  <InlineEditPanel item={item} onDone={() => setEditing(false)} />
                ) : (
                  <div className="space-y-2 pt-1">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 flex-1 rounded-lg" onClick={() => setEditing(true)}>
                        <Pencil size={11} /> Edit
                      </Button>
                      <Button variant="outline" size="sm" disabled={deleteMut.isPending}
                        className="h-8 text-xs gap-1.5 rounded-lg border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                        onClick={handleDelete}>
                        <Trash2 size={11} /> {deleteMut.isPending ? "…" : "Delete"}
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
                  </div>
                )}
              </div>
            </div>

            {/* Right col: price chart fills remaining width */}
            <div className="flex-1 min-w-0 px-5 py-4">
              <PriceHistory item={item} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
