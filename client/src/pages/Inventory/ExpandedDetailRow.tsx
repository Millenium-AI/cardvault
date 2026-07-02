import { Pencil, Trash2, ExternalLink } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { PriceHistory, InlineEditPanel, Chip } from "./DetailPanel";

export function ExpandedDetail({
  item, meta, editing, setEditing, stopProp = false,
}: {
  item: any; meta: any; editing: boolean; setEditing: (v: boolean) => void; stopProp?: boolean;
}) {
  const { toast } = useToast();
  const wrap = (e: React.MouseEvent) => { if (stopProp) e.stopPropagation(); };

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/inventory/${item.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Deleted", description: "Item removed from inventory." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" }),
  });

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(`Delete "${item.productName}"? This cannot be undone.`)) deleteMut.mutate();
  }

  const hasChips = meta.sourceSetName || meta.sourcePrinting || meta.sourceRarity;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-4" onClick={wrap}>
      {hasChips && (
        <div className="flex flex-wrap items-center gap-1.5">
          {meta.sourceSetName && <Chip>{meta.sourceSetName}</Chip>}
          {meta.sourcePrinting && <Chip>{meta.sourcePrinting}</Chip>}
          {meta.sourceRarity && <Chip>{meta.sourceRarity}</Chip>}
        </div>
      )}
      <PriceHistory itemId={item.id} />
      {!editing && item.notes && (
        <div className="text-xs">
          <span className="text-muted-foreground">Notes: </span>
          <span className="italic text-foreground/80">{item.notes}</span>
        </div>
      )}
      {editing ? (
        <InlineEditPanel item={item} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-center gap-2 pt-0.5">
            <Button data-testid="button-edit-item" variant="outline" size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={e => { e.stopPropagation(); setEditing(true); }}>
              <Pencil size={12} /> Edit item
            </Button>
            <Button data-testid="button-delete-item" variant="outline" size="sm"
              disabled={deleteMut.isPending}
              className="h-8 text-xs gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
              onClick={handleDelete}>
              <Trash2 size={12} /> {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
          {item.tcgplayerUrl ? (
            <a href={item.tcgplayerUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center justify-center gap-1.5 w-full rounded-md border border-blue-500/40 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors mt-2">
              View on TCGplayer <ExternalLink size={12} />
            </a>
          ) : (
            <div className="flex items-center justify-center gap-1.5 w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed mt-2">
              View on TCGplayer <ExternalLink size={12} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
