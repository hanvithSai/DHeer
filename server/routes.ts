// ... (imports)
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";

async function seedDatabase() {
  const publicBookmarks = await storage.getPublicBookmarks();
  if (publicBookmarks.length === 0) {
    // We can't easily add bookmarks with a specific userId without knowing a valid one,
    // but we can try to find a user or just skip if no users.
    // However, for public bookmarks, we might want some initial content.
    // Since we don't have a user yet, we can skip seeding user-specific data or create a dummy system user if really needed.
    // For now, let's just log that we are ready to seed when a user is created.
    console.log("Database ready. Create a user to start adding bookmarks.");
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth FIRST
  await setupAuth(app);
  registerAuthRoutes(app);

  // Protected Routes Middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // === Bookmarks API ===

  app.get(api.bookmarks.list.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { search, tag } = req.query as any;
    const bookmarks = await storage.getBookmarks(userId, { search, tag });
    res.json(bookmarks);
  });

  app.post(api.bookmarks.create.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.bookmarks.create.input.parse(req.body);
      const bookmark = await storage.createBookmark(userId, input);
      res.status(201).json(bookmark);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  app.get(api.bookmarks.get.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const bookmark = await storage.getBookmark(Number(req.params.id));
    
    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }
    
    // Authorization check
    if (bookmark.userId !== userId) {
       return res.status(403).json({ message: "Forbidden" });
    }

    res.json(bookmark);
  });

  app.put(api.bookmarks.update.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.bookmarks.update.input.parse(req.body);
      const bookmark = await storage.updateBookmark(userId, Number(req.params.id), input);
      res.json(bookmark);
    } catch (err) {
      if (err instanceof z.ZodError) {
         res.status(400).json({ message: err.errors[0].message });
      } else if ((err as Error).message === "Bookmark not found or unauthorized") { // catch our explicit error
         res.status(404).json({ message: "Bookmark not found" });
      } else {
         res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  app.delete(api.bookmarks.delete.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.deleteBookmark(userId, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
       res.status(404).json({ message: "Bookmark not found" });
    }
  });

  // === Tags API ===
  app.get(api.tags.list.path, requireAuth, async (req, res) => {
     const userId = (req.user as any).claims.sub;
     const tags = await storage.getTags(userId);
     res.json(tags);
  });

  app.patch(api.tags.update.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { name } = api.tags.update.input.parse(req.body);
      const tag = await storage.updateTag(userId, Number(req.params.id), name);
      res.json(tag);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(404).json({ message: "Tag not found" });
      }
    }
  });

  app.delete(api.tags.delete.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.deleteTag(userId, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      res.status(404).json({ message: "Tag not found" });
    }
  });

  // === Public API ===
  app.get(api.public.list.path, async (req, res) => {
    const bookmarks = await storage.getPublicBookmarks();
    res.json(bookmarks);
  });

  // === Workspaces API ===
  app.get("/api/workspaces", requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const workspaces = await storage.getWorkspaces(userId);
    res.json(workspaces);
  });

  app.post("/api/workspaces", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { insertWorkspaceSchema } = await import("@shared/schema");
      const input = insertWorkspaceSchema.parse(req.body);
      const workspace = await storage.createWorkspace(userId, input);
      res.status(201).json(workspace);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  app.delete("/api/workspaces/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.deleteWorkspace(userId, Number(req.params.id));
    res.status(204).end();
  });

  // === Companion Settings API ===
  app.get("/api/companion/settings", requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const settings = await storage.getCompanionSettings(userId);
    res.json(settings);
  });

  app.patch("/api/companion/settings", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { insertCompanionSettingsSchema } = await import("@shared/schema");
      const input = insertCompanionSettingsSchema.partial().parse(req.body);
      const settings = await storage.updateCompanionSettings(userId, input);
      res.json(settings);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  await seedDatabase();

  return httpServer;
}
