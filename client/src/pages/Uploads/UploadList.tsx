import { FileText, Clock, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { gameLabel } from "@shared/gameLabels";
import { format, parseISO } from "date-fns";

const statusColors: Record<string, string> = {
  pending: "text-primary bg-primary/10",
  parsed: "text-sky-400 bg-sky-400/10",
  merged: "text-emerald-400 bg-emerald-400/10",
  failed: "text-red-400 bg-red-400/10",
  rejected: "text-muted-foreground bg-muted",
};

interface Upload {
  id: string;
  originalFilename: string;
  parseStatus: string;
  game: string;
  totalRows: number;
  uploadedAt: string;
}

interface UploadListProps {
  uploads: Upload[];
  isLoading: boolean;
  selectedUploadId: string | null;
  deleteMutPending: boolean;
  deleteMutVariables: string | undefined;
  onSelectUpload: (uploadId: string) => void;
  onDeleteUpload: (uploadId: string, filename: string) => void;
}

export function UploadList({
  uploads,
  isLoading,
  selectedUploadId,
  deleteMutPending,
  deleteMutVariables,
  onSelectUpload,
  onDeleteUpload,
}: UploadListProps) {
  const formatDate = (d: string) => {
    try { return format(parseISO(d), "M/d/yy HH:mm"); } catch { return d; }
  };

  return (
    <div className="stat-card">
      <div className="text-sm font-semibold mb-3">Upload History</div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : uploads.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">No uploads yet</div>
      ) : (
        <div className="space-y-1">
          {uploads.map((u: Upload) => (
            <div
              key={u.id}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-md border transition-colors flex items-start gap-2",
                selectedUploadId === u.id ? "border-primary/40 bg-primary/5" : "border-border hover:bg-accent"
              )}
            >
              <button
                data-testid={`upload-row-${u.id}`}
                onClick={() => onSelectUpload(u.id)}
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
                  <span>{gameLabel(u.game)}</span><span>·</span>
                  <span>{u.totalRows} rows</span><span>·</span>
                  <span className="flex items-center gap-0.5"><Clock size={9} />{formatDate(u.uploadedAt)}</span>
                </div>
              </button>

              <button
                aria-label="Delete upload"
                onClick={e => {
                  e.stopPropagation();
                  if (confirm(`Delete "${u.originalFilename}"? This cannot be undone.`)) {
                    onDeleteUpload(u.id, u.originalFilename);
                  }
                }}
                disabled={deleteMutPending && deleteMutVariables === u.id}
                className="shrink-0 mt-0.5 p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
