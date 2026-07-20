import { useState, useMemo } from "react";
import { Search as SearchIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchResultCard } from "./SearchResultCard";
import { SearchDetailModal, SearchDetailDrawer } from "./SearchDetailView";
import { useIsDesktop } from "@/hooks/use-is-desktop";

// Minimal starter set lists per game — expand these as needed, or swap
// for a live-fetched list from JustTCG if/when a /sets endpoint is wired in.
const SETS_BY_GAME: Record<string, { value: string; label: string }[]> = {
  pokemon: [
    { value: "base-set-shadowless-pokemon", label: "Base Set (Shadowless)" },
    { value: "base-set-pokemon", label: "Base Set" },
    { value: "jungle-pokemon", label: "Jungle" },
    { value: "fossil-pokemon", label: "Fossil" },
    { value: "scarlet-violet-pokemon", label: "Scarlet & Violet" },
  ],
  "pokemon-jp": [
    { value: "scarlet-violet-pokemon-japan", label: "Scarlet & Violet (JP)" },
  ],
  "one-piece": [
    { value: "romance-dawn-one-piece-card-game", label: "Romance Dawn (OP01)" },
    { value: "paramount-war-one-piece-card-game", label: "Paramount War (OP02)" },
  ],
  sorcery: [
    { value: "alpha-sorcery-contested-realm", label: "Alpha" },
    { value: "beta-sorcery-contested-realm", label: "Beta" },
  ],
  "dragon-ball": [
    { value: "fusion-world-dragon-ball-super-fusion-world", label: "Fusion World" },
  ],
  mtg: [
    { value: "alpha-magic-the-gathering", label: "Alpha" },
    { value: "modern-horizons-magic-the-gathering", label: "Modern Horizons" },
  ],
  "star-wars": [
    { value: "spark-of-rebellion-star-wars-unlimited", label: "Spark of Rebellion" },
  ],
};

export default function SearchPage() {
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("all");
  const [set, setSet] = useState("all");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const availableSets = useMemo(() => SETS_BY_GAME[game] ?? [], [game]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["/api/search/cards", activeQuery, game, set],
    queryFn: async () => {
      const params = new URLSearchParams({ q: activeQuery, game });
      if (set !== "all") params.set("set", set);
      const res = await apiRequest("GET", `/api/search/cards?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: activeQuery.length > 0,
    staleTime: 60 * 1000,
  });

  function runSearch() {
    setActiveQuery(query.trim());
  }

  function handleGameChange(newGame: string) {
    setGame(newGame);
    setSet("all"); // reset set filter whenever game changes
  }

  function openCard(card: any) {
    setSelectedCard(card);
    setDetailOpen(true);
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelectedCard(null);
  }

  const results = data?.results ?? [];
  const selectedGame = selectedCard ? (game !== "all" ? game : (selectedCard.game ?? "pokemon")) : "pokemon";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="hidden md:block text-xl font-semibold text-foreground">Search</h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="input-card-search"
            placeholder='e.g. "Pikachu 25/102" or "Luffy P-061"'
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") runSearch(); }}
            className="pl-9 h-10 text-sm"
          />
        </div>

        <Select value={game} onValueChange={handleGameChange}>
          <SelectTrigger data-testid="select-search-game" className="w-full sm:w-[150px] h-10 text-xs">
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

        {availableSets.length > 0 && (
          <Select value={set} onValueChange={setSet}>
            <SelectTrigger data-testid="select-search-set" className="w-full sm:w-[170px] h-10 text-xs">
              <SelectValue placeholder="Set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sets</SelectItem>
              {availableSets.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <button
          data-testid="button-run-search"
          onClick={runSearch}
          className="h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
        >
          Search
        </button>
      </div>

      {!activeQuery && (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Look up any card to see live pricing and add it to your inventory.
        </div>
      )}

      {isFetching && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}
        </div>
      )}

      {isError && !isFetching && (
        <p className="text-sm text-red-400 text-center py-8">Search failed. Try again.</p>
      )}

      {!isFetching && !isError && activeQuery && results.length === 0 && (
        <div className="py-16 text-center text-muted-foreground text-sm">
          No cards found for "{activeQuery}".
        </div>
      )}

      {!isFetching && results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {results.map((card: any, i: number) => (
            <SearchResultCard
              key={`${card.cardUuid ?? card.name}-${i}`}
              card={card}
              game={game !== "all" ? game : (card.game ?? "pokemon")}
              onOpen={() => openCard(card)}
            />
          ))}
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