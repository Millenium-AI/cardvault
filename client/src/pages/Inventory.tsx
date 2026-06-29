import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getAuthHeader, queryClient } from "@/lib/queryClient";
import { Search, ChevronDown, TrendingUp, TrendingDown, ExternalLink, Check, X, Trash2, CheckSquare, Square, ArrowLeft, Minus, Pencil, Download, Tag, RefreshCcw } from "lucide-react";
import { GameTileGrid } from "@/components/GameTileGrid";
import { useGameParam } from "@/lib/useGameParam";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ConditionBadge } from "@/components/ConditionBadge";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

// Placeholder image map for the game tiles — keyed by the stored game value.
const GAME_IMAGES: Record<string, string> = {
  all: "",
  pokemon: "",
  "one-piece": "",
  sorcery: "",
  "dragon-ball": "",
};

// ── Price History — financial-style timeline ──────────────────────────────────
function PriceHistory({ itemId }: { itemId: string }) {
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
              <div className={`flex flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 min-w-[66px] ${isLatest ? "border-primary/40 bg-primary/10" : "border-border bg-muted/30"}`}>
                <span className={`font-mono font-semibold tabular-nums leading-none ${isLatest ? "text-primary text-base" : "text-foreground text-sm"}`}>
                  ${s.rawMarketPrice.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted-foreground mt-1">
                  {(() => { try { return format(parseISO(s.snapshotDate), "MMM d"); } catch { return "—"; } })()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline Edit Panel ─────────────────────────────────────────────────────────
function InlineEditPanel({ item, onDone }: { item: any; onDone: () => void }) {
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
    onError: () => {
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    },
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
          <SelectTrigger data-testid="select-edit-condition" className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
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

// ── Label status badge ────────────────────────────────────────────────────────
const LABEL_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  needs_label:    { label: "Needs Label",    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",  icon: <Tag size={9} /> },
  needs_repricing:{ label: "Needs Repricing",className: "bg-blue-500/15  text-blue-400  border-blue-500/30",   icon: <RefreshCcw size={9} /> },
  label_created:  { label: "Label Created",  className: "bg-green-500/15 text-green-400 border-green-500/30", icon: <Check size={9} /> },
};

function LabelStatusBadge({ status }: { status?: string }) {
  if (!status || status === "label_created") return null;
  const cfg = LABEL_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${cfg.className}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Small pill/badge chip ─────────────────────────────────────────────────────
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground">
      {children}
    </span>
  );
}

// ── Expanded detail content ───────────────────────────────────────────────────
function ExpandedDetail({
  item, meta, editing, setEditing, stopProp = false,
}: {
  item: any;
  meta: any;
  editing: boolean;
  setEditing: (v: boolean) => void;
  stopProp?: boolean;
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
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" });
    },
  });

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(`Delete "${item.productName}"? This cannot be undone.`)) deleteMut.mutate();
  }

  const hasChips = meta.sourceSetName || meta.sourcePrinting || meta.sourceRarity || item.tcgplayerUrl;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-4" onClick={wrap}>
      {hasChips && (
        <div className="flex flex-wrap items-center gap-1.5">
          {meta.sourceSetName && <Chip>{meta.sourceSetName}</Chip>}
          {meta.sourcePrinting && <Chip>{meta.sourcePrinting}</Chip>}
          {meta.sourceRarity && <Chip>{meta.sourceRarity}</Chip>}
          {item.tcgplayerUrl && (
            <a
              href={item.tcgplayerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="View on TCGplayer"
              aria-label="View on TCGplayer"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground transition-colors hover:text-primary hover:border-primary/40"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

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
        <div className="flex items-center gap-2 pt-0.5">
          <Button
            data-testid="button-edit-item"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={e => { e.stopPropagation(); setEditing(true); }}
          >
            <Pencil size={12} /> Edit item
          </Button>
          <Button
            data-testid="button-delete-item"
            variant="outline"
            size="sm"
            disabled={deleteMut.isPending}
            className="h-8 text-xs gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
            onClick={handleDelete}
          >
            <Trash2 size={12} /> {deleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function InventoryCard({
  item,
  selected,
  onSelect,
  selectMode,
}: {
  item: any;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  selectMode: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const meta = (() => { try { return JSON.parse(item.matchMetadataJson || "{}"); } catch { return {}; } })();
  const totalValue = (item.currentRawMarketPrice || 0) * item.currentQuantity;

  function toggle() {
    if (selectMode) { onSelect(item.id, !selected); return; }
    const next = !expanded;
    setExpanded(next);
    if (!next) setEditing(false);
  }

  return (
    <div
      data-testid={`card-inventory-${item.id}`}
      className={`stat-card p-3 space-y-2 transition-colors ${selected ? "ring-1 ring-primary bg-primary/5" : ""}`}
    >
      <div className="flex gap-3">
        {selectMode && (
          <button
            onClick={e => { e.stopPropagation(); onSelect(item.id, !selected); }}
            className="shrink-0 self-center text-muted-foreground hover:text-primary transition-colors"
          >
            {selected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
          </button>
        )}

        {item.photoUrl ? (
          <img src={item.photoUrl} alt="" crossOrigin="anonymous"
            className="w-12 h-[67px] rounded object-contain bg-muted shrink-0" />
        ) : (
          <div className="w-12 h-[67px] rounded bg-muted shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground leading-tight line-clamp-2">{item.productName}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {item.number}{meta.sourceSetName ? ` · ${meta.sourceSetName}` : ""}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <ConditionBadge condition={item.condition} abbreviated />
            <span className="text-[10px] text-muted-foreground capitalize">{item.game?.replace("-", " ")}</span>
            <LabelStatusBadge status={item.labelStatus} />
          </div>
        </div>

        <button onClick={toggle} className="shrink-0 text-muted-foreground p-1 self-start -mr-1">
          <ChevronDown size={16} className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div className="flex items-center justify-end gap-4">
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground">Market</div>
          <div className="text-sm font-mono text-foreground">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground">Print</div>
          <div className="text-sm font-mono font-bold text-primary">${item.currentRoundedPrintPrice ?? "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground">Qty</div>
          <div className="text-sm font-mono font-bold text-foreground">{item.currentQuantity}</div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground text-right">
        Total: <span className="font-mono text-foreground">${totalValue.toFixed(2)}</span>
      </div>

      {expanded && !selectMode && (
        <div className="pt-2 border-t border-border">
          <ExpandedDetail item={item} meta={meta} editing={editing} setEditing={setEditing} />
        </div>
      )}
    </div>
  );
}

// ── Desktop row ───────────────────────────────────────────────────────────────
function InventoryRow({
  item,
  selected,
  onSelect,
  selectMode,
}: {
  item: any;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  selectMode: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const meta = (() => { try { return JSON.parse(item.matchMetadataJson || "{}"); } catch { return {}; } })();

  function toggle() {
    if (selectMode) { onSelect(item.id, !selected); return; }
    const next = !expanded;
    setExpanded(next);
    if (!next) setEditing(false);
  }

  return (
    <>
      <tr
        data-testid={`row-inventory-${item.id}`}
        className={`border-b border-border/50 cursor-pointer transition-colors ${
          selected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/30"
        }`}
        onClick={toggle}
      >
        <td className="px-3 py-2.5 w-7" onClick={e => e.stopPropagation()}>
          {selectMode ? (
            <button
              onClick={() => onSelect(item.id, !selected)}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              {selected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
            </button>
          ) : (
            <ChevronDown size={13} className={`text-muted-foreground transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} />
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-3">
            {item.photoUrl ? (
              <img src={item.photoUrl} alt="" crossOrigin="anonymous"
                className="w-12 h-[67px] rounded object-contain bg-muted shrink-0" />
            ) : (
              <div className="w-12 h-[67px] rounded bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate max-w-[280px]">{item.productName}</div>
              <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                {item.number}{meta.sourceSetName ? ` · ${meta.sourceSetName}` : ""}
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <ConditionBadge condition={item.condition} abbreviated />
            <LabelStatusBadge status={item.labelStatus} />
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground capitalize whitespace-nowrap">{item.game?.replace("-", " ")}</td>
        <td className="px-3 py-2.5 text-center whitespace-nowrap">
          <span className="text-sm font-mono font-medium text-foreground">{item.currentQuantity}</span>
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <span className="text-sm font-mono text-foreground">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <span className="text-sm font-mono font-semibold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <span className="text-sm font-mono text-muted-foreground">
            ${((item.currentRawMarketPrice || 0) * item.currentQuantity).toFixed(2)}
          </span>
        </td>
      </tr>

      {expanded && !selectMode && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={8} className="px-4 py-3">
            <ExpandedDetail item={item} meta={meta} editing={editing} setEditing={setEditing} stopProp />
          </td>
        </tr>
      )}
    </>
  );
}

type LabelFilter = "all" | "needs_label" | "needs_repricing" | "label_created";

// ── Inventory page ────────────────────────────────────────────────────────────
export default function Inventory() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedGame, setSelectedGame] = useGameParam();
  const game = selectedGame ?? "all";
  const [condition, setCondition] = useState("all");
  const [sortBy, setSortBy] = useState("lastSeenAt");
  const [labelFilter, setLabelFilter] = useState<LabelFilter>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Close export dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory", game, condition, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (game !== "all") params.set("game", game);
      if (condition !== "all") params.set("condition", condition);
      if (search) params.set("search", search);
      const res = await apiRequest("GET", `/api/inventory?${params}`);
      return res.json();
    },
  });

  // Export labels mutation — uses raw fetch so we can read the binary blob
  const exportMut = useMutation({
    mutationFn: async ({ format, stickerMode }: { format: "xlsx" | "csv"; stickerMode: "single" | "dual" }) => {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/labels/export", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ game, format, stickerMode }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `niimbot-labels-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setExportOpen(false);
      toast({ title: "Labels exported", description: "Download started — check your downloads folder." });
    },
    onError: (e: any) => {
      setExportOpen(false);
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    },
  });

  const sortedAll = [...items].sort((a: any, b: any) => {
    if (sortBy === "price") return (b.currentRawMarketPrice || 0) - (a.currentRawMarketPrice || 0);
    if (sortBy === "quantity") return b.currentQuantity - a.currentQuantity;
    if (sortBy === "value") return ((b.currentRawMarketPrice || 0) * b.currentQuantity) - ((a.currentRawMarketPrice || 0) * a.currentQuantity);
    if (sortBy === "name") return a.productName.localeCompare(b.productName);
    return b.lastSeenAt?.localeCompare(a.lastSeenAt || "") || 0;
  });

  const sorted = labelFilter === "all"
    ? sortedAll
    : sortedAll.filter((i: any) => i.labelStatus === labelFilter);

  // Counts per label status for filter pills
  const labelCounts = {
    needs_label:     items.filter((i: any) => i.labelStatus === "needs_label").length,
    needs_repricing: items.filter((i: any) => i.labelStatus === "needs_repricing").length,
    label_created:   items.filter((i: any) => i.labelStatus === "label_created").length,
  };
  const pendingExportCount = labelCounts.needs_label + labelCounts.needs_repricing;

  const totalValue = items.reduce((s: number, i: any) => s + (i.currentRawMarketPrice || 0) * i.currentQuantity, 0);
  const totalUnits = items.reduce((s: number, i: any) => s + i.currentQuantity, 0);

  function handleSelect(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function selectAll() { setSelectedIds(new Set(sorted.map((i: any) => i.id))); }
  function deselectAll() { setSelectedIds(new Set()); }
  function exitSelectMode() { setSelectMode(false); setSelectedIds(new Set()); }

  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length;
  const someSelected = selectedIds.size > 0;

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("DELETE", "/api/inventory/bulk", { ids });
      return res.json();
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Deleted", description: `${ids.length} item${ids.length !== 1 ? "s" : ""} removed from inventory.` });
      exitSelectMode();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete items.", variant: "destructive" });
    },
  });

  function handleBulkDelete() {
    if (!someSelected) return;
    bulkDeleteMut.mutate(Array.from(selectedIds));
  }

  // ── Tile picker ─────────────────────────────────────────────────────────────
  if (selectedGame === null) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-foreground mb-4">Inventory</h1>
        <GameTileGrid items={items} images={GAME_IMAGES} onSelect={setSelectedGame} />
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 py-2 mb-3 bg-background/95 backdrop-blur border-b border-border/60">
        <button
          data-testid="button-back-to-games"
          onClick={() => setSelectedGame(null)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> Games
        </button>
      </div>

      <div className="flex flex-col gap-1 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="font-mono">{items.length.toLocaleString()} SKUs</span>
          <span>·</span>
          <span className="font-mono">{totalUnits.toLocaleString()} units</span>
          <span>·</span>
          <span className="font-mono text-primary font-medium">
            ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Label Status Filter Pills */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {(
          [
            { key: "all",              label: "All",              count: items.length },
            { key: "needs_label",      label: "Needs Label",      count: labelCounts.needs_label,      className: "text-amber-400" },
            { key: "needs_repricing",  label: "Needs Repricing",  count: labelCounts.needs_repricing,  className: "text-blue-400" },
            { key: "label_created",    label: "Label Created",    count: labelCounts.label_created,    className: "text-green-400" },
          ] as const
        ).map(({ key, label, count, className: cls }) => (
          <button
            key={key}
            onClick={() => setLabelFilter(key as LabelFilter)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              labelFilter === key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <span>{label}</span>
            <span className={`font-mono tabular-nums ${labelFilter === key ? "text-primary" : (cls || "text-muted-foreground")}`}>{count}</span>
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Export Labels dropdown */}
        <div className="relative" ref={exportRef}>
          <Button
            data-testid="button-export-labels"
            size="sm"
            className="h-8 px-3 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            onClick={() => setExportOpen(prev => !prev)}
            disabled={exportMut.isPending}
          >
            <Download size={13} />
            {exportMut.isPending ? "Exporting…" : `Export Labels${pendingExportCount > 0 ? ` (${pendingExportCount})` : ""}`}
            <ChevronDown size={12} className={`transition-transform ${exportOpen ? "rotate-180" : ""}`} />
          </Button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-card shadow-lg py-1 animate-in fade-in-0 slide-in-from-top-1 duration-100">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Excel (Niimbot)</div>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => exportMut.mutate({ format: "xlsx", stickerMode: "single" })}
              >Single-side labels</button>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => exportMut.mutate({ format: "xlsx", stickerMode: "dual" })}
              >Dual A/B labels</button>
              <div className="my-1 border-t border-border" />
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CSV (Mac)</div>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => exportMut.mutate({ format: "csv", stickerMode: "single" })}
              >Single-side CSV</button>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => exportMut.mutate({ format: "csv", stickerMode: "dual" })}
              >Dual A/B CSV</button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[150px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="input-search"
            placeholder="Search cards…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 h-9 text-sm"
          />
        </div>
        <Select value={game} onValueChange={setSelectedGame}>
          <SelectTrigger data-testid="select-filter-game" className="w-[110px] h-9 text-xs">
            <SelectValue placeholder="Game" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Games</SelectItem>
            <SelectItem value="one-piece">One Piece</SelectItem>
            <SelectItem value="pokemon">Pokémon</SelectItem>
            <SelectItem value="sorcery">Sorcery</SelectItem>
            <SelectItem value="dragon-ball">Dragon Ball</SelectItem>
            <SelectItem value="mtg">MTG</SelectItem>
          </SelectContent>
        </Select>
        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger data-testid="select-filter-condition" className="w-[90px] h-9 text-xs">
            <SelectValue placeholder="Cond." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conds.</SelectItem>
            <SelectItem value="Near Mint">NM</SelectItem>
            <SelectItem value="Lightly Played">LP</SelectItem>
            <SelectItem value="Moderately Played">MP</SelectItem>
            <SelectItem value="Heavily Played">HP</SelectItem>
            <SelectItem value="Damaged">DMG</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger data-testid="select-sort" className="w-[120px] h-9 text-xs">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lastSeenAt">Last Updated</SelectItem>
            <SelectItem value="price">Market Price</SelectItem>
            <SelectItem value="quantity">Quantity</SelectItem>
            <SelectItem value="value">Total Value</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
          </SelectContent>
        </Select>

        <Button
          data-testid="button-bulk-edit"
          size="sm"
          variant="outline"
          className="h-9 px-3 text-xs gap-1.5"
          onClick={() => setSelectMode(true)}
        >
          <CheckSquare size={14} />
          Bulk Edit
        </Button>
      </div>

      {/* Bulk actions toolbar — visible only in select mode */}
      {selectMode && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={allSelected ? deselectAll : selectAll}>
            {allSelected ? <Square size={13} /> : <CheckSquare size={13} />}
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          <Button
            variant="destructive" size="sm" className="h-8 text-xs gap-1.5"
            disabled={!someSelected || bulkDeleteMut.isPending} onClick={handleBulkDelete}
          >
            <Trash2 size={13} />
            {bulkDeleteMut.isPending ? "Deleting…" : someSelected ? `Delete (${selectedIds.size})` : "Delete"}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground" onClick={exitSelectMode}>
            <X size={13} /> Cancel
          </Button>
          {someSelected && <span className="text-xs text-muted-foreground ml-1">{selectedIds.size} selected</span>}
        </div>
      )}

      {/* Mobile */}
      <div className="sm:hidden space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)
          : sorted.length === 0
          ? <div className="py-12 text-center text-muted-foreground text-sm">No inventory — upload a CSV to get started</div>
          : sorted.map((item: any) => (
              <InventoryCard key={item.id} item={item} selected={selectedIds.has(item.id)} onSelect={handleSelect} selectMode={selectMode} />
            ))
        }
      </div>

      {/* Desktop */}
      <div className="hidden sm:block stat-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="w-7 px-3 py-2.5">
                  {selectMode && (
                    <button onClick={allSelected ? deselectAll : selectAll} className="text-muted-foreground hover:text-primary transition-colors">
                      {allSelected ? <CheckSquare size={14} className="text-primary" /> : someSelected ? <CheckSquare size={14} className="text-primary/50" /> : <Square size={14} />}
                    </button>
                  )}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Card</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Cond</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Game</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Qty</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Market $</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Print $</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={8} className="px-3 py-2.5"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ))
                : sorted.length === 0
                ? <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground text-sm">No inventory — upload a CSV to get started</td></tr>
                : sorted.map((item: any) => (
                    <InventoryRow key={item.id} item={item} selected={selectedIds.has(item.id)} onSelect={handleSelect} selectMode={selectMode} />
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
