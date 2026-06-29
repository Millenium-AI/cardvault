import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getAuthHeader, queryClient } from "@/lib/queryClient";
import {
  Search, ChevronDown, TrendingUp, TrendingDown, ExternalLink,
  Check, X, Trash2, CheckSquare, Square, Minus, Pencil, Download,
  Tag, RefreshCcw, LayoutList, LayoutGrid, Grid2X2,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext, horizontalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { useGameParam } from "@/lib/useGameParam";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConditionBadge } from "@/components/ConditionBadge";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────
type LabelFilter = "all" | "needs_label" | "needs_repricing" | "label_created";
type ViewMode = "list" | "grid-sm" | "grid-lg";

// ── Column definitions ────────────────────────────────────────────────────────
const DEFAULT_COLUMN_ORDER = ["card", "condition", "game", "qty", "market", "print", "total"] as const;
type ColumnKey = typeof DEFAULT_COLUMN_ORDER[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  card:      "Card",
  condition: "Cond",
  game:      "Game",
  qty:       "Qty",
  market:    "Market $",
  print:     "Print $",
  total:     "Total",
};

// ── Draggable column header ───────────────────────────────────────────────────
function DraggableColHeader({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const transformStr = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX ?? 1}) scaleY(${transform.scaleY ?? 1})`
    : undefined;
  return (
    <th
      ref={setNodeRef}
      style={{ transform: transformStr, transition, opacity: isDragging ? 0.5 : 1 }}
      className="px-3 py-2.5 text-xs font-medium text-muted-foreground cursor-grab active:cursor-grabbing select-none whitespace-nowrap"
      {...attributes}
      {...listeners}
    >
      {children}
    </th>
  );
}

// ── Label status config ───────────────────────────────────────────────────────
const LABEL_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  needs_label:     { label: "Needs Label",     className: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: <Tag size={9} /> },
  needs_repricing: { label: "Needs Repricing", className: "bg-blue-500/15  text-blue-400  border-blue-500/30",  icon: <RefreshCcw size={9} /> },
  label_created:   { label: "Label Created",   className: "bg-green-500/15 text-green-400 border-green-500/30", icon: <Check size={9} /> },
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

// ── LabelStatusBadge ──────────────────────────────────────────────────────────
function LabelStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cfg = LABEL_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${cfg.className}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground">
      {children}
    </span>
  );
}

// ── ExpandedDetail (list mode inline) ─────────────────────────────────────────
function ExpandedDetail({
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
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" });
    },
  });

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(`Delete "${item.productName}"? This cannot be undone.`)) deleteMut.mutate();
  }

  const hasChips = meta.sourceSetName || meta.sourcePrinting || meta.sourceRarity;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-4" onClick={wrap}>
      {hasChips && (
        <div className="flex flex-wrap items-center gap-1.5">
          {meta.sourceSetName && <Chip>{meta.sourceSetName}</Chip>}
          {meta.sourcePrinting && <Chip>{meta.sourcePrinting}</Chip>}
          {meta.sourceRarity && <Chip>{meta.sourceRarity}</Chip>}
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
        <>
          <div className="flex items-center gap-2 pt-0.5">
            <Button data-testid="button-edit-item" variant="outline" size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={e => { e.stopPropagation(); setEditing(true); }}>
              <Pencil size={12} /> Edit item
            </Button>
            <Button data-testid="button-delete-item" variant="outline" size="sm"
              disabled={deleteMut.isPending}
              className="h-8 text-xs gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
              onClick={handleDelete}>
              <Trash2 size={12} /> {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
          {item.tcgplayerUrl ? (
            <a
              href={item.tcgplayerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center justify-center gap-1.5 w-full rounded-md border border-blue-500/40 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors mt-2"
            >
              View on TCGplayer <ExternalLink size={12} />
            </a>
          ) : (
            <div className="flex items-center justify-center gap-1.5 w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed mt-2">
              View on TCGplayer <ExternalLink size={12} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── ViewModeToggle ────────────────────────────────────────────────────────────
function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const modes: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "list",    icon: <LayoutList size={14} />, label: "List" },
    { mode: "grid-sm", icon: <LayoutGrid size={14} />, label: "Small Grid" },
    { mode: "grid-lg", icon: <Grid2X2 size={14} />,    label: "Large Grid" },
  ];
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
      {modes.map(({ mode, icon, label }) => (
        <button
          key={mode}
          title={label}
          onClick={() => onChange(mode)}
          className={`flex items-center justify-center h-8 w-8 transition-colors ${
            value === mode
              ? "bg-primary/15 text-primary border-primary/40"
              : "text-muted-foreground hover:text-foreground bg-transparent"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

// ── InventoryGridCard ─────────────────────────────────────────────────────────
function InventoryGridCard({
  item, size, selected, onSelect, selectMode, onOpen,
}: {
  item: any;
  size: "sm" | "lg";
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  selectMode: boolean;
  onOpen: () => void;
}) {
  const meta = (() => { try { return JSON.parse(item.matchMetadataJson || "{}"); } catch { return {}; } })();

  function handleClick() {
    if (selectMode) { onSelect(item.id, !selected); return; }
    onOpen();
  }

  if (size === "sm") {
    return (
      <div
        data-testid={`card-grid-sm-${item.id}`}
        onClick={handleClick}
        className={`relative stat-card p-2.5 cursor-pointer transition-colors ${
          selected ? "ring-1 ring-primary bg-primary/5" : "hover:bg-accent/20"
        }`}
      >
        {selectMode && (
          <div className="absolute top-2 left-2 z-10">
            {selected
              ? <CheckSquare size={15} className="text-primary drop-shadow" />
              : <Square size={15} className="text-muted-foreground" />}
          </div>
        )}
        <div className="flex justify-center mb-2">
          {item.photoUrl
            ? <img src={item.photoUrl} alt="" crossOrigin="anonymous" className="w-14 h-[78px] rounded object-contain bg-muted" />
            : <div className="w-14 h-[78px] rounded bg-muted" />}
        </div>
        <div className="text-xs font-medium text-foreground truncate leading-tight">{item.productName}</div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <ConditionBadge condition={item.condition} abbreviated />
          <LabelStatusBadge status={item.labelStatus} />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground font-mono">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
          <span className="text-[10px] font-mono font-bold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`card-grid-lg-${item.id}`}
      onClick={handleClick}
      className={`relative stat-card p-3 cursor-pointer transition-colors ${
        selected ? "ring-1 ring-primary bg-primary/5" : "hover:bg-accent/20"
      }`}
    >
      {selectMode && (
        <div className="absolute top-3 left-3 z-10">
          {selected
            ? <CheckSquare size={15} className="text-primary drop-shadow" />
            : <Square size={15} className="text-muted-foreground" />}
        </div>
      )}
      <div className="flex gap-3">
        <div className="shrink-0">
          {item.photoUrl
            ? <img src={item.photoUrl} alt="" crossOrigin="anonymous" className="w-[88px] h-[123px] rounded object-contain bg-muted" />
            : <div className="w-[88px] h-[123px] rounded bg-muted" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground line-clamp-2 leading-tight">{item.productName}</div>
          {meta.sourceSetName && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{meta.sourceSetName}</div>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <ConditionBadge condition={item.condition} abbreviated />
            <span className="text-[10px] text-muted-foreground capitalize">{item.game?.replace("-", " ")}</span>
          </div>
          <div className="mt-0.5">
            <LabelStatusBadge status={item.labelStatus} />
          </div>
          <div className="mt-2 space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Market</span>
              <span className="font-mono text-foreground">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Print</span>
              <span className="font-mono font-bold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Qty</span>
              <span className="font-mono text-foreground">{item.currentQuantity}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── InventoryDetailSheet (grid mode slide-over) ───────────────────────────────
function InventoryDetailSheet({
  item, open, onClose,
}: {
  item: any; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const meta = item ? (() => { try { return JSON.parse(item.matchMetadataJson || "{}"); } catch { return {}; } })() : {};

  useEffect(() => { if (!open) setEditing(false); }, [open]);

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
    onError: () => {
      toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" });
    },
  });

  function handleDelete() {
    if (confirm(`Delete "${item?.productName}"? This cannot be undone.`)) deleteMut.mutate();
  }

  if (!item) return null;
  const hasChips = meta.sourceSetName || meta.sourcePrinting || meta.sourceRarity;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
        {item.photoUrl && (
          <div className="w-full bg-muted/30 flex items-center justify-center pt-10">
            <img src={item.photoUrl} alt="" crossOrigin="anonymous"
              className="w-full max-h-48 object-contain rounded-lg" />
          </div>
        )}
        {!item.photoUrl && <div className="pt-10" />}

        <div className="p-5 space-y-4">
          <div>
            <div className="text-lg font-semibold text-foreground leading-tight pr-6">{item.productName}</div>
            {item.number && <div className="text-xs text-muted-foreground mt-0.5">#{item.number}</div>}
          </div>

          {hasChips && (
            <div className="flex flex-wrap gap-1.5">
              {meta.sourceSetName && <Chip>{meta.sourceSetName}</Chip>}
              {meta.sourcePrinting && <Chip>{meta.sourcePrinting}</Chip>}
              {meta.sourceRarity && <Chip>{meta.sourceRarity}</Chip>}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <ConditionBadge condition={item.condition} abbreviated />
            <span className="text-xs text-muted-foreground capitalize">{item.game?.replace("-", " ")}</span>
            <LabelStatusBadge status={item.labelStatus} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              { label: "Qty",    value: String(item.currentQuantity),                          highlight: false },
              { label: "Market", value: `$${item.currentRawMarketPrice?.toFixed(2) ?? "—"}`,   highlight: false },
              { label: "Print",  value: `$${item.currentRoundedPrintPrice ?? "—"}`,             highlight: true  },
            ] as const).map(({ label, value, highlight }) => (
              <div key={label} className="rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-center">
                <div className="text-[10px] text-muted-foreground">{label}</div>
                <div className={`text-sm font-mono font-semibold mt-0.5 ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
              </div>
            ))}
          </div>

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
            <>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 flex-1"
                  onClick={() => setEditing(true)}>
                  <Pencil size={12} /> Edit item
                </Button>
                <Button variant="outline" size="sm"
                  disabled={deleteMut.isPending}
                  className="h-8 text-xs gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                  onClick={handleDelete}>
                  <Trash2 size={12} /> {deleteMut.isPending ? "Deleting…" : "Delete"}
                </Button>
              </div>
              {item.tcgplayerUrl ? (
                <a
                  href={item.tcgplayerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full rounded-md border border-blue-500/40 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors"
                >
                  View on TCGplayer <ExternalLink size={14} />
                </a>
              ) : (
                <div className="flex items-center justify-center gap-1.5 w-full rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground opacity-40 cursor-not-allowed">
                  View on TCGplayer <ExternalLink size={14} />
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── BulkActionBar (floating) ──────────────────────────────────────────────────
function BulkActionBar({
  selectedIds, allCount, onSelectAll, onDeselectAll, onCancel,
}: {
  selectedIds: Set<string>;
  allCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [pendingCondition, setPendingCondition] = useState("");
  const [pendingQty, setPendingQty] = useState("");
  const ids = Array.from(selectedIds);
  const someSelected = selectedIds.size > 0;
  const allSelected = allCount > 0 && selectedIds.size === allCount;

  const bulkPatchMut = useMutation({
    mutationFn: async (patch: { condition?: string; currentQuantity?: number }) => {
      const res = await apiRequest("PATCH", "/api/inventory/bulk", { ids, ...patch });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Updated", description: `${ids.length} item${ids.length !== 1 ? "s" : ""} updated.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Bulk update failed.", variant: "destructive" });
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/inventory/bulk", { ids });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Deleted", description: `${ids.length} item${ids.length !== 1 ? "s" : ""} removed.` });
      onCancel();
    },
    onError: () => {
      toast({ title: "Error", description: "Bulk delete failed.", variant: "destructive" });
    },
  });

  function applyCondition(cond: string) {
    if (!cond || !someSelected) return;
    bulkPatchMut.mutate({ condition: cond });
    setPendingCondition("");
  }

  function applyQty() {
    const qty = parseInt(pendingQty, 10);
    if (isNaN(qty) || qty < 0 || !someSelected) return;
    bulkPatchMut.mutate({ currentQuantity: qty });
    setPendingQty("");
  }

  function handleDelete() {
    if (!someSelected) return;
    if (confirm(`Delete ${ids.length} item${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) {
      bulkDeleteMut.mutate();
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card shadow-xl px-4 py-2.5">
        <button
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
          title={allSelected ? "Deselect all" : "Select all"}
        >
          {allSelected
            ? <CheckSquare size={15} className="text-primary" />
            : <Square size={15} />}
        </button>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{selectedIds.size} selected</span>

        <div className="h-5 w-px bg-border" />

        <Select value={pendingCondition} onValueChange={applyCondition} disabled={bulkPatchMut.isPending || !someSelected}>
          <SelectTrigger className="h-7 text-xs w-[130px]">
            <SelectValue placeholder="Set condition…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Near Mint">NM</SelectItem>
            <SelectItem value="Lightly Played">LP</SelectItem>
            <SelectItem value="Moderately Played">MP</SelectItem>
            <SelectItem value="Heavily Played">HP</SelectItem>
            <SelectItem value="Damaged">DMG</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Input
            type="number"
            min="0"
            placeholder="Qty"
            value={pendingQty}
            onChange={e => setPendingQty(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applyQty()}
            className="h-7 w-14 text-xs font-mono px-2"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs px-2 shrink-0"
            onClick={applyQty}
            disabled={!pendingQty || !someSelected || bulkPatchMut.isPending}>
            Apply
          </Button>
        </div>

        <div className="h-5 w-px bg-border" />

        <Button size="sm" variant="ghost"
          className="h-7 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 shrink-0"
          onClick={handleDelete}
          disabled={!someSelected || bulkDeleteMut.isPending}>
          <Trash2 size={12} />{bulkDeleteMut.isPending ? "Deleting…" : "Delete"}
        </Button>

        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Exit bulk mode">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

// ── List mode row ─────────────────────────────────────────────────────────────
function InventoryRow({
  item, selected, onSelect, selectMode, columnOrder,
}: {
  item: any;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  selectMode: boolean;
  columnOrder: ColumnKey[];
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

  function renderCell(col: ColumnKey) {
    switch (col) {
      case "card": return (
        <td key="card" className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {selectMode ? (
              <button
                onClick={e => { e.stopPropagation(); onSelect(item.id, !selected); }}
                className="text-muted-foreground hover:text-primary transition-colors shrink-0"
              >
                {selected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
              </button>
            ) : (
              <ChevronDown
                size={13}
                className={`text-muted-foreground transition-transform duration-200 shrink-0 ${expanded ? "" : "-rotate-90"}`}
              />
            )}
            <div>
              <div className="text-sm font-medium text-foreground truncate max-w-[280px]">{item.productName}</div>
              <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                {item.number}{meta.sourceSetName ? ` · ${meta.sourceSetName}` : ""}
              </div>
            </div>
          </div>
        </td>
      );
      case "condition": return (
        <td key="condition" className="px-3 py-2.5 text-xs whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <ConditionBadge condition={item.condition} abbreviated />
            <LabelStatusBadge status={item.labelStatus} />
          </div>
        </td>
      );
      case "game": return (
        <td key="game" className="px-3 py-2.5 text-xs text-muted-foreground capitalize whitespace-nowrap">
          {item.game?.replace("-", " ")}
        </td>
      );
      case "qty": return (
        <td key="qty" className="px-3 py-2.5 text-center whitespace-nowrap">
          <span className="text-sm font-mono font-medium text-foreground">{item.currentQuantity}</span>
        </td>
      );
      case "market": return (
        <td key="market" className="px-3 py-2.5 text-right whitespace-nowrap">
          <span className="text-sm font-mono text-foreground">${item.currentRawMarketPrice?.toFixed(2) ?? "—"}</span>
        </td>
      );
      case "print": return (
        <td key="print" className="px-3 py-2.5 text-right whitespace-nowrap">
          <span className="text-sm font-mono font-semibold text-primary">${item.currentRoundedPrintPrice ?? "—"}</span>
        </td>
      );
      case "total": return (
        <td key="total" className="px-3 py-2.5 text-right whitespace-nowrap">
          <span className="text-sm font-mono text-muted-foreground">
            ${((item.currentRawMarketPrice || 0) * item.currentQuantity).toFixed(2)}
          </span>
        </td>
      );
      default: return null;
    }
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
        {columnOrder.map(col => renderCell(col))}
      </tr>
      {expanded && !selectMode && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={columnOrder.length} className="px-4 py-3">
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
  const [selectedGame, setSelectedGame] = useGameParam();
  const game = selectedGame ?? "all";
  const [condition, setCondition] = useState("all");
  const [sortBy, setSortBy] = useState("lastSeenAt");
  const [labelFilter, setLabelFilter] = useState<LabelFilter>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("inventory-view-mode") as ViewMode) || "list"; } catch { return "list"; }
  });

  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>([...DEFAULT_COLUMN_ORDER]);

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    apiRequest("GET", "/api/settings/inventory-columns")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.order)) setColumnOrder(d.order as ColumnKey[]); })
      .catch(() => {});
  }, []);

  function handleColumnReorder(newOrder: ColumnKey[]) {
    setColumnOrder(newOrder);
    apiRequest("POST", "/api/settings/inventory-columns", { order: newOrder }).catch(() => {});
  }

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [sheetItem, setSheetItem] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleViewMode(v: ViewMode) {
    setViewMode(v);
    try { localStorage.setItem("inventory-view-mode", v); } catch { }
  }

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
    if (sortBy === "price")    return (b.currentRawMarketPrice || 0) - (a.currentRawMarketPrice || 0);
    if (sortBy === "quantity") return b.currentQuantity - a.currentQuantity;
    if (sortBy === "value")    return ((b.currentRawMarketPrice || 0) * b.currentQuantity) - ((a.currentRawMarketPrice || 0) * a.currentQuantity);
    if (sortBy === "name")     return a.productName.localeCompare(b.productName);
    return b.lastSeenAt?.localeCompare(a.lastSeenAt || "") || 0;
  });

  const sorted = labelFilter === "all"
    ? sortedAll
    : sortedAll.filter((i: any) => i.labelStatus === labelFilter);

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

  function selectAll()    { setSelectedIds(new Set(sorted.map((i: any) => i.id))); }
  function deselectAll()  { setSelectedIds(new Set()); }
  function exitSelectMode() { setSelectMode(false); setSelectedIds(new Set()); }

  const someSelected = selectedIds.size > 0;

  function openSheet(item: any) {
    setSheetItem(item);
    setSheetOpen(true);
  }

  const liveSheetItem = sheetItem
    ? (items.find((i: any) => i.id === sheetItem.id) ?? sheetItem)
    : null;

  const emptyMsg = "No inventory — upload a CSV to get started";

  return (
    <div>
      {/* ── Row 1: Page header ───────────────────────────────────────────── */}
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

      {/* ── Row 2: Search + filters ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[150px] max-w-[260px]">
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
          <SelectTrigger data-testid="select-filter-condition" className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="All Conditions" />
          </SelectTrigger>
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
          variant={selectMode ? "default" : "outline"}
          className="h-9 px-3 text-xs gap-1.5"
          onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
        >
          <CheckSquare size={14} />
          {selectMode ? "Cancel" : "Bulk Edit"}
        </Button>
      </div>

      {/* ── Row 3: Label pills + view toggle + export ────────────────────── */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {(
          [
            { key: "all",             label: "All",             count: items.length },
            { key: "needs_label",     label: "Needs Label",     count: labelCounts.needs_label,     className: "text-amber-400" },
            { key: "needs_repricing", label: "Needs Repricing", count: labelCounts.needs_repricing, className: "text-blue-400" },
            { key: "label_created",   label: "Label Created",   count: labelCounts.label_created,   className: "text-green-400" },
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

        <div className="flex-1" />

        <ViewModeToggle value={viewMode} onChange={handleViewMode} />

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
              <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => exportMut.mutate({ format: "xlsx", stickerMode: "single" })}>Single-side labels</button>
              <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => exportMut.mutate({ format: "xlsx", stickerMode: "dual" })}>Dual A/B labels</button>
              <div className="my-1 border-t border-border" />
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CSV (Mac)</div>
              <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => exportMut.mutate({ format: "csv", stickerMode: "single" })}>Single-side CSV</button>
              <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                onClick={() => exportMut.mutate({ format: "csv", stickerMode: "dual" })}>Dual A/B CSV</button>
            </div>
          )}
        </div>
      </div>

      {/* ── List view ────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <div className="stat-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event: DragEndEvent) => {
                    const { active, over } = event;
                    if (over && active.id !== over.id) {
                      const oldIndex = columnOrder.indexOf(active.id as ColumnKey);
                      const newIndex = columnOrder.indexOf(over.id as ColumnKey);
                      handleColumnReorder(arrayMove(columnOrder, oldIndex, newIndex));
                    }
                  }}
                >
                  <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                    <tr className="border-b border-border bg-muted/40">
                      {columnOrder.map(col => (
                        col === "card" ? (
                          <DraggableColHeader key="card" id="card">
                            <div className="flex items-center gap-2">
                              {selectMode && (
                                <button
                                  onClick={e => { e.stopPropagation(); (selectedIds.size === sorted.length && sorted.length > 0 ? deselectAll : selectAll)(); }}
                                  className="text-muted-foreground hover:text-primary transition-colors"
                                  onPointerDown={e => e.stopPropagation()}
                                >
                                  {selectedIds.size === sorted.length && sorted.length > 0
                                    ? <CheckSquare size={14} className="text-primary" />
                                    : someSelected ? <CheckSquare size={14} className="text-primary/50" /> : <Square size={14} />}
                                </button>
                              )}
                              {COLUMN_LABELS.card}
                            </div>
                          </DraggableColHeader>
                        ) : (
                          <DraggableColHeader key={col} id={col}>
                            {COLUMN_LABELS[col]}
                          </DraggableColHeader>
                        )
                      ))}
                    </tr>
                  </SortableContext>
                </DndContext>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td colSpan={columnOrder.length} className="px-3 py-2.5"><Skeleton className="h-10 w-full" /></td>
                      </tr>
                    ))
                  : sorted.length === 0
                  ? <tr><td colSpan={columnOrder.length} className="px-3 py-12 text-center text-muted-foreground text-sm">{emptyMsg}</td></tr>
                  : sorted.map((item: any) => (
                      <InventoryRow key={item.id} item={item} selected={selectedIds.has(item.id)} onSelect={handleSelect} selectMode={selectMode} columnOrder={columnOrder} />
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Small grid view ──────────────────────────────────────────────── */}
      {viewMode === "grid-sm" && (
        isLoading
          ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
            </div>
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

      {/* ── Large grid view ──────────────────────────────────────────────── */}
      {viewMode === "grid-lg" && (
        isLoading
          ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}
            </div>
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

      {/* ── Grid detail sheet ─────────────────────────────────────────────── */}
      <InventoryDetailSheet
        item={liveSheetItem}
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSheetItem(null); }}
      />

      {/* ── Floating bulk action bar ─────────────────────────────────────── */}
      {selectMode && (
        <BulkActionBar
          selectedIds={selectedIds}
          allCount={sorted.length}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onCancel={exitSelectMode}
        />
      )}
    </div>
  );
}
