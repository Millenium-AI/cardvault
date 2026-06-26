import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Download, CheckSquare, Square, TrendingUp, TrendingDown, RefreshCcw, ArrowLeft, Trash2, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ConditionBadge } from "@/components/ConditionBadge";
import { GameTileGrid } from "@/components/GameTileGrid";
import { useGameParam } from "@/lib/useGameParam";
import { format, parseISO } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GAME_IMAGES: Record<string, string> = {
  all: "",
  pokemon: "",
  "one-piece": "",
  sorcery: "",
  "dragon-ball": "",
};

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined) return <span className="text-muted-foreground">—</span>;
  const isUp = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
      {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {isUp ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function ThresholdBadge({ rule }: { rule: string | null }) {
  if (!rule) return null;
  return (
    <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-medium">
      {rule}
    </span>
  );
}

export default function RepricingQueue() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "pending" | "exported" | "skipped">("pending");
  const { toast } = useToast();
  const [selectedGame, setSelectedGame] = useGameParam();

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/labels/reprice"],
  });

  const scopedItems = selectedGame && selectedGame !== "all"
    ? items.filter(i => i.game === selectedGame)
    : items;

  const displayed = scopedItems.filter(i => filter === "all" || i.exportStatus === filter);
  const pendingItems = displayed.filter(i => i.exportStatus === "pending");
  const allPendingIds = pendingItems.map((i: any) => i.id);
  const allSelected = allPendingIds.length > 0 && allPendingIds.every(id => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(s => { const n = new Set(s); allPendingIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelected(s => { const n = new Set(s); allPendingIds.forEach(id => n.add(id)); return n; });
    }
  };

  const toggle = (id: string) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const exportMut = useMutation({
    mutationFn: async ({ ids, fmt }: { ids: string[]; fmt: "xlsx" | "csv" }) => {
      const res = await apiRequest("POST", "/api/labels/export", { ids, queueType: "reprice", format: fmt });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reprice-labels-${Date.now()}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labels/reprice"] });
      setSelected(new Set());
      toast({ title: "Labels exported" });
    },
    onError: (e: any) => toast({ title: "Export failed", description: e.message, variant: "destructive" }),
  });

  const skipMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await apiRequest("PATCH", `/api/labels/${id}`, { exportStatus: "skipped" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labels/reprice"] });
      setSelected(new Set());
      toast({ title: "Items marked as skipped" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/labels/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labels/reprice"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Removed from queue" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove label.", variant: "destructive" }),
  });

  function handleDeleteLabel(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (confirm("Remove this label from the queue?")) deleteMut.mutate(id);
  }

  const totalSelected = selected.size;
  const pendingCount = scopedItems.filter(i => i.exportStatus === "pending").length;

  // ── Tile picker ──────────────────────────────────────────────────────────────
  if (selectedGame === null) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Repricing Queue</h1>
        </div>
        <GameTileGrid
          items={items.filter(i => i.exportStatus === "pending")}
          images={GAME_IMAGES}
          onSelect={setSelectedGame}
        />
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

      <div className="page-header">
        <div>
          <h1 className="page-title">Repricing Queue</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Existing inventory with price movement exceeding thresholds</p>
        </div>
        <div className="flex gap-2 items-center">
          {totalSelected > 0 && (
            <Button
              variant="outline"
              onClick={() => skipMut.mutate(Array.from(selected))}
              disabled={skipMut.isPending}
              className="h-10 text-sm border-border hidden sm:flex"
            >
              Skip Selected
            </Button>
          )}

          {/* ── Export Labels split button (header) ── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-testid="button-export-reprice-labels"
                disabled={totalSelected === 0 || exportMut.isPending}
                className="h-10 px-5 text-sm font-semibold gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <Download size={16} />
                {exportMut.isPending
                  ? "Exporting…"
                  : `Export Labels${totalSelected > 0 ? ` (${totalSelected})` : ""}`}
                <ChevronDown size={13} className="ml-0.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => exportMut.mutate({ ids: Array.from(selected), fmt: "xlsx" })}
                className="gap-2 cursor-pointer"
              >
                <FileSpreadsheet size={14} className="text-emerald-500" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportMut.mutate({ ids: Array.from(selected), fmt: "csv" })}
                className="gap-2 cursor-pointer"
              >
                <FileText size={14} className="text-blue-400" />
                CSV (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Threshold legend */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="stat-card py-2 px-3 flex items-center gap-2 text-xs flex-wrap">
          <span className="text-muted-foreground">Thresholds:</span>
          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-amber-500/20">&gt;$100 / &gt;5%</span>
          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-amber-500/20">$50-$100 / &gt;7%</span>
          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-amber-500/20">&lt;$50 / &gt;10%</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1 w-fit">
        {(["pending", "exported", "skipped", "all"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pending" && <span className="ml-1.5 bg-primary/20 text-primary px-1 py-0.5 rounded text-xs">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {/* ── Mobile card list ── */}
      <div className="sm:hidden space-y-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          : displayed.length === 0
          ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                <RefreshCcw size={28} className="mx-auto mb-3 opacity-40" />
                {filter === "pending" ? "No repricing candidates yet — price thresholds haven't been crossed" : "No items"}
              </div>
            )
          : displayed.map((item: any) => {
              const isPending = item.exportStatus === "pending";
              const isSel = selected.has(item.id);
              return (
                <div
                  key={item.id}
                  data-testid={`card-reprice-${item.id}`}
                  onClick={() => isPending && toggle(item.id)}
                  className={`stat-card p-3 cursor-pointer select-none ${
                    !isPending ? "opacity-60" : isSel ? "ring-1 ring-primary/60" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="shrink-0">
                      {isPending
                        ? isSel
                          ? <CheckSquare size={16} className="text-primary" />
                          : <Square size={16} className="text-muted-foreground" />
                        : <div className="w-4" />
                      }
                    </div>
                    <ConditionBadge condition={item.condition} abbreviated />
                    <span className="font-mono font-bold text-primary text-sm">${item.roundedPrintPrice ?? "—"}</span>
                    <PctBadge pct={item.percentChange} />
                    <span className="ml-auto"><ThresholdBadge rule={item.thresholdRule} /></span>
                  </div>
                  <div className="text-sm font-medium text-foreground truncate mb-1">{item.productName}</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-muted-foreground mono">{item.number || "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      Prior: <span className="font-mono">{item.priorRawPrice ? `$${Number(item.priorRawPrice).toFixed(2)}` : "—"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Now: <span className="font-mono">{item.currentRawPrice ? `$${Number(item.currentRawPrice).toFixed(2)}` : "—"}</span>
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      item.exportStatus === "exported" ? "bg-emerald-500/10 text-emerald-400" :
                      item.exportStatus === "skipped" ? "bg-muted text-muted-foreground" :
                      "bg-primary/10 text-primary"
                    }`}>{item.exportStatus}</span>
                    <button
                      onClick={e => handleDeleteLabel(e, item.id)}
                      aria-label="Delete label"
                      disabled={deleteMut.isPending}
                      className="ml-auto shrink-0 p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
        }
        {pendingItems.length > 0 && (
          <button
            onClick={toggleAll}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-2 flex items-center justify-center gap-2"
          >
            {allSelected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
            {allSelected ? "Deselect all" : `Select all ${pendingItems.length} pending`}
          </button>
        )}
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden sm:block stat-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 w-10">
                  <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                    {allSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Condition</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">New Print $</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Card</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Prior $</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">New Market $</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Change</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Rule</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={11} className="px-3 py-2.5"><Skeleton className="h-8 w-full" /></td>
                    </tr>
                  ))
                : displayed.length === 0
                ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-12 text-center text-muted-foreground text-sm">
                        <RefreshCcw size={24} className="mx-auto mb-2 opacity-40" />
                        {filter === "pending" ? "No repricing candidates yet — price thresholds haven't been crossed" : "No items"}
                      </td>
                    </tr>
                  )
                : displayed.map((item: any) => (
                    <tr
                      key={item.id}
                      data-testid={`row-reprice-${item.id}`}
                      className={`border-b border-border/50 hover:bg-accent/30 ${item.exportStatus !== "pending" ? "opacity-60" : ""}`}
                    >
                      <td className="px-3 py-2.5">
                        {item.exportStatus === "pending" && (
                          <button onClick={() => toggle(item.id)}>
                            {selected.has(item.id) ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><ConditionBadge condition={item.condition} abbreviated /></td>
                      <td className="px-3 py-2.5 font-mono font-bold text-primary">${item.roundedPrintPrice ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground truncate max-w-xs">{item.productName}</div>
                        <div className="text-xs text-muted-foreground mono">{item.number}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground text-xs">
                        {item.priorRawPrice ? `$${Number(item.priorRawPrice).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-foreground">
                        {item.currentRawPrice ? `$${Number(item.currentRawPrice).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5"><PctBadge pct={item.percentChange} /></td>
                      <td className="px-3 py-2.5"><ThresholdBadge rule={item.thresholdRule} /></td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {(() => { try { return format(parseISO(item.createdAt), "M/d/yy"); } catch { return "—"; } })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          item.exportStatus === "exported" ? "bg-emerald-500/10 text-emerald-400" :
                          item.exportStatus === "skipped" ? "bg-muted text-muted-foreground" :
                          "bg-primary/10 text-primary"
                        }`}>{item.exportStatus}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={e => handleDeleteLabel(e, item.id)}
                          aria-label="Delete label"
                          disabled={deleteMut.isPending}
                          className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Floating action bar ── */}
      {totalSelected > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 bg-card border border-border rounded-xl shadow-xl px-4 py-3 flex items-center gap-2 flex-wrap">
          <div className="text-sm font-medium">{totalSelected} selected</div>
          <Button
            variant="outline"
            onClick={() => skipMut.mutate(Array.from(selected))}
            className="h-9 text-sm border-border"
          >
            Skip
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={exportMut.isPending}
                className="h-9 px-4 text-sm font-semibold gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <Download size={15} />
                Export Labels
                <ChevronDown size={13} className="ml-0.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => exportMut.mutate({ ids: Array.from(selected), fmt: "xlsx" })}
                className="gap-2 cursor-pointer"
              >
                <FileSpreadsheet size={14} className="text-emerald-500" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportMut.mutate({ ids: Array.from(selected), fmt: "csv" })}
                className="gap-2 cursor-pointer"
              >
                <FileText size={14} className="text-blue-400" />
                CSV (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
