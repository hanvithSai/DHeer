import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";

export function useTags() {
  return useQuery({
    queryKey: [api.tags.list.path],
    queryFn: async () => {
      const res = await fetch(api.tags.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tags");
      return api.tags.list.responses[200].parse(await res.json());
    },
  });
}

export function useUpdateTag() {
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(api.tags.update.path.replace(':id', id.toString()), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to update tag");
      return api.tags.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tags.list.path] });
    },
  });
}

export function useDeleteTag() {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(api.tags.delete.path.replace(':id', id.toString()), {
        method: 'DELETE',
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to delete tag");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tags.list.path] });
    },
  });
}
