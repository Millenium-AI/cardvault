import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useInventoryList(game: string, condition: string, search: string) {
  return useQuery<any[]>({
    queryKey: ["/api/inventory", game, condition, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (game !== "all") params.set("game", game);
      if (condition !== "all") params.set("condition", condition);
      if (search) params.set("search", search);
      const res = await apiRequest("GET", `/api/inventory?${params}`);
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useColumnOrder() {
  return useQuery({
    queryKey: ["/api/settings/inventory-columns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/inventory-columns");
      return res.json();
    },
  });
}

export function invalidateInventoryQueries() {
  queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
}
