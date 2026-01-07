import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type CreateBookmarkRequest, type UpdateBookmarkRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useBookmarks(params?: { search?: string; tag?: string }) {
  const queryKey = params ? [api.bookmarks.list.path, params] : [api.bookmarks.list.path];
  
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const url = new URL(api.bookmarks.list.path, window.location.origin);
      if (params?.search) url.searchParams.append("search", params.search);
      if (params?.tag) url.searchParams.append("tag", params.tag);
      
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bookmarks");
      return api.bookmarks.list.responses[200].parse(await res.json());
    },
  });

  return query;
}

export function usePublicBookmarks() {
  return useQuery({
    queryKey: [api.public.list.path],
    queryFn: async () => {
      const res = await fetch(api.public.list.path);
      if (!res.ok) throw new Error("Failed to fetch public bookmarks");
      return api.public.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateBookmark() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateBookmarkRequest) => {
      const validated = api.bookmarks.create.input.parse(data);
      const res = await fetch(api.bookmarks.create.path, {
        method: api.bookmarks.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.bookmarks.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create bookmark");
      }
      return api.bookmarks.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bookmarks.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tags.list.path] });
      toast({ title: "Bookmark saved", description: "Your bookmark has been added successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}

export function useUpdateBookmark() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateBookmarkRequest) => {
      const validated = api.bookmarks.update.input.parse(updates);
      const url = buildUrl(api.bookmarks.update.path, { id });
      
      const res = await fetch(url, {
        method: api.bookmarks.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 404) throw new Error("Bookmark not found");
        throw new Error("Failed to update bookmark");
      }
      return api.bookmarks.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bookmarks.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tags.list.path] });
      toast({ title: "Bookmark updated", description: "Your changes have been saved." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}

export function useDeleteBookmark() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.bookmarks.delete.path, { id });
      const res = await fetch(url, { 
        method: api.bookmarks.delete.method,
        credentials: "include" 
      });
      
      if (!res.ok) throw new Error("Failed to delete bookmark");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bookmarks.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tags.list.path] });
      toast({ title: "Bookmark deleted", description: "Item removed from your library." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });
}
