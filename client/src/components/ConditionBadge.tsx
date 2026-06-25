import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  "Near Mint": "badge-nm",
  "Lightly Played": "badge-lp",
  "Moderately Played": "badge-mp",
  "Heavily Played": "badge-hp",
  "Damaged": "badge-d",
};

const short: Record<string, string> = {
  "Near Mint": "NM",
  "Lightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
  "Damaged": "DMG",
};

export function ConditionBadge({ condition, abbreviated = false }: { condition?: string | null; abbreviated?: boolean }) {
  if (!condition) return null;
  const cls = map[condition] || "bg-muted text-muted-foreground border border-border";
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium", cls)}>
      {abbreviated ? short[condition] || condition : condition}
    </span>
  );
}
