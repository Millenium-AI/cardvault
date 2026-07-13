import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnKey, COLUMN_ALIGN, COLUMN_SORT_FIELD, SortField, SortDir } from "./constants";

export function DraggableColHeader({
  id, children, onMove, onSort, sortField, sortDir,
}: {
  id: ColumnKey;
  children: React.ReactNode;
  onMove: (dragged: ColumnKey, target: ColumnKey) => void;
  onSort?: () => void;
  sortField?: SortField;
  sortDir?: SortDir;
}) {
  const isSorted = !!onSort && sortField === COLUMN_SORT_FIELD[id];
  return (
    <th
      draggable
      onDragStart={e => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDrop={e => { e.preventDefault(); const d = e.dataTransfer.getData("text/plain") as ColumnKey; if (d && d !== id) onMove(d, id); }}
      className={cn(
        "group px-4 py-3 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wide",
        "cursor-grab active:cursor-grabbing select-none whitespace-nowrap",
        COLUMN_ALIGN[id]
      )}
    >
      <div className={cn(
        "flex items-center gap-1.5",
        COLUMN_ALIGN[id] === "text-right"  && "flex-row-reverse justify-end",
        COLUMN_ALIGN[id] === "text-center" && "justify-center",
        COLUMN_ALIGN[id] === "text-left"   && "justify-start",
      )}>
        <div className="flex flex-col gap-[3px] opacity-0 group-hover:opacity-40 transition-opacity shrink-0">
          <div className="flex gap-[3px]"><div className="w-[2.5px] h-[2.5px] rounded-full bg-current" /><div className="w-[2.5px] h-[2.5px] rounded-full bg-current" /></div>
          <div className="flex gap-[3px]"><div className="w-[2.5px] h-[2.5px] rounded-full bg-current" /><div className="w-[2.5px] h-[2.5px] rounded-full bg-current" /></div>
          <div className="flex gap-[3px]"><div className="w-[2.5px] h-[2.5px] rounded-full bg-current" /><div className="w-[2.5px] h-[2.5px] rounded-full bg-current" /></div>
        </div>
        <span
          className={cn(onSort && "cursor-pointer hover:text-foreground/80 transition-colors")}
          onClick={onSort ? (e) => { e.stopPropagation(); onSort(); } : undefined}
        >
          {children}
        </span>
        {isSorted && (
          sortDir === "asc"
            ? <ChevronUp size={11} className="text-foreground/70 shrink-0" />
            : <ChevronDown size={11} className="text-foreground/70 shrink-0" />
        )}
      </div>
    </th>
  );
}
