import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeader } from "@/lib/queryClient";
import { Upload, CheckCircle, XCircle, ChevronDown, ChevronRight, FileText, Clock, Trash2 } from "lucide-react";
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

function ReviewDetail({ review, uploadId, onDone }: { review: any; uploadId: string; onDone: () => void }) {
  const { toast } = useToast();
  const payload = (() => { try { return JSON.parse(review.reviewPayload || "{}"); } catch { return {}; } })();

  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  function setQtyOverride(rowId: string, val: number) {
    setQtyOverrides(prev => ({ ...prev, [rowId]: val }));
  }

  const approveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/uploads/${uploadId}/approve`, {
        overrides: Object.fromEntries(
          Object.entries(qtyOverrides).map(([id, qty]) => [id, { csvQty: qty }])
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approve failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/labels/new"] });
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

  const MiniTable = ({ rows, cols }: { rows: any[]; cols: { key: string; label: string; render?: (v: any) => any }[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[480px]">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {cols.map(c => <th key={c.key} className="text-left px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap tracking-wide uppercase text-[10px]">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors">
              {cols.map(c => (
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

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        <div className="flex flex-col gap-1 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3">
          <div className="text-2xl font-bold tabular-nums text-red-400 leading-none">{review.duplicateWarningCount ?? 0}</div>
          <div className="text-xs font-medium text-muted-foreground">Warnings</div>
        </div>
      </div>

      {/* Expandable sections */}
      <div className="space-y-2">
        <ExpandableSection title="New Items" count={payload.newItems?.length} color="bg-emerald-500/10 text-emerald-400">
          <MiniTable
            rows={payload.newItems || []}
            cols={[
              { key: "productName", label: "Product Name" },
              { key: "number", label: "#" },
              { key: "condition", label: "Condition" },
              { key: "rawMarketPrice", label: "Market $", render: (r: any) => r.rawMarketPrice ? `$${Number(r.rawMarketPrice).toFixed(2)}` : "—" },
              { key: "roundedPrintPrice", label: "Print $", render: (r: any) => r.roundedPrintPrice ? `$${r.roundedPrintPrice}` : "—" },
              { key: "addToQuantity", label: "Qty" },
            ]}
          />
        </ExpandableSection>

        <ExpandableSection
          title="Quantity Changes"
          count={(payload.matchedItems || []).filter((r: any) => (qtyOverrides[r.rowId] ?? r.csvQty ?? r.existingQty) !== r.existingQty).length}
          color="bg-sky-500/10 text-sky-400"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Product Name","#","Cond","Cur Qty","CSV Qty","Change","Old $","New $"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold text-muted-foreground tracking-wide uppercase text-[10px] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(payload.matchedItems || []).map((row: any, i: number) => {
                  const overrideQty = qtyOverrides[row.rowId];
                  const effectiveQty = overrideQty ?? row.csvQty ?? row.existingQty ?? 0;
                  const delta = effectiveQty - (row.existingQty || 0);
                  const isEdited = overrideQty !== undefined;
                  return (
                    <tr key={i} className={cn("border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors", isEdited && "bg-amber-500/5")}>
                      <td className="px-4 py-2.5 text-foreground max-w-[160px] truncate">{row.productName}</td>
                      <td className="px-4 py-2.5 text-foreground whitespace-nowrap">{row.number || "—"}</td>
                      <td className="px-4 py-2.5 text-foreground whitespace-nowrap">{row.condition || "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground">{row.existingQty ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0}
                          value={effectiveQty}
                          onChange={e => setQtyOverride(row.rowId, Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-16 h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground text-center focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-colors tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap font-semibold tabular-nums">
                        {delta === 0
                          ? <span className="text-muted-foreground font-normal">—</span>
                          : <span className={delta > 0 ? "text-emerald-400" : "text-red-400"}>{delta > 0 ? `+${delta}` : delta}</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">{row.existingPrice ? `$${Number(row.existingPrice).toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{row.rawMarketPrice ? `$${Number(row.rawMarketPrice).toFixed(2)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ExpandableSection>

        {(payload.matchedItems || []).some((r: any) => r.qtyDelta === 0) && (
          <ExpandableSection
            title="Confirmed Unchanged"
            count={(payload.matchedItems || []).filter((r: any) => r.qtyDelta === 0).length}
            color="bg-muted/60 text-muted-foreground"
          >
            <MiniTable
              rows={(payload.matchedItems || []).filter((r: any) => r.qtyDelta === 0)}
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

        <ExpandableSection title="Repricing Candidates" count={payload.repricingCandidates?.length} color="bg-amber-500/10 text-amber-400">
          <MiniTable
            rows={payload.repricingCandidates || []}
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

// ── Upload progress bar component ──────────────────────────────────────────────
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

export default function Uploads() {
  const [game, setGame] = useState("one-piece");
  const [sourceType, setSourceType] = useState("tcgplayer");
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ label: string; pct: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  // Clean up any open SSE connection on unmount
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
      // 1. Get a progress token from the server
      const authHeader = await getAuthHeader();
      const API_BASE = ("__PORT_5000__" as string).startsWith("__") ? "" : "__PORT_5000__";

      const tokenRes = await fetch(`${API_BASE}/api/uploads/progress-token`, {
        method: "POST",
        headers: authHeader,
      });
      const { token } = await tokenRes.json();

      // 2. Open SSE stream for progress updates
      sseRef.current?.close();
      const sse = new EventSource(`${API_BASE}/api/uploads/progress/${token}`);
      sseRef.current = sse;
      setUploadProgress({ label: "Starting…", pct: 0 });

      sse.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.error) {
          setUploadProgress(null);
          sse.close();
        } else if (msg.done) {
          setUploadProgress({ label: "Done!", pct: 100 });
          sse.close();
        } else if (typeof msg.pct === "number") {
          setUploadProgress({ label: msg.label, pct: msg.pct });
        }
      };

      // 3. POST the file with the progress token
      const form = new FormData();
      form.append("file", file);
      form.append("game", game);
      form.append("sourceType", sourceType);
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
      if (selectedUploadId === uploadId) {
        setSelectedUploadId(null);
        setShowReview(false);
      }
      toast({ title: "Upload deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const handleFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
      toast({ title: "CSV or Excel (.xlsx) files only", variant: "destructive" });
      return;
    }
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Game</label>
                <Select value={game} onValueChange={setGame}>
                  <SelectTrigger data-testid="select-game" className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one-piece">One Piece</SelectItem>
                    <SelectItem value="pokemon">Pokémon</SelectItem>
                    <SelectItem value="sorcery">Sorcery</SelectItem>
                    <SelectItem value="mtg">MTG</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Source</label>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger data-testid="select-source" className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcgplayer">TCGplayer</SelectItem>
                    <SelectItem value="collectr">Collectr</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div
              data-testid="upload-dropzone"
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => !uploadMut.isPending && fileRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors active:scale-[0.98]",
                uploadMut.isPending ? "cursor-default opacity-70" : "cursor-pointer hover:border-primary/50 hover:bg-accent/30",
                isDragging ? "border-primary bg-primary/5" : "border-border"
              )}
            >
              <Upload size={22} className="mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                {uploadMut.isPending ? "Processing…" : "Tap or drop CSV or Excel"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">TCGplayer CSV or .xlsx supported</div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {/* Progress bar — visible only during upload */}
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
