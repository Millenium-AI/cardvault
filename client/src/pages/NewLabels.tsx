import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Download, CheckSquare, Square, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ConditionBadge } from "@/components/ConditionBadge";
import { format, parseISO } from "date-fns";

export default function NewLabels() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "pending" | "exported">("pending");
  const { toast } = useToast();

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/labels/new"],
  });

  const displayed = items.filter(i => filter === "all" || i.exportStatus === filter);
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
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/labels/export", { ids, queueType: "new" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `new-labels-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labels/new"] });
      setSelected(new Set());
      toast({ title: "Labels exported", description: "CSV downloaded successfully." });
    },
    onError: (e: any) => toast({ title: "Export failed", description: e.message, variant: "destructive" }),
  });

  const totalSelected = selected.size;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">New Labels</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Newly added inventory that needs labels printed</p>
        </div>
        <Button
          data-testid="button-export-new-labels"
          onClick={() => exportMut.mutate(Array.from(selected))}
          disabled={totalSelected === 0 || exportMut.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Download size={15} className="mr-2" />
          {exportMut.isPending ? "Exporting…" : `Export ${totalSelected > 0 ? `(${totalSelected})` : ""} CSV`}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1 w-fit">
        {(["pending", "exported", "all"] as const).map(f => (
          <button
            key={f}
            data-testid={`tab-labels-${f}`}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pending" && <span className="ml-1.5 bg-primary/20 text-primary px-1 py-0.5 rounded text-xs">{items.filter(i => i.exportStatus === "pending").length}</span>}
          </button>
        ))}
      </div>

      {/* ── Mobile card list ── */}
      <div className="sm:hidden space-y-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))
          : displayed.length === 0
          ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                <Tag size={28} className="mx-auto mb-3 opacity-40" />
                {filter === "pending" ? "No pending labels — approve an upload to generate labels" : "No items"}
              </div>
            )
          : displayed.map((item: any) => {
              const isPending = item.exportStatus === "pending";
              const isSel = selected.has(item.id);
              return (
                <div
                  key={item.id}
                  data-testid={`card-label-${item.id}`}
                  onClick={() => isPending && toggle(item.id)}
                  className={`stat-card flex items-start gap-3 p-3 cursor-pointer select-none ${
                    !isPending ? "opacity-50" : isSel ? "ring-1 ring-primary/60" : ""
                  }`}
                >
                  {/* Checkbox */}
                  <div className="mt-0.5 shrink-0">
                    {isPending
                      ? isSel
                        ? <CheckSquare size={18} className="text-primary" />
                        : <Square size={18} className="text-muted-foreground" />
                      : <div className="w-[18px]" />
                    }
                  </div>
                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ConditionBadge condition={item.condition} abbreviated />
                      <span className="font-mono font-bold text-primary text-sm">${item.roundedPrintPrice ?? "—"}</span>
                      <span className="ml-auto text-xs text-muted-foreground mono">${item.currentRawPrice?.toFixed(2) ?? "—"}</span>
                    </div>
                    <div className="text-sm font-medium text-foreground truncate">{item.productName}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground mono">{item.number || "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {(() => { try { return format(parseISO(item.createdAt), "M/d/yy"); } catch { return "—"; } })()}
                      </span>
                      <span className={`ml-auto text-xs px-1.5 py-0.5 rounded font-medium ${
                        item.exportStatus === "exported"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-primary/10 text-primary"
                      }`}>{item.exportStatus}</span>
                    </div>
                  </div>
                </div>
              );
            })
        }
        {/* Mobile select-all bar */}
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
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Print Price</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Card Name</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Number</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Market Price</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Added</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={8} className="px-3 py-2.5"><Skeleton className="h-8 w-full" /></td>
                    </tr>
                  ))
                : displayed.length === 0
                ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground text-sm">
                        <Tag size={24} className="mx-auto mb-2 opacity-40" />
                        {filter === "pending" ? "No pending labels — approve an upload to generate labels" : "No items"}
                      </td>
                    </tr>
                  )
                : displayed.map((item: any) => (
                    <tr
                      key={item.id}
                      data-testid={`row-label-${item.id}`}
                      className={`border-b border-border/50 hover:bg-accent/30 ${item.exportStatus === "exported" ? "opacity-50" : ""}`}
                    >
                      <td className="px-3 py-2.5">
                        {item.exportStatus === "pending" && (
                          <button onClick={() => toggle(item.id)} className="text-muted-foreground hover:text-foreground">
                            {selected.has(item.id) ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><ConditionBadge condition={item.condition} abbreviated /></td>
                      <td className="px-3 py-2.5 font-mono font-bold text-primary">${item.roundedPrintPrice ?? "—"}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground max-w-xs truncate">{item.productName}</td>
                      <td className="px-3 py-2.5 text-muted-foreground mono">{item.number || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground mono">${item.currentRawPrice?.toFixed(2) ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {(() => { try { return format(parseISO(item.createdAt), "M/d/yy"); } catch { return "—"; } })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          item.exportStatus === "exported"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-primary/10 text-primary"
                        }`}>{item.exportStatus}</span>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating action bar — shift above bottom nav on mobile */}
      {totalSelected > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 bg-card border border-border rounded-xl shadow-xl px-4 py-3 flex items-center gap-3">
          <div className="text-sm font-medium">{totalSelected} selected</div>
          <Button
            onClick={() => exportMut.mutate(Array.from(selected))}
            disabled={exportMut.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-sm"
          >
            <Download size={14} className="mr-1.5" />
            Export CSV
          </Button>
        </div>
      )}
    </div>
  );
}
