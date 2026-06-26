import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, ChevronDown, TrendingUp, TrendingDown, ExternalLink, Check, X, Trash2, CheckSquare, Square, Download, ArrowLeft } from "lucide-react";
import { GameTileGrid } from "@/components/GameTileGrid";
import { useGameParam } from "@/lib/useGameParam";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ConditionBadge } from "@/components/ConditionBadge";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

// Placeholder image map for the game tiles — keyed by the stored game value.
// Drop in image URLs here later without touching the tile component.
const GAME_IMAGES: Record<string, string> = {
  all: "",
  pokemon: "",
  "one-piece": "",
  sorcery: "",
  "dragon-ball": "",
};

// ── Price History ─────────────────────────────────────────────────────────────
function PriceHistory({ itemId }: { itemId: string }) {
  const { data: snaps = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/inventory", itemId, "snapshots"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/inventory/${itemId}/snapshots`);
      return res.json();
    },
  });
  if (isLoading) return <div className="text-xs text-muted-foreground">Loading…</div>;
  if (!snaps.length) return <div className="text-xs text-muted-foreground">No price history yet</div>;
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1.5">Price History</div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {snaps.slice(0, 12).map((s: any, i: number) => {
          const prev = snaps[i + 1];
          const change = prev ? ((s.rawMarketPrice - prev.rawMarketPrice) / prev.rawMarketPrice * 100) : 0;
          return (
            <div key={s.id} className="flex flex-col items-center gap-0.5 shrink-0">
              <div className="text-xs font-mono font-medium text-foreground">${s.rawMarketPrice.toFixed(2)}</div>
              {prev && (
                <div className={`flex items-center gap-0.5 text-[10px] ${change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                  {change > 0 ? <TrendingUp size={9} /> : change < 0 ? <TrendingDown size={9} /> : null}
                  {Math.abs(change).toFixed(1)}%
                </div>
              )}
              <div className="text-[10px] text-muted-foreground">
                {(() => { try { return format(parseISO(s.snapshotDate), "M/d"); } catch { return "—"; } })()}
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
    <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-3">
      <div className="text-xs font-semibold text-primary uppercase tracking-wide">Edit Item</div>

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
        <Input data-testid="input-edit-notes" value={notes} onChange={e => setNotes(e.target.value)}
          className="h-8 text-sm" placeholder="e.g. scanner miscounted" />
      </div>

      <div className="flex gap-2 pt-1">
        <Button data-testid="button-save-edit" size="sm" onClick={handleSave}
          disabled={mutation.isPending} className="h-8 text-xs gap-1.5">
          <Check size={12} />{mutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" size="sm" onClick={onDone}
          disabled={mutation.isPending} className="h-8 text-xs gap-1.5">
          <X size={12} />Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Expanded detail content (shared between mobile + desktop) ─────────────────
function ExpandedDetail({
  item, meta, editing, setEditing, stopProp = false,
}: {
  item: any;
  meta: any;
  editing: boolean;
  setEditing: (v: boolean) => void;
  stopProp?: boolean;
}) {
  const wrap = (e: React.MouseEvent) => { if (stopProp) e.stopPropagation(); };

  return (
    <div className="space-y-3" onClick={wrap}>
      {(meta.sourcePrinting || meta.sourceRarity || item.notes) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {meta.sourcePrinting && (
            <div><span className="text-muted-foreground">Printing: </span><span className="text-foreground">{meta.sourcePrinting}</span></div>
          )}
          {meta.sourceRarity && (
            <div><span className="text-muted-foreground">Rarity: </span><span className="text-foreground">{meta.sourceRarity}</span></div>
          )}
          {item.notes && (
            <div className="w-full"><span className="text-muted-foreground">Notes: </span><span className="text-foreground">{item.notes}</span></div>
          )}
        </div>
      )}

      <PriceHistory itemId={item.id} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        {item.tcgplayerUrl ? (
          <a
            href={item.tcgplayerUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          >
            <ExternalLink size={11} /> View on TCGplayer
          </a>
        ) : <span />}
        {!editing && (
          <button
            onClick={e => { e.stopPropagation(); setEditing(true); }}
            className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
          >
            Edit item
          </button>
        )}
      </div>

      {editing && <InlineEditPanel item={item} onDone={() => setEditing(false)} />}
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
        {/* Checkbox in select mode */}
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
        {/* Checkbox column */}
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
        <td className="px-3 py-2.5 text-xs whitespace-nowrap"><ConditionBadge condition={item.condition} abbreviated /></td>
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

// ── Inventory page ────────────────────────────────────────────────────────────
export default function Inventory() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  // selectedGame === null → show the tile picker; any string → table view.
  // `game` mirrors it (defaulting to "all") for the query + filter dropdown.
  const [selectedGame, setSelectedGame] = useGameParam();
  const game = selectedGame ?? "all";
  const [condition, setCondition] = useState("all");
  const [sortBy, setSortBy] = useState("lastSeenAt");

  // ── Bulk selection state ───────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const sorted = [...items].sort((a: any, b: any) => {
    if (sortBy === "price") return (b.currentRawMarketPrice || 0) - (a.currentRawMarketPrice || 0);
    if (sortBy === "quantity") return b.currentQuantity - a.currentQuantity;
    if (sortBy === "value") return ((b.currentRawMarketPrice || 0) * b.currentQuantity) - ((a.currentRawMarketPrice || 0) * a.currentQuantity);
    if (sortBy === "name") return a.productName.localeCompare(b.productName);
    return b.lastSeenAt?.localeCompare(a.lastSeenAt || "") || 0;
  });

  const totalValue = items.reduce((s: number, i: any) => s + (i.currentRawMarketPrice || 0) * i.currentQuantity, 0);
  const totalUnits = items.reduce((s: number, i: any) => s + i.currentQuantity, 0);

  // ── Selection helpers ──────────────────────────────────────────────────────
  function handleSelect(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(sorted.map((i: any) => i.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length;
  const someSelected = selectedIds.size > 0;

  // ── Bulk delete mutation ───────────────────────────────────────────────────
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
    const ids = Array.from(selectedIds);
    bulkDeleteMut.mutate(ids);
  }

  // ── Excel export ───────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      // apiRequest attaches the Bearer token from the auth context.
      const res = await apiRequest("GET", "/api/inventory/export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cardvault-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Error", description: "Failed to export inventory.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  // ── Tile picker (no game selected) ──────────────────────────────────────────
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
      {/* Back to game tiles */}
      <button
        data-testid="button-back-to-games"
        onClick={() => setSelectedGame(null)}
        className="inline-flex items-center gap-1 mb-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> Games
      </button>

      {/* Header */}
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
          data-testid="button-export-inventory"
          variant="outline"
          size="sm"
          className="h-9 text-xs gap-1.5"
          onClick={handleExport}
          disabled={exporting}
        >
          <Download size={13} />
          {exporting ? "Exporting…" : "Export Excel"}
        </Button>
      </div>

      {/* ── Bulk actions toolbar ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {!selectMode ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setSelectMode(true)}
          >
            <CheckSquare size={13} />
            Bulk Actions
          </Button>
        ) : (
          <>
            {/* Select / Deselect All */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={allSelected ? deselectAll : selectAll}
            >
              {allSelected ? <Square size={13} /> : <CheckSquare size={13} />}
              {allSelected ? "Deselect All" : "Select All"}
            </Button>

            {/* Delete */}
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!someSelected || bulkDeleteMut.isPending}
              onClick={handleBulkDelete}
            >
              <Trash2 size={13} />
              {bulkDeleteMut.isPending
                ? "Deleting…"
                : someSelected
                ? `Delete (${selectedIds.size})`
                : "Delete"}
            </Button>

            {/* Cancel */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1.5 text-muted-foreground"
              onClick={exitSelectMode}
            >
              <X size={13} />
              Cancel
            </Button>

            {someSelected && (
              <span className="text-xs text-muted-foreground ml-1">
                {selectedIds.size} selected
              </span>
            )}
          </>
        )}
      </div>

      {/* Mobile */}
      <div className="sm:hidden space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)
          : sorted.length === 0
          ? <div className="py-12 text-center text-muted-foreground text-sm">No inventory — upload a CSV to get started</div>
          : sorted.map((item: any) => (
              <InventoryCard
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                onSelect={handleSelect}
                selectMode={selectMode}
              />
            ))
        }
      </div>

      {/* Desktop */}
      <div className="hidden sm:block stat-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {/* Header checkbox cell — select/deselect all */}
                <th className="w-7 px-3 py-2.5">
                  {selectMode && (
                    <button
                      onClick={allSelected ? deselectAll : selectAll}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      {allSelected
                        ? <CheckSquare size={14} className="text-primary" />
                        : someSelected
                        ? <CheckSquare size={14} className="text-primary/50" />
                        : <Square size={14} />}
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
                    <InventoryRow
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      onSelect={handleSelect}
                      selectMode={selectMode}
                    />
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
