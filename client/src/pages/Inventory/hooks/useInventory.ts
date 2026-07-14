import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { InventoryItem } from "@shared/schema";

interface UseInventoryParams {
  game: string | null;
}

// Fetches the full active inventory for the selected game. All searching,
// filtering, and sorting is applied client-side (see constants.ts helpers) so
// every filter dimension composes without extra round-trips.
export function useInventory({ game }: UseInventoryParams) {
  return useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory", game],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (game && game !== "all") params.set("game", game);
      const res = await apiRequest("GET", `/api/inventory?${params}`);
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
