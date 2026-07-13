import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { gameLabel } from "@shared/gameLabels";
import { UploadProgress } from "./UploadProgress";

const GAME_VALUES = ["pokemon", "pokemon-jp", "one-piece", "sorcery", "dragon-ball", "mtg", "star-wars", "lorcana", "yugioh", "digimon", "fab", "other"] as const;
export const GAMES: { value: string; label: string }[] = GAME_VALUES.map(value => ({ value, label: gameLabel(value) }));

async function detectGameFromFile(file: File): Promise<string | null> {
  try {
    const isXlsx =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    let productLine = "";

    if (isXlsx) {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", sheetRows: 2 });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      if (rows.length > 0) {
        productLine = String(rows[0]["Product Line"] ?? rows[0]["product_line"] ?? rows[0]["Game"] ?? "");
      }
    } else {
      const slice = file.slice(0, 4096);
      const text = await slice.text();
      const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return null;

      const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
      const plIdx = headers.findIndex(
        h => h.toLowerCase() === "product line" || h.toLowerCase() === "product_line" || h.toLowerCase() === "game"
      );
      if (plIdx === -1) return null;

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
  if (pl.includes("one piece"))                                                   return "one-piece";
  if (pl.includes("pokemon") || pl.includes("pok\u00e9mon")) {
    if (pl.includes("japan") || pl.includes(" jp") || pl.includes("(jp)"))        return "pokemon-jp";
    return "pokemon";
  }
  if (pl.includes("sorcery"))                                                     return "sorcery";
  if (pl.includes("dragon ball"))                                                 return "dragon-ball";
  if (pl.includes("magic") || pl.includes("the gathering") || pl === "mtg")      return "mtg";
  if (pl.includes("star wars"))                                                   return "star-wars";
  if (pl.includes("lorcana"))                                                     return "lorcana";
  if (pl.includes("yu-gi-oh") || pl.includes("yugioh"))                          return "yugioh";
  if (pl.includes("digimon"))                                                     return "digimon";
  if (pl.includes("flesh and blood") || pl.includes("flesh & blood"))            return "fab";
  return null;
}

/**
 * Merge multiple CSV/XLSX files into a single CSV string.
 *
 * Rules:
 *  - Headers are taken from the first file.
 *  - Subsequent files: if their header row matches (case-insensitive), data
 *    rows are appended directly. If headers differ, they are still appended —
 *    the server's mapCsvRow uses flexible key lookup so missing columns just
 *    produce empty strings, which is safe.
 *  - XLSX files are converted to CSV in-memory before merging.
 *  - BOM characters are stripped.
 *  - Mixed-game files are fine: mapCsvRow detects game per-row from
 *    Product Line, so the envelope game passed to the server is irrelevant.
 */
async function mergeFilesToCsv(files: File[]): Promise<{ csv: string; game: string }> {
  const XLSX = await import("xlsx");

  const fileGames: (string | null)[] = [];
  const csvBlocks: string[][] = []; // array of line arrays per file

  for (const file of files) {
    const isXlsx =
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    let lines: string[];

    if (isXlsx) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // Convert to CSV via xlsx, then split into lines
      const csvText = XLSX.utils.sheet_to_csv(sheet);
      lines = csvText.split(/\r?\n/).filter(l => l.trim());
    } else {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      lines = text.split(/\r?\n/).filter(l => l.trim());
    }

    fileGames.push(await detectGameFromFile(file));
    csvBlocks.push(lines);
  }

  // Use first file's header as the canonical header
  const header = csvBlocks[0]?.[0] ?? "";
  const allDataLines: string[] = [];

  for (const block of csvBlocks) {
    // Skip header row (index 0), append all data rows
    for (let i = 1; i < block.length; i++) {
      if (block[i].trim()) allDataLines.push(block[i]);
    }
  }

  const mergedCsv = [header, ...allDataLines].join("\n");

  // Determine envelope game: if all files agree use that slug,
  // otherwise use 'other' — per-row detection handles the rest.
  const uniqueGames = [...new Set(fileGames.filter(Boolean))];
  const game = uniqueGames.length === 1 ? (uniqueGames[0] as string) : "other";

  return { csv: mergedCsv, game };
}

interface UploadFormProps {
  game: string;
  uploadProgress: { label: string; pct: number } | null;
  isDragging: boolean;
  isPending: boolean;
  onFiles: (files: File[]) => void;
  onGameChange: (game: string) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
}

export { mergeFilesToCsv };

export function UploadForm({
  game,
  uploadProgress,
  isDragging,
  isPending,
  onFiles,
  onGameChange,
  onDragOver,
  onDragLeave,
}: UploadFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);

  const handleFiles = async (incoming: File[]) => {
    const valid = incoming.filter(f => {
      const n = f.name.toLowerCase();
      return n.endsWith(".csv") || n.endsWith(".xlsx");
    });

    if (!valid.length) {
      toast({ title: "CSV or Excel (.xlsx) files only", variant: "destructive" });
      return;
    }

    if (valid.length < incoming.length) {
      toast({
        title: `${incoming.length - valid.length} file(s) skipped`,
        description: "Only CSV and .xlsx files are accepted.",
        variant: "destructive",
      });
    }

    // Detect game from first file to update the selector immediately
    const slug = await detectGameFromFile(valid[0]);
    if (slug) onGameChange(slug);

    setQueuedFiles(valid);
    onFiles(valid);
  };

  const removeFile = (idx: number) => {
    setQueuedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const fileCount = queuedFiles.length;

  return (
    <div className="stat-card space-y-3">
      <div className="text-sm font-semibold">Upload CSV</div>

      <div
        data-testid="upload-dropzone"
        onDragOver={e => { e.preventDefault(); onDragOver(); }}
        onDragLeave={onDragLeave}
        onDrop={e => {
          e.preventDefault();
          onDragLeave();
          const dropped = Array.from(e.dataTransfer.files);
          if (dropped.length) handleFiles(dropped);
        }}
        onClick={() => !isPending && fileRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-2xl min-h-[160px] flex flex-col items-center justify-center gap-2 text-center transition-colors active:opacity-70",
          isPending ? "cursor-default opacity-70" : "cursor-pointer hover:border-primary/50 hover:bg-accent/30",
          isDragging ? "border-primary bg-primary/5" : "border-border"
        )}
      >
        <Upload size={28} className="text-muted-foreground" />
        <div className="text-sm font-medium text-foreground">
          {isPending
            ? "Processing…"
            : fileCount > 0
              ? `${fileCount} file${fileCount > 1 ? "s" : ""} selected`
              : "Tap to Upload"}
        </div>
        <div className="text-xs text-muted-foreground">CSV or Excel (.xlsx) · Multiple files supported</div>
        <div className="text-[11px] text-muted-foreground/60 hidden sm:block">or drag and drop files here</div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx"
          multiple
          className="hidden"
          onChange={e => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) handleFiles(files);
            // Reset so same files can be re-selected
            e.target.value = "";
          }}
        />
      </div>

      {/* File list — shown while pending or after selection */}
      {queuedFiles.length > 0 && !uploadProgress && (
        <div className="space-y-1">
          {queuedFiles.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-1.5">
              <span className="truncate max-w-[80%]">{f.name}</span>
              {!isPending && (
                <button
                  onClick={e => { e.stopPropagation(); removeFile(i); }}
                  className="ml-2 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {uploadProgress && (
        <UploadProgress label={uploadProgress.label} pct={uploadProgress.pct} />
      )}
    </div>
  );
}
