import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeader } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { UploadForm } from "./UploadForm";
import { UploadList } from "./UploadList";
import { UploadReviewPanel } from "./UploadReviewPanel";

const statusColors: Record<string, string> = {
  pending: "text-primary bg-primary/10",
  parsed: "text-sky-400 bg-sky-400/10",
  merged: "text-emerald-400 bg-emerald-400/10",
  failed: "text-red-400 bg-red-400/10",
  rejected: "text-muted-foreground bg-muted",
};

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-foreground">Uploads</h1>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4">

        {/* Left column */}
        <div className="space-y-4">
          {/* Upload form */}
          <UploadForm
            game={game}
            uploadProgress={uploadProgress}
            isDragging={isDragging}
            isPending={uploadMut.isPending}
            onFile={(file) => uploadMut.mutate(file)}
            onGameChange={setGame}
            onDragOver={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
          />

          {/* Upload history */}
          <UploadList
            uploads={uploads}
            isLoading={isLoading}
            selectedUploadId={selectedUploadId}
            deleteMutPending={deleteMut.isPending}
            deleteMutVariables={deleteMut.variables}
            onSelectUpload={(uploadId) => {
              setSelectedUploadId(uploadId === selectedUploadId ? null : uploadId);
              setShowReview(true);
            }}
            onDeleteUpload={(uploadId) => deleteMut.mutate(uploadId)}
          />
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
              <UploadReviewPanel
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
