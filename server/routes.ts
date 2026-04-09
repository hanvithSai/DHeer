/**
 * server/routes.ts
 *
 * Registers all Express HTTP route handlers on the given app.
 * This is the single entry point for the API surface:
 *   - Authentication setup (Replit OpenID Connect via Passport.js)
 *   - Protected API routes (bookmarks, tags, workspaces, companion settings, todos)
 *   - Public API routes (public bookmark feed)
 *
 * All protected routes call `requireAuth` middleware which reads the Passport
 * session and returns 401 if the user is not authenticated.
 *
 * Route handlers are intentionally thin — they validate input with Zod,
 * delegate all DB work to `storage`, and return the result as JSON.
 *
 * Impact if this file changes:
 *  - Adding/removing a route changes what the frontend and extension can call
 *  - Changing `requireAuth` logic affects all protected endpoints simultaneously
 *  - Changing a route path must be mirrored in shared/routes.ts (for typed callers)
 *    and in the extension's sidepanel.js (which calls API_BASE_URL + path directly)
 */

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";

// ── Database seeding ───────────────────────────────────────────────────────────

/**
 * seedDatabase
 *
 * Runs once at server startup to check whether the public bookmark feed is
 * empty.  Currently only logs a message — there is no automatic content seeding
 * because creating bookmarks requires a real userId.
 *
 * Effect: Read-only probe of the `bookmarks` table.
 * Impact if changed:
 *  - Removing this call from `registerRoutes` is safe — it has no side effects.
 *  - Adding seeding logic here would permanently write data to the DB on every
 *    server restart unless guarded by an existence check.
 */
async function seedDatabase() {
  const publicBookmarks = await storage.getPublicBookmarks();
  if (publicBookmarks.length === 0) {
    console.log("Database ready. Create a user to start adding bookmarks.");
  }
}

// ── Route registration ─────────────────────────────────────────────────────────

/**
 * registerRoutes
 *
 * Attaches all Express middleware and route handlers to `app`.
 * Must be called once from server/index.ts after the HTTP server is created.
 *
 * @param httpServer — The raw Node.js HTTP server (needed for WebSocket / future use)
 * @param app        — The Express application instance
 * @returns          — The same httpServer (passed through for chaining in index.ts)
 *
 * Execution order inside this function matters:
 *  1. `setupAuth` — must run before any route that reads `req.user`
 *  2. `registerAuthRoutes` — attaches /api/login, /api/logout, /api/auth/user
 *  3. Business route handlers — depend on auth being initialized
 *  4. `seedDatabase` — runs after routes are attached (safe; non-blocking)
 *
 * Impact if changed:
 *  - Reordering auth setup before route handlers will break `req.user` access
 *  - Removing `requireAuth` from any handler exposes it to unauthenticated callers
 */
export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // 1. Boot Passport + OpenID Connect session handling
  await setupAuth(app);

  // 2. Auth-specific routes (/api/login, /api/logout, /api/auth/user)
  registerAuthRoutes(app);

  // ── Auth middleware ──────────────────────────────────────────────────────────

  /**
   * requireAuth
   *
   * Express middleware that guards all protected routes.
   * Reads the Passport.js session (populated by setupAuth) and checks
   * `req.isAuthenticated()`.  If the check fails, short-circuits the request
   * with 401 Unauthorized before the route handler runs.
   *
   * `(req.user as any).claims.sub` extracts the OIDC subject (user ID string)
   * which is used as `userId` in every storage call.
   *
   * Impact if changed:
   *  - Removing this middleware from a route makes it publicly accessible
   *  - Changing the `claims.sub` path must be reflected in every userId extraction below
   *  - Switching auth providers (e.g. Auth0) requires updating the claims shape
   */
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // ── Bookmarks API ────────────────────────────────────────────────────────────

  /**
   * GET /api/bookmarks
   *
   * Returns all bookmarks belonging to the authenticated user.
   * Supports optional query params:
   *  - `search` (string) — filters by title, URL, note, or tag name (case-insensitive)
   *  - `tag`    (string) — filters to bookmarks with an exact matching tag name
   *
   * Response: BookmarkResponse[] (each item includes a `tags` array)
   *
   * Impact if changed:
   *  - Removing `search` support breaks the home-page search box
   *  - Removing `tag` support breaks tag-filtered navigation in the sidebar
   */
  app.get(api.bookmarks.list.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const { search, tag } = req.query as any;
    const bookmarks = await storage.getBookmarks(userId, { search, tag });
    res.json(bookmarks);
  });

  /**
   * POST /api/bookmarks
   *
   * Creates a new bookmark for the authenticated user.
   * Body is validated against `insertBookmarkSchema` (Zod).
   * The optional `tags` array is processed in storage: tags that don't yet exist
   * are created automatically; existing tags are reused.
   *
   * Response 201: BookmarkResponse (with resolved tags)
   * Response 400: Zod validation error message
   * Response 500: Unexpected server error
   *
   * Impact if changed:
   *  - Removing tag processing from storage would leave orphan tag names unresolved
   *  - Changing the input schema here must be mirrored in shared/routes.ts
   */
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

  /**
   * GET /api/bookmarks/:id
   *
   * Returns a single bookmark by numeric ID.
   * Also verifies that the bookmark belongs to the requesting user (403 if not).
   *
   * Response 200: BookmarkResponse
   * Response 403: Forbidden (belongs to another user)
   * Response 404: Bookmark not found
   *
   * Impact if changed:
   *  - Removing the userId check (403 branch) would allow any logged-in user
   *    to read another user's private bookmarks by guessing IDs
   */
  app.get(api.bookmarks.get.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const bookmark = await storage.getBookmark(Number(req.params.id));

    if (!bookmark) {
      return res.status(404).json({ message: "Bookmark not found" });
    }
    if (bookmark.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json(bookmark);
  });

  /**
   * PUT /api/bookmarks/:id
   *
   * Full or partial update of a bookmark (storage handles both cases).
   * Tag array is diffed in storage: old tags are removed, new ones added.
   *
   * Response 200: Updated BookmarkResponse
   * Response 400: Zod validation error
   * Response 404: Bookmark not found or not owned by user
   * Response 500: Unexpected DB/server error
   *
   * Impact if changed:
   *  - Changing to PATCH semantics requires updating shared/routes.ts and the frontend
   */
  app.put(api.bookmarks.update.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = api.bookmarks.update.input.parse(req.body);
      const bookmark = await storage.updateBookmark(userId, Number(req.params.id), input);
      res.json(bookmark);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if ((err as Error).message === "Bookmark not found or unauthorized") {
        res.status(404).json({ message: "Bookmark not found" });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  /**
   * DELETE /api/bookmarks/:id
   *
   * Deletes a bookmark and all its bookmark_tags junction rows.
   * Ownership is enforced in storage (userId AND id WHERE clause).
   *
   * Response 204: No content
   * Response 404: Bookmark not found or not owned by user
   *
   * Impact if changed:
   *  - Removing ownership check in storage would allow cross-user deletion
   */
  app.delete(api.bookmarks.delete.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.deleteBookmark(userId, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      res.status(404).json({ message: "Bookmark not found" });
    }
  });

  // ── Tags API ─────────────────────────────────────────────────────────────────

  /**
   * GET /api/tags
   *
   * Returns all tags belonging to the authenticated user.
   * Used by the sidebar to render the tag list and by the bookmark form
   * for autocomplete.
   *
   * Response 200: Tag[]
   *
   * Impact if changed:
   *  - Removing this route breaks sidebar tag navigation and the bookmark editor
   */
  app.get(api.tags.list.path, requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const tags = await storage.getTags(userId);
    res.json(tags);
  });

  /**
   * PATCH /api/tags/:id
   *
   * Renames an existing tag.  All bookmarks that reference this tag will
   * automatically reflect the new name (they link by tagId, not name string).
   *
   * Response 200: Updated Tag
   * Response 400: Validation error (name is required)
   * Response 404: Tag not found or not owned by user
   * Response 500: Unexpected DB error
   *
   * Impact if changed:
   *  - Allowing name to be empty would create invalid tags that break search
   */
  app.patch(api.tags.update.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { name } = api.tags.update.input.parse(req.body);
      const tag = await storage.updateTag(userId, Number(req.params.id), name);
      res.json(tag);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if ((err as Error).message === "Tag not found") {
        res.status(404).json({ message: "Tag not found" });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  /**
   * DELETE /api/tags/:id
   *
   * Deletes a tag and cascades removal from all bookmark_tags junction rows.
   * Bookmarks themselves are NOT deleted — they simply lose this tag.
   *
   * Response 204: No content
   * Response 404: Tag not found or not owned by user
   * Response 500: Unexpected DB error
   *
   * Impact if changed:
   *  - Not cascading bookmark_tags deletion would leave orphan FK rows in the DB
   */
  app.delete(api.tags.delete.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.deleteTag(userId, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      if ((err as Error).message === "Tag not found") {
        res.status(404).json({ message: "Tag not found" });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * GET /api/public/bookmarks
   *
   * Returns up to 50 bookmarks marked as public, from any user.
   * This route has NO `requireAuth` — it is intentionally unauthenticated.
   * Used by the PublicBookmarksPage which is accessible without login.
   *
   * Response 200: BookmarkResponse[]
   *
   * Impact if changed:
   *  - Adding `requireAuth` would break the public feed for non-logged-in visitors
   *  - Changing the limit (50) affects how much content appears on the public page
   */
  app.get(api.public.list.path, async (req, res) => {
    const bookmarks = await storage.getPublicBookmarks();
    res.json(bookmarks);
  });

  // ── Workspaces API ───────────────────────────────────────────────────────────

  /**
   * GET /api/workspaces
   *
   * Returns all workspaces belonging to the authenticated user, ordered by
   * creation date descending (newest first).
   *
   * Response 200: Workspace[]
   *
   * Impact if changed:
   *  - Used by companion-panel.tsx (web) and sidepanel.js (extension) —
   *    both must be updated if the shape changes
   */
  app.get("/api/workspaces", requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const workspaces = await storage.getWorkspaces(userId);
    res.json(workspaces);
  });

  /**
   * POST /api/workspaces
   *
   * Creates a new named workspace with an array of URLs.
   * Body is validated against `insertWorkspaceSchema`.
   *
   * Response 201: Workspace
   * Response 400: Zod validation error
   * Response 500: Unexpected DB error
   *
   * Impact if changed:
   *  - Validating each URL in the `urls` array would improve data quality
   *    but is a breaking schema change
   */
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

  /**
   * DELETE /api/workspaces/:id
   *
   * Deletes a workspace by ID.  Ownership is enforced via userId in the
   * WHERE clause inside storage.deleteWorkspace.
   *
   * Response 204: No content
   * Response 500: Unexpected DB error (e.g. workspace not found is silently ignored)
   *
   * Impact if changed:
   *  - Storage currently does a silent delete (no row-count check), so deleting
   *    a non-existent ID returns 204 instead of 404 — acceptable for idempotent DELETE
   */
  app.delete("/api/workspaces/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.deleteWorkspace(userId, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Companion Settings API ───────────────────────────────────────────────────

  /**
   * GET /api/companion/settings
   *
   * Returns the companion settings for the authenticated user.
   * If no settings row exists yet, storage auto-creates one with defaults.
   * This means the first call for a new user always succeeds.
   *
   * Response 200: CompanionSettings
   *
   * Impact if changed:
   *  - Removing the auto-create fallback in storage means new users will get
   *    a 500 on first load until they explicitly save settings
   */
  app.get("/api/companion/settings", requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const settings = await storage.getCompanionSettings(userId);
    res.json(settings);
  });

  /**
   * PATCH /api/companion/settings
   *
   * Partial update of companion settings.  Only the provided fields are updated;
   * all others retain their current values.
   *
   * Response 200: Updated CompanionSettings
   * Response 400: Zod validation error
   * Response 500: Unexpected DB error
   *
   * Impact if changed:
   *  - The updated settings object is also sent to the browser extension via
   *    `chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG' })` in companion-panel.tsx
   *  - Changes here must be compatible with how background.js reads `config`
   */
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

  // ── Todo Statuses API ────────────────────────────────────────────────────────

  /**
   * GET /api/todo-statuses
   *
   * Returns all todo status definitions for the authenticated user.
   * If none exist yet (first call for a new user), storage seeds three defaults:
   *   "To Do" (#c08552), "In Progress" (#895737), "Done" (#4ade80).
   *
   * Response 200: TodoStatus[]
   *
   * Impact if changed:
   *  - Both todo-panel.tsx (web) and sidepanel.js (extension) call this endpoint
   *  - The extension status dropdown is populated from this response
   */
  app.get("/api/todo-statuses", requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const statuses = await storage.getTodoStatuses(userId);
    res.json(statuses);
  });

  /**
   * POST /api/todo-statuses
   *
   * Creates a new custom status for the authenticated user.
   * Body: { name: string, color: string (hex), sortOrder?: number }
   *
   * Response 201: TodoStatus
   * Response 400: Zod validation error
   * Response 500: DB error
   *
   * Impact if changed:
   *  - No uniqueness check on `name` — duplicate status names are allowed
   *    (intentional — users may want similarly named statuses with different colors)
   */
  app.post("/api/todo-statuses", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { insertTodoStatusSchema } = await import("@shared/schema");
      const input = insertTodoStatusSchema.parse(req.body);
      const status = await storage.createTodoStatus(userId, input);
      res.status(201).json(status);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  /**
   * PATCH /api/todo-statuses/:id
   *
   * Partially updates a todo status (name, color, or sortOrder).
   * All todos that reference this status automatically reflect the change
   * because they store the statusId FK, not the name string.
   *
   * Response 200: Updated TodoStatus
   * Response 400: Zod validation error
   * Response 404: Status not found or not owned by user
   * Response 500: Unexpected DB error
   *
   * Impact if changed:
   *  - Renaming or recoloring a status instantly affects all todos using it
   *    when the client re-fetches; no cascade update needed in the todos table
   */
  app.patch("/api/todo-statuses/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { insertTodoStatusSchema } = await import("@shared/schema");
      const input = insertTodoStatusSchema.partial().parse(req.body);
      const status = await storage.updateTodoStatus(userId, Number(req.params.id), input);
      res.json(status);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if ((err as Error).message === "Status not found") {
        res.status(404).json({ message: "Status not found" });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  /**
   * DELETE /api/todo-statuses/:id
   *
   * Deletes a custom status.
   * Before deletion, all todos that reference this statusId are updated to
   * `statusId = null` so no orphan references remain (storage handles this).
   * The DB-level FK uses ON DELETE SET NULL as a safety net.
   *
   * Response 204: No content
   * Response 500: Unexpected DB error
   *
   * Impact if changed:
   *  - Skipping the null-out step in storage would leave todos with a dangling
   *    statusId (mitigated by the FK constraint, but the ORM still reads stale data)
   */
  app.delete("/api/todo-statuses/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.deleteTodoStatus(userId, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Todos API ────────────────────────────────────────────────────────────────

  /**
   * GET /api/todos
   *
   * Returns all todos for the authenticated user, ordered by creation date
   * descending.  Priority-based sorting is done on the client to keep the
   * query simple and avoid multiple round-trips.
   *
   * Response 200: Todo[]
   *
   * Impact if changed:
   *  - Sorting server-side would simplify client code but coupling sort logic here
   *    prevents per-filter sort customization in the UI
   */
  app.get("/api/todos", requireAuth, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const items = await storage.getTodos(userId);
    res.json(items);
  });

  /**
   * POST /api/todos
   *
   * Creates a new todo for the authenticated user.
   * Body: { title: string, note?: string, priority?: string, statusId?: number }
   * `statusId` must be a valid ID from the user's `todo_statuses` table or null.
   * The DB FK (ON DELETE SET NULL) prevents invalid references.
   *
   * Response 201: Todo
   * Response 400: Zod validation error
   * Response 500: DB error (e.g. FK violation if statusId references another user's status)
   *
   * Impact if changed:
   *  - Adding a `dueDate` field here requires schema + storage + UI updates
   */
  app.post("/api/todos", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { insertTodoSchema } = await import("@shared/schema");
      const input = insertTodoSchema.parse(req.body);
      const todo = await storage.createTodo(userId, input);
      res.status(201).json(todo);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  /**
   * PATCH /api/todos/:id
   *
   * Partially updates a todo.  All fields are optional; only provided fields
   * are written to the DB.  `updatedAt` is automatically set to NOW() by storage.
   *
   * Response 200: Updated Todo
   * Response 400: Zod validation error
   * Response 404: Todo not found or not owned by user
   * Response 500: Unexpected DB error
   *
   * Impact if changed:
   *  - The "toggle done" button in both the web panel and extension PATCH only
   *    `{ statusId }` — any change to how statusId is handled here affects both
   */
  app.patch("/api/todos/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { insertTodoSchema } = await import("@shared/schema");
      const input = insertTodoSchema.partial().parse(req.body);
      const todo = await storage.updateTodo(userId, Number(req.params.id), input);
      res.json(todo);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if ((err as Error).message === "Todo not found") {
        res.status(404).json({ message: "Todo not found" });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  /**
   * DELETE /api/todos/:id
   *
   * Deletes a single todo by ID.  Ownership enforced via userId WHERE clause
   * in storage.  No cascade required — todos have no child rows.
   *
   * Response 204: No content
   * Response 500: Unexpected DB error
   *
   * Impact if changed:
   *  - Returning 404 when the todo doesn't exist would be more RESTful but
   *    requires a row-count check in storage.deleteTodo
   */
  app.delete("/api/todos/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.deleteTodo(userId, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // ── Finalize ─────────────────────────────────────────────────────────────────
  await seedDatabase();

  return httpServer;
}
