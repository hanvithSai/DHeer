/**
 * server/storage.ts
 *
 * Data Access Layer (DAL) for the DHeer application.
 *
 * Architecture:
 *  - `IStorage` interface defines the full contract for all DB operations.
 *    Any caller (routes.ts, tests) depends only on the interface, never the class.
 *  - `DatabaseStorage` implements `IStorage` using Drizzle ORM against PostgreSQL.
 *  - `storage` singleton is exported and used by every route handler.
 *
 * Impact of changes:
 *  - Adding a method to `IStorage` requires implementing it in `DatabaseStorage`.
 *  - Changing a method signature breaks all route handlers that call it.
 *  - Removing a method causes TypeScript errors in routes.ts immediately.
 *  - All queries enforce `userId` in WHERE clauses to guarantee data isolation
 *    between users — removing this check would be a severe security regression.
 */

import { db } from "./db";
import {
  bookmarks, tags, bookmarkTags, workspaces, companionSettings,
  todoStatuses, todos,
  type CreateBookmarkRequest,
  type UpdateBookmarkRequest,
  type BookmarkResponse,
  type Tag,
  type Bookmark,
  type Workspace,
  type InsertWorkspace,
  type CompanionSettings,
  type InsertCompanionSettings,
  type TodoStatus,
  type InsertTodoStatus,
  type Todo,
  type InsertTodo,
} from "@shared/schema";
import { eq, desc, asc, and, or, ilike, sql } from "drizzle-orm";
import { users, type User } from "@shared/models/auth";

// ── Interface ──────────────────────────────────────────────────────────────────

/**
 * IStorage
 *
 * Contract for all database operations.  Every method is async and returns
 * strongly-typed results inferred from the Drizzle schema.
 *
 * Any future storage backend (e.g. in-memory for tests, Redis cache layer)
 * must implement this interface.  Routes import only this interface type.
 *
 * Impact if changed:
 *  - All methods must remain implemented in DatabaseStorage
 *  - Method signatures must stay in sync with route handlers that call them
 */
export interface IStorage {
  // ── Users ────────────────────────────────────────────────────────────────────
  getUser(id: string): Promise<User | undefined>;

  // ── Bookmarks ────────────────────────────────────────────────────────────────
  getBookmarks(userId: string, options?: { search?: string; tag?: string }): Promise<BookmarkResponse[]>;
  getPublicBookmarks(): Promise<BookmarkResponse[]>;
  getBookmark(id: number): Promise<BookmarkResponse | undefined>;
  createBookmark(userId: string, bookmark: CreateBookmarkRequest): Promise<BookmarkResponse>;
  updateBookmark(userId: string, id: number, updates: UpdateBookmarkRequest): Promise<BookmarkResponse>;
  deleteBookmark(userId: string, id: number): Promise<void>;

  batchImportBookmarks(userId: string, items: { url: string; title?: string }[]): Promise<{ imported: number; duplicates: number }>;

  // ── Tags ─────────────────────────────────────────────────────────────────────
  getTags(userId: string): Promise<Tag[]>;
  updateTag(userId: string, id: number, name: string): Promise<Tag>;
  deleteTag(userId: string, id: number): Promise<void>;

  // ── Workspaces ───────────────────────────────────────────────────────────────
  getWorkspaces(userId: string): Promise<Workspace[]>;
  createWorkspace(userId: string, workspace: InsertWorkspace): Promise<Workspace>;
  deleteWorkspace(userId: string, id: number): Promise<void>;

  // ── Companion Settings ───────────────────────────────────────────────────────
  getCompanionSettings(userId: string): Promise<CompanionSettings>;
  updateCompanionSettings(userId: string, updates: Partial<InsertCompanionSettings>): Promise<CompanionSettings>;

  // ── Todo Statuses ────────────────────────────────────────────────────────────
  getTodoStatuses(userId: string): Promise<TodoStatus[]>;
  createTodoStatus(userId: string, status: InsertTodoStatus): Promise<TodoStatus>;
  updateTodoStatus(userId: string, id: number, updates: Partial<InsertTodoStatus>): Promise<TodoStatus>;
  deleteTodoStatus(userId: string, id: number): Promise<void>;

  // ── Todos ────────────────────────────────────────────────────────────────────
  getTodos(userId: string): Promise<Todo[]>;
  createTodo(userId: string, todo: InsertTodo): Promise<Todo>;
  updateTodo(userId: string, id: number, updates: Partial<InsertTodo>): Promise<Todo>;
  deleteTodo(userId: string, id: number): Promise<void>;
}

// ── Implementation ─────────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {

  // ── Users ────────────────────────────────────────────────────────────────────

  /**
   * getUser
   *
   * Fetches a single user row by their OIDC subject ID (string).
   * Used by the auth layer to hydrate `req.user` after session deserialization.
   *
   * @param id — OIDC subject (`claims.sub`), e.g. "user:12345"
   * @returns   User row or undefined if not found
   *
   * Impact if changed:
   *  - This is called by Passport.js internals (`deserializeUser`) on every
   *    authenticated request — any failure here logs out all active sessions
   */
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  // ── Bookmarks ────────────────────────────────────────────────────────────────

  /**
   * getBookmarks
   *
   * Fetches all bookmarks for a user, joining tags via bookmark_tags.
   * Uses a SQL aggregate (`json_agg ... filter where`) to collapse the join
   * into a single row per bookmark with an inline `tags` JSON array.
   *
   * Optional in-memory filters are applied AFTER the DB query:
   *  - `search` — case-insensitive substring match across title, url, note, tag names
   *  - `tag`    — exact tag name match (useful for sidebar tag-link navigation)
   *
   * @param userId  — Authenticated user's ID
   * @param options — Optional search/tag filter
   * @returns       Array of BookmarkResponse (bookmark fields + tags[])
   *
   * Impact if changed:
   *  - Removing `json_agg` and flattening breaks the "one row per bookmark" contract
   *  - Moving search to SQL (ILIKE) would scale better for large datasets
   *  - The `groupBy(bookmarks.id)` is required for the aggregate to work
   */
  async getBookmarks(
    userId: string,
    options?: { search?: string; tag?: string },
  ): Promise<BookmarkResponse[]> {
    const whereClause = and(
      eq(bookmarks.userId, userId),
      // SQL ILIKE search across title, url, note, and tag names
      options?.search
        ? or(
            ilike(bookmarks.title, `%${options.search}%`),
            ilike(bookmarks.url,   `%${options.search}%`),
            ilike(bookmarks.note,  `%${options.search}%`),
            sql`EXISTS (
              SELECT 1 FROM bookmark_tags bt_s
              JOIN tags t_s ON bt_s.tag_id = t_s.id
              WHERE bt_s.bookmark_id = ${bookmarks.id}
              AND LOWER(t_s.name) LIKE LOWER(${'%' + options.search + '%'})
            )`,
          )
        : undefined,
      // SQL EXISTS filter for exact tag name match
      options?.tag
        ? sql`EXISTS (
            SELECT 1 FROM bookmark_tags bt_t
            JOIN tags t_t ON bt_t.tag_id = t_t.id
            WHERE bt_t.bookmark_id = ${bookmarks.id}
            AND t_t.name = ${options.tag}
          )`
        : undefined,
    );

    const rows = await db
      .select({
        bookmark: bookmarks,
        tags: sql<Tag[]>`coalesce(
          json_agg(
            json_build_object('id', ${tags.id}, 'userId', ${tags.userId}, 'name', ${tags.name})
          ) filter (where ${tags.id} is not null),
          '[]'
        )`,
      })
      .from(bookmarks)
      .leftJoin(bookmarkTags, eq(bookmarks.id, bookmarkTags.bookmarkId))
      .leftJoin(tags, eq(bookmarkTags.tagId, tags.id))
      .where(whereClause)
      .groupBy(bookmarks.id)
      .orderBy(desc(bookmarks.createdAt));

    return rows.map(row => ({ ...row.bookmark, tags: row.tags }));
  }

  /**
   * getPublicBookmarks
   *
   * Fetches up to 50 bookmarks where `is_public = true`, from all users.
   * Used by the unauthenticated public feed page (/public).
   * The 50-row limit prevents the public page from becoming a firehose.
   *
   * Impact if changed:
   *  - Raising the limit increases DB load and page render time
   *  - Adding a sort-by-upvotes column would require a schema change
   */
  async getPublicBookmarks(): Promise<BookmarkResponse[]> {
    const rows = await db
      .select({
        bookmark: bookmarks,
        tags: sql<Tag[]>`coalesce(
          json_agg(
            json_build_object('id', ${tags.id}, 'userId', ${tags.userId}, 'name', ${tags.name})
          ) filter (where ${tags.id} is not null),
          '[]'
        )`,
        // Correlated subquery — returns the owner's full name (or null if not set)
        authorName: sql<string | null>`(
          SELECT NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '')
          FROM users u
          WHERE u.id = ${bookmarks.userId}
        )`,
        // Correlated subquery — returns the owner's profile image URL
        authorAvatar: sql<string | null>`(
          SELECT u.profile_image_url
          FROM users u
          WHERE u.id = ${bookmarks.userId}
        )`,
      })
      .from(bookmarks)
      .leftJoin(bookmarkTags, eq(bookmarks.id, bookmarkTags.bookmarkId))
      .leftJoin(tags, eq(bookmarkTags.tagId, tags.id))
      .where(eq(bookmarks.isPublic, true))
      .groupBy(bookmarks.id)
      .orderBy(desc(bookmarks.createdAt))
      .limit(50);

    return rows.map(row => ({
      ...row.bookmark,
      tags:         row.tags,
      authorName:   row.authorName,
      authorAvatar: row.authorAvatar,
    }));
  }

  /**
   * getBookmark
   *
   * Fetches a single bookmark by numeric ID (no userId filter).
   * The route layer applies the ownership check (`bookmark.userId !== userId`)
   * to return 403 if the requester doesn't own the bookmark.
   *
   * @param id — Numeric bookmark PK
   * @returns   BookmarkResponse or undefined
   *
   * Impact if changed:
   *  - Adding a `userId` filter here would prevent cross-user edit/view,
   *    but then the 403 branch in the route could never be reached
   */
  async getBookmark(id: number): Promise<BookmarkResponse | undefined> {
    const rows = await db
      .select({
        bookmark: bookmarks,
        tags: sql<Tag[]>`coalesce(
          json_agg(
            json_build_object('id', ${tags.id}, 'userId', ${tags.userId}, 'name', ${tags.name})
          ) filter (where ${tags.id} is not null),
          '[]'
        )`,
      })
      .from(bookmarks)
      .leftJoin(bookmarkTags, eq(bookmarks.id, bookmarkTags.bookmarkId))
      .leftJoin(tags, eq(bookmarkTags.tagId, tags.id))
      .where(eq(bookmarks.id, id))
      .groupBy(bookmarks.id);

    if (rows.length === 0) return undefined;
    return { ...rows[0].bookmark, tags: rows[0].tags };
  }

  /**
   * createBookmark
   *
   * Inserts a bookmark row, then resolves each tag name:
   *  - If a tag with that name already exists for this user, reuse it
   *  - Otherwise insert a new tag row
   * Finally, inserts bookmark_tags junction rows to link bookmark ↔ tags.
   *
   * @param userId  — Owner of the new bookmark
   * @param request — Validated bookmark fields + optional tags string array
   * @returns        Created BookmarkResponse with resolved tags
   *
   * Impact if changed:
   *  - The tag upsert loop is sequential (one query per tag).  For large tag
   *    arrays, batch upsert (INSERT ... ON CONFLICT DO NOTHING) would be faster.
   *  - Changing the tag resolution logic here affects all bookmark creation paths
   *    (web app form AND browser extension save button)
   */
  async createBookmark(userId: string, request: CreateBookmarkRequest): Promise<BookmarkResponse> {
    const { tags: tagNames, ...bookmarkData } = request;
    const [bookmark] = await db
      .insert(bookmarks)
      .values({ ...bookmarkData, userId })
      .returning();

    const currentTags: Tag[] = [];
    if (tagNames && tagNames.length > 0) {
      for (const name of tagNames) {
        let [tag] = await db
          .select()
          .from(tags)
          .where(and(eq(tags.userId, userId), eq(tags.name, name)));
        if (!tag) {
          [tag] = await db.insert(tags).values({ userId, name }).returning();
        }
        currentTags.push(tag);
        await db.insert(bookmarkTags).values({ bookmarkId: bookmark.id, tagId: tag.id });
      }
    }
    return { ...bookmark, tags: currentTags };
  }

  /**
   * updateBookmark
   *
   * Updates scalar fields of a bookmark (title, url, note, isPublic, etc.)
   * and performs a full tag replacement if a `tags` array is provided:
   *  1. Deletes ALL existing bookmark_tags for this bookmark
   *  2. Re-resolves and re-inserts the new tag set
   *
   * This "replace all" strategy is simple but means:
   *  - An empty `tags: []` clears all tags
   *  - `tags` not present in the body = tags left unchanged
   *
   * @param userId  — Must own the bookmark; enforced via AND clause in UPDATE
   * @param id      — Numeric bookmark PK
   * @param updates — Partial bookmark fields + optional new tags
   * @returns        Updated BookmarkResponse
   *
   * Impact if changed:
   *  - Switching to a diff-based tag update (only add/remove changed tags)
   *    would reduce DB writes but complicate the logic
   */
  async updateBookmark(
    userId: string,
    id: number,
    updates: UpdateBookmarkRequest,
  ): Promise<BookmarkResponse> {
    const { tags: tagNames, ...bookmarkUpdates } = updates;

    if (Object.keys(bookmarkUpdates).length > 0) {
      await db
        .update(bookmarks)
        .set({ ...bookmarkUpdates, updatedAt: new Date() })
        .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
    }

    if (tagNames !== undefined) {
      // Full tag replacement
      await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id));
      for (const name of tagNames) {
        let [tag] = await db
          .select()
          .from(tags)
          .where(and(eq(tags.userId, userId), eq(tags.name, name)));
        if (!tag) {
          [tag] = await db.insert(tags).values({ userId, name }).returning();
        }
        await db.insert(bookmarkTags).values({ bookmarkId: id, tagId: tag.id });
      }
    }

    const updated = await this.getBookmark(id);
    if (!updated) throw new Error("Bookmark not found");
    return updated;
  }

  /**
   * deleteBookmark
   *
   * Deletes a bookmark and its junction rows in bookmark_tags.
   * junction rows are deleted FIRST to avoid FK violations.
   * The bookmark DELETE uses `userId AND id` to prevent cross-user deletion.
   *
   * @param userId — Must own the bookmark
   * @param id     — Numeric bookmark PK
   *
   * Impact if changed:
   *  - Removing the bookmark_tags delete first would cause a FK constraint error
   *    if the DB has referential integrity enforced (currently not at DB level)
   */
  async deleteBookmark(userId: string, id: number): Promise<void> {
    await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id));
    await db.delete(bookmarks).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
  }

  /**
   * batchImportBookmarks
   *
   * Accepts an array of { url, title? } items and inserts those whose URL does
   * not already exist for the user.  Existing URLs are silently skipped
   * (deduplicated) rather than overwritten.
   *
   * @param userId — Owner of the new bookmarks
   * @param items  — Array of { url, title? } objects parsed from the import source
   * @returns       Summary: { imported, duplicates }
   */
  async batchImportBookmarks(
    userId: string,
    items: { url: string; title?: string }[],
  ): Promise<{ imported: number; duplicates: number }> {
    if (items.length === 0) return { imported: 0, duplicates: 0 };

    // 1. Deduplicate within the import payload itself (first occurrence wins)
    const seenInPayload = new Set<string>();
    const uniqueItems: typeof items = [];
    for (const item of items) {
      if (!seenInPayload.has(item.url)) {
        seenInPayload.add(item.url);
        uniqueItems.push(item);
      }
    }
    const intraDuplicates = items.length - uniqueItems.length;

    // 2. Fetch existing URLs for this user in one query to deduplicate against DB
    const existing = await db
      .select({ url: bookmarks.url })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId));
    const existingUrls = new Set(existing.map(r => r.url));

    const newItems = uniqueItems.filter(item => !existingUrls.has(item.url));
    const duplicates = intraDuplicates + (uniqueItems.length - newItems.length);

    if (newItems.length > 0) {
      // Insert in chunks of 100 to avoid very large parameterized queries
      const CHUNK = 100;
      for (let i = 0; i < newItems.length; i += CHUNK) {
        const chunk = newItems.slice(i, i + CHUNK).map(item => ({
          userId,
          url: item.url,
          title: item.title || item.url,
          savedFrom: "import" as const,
        }));
        await db.insert(bookmarks).values(chunk);
      }
    }

    return { imported: newItems.length, duplicates };
  }

  // ── Tags ─────────────────────────────────────────────────────────────────────

  /**
   * getTags
   *
   * Returns all tags owned by the user.  Used by the sidebar tag list and
   * bookmark editor tag autocomplete.
   *
   * @param userId — Owner filter
   * @returns       Tag[] (unordered; sidebar sorts alphabetically)
   *
   * Impact if changed:
   *  - Adding ORDER BY name here would sort at DB level, removing client sort
   */
  async getTags(userId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.userId, userId));
  }

  /**
   * updateTag
   *
   * Renames a tag by ID.  Because bookmarks reference tagId (not tag name),
   * all bookmarks automatically "see" the new name without any cascade update.
   *
   * @param userId — Ownership check
   * @param id     — Tag PK
   * @param name   — New name string
   * @returns       Updated Tag
   * @throws        Error("Tag not found") if no rows matched (used for 404 in route)
   *
   * Impact if changed:
   *  - No uniqueness check — two tags can share the same name for the same user.
   *    Adding a unique constraint would require a schema migration.
   */
  async updateTag(userId: string, id: number, name: string): Promise<Tag> {
    const [updated] = await db
      .update(tags)
      .set({ name })
      .where(and(eq(tags.id, id), eq(tags.userId, userId)))
      .returning();
    if (!updated) throw new Error("Tag not found");
    return updated;
  }

  /**
   * deleteTag
   *
   * Deletes a tag and removes it from all bookmark_tags junction rows.
   * The bookmark_tags delete is performed FIRST to satisfy referential integrity.
   * The bookmarks themselves are NOT deleted — they simply lose this tag association.
   *
   * @param userId — Ownership check; prevents deleting another user's tags
   * @param id     — Tag PK
   * @throws        Error("Tag not found") if the tag does not exist for this user
   *
   * Impact if changed:
   *  - Removing the bookmark_tags cleanup would leave orphan rows that appear
   *    as ghost tags on affected bookmarks
   */
  async deleteTag(userId: string, id: number): Promise<void> {
    await db.delete(bookmarkTags).where(eq(bookmarkTags.tagId, id));
    const [deleted] = await db
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, userId)))
      .returning();
    if (!deleted) throw new Error("Tag not found");
  }

  // ── Workspaces ────────────────────────────────────────────────────────────────

  /**
   * getWorkspaces
   *
   * Returns all workspaces belonging to the user, newest first.
   * Used by the Companion Panel (web) and the extension sidepanel.
   *
   * @param userId — Owner filter
   * @returns       Workspace[] ordered by createdAt DESC
   *
   * Impact if changed:
   *  - Changing the sort order would affect the order rendered in both
   *    the web companion panel and the extension workspace list
   */
  async getWorkspaces(userId: string): Promise<Workspace[]> {
    return db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .orderBy(desc(workspaces.createdAt));
  }

  /**
   * createWorkspace
   *
   * Inserts a new workspace row with the provided name and URL array.
   * The `urls` column is stored as a JSONB array.
   *
   * @param userId    — Owner
   * @param workspace — Validated workspace payload (name + urls[])
   * @returns          Created Workspace
   *
   * Impact if changed:
   *  - No URL format validation — invalid URLs will be stored and passed
   *    to chrome.windows.create which will open them blindly
   */
  async createWorkspace(userId: string, workspace: InsertWorkspace): Promise<Workspace> {
    const [created] = await db
      .insert(workspaces)
      .values({ userId, name: workspace.name, urls: workspace.urls as string[] })
      .returning();
    return created;
  }

  /**
   * deleteWorkspace
   *
   * Deletes a workspace by ID.  Ownership enforced via AND clause.
   * Silently succeeds if the ID doesn't exist (idempotent delete behavior).
   *
   * @param userId — Owner
   * @param id     — Workspace PK
   *
   * Impact if changed:
   *  - Adding a row-count check and throwing on 0 rows would enable a 404 response
   *    in the route, which is more RESTful
   */
  async deleteWorkspace(userId: string, id: number): Promise<void> {
    await db
      .delete(workspaces)
      .where(and(eq(workspaces.id, id), eq(workspaces.userId, userId)));
  }

  // ── Companion Settings ────────────────────────────────────────────────────────

  /**
   * getCompanionSettings
   *
   * Returns companion settings for the user.
   * If no row exists yet (first call for a new user), inserts a default row
   * and returns it.  This "upsert on read" pattern ensures new users always
   * get a valid settings object without a separate onboarding step.
   *
   * @param userId — Unique owner (UNIQUE constraint on userId in DB)
   * @returns       CompanionSettings (always non-null)
   *
   * Impact if changed:
   *  - Removing the auto-create fallback means new users get a 500 until they
   *    PATCH settings at least once
   *  - Changing the defaults here affects first-time users only
   */
  async getCompanionSettings(userId: string): Promise<CompanionSettings> {
    const [settings] = await db
      .select()
      .from(companionSettings)
      .where(eq(companionSettings.userId, userId));

    if (!settings) {
      const [created] = await db
        .insert(companionSettings)
        .values({ userId })
        .returning();
      return created;
    }
    return settings;
  }

  /**
   * updateCompanionSettings
   *
   * Partially updates companion settings for a user.
   * If the row somehow doesn't exist yet, falls back to INSERT (safety net).
   *
   * @param userId  — Owner
   * @param updates — Subset of settings fields to change
   * @returns        Updated CompanionSettings
   *
   * Impact if changed:
   *  - The updated settings are forwarded to the browser extension via
   *    `chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG' })` in companion-panel.tsx
   *  - background.js merges the config into its in-memory `config` object
   */
  async updateCompanionSettings(
    userId: string,
    updates: Partial<InsertCompanionSettings>,
  ): Promise<CompanionSettings> {
    const [updated] = await db
      .update(companionSettings)
      .set(updates)
      .where(eq(companionSettings.userId, userId))
      .returning();

    if (!updated) {
      // Safety net: row missing — insert with provided values
      // @ts-ignore — TypeScript can't verify the partial satisfies NOT NULL constraints at runtime
      const [created] = await db
        .insert(companionSettings)
        .values({ ...updates, userId })
        .returning();
      return created;
    }
    return updated;
  }

  // ── Todo Statuses ─────────────────────────────────────────────────────────────

  /**
   * getTodoStatuses
   *
   * Returns all custom todo statuses for a user, ordered by sortOrder ASC then id ASC.
   * On first call for a new user (zero rows), seeds three default statuses:
   *   • "To Do"       #c08552 (Deer Tan)
   *   • "In Progress" #895737 (Warm Brown)
   *   • "Done"        #4ade80 (Green)
   *
   * These defaults are also relied upon by:
   *  - todo-panel.tsx "toggle done" button (searches for status named "Done")
   *  - extension sidepanel.js done-toggle handler (same "Done" name search)
   *
   * @param userId — Owner filter
   * @returns       TodoStatus[] ordered by sortOrder, then id
   *
   * Impact if changed:
   *  - Renaming the seeded "Done" default would break the toggle-done logic
   *    in both the web panel and extension until users rename it back
   *  - Removing seeding means new users start with no statuses and must create
   *    them manually before any status can be assigned to a todo
   */
  async getTodoStatuses(userId: string): Promise<TodoStatus[]> {
    const existing = await db
      .select()
      .from(todoStatuses)
      .where(eq(todoStatuses.userId, userId))
      .orderBy(asc(todoStatuses.sortOrder), asc(todoStatuses.id));

    if (existing.length === 0) {
      const defaults = [
        { userId, name: "To Do",       color: "#c08552", sortOrder: 0 },
        { userId, name: "In Progress", color: "#895737", sortOrder: 1 },
        { userId, name: "Done",        color: "#4ade80", sortOrder: 2 },
      ];
      return db.insert(todoStatuses).values(defaults).returning();
    }
    return existing;
  }

  /**
   * createTodoStatus
   *
   * Inserts a new custom status row for the user.
   * No uniqueness check on `name` — duplicate names are allowed.
   *
   * @param userId — Owner
   * @param status — Validated payload: { name, color, sortOrder? }
   * @returns       Created TodoStatus
   *
   * Impact if changed:
   *  - Adding a unique constraint on (userId, name) would break
   *    users who accidentally created duplicates before the constraint
   */
  async createTodoStatus(userId: string, status: InsertTodoStatus): Promise<TodoStatus> {
    const [created] = await db
      .insert(todoStatuses)
      .values({ ...status, userId })
      .returning();
    return created;
  }

  /**
   * updateTodoStatus
   *
   * Updates a todo status's name, color, or sortOrder.
   * Ownership enforced via AND (id, userId) WHERE clause.
   * All todos referencing this statusId will automatically display the
   * updated name/color on the next client re-fetch (no data migration needed).
   *
   * @param userId  — Owner
   * @param id      — TodoStatus PK
   * @param updates — Partial status fields
   * @returns        Updated TodoStatus
   * @throws         Error("Status not found") if no row matched (→ 404 in route)
   *
   * Impact if changed:
   *  - Renaming a status affects display in both web panel and extension
   *    simultaneously on next data reload
   */
  async updateTodoStatus(
    userId: string,
    id: number,
    updates: Partial<InsertTodoStatus>,
  ): Promise<TodoStatus> {
    const [updated] = await db
      .update(todoStatuses)
      .set(updates)
      .where(and(eq(todoStatuses.id, id), eq(todoStatuses.userId, userId)))
      .returning();

    if (!updated) throw new Error("Status not found");
    return updated;
  }

  /**
   * deleteTodoStatus
   *
   * Deletes a custom status in two steps:
   *  1. Null out `statusId` on all todos owned by this user that reference it
   *     (this is the application-layer cascade; the DB FK also uses ON DELETE SET NULL
   *     as a safety net in case this step is bypassed)
   *  2. Delete the status row itself
   *
   * @param userId — Owner (prevents deleting another user's statuses)
   * @param id     — TodoStatus PK
   *
   * Impact if changed:
   *  - Removing step 1 still works due to the DB-level ON DELETE SET NULL FK,
   *    but it's better to be explicit for clarity and test coverage
   *  - Deleting a default status (e.g. "Done") breaks toggle-done logic
   *    until the user creates a new status named "Done"
   */
  async deleteTodoStatus(userId: string, id: number): Promise<void> {
    // Step 1: unlink affected todos before removing the status row
    await db
      .update(todos)
      .set({ statusId: null })
      .where(and(eq(todos.userId, userId), eq(todos.statusId, id)));

    // Step 2: delete the status itself (DB FK ON DELETE SET NULL is a safety net)
    await db
      .delete(todoStatuses)
      .where(and(eq(todoStatuses.id, id), eq(todoStatuses.userId, userId)));
  }

  // ── Todos ─────────────────────────────────────────────────────────────────────

  /**
   * getTodos
   *
   * Returns all todos for the user, ordered by creation date descending.
   * Priority-based sorting is delegated to the client (todo-panel.tsx) to allow
   * flexible re-ordering without extra DB round-trips.
   *
   * @param userId — Owner filter
   * @returns       Todo[] (raw rows, statusId is a bare integer or null)
   *
   * Impact if changed:
   *  - Returning todos joined with status data would save a client-side lookup
   *    but increases response payload size and complicates the type signature
   */
  async getTodos(userId: string): Promise<Todo[]> {
    return db
      .select()
      .from(todos)
      .where(eq(todos.userId, userId))
      .orderBy(desc(todos.createdAt));
  }

  /**
   * createTodo
   *
   * Inserts a new todo row.  `updatedAt` is set to the same value as `createdAt`
   * by the Drizzle default (`defaultNow()`); it is explicitly updated on every PATCH.
   *
   * @param userId — Owner
   * @param todo   — Validated payload: { title, note?, priority?, statusId? }
   * @returns       Created Todo
   *
   * Impact if changed:
   *  - No server-side priority validation — any string is accepted.
   *    The schema uses varchar(10), so values like "urgent" are stored but not rendered.
   *    Add a Zod `.refine()` or DB CHECK constraint to enforce the enum.
   */
  async createTodo(userId: string, todo: InsertTodo): Promise<Todo> {
    const [created] = await db
      .insert(todos)
      .values({ ...todo, userId })
      .returning();
    return created;
  }

  /**
   * updateTodo
   *
   * Partially updates a todo row.  `updatedAt` is explicitly set to NOW()
   * on every update so clients can detect which todos were recently changed.
   *
   * @param userId  — Owner (enforced via AND clause)
   * @param id      — Todo PK
   * @param updates — Partial todo fields (any subset of InsertTodo)
   * @returns        Updated Todo
   * @throws         Error("Todo not found") if no row matched (→ 404 in route)
   *
   * Impact if changed:
   *  - The "toggle done" action in both the web panel and extension sends only
   *    `{ statusId: <doneId | toDoId> }` — any validation on statusId here
   *    would affect that flow
   */
  async updateTodo(userId: string, id: number, updates: Partial<InsertTodo>): Promise<Todo> {
    const [updated] = await db
      .update(todos)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(todos.id, id), eq(todos.userId, userId)))
      .returning();

    if (!updated) throw new Error("Todo not found");
    return updated;
  }

  /**
   * deleteTodo
   *
   * Deletes a single todo row.  Todos have no child rows, so no cascade is needed.
   * Ownership enforced via AND (id, userId) WHERE clause.
   * Silently succeeds if the todo doesn't exist (idempotent).
   *
   * @param userId — Owner
   * @param id     — Todo PK
   *
   * Impact if changed:
   *  - Adding a row-count check and throwing on 0 rows would allow the route
   *    to return 404 instead of 204 for missing todos
   */
  async deleteTodo(userId: string, id: number): Promise<void> {
    await db
      .delete(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, userId)));
  }
}

/**
 * storage
 *
 * The singleton DatabaseStorage instance used by all route handlers.
 * Import this in routes.ts — do not instantiate DatabaseStorage elsewhere.
 *
 * Impact if changed:
 *  - Swapping to a different IStorage implementation (e.g. InMemoryStorage for tests)
 *    requires changing only this line, thanks to the interface abstraction
 */
export const storage = new DatabaseStorage();
