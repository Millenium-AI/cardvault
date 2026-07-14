import { useState, useRef, useEffect, useMemo } from "react";
import {
  Search,
  ChevronDown,
  CheckSquare,
  Download,
  RefreshCw,
} from "lucide-react";
import { useGameParam } from "@/lib/useGameParam";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useInventory } from "./hooks/useInventory";
import { useInventoryColumns } from "./hooks/useInventoryColumns";
import { useInventoryPersist } from "./hooks/useInventoryPersist";
import { useBulkSelect } from "./hooks/useBulkSelect";
import { InventoryRow } from "./ItemRow";
import { DraggableColHeader } from "./ColumnHeader";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { DetailPanel } from "./DetailPanel";
import { InventoryDetailSheet } from "./DetailSheet";
import { BulkActionsBar } from "./BulkActionsBar";
import { MobileCard } from "./MobileCard";
import { MobileDetailDrawer } from "./MobileDetailDrawer";
import { InventoryGridCard } from "./ItemGrid";
import { ViewModeToggle } from "./ViewModeToggle";
import { FiltersPanel } from "./FiltersPanel";
import { SortMenu } from "./SortMenu";
import type { InventoryItem } from "@shared/schema";
import type { SortField, SortDir, ViewMode, InventoryFilters } from "./constants";
import {
  COLUMN_LABELS, COLUMN_SORT_FIELD, EMPTY_FILTERS, SORT_OPTIONS,
  matchesFilters, sortItems, parseMeta, countActiveFilters,
} from "./constants";

export default function Inventory() {
  const [game] = useGameParam();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isDesktop = useBreakpoint("sm");

  /* ── search / filter / sort ──────────────────────────────────────────────── */
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_FILTERS);
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function updateFilters(patch: Partial<InventoryFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }
  function resetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  /* ── view mode ───────────────────────────────────────────────────────────── */
  const [viewMode, setViewMode] = useInventoryPersist<ViewMode>(
    "inventoryViewMode",
    "table"
  );

  /* ── detail panel ────────────────────────────────────────────────────────── */
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [mobileDrawerItem, setMobileDrawerItem] = useState<InventoryItem | null>(null);

  /* ── column order ────────────────────────────────────────────────────────── */
  const { columnOrder, setOrder } = useInventoryColumns();
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleColumnDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = columnOrder.indexOf(active.id as typeof columnOrder[number]);
    const to = columnOrder.indexOf(over.id as typeof columnOrder[number]);
    if (from < 0 || to < 0) return;
    setOrder(arrayMove(columnOrder, from, to));
  }

  /* ── bulk select ─────────────────────────────────────────────────────────── */
  const [selectMode, setSelectMode] = useState(false);
  const { selected, toggleOne, toggleAll, clearSelection } = useBulkSelect();

  /* ── data ────────────────────────────────────────────────────────────────── */
  const { data, isLoading, isError } = useInventory({ game });
  const rawItems: InventoryItem[] = data ?? [];

  // All searching / filtering / sorting happens client-side so every dimension
  // composes cleanly over a single fetch.
  const items = useMemo(() => {
    const filtered = rawItems.filter((i) => matchesFilters(i, parseMeta(i), filters, search));
    return sortItems(filtered, sortField, sortDir);
  }, [rawItems, filters, search, sortField, sortDir]);

  const activeFilterCount = countActiveFilters(filters);
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  /* ── helpers ─────────────────────────────────────────────────────────────── */
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  // From the Sort menu: numeric fields default to descending (biggest first),
  // text/date fields to ascending. Re-picking the active field flips direction.
  function handleSelectSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    const numeric = SORT_OPTIONS.find((o) => o.field === field)?.numeric;
    setSortField(field);
    setSortDir(numeric ? "desc" : "asc");
  }

  function openDetail(item: InventoryItem) {
    setSelectedItem(item);
  }

  function closeDetail() {
    setSelectedItem(null);
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
    const ids = selectMode && selected.size > 0 ? [...selected] : items.map((i) => i.id);
    if (ids.length === 0) return;

    const qs = ids.map((id) => `ids=${encodeURIComponent(id)}`).join("&");
    const url = `/api/labels/export?game=${game}&format=${format}&${qs}`;

    const res = await fetch(url);
    if (!res.ok) {
      alert("Export failed.");
      return;
    }

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `labels-${game}.${format}`;
    a.click();

    setExportMenuOpen(false);
  }

  /* ── price refresh ───────────────────────────────────────────────────────── */
  const [refreshing, setRefreshing] = useState(false);

  async function handlePriceRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const ids = selectMode && selected.size > 0 ? [...selected] : undefined;
      const res = await apiRequest("POST", "/api/prices/refresh", ids ? { ids } : {});
      const json = await res.json();
      toast({
        title: json.message ?? `Refreshed ${json.updated ?? 0} of ${json.total ?? 0} prices`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    } catch (e: any) {
      toast({ title: "Price refresh failed", description: e?.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }

  /* ── render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-3 flex flex-col gap-3">
        {/* Title */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
          <span className="text-xs text-muted-foreground">
            {isLoading ? "" : `${items.length} card${items.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {/* ── ROW 1: Search | Filters | Sort ──────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search cards…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 text-sm w-full"
              data-testid="input-search"
            />
          </div>

          <FiltersPanel
            filters={filters}
            onChange={updateFilters}
            onReset={resetFilters}
            activeCount={activeFilterCount}
            items={rawItems}
          />

          <SortMenu
            sortField={sortField}
            sortDir={sortDir}
            onSelect={handleSelectSort}
            onToggleDir={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          />
        </div>

        {/* ── ROW 2: Bulk Edit | Price Refresh | View Selection | Export Label ─ */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={selectMode ? "secondary" : "outline"}
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => {
              setSelectMode((v) => !v);
              clearSelection();
            }}
            data-testid="button-bulk-edit"
          >
            <CheckSquare size={14} />
            {selectMode ? "Cancel" : "Bulk Edit"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={handlePriceRefresh}
            disabled={refreshing}
            title={selectMode && selected.size > 0 ? "Refresh prices for selected" : "Refresh stale prices"}
            data-testid="button-price-refresh"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Price Refresh"}
          </Button>

          {/* View Selection */}
          <ViewModeToggle value={viewMode} onChange={setViewMode} />

          {/* Export Label */}
          <div className="relative ml-auto shrink-0" ref={exportMenuRef}>
            <Button
              data-testid="button-export-labels"
              size="sm"
              className="h-8 px-3 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              onClick={() => setExportMenuOpen((v) => !v)}
            >
              <Download size={13} />
              Export Label
              <ChevronDown size={11} className={`transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
            </Button>

            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-border bg-card shadow-lg py-1 animate-in fade-in-0 slide-in-from-top-1 duration-100">
                <button
                  onClick={() => handleExport("pdf")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent/30 transition-colors flex items-center gap-2"
                >
                  <Download size={13} />
                  Export as PDF
                </button>
                <button
                  onClick={() => handleExport("png")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent/30 transition-colors flex items-center gap-2"
                >
                  <Download size={13} />
                  Export as PNG
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── bulk selection sub-row (only when selecting) ────────────────── */}
        {selectMode && (
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => toggleAll(items.map((i) => i.id))}
            >
              {allSelected ? "Select None" : "Select All"}
            </Button>
            {selected.size > 0 && (
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            )}
          </div>
        )}

        {selectMode && selected.size > 0 && (
          <BulkActionsBar
            selectedIds={[...selected]}
            game={game}
            onDone={() => {
              clearSelection();
              setSelectMode(false);
            }}
          />
        )}
      </div>

      {/* ── TABLE VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === "table" && (
        <div className="rounded-lg border border-border/40 bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="px-4 py-12 text-center text-muted-foreground text-sm">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-12 text-center text-muted-foreground text-sm">{emptyMsg}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    {selectMode && <th className="w-8 px-3 py-2" />}
                    <DndContext
                      sensors={dndSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleColumnDragEnd}
                    >
                      <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                        {columnOrder.map((col) => (
                          <DraggableColHeader
                            key={col}
                            id={col}
                            onSort={COLUMN_SORT_FIELD[col] ? () => handleSort(COLUMN_SORT_FIELD[col]!) : undefined}
                            sortField={sortField}
                            sortDir={sortDir}
                          >
                            {COLUMN_LABELS[col]}
                          </DraggableColHeader>
                        ))}
                      </SortableContext>
                    </DndContext>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <InventoryRow
                      key={item.id}
                      item={item}
                      columnOrder={columnOrder}
                      selectMode={selectMode}
                      selected={selected.has(item.id)}
                      onSelect={(id: string) => toggleOne(id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── GRID SM VIEW ────────────────────────────────────────────────────── */}
      {viewMode === "grid-sm" &&
        (isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">{emptyMsg}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {items.map((item) => (
              <InventoryGridCard
                key={item.id}
                item={item}
                size="sm"
                selected={selected.has(item.id)}
                onSelect={toggleOne}
                selectMode={selectMode}
                onOpen={() => openDetail(item)}
              />
            ))}
          </div>
        ))}

      {/* ── GRID LG VIEW ────────────────────────────────────────────────────── */}
      {viewMode === "grid-lg" &&
        (isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">{emptyMsg}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {items.map((item) => (
              <InventoryGridCard
                key={item.id}
                item={item}
                size="lg"
                selected={selected.has(item.id)}
                onSelect={toggleOne}
                selectMode={selectMode}
                onOpen={() => openDetail(item)}
              />
            ))}
          </div>
        ))}

      {/* ── MOBILE CARD LIST (≤ sm, table mode) ────────────────────────────── */}
      <div className="sm:hidden">
        {viewMode === "table" &&
          items.map((item) => (
            <MobileCard
              key={item.id}
              item={item}
              selectMode={selectMode}
              selected={selected.has(item.id)}
              onSelect={toggleOne}
              onOpen={() => setMobileDrawerItem(item)}
            />
          ))}
      </div>

      {/* ── DETAIL PANEL (desktop popout modal) ─────────────────────────── */}
      {/* Gated on real viewport width (not CSS hidden classes) because Dialog
          renders via a portal into document.body — a CSS-hidden wrapper div
          around it does NOT stop the portaled content from showing. */}
      {isDesktop && selectedItem && (
        <DetailPanel
          item={selectedItem}
          onClose={closeDetail}
          onNavigate={(dir: "prev" | "next") => {
            const idx = items.findIndex((i) => i.id === selectedItem.id);
            const next = dir === "prev" ? items[idx - 1] : items[idx + 1];
            if (next) setSelectedItem(next);
          }}
          hasPrev={items.findIndex((i) => i.id === selectedItem.id) > 0}
          hasNext={items.findIndex((i) => i.id === selectedItem.id) < items.length - 1}
        />
      )}

      {/* ── DETAIL SHEET (mobile grid views) ──────────────────────────── */}
      {!isDesktop && (viewMode === "grid-sm" || viewMode === "grid-lg") && (
        <InventoryDetailSheet item={selectedItem} open={!!selectedItem} onClose={closeDetail} />
      )}

      {/* ── MOBILE DETAIL DRAWER ───────────────────────────────────────────── */}
      {mobileDrawerItem && (
        <MobileDetailDrawer item={mobileDrawerItem} onClose={closeMobileDrawer} />
      )}
    </div>
  );
}
