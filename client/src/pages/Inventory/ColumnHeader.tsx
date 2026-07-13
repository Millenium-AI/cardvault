import { ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { ColumnKey, COLUMN_ALIGN, COLUMN_SORT_FIELD, SortField, SortDir } from "./constants";

/**
 * A single reorderable, sortable table column header.
 *
 * Drag-and-drop reordering is powered by @dnd-kit/sortable (see the
 * SortableContext + DndContext wiring in index.tsx) instead of native HTML5
 * drag events — this gives smooth animated reflow of neighboring columns as
 * you drag, a proper drag overlay, and keyboard/pointer/touch accessibility
 * for free.
 *
 * Clicking the label (not the grip handle) triggers sorting, independent of
 * the drag gesture, so the two interactions never conflict.
 */
export function DraggableColHeader({
  id, children, onSort, sortField, sortDir,
}: {
  id: ColumnKey;
  children: React.ReactNode;
  onSort?: () => void;
  sortField?: SortField;
  sortDir?: SortDir;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const isSorted = !!onSort && sortField === COLUMN_SORT_FIELD[id];

  return (
    <th
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
      className={cn(
        "group px-4 py-3 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wide",
        "select-none whitespace-nowrap bg-muted/30",
        isDragging && "opacity-70 relative shadow-lg",
        COLUMN_ALIGN[id]
      )}
    >
      <div className={cn(
        "flex items-center gap-1.5",
        COLUMN_ALIGN[id] === "text-right"  && "flex-row-reverse justify-end",
        COLUMN_ALIGN[id] === "text-center" && "justify-center",
        COLUMN_ALIGN[id] === "text-left"   && "justify-start",
      )}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex items-center justify-center text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab active:cursor-grabbing touch-none"
          aria-label={`Reorder ${children} column`}
        >
          <GripVertical size={12} />
        </button>
        <span
          className={cn(onSort && "cursor-pointer hover:text-foreground/80 transition-colors")}
          onClick={onSort ? () => onSort() : undefined}
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
