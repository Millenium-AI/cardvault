export type LabelFilter = "all" | "needs_label" | "needs_repricing" | "label_created";
export type ViewMode = "list" | "grid-sm" | "grid-lg";

export const DEFAULT_COLUMN_ORDER = ["card", "condition", "game", "qty", "market", "print", "total"] as const;
export type ColumnKey = typeof DEFAULT_COLUMN_ORDER[number];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  card:      "Card Name",
  condition: "Cond",
  game:      "Game",
  qty:       "Qty",
  market:    "Market $",
  print:     "Print $",
  total:     "Total",
};

export const COLUMN_ALIGN: Record<ColumnKey, string> = {
  card:      "text-left",
  condition: "text-center",
  game:      "text-left",
  qty:       "text-right",
  market:    "text-right",
  print:     "text-right",
  total:     "text-right",
};

export const LABEL_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  needs_label:     { label: "Needs Label",     className: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: null },
  needs_repricing: { label: "Needs Repricing", className: "bg-blue-500/15  text-blue-400  border-blue-500/30",  icon: null },
  label_created:   { label: "Label Created",   className: "bg-green-500/15 text-green-400 border-green-500/30", icon: null },
};

export function mergeColumnOrder(saved: string[]): ColumnKey[] {
  const base = [...DEFAULT_COLUMN_ORDER];
  const filtered = saved.filter((c): c is ColumnKey => (base as readonly string[]).includes(c));
  const missing = base.filter(c => !filtered.includes(c));
  return [...filtered, ...missing];
}

export function moveColumn(order: ColumnKey[], from: ColumnKey, to: ColumnKey): ColumnKey[] {
  const next = [...order];
  const fromIndex = next.indexOf(from);
  const toIndex = next.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return order;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, from);
  return next;
}
