import { ArrowDownUp, ArrowUp, ArrowDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SORT_OPTIONS, type SortField, type SortDir } from "./constants";

interface Props {
  sortField: SortField;
  sortDir: SortDir;
  /** Pick a field. If it is already active, direction is toggled instead. */
  onSelect: (field: SortField) => void;
  onToggleDir: () => void;
}

export function SortMenu({ sortField, sortDir, onSelect, onToggleDir }: Props) {
  const active = SORT_OPTIONS.find((o) => o.field === sortField);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5" data-testid="button-sort">
          <ArrowDownUp size={14} />
          Sort
          {active && (
            <span className="text-muted-foreground hidden sm:inline">
              : {active.label} {sortDir === "asc" ? "↑" : "↓"}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold">Sort by</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={onToggleDir}
            data-testid="button-sort-dir"
          >
            {sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {sortDir === "asc" ? "Ascending" : "Descending"}
          </Button>
        </div>
        <div className="py-1 max-h-[60vh] overflow-y-auto">
          {SORT_OPTIONS.map((opt) => {
            const isActive = opt.field === sortField;
            return (
              <button
                key={opt.field}
                onClick={() => onSelect(opt.field)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors hover:bg-accent/30",
                  isActive && "text-primary font-medium",
                )}
              >
                <span>{opt.label}</span>
                {isActive &&
                  (sortDir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                {!isActive && <Check size={13} className="opacity-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
