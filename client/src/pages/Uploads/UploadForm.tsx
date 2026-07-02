import { useRef, useState } from "react";
import { Upload } from "lucide-react";
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
        productLine =
          String(rows[0]["Product Line"] ?? rows[0]["product_line"] ?? rows[0]["Game"] ?? "");
      }
    } else {
      const slice = file.slice(0, 4096);
      const text = await slice.text();
      const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
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
  if (pl.includes("one piece"))                             return "one-piece";
  if (pl.includes("pokemon") || pl.includes("pokémon")) {
    if (pl.includes("japan") || pl.includes(" jp") || pl.includes("(jp)")) return "pokemon-jp";
    return "pokemon";
  }
  if (pl.includes("sorcery"))                               return "sorcery";
  if (pl.includes("dragon ball"))                           return "dragon-ball";
  if (pl.includes("magic") || pl.includes("the gathering") || pl === "mtg") return "mtg";
  if (pl.includes("star wars"))                             return "star-wars";
  if (pl.includes("lorcana"))                               return "lorcana";
  if (pl.includes("yu-gi-oh") || pl.includes("yugioh"))     return "yugioh";
  if (pl.includes("digimon"))                               return "digimon";
  if (pl.includes("flesh and blood") || pl.includes("flesh & blood")) return "fab";
  return null;
}

interface UploadFormProps {
  game: string;
  uploadProgress: { label: string; pct: number } | null;
  isDragging: boolean;
  isPending: boolean;
  onFile: (file: File) => void;
  onGameChange: (game: string) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
}

export function UploadForm({
  game,
  uploadProgress,
  isDragging,
  isPending,
  onFile,
  onGameChange,
  onDragOver,
  onDragLeave,
}: UploadFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
      toast({ title: "CSV or Excel (.xlsx) files only", variant: "destructive" });
      return;
    }

    const slug = await detectGameFromFile(file);
    if (slug) onGameChange(slug);

    onFile(file);
  };

  return (
    <div className="stat-card space-y-3">
      <div className="text-sm font-semibold">Upload CSV</div>

      <div
        data-testid="upload-dropzone"
        onDragOver={e => { e.preventDefault(); onDragOver(); }}
        onDragLeave={onDragLeave}
        onDrop={e => { e.preventDefault(); onDragLeave(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => !isPending && fileRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-2xl min-h-[160px] flex flex-col items-center justify-center gap-2 text-center transition-colors active:opacity-70",
          isPending ? "cursor-default opacity-70" : "cursor-pointer hover:border-primary/50 hover:bg-accent/30",
          isDragging ? "border-primary bg-primary/5" : "border-border"
        )}
      >
        <Upload size={28} className="text-muted-foreground" />
        <div className="text-sm font-medium text-foreground">
          {isPending ? "Processing…" : "Tap to Upload"}
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
  );
}
