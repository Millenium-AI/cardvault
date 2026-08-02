import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle, Minus, Plus, ExternalLink, Eye, TrendingDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer } from "vaul";
import { gameLabel } from "@shared/gameLabels";
import { CardImagePlaceholder } from "@/components/CardImagePlaceholder";
import { Chip } from "@/pages/Inventory/DetailPanel";
import { SearchRecentSalesPanel } from "@/components/SearchRecentSalesPanel";

function SearchDetailBody({ card, game, onAdded }: { card: any; game: string; onAdded: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const variants = card.variants ?? [];
  const [variantIndex, setVariantIndex] = useState(0);
  const [condition, setCondition] = useState(variants[0]?.condition ?? "Near Mint");
  const [quantity, setQuantity] = useState(1);

  const variant = variants[variantIndex] ?? null;

  // Update condition when variant changes
  useEffect(() => {
    if (variant?.condition) {
      setCondition(variant.condition);
    }
  }, [variantIndex, variant?.condition]);

  // For sealed products, ensure condition is set to Unopened
  useEffect(() => {
    if (card.isSealed && condition !== "Unopened") {
      setCondition("Unopened");
    }
  }, [card.isSealed]);

  // Fetch recent sales data if available, filtered by condition/printing
  // For sealed products, match by printing="Unopened" instead of condition
  const salesQueryParams = card.isSealed
    ? `printing=${encodeURIComponent("Unopened")}`
    : `condition=${encodeURIComponent(condition)}`;

  const { data: salesData, isLoading: salesLoading, isFetching: salesFetching } = useQuery({
    queryKey: [`/api/search/${card.tcgplayerId}/sales`, card.isSealed ? "unopened" : condition],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/search/${card.tcgplayerId}/sales?${salesQueryParams}`);
      return res.json();
    },
    enabled: !!card.tcgplayerId,
  });

  const refreshSalesMutation = useMutation({
    mutationFn: async () => {
      const body = card.isSealed ? { printing: "Unopened" } : { condition };
      return apiRequest("POST", `/api/search/${card.tcgplayerId}/sales/refresh`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/search/${card.tcgplayerId}/sales`, card.isSealed ? "unopened" : condition] });
    },
  });

  // Build TCGplayer URL from tcgplayerId if available
  const tcgplayerUrl = card.tcgplayerId
    ? `https://www.tcgplayer.com/product/${card.tcgplayerId}`
    : null;

  // Build eBay sold listings URL from card data
  const buildEbayUrl = () => {
    // Use just the card name and condition to avoid duplicating the set number
    const parts = [card.name, condition]
      .filter(Boolean)
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
    const query = parts.join(" ");
    if (!query) return null;
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
  };

  const ebayUrl = buildEbayUrl();

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
    <div className="space-y-5">
      {/* Image */}
      <div className="flex justify-center rounded-xl bg-muted/30 py-4">
        <CardImagePlaceholder photoUrl={card.imageUrl} size="lg" className="max-h-56 max-w-[75%] rounded-lg shadow-md object-contain" />
      </div>

      {/* Metadata chips */}
      <div className="flex flex-wrap gap-1.5">
        {card.setName && <Chip>{card.setName}</Chip>}
        {card.number  && <Chip>#{card.number}</Chip>}
        {card.rarity  && <Chip>{card.rarity}</Chip>}
        <Chip>{gameLabel(game)}</Chip>
      </div>

      {/* Variant selector */}
      {variants.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Printing</label>
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

      {/* Pricing and sales section */}
      {variant && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
          {/* Pricing grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-0.5">
              <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide">TCGplayer</div>
              <div className="text-lg font-mono font-bold text-primary tabular-nums">
                {variant.price != null ? `$${variant.price.toFixed(2)}` : "—"}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide">Print Price</div>
              <div className="text-lg font-mono font-bold text-accent tabular-nums">
                ${variant.price != null ? Math.ceil(variant.price) : "—"}
              </div>
            </div>
          </div>

          {/* TCG Player sales data if available */}
          {!salesLoading && salesData?.avgPrice && (
            <div className="pt-2 border-t border-border/30">
              <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">TCG Player Sales</div>
              <div className="text-lg font-mono font-bold text-emerald-400 tabular-nums">
                ${salesData.avgPrice.toFixed(2)}
              </div>
              <div className="text-[8px] text-muted-foreground/60 mt-0.5">
                Avg of {salesData.priceCount} sales
                {refreshSalesMutation.isPending && <span> — refreshing…</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border/30" />

      {/* Condition and Quantity */}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add to Inventory</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condition</label>
            {card.isSealed ? (
              <div className="h-10 px-3 flex items-center rounded-md border border-input bg-muted/50 text-sm font-medium text-foreground">
                {condition}
              </div>
            ) : (
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
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</label>
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

      {/* Secondary actions: TCGplayer and eBay research */}
      <div className="space-y-2">
        {/* TCGplayer link */}
        {tcgplayerUrl ? (
          <a
            href={tcgplayerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-blue-500/40 px-4 py-2.5 text-xs font-medium text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/60 transition-colors"
          >
            View on TCGplayer <ExternalLink size={11} />
          </a>
        ) : (
          <div className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed">
            TCGplayer <ExternalLink size={11} />
          </div>
        )}

        {/* eBay sold listings link */}
        {ebayUrl ? (
          <button
            onClick={() => window.open(ebayUrl, "_blank", "noopener,noreferrer")}
            className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-amber-500/40 px-4 py-2.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/60 transition-colors"
          >
            Search eBay Sold Listings <ExternalLink size={11} />
          </button>
        ) : (
          <div className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed">
            eBay Sold Listings <ExternalLink size={11} />
          </div>
        )}
      </div>
    </div>
  );
}

export function SearchDetailModal({
  card, game, open, onClose,
}: { card: any; game: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const variants = card?.variants ?? [];
  const [variantIndex, setVariantIndex] = useState(0);
  const nearMintVariant = variants.find((v: any) => v.condition === "Near Mint");
  const [condition, setCondition] = useState(nearMintVariant?.condition ?? variants[0]?.condition ?? "Near Mint");
  const [quantity, setQuantity] = useState(1);
  const variant = variants[variantIndex] ?? null;
  const { toast } = useToast();

  const { data: salesData, isLoading: salesLoading, isFetching: salesFetching } = useQuery({
    queryKey: [`/api/search/${card?.tcgplayerId}/sales`, condition, variant?.printing],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (condition) params.append("condition", condition);
      if (variant?.printing) params.append("printing", variant.printing);
      const res = await apiRequest("GET", `/api/search/${card?.tcgplayerId}/sales?${params.toString()}`);
      return res.json();
    },
    enabled: !!card?.tcgplayerId,
  });

  const refreshSalesMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      if (condition) params.append("condition", condition);
      if (variant?.printing) params.append("printing", variant.printing);
      return apiRequest("POST", `/api/search/${card?.tcgplayerId}/sales/refresh?${params.toString()}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/search/${card?.tcgplayerId}/sales`, condition, variant?.printing] });
    },
  });

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
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="w-[min(900px,92vw)] max-w-none p-0 flex flex-col gap-0 overflow-hidden max-h-[88vh] rounded-2xl">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0 text-left">
          <DialogTitle className="text-base font-semibold leading-tight pr-6">{card.name}</DialogTitle>
        </DialogHeader>

        {/* 2-column layout */}
        <div className="modal-scroll-area overflow-y-auto flex-1 flex gap-0">
          {/* Left: Card details + add to inventory */}
          <div className="w-[320px] shrink-0 border-r border-border/40 flex flex-col px-5 py-4 space-y-4">
            <div className="flex justify-center rounded-lg bg-muted/30 py-3">
              <CardImagePlaceholder photoUrl={card.imageUrl} size="lg" className="max-h-48 max-w-[75%] rounded-lg shadow-md object-contain" />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {card.setName && <Chip>{card.setName}</Chip>}
              {card.number && <Chip>#{card.number}</Chip>}
              {card.rarity && <Chip>{card.rarity}</Chip>}
              <Chip>{gameLabel(game)}</Chip>
            </div>

            {variants.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Printing</label>
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
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-0.5">
                    <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide">TCGplayer</div>
                    <div className="text-lg font-mono font-bold text-primary tabular-nums">
                      {variant.price != null ? `$${variant.price.toFixed(2)}` : "—"}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide">Print</div>
                    <div className="text-lg font-mono font-bold text-accent tabular-nums">
                      ${variant.price != null ? Math.ceil(variant.price) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condition</label>
                  <Select value={condition} onValueChange={setCondition}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Near Mint">NM</SelectItem>
                      <SelectItem value="Lightly Played">LP</SelectItem>
                      <SelectItem value="Moderately Played">MP</SelectItem>
                      <SelectItem value="Heavily Played">HP</SelectItem>
                      <SelectItem value="Damaged">DMG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</label>
                  <div className="flex items-center h-10 rounded-md border border-input overflow-hidden">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="h-full w-8 flex items-center justify-center text-muted-foreground hover:bg-accent"
                    >
                      −
                    </button>
                    <Input
                      type="number" min="1" value={quantity}
                      onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="h-full flex-1 text-center border-0 rounded-none font-mono text-sm"
                    />
                    <button
                      onClick={() => setQuantity(q => q + 1)}
                      className="h-full w-8 flex items-center justify-center text-muted-foreground hover:bg-accent"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <Button
              className="w-full h-10 gap-2 rounded-lg font-semibold"
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending}
            >
              <PlusCircle size={14} />
              {addMut.isPending ? "Adding…" : "Add to Inventory"}
            </Button>

            <div className="space-y-2">
              {card.tcgplayerId ? (
                <a
                  href={`https://www.tcgplayer.com/product/${card.tcgplayerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-blue-500/40 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                >
                  TCGplayer <ExternalLink size={10} />
                </a>
              ) : (
                <div className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground opacity-40">
                  TCGplayer <ExternalLink size={10} />
                </div>
              )}

              {(() => {
                const parts = [card.name, condition]
                  .filter(Boolean)
                  .map((v) => String(v).trim())
                  .filter((v) => v.length > 0);
                const query = parts.join(" ");
                if (!query) return null;
                const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
                return (
                  <button
                    onClick={() => window.open(ebayUrl, "_blank", "noopener,noreferrer")}
                    className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    eBay Sold Listings <ExternalLink size={10} />
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Right: Recent sales */}
          <div className="flex-1 min-w-0 px-5 py-4 overflow-y-auto">
            <SearchRecentSalesPanel
              salesData={salesData}
              isLoading={salesLoading}
              isFetching={salesFetching || refreshSalesMutation.isPending}
              variant={variant}
              onRefresh={() => refreshSalesMutation.mutate()}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SearchDetailDrawer({
  card, game, open, onClose,
}: { card: any; game: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("card");
  const [snap, setSnap] = useState<number | string | null>(0.92);
  const { toast } = useToast();
  const variants = card?.variants ?? [];
  const [variantIndex, setVariantIndex] = useState(0);
  const nearMintVariant = variants.find((v: any) => v.condition === "Near Mint");
  const [condition, setCondition] = useState(nearMintVariant?.condition ?? variants[0]?.condition ?? "Near Mint");
  const [quantity, setQuantity] = useState(1);
  const variant = variants[variantIndex] ?? null;

  // Build TCGplayer URL from tcgplayerId if available
  const tcgplayerUrl = card?.tcgplayerId
    ? `https://www.tcgplayer.com/product/${card.tcgplayerId}`
    : null;

  // Build eBay sold listings URL from card data
  const ebayUrl = (() => {
    const parts = [card?.name, condition]
      .filter(Boolean)
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
    const query = parts.join(" ");
    if (!query) return null;
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
  })();

  // Reset to overview/card tab and full snap when opening
  useEffect(() => {
    if (open) {
      setSnap(0.92);
      setActiveTab("card");
    }
  }, [open]);

  // Fetch recent sales data
  const { data: salesData, isLoading: salesLoading, isFetching: salesFetching } = useQuery({
    queryKey: [`/api/search/${card?.tcgplayerId}/sales`, condition, variant?.printing],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (condition) params.append("condition", condition);
      if (variant?.printing) params.append("printing", variant.printing);
      const res = await apiRequest("GET", `/api/search/${card?.tcgplayerId}/sales?${params.toString()}`);
      return res.json();
    },
    enabled: !!card?.tcgplayerId,
  });

  const refreshSalesMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      if (condition) params.append("condition", condition);
      if (variant?.printing) params.append("printing", variant.printing);
      return apiRequest("POST", `/api/search/${card?.tcgplayerId}/sales/refresh?${params.toString()}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/search/${card?.tcgplayerId}/sales`, condition, variant?.printing] });
    },
  });

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
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!card) return null;

  return (
    <Drawer.Root open={open} onOpenChange={v => !v && onClose()} snapPoints={[0.6, 0.92]} activeSnapPoint={snap} setActiveSnapPoint={setSnap}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none"
          style={{ height: "92dvh", maxHeight: "92dvh" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="px-4 pt-2 pb-3 border-b border-border/50 shrink-0">
            <div className="text-base font-semibold text-foreground leading-tight">{card.name}</div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="shrink-0 mx-4 mt-3 mb-1 grid grid-cols-2 h-9 bg-muted/50">
              <TabsTrigger value="card" className="text-xs gap-1"><Eye size={11} /> Overview</TabsTrigger>
              <TabsTrigger value="sales" className="text-xs gap-1"><TrendingDown size={11} /> Sales</TabsTrigger>
            </TabsList>

            {/* Scrollable tab body */}
            <div
              className="flex-1 overflow-y-auto modal-scroll-area"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
            >
              <TabsContent value="card" className="space-y-3 mt-0 px-4 pt-3 pb-2">
                {/* Image */}
                <div className="flex justify-center rounded-lg bg-muted/30 py-2">
                  <CardImagePlaceholder photoUrl={card.imageUrl} size="md" className="max-h-40 max-w-[70%] rounded-lg object-contain" />
                </div>

                {/* Metadata chips */}
                <div className="flex flex-wrap gap-1">
                  {card.setName && <Chip>{card.setName}</Chip>}
                  {card.number && <Chip>#{card.number}</Chip>}
                  {card.rarity && <Chip>{card.rarity}</Chip>}
                  <Chip>{gameLabel(game)}</Chip>
                </div>

                {/* Variant selector */}
                {variants.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Printing</label>
                    <Select value={String(variantIndex)} onValueChange={v => setVariantIndex(Number(v))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
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

                {/* Pricing */}
                {variant && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5">
                        <div className="text-[8px] text-muted-foreground font-semibold uppercase">TCGplayer</div>
                        <div className="text-sm font-mono font-bold text-primary">
                          {variant.price != null ? `$${variant.price.toFixed(2)}` : "—"}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-[8px] text-muted-foreground font-semibold uppercase">Print</div>
                        <div className="text-sm font-mono font-bold text-accent">
                          ${variant.price != null ? Math.ceil(variant.price) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Condition and Qty */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Condition</label>
                    <Select value={condition} onValueChange={setCondition}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Near Mint">NM</SelectItem>
                        <SelectItem value="Lightly Played">LP</SelectItem>
                        <SelectItem value="Moderately Played">MP</SelectItem>
                        <SelectItem value="Heavily Played">HP</SelectItem>
                        <SelectItem value="Damaged">DMG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Qty</label>
                    <div className="flex items-center h-9 rounded-md border border-input overflow-hidden">
                      <button
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        className="h-full w-7 flex items-center justify-center text-muted-foreground text-sm"
                      >
                        −
                      </button>
                      <Input
                        type="number" min="1" value={quantity}
                        onChange={e => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="h-full flex-1 text-center border-0 rounded-none font-mono text-xs"
                      />
                      <button
                        onClick={() => setQuantity(q => q + 1)}
                        className="h-full w-7 flex items-center justify-center text-muted-foreground text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <Button
                  className="w-full h-10 gap-2 rounded-lg font-semibold text-sm"
                  onClick={() => addMut.mutate()}
                  disabled={addMut.isPending}
                >
                  <PlusCircle size={14} />
                  {addMut.isPending ? "Adding…" : "Add to Inventory"}
                </Button>

                {/* External links */}
                <div className="border-t border-border/30 pt-3 space-y-2">
                  {tcgplayerUrl ? (
                    <a
                      href={tcgplayerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-lg border border-blue-500/40 px-4 py-2.5 text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                    >
                      View on TCGplayer <ExternalLink size={13} />
                    </a>
                  ) : (
                    <div className="flex items-center justify-center gap-2 w-full rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground opacity-40 cursor-not-allowed">
                      TCGplayer unavailable <ExternalLink size={13} />
                    </div>
                  )}
                  {ebayUrl && (
                    <button
                      onClick={() => window.open(ebayUrl, "_blank", "noopener,noreferrer")}
                      className="flex items-center justify-center gap-2 w-full rounded-lg border border-amber-500/40 px-4 py-2.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                    >
                      Search eBay Sold Listings <ExternalLink size={13} />
                    </button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="sales" className="space-y-3 mt-0 px-4 pt-3 pb-2">
                <SearchRecentSalesPanel
                  salesData={salesData}
                  isLoading={salesLoading}
                  isFetching={salesFetching || refreshSalesMutation.isPending}
                  variant={variant}
                  onRefresh={() => refreshSalesMutation.mutate()}
                />
              </TabsContent>
            </div>
          </Tabs>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}