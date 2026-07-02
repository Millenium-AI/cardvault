import { CheckSquare, Square, Trash2, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl shadow-black/40 ring-1 ring-white/5 px-4 py-3">
        <button onClick={allSelected ? onDeselectAll : onSelectAll}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
          title={allSelected ? "Deselect all" : "Select all"}>
          {allSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
        </button>
        <span className="text-sm font-semibold text-foreground whitespace-nowrap tabular-nums">{selectedIds.size} selected</span>
        <div className="h-6 w-px bg-border" />
        <Select value={pendingCondition} onValueChange={applyCondition} disabled={bulkPatchMut.isPending || !someSelected}>
          <SelectTrigger className="h-9 text-sm w-[140px]"><SelectValue placeholder="Set condition…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Near Mint">NM</SelectItem>
            <SelectItem value="Lightly Played">LP</SelectItem>
            <SelectItem value="Moderately Played">MP</SelectItem>
            <SelectItem value="Heavily Played">HP</SelectItem>
            <SelectItem value="Damaged">DMG</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input type="number" min="0" placeholder="Qty" value={pendingQty}
            onChange={e => setPendingQty(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applyQty()}
            className="h-9 w-16 text-sm font-mono px-2.5" />
          <Button size="sm" variant="outline" className="h-9 text-sm px-3 shrink-0"
            onClick={applyQty} disabled={!pendingQty || !someSelected || bulkPatchMut.isPending}>Apply</Button>
        </div>
        <div className="h-6 w-px bg-border" />
        <Button size="sm" variant="ghost"
          className="h-9 text-sm gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 shrink-0"
          onClick={handleDelete} disabled={!someSelected || bulkDeleteMut.isPending}>
          <Trash2 size={14} />{bulkDeleteMut.isPending ? "Deleting…" : "Delete"}
        </Button>
        <div className="h-6 w-px bg-border" />
        <button onClick={onCancel}
          className="flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
          title="Exit bulk mode">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
