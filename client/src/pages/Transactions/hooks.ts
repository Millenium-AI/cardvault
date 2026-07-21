import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface TransactionFilters {
  type?: string;
  channel?: string;
  showId?: string;
  attached?: "true" | "false";
}

export function useTransactions(filters: TransactionFilters = {}) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.showId) params.set("showId", filters.showId);
  if (filters.attached) params.set("attached", filters.attached);
  const qs = params.toString();

  return useQuery<any[]>({
    queryKey: ["/api/transactions", filters],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/transactions${qs ? `?${qs}` : ""}`);
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });
}

function invalidateTransactions() {
  queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
  queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
  queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
}

export function useCreateTransaction(onDone?: () => void) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/transactions", payload);
      return res.json();
    },
    onSuccess: () => {
      invalidateTransactions();
      toast({ title: "Transaction logged" });
      onDone?.();
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateTransaction() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const res = await apiRequest("PATCH", `/api/transactions/${id}`, patch);
      return res.json();
    },
    onSuccess: () => invalidateTransactions(),
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useIncomingItemMutation() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      transactionId,
      itemId,
      action,
    }: {
      transactionId: string;
      itemId: string;
      action: "approve" | "reject";
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/transactions/${transactionId}/incoming-items/${itemId}/${action}`,
      );
      return res.json();
    },
    onSuccess: (_data, vars) => {
      invalidateTransactions();
      toast({ title: vars.action === "approve" ? "Trade-in approved" : "Trade-in rejected" });
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}
