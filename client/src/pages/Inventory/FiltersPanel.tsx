import { useMemo } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { InventoryItem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { gameLabel } from "@shared/gameLabels";
import {
  type InventoryFilters,
  CONDITION_OPTIONS,
  LABEL_STATUS_OPTIONS,
  PRICE_SOURCE_OPTIONS,
  parseMeta,
} from "./constants";

interface Props {
  filters: InventoryFilters;
  onChange: (patch: Partial<InventoryFilters>) => void;
  onReset: () => void;
  activeCount: number;
  /** Unfiltered item list — used to derive available option values. */
  items: InventoryItem[];
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function CheckList({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      <div className="flex flex-col gap-1">
        {options.map((opt) => (
          <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <Checkbox
              checked={selected.includes(opt.key)}
              onCheckedChange={() => onToggle(opt.key)}
              className="h-3.5 w-3.5"
            />
            <span className="truncate">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function FiltersPanel({ filters, onChange, onReset, activeCount, items }: Props) {
  const metas = useMemo(() => items.map(parseMeta), [items]);

  const gameOptions = useMemo(
    () => uniqueSorted(items.map((i) => i.game)).map((g) => ({ key: g, label: gameLabel(g) })),
    [items],
  );
  const setOptions = useMemo(
    () => uniqueSorted(metas.map((m) => m.sourceSetName)).map((s) => ({ key: s, label: s })),
    [metas],
  );
  const rarityOptions = useMemo(
    () => uniqueSorted(metas.map((m) => m.sourceRarity)).map((r) => ({ key: r, label: r })),
    [metas],
  );
  const printingOptions = useMemo(
    () => uniqueSorted(metas.map((m) => m.sourcePrinting)).map((p) => ({ key: p, label: p })),
    [metas],
  );
  const conditionOptions = useMemo(() => {
    const present = new Set(items.map((i) => i.condition || ""));
    return CONDITION_OPTIONS.filter((c) => present.has(c)).map((c) => ({ key: c, label: c }));
  }, [items]);

  function toggle(dim: keyof InventoryFilters, key: string) {
    const cur = filters[dim] as string[];
    onChange({ [dim]: cur.includes(key) ? cur.filter((v) => v !== key) : [...cur, key] } as Partial<InventoryFilters>);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={activeCount > 0 ? "secondary" : "outline"}
          size="sm"
          className="h-8 px-3 text-xs gap-1.5"
          data-testid="button-filters"
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold h-4 min-w-4 px-1">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">Filters</span>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={onReset}>
              <X size={12} />
              Clear all
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-4 p-4">
            <CheckList title="Game" options={gameOptions} selected={filters.games} onToggle={(k) => toggle("games", k)} />
            {setOptions.length > 0 && <Separator />}
            <CheckList title="Set" options={setOptions} selected={filters.sets} onToggle={(k) => toggle("sets", k)} />
            {rarityOptions.length > 0 && <Separator />}
            <CheckList title="Rarity" options={rarityOptions} selected={filters.rarities} onToggle={(k) => toggle("rarities", k)} />
            {printingOptions.length > 0 && <Separator />}
            <CheckList title="Printing" options={printingOptions} selected={filters.printings} onToggle={(k) => toggle("printings", k)} />
            {conditionOptions.length > 0 && <Separator />}
            <CheckList title="Condition" options={conditionOptions} selected={filters.conditions} onToggle={(k) => toggle("conditions", k)} />

            <Separator />
            <CheckList
              title="Label status"
              options={LABEL_STATUS_OPTIONS}
              selected={filters.labelStatuses}
              onToggle={(k) => toggle("labelStatuses", k)}
            />

            <Separator />
            <CheckList
              title="Price source"
              options={PRICE_SOURCE_OPTIONS}
              selected={filters.priceSources}
              onToggle={(k) => toggle("priceSources", k)}
            />

            <Separator />
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Market price ($)</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="Min"
                  value={filters.priceMin}
                  onChange={(e) => onChange({ priceMin: e.target.value })}
                  className="h-8 text-xs"
                />
                <span className="text-muted-foreground text-xs">–</span>
                <Input
                  type="number"
                  min={0}
                  placeholder="Max"
                  value={filters.priceMax}
                  onChange={(e) => onChange({ priceMax: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="Min"
                  value={filters.qtyMin}
                  onChange={(e) => onChange({ qtyMin: e.target.value })}
                  className="h-8 text-xs"
                />
                <span className="text-muted-foreground text-xs">–</span>
                <Input
                  type="number"
                  min={0}
                  placeholder="Max"
                  value={filters.qtyMax}
                  onChange={(e) => onChange({ qtyMax: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date acquired</span>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    value={filters.acquiredFrom}
                    onChange={(e) => onChange({ acquiredFrom: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    value={filters.acquiredTo}
                    onChange={(e) => onChange({ acquiredTo: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
