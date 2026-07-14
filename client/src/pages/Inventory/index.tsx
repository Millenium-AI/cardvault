import { useState, useRef, useEffect } from "react";
import {
  Search,
  ChevronDown,
  CheckSquare,
  Download,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import { useGameParam } from "@/lib/useGameParam";
import { useBreakpoint } from "@/hooks/use-breakpoint";
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
import type { InventoryItem } from "@shared/schema";
import type { LabelFilter, SortField, SortDir, ViewMode } from "./constants";
import { LABEL_FILTER_OPTIONS, COLUMN_LABELS, COLUMN_SORT_FIELD, CONDITION_OPTIONS } from "./constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Inventory() {
  const [game] = useGameParam();
  const queryClient = useQueryClient();
  const isDesktop = useBreakpoint("sm");

  /* ── search / filter / sort ──────────────────────────────────────────────── */
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState<LabelFilter>("all");
  const [conditionFilter, setConditionFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFilters, setShowFilters] = useState(false);

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
  const { data, isLoading, isError } = useInventory({
    game,
    search,
    labelFilter,
    condition: conditionFilter,
    sortField,
    sortDir,
  });
  const items: InventoryItem[] = data ?? [];

  /* ── label options with counts ───────────────────────────────────────────── */
  const activeFilterCount = (search ? 1 : 0) + (labelFilter !== "all" ? 1 : 0) + (conditionFilter !== "all" ? 1 : 0);
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  function clearAllFilters() {
    setSearch("");
    setLabelFilter("all");
    setConditionFilter("all");
  }

  /* ── helpers ─────────────────────────────────────────────────────────────── */
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal size={15} />
            </Button>
          </div>
        </div>

        {/* Categories: search + bulk edit */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Categories</span>
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search cards…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-9 text-sm w-full"
            />
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/20 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            <Select value={conditionFilter} onValueChange={setConditionFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All conditions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All conditions</SelectItem>
                {CONDITION_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={labelFilter} onValueChange={(v) => setLabelFilter(v as LabelFilter)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All labels" /></SelectTrigger>
              <SelectContent>
                {LABEL_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-xs self-start" onClick={clearAllFilters}>
                Clear filters ({activeFilterCount})
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={() => {
              setSelectMode((v) => !v);
              clearSelection();
            }}
          >
            <CheckSquare size={14} />
            {selectMode ? "Cancel" : "Bulk Edit"}
          </Button>
          {selectMode && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => toggleAll(items.map((i) => i.id))}
            >
              {allSelected ? "Select None" : "Select All"}
            </Button>
          )}
          {selectMode && selected.size > 0 && (
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          )}
        </div>
      </div>

      {/* ── DESKTOP HEADER (≥ sm) ───────────────────────────────────────────── */}
      <div className="hidden sm:flex px-4 pt-4 pb-3 flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">Inventory</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Refresh"
              onClick={handleRefresh}
            >
              <RefreshCw size={15} />
            </Button>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <Button
              variant={showFilters ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              title="Filters"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal size={15} />
            </Button>
          </div>
        </div>

        {/* Categories row: filters + bulk edit on the left, export on the right */}
        <div className="flex items-center gap-3 flex-wrap mb-2">
          {/* Left: Categories label + filter controls + bulk edit */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">Categories</span>

            <div className="relative min-w-[160px] max-w-xs flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search cards…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>

            {showFilters && (
              <>
                <Select value={conditionFilter} onValueChange={setConditionFilter}>
                  <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="All conditions" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All conditions</SelectItem>
                    {CONDITION_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={labelFilter} onValueChange={(v) => setLabelFilter(v as LabelFilter)}>
                  <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="All labels" /></SelectTrigger>
                  <SelectContent>
                    {LABEL_FILTER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearAllFilters}>
                Clear filters ({activeFilterCount})
                  </Button>
                )}
              </>
            )}

            <div className="w-px h-6 bg-border shrink-0" />

            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5"
              onClick={() => {
                setSelectMode((v) => !v);
                clearSelection();
              }}
            >
              <CheckSquare size={14} />
              {selectMode ? "Cancel" : "Bulk Edit"}
            </Button>

            {selectMode && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => toggleAll(items.map((i) => i.id))}
              >
                {allSelected ? "Select None" : "Select All"}
              </Button>
            )}

            {selectMode && selected.size > 0 && (
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            )}
          </div>

          {/* Right: Export Labels */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <div className="relative" ref={exportMenuRef}>
              <Button
                data-testid="button-export-labels"
                size="sm"
                className="h-8 px-3 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                onClick={() => setExportMenuOpen((v) => !v)}
              >
                <Download size={13} />
                Export Labels
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
        </div>

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