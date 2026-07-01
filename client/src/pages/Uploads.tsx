import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeader } from "@/lib/queryClient";
import { Upload, CheckCircle, XCircle, ChevronDown, ChevronRight, FileText, Clock, Trash2, Search, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

const statusColors: Record<string, string> = {
  pending: "text-primary bg-primary/10",
  parsed: "text-sky-400 bg-sky-400/10",
  merged: "text-emerald-400 bg-emerald-400/10",
  failed: "text-red-400 bg-red-400/10",
  rejected: "text-muted-foreground bg-muted",
};

// ── Game list ─────────────────────────────────────────────────────────────────

const GAMES: { value: string; label: string }[] = [
  { value: "pokemon",    label: "Pokémon" },
  { value: "pokemon-jp", label: "Pokémon JP" },
  { value: "one-piece",  label: "One Piece" },
  { value: "sorcery",    label: "Sorcery" },
  { value: "dragon-ball",label: "Dragon Ball" },
  { value: "mtg",        label: "MTG" },
  { value: "star-wars",  label: "Star Wars" },
  { value: "other",      label: "Other" },
];

// ── Auto-detect game from CSV/XLSX headers + first data row ──────────────────

/**
 * Reads just enough of the file to extract the header row and first data row,
 * then maps the "Product Line" value to one of our game slugs.
 * Returns null if detection fails or the file is XLSX (handled separately).
 */
async function detectGameFromFile(file: File): Promise<string | null> {
  try {
    const isXlsx =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    let productLine = "";

    if (isXlsx) {
      // For XLSX we dynamically import xlsx (already a dep) and read sheet row 1
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", sheetRows: 2 });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      if (rows.length > 0) {
        productLine =
          String(rows[0]["Product Line"] ?? rows[0]["product_line"] ?? rows[0]["Game"] ?? "");
      }
    } else {
      // CSV: read first 4KB — enough for header + first data row
      const slice = file.slice(0, 4096);
      const text = await slice.text();
      const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return null;

      // Parse header row
      const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
      const plIdx = headers.findIndex(
        h => h.toLowerCase() === "product line" || h.toLowerCase() === "product_line" || h.toLowerCase() === "game"
      );
      if (plIdx === -1) return null;

      // Parse first data row
      const values = lines[1].split(",").map(v => v.replace(/^"|"$/g, "").trim());
      productLine = values[plIdx] ?? "";
    }

    return mapProductLineToSlug(productLine);
  } catch {
    return null;
  }
}

function mapProductLineToSlug(productLine: string): string | null {
  const pl = productLine.toLowerCase();
  if (pl.includes("one piece"))                             return "one-piece";
  if (pl.includes("pokemon") || pl.includes("pokémon")) {
    // JP indicator: Japanese language marker or explicit "jp"
    if (pl.includes("japan") || pl.includes(" jp") || pl.includes("(jp)")) return "pokemon-jp";
    return "pokemon";
  }
  if (pl.includes("sorcery"))                               return "sorcery";
  if (pl.includes("dragon ball"))                           return "dragon-ball";
  if (pl.includes("magic") || pl === "mtg")                 return "mtg";
  if (pl.includes("star wars"))                             return "star-wars";
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if every row in the array has a falsy number field */
function allBlankNumbers(rows: any[]): boolean {
  return rows.length > 0 && rows.every(r => !r.number);
}

/** Sort rows by productName A→Z, then by number numerically when present */
function sortByName(rows: any[]): any[] {
  return [...rows].sort((a, b) => {
    const na = (a.productName || "").toLowerCase();
    const nb = (b.productName || "").toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    const numA = parseFloat(a.number) || 0;
    const numB = parseFloat(b.number) || 0;
    return numA - numB;
  });
}

function sortByPrice(rows: any[], key: string): any[] {
  return [...rows].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
}

function sortByQty(rows: any[]): any[] {
  return [...rows].sort((a, b) => (b.addToQuantity ?? b.csvQty ?? 0) - (a.addToQuantity ?? a.csvQty ?? 0));
}

function applySort(rows: any[], sort: string): any[] {
  if (sort === "name") return sortByName(rows);
  if (sort === "price_desc") return sortByPrice(rows, "rawMarketPrice");
  if (sort === "qty_desc") return sortByQty(rows);
  return rows; // "default" = server order
}

function applySearch(rows: any[], q: string): any[] {
  if (!q.trim()) return rows;
  const lower = q.toLowerCase();
  return rows.filter(r =>
    (r.productName || "").toLowerCase().includes(lower) ||
    (r.number || "").toLowerCase().includes(lower) ||
    (r.condition || "").toLowerCase().includes(lower)
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExpandableSection({ title, count, color, children }: any) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${color}`}>{count}</span>
        </div>
      </button>
      {open && <div className="border-t border-border overflow-x-auto">{children}</div>}
    </div>
  );
}

/** Inline filter + sort bar shown inside the review panel */
function ReviewFilterBar({
  search, onSearch,
  sort, onSort,
  totalVisible, totalAll,
}: {
  search: string; onSearch: (v: string) => void;
  sort: string; onSort: (v: string) => void;
  totalVisible: number; totalAll: number;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-3 p-2.5 rounded-lg bg-muted/30 border border-border/60">
      {/* Search */}
      <div className="relative flex-1 min-w-[140px]">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, card #, or condition…"
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="w-full pl-7 pr-3 h-7 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-colors"
        />
      </div>

      {/* Sort */}
      <div className="flex items-center gap-1.5 shrink-0">
        <ArrowUpDown size={11} className="text-muted-foreground" />
        <Select value={sort} onValueChange={onSort}>
          <SelectTrigger className="h-7 text-xs w-[130px] border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A→Z</SelectItem>
            <SelectItem value="price_desc">Price High→Low</SelectItem>
            <SelectItem value="qty_desc">Qty High→Low</SelectItem>
            <SelectItem value="default">Default order</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Row count badge */}
      {search.trim() && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {totalVisible}/{totalAll}
        </span>
      )}
    </div>
  );
}

function ReviewDetail({ review, uploadId, onDone }: { review: any; uploadId: string; onDone: () => void }) {
  const { toast } = useToast();
  const payload = (() => { try { return JSON.parse(review.reviewPayload || "{}"); } catch { return {}; } })();

  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [gameOverrides, setGameOverrides] = useState<Record<string, string>>({});
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  const [conditionOverrides, setConditionOverrides] = useState<Record<string, string>>({});
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editGame, setEditGame] = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [editQty, setEditQty] = useState(0);
  const [editPrice, setEditPrice] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("name");

  function setQtyOverride(rowId: string, val: number) { setQtyOverrides(prev => ({ ...prev, [rowId]: val })); }
  function setGameOverride(rowId: string, val: string) { setGameOverrides(prev => ({ ...prev, [rowId]: val })); }
  function setConditionOverride(rowId: string, val: string) { setConditionOverrides(prev => ({ ...prev, [rowId]: val })); }
  function setPriceOverride(rowId: string, val: number) { setPriceOverrides(prev => ({ ...prev, [rowId]: val })); }

  // Pre-process all row arrays: default sort A→Z on first render, then filter/sort reactively
  const newItemsProcessed = useMemo(() => {
    const base = sortByName(payload.newItems || []);
    return applySearch(applySort(base, sort), search);
  }, [payload.newItems, sort, search]);

  const matchedItemsRaw = useMemo(() => sortByName(payload.matchedItems || []), [payload.matchedItems]);
  const matchedChanged = useMemo(() =>
    applySearch(applySort(matchedItemsRaw.filter((r: any) =>
      (qtyOverrides[r.rowId] ?? r.csvQty ?? r.existingQty) !== r.existingQty
    ), sort), search),
    [matchedItemsRaw, qtyOverrides, sort, search]
  );
  const matchedUnchanged = useMemo(() =>
    applySearch(applySort(matchedItemsRaw.filter((r: any) => r.qtyDelta === 0), sort), search),
    [matchedItemsRaw, sort, search]
  );
  const repricingProcessed = useMemo(() => {
    const base = sortByName(payload.repricingCandidates || []);
    return applySearch(applySort(base, sort), search);
  }, [payload.repricingCandidates, sort, search]);

  // Total across all sections for the badge
  const totalAll = (payload.newItems?.length ?? 0) + (payload.matchedItems?.length ?? 0) + (payload.repricingCandidates?.length ?? 0);
  const totalVisible = newItemsProcessed.length + matchedChanged.length + matchedUnchanged.length + repricingProcessed.length;

  // Detect if all rows across new items have blank numbers (e.g. Sorcery)
  const hideNumberCol = allBlankNumbers([
    ...(payload.newItems || []),
    ...(payload.matchedItems || []),
    ...(payload.repricingCandidates || []),
  ]);

  const approveMut = useMutation({
    mutationFn: async () => {
      const overrides: Record<string, any> = {};
      Object.keys(qtyOverrides).forEach(id => {
        overrides[id] = { ...overrides[id], csvQty: qtyOverrides[id] };
      });
      Object.keys(gameOverrides).forEach(id => {
        overrides[id] = { ...overrides[id], game: gameOverrides[id] };
      });
      Object.keys(conditionOverrides).forEach(id => {
        overrides[id] = { ...overrides[id], condition: conditionOverrides[id] };
      });
      Object.keys(priceOverrides).forEach(id => {
        overrides[id] = { ...overrides[id], rawMarketPrice: priceOverrides[id] };
      });
      const res = await apiRequest("POST", `/api/uploads/${uploadId}/approve`, { overrides });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approve failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/labels/new"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Merge approved", description: "Inventory updated successfully." });
      onDone();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/uploads/${uploadId}/reject`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reject failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      toast({ title: "Upload rejected" });
      onDone();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  type Col = { key: string; label: string; render?: (v: any) => any };

  const MiniTable = ({ rows, cols }: { rows: any[]; cols: Col[] }) => {
    // Dynamically strip the # column if hideNumberCol is true
    const visibleCols = hideNumberCol ? cols.filter(c => c.key !== "number") : cols;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[420px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {visibleCols.map(c => (
                <th key={c.key} className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap tracking-wide uppercase text-[10px]">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={visibleCols.length} className="px-4 py-4 text-center text-muted-foreground text-xs">No results</td></tr>
            ) : rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors">
                {visibleCols.map(c => (
                  <td key={c.key} className="px-4 py-2.5 text-foreground whitespace-nowrap">
                    {c.render ? c.render(row) : row[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
          <div className="text-2xl font-bold tabular-nums text-emerald-400 leading-none">{review.newItemCount ?? 0}</div>
          <div className="text-xs font-medium text-muted-foreground">New items</div>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-sky-500/20 bg-sky-500/8 px-4 py-3">
          <div className="text-2xl font-bold tabular-nums text-sky-400 leading-none">{review.matchedItemCount ?? 0}</div>
          <div className="text-xs font-medium text-muted-foreground">Qty changes</div>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
          <div className="text-2xl font-bold tabular-nums text-amber-400 leading-none">{review.repricingCandidateCount ?? 0}</div>
          <div className="text-xs font-medium text-muted-foreground">Reprice alerts</div>
        </div>
      </div>

      {/* Filter / sort bar */}
      <ReviewFilterBar
        search={search} onSearch={setSearch}
        sort={sort} onSort={setSort}
        totalVisible={totalVisible} totalAll={totalAll}
      />

      {/* Expandable sections */}
      <div className="space-y-2">
        <ExpandableSection title="New Items" count={newItemsProcessed.length} color="bg-emerald-500/10 text-emerald-400">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {(hideNumberCol
                    ? ["Game","Product Name","Cond","Market $","Print $","Qty",""]
                    : ["Game","Product Name","#","Cond","Market $","Print $","Qty",""]
                  ).map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground tracking-wide uppercase text-[10px] whitespace-nowrap">{h || ""}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {newItemsProcessed.length === 0 ? (
                  <tr><td colSpan={hideNumberCol ? 7 : 8} className="px-4 py-4 text-center text-muted-foreground text-xs">No results</td></tr>
                ) : newItemsProcessed.map((row: any, i: number) => {
                  const hasEdit = gameOverrides[row.id] || conditionOverrides[row.id] || priceOverrides[row.id];
                  return (
                    <tr key={i} className={cn("border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors", hasEdit && "bg-amber-500/5")}>
                      <td className="px-3 py-2 text-foreground">{gameOverrides[row.id] ?? row.game ?? "—"}</td>
                      <td className="px-3 py-2 text-foreground max-w-[160px] truncate">{row.productName}</td>
                      {!hideNumberCol && <td className="px-3 py-2 text-foreground">{row.number || "—"}</td>}
                      <td className="px-3 py-2 text-foreground">{conditionOverrides[row.id] ?? row.condition ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-foreground">{row.rawMarketPrice ? `$${Number(row.rawMarketPrice).toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-foreground">{row.roundedPrintPrice ? `$${row.roundedPrintPrice}` : "—"}</td>
                      <td className="px-3 py-2 text-foreground">{row.addToQuantity || 0}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => { setEditingRowId(row.id); setEditGame(gameOverrides[row.id] ?? row.game ?? ""); setEditCondition(conditionOverrides[row.id] ?? row.condition ?? ""); setEditQty(row.addToQuantity || 0); setEditPrice((priceOverrides[row.id] ?? row.rawMarketPrice) ? String(priceOverrides[row.id] ?? row.rawMarketPrice) : ""); }} className="text-xs px-2 py-1 rounded border border-border hover:border-primary hover:bg-primary/10 transition-colors">Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ExpandableSection>

        <ExpandableSection
          title="Quantity Changes"
          count={matchedChanged.length}
          color="bg-sky-500/10 text-sky-400"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {(hideNumberCol
                    ? ["Game","Product Name","Cond","Cur Qty","CSV Qty","Change","Old $","New $",""]
                    : ["Game","Product Name","#","Cond","Cur Qty","CSV Qty","Change","Old $","New $",""]
                  ).map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground tracking-wide uppercase text-[10px] whitespace-nowrap">{h || ""}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matchedChanged.length === 0 ? (
                  <tr><td colSpan={hideNumberCol ? 9 : 10} className="px-4 py-4 text-center text-muted-foreground text-xs">No results</td></tr>
                ) : matchedChanged.map((row: any, i: number) => {
                  const overrideQty = qtyOverrides[row.rowId];
                  const effectiveQty = overrideQty ?? row.csvQty ?? row.existingQty ?? 0;
                  const delta = effectiveQty - (row.existingQty || 0);
                  const hasEdit = overrideQty !== undefined || gameOverrides[row.rowId] || conditionOverrides[row.rowId] || priceOverrides[row.rowId];
                  return (
                    <tr key={i} className={cn("border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors", hasEdit && "bg-amber-500/5")}>
                      <td className="px-3 py-2 text-foreground">{gameOverrides[row.rowId] ?? row.game ?? "—"}</td>
                      <td className="px-3 py-2 text-foreground max-w-[160px] truncate">{row.productName}</td>
                      {!hideNumberCol && <td className="px-3 py-2 text-foreground">{row.number || "—"}</td>}
                      <td className="px-3 py-2 text-foreground">{conditionOverrides[row.rowId] ?? row.condition ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-foreground">{row.existingQty ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-foreground">{effectiveQty}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-semibold tabular-nums">
                        {delta === 0 ? <span className="text-muted-foreground">—</span> : <span className={delta > 0 ? "text-emerald-400" : "text-red-400"}>{delta > 0 ? `+${delta}` : delta}</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.existingPrice ? `$${Number(row.existingPrice).toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-foreground">{priceOverrides[row.rowId] ? `$${Number(priceOverrides[row.rowId]).toFixed(2)}` : (row.rawMarketPrice ? `$${Number(row.rawMarketPrice).toFixed(2)}` : "—")}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => { setEditingRowId(row.rowId); setEditGame(gameOverrides[row.rowId] ?? row.game ?? ""); setEditCondition(conditionOverrides[row.rowId] ?? row.condition ?? ""); setEditQty(overrideQty ?? row.csvQty ?? row.existingQty ?? 0); setEditPrice((priceOverrides[row.rowId] ?? row.rawMarketPrice) ? String(priceOverrides[row.rowId] ?? row.rawMarketPrice) : ""); }} className="text-xs px-2 py-1 rounded border border-border hover:border-primary hover:bg-primary/10 transition-colors">Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ExpandableSection>

        {matchedUnchanged.length > 0 && (
          <ExpandableSection
            title="Confirmed Unchanged"
            count={matchedUnchanged.length}
            color="bg-muted/60 text-muted-foreground"
          >
            <MiniTable
              rows={matchedUnchanged}
              cols={[
                { key: "productName", label: "Product Name" },
                { key: "number", label: "#" },
                { key: "condition", label: "Cond" },
                { key: "existingQty", label: "Qty", render: (r: any) => <span className="text-muted-foreground tabular-nums">{r.existingQty}</span> },
                { key: "existingPrice", label: "Price", render: (r: any) => r.existingPrice ? `$${Number(r.existingPrice).toFixed(2)}` : "—" },
              ]}
            />
          </ExpandableSection>
        )}

        <ExpandableSection title="Repricing Candidates" count={repricingProcessed.length} color="bg-amber-500/10 text-amber-400">
          <MiniTable
            rows={repricingProcessed}
            cols={[
              { key: "productName", label: "Product Name" },
              { key: "priorPrice", label: "Prior $", render: (r: any) => r.priorPrice ? `$${Number(r.priorPrice).toFixed(2)}` : "—" },
              { key: "newPrice", label: "New $", render: (r: any) => r.newPrice ? `$${Number(r.newPrice).toFixed(2)}` : "—" },
              { key: "percentChange", label: "Change", render: (r: any) => r.percentChange ? `${r.percentChange}%` : "—" },
              { key: "rule", label: "Rule" },
            ]}
          />
        </ExpandableSection>
      </div>

      {/* Edit modal */}
      {editingRowId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg shadow-lg max-w-sm w-full p-5 space-y-4">
            <div className="text-sm font-semibold">Edit Item</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Game</label>
                <input type="text" value={editGame} onChange={e => setEditGame(e.target.value)} className="w-full h-8 px-2 mt-1 text-xs rounded border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Condition</label>
                <input type="text" value={editCondition} onChange={e => setEditCondition(e.target.value)} className="w-full h-8 px-2 mt-1 text-xs rounded border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Quantity</label>
                <input type="number" min={0} value={editQty} onChange={e => setEditQty(Math.max(0, parseInt(e.target.value) || 0))} className="w-full h-8 px-2 mt-1 text-xs rounded border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Market Price</label>
                <input type="text" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="0.00" className="w-full h-8 px-2 mt-1 text-xs rounded border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button size="sm" onClick={() => { if (editGame) setGameOverride(editingRowId, editGame); if (editCondition) setConditionOverride(editingRowId, editCondition); setQtyOverride(editingRowId, editQty); if (editPrice) setPriceOverride(editingRowId, parseFloat(editPrice) || 0); setEditingRowId(null); }} className="gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 px-3">Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditingRowId(null)} className="text-xs h-8 px-3">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {review.status === "pending" && (
        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <Button
            data-testid="button-approve-merge"
            onClick={() => approveMut.mutate()}
            disabled={approveMut.isPending}
            className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white h-10 px-5 font-semibold"
          >
            <CheckCircle size={15} />
            {approveMut.isPending ? "Merging…" : "Approve Merge"}
          </Button>
          <Button
            data-testid="button-reject-merge"
            variant="outline"
            onClick={() => rejectMut.mutate()}
            disabled={rejectMut.isPending}
            className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 h-10 px-5 font-semibold"
          >
            <XCircle size={15} />
            Reject
          </Button>
        </div>
      )}
      {review.status !== "pending" && (
        <div className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold mt-1", statusColors[review.status] || "text-muted-foreground")}>
          {review.status === "approved" || review.status === "merged" ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {review.status.charAt(0).toUpperCase() + review.status.slice(1)}
        </div>
      )}
    </div>
  );
}

// ── Upload progress bar ───────────────────────────────────────────────────────
function UploadProgress({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Uploads() {
  const [game, setGame] = useState("pokemon");
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; pct: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  useEffect(() => () => { sseRef.current?.close(); }, []);

  const { data: uploads = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/uploads"] });

  const { data: selectedReview, isLoading: reviewLoading } = useQuery<any>({
    queryKey: ["/api/uploads", selectedUploadId, "review"],
    queryFn: async () => {
      if (!selectedUploadId) return null;
      const res = await apiRequest("GET", `/api/uploads/${selectedUploadId}/review`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load review");
      return data;
    },
    enabled: !!selectedUploadId,
    retry: false,
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const authHeader = await getAuthHeader();
      const API_BASE = ("__PORT_5000__" as string).startsWith("__") ? "" : "__PORT_5000__";

      const tokenRes = await fetch(`${API_BASE}/api/uploads/progress-token`, {
        method: "POST",
        headers: authHeader,
      });
      const { token } = await tokenRes.json();

      sseRef.current?.close();
      const sse = new EventSource(`${API_BASE}/api/uploads/progress/${token}`);
      sseRef.current = sse;
      setUploadProgress({ label: "Starting…", pct: 0 });

      sse.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.error) { setUploadProgress(null); sse.close(); }
        else if (msg.done) { setUploadProgress({ label: "Done!", pct: 100 }); sse.close(); }
        else if (typeof msg.pct === "number") { setUploadProgress({ label: msg.label, pct: msg.pct }); }
      };

      const form = new FormData();
      form.append("file", file);
      form.append("game", game);
      form.append("sourceType", "tcgplayer");
      form.append("progressToken", token);

      const res = await fetch(`${API_BASE}/api/uploads`, { method: "POST", body: form, headers: authHeader });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Upload failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      setTimeout(() => setUploadProgress(null), 800);
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      setSelectedUploadId(data.upload.id);
      setShowReview(true);
      toast({ title: "File parsed", description: `${data.summary.totalParsed} rows ready for review.` });
    },
    onError: (e: any) => {
      setUploadProgress(null);
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (uploadId: string) => {
      const res = await apiRequest("DELETE", `/api/uploads/${uploadId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      return data;
    },
    onSuccess: (_data, uploadId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      if (selectedUploadId === uploadId) { setSelectedUploadId(null); setShowReview(false); }
      toast({ title: "Upload deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const handleFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
      toast({ title: "CSV or Excel (.xlsx) files only", variant: "destructive" });
      return;
    }

    // Auto-detect game from file before uploading
    const slug = await detectGameFromFile(file);
    if (slug) setGame(slug);

    uploadMut.mutate(file);
  };

  const formatDate = (d: string) => {
    try { return format(parseISO(d), "M/d/yy HH:mm"); } catch { return d; }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-foreground">Uploads</h1>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4">

        {/* Left column */}
        <div className="space-y-4">
          {/* Upload form */}
          <div className="stat-card space-y-3">
            <div className="text-sm font-semibold">Upload CSV</div>

            <div
              data-testid="upload-dropzone"
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => !uploadMut.isPending && fileRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl min-h-[160px] flex flex-col items-center justify-center gap-2 text-center transition-colors active:opacity-70",
                uploadMut.isPending ? "cursor-default opacity-70" : "cursor-pointer hover:border-primary/50 hover:bg-accent/30",
                isDragging ? "border-primary bg-primary/5" : "border-border"
              )}
            >
              <Upload size={28} className="text-muted-foreground" />
              <div className="text-sm font-medium text-foreground">
                {uploadMut.isPending ? "Processing…" : "Tap to Upload"}
              </div>
              <div className="text-xs text-muted-foreground">CSV or Excel (.xlsx) · TCGplayer supported</div>
              <div className="text-[11px] text-muted-foreground/60 hidden sm:block">or drag and drop a file here</div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {uploadProgress && (
              <UploadProgress label={uploadProgress.label} pct={uploadProgress.pct} />
            )}
          </div>

          {/* Upload history */}
          <div className="stat-card">
            <div className="text-sm font-semibold mb-3">Upload History</div>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : uploads.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No uploads yet</div>
            ) : (
              <div className="space-y-1">
                {uploads.map((u: any) => (
                  <div
                    key={u.id}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-md border transition-colors flex items-start gap-2",
                      selectedUploadId === u.id ? "border-primary/40 bg-primary/5" : "border-border hover:bg-accent"
                    )}
                  >
                    <button
                      data-testid={`upload-row-${u.id}`}
                      onClick={() => {
                        setSelectedUploadId(u.id === selectedUploadId ? null : u.id);
                        setShowReview(true);
                      }}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText size={12} className="text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium text-foreground truncate">{u.originalFilename}</span>
                        </div>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium shrink-0", statusColors[u.parseStatus] || "")}>
                          {u.parseStatus}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        <span>{u.game}</span><span>·</span>
                        <span>{u.totalRows} rows</span><span>·</span>
                        <span className="flex items-center gap-0.5"><Clock size={9} />{formatDate(u.uploadedAt)}</span>
                      </div>
                    </button>

                    <button
                      aria-label="Delete upload"
                      onClick={e => {
                        e.stopPropagation();
                        if (confirm(`Delete "${u.originalFilename}"? This cannot be undone.`)) {
                          deleteMut.mutate(u.id);
                        }
                      }}
                      disabled={deleteMut.isPending && deleteMut.variables === u.id}
                      className="shrink-0 mt-0.5 p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: review panel */}
        <div className="lg:col-span-2">
          {!selectedUploadId || !showReview ? (
            <div className="stat-card h-40 lg:h-64 flex items-center justify-center text-muted-foreground text-sm">
              Select an upload to review
            </div>
          ) : reviewLoading ? (
            <div className="stat-card space-y-3">
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            </div>
          ) : selectedReview ? (
            <div className="stat-card">
              <div className="text-sm font-semibold mb-4">Merge Review</div>
              <ReviewDetail
                review={selectedReview}
                uploadId={selectedUploadId}
                onDone={() => { setShowReview(false); setSelectedUploadId(null); }}
              />
            </div>
          ) : (
            <div className="stat-card h-40 flex items-center justify-center text-muted-foreground text-sm">
              No review data for this upload
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
