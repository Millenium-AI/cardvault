import { useState, useMemo } from "react";
import { Search as SearchIcon, X, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchResultCard } from "./SearchResultCard";
import { SearchDetailModal, SearchDetailDrawer } from "./SearchDetailView";
import { SetFilterCombobox } from "@/components/SetFilterCombobox";
import { useIsDesktop } from "@/hooks/use-is-desktop";

interface SetOption { set_id: string; set_name: string; }

type CardSearchType = "raw" | "graded";

// v1 orderBy options: price, 24h, 7d, 30d
const ORDER_BY_OPTIONS = [
  { value: "price", label: "Price" },
  { value: "24h", label: "24h Change" },
  { value: "7d", label: "7d Change" },
  { value: "30d", label: "30d Change" },
];

const CONDITIONS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
const PRINTINGS = ["Normal", "Holo", "Reverse Holo", "Alt Art", "Full Art"];
const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "BCCG", "BVG", "SGC"];
const GRADES = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5"];

export default function SearchPage() {
  const isDesktop = useIsDesktop();

  // Search type selector: raw (v1) or graded (v2)
  const [searchType, setSearchType] = useState<CardSearchType>("raw");

  // Common search params
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("all");
  const [set, setSet] = useState("all");

  // v1 Raw card specific params
  const [cardNumber, setCardNumber] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [orderBy, setOrderBy] = useState("price");
  const [order, setOrder] = useState("desc");
  const [conditions, setConditions] = useState<string[]>([]);
  const [printing, setPrinting] = useState("all");

  // v2 Graded card specific params
  const [gradingCompany, setGradingCompany] = useState("all");
  const [grade, setGrade] = useState("all");

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: setsData } = useQuery({
    queryKey: ["/api/search/sets", game],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/search/sets?game=${encodeURIComponent(game)}`);
      if (!res.ok) throw new Error("Failed to load sets");
      return res.json();
    },
    enabled: game !== "all",
    staleTime: 24 * 60 * 60 * 1000,
  });

  const availableSets: SetOption[] = setsData?.sets ?? [];

  // Query builder based on search type
  const buildSearchQuery = () => {
    const params = new URLSearchParams();
    if (activeQuery) params.set("q", activeQuery);
    if (game !== "all") params.set("game", game);
    if (set !== "all") params.set("set", set);

    if (searchType === "raw") {
      // v1 Raw card params
      if (cardNumber) params.set("number", cardNumber);
      if (minPrice) params.set("min_price", minPrice);
      params.set("orderBy", orderBy);
      params.set("order", order);
    } else {
      // v2 Graded card params
      params.set("graded", "only");
      if (gradingCompany !== "all") params.set("grading_company", gradingCompany);
      if (grade !== "all") params.set("grade", grade);
    }

    params.set("limit", "100");
    return params.toString();
  };

  // Fetch search results
  const { data, isFetching, isError } = useQuery({
    queryKey: ["/api/search/cards", searchType, activeQuery, game, set, cardNumber, minPrice, orderBy, order, gradingCompany, grade],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/search/cards?${buildSearchQuery()}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: activeQuery.length > 0,
    staleTime: 60 * 1000,
  });

  // Client-side filtering for raw cards (condition, printing)
  const filteredResults = useMemo(() => {
    const allResults = data?.results ?? [];

    if (searchType === "graded") {
      return allResults; // v2 graded already filtered server-side
    }

    // v1 Raw cards: apply client-side filters
    return allResults.filter((card: any) => {
      if (conditions.length > 0) {
        const hasMatchingCondition = card.variants?.some((v: any) =>
          conditions.includes(v.condition)
        );
        if (!hasMatchingCondition) return false;
      }

      if (printing !== "all") {
        const hasMatchingPrinting = card.variants?.some((v: any) =>
          v.printing === printing
        );
        if (!hasMatchingPrinting) return false;
      }

      return true;
    });
  }, [data?.results, searchType, conditions, printing]);

  function runSearch() {
    setActiveQuery(query.trim());
  }

  function handleGameChange(newGame: string) {
    setGame(newGame);
    setSet("all");
  }

  function toggleCondition(cond: string) {
    setConditions(prev =>
      prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond]
    );
  }

  function clearFilters() {
    if (searchType === "raw") {
      setCardNumber("");
      setConditions([]);
      setPrinting("all");
      setMinPrice("");
      setOrderBy("price");
      setOrder("desc");
    } else {
      setGradingCompany("all");
      setGrade("all");
    }
  }

  function switchSearchType(newType: CardSearchType) {
    setSearchType(newType);
    clearFilters();
    setQuery("");
    setActiveQuery("");
  }

  function hasActiveAdvancedFilters() {
    if (searchType === "raw") {
      return cardNumber || conditions.length > 0 || printing !== "all" || minPrice || orderBy !== "price" || order !== "desc";
    } else {
      return gradingCompany !== "all" || grade !== "all";
    }
  }

  function openCard(card: any) { setSelectedCard(card); setDetailOpen(true); }
  function closeDetail() { setDetailOpen(false); setSelectedCard(null); }

  const selectedGame = selectedCard ? (game !== "all" ? game : (selectedCard.game ?? "pokemon")) : "pokemon";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="hidden md:block text-xl font-semibold text-foreground">Search</h1>
      </div>

      {/* Search Type Selector - Primary Control */}
      <div className="mb-5 p-3 rounded-lg border border-border/50 bg-muted/30">
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Card Type</p>
        <div className="flex gap-2">
          <button
            onClick={() => switchSearchType("raw")}
            className={`flex-1 px-4 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              searchType === "raw"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            Raw Cards (v1)
          </button>
          <button
            onClick={() => switchSearchType("graded")}
            className={`flex-1 px-4 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              searchType === "graded"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            Graded Cards (v2)
          </button>
        </div>
      </div>

      {/* Main Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 min-w-0">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="input-card-search"
            placeholder='e.g. "Pikachu" or "Charizard 4/102"'
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") runSearch(); }}
            className="pl-9 h-10 text-sm"
          />
        </div>

        <Select value={game} onValueChange={handleGameChange}>
          <SelectTrigger data-testid="select-search-game" className="w-full sm:w-[180px] h-10 text-xs">
            <SelectValue placeholder="Game" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Games</SelectItem>
            <SelectItem value="pokemon">Pokémon</SelectItem>
            <SelectItem value="pokemon-jp">Pokémon JP</SelectItem>
            <SelectItem value="one-piece">One Piece</SelectItem>
            <SelectItem value="sorcery">Sorcery</SelectItem>
            <SelectItem value="dragon-ball">Dragon Ball</SelectItem>
            <SelectItem value="mtg">MTG</SelectItem>
            <SelectItem value="star-wars">Star Wars</SelectItem>
          </SelectContent>
        </Select>

        {game !== "all" && (
          <div className="w-full sm:w-[300px]">
            <SetFilterCombobox
              sets={availableSets}
              value={set}
              onChange={setSet}
            />
          </div>
        )}

        <button
          data-testid="button-run-search"
          onClick={runSearch}
          className="h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
        >
          Search
        </button>
      </div>

      {/* Advanced Filters Toggle */}
      <button
        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
        className="flex items-center gap-2 mb-4 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown size={14} className={`transition-transform ${showAdvancedFilters ? "rotate-180" : ""}`} />
        {searchType === "raw" ? "Price & Condition Filters" : "Grading Filters"}
        {hasActiveAdvancedFilters() && <span className="ml-1 px-2 py-0.5 rounded bg-accent/30 text-accent-foreground text-xs font-semibold">Active</span>}
      </button>

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div className="mb-5 p-4 rounded-lg border border-border/50 bg-muted/30 space-y-4">
          {searchType === "raw" ? (
            // v1 Raw Card Filters
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Card #</label>
                  <Input
                    placeholder="e.g. 25/102"
                    value={cardNumber}
                    onChange={e => setCardNumber(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Min Price</label>
                  <Input
                    type="number"
                    placeholder="$0"
                    value={minPrice}
                    onChange={e => setMinPrice(e.target.value)}
                    className="h-9 text-sm"
                    step="0.50"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Sort By</label>
                  <Select value={orderBy} onValueChange={setOrderBy}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_BY_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Direction</label>
                  <Select value={order} onValueChange={setOrder}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Low to High</SelectItem>
                      <SelectItem value="desc">High to Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Printing</label>
                  <Select value={printing} onValueChange={setPrinting}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Printings</SelectItem>
                      {PRINTINGS.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase mb-3 block">Condition</label>
                <div className="flex flex-wrap gap-2">
                  {CONDITIONS.map(cond => (
                    <button
                      key={cond}
                      onClick={() => toggleCondition(cond)}
                      className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                        conditions.includes(cond)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {cond}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground/60">
                Condition and Printing filters applied client-side to results
              </p>
            </>
          ) : (
            // v2 Graded Card Filters
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Grading Company</label>
                  <Select value={gradingCompany} onValueChange={setGradingCompany}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Companies</SelectItem>
                      {GRADING_COMPANIES.map(co => (
                        <SelectItem key={co} value={co}>{co}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase mb-2 block">Grade</label>
                  <Select value={grade} onValueChange={setGrade}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Grades</SelectItem>
                      {GRADES.map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground/60">
                Returns PSA, BGS, CGC, BCCG, BVG, and SGC graded variants
              </p>
            </>
          )}

          {hasActiveAdvancedFilters() && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={13} />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {!activeQuery && (
        <div className="py-16 text-center">
          <p className="text-muted-foreground text-sm mb-2">Search for {searchType === "raw" ? "raw" : "graded"} cards</p>
          <p className="text-xs text-muted-foreground/60">Enter a card name or number to get started</p>
        </div>
      )}

      {isFetching && (
        <div>
          <p className="text-xs text-muted-foreground mb-4">Searching {activeQuery ? `for "${activeQuery}"` : "cards"}...</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}
          </div>
        </div>
      )}

      {isError && !isFetching && (
        <div className="py-12 text-center rounded-lg border border-red-500/30 bg-red-500/5">
          <p className="text-sm text-red-400 font-semibold mb-1">Search failed</p>
          <p className="text-xs text-red-400/70 mb-4">Please try again or adjust your filters</p>
          <button
            onClick={runSearch}
            className="text-xs px-3 py-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {!isFetching && !isError && activeQuery && (data?.results ?? []).length === 0 && (
        <div className="py-12 text-center rounded-lg border border-border/50 bg-muted/20">
          <p className="text-sm text-muted-foreground font-semibold mb-1">No cards found</p>
          <p className="text-xs text-muted-foreground/60 mb-4">Try a different search term or adjust your filters</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={() => setQuery("")}
              className="text-xs px-3 py-1.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted transition-colors font-semibold"
            >
              Clear search
            </button>
            {hasActiveAdvancedFilters() && (
              <button
                onClick={clearFilters}
                className="text-xs px-3 py-1.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted transition-colors font-semibold"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {!isFetching && filteredResults.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-4">
            Found {filteredResults.length} card{filteredResults.length !== 1 ? "s" : ""}
            {searchType === "raw" && (conditions.length > 0 || printing !== "all") ? " (after client filters)" : ""}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredResults.map((card: any, i: number) => (
              <SearchResultCard
                key={`${card.cardUuid ?? card.name}-${i}`}
                card={card}
                game={game !== "all" ? game : (card.game ?? "pokemon")}
                onOpen={() => openCard(card)}
              />
            ))}
          </div>
        </div>
      )}

      {!isFetching && !isError && activeQuery && (data?.results ?? []).length > 0 && filteredResults.length === 0 && (
        <div className="py-12 text-center rounded-lg border border-border/50 bg-muted/20">
          <p className="text-sm text-muted-foreground font-semibold mb-1">No cards match your filters</p>
          <p className="text-xs text-muted-foreground/60 mb-4">Try adjusting your {searchType === "raw" ? "condition or printing" : "grading"} filters</p>
          <button
            onClick={clearFilters}
            className="text-xs px-3 py-1.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted transition-colors font-semibold"
          >
            Clear filters
          </button>
        </div>
      )}

      {isDesktop ? (
        <SearchDetailModal card={selectedCard} game={selectedGame} open={detailOpen} onClose={closeDetail} />
      ) : (
        <SearchDetailDrawer card={selectedCard} game={selectedGame} open={detailOpen} onClose={closeDetail} />
      )}
    </div>
  );
}
