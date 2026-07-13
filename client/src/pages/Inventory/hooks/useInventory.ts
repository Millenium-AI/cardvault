import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { InventoryItem } from "@shared/schema";
import type { SortField, SortDir, LabelFilter } from "../constants";

interface UseInventoryParams {
  game: string | null;
  search: string;
  labelFilter: LabelFilter;
  sortField: SortField;
  sortDir: SortDir;
}

export function useInventory({ game, search, labelFilter, sortField, sortDir }: UseInventoryParams) {
  return useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory", game, search, labelFilter, sortField, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (game && game !== "all") params.set("game", game);
      if (search) params.set("search", search);
      if (labelFilter && labelFilter !== "all") params.set("labelStatus", labelFilter);
      if (sortField) params.set("sortField", sortField);
      if (sortDir) params.set("sortDir", sortDir);
      const res = await apiRequest("GET", `/api/inventory?${params}`);
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}
