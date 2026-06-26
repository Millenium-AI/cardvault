import { useState, useEffect } from "react";

/**
 * Reads/writes the `?game=` query param.
 *
 * `null` means no game is selected (show the tile picker); any string —
 * including "all" — means a game is selected (show the filtered table view).
 *
 * Writes go through `history.pushState` so the browser back/forward buttons
 * move naturally between the tile screen and the table view, and `?game=`
 * links can be shared. On load, an existing `?game=` skips the tile screen.
 */
export function useGameParam(): [string | null, (game: string | null) => void] {
  const read = () =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("game");

  const [game, setGameState] = useState<string | null>(read);

  useEffect(() => {
    // Keep state in sync when the user navigates with back/forward.
    const sync = () => setGameState(read());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const setGame = (next: string | null) => {
    const url = new URL(window.location.href);
    if (next === null) url.searchParams.delete("game");
    else url.searchParams.set("game", next);
    window.history.pushState({}, "", url.toString());
    setGameState(next);
  };

  return [game, setGame];
}
