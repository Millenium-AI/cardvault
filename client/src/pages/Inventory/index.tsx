import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, CheckSquare, Square, Download, SlidersHorizontal } from "lucide-react";
import { useGameParam } from "@/lib/useGameParam";
import { gameLabel } from "@shared/gameLabels";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { useInventoryList, useColumnOrder } from "./hooks/useInventoryQueries";
import { useLabelsExportMutation, useColumnOrderMutation } from "./hooks/useInventoryMutations";
import { DEFAULT_COLUMN_ORDER, mergeColumnOrder, moveColumn, ColumnKey, COLUMN_LABELS, LabelFilter, ViewMode } from "./constants";
import { DraggableColHeader } from "./ColumnHeader";
import { ViewModeToggle } from "./ViewModeToggle";
import { InventoryGridCard } from "./ItemGrid";
import { InventoryRow } from "./ItemRow";
import { MobileInventoryCard } from "./MobileCard";
import { InventoryDetailSheet } from "./DetailSheet";
import { BulkActionBar } from "./BulkActionsBar";

export default function Inventory() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedGame, setSelectedGame] = useGameParam();
  const game = selectedGame ?? "all";
  const [condition, setCondition] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [labelFilter, setLabelFilter] = useState<LabelFilter>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("inventory-view-mode") as ViewMode) || "list"; } catch { return "list"; }
  });

  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>([...DEFAULT_COLUMN_ORDER]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sheetItem, setSheetItem] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Load column settings
  const columnQuery = useColumnOrder();
  useEffect(() => {
    if (columnQuery.data?.order && Array.isArray(columnQuery.data.order)) {
      setColumnOrder(mergeColumnOrder(columnQuery.data.order));
    }
  }, [columnQuery.data?.order]);

  // Fetch inventory data
  const { data: items = [], isLoading } = useInventoryList(game, condition, search);

  // Mutations
  const columnMut = useColumnOrderMutation();
  const exportMut = useLabelsExportMutation();

  // Handlers
  function handleViewMode(v: ViewMode) {
    setViewMode(v);
    try { localStorage.setItem("inventory-view-mode", v); } catch { }
  }

  function handleColumnMove(dragged: ColumnKey, target: ColumnKey) {
    const next = moveColumn(columnOrder, dragged, target);
    setColumnOrder(next);
    columnMut.mutate(next);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Data processing
  const sortedAll = [...items].sort((a: any, b: any) => {
    if (sortBy === "price")    return (b.currentRawMarketPrice || 0) - (a.currentRawMarketPrice || 0);
    if (sortBy === "quantity") return b.currentQuantity - a.currentQuantity;
    if (sortBy === "value")    return ((b.currentRawMarketPrice || 0) * b.currentQuantity) - ((a.currentRawMarketPrice || 0) * a.currentQuantity);
    if (sortBy === "name")     return a.productName.localeCompare(b.productName);
    return b.lastSeenAt?.localeCompare(a.lastSeenAt || "") || 0;
  });

  const sorted = labelFilter === "all" ? sortedAll : sortedAll.filter((i: any) => i.labelStatus === labelFilter);

  const labelCounts = {
    needs_label:     items.filter((i: any) => i.labelStatus === "needs_label").length,
    needs_repricing: items.filter((i: any) => i.labelStatus === "needs_repricing").length,
    label_created:   items.filter((i: any) => i.labelStatus === "label_created").length,
  };
  const pendingExportCount = labelCounts.needs_label + labelCounts.needs_repricing;
  const totalValue = items.reduce((s: number, i: any) => s + (i.currentRawMarketPrice || 0) * i.currentQuantity, 0);
  const totalUnits = items.reduce((s: number, i: any) => s + i.currentQuantity, 0);

  // Selection handlers
  function handleSelect(id: string, checked: boolean) {
    setSelectedIds(prev => { const next = new Set(prev); checked ? next.add(id) : next.delete(id); return next; });
  }
  function selectAll()     { setSelectedIds(new Set(sorted.map((i: any) => i.id))); }
  function deselectAll()   { setSelectedIds(new Set()); }
  function exitSelectMode() { setSelectMode(false); setSelectedIds(new Set()); }
  const someSelected = selectedIds.size > 0;

  function openSheet(item: any) { setSheetItem(item); setSheetOpen(true); }
  const liveSheetItem = sheetItem ? (items.find((i: any) => i.id === sheetItem.id) ?? sheetItem) : null;
  const emptyMsg = "No inventory — upload a CSV to get started";
  const activeFilterCount = [game !== "all", condition !== "all", sortBy !== "name", labelFilter !== "all"].filter(Boolean).length;

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col gap-1 mb-3 sm:flex-row sm:items-center sm:justify-between">
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

      {/* MOBILE FILTER BAR */}
      <div className="md:hidden space-y-2 mb-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="input-search" placeholder="Search cards…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-7 h-9 text-sm w-full" />
          </div>
          <button onClick={() => setFilterOpen(o => !o)}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition-colors shrink-0",
              filterOpen || activeFilterCount > 0
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}>
            <SlidersHorizontal size={13} />Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
          <Button data-testid="button-bulk-edit" size="sm"
            variant={selectMode ? "default" : "outline"} className="h-9 px-3 text-xs shrink-0"
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}>
            <CheckSquare size={14} />
          </Button>
        </div>

        {filterOpen && (
          <div className="grid grid-cols-2 gap-2 p-3 rounded-lg border border-border bg-muted/20 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            <Select value={game} onValueChange={setSelectedGame}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Game" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Games</SelectItem>
                <SelectItem value="pokemon">Pokémon</SelectItem>
                <SelectItem value="pokemon-jp">Pokémon JP</SelectItem>
                <SelectItem value="one-piece">One Piece</SelectItem>
                <SelectItem value="sorcery">Sorcery</SelectItem>
                <SelectItem value="dragon-ball">Dragon Ball</SelectItem>
                <SelectItem value="mtg">MTG</SelectItem>
                <SelectItem value="star-wars">Star Wars</SelectItem>
              </SelectContent>
            </Select>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Condition" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Conds</SelectItem>
                <SelectItem value="Near Mint">NM</SelectItem>
                <SelectItem value="Lightly Played">LP</SelectItem>
                <SelectItem value="Moderately Played">MP</SelectItem>
                <SelectItem value="Heavily Played">HP</SelectItem>
                <SelectItem value="Damaged">DMG</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lastSeenAt">Last Updated</SelectItem>
                <SelectItem value="price">Market Price</SelectItem>
                <SelectItem value="quantity">Quantity</SelectItem>
                <SelectItem value="value">Total Value</SelectItem>
                <SelectItem value="name">Name A-Z</SelectItem>
              </SelectContent>
            </Select>
            <Select value={labelFilter} onValueChange={v => setLabelFilter(v as LabelFilter)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Label status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Labels</SelectItem>
                <SelectItem value="needs_label">Needs Label</SelectItem>
                <SelectItem value="needs_repricing">Needs Repricing</SelectItem>
                <SelectItem value="label_created">Label Created</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {([
            { key: "all",             label: "All",             count: items.length },
            { key: "needs_label",     label: "Needs Label",     count: labelCounts.needs_label,     cls: "text-amber-400" },
            { key: "needs_repricing", label: "Needs Repricing", count: labelCounts.needs_repricing, cls: "text-blue-400" },
            { key: "label_created",   label: "Label Created",   count: labelCounts.label_created,   cls: "text-green-400" },
          ] as const).map(({ key, label, count, cls }: any) => (
            <button key={key} onClick={() => setLabelFilter(key as LabelFilter)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0",
                labelFilter === key
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}>
              <span>{label}</span>
              <span className={cn("font-mono tabular-nums", labelFilter === key ? "text-primary" : (cls || "text-muted-foreground"))}>{count}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <ViewModeToggle value={viewMode} onChange={handleViewMode} />
          </div>
        </div>
      </div>

      {/* DESKTOP FILTER BAR */}
      <div className="hidden md:block">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[150px] max-w-[260px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="input-search" placeholder="Search cards…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-7 h-9 text-sm" />
          </div>
          <Select value={game} onValueChange={setSelectedGame}>
            <SelectTrigger data-testid="select-filter-game" className="w-[120px] h-9 text-xs"><SelectValue placeholder="Game" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Games</SelectItem>
              <SelectItem value="pokemon">Pokémon</SelectItem>
              <SelectItem value="pokemon-jp">Pokémon JP</SelectItem>
              <SelectItem value="one-piece">One Piece</SelectItem>
              <SelectItem value="sorcery">Sorcery</SelectItem>
              <SelectItem value="dragon-ball">Dragon Ball</SelectItem>
              <SelectItem value="mtg">MTG</SelectItem>
              <SelectItem value="star-wars">Star Wars</SelectItem>
            </SelectContent>
          </Select>
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger data-testid="select-filter-condition" className="w-[130px] h-9 text-xs"><SelectValue placeholder="All Conditions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Conditions</SelectItem>
              <SelectItem value="Near Mint">NM</SelectItem>
              <SelectItem value="Lightly Played">LP</SelectItem>
              <SelectItem value="Moderately Played">MP</SelectItem>
              <SelectItem value="Heavily Played">HP</SelectItem>
              <SelectItem value="Damaged">DMG</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger data-testid="select-sort" className="w-[120px] h-9 text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lastSeenAt">Last Updated</SelectItem>
              <SelectItem value="price">Market Price</SelectItem>
              <SelectItem value="quantity">Quantity</SelectItem>
              <SelectItem value="value">Total Value</SelectItem>
              <SelectItem value="name">Name A-Z</SelectItem>
            </SelectContent>
          </Select>
          <Button data-testid="button-bulk-edit" size="sm"
            variant={selectMode ? "default" : "outline"} className="h-9 px-3 text-xs gap-1.5"
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}>
            <CheckSquare size={14} />{selectMode ? "Cancel" : "Bulk Edit"}
          </Button>
        </div>

        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {([
            { key: "all",             label: "All",             count: items.length,                 className: undefined as string | undefined },
            { key: "needs_label",     label: "Needs Label",     count: labelCounts.needs_label,     className: "text-amber-400" as string | undefined },
            { key: "needs_repricing", label: "Needs Repricing", count: labelCounts.needs_repricing, className: "text-blue-400" as string | undefined },
            { key: "label_created",   label: "Label Created",   count: labelCounts.label_created,   className: "text-green-400" as string | undefined },
          ]).map(({ key, label, count, className: cls }) => (
            <button key={key} onClick={() => setLabelFilter(key as LabelFilter)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                labelFilter === key ? "border-primary bg-primary/15 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}>
              <span>{label}</span>
              <span className={`font-mono tabular-nums ${labelFilter === key ? "text-primary" : (cls || "text-muted-foreground")}`}>{count}</span>
            </button>
          ))}
          <div className="flex-1" />
          <ViewModeToggle value={viewMode} onChange={handleViewMode} />
          <div className="relative" ref={exportRef}>
            <Button data-testid="button-export-labels" size="sm"
              className="h-8 px-3 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              onClick={() => setExportOpen(prev => !prev)} disabled={exportMut.isPending}>
              <Download size={13} />
              {exportMut.isPending ? "Exporting…" : `Export Labels${pendingExportCount > 0 ? ` (${pendingExportCount})` : ""}`}
              <ChevronDown size={12} className={`transition-transform ${exportOpen ? "rotate-180" : ""}`} />
            </Button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-card shadow-lg py-1 animate-in fade-in-0 slide-in-from-top-1 duration-100">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Excel (Niimbot)</div>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => exportMut.mutate({ game, format: "xlsx", stickerMode: "single" })}>Single-side labels</button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => exportMut.mutate({ game, format: "xlsx", stickerMode: "dual" })}>Dual A/B labels</button>
                <div className="my-1 border-t border-border" />
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CSV (Mac)</div>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => exportMut.mutate({ game, format: "csv", stickerMode: "single" })}>Single-side CSV</button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => exportMut.mutate({ game, format: "csv", stickerMode: "dual" })}>Dual A/B CSV</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <div className="rounded-lg border border-border/40 bg-card overflow-hidden shadow-sm">
          <div className="md:hidden divide-y divide-border/50">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3">
                    <Skeleton className="w-9 h-[50px] rounded shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))
              : sorted.length === 0
              ? <div className="px-4 py-12 text-center text-muted-foreground text-sm">{emptyMsg}</div>
              : sorted.map((item: any) => (
                  <MobileInventoryCard key={item.id} item={item}
                    selected={selectedIds.has(item.id)} onSelect={handleSelect} selectMode={selectMode} />
                ))
            }
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  {columnOrder.map(col => (
                    <DraggableColHeader key={col} id={col} onMove={handleColumnMove}>
                      {col === "card" ? (
                        <div className="flex items-center gap-2">
                          {selectMode && (
                            <button onClick={e => { e.stopPropagation(); (selectedIds.size === sorted.length && sorted.length > 0 ? deselectAll : selectAll)(); }}
                              className="text-muted-foreground/50 hover:text-primary transition-colors">
                              {selectedIds.size === sorted.length && sorted.length > 0
                                ? <CheckSquare size={13} className="text-primary" />
                                : someSelected ? <CheckSquare size={13} className="text-primary/50" /> : <Square size={13} />}
                            </button>
                          )}
                          {COLUMN_LABELS.card}
                        </div>
                      ) : (
                        COLUMN_LABELS[col]
                      )}
                    </DraggableColHeader>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/20">
                        <td colSpan={columnOrder.length} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td>
                      </tr>
                    ))
                  : sorted.length === 0
                  ? <tr><td colSpan={columnOrder.length} className="px-3 py-12 text-center text-muted-foreground text-sm">{emptyMsg}</td></tr>
                  : sorted.map((item: any) => (
                      <InventoryRow key={item.id} item={item}
                        selected={selectedIds.has(item.id)} onSelect={handleSelect}
                        selectMode={selectMode} columnOrder={columnOrder} />
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SMALL GRID */}
      {viewMode === "grid-sm" && (
        isLoading
          ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
          : sorted.length === 0
          ? <div className="py-12 text-center text-muted-foreground text-sm">{emptyMsg}</div>
          : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {sorted.map((item: any) => (
                <InventoryGridCard key={item.id} item={item} size="sm"
                  selected={selectedIds.has(item.id)} onSelect={handleSelect}
                  selectMode={selectMode} onOpen={() => openSheet(item)} />
              ))}
            </div>
      )}

      {/* LARGE GRID */}
      {viewMode === "grid-lg" && (
        isLoading
          ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}</div>
          : sorted.length === 0
          ? <div className="py-12 text-center text-muted-foreground text-sm">{emptyMsg}</div>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sorted.map((item: any) => (
                <InventoryGridCard key={item.id} item={item} size="lg"
                  selected={selectedIds.has(item.id)} onSelect={handleSelect}
                  selectMode={selectMode} onOpen={() => openSheet(item)} />
              ))}
            </div>
      )}

      <InventoryDetailSheet item={liveSheetItem} open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSheetItem(null); }} />

      {selectMode && (
        <BulkActionBar selectedIds={selectedIds} allCount={sorted.length}
          onSelectAll={selectAll} onDeselectAll={deselectAll} onCancel={exitSelectMode} />
      )}
    </div>
  );
}
