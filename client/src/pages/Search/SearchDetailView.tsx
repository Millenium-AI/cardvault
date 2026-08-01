import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PlusCircle, Minus, Plus, ExternalLink } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer } from "vaul";
import { gameLabel } from "@shared/gameLabels";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";
import { Chip } from "@/pages/Inventory/DetailPanel";

function SearchDetailBody({ card, game, onAdded }: { card: any; game: string; onAdded: () => void }) {
  const { toast } = useToast();
  const variants = card.variants ?? [];
  const [variantIndex, setVariantIndex] = useState(0);
  const [condition, setCondition] = useState(variants[0]?.condition ?? "Near Mint");
  const [quantity, setQuantity] = useState(1);

  const variant = variants[variantIndex] ?? null;

  // Build TCGplayer URL from tcgplayerId if available
  const tcgplayerUrl = card.tcgplayerId
    ? `https://www.tcgplayer.com/product/${card.tcgplayerId}`
    : null;

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/inventory/from-search", {
        card, variantIndex, game, quantity, condition,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add item");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: data.created ? "Added to inventory" : "Quantity updated",
        description: data.created
          ? `${card.name} was added to your inventory.`
          : `${card.name} already existed — quantity increased.`,
      });
      onAdded();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-center rounded-xl bg-muted/30 py-4">
        <CardImagePlaceholder photoUrl={card.imageUrl} size="lg" className="max-h-56 max-w-[75%] rounded-lg shadow-md" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {card.setName && <Chip>{card.setName}</Chip>}
        {card.number  && <Chip>#{card.number}</Chip>}
        {card.rarity  && <Chip>{card.rarity}</Chip>}
        <Chip>{gameLabel(game)}</Chip>
      </div>

      {variants.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground font-medium">Printing</div>
          <Select value={String(variantIndex)} onValueChange={v => setVariantIndex(Number(v))}>
            <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {variants.map((v: any, i: number) => (
                <SelectItem key={i} value={String(i)}>
                  {[v.condition, v.printing].filter(Boolean).join(" · ") || "Standard"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {variant && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground font-medium">Market Price</div>
          <span className="inline-block text-xl font-mono font-bold text-primary tabular-nums">
            {variant.price != null ? `$${variant.price.toFixed(2)}` : "—"}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground font-medium">Your Copy's Condition</div>
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Near Mint">Near Mint (NM)</SelectItem>
              <SelectItem value="Lightly Played">Lightly Played (LP)</SelectItem>
              <SelectItem value="Moderately Played">Moderately Played (MP)</SelectItem>
              <SelectItem value="Heavily Played">Heavily Played (HP)</SelectItem>
              <SelectItem value="Damaged">Damaged (DMG)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground font-medium">Quantity</div>
          <div className="flex items-center h-10 rounded-md border border-input overflow-hidden">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="h-full w-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Minus size={13} />
            </button>
            <Input
              type="number" min="1" value={quantity}
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="h-full flex-1 text-center border-0 rounded-none font-mono"
            />
            <button
              onClick={() => setQuantity(q => q + 1)}
              className="h-full w-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      </div>

      <Button
        data-testid="button-add-to-inventory"
        className="w-full h-11 gap-2 rounded-xl font-semibold"
        onClick={() => addMut.mutate()}
        disabled={addMut.isPending}
      >
        <PlusCircle size={16} />
        {addMut.isPending ? "Adding…" : "Add to Inventory"}
      </Button>

      {/* TCGplayer link — same style as inventory detail view */}
      {tcgplayerUrl ? (
        <a
          href={tcgplayerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-blue-500/40 px-3 py-2.5 text-xs font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors"
        >
          View on TCGplayer <ExternalLink size={11} />
        </a>
      ) : (
        <div className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-border px-3 py-2.5 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed">
          TCGplayer <ExternalLink size={11} />
        </div>
      )}
    </div>
  );
}

export function SearchDetailModal({
  card, game, open, onClose,
}: { card: any; game: string; open: boolean; onClose: () => void }) {
  if (!card) return null;
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="w-[min(480px,92vw)] max-w-none p-0 flex flex-col gap-0 overflow-hidden max-h-[88vh] rounded-2xl">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0 text-left">
          <DialogTitle className="text-base font-semibold leading-tight pr-6">{card.name}</DialogTitle>
        </DialogHeader>
        <div className="modal-scroll-area overflow-y-auto flex-1 px-5 py-4">
          <SearchDetailBody card={card} game={game} onAdded={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SearchDetailDrawer({
  card, game, open, onClose,
}: { card: any; game: string; open: boolean; onClose: () => void }) {
  if (!card) return null;
  return (
    <Drawer.Root open={open} onOpenChange={v => !v && onClose()} snapPoints={[0.92]} activeSnapPoint={0.92}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none"
          style={{ height: "92dvh", maxHeight: "92dvh" }}
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>
          <div className="px-4 pt-2 pb-3 border-b border-border/50 shrink-0">
            <div className="text-base font-semibold text-foreground leading-tight">{card.name}</div>
          </div>
          <div
            className="flex-1 overflow-y-auto px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
          >
            <SearchDetailBody card={card} game={game} onAdded={onClose} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}