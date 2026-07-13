import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, CheckSquare, Download, SlidersHorizontal, RefreshCw } from "lucide-react";
import { useGameParam } from "@/lib/useGameParam";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useInventory } from "./hooks/useInventory";
import { useInventoryColumns } from "./hooks/useInventoryColumns";
import { useInventoryPersist } from "./hooks/useInventoryPersist";
import { useBulkSelect } from "./hooks/useBulkSelect";
import { InventoryRow } from "./ItemRow";
import { DraggableColHeader } from "./ColumnHeader";
import { DetailPanel } from "./DetailPanel";
import { DetailSheet } from "./DetailSheet";
import { BulkActionsBar } from "./BulkActionsBar";
import { MobileCard } from "./MobileCard";
import { MobileDetailDrawer } from "./MobileDetailDrawer";
import { InventoryGridCard } from "./ItemGrid";
import { ViewModeToggle } from "./ViewModeToggle";
import type { InventoryItem } from "@shared/schema";
import type { LabelFilter, SortField, SortDir } from "./constants";
import { LABEL_FILTER_OPTIONS, COLUMN_LABELS } from "./constants";

export default function Inventory() {
  const game = useGameParam();
  const queryClient = useQueryClient();

  /* ── search / filter / sort ──────────────────────────────────────────────── */
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState<LabelFilter>("all");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFilters, setShowFilters] = useState(false);

  /* ── view mode ───────────────────────────────────────────────────────────── */
  const [viewMode, setViewMode] = useInventoryPersist<"table" | "grid-sm" | "grid-lg">("inventoryViewMode", "table");

  /* ── detail panel ────────────────────────────────────────────────────────── */
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [mobileDrawerItem, setMobileDrawerItem] = useState<InventoryItem | null>(null);

  /* ── column order ────────────────────────────────────────────────────────── */
  const { columnOrder, moveColumn } = useInventoryColumns();

  /* ── bulk select ─────────────────────────────────────────────────────────── */
  const [selectMode, setSelectMode] = useState(false);
  const { selected, toggleOne, toggleAll, clearSelection } = useBulkSelect();

  /* ── data ────────────────────────────────────────────────────────────────── */
  const { data, isLoading, isError } = useInventory({ game, search, labelFilter, sortField, sortDir });
  const items: InventoryItem[] = data ?? [];

  /* ── label options with counts ───────────────────────────────────────────── */
  const labelOptions = LABEL_FILTER_OPTIONS.map(opt => ({
    ...opt,
    count: opt.key === "all" ? items.length : items.filter(i => i.labelStatus === opt.key).length,
  }));

  /* ── helpers ─────────────────────────────────────────────────────────────── */
  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  function openDetail(item: InventoryItem) {
    setSelectedItem(item);
    setExpandedRowId(null);
  }

  function closeDetail() {
    setSelectedItem(null);
  }

  function toggleRow(id: string) {
    setExpandedRowId(prev => (prev === id ? null : id));
    setSelectedItem(null);
  }

  function openMobileDrawer(item: InventoryItem) {
    setMobileDrawerItem(item);
  }

  function closeMobileDrawer() {
    setMobileDrawerItem(null);
  }

  const emptyMsg = isError ? "Failed to load inventory." : "No cards found.";

  /* ── export labels ───────────────────────────────────────────────────────── */
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    function handle(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [exportMenuOpen]);

  async function handleExport(format: "pdf" | "png") {
    const ids = selectMode && selected.size > 0 ? [...selected] : items.map(i => i.id);
    if (ids.length === 0) return;
    const qs = ids.map(id => `ids=${encodeURIComponent(id)}`).join("&");
    const url = `/api/labels/export?game=${game}&format=${format}&${qs}`;
    const res = await fetch(url);
    if (!res.ok) { alert("Export failed."); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `labels-${game}.${format}`;
    a.click();
    setExportMenuOpen(false);
  }

  /* ── refresh ─────────────────────────────────────────────────────────────── */
  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
  }

  /* ── render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── MOBILE HEADER (< sm) ────────────────────────────────────────────── */}
      <div className="sm:hidden px-3 pt-3 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
              <RefreshCw size={15} />
            </Button>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => setShowFilters(v => !v)}>
              <SlidersHorizontal size={15} />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search cards…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-7 h-9 text-sm w-full" />
        </div>

        {/* Collapsible filter row */}
        {showFilters && (
          <div className="grid grid-cols-2 gap-2 p-3 rounded-lg border border-border bg-muted/20 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            {LABEL_FILTER_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setLabelFilter(opt.key as LabelFilter)}
                className={`text-left rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  labelFilter === opt.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground border border-border hover:bg-accent/20"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Bulk select toggle (mobile) */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5"
            onClick={() => { setSelectMode(v => !v); clearSelection(); }}>
            <CheckSquare size={14} />{selectMode ? "Cancel" : "Bulk Edit"}
          </Button>
        </div>
      </div>

      {/* ── DESKTOP HEADER (≥ sm) ───────────────────────────────────────────── */}
      <div className="hidden sm:flex px-4 pt-4 pb-3 flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Refresh" onClick={handleRefresh}>
              <RefreshCw size={15} />
            </Button>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* Search + label filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search cards…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-7 h-9 text-sm" />
          </div>
        </div>

        {/* Label filter pills */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {labelOptions.map(({ key, label, count, cls }) => (
            <button key={key} onClick={() => setLabelFilter(key as LabelFilter)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                labelFilter === key ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-accent/20"
              }`}>
              <span className={cls} />
              {label}
              <span className={`ml-0.5 tabular-nums ${
                labelFilter === key ? "text-primary" : "text-muted-foreground"
              }`}>({count})</span>
            </button>
          ))}
        </div>

        {/* Bulk actions row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5"
              onClick={() => { setSelectMode(v => !v); clearSelection(); }}>
              <CheckSquare size={14} />{selectMode ? "Cancel" : "Bulk Edit"}
            </Button>
            {selectMode && selected.size > 0 && (
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            )}
          </div>

          {/* Export labels button */}
          <div className="relative" ref={exportMenuRef}>
            <Button data-testid="button-export-labels" size="sm"
              className="h-8 px-3 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              onClick={() => setExportMenuOpen(v => !v)}>
              <Download size={13} /> Export Labels <ChevronDown size={11} className={`transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
            </Button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-card shadow-lg py-1 animate-in fade-in-0 slide-in-from-top-1 duration-100">
                <button onClick={() => handleExport("pdf")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent/30 transition-colors flex items-center gap-2">
                  <Download size={13} /> Export as PDF
                </button>
                <button onClick={() => handleExport("png")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent/30 transition-colors flex items-center gap-2">
                  <Download size={13} /> Export as PNG
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bulk actions bar */}
        {selectMode && selected.size > 0 && (
          <BulkActionsBar
            selectedIds={[...selected]}
            game={game}
            onDone={() => { clearSelection(); setSelectMode(false); }}
          />
        )}
      </div>

      {/* ── TABLE VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === "table" && (
        <div className="rounded-lg border border-border/40 bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            {isLoading
              ? <div className="px-4 py-12 text-center text-muted-foreground text-sm">Loading…</div>
              : items.length === 0
              ? <div className="px-4 py-12 text-center text-muted-foreground text-sm">{emptyMsg}</div>
              : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      {selectMode && <th className="w-8 px-3 py-2" />}
                      {columnOrder.map((col) => (
                        <DraggableColHeader
                          key={col}
                          id={col}
                          onMove={(dragged, target) => {
                            const fromIdx = columnOrder.indexOf(dragged);
                            const toIdx = columnOrder.indexOf(target);
                            if (fromIdx >= 0 && toIdx >= 0) moveColumn(fromIdx, toIdx);
                          }}
                        >
                          {COLUMN_LABELS[col]}
                        </DraggableColHeader>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0
                      ? <tr><td colSpan={columnOrder.length} className="px-3 py-12 text-center text-muted-foreground text-sm">{emptyMsg}</td></tr>
                      : items.map(item => (
                        <InventoryRow
                          key={item.id}
                          item={item}
                          columnOrder={columnOrder}
                          selectMode={selectMode}
                          selected={selected.has(item.id)}
                          onSelect={(id, _checked) => toggleOne(id)}
                        />
                      ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {/* ── GRID SM VIEW ────────────────────────────────────────────────────── */}
      {viewMode === "grid-sm" && (
        isLoading
          ? <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
          : items.length === 0
          ? <div className="py-12 text-center text-muted-foreground text-sm">{emptyMsg}</div>
          : <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {items.map(item =>
                <InventoryGridCard key={item.id} item={item} size="sm"
                  selected={selected.has(item.id)} onSelect={toggleOne}
                  selectMode={selectMode} onOpen={() => openDetail(item)} />
              )}
            </div>
      )}

      {/* ── GRID LG VIEW ────────────────────────────────────────────────────── */}
      {viewMode === "grid-lg" && (
        isLoading
          ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}</div>
          : items.length === 0
          ? <div className="py-12 text-center text-muted-foreground text-sm">{emptyMsg}</div>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {items.map(item =>
                <InventoryGridCard key={item.id} item={item} size="lg"
                  selected={selected.has(item.id)} onSelect={toggleOne}
                  selectMode={selectMode} onOpen={() => openDetail(item)} />
              )}
            </div>
      )}

      {/* ── MOBILE CARD LIST (≤ sm, table mode) ────────────────────────────── */}
      <div className="sm:hidden">
        {viewMode === "table" && items.map(item => (
          <MobileCard key={item.id} item={item}
            selectMode={selectMode} selected={selected.has(item.id)}
            onSelect={toggleOne} onOpen={() => openMobileDrawer(item)} />
        ))}
      </div>

      {/* ── DETAIL PANEL (desktop) ───────────────────────────────────────────── */}
      <div className="hidden sm:block">
        {selectedItem && (
          <DetailPanel item={selectedItem} onClose={closeDetail}
            onNavigate={(dir) => {
              const idx = items.findIndex(i => i.id === selectedItem.id);
              const next = dir === "prev" ? items[idx - 1] : items[idx + 1];
              if (next) setSelectedItem(next);
            }}
            hasPrev={items.findIndex(i => i.id === selectedItem.id) > 0}
            hasNext={items.findIndex(i => i.id === selectedItem.id) < items.length - 1}
          />
        )}
      </div>

      {/* ── DETAIL SHEET (mobile grid views) ────────────────────────────────── */}
      {selectedItem && (viewMode === "grid-sm" || viewMode === "grid-lg") && (
        <DetailSheet item={selectedItem} onClose={closeDetail} />
      )}

      {/* ── MOBILE DETAIL DRAWER ────────────────────────────────────────────── */}
      {mobileDrawerItem && (
        <MobileDetailDrawer item={mobileDrawerItem} onClose={closeMobileDrawer} />
      )}
    </div>
  );
}
