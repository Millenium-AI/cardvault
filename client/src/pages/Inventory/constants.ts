import type React from "react";
import type { InventoryItem } from "@shared/schema";

export type LabelFilter = "all" | "needs_label" | "needs_repricing" | "label_created";

export const CONDITION_OPTIONS = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
] as const;
export type ViewMode = "table" | "grid-sm" | "grid-lg";
export type SortField =
  | "name"
  | "set"
  | "game"
  | "rarity"
  | "condition"
  | "quantity"
  | "marketPrice"
  | "printedPrice"
  | "totalValue"
  | "priceChange24hr"
  | "priceChange7d"
  | "labelStatus"
  | "acquired"
  | "updatedAt";
export type SortDir = "asc" | "desc";

// ─── sort options (drives the Sort menu) ──────────────────────────────────────
// `numeric` fields default to a descending toggle (biggest first) when first
// picked; text/date fields default to ascending.
export const SORT_OPTIONS: { field: SortField; label: string; numeric: boolean }[] = [
  { field: "name",            label: "Card name",        numeric: false },
  { field: "set",             label: "Set",              numeric: false },
  { field: "game",            label: "Game",             numeric: false },
  { field: "rarity",          label: "Rarity",           numeric: false },
  { field: "condition",       label: "Condition",        numeric: true  },
  { field: "quantity",        label: "Quantity",         numeric: true  },
  { field: "marketPrice",     label: "Market price",     numeric: true  },
  { field: "printedPrice",    label: "Print price",      numeric: true  },
  { field: "totalValue",      label: "Total value",      numeric: true  },
  { field: "priceChange24hr", label: "24h change",       numeric: true  },
  { field: "priceChange7d",   label: "7d change",        numeric: true  },
  { field: "labelStatus",     label: "Label status",     numeric: false },
  { field: "acquired",        label: "Date acquired",    numeric: true  },
  { field: "updatedAt",       label: "Last updated",     numeric: true  },
];

// ─── filter option lists ──────────────────────────────────────────────────────
export const LABEL_STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: "needs_label",     label: "Needs Label" },
  { key: "needs_repricing", label: "Needs Repricing" },
  { key: "label_created",   label: "Label Created" },
];

export const PRICE_SOURCE_OPTIONS: { key: string; label: string }[] = [
  { key: "justtcg", label: "JustTCG (live)" },
  { key: "csv",     label: "CSV import" },
  { key: "pending", label: "Pending" },
];

// ─── filter state model ────────────────────────────────────────────────────────
export interface InventoryFilters {
  games: string[];
  sets: string[];
  rarities: string[];
  printings: string[];
  conditions: string[];
  labelStatuses: string[];
  priceSources: string[];
  priceMin: string;
  priceMax: string;
  qtyMin: string;
  qtyMax: string;
  acquiredFrom: string;
  acquiredTo: string;
}

export const EMPTY_FILTERS: InventoryFilters = {
  games: [], sets: [], rarities: [], printings: [], conditions: [],
  labelStatuses: [], priceSources: [],
  priceMin: "", priceMax: "", qtyMin: "", qtyMax: "",
  acquiredFrom: "", acquiredTo: "",
};

export interface ItemMeta {
  cleanName?: string;
  displaySuffix?: string;
  sourceSetName?: string;
  sourceRarity?: string;
  sourcePrinting?: string;
}

export function parseMeta(item: InventoryItem): ItemMeta {
  try { return JSON.parse(item.matchMetadataJson || "{}") as ItemMeta; }
  catch { return {}; }
}

/** Count filter dimensions that are actively narrowing the result set. */
export function countActiveFilters(f: InventoryFilters): number {
  let n = 0;
  n += f.games.length ? 1 : 0;
  n += f.sets.length ? 1 : 0;
  n += f.rarities.length ? 1 : 0;
  n += f.printings.length ? 1 : 0;
  n += f.conditions.length ? 1 : 0;
  n += f.labelStatuses.length ? 1 : 0;
  n += f.priceSources.length ? 1 : 0;
  n += (f.priceMin !== "" || f.priceMax !== "") ? 1 : 0;
  n += (f.qtyMin !== "" || f.qtyMax !== "") ? 1 : 0;
  n += (f.acquiredFrom !== "" || f.acquiredTo !== "") ? 1 : 0;
  return n;
}

function timeOf(s: string | null | undefined): number {
  if (!s) return 0;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function matchesFilters(item: InventoryItem, meta: ItemMeta, f: InventoryFilters, search: string): boolean {
  if (search) {
    const s = search.toLowerCase();
    const hay = [item.productName, item.number, meta.cleanName, meta.sourceSetName, meta.sourceRarity]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(s));
    if (!hay) return false;
  }
  if (f.games.length && !f.games.includes(item.game)) return false;
  if (f.sets.length && !f.sets.includes(meta.sourceSetName || "")) return false;
  if (f.rarities.length && !f.rarities.includes(meta.sourceRarity || "")) return false;
  if (f.printings.length && !f.printings.includes(meta.sourcePrinting || "")) return false;
  if (f.conditions.length && !f.conditions.includes(item.condition || "")) return false;
  if (f.labelStatuses.length && !f.labelStatuses.includes(item.labelStatus || "")) return false;
  if (f.priceSources.length && !f.priceSources.includes(item.priceSource || "")) return false;

  const price = item.currentRawMarketPrice ?? 0;
  if (f.priceMin !== "" && price < Number(f.priceMin)) return false;
  if (f.priceMax !== "" && price > Number(f.priceMax)) return false;

  const qty = item.currentQuantity ?? 0;
  if (f.qtyMin !== "" && qty < Number(f.qtyMin)) return false;
  if (f.qtyMax !== "" && qty > Number(f.qtyMax)) return false;

  const acquired = timeOf(item.firstSeenAt);
  if (f.acquiredFrom !== "" && acquired < timeOf(f.acquiredFrom)) return false;
  if (f.acquiredTo !== "" && acquired > timeOf(f.acquiredTo) + 86_399_999) return false;

  return true;
}

function sortValue(item: InventoryItem, meta: ItemMeta, field: SortField): number | string {
  switch (field) {
    case "name":            return (meta.cleanName || item.productName || "").toLowerCase();
    case "set":             return (meta.sourceSetName || "").toLowerCase();
    case "game":            return (item.game || "").toLowerCase();
    case "rarity":          return (meta.sourceRarity || "").toLowerCase();
    case "condition": {
      const idx = (CONDITION_OPTIONS as readonly string[]).indexOf(item.condition || "");
      return idx < 0 ? CONDITION_OPTIONS.length : idx;
    }
    case "quantity":        return item.currentQuantity ?? 0;
    case "marketPrice":     return item.currentRawMarketPrice ?? 0;
    case "printedPrice":    return item.currentRoundedPrintPrice ?? 0;
    case "totalValue":      return (item.currentRawMarketPrice ?? 0) * (item.currentQuantity ?? 0);
    case "priceChange24hr": return item.priceChange24hr ?? 0;
    case "priceChange7d":   return item.priceChange7d ?? 0;
    case "labelStatus":     return item.labelStatus || "";
    case "acquired":        return timeOf(item.firstSeenAt);
    case "updatedAt":       return timeOf(item.updatedAt || item.lastSeenAt);
    default:                return 0;
  }
}

export function sortItems(items: InventoryItem[], field: SortField, dir: SortDir): InventoryItem[] {
  const decorated = items.map((i) => ({ i, m: parseMeta(i) }));
  decorated.sort((a, b) => {
    const va = sortValue(a.i, a.m, field);
    const vb = sortValue(b.i, b.m, field);
    let cmp: number;
    if (typeof va === "string" || typeof vb === "string") {
      cmp = String(va).localeCompare(String(vb));
    } else {
      cmp = va - vb;
    }
    if (cmp === 0) cmp = (a.i.productName || "").localeCompare(b.i.productName || "");
    return dir === "asc" ? cmp : -cmp;
  });
  return decorated.map((d) => d.i);
}

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

// Maps table columns to their corresponding sort field (columns with no sensible
// sort, like "total", map to null and render without a sort affordance).
export const COLUMN_SORT_FIELD: Record<ColumnKey, SortField | null> = {
  card:      "name",
  condition: "condition",
  game:      "game",
  qty:       "quantity",
  market:    "marketPrice",
  print:     "printedPrice",
  total:     null,
};

export const LABEL_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  needs_label:     { label: "Needs Label",     className: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: null },
  needs_repricing: { label: "Needs Repricing", className: "bg-blue-500/15  text-blue-400  border-blue-500/30",  icon: null },
  label_created:   { label: "Label Created",   className: "bg-green-500/15 text-green-400 border-green-500/30", icon: null },
};

export const LABEL_FILTER_OPTIONS: {
  key: LabelFilter;
  label: string;
  cls: string;
}[] = [
  { key: "all",             label: "All",             cls: "inline-block w-2 h-2 rounded-full bg-muted-foreground/40" },
  { key: "needs_label",     label: "Needs Label",     cls: "inline-block w-2 h-2 rounded-full bg-amber-400" },
  { key: "needs_repricing", label: "Needs Repricing", cls: "inline-block w-2 h-2 rounded-full bg-blue-400" },
  { key: "label_created",   label: "Label Created",   cls: "inline-block w-2 h-2 rounded-full bg-green-400" },
];

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
