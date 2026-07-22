import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Minus, X, Trash2, Pencil, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { gameLabel } from "@shared/gameLabels";
import { GAMES } from "@/pages/Uploads/UploadForm";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import {
  CHANNELS, SALE_PAYMENT_METHODS, CONDITIONS, TRADE_PERCENT_OPTIONS, fmtMoney, fmtPrintPrice,
} from "./constants";
import { useCreateTransaction } from "./hooks";
import { tradeCreditValue, allocatePrices } from "@shared/lib/transactionMath";

type TxType = "sale" | "trade";

interface OutgoingSel {
  item: any;
  quantity: number;
}

interface IncomingRow {
  id: string;
  source: "search" | "manual";
  productName: string;
  game: string;
  condition: string;
  printing: string | null;
  quantity: number;
  marketPrice: string;
  percentOverride: number | null;
  // Provenance — only populated when source === "search".
  tcgplayerId: string | null;
  cardUuid: string | null;
  variantUuid: string | null;
  tcgplayerSkuId: string | null;
}

/* ─────────────────────── helpers ─────────────────────── */

/** Sum of print price × qty across outgoing selection. Pending items ($0) are
 *  included in the sum as $0 — they contribute nothing but don't crash. */
function calcOutgoingDefault(selected: Record<string, OutgoingSel>): string {
  const sum = Object.values(selected).reduce((s, { item, quantity }) => {
    return s + (item.currentRoundedPrintPrice ?? 0) * quantity;
  }, 0);
  return sum > 0 ? String(sum) : "";
}

/** Sum of exact-market-price trade credit (price × effective % × qty) across
 *  incoming rows, using the same tested tradeCreditValue() the backend uses. */
function calcIncomingDefault(rows: IncomingRow[], defaultPercent: number): string {
  const sum = rows.reduce((s, r) => {
    const price = parseFloat(r.marketPrice) || 0;
    const percent = r.percentOverride ?? defaultPercent;
    return s + tradeCreditValue(price, percent) * r.quantity;
  }, 0);
  return sum > 0 ? String(sum) : "";
}

/**
 * Per-row credit + effective trade percent for incoming rows.
 *
 * When `overrideTotal` is null, each row's credit is simply
 * tradeCreditValue(price, effPercent) * qty — no redistribution.
 *
 * When `overrideTotal` is a number (the user has hand-edited the incoming
 * credit total), redistributes that total across rows proportionally to
 * price × qty via the shared allocatePrices() helper — the same allocation
 * function/behavior used for the outgoing total override — then back-solves
 * an effective trade percent per row (credit / (price × qty)) so the result
 * can still be submitted as a normal tradePercent, with no backend changes
 * needed.
 */
function computeIncomingAllocation(
  rows: IncomingRow[],
  defaultPercent: number,
  overrideTotal: number | null,
): { credit: number; percent: number }[] {
  if (overrideTotal == null) {
    return rows.map(r => {
      const price = parseFloat(r.marketPrice) || 0;
      const percent = r.percentOverride ?? defaultPercent;
      return { credit: tradeCreditValue(price, percent) * r.quantity, percent };
    });
  }
  const weights = rows.map(r => ({ marketPrice: parseFloat(r.marketPrice) || 0, qty: r.quantity }));
  const allocated = allocatePrices(weights, overrideTotal);
  return rows.map((r, i) => {
    const weight = (parseFloat(r.marketPrice) || 0) * r.quantity;
    const percent = weight > 0 ? allocated[i] / weight : (r.percentOverride ?? defaultPercent);
    return { credit: allocated[i], percent };
  });
}

/* ─────────────────────── trade % selector (shared) ─────────────────────── */

function PercentSelector({
  value, onChange,
}: { value: number; onChange: (v: number) => void }) {
  const isPreset = TRADE_PERCENT_OPTIONS.some(o => o.value === value);
  const [custom, setCustom] = useState(!isPreset);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {TRADE_PERCENT_OPTIONS.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => { setCustom(false); onChange(o.value); }}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors shrink-0",
            !custom && value === o.value
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setCustom(true)}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors shrink-0",
          custom
            ? "border-primary bg-primary/15 text-primary"
            : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground",
        )}
      >
        Custom
      </button>
      {custom && (
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={1}
            max={100}
            value={Math.round(value * 100)}
            onChange={e => {
              const pct = Math.max(1, Math.min(100, parseInt(e.target.value) || 0));
              onChange(pct / 100);
            }}
            className="w-16 h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── outgoing (my inventory) picker ─────────────────────── */

function OutgoingPicker({
  inventory, selected, onChange,
}: {
  inventory: any[];
  selected: Record<string, OutgoingSel>;
  onChange: (next: Record<string, OutgoingSel>) => void;
}) {
  const [search, setSearch] = useState("");

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = inventory.filter(i => !selected[i.id]);
    if (!q) return base.slice(0, 8);
    return base
      .filter(i =>
        (i.productName || "").toLowerCase().includes(q) ||
        (i.number || "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [inventory, selected, search]);

  function add(item: any) {
    onChange({ ...selected, [item.id]: { item, quantity: 1 } });
  }
  function remove(id: string) {
    const next = { ...selected };
    delete next[id];
    onChange(next);
  }
  function setQty(id: string, qty: number) {
    const sel = selected[id];
    if (!sel) return;
    const max = sel.item.currentQuantity ?? Infinity;
    onChange({ ...selected, [id]: { ...sel, quantity: Math.min(max, Math.max(1, qty)) } });
  }

  const selList = Object.values(selected);

  return (
    <div className="space-y-2">
      {selList.length > 0 && (
        <div className="space-y-1">
          {selList.map(({ item, quantity }) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{item.productName}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span>{gameLabel(item.game)}</span>
                  {item.condition && <><span>·</span><span>{item.condition}</span></>}
                  <span>·</span>
                  {/* 1a: show print price; "Pending" when null */}
                  <span className={cn(
                    "tabular-nums",
                    item.currentRoundedPrintPrice == null && "text-amber-400 font-medium",
                  )}>
                    {fmtPrintPrice(item.currentRoundedPrintPrice)}
                  </span>
                  <span>·</span>
                  <span className="tabular-nums">{item.currentQuantity} on hand</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setQty(item.id, quantity - 1)} className="w-6 h-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent">
                  <Minus size={12} />
                </button>
                <span className="w-6 text-center text-xs tabular-nums text-foreground">{quantity}</span>
                <button type="button" onClick={() => setQty(item.id, quantity + 1)} className="w-6 h-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent">
                  <Plus size={12} />
                </button>
              </div>
              <button type="button" onClick={() => remove(item.id)} className="shrink-0 p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search inventory to add…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 h-9 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-colors"
        />
      </div>

      {results.length > 0 && (
        <div className="max-h-44 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
          {results.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => add(item)}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent transition-colors"
            >
              <Plus size={12} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{item.productName}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span>{gameLabel(item.game)}</span>
                  {item.condition && <><span>·</span><span>{item.condition}</span></>}
                  <span>·</span>
                  {/* 1a: show print price in results list too */}
                  <span className={cn(
                    "tabular-nums",
                    item.currentRoundedPrintPrice == null && "text-amber-400 font-medium",
                  )}>
                    {fmtPrintPrice(item.currentRoundedPrintPrice)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── incoming (trade-in) search + rows ─────────────────────── */

interface SearchVariant {
  variantUuid: string | null;
  condition: string | null;
  printing: string | null;
  price: number | null;
  tcgplayerSkuId: string | null;
}
interface SearchCard {
  cardUuid: string | null;
  name: string;
  game: string | null;
  setName: string | null;
  number: string | null;
  tcgplayerId: string | null;
  variants: SearchVariant[];
}

/** Inline search box + expandable result for adding trade-in cards by exact
 *  market price (reuses /api/search/cards — the same endpoint the Search
 *  tab uses). Expanding a result lets you pick condition/printing and qty
 *  before adding it as an incoming row. */
function IncomingSearchPicker({ onAdd }: { onAdd: (row: IncomingRow) => void }) {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [variantIndex, setVariantIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [manualOpen, setManualOpen] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ["/api/search/cards", activeQuery],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/search/cards?q=${encodeURIComponent(activeQuery)}`);
      if (!res.ok) return { results: [] };
      return res.json();
    },
    enabled: activeQuery.length > 0,
    staleTime: 60 * 1000,
  });

  const results: SearchCard[] = data?.results ?? [];

  function runSearch() { setActiveQuery(query.trim()); }

  function openResult(card: SearchCard, key: string) {
    if (expandedKey === key) { setExpandedKey(null); return; }
    setExpandedKey(key);
    setVariantIndex(0);
    setQuantity(1);
  }

  function addFromSearch(card: SearchCard) {
    const variant = card.variants?.[variantIndex] ?? null;
    onAdd({
      id: crypto.randomUUID(),
      source: "search",
      productName: card.name,
      game: card.game ?? "pokemon",
      condition: variant?.condition ?? "Near Mint",
      printing: variant?.printing ?? null,
      quantity,
      marketPrice: variant?.price != null ? String(variant.price) : "",
      percentOverride: null,
      tcgplayerId: card.tcgplayerId ?? null,
      cardUuid: card.cardUuid ?? null,
      variantUuid: variant?.variantUuid ?? null,
      tcgplayerSkuId: variant?.tcgplayerSkuId ?? null,
    });
    setExpandedKey(null);
    setQuery("");
    setActiveQuery("");
  }

  function addManualRow() {
    onAdd({
      id: crypto.randomUUID(),
      source: "manual",
      productName: "",
      game: "pokemon",
      condition: "Near Mint",
      printing: null,
      quantity: 1,
      marketPrice: "",
      percentOverride: null,
      tcgplayerId: null,
      cardUuid: null,
      variantUuid: null,
      tcgplayerSkuId: null,
    });
    setManualOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search for a card to add as a trade-in…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") runSearch(); }}
          className="w-full pl-8 pr-16 h-9 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-colors"
        />
        <button
          type="button"
          onClick={runSearch}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 px-2 rounded text-[11px] font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
        >
          Search
        </button>
      </div>

      {isFetching && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-2">
          <Loader2 size={12} className="animate-spin" /> Searching…
        </div>
      )}

      {!isFetching && activeQuery && results.length === 0 && (
        <div className="text-xs text-muted-foreground py-1">
          No cards found for "{activeQuery}".
        </div>
      )}

      {!isFetching && results.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
          {results.map((card, i) => {
            const key = `${card.cardUuid ?? card.name}-${i}`;
            const expanded = expandedKey === key;
            const variants = card.variants ?? [];
            const variant = variants[variantIndex] ?? null;
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => openResult(card, key)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent transition-colors"
                >
                  <Plus size={12} className={cn("shrink-0", expanded ? "text-primary rotate-45 transition-transform" : "text-primary")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{card.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      {card.setName && <span>{card.setName}</span>}
                      {card.number && <><span>·</span><span>#{card.number}</span></>}
                    </div>
                  </div>
                </button>
                {expanded && (
                  <div className="px-2.5 pb-2.5 space-y-2 bg-muted/20">
                    {variants.length > 0 ? (
                      <Select value={String(variantIndex)} onValueChange={v => setVariantIndex(Number(v))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {variants.map((v, vi) => (
                            <SelectItem key={vi} value={String(vi)}>
                              {[v.condition, v.printing].filter(Boolean).join(" · ") || "Standard"}
                              {v.price != null ? ` — $${v.price.toFixed(2)}` : " — —"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">No pricing variants available for this card.</div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0">
                          <Minus size={12} />
                        </button>
                        <span className="w-6 text-center text-xs tabular-nums text-foreground">{quantity}</span>
                        <button type="button" onClick={() => setQuantity(q => q + 1)} className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0">
                          <Plus size={12} />
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Market: <span className="font-mono text-foreground">{variant?.price != null ? `$${variant.price.toFixed(2)}` : "—"}</span>
                      </div>
                      <Button type="button" size="sm" className="ml-auto h-7 text-xs" onClick={() => addFromSearch(card)}>
                        Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!manualOpen ? (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="text-[11px] text-muted-foreground hover:text-foreground underline"
        >
          Can't find it? Add manually
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Manual entry adds a blank row you fill in below.</span>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs ml-auto" onClick={addManualRow}>
            <Plus size={12} className="mr-1" /> Add manually
          </Button>
        </div>
      )}
    </div>
  );
}

function IncomingRows({
  rows, onChange, defaultPercent, inventory, overrideCreditTotal,
}: {
  rows: IncomingRow[];
  onChange: (next: IncomingRow[]) => void;
  defaultPercent: number;
  inventory: any[];
  /** Parsed value of the incoming-credit total input when the user has
   *  hand-edited it; null when the total is still auto-calculated. */
  overrideCreditTotal: number | null;
}) {
  function update(id: string, patch: Partial<IncomingRow>) {
    onChange(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rows.filter(r => r.id !== id));
  }
  function addRow(row: IncomingRow) {
    onChange([...rows, row]);
  }

  // Best-effort auto price for manual rows: match a typed product name to an
  // inventory item's cached market price (same price cache the rest of the
  // app uses). Search-added rows already have an exact price and skip this.
  function autoPrice(row: IncomingRow) {
    if (row.source !== "manual") return;
    const name = row.productName.trim().toLowerCase();
    if (!name) return;
    const match = inventory.find(i => (i.productName || "").toLowerCase() === name);
    if (match?.currentRawMarketPrice != null) {
      update(row.id, { marketPrice: String(match.currentRawMarketPrice) });
    }
  }

  const allocation = computeIncomingAllocation(rows, defaultPercent, overrideCreditTotal);
  const overrideActive = overrideCreditTotal != null;

  return (
    <div className="space-y-2">
      <IncomingSearchPicker onAdd={addRow} />

      {rows.map((row, i) => {
        const { credit, percent: effPercent } = allocation[i];
        const overridden = row.percentOverride != null;
        return (
          <div
            key={row.id}
            className={cn(
              "rounded-lg border p-2.5 space-y-2",
              overridden ? "border-amber-500/40 bg-amber-500/5" : "border-border",
            )}
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Product name"
                value={row.productName}
                onChange={e => update(row.id, { productName: e.target.value })}
                onBlur={() => autoPrice(row)}
                readOnly={row.source === "search"}
                className={cn(
                  "flex-1 min-w-0 h-8 px-2 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none",
                  row.source === "search" && "opacity-80",
                )}
              />
              {row.source === "search" && (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Searched</span>
              )}
              <button type="button" onClick={() => remove(row.id)} className="shrink-0 p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                <Trash2 size={13} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Select value={row.game} onValueChange={v => update(row.id, { game: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Game" /></SelectTrigger>
                <SelectContent>
                  {GAMES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={row.condition} onValueChange={v => update(row.id, { condition: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Condition" /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1">
                <button type="button" onClick={() => update(row.id, { quantity: Math.max(1, row.quantity - 1) })} className="w-7 h-8 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0">
                  <Minus size={12} />
                </button>
                <span className="flex-1 text-center text-xs tabular-nums text-foreground">{row.quantity}</span>
                <button type="button" onClick={() => update(row.id, { quantity: row.quantity + 1 })} className="w-7 h-8 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent shrink-0">
                  <Plus size={12} />
                </button>
              </div>

              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Market"
                  value={row.marketPrice}
                  onChange={e => update(row.id, { marketPrice: e.target.value })}
                  className="w-full h-8 pl-5 pr-2 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Credit</span>
                <span className="font-mono font-semibold text-foreground tabular-nums">{fmtMoney(credit)}</span>
                <span className={cn("tabular-nums", overridden ? "text-amber-400 font-medium" : "text-muted-foreground")}>
                  @ {Math.round(effPercent * 100)}%
                </span>
              </div>
              {overrideActive ? (
                <span className="text-[11px] text-muted-foreground italic">set by total override</span>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:border-primary hover:bg-primary/10 transition-colors">
                      <Pencil size={10} /> Edit %
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" className="w-auto p-3 space-y-2">
                    <div className="text-[11px] font-medium text-muted-foreground">Trade % for this card</div>
                    <PercentSelector value={effPercent} onChange={v => update(row.id, { percentOverride: v })} />
                    {overridden && (
                      <button type="button" onClick={() => update(row.id, { percentOverride: null })} className="text-[11px] text-muted-foreground hover:text-foreground underline">
                        Reset to default ({Math.round(defaultPercent * 100)}%)
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────── form body ─────────────────────── */

function SegPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-2 rounded-lg text-sm font-semibold transition-colors",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function LogTransactionBody({
  inventory, shows, onClose,
}: { inventory: any[]; shows: any[]; onClose: () => void }) {
  const [type, setType] = useState<TxType>("sale");
  const [selected, setSelected] = useState<Record<string, OutgoingSel>>({});
  const [salePayment, setSalePayment] = useState("cash");
  // 1b: totalPrice auto-fills from print price sum; user can always type over it.
  const [totalPrice, setTotalPrice] = useState("");
  // Track whether the user has manually edited totalPrice so we only auto-fill
  // when they haven't diverged. Ref (not state) avoids re-render on write.
  const totalPriceDirty = useRef(false);
  const [defaultPercent, setDefaultPercent] = useState(0.8);
  const [incoming, setIncoming] = useState<IncomingRow[]>([]);
  // Step 3: incomingCreditTotal auto-fills from exact-market-price credit sum;
  // user can always type over it, same dirty-tracking pattern as totalPrice.
  const [incomingCreditTotal, setIncomingCreditTotal] = useState("");
  const incomingCreditDirty = useRef(false);
  const [includeCash, setIncludeCash] = useState(false);
  const [cashDelta, setCashDelta] = useState("");
  const [channel, setChannel] = useState("in_person");
  const [showId, setShowId] = useState<string>("none");
  const [notes, setNotes] = useState("");

  const createMut = useCreateTransaction(onClose);

  const outgoingList = Object.values(selected);
  const incomingCreditOverride = incomingCreditDirty.current ? (parseFloat(incomingCreditTotal) || 0) : null;
  const incomingAllocation = computeIncomingAllocation(incoming, defaultPercent, incomingCreditOverride);
  const incomingCredit = incomingAllocation.reduce((s, a) => s + a.credit, 0);

  // 1b: auto-fill totalPrice from sum of print price × qty whenever the
  // outgoing selection changes, unless the user has manually edited the field.
  useEffect(() => {
    if (totalPriceDirty.current) return;
    const next = calcOutgoingDefault(selected);
    setTotalPrice(next);
  }, [selected]);

  // Step 3: auto-fill incomingCreditTotal from the exact-market-price credit
  // sum whenever incoming rows or the default percent change, unless the
  // user has manually edited the field.
  useEffect(() => {
    if (incomingCreditDirty.current) return;
    const next = calcIncomingDefault(incoming, defaultPercent);
    setIncomingCreditTotal(next);
  }, [incoming, defaultPercent]);

  const canSave =
    type === "sale"
      ? outgoingList.length > 0 && parseFloat(totalPrice) > 0
      : outgoingList.length > 0 || incoming.some(r => r.productName.trim());

  function handleSave() {
    const outgoingItems = outgoingList.map(({ item, quantity }) => ({
      inventoryItemId: item.id,
      quantity,
      // Send print price as per-item weight; null when pending so backend falls
      // back to currentRoundedPrintPrice.
      marketPrice: item.currentRoundedPrintPrice ?? null,
    }));

    const base = {
      channel,
      showId: showId === "none" ? null : showId,
      notes: notes.trim() || null,
    };

    if (type === "sale") {
      createMut.mutate({
        ...base,
        type: "sale",
        paymentMethod: salePayment,
        cashAmount: parseFloat(totalPrice) || 0,
        // 1b: pass allocationTotal so backend allocatePrices redistributes
        // proportionally when totalPrice differs from the per-item sum.
        allocationTotal: parseFloat(totalPrice) || undefined,
        outgoingItems,
      });
    } else {
      // Step 3: submit each row's *effective* trade percent — when the
      // incoming credit total was overridden, this is the back-solved
      // percent from computeIncomingAllocation() (proportional redistribution
      // via the shared allocatePrices() helper); otherwise it's just the
      // row's own percentOverride ?? defaultPercent, unchanged from before.
      // Keyed by row id (not array index) since the payload below filters
      // out blank rows first, which would otherwise misalign indices.
      const allocationById = new Map(incoming.map((r, i) => [r.id, incomingAllocation[i]]));
      createMut.mutate({
        ...base,
        type: "trade",
        paymentMethod: includeCash ? "trade_plus_cash" : "trade",
        cashAmount: includeCash ? parseFloat(cashDelta) || 0 : null,
        defaultTradePercent: defaultPercent,
        outgoingItems,
        incomingItems: incoming
          .filter(r => r.productName.trim())
          .map(r => ({
            productName: r.productName.trim(),
            game: r.game,
            condition: r.condition || null,
            quantity: r.quantity,
            cachedMarketPrice: parseFloat(r.marketPrice) || null,
            tradePercent: allocationById.get(r.id)?.percent ?? (r.percentOverride ?? defaultPercent),
            // Provenance for search-backed rows — lets the backend re-fetch a
            // price on save if cachedMarketPrice is ever missing (it won't be,
            // for search rows, but this keeps the fields populated for
            // consistency with what the route already accepts).
            tcgplayerId: r.tcgplayerId ?? undefined,
            printing: r.printing ?? undefined,
          })),
      });
    }
  }

  const fieldLabel = "text-xs text-muted-foreground block mb-1";

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* Type toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1">
          <SegPill active={type === "sale"} onClick={() => setType("sale")}>Sale</SegPill>
          <SegPill active={type === "trade"} onClick={() => setType("trade")}>Trade</SegPill>
        </div>

        {/* Outgoing items */}
        <div>
          <div className={fieldLabel}>{type === "trade" ? "Cards you're trading away" : "Cards sold"}</div>
          <OutgoingPicker inventory={inventory} selected={selected} onChange={setSelected} />
        </div>

        {type === "sale" ? (
          <>
            <div>
              <div className={fieldLabel}>Payment method</div>
              <div className="flex items-center gap-1.5">
                {SALE_PAYMENT_METHODS.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setSalePayment(m.value)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
                      salePayment === m.value
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className={fieldLabel}>
                Total price
                {/* Subtle hint that the value is auto-calculated from print prices */}
                {outgoingList.length > 0 && !totalPriceDirty.current && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground/70">(auto)</span>
                )}
              </div>
              <div className="relative max-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={totalPrice}
                  onChange={e => {
                    totalPriceDirty.current = true;
                    setTotalPrice(e.target.value);
                  }}
                  className="h-11 text-sm pl-7"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className={fieldLabel}>Default trade %</div>
              <PercentSelector value={defaultPercent} onChange={setDefaultPercent} />
            </div>
            <div>
              <div className={fieldLabel}>Cards you're receiving</div>
              <IncomingRows
                rows={incoming}
                onChange={setIncoming}
                defaultPercent={defaultPercent}
                inventory={inventory}
                overrideCreditTotal={incomingCreditOverride}
              />
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeCash} onChange={e => setIncludeCash(e.target.checked)} className="accent-primary" />
                <span className="text-xs font-medium text-foreground">Add cash to the trade</span>
              </label>
              {includeCash && (
                <div>
                  <div className={fieldLabel}>Cash delta (positive = you receive, negative = you pay)</div>
                  <div className="relative max-w-[200px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                    <Input type="number" step="0.01" placeholder="0.00" value={cashDelta} onChange={e => setCashDelta(e.target.value)} className="h-11 text-sm pl-7" />
                  </div>
                </div>
              )}
              <div>
                <div className={fieldLabel}>
                  Trade-in credit total
                  {incoming.length > 0 && !incomingCreditDirty.current && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground/70">(auto)</span>
                  )}
                </div>
                <div className="relative max-w-[200px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={incomingCreditTotal}
                    onChange={e => {
                      incomingCreditDirty.current = true;
                      setIncomingCreditTotal(e.target.value);
                    }}
                    className="h-9 text-sm pl-7"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Attach to show + channel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className={fieldLabel}>Channel</div>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className={fieldLabel}>Attach to show (optional)</div>
            <Select value={showId} onValueChange={setShowId}>
              <SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Unattached" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unattached</SelectItem>
                {shows.map(s => <SelectItem key={s.id} value={s.id}>{s.showName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className={fieldLabel}>Notes</div>
          <Textarea rows={2} className="text-sm resize-none" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 pt-3 pb-4 border-t border-border bg-card" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave || createMut.isPending}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {createMut.isPending ? "Saving…" : "Save Transaction"}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────── responsive wrappers ─────────────────────── */

export function LogTransaction({
  open, onClose, inventory, shows,
}: { open: boolean; onClose: () => void; inventory: any[]; shows: any[] }) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        {open && (
          <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[90dvh] p-0 flex flex-col gap-0 overflow-hidden bg-card border-border">
            <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0 text-left">
              <DialogTitle className="text-base font-semibold">Log Transaction</DialogTitle>
            </DialogHeader>
            <LogTransactionBody inventory={inventory} shows={shows} onClose={onClose} />
          </DialogContent>
        )}
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DrawerContent className="bg-card border-border max-h-[94dvh] flex flex-col focus:outline-none">
        <div className="flex items-center justify-between px-4 pt-1 pb-2 border-b border-border shrink-0">
          <DrawerTitle className="text-base font-semibold text-foreground">Log Transaction</DrawerTitle>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:text-foreground active:bg-muted transition-colors" aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <LogTransactionBody inventory={inventory} shows={shows} onClose={onClose} />
      </DrawerContent>
    </Drawer>
  );
}
