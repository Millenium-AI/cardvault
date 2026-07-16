import { CheckSquare, Square, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  useBulkPatchMutation,
  useBulkDeleteMutation,
} from "./hooks/useInventoryMutations";

export function BulkActionBar({
  selectedIds,
  allCount,
  onSelectAll,
  onDeselectAll,
  onCancel,
}: {
  selectedIds: Set<string>;
  allCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCancel: () => void;
}) {
  const [pendingCondition, setPendingCondition] = useState("");
  const [pendingQty, setPendingQty] = useState("");

  const ids = Array.from(selectedIds);
  const someSelected = selectedIds.size > 0;
  const allSelected = allCount > 0 && selectedIds.size === allCount;

  const bulkPatchMut = useBulkPatchMutation();
  const bulkDeleteMut = useBulkDeleteMutation();

  function applyChanges() {
    if (!someSelected) return;

    const patch: Record<string, any> = {};

    if (pendingCondition) {
      patch.condition = pendingCondition;
    }

    if (pendingQty !== "") {
      const qty = parseInt(pendingQty, 10);
      if (!isNaN(qty) && qty >= 0) {
        patch.currentQuantity = qty;
      }
    }

    if (Object.keys(patch).length === 0) return;

    bulkPatchMut.mutate({ ids, patch });
    setPendingCondition("");
    setPendingQty("");
  }

  function handleDelete() {
    if (!someSelected) return;
    if (
      confirm(`Delete ${ids.length} item${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)
    ) {
      bulkDeleteMut.mutate(ids);
    }
  }

  return (
    <div
      className="fixed left-0 right-0 z-50 animate-in slide-in-from-bottom-2 duration-200 px-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:px-0"
      style={{ bottom: "calc(56px + env(safe-area-inset-bottom) + 8px)" }}
    >
      {/* Mobile */}
      <div className="md:hidden rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl shadow-black/40 ring-1 ring-white/5 px-3 py-2.5">
        {/* Row 1 */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
            title={allSelected ? "Deselect all" : "Select all"}
          >
            {allSelected ? (
              <CheckSquare size={16} className="text-primary" />
            ) : (
              <Square size={16} />
            )}
          </button>

          <span className="text-sm font-semibold text-foreground tabular-nums flex-1 min-w-0">
            {selectedIds.size} selected
          </span>

          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2.5 shrink-0"
            onClick={handleDelete}
            disabled={!someSelected || bulkDeleteMut.isPending}
          >
            <Trash2 size={13} />
            {bulkDeleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>

          <button
            onClick={onCancel}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            title="Exit bulk mode"
          >
            <X size={15} />
          </button>
        </div>

        {/* Row 2 */}
        <div className="flex items-center gap-2">
          <div className="flex-[3] min-w-0">
            <Select
              value={pendingCondition}
              onValueChange={setPendingCondition}
              disabled={bulkPatchMut.isPending || !someSelected}
            >
              <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue placeholder="Set condition…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Near Mint">NM</SelectItem>
                <SelectItem value="Lightly Played">LP</SelectItem>
                <SelectItem value="Moderately Played">MP</SelectItem>
                <SelectItem value="Heavily Played">HP</SelectItem>
                <SelectItem value="Damaged">DMG</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-[2] flex items-center gap-1 min-w-0">
            <Input
              type="number"
              min="0"
              placeholder="Qty"
              value={pendingQty}
              onChange={(e) => setPendingQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyChanges()}
              className="h-8 flex-1 min-w-0 text-xs font-mono px-2"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs px-2 shrink-0"
              onClick={applyChanges}
              disabled={
                (!pendingCondition && pendingQty === "") ||
                !someSelected ||
                bulkPatchMut.isPending
              }
            >
              Apply
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:flex items-center gap-3 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl shadow-black/30 ring-1 ring-white/5 px-4 py-3 min-w-[760px]">
        <button
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors shrink-0"
          title={allSelected ? "Deselect all" : "Select all"}
        >
          {allSelected ? (
            <CheckSquare size={18} className="text-primary" />
          ) : (
            <Square size={18} />
          )}
          <span className="text-sm font-medium">
            {allSelected ? "Deselect all" : "Select all"}
          </span>
        </button>

        <div className="h-6 w-px bg-border shrink-0" />

        <span className="text-sm font-semibold text-foreground tabular-nums shrink-0 min-w-[110px]">
          {selectedIds.size} selected
        </span>

        <div className="h-6 w-px bg-border shrink-0" />

        <div className="w-[180px] shrink-0">
          <Select
            value={pendingCondition}
            onValueChange={setPendingCondition}
            disabled={bulkPatchMut.isPending || !someSelected}
          >
            <SelectTrigger className="h-10 text-sm w-full">
              <SelectValue placeholder="Set condition…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Near Mint">Near Mint</SelectItem>
              <SelectItem value="Lightly Played">Lightly Played</SelectItem>
              <SelectItem value="Moderately Played">Moderately Played</SelectItem>
              <SelectItem value="Heavily Played">Heavily Played</SelectItem>
              <SelectItem value="Damaged">Damaged</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Input
            type="number"
            min="0"
            placeholder="Quantity"
            value={pendingQty}
            onChange={(e) => setPendingQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyChanges()}
            className="h-10 w-[110px] text-sm font-mono px-3"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-10 px-4 text-sm shrink-0"
            onClick={applyChanges}
            disabled={
              (!pendingCondition && pendingQty === "") ||
              !someSelected ||
              bulkPatchMut.isPending
            }
          >
            Apply
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-10 text-sm gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3"
            onClick={handleDelete}
            disabled={!someSelected || bulkDeleteMut.isPending}
          >
            <Trash2 size={15} />
            {bulkDeleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-10 px-3 text-sm"
            onClick={onCancel}
          >
            <X size={15} />
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}