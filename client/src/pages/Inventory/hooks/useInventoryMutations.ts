import { useMutation } from "@tanstack/react-query";
import { apiRequest, getAuthHeader, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useColumnOrderMutation() {
  return useMutation({
    mutationFn: async (order: string[]) => {
      return apiRequest("POST", "/api/settings/inventory-columns", { order });
    },
  });
}

export function useItemDeleteMutation() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("DELETE", `/api/inventory/${itemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Deleted", description: "Item removed from inventory." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" }),
  });
}

export function useItemUpdateMutation() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ itemId, patch }: { itemId: string; patch: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/inventory/${itemId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Saved", description: "Item updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" }),
  });
}

export function useBulkPatchMutation() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Record<string, any> }) => {
      const res = await apiRequest("PATCH", "/api/inventory/bulk", { ids, ...patch });
      return res.json();
    },
    onSuccess: (_, { ids }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Updated", description: `${ids.length} item${ids.length !== 1 ? "s" : ""} updated.` });
    },
    onError: () => toast({ title: "Error", description: "Bulk update failed.", variant: "destructive" }),
  });
}

export function useBulkDeleteMutation() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("DELETE", "/api/inventory/bulk", { ids });
      return res.json();
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Deleted", description: `${ids.length} item${ids.length !== 1 ? "s" : ""} removed.` });
    },
    onError: () => toast({ title: "Error", description: "Bulk delete failed.", variant: "destructive" }),
  });
}

export function useLabelsExportMutation() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ game, format, stickerMode }: { game: string; format: "xlsx" | "csv"; stickerMode: "single" | "dual" }) => {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/labels/export", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ game, format, stickerMode }),
      });
      if (!res.ok) { const msg = await res.text(); throw new Error(msg || "Export failed"); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `niimbot-labels-${Date.now()}.${format}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Labels exported", description: "Download started — check your downloads folder." });
    },
    onError: (e: any) => toast({ title: "Export failed", description: e.message, variant: "destructive" }),
  });
}
