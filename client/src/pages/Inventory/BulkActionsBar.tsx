import { CheckSquare, Square, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useBulkPatchMutation, useBulkDeleteMutation } from "./hooks/useInventoryMutations";

export function BulkActionBar({
  selectedIds, allCount, onSelectAll, onDeselectAll, onCancel,
}: {
  selectedIds: Set<string>; allCount: number;
  onSelectAll: () => void; onDeselectAll: () => void; onCancel: () => void;
}) {
  const { toast } = useToast();
  const [pendingCondition, setPendingCondition] = useState("");
  const [pendingQty, setPendingQty] = useState("");
  const ids = Array.from(selectedIds);
  const someSelected = selectedIds.size > 0;
  const allSelected = allCount > 0 && selectedIds.size === allCount;

  const bulkPatchMut = useBulkPatchMutation();
  const bulkDeleteMut = useBulkDeleteMutation();

  function applyCondition(cond: string) {
    if (!cond || !someSelected) return;
    bulkPatchMut.mutate({ ids, patch: { condition: cond } });
    setPendingCondition("");
  }

  function applyQty() {
    const qty = parseInt(pendingQty, 10);
    if (isNaN(qty) || qty < 0 || !someSelected) return;
    bulkPatchMut.mutate({ ids, patch: { currentQuantity: qty } });
    setPendingQty("");
  }

  function handleDelete() {
    if (!someSelected) return;
    if (confirm(`Delete ${ids.length} item${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) bulkDeleteMut.mutate(ids);
  }

  return (
    <div
      className="fixed left-0 right-0 z-50 animate-in slide-in-from-bottom-2 duration-200 px-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:px-0"
      style={{ bottom: "calc(56px + env(safe-area-inset-bottom) + 8px)" }}
    >
      <div className="rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl shadow-black/40 ring-1 ring-white/5 px-3 py-2.5">
        {/* Row 1: select toggle + count + delete + close */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
            title={allSelected ? "Deselect all" : "Select all"}>
            {allSelected
              ? <CheckSquare size={16} className="text-primary" />
              : <Square size={16} />}
          </button>
          <span className="text-sm font-semibold text-foreground tabular-nums flex-1">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm" variant="ghost"
            className="h-8 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2.5 shrink-0"
            onClick={handleDelete} disabled={!someSelected || bulkDeleteMut.isPending}>
            <Trash2 size={13} />{bulkDeleteMut.isPending ? "Deleting…" : "Delete"}
          </Button>
          <button
            onClick={onCancel}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            title="Exit bulk mode">
            <X size={15} />
          </button>
        </div>

        {/* Row 2: condition picker + qty input */}
        <div className="flex items-center gap-2">
          <Select value={pendingCondition} onValueChange={applyCondition} disabled={bulkPatchMut.isPending || !someSelected}>
            <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
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
          <div className="flex items-center gap-1 shrink-0">
            <Input
              type="number" min="0" placeholder="Qty"
              value={pendingQty} onChange={e => setPendingQty(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyQty()}
              className="h-8 w-14 text-xs font-mono px-2" />
            <Button
              size="sm" variant="outline" className="h-8 text-xs px-2.5 shrink-0"
              onClick={applyQty} disabled={!pendingQty || !someSelected || bulkPatchMut.isPending}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
