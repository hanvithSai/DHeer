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
import { eq, desc, asc, and, ilike, sql, or } from "drizzle-orm";
import { users, type User } from "@shared/models/auth";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getBookmarks(userId: string, options?: { search?: string, tag?: string }): Promise<BookmarkResponse[]>;
  getPublicBookmarks(): Promise<BookmarkResponse[]>;
  getBookmark(id: number): Promise<BookmarkResponse | undefined>;
  createBookmark(userId: string, bookmark: CreateBookmarkRequest): Promise<BookmarkResponse>;
  updateBookmark(userId: string, id: number, updates: UpdateBookmarkRequest): Promise<BookmarkResponse>;
  deleteBookmark(userId: string, id: number): Promise<void>;
  getTags(userId: string): Promise<Tag[]>;
  updateTag(userId: string, id: number, name: string): Promise<Tag>;
  deleteTag(userId: string, id: number): Promise<void>;
  
  // Workspaces
  getWorkspaces(userId: string): Promise<Workspace[]>;
  createWorkspace(userId: string, workspace: InsertWorkspace): Promise<Workspace>;
  deleteWorkspace(userId: string, id: number): Promise<void>;
  
  // Companion Settings
  getCompanionSettings(userId: string): Promise<CompanionSettings>;
  updateCompanionSettings(userId: string, updates: Partial<InsertCompanionSettings>): Promise<CompanionSettings>;

  // Todo Statuses
  getTodoStatuses(userId: string): Promise<TodoStatus[]>;
  createTodoStatus(userId: string, status: InsertTodoStatus): Promise<TodoStatus>;
  updateTodoStatus(userId: string, id: number, updates: Partial<InsertTodoStatus>): Promise<TodoStatus>;
  deleteTodoStatus(userId: string, id: number): Promise<void>;

  // Todos
  getTodos(userId: string): Promise<Todo[]>;
  createTodo(userId: string, todo: InsertTodo): Promise<Todo>;
  updateTodo(userId: string, id: number, updates: Partial<InsertTodo>): Promise<Todo>;
  deleteTodo(userId: string, id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getBookmarks(userId: string, options?: { search?: string, tag?: string }): Promise<BookmarkResponse[]> {
    let whereClause = eq(bookmarks.userId, userId);
    
    const query = db.select({
      bookmark: bookmarks,
      tags: sql<Tag[]>`coalesce(
        json_agg(
          json_build_object('id', ${tags.id}, 'userId', ${tags.userId}, 'name', ${tags.name})
        ) filter (where ${tags.id} is not null),
        '[]'
      )`
    })
    .from(bookmarks)
    .leftJoin(bookmarkTags, eq(bookmarks.id, bookmarkTags.bookmarkId))
    .leftJoin(tags, eq(bookmarkTags.tagId, tags.id))
    .where(whereClause)
    .groupBy(bookmarks.id)
    .orderBy(desc(bookmarks.createdAt));

    const rows = await query;
    let filteredRows = rows.map(row => ({ ...row.bookmark, tags: row.tags }));

    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      filteredRows = filteredRows.filter(b => 
        (b.title?.toLowerCase().includes(searchLower)) ||
        (b.url.toLowerCase().includes(searchLower)) ||
        (b.note?.toLowerCase().includes(searchLower)) ||
        (b.tags.some(t => t.name.toLowerCase().includes(searchLower)))
      );
    }

    if (options?.tag) {
      filteredRows = filteredRows.filter(b => 
        b.tags.some(t => t.name === options.tag)
      );
    }

    return filteredRows;
  }

  async getPublicBookmarks(): Promise<BookmarkResponse[]> {
    const rows = await db.select({
      bookmark: bookmarks,
      tags: sql<Tag[]>`coalesce(
        json_agg(
          json_build_object('id', ${tags.id}, 'userId', ${tags.userId}, 'name', ${tags.name})
        ) filter (where ${tags.id} is not null),
        '[]'
      )`
    })
    .from(bookmarks)
    .leftJoin(bookmarkTags, eq(bookmarks.id, bookmarkTags.bookmarkId))
    .leftJoin(tags, eq(bookmarkTags.tagId, tags.id))
    .where(eq(bookmarks.isPublic, true))
    .groupBy(bookmarks.id)
    .orderBy(desc(bookmarks.createdAt))
    .limit(50);

    const res = await rows;
    return res.map(row => ({ ...row.bookmark, tags: row.tags }));
  }

  async getBookmark(id: number): Promise<BookmarkResponse | undefined> {
    const rows = await db.select({
      bookmark: bookmarks,
      tags: sql<Tag[]>`coalesce(
        json_agg(
          json_build_object('id', ${tags.id}, 'userId', ${tags.userId}, 'name', ${tags.name})
        ) filter (where ${tags.id} is not null),
        '[]'
      )`
    })
    .from(bookmarks)
    .leftJoin(bookmarkTags, eq(bookmarks.id, bookmarkTags.bookmarkId))
    .leftJoin(tags, eq(bookmarkTags.tagId, tags.id))
    .where(eq(bookmarks.id, id))
    .groupBy(bookmarks.id);

    const res = await rows;
    if (res.length === 0) return undefined;
    return { ...res[0].bookmark, tags: res[0].tags };
  }

  async createBookmark(userId: string, request: CreateBookmarkRequest): Promise<BookmarkResponse> {
    const { tags: tagNames, ...bookmarkData } = request;
    const [bookmark] = await db.insert(bookmarks).values({ ...bookmarkData, userId }).returning();
    const currentTags: Tag[] = [];
    if (tagNames && tagNames.length > 0) {
      for (const name of tagNames) {
        let [tag] = await db.select().from(tags).where(and(eq(tags.userId, userId), eq(tags.name, name)));
        if (!tag) [tag] = await db.insert(tags).values({ userId, name }).returning();
        currentTags.push(tag);
        await db.insert(bookmarkTags).values({ bookmarkId: bookmark.id, tagId: tag.id });
      }
    }
    return { ...bookmark, tags: currentTags };
  }

  async updateBookmark(userId: string, id: number, updates: UpdateBookmarkRequest): Promise<BookmarkResponse> {
    const { tags: tagNames, ...bookmarkUpdates } = updates;
    if (Object.keys(bookmarkUpdates).length > 0) {
      await db.update(bookmarks).set({ ...bookmarkUpdates, updatedAt: new Date() }).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
    }
    if (tagNames !== undefined) {
      await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id));
      if (tagNames.length > 0) {
        for (const name of tagNames) {
          let [tag] = await db.select().from(tags).where(and(eq(tags.userId, userId), eq(tags.name, name)));
          if (!tag) [tag] = await db.insert(tags).values({ userId, name }).returning();
          await db.insert(bookmarkTags).values({ bookmarkId: id, tagId: tag.id });
        }
      }
    }
    const updated = await this.getBookmark(id);
    if (!updated) throw new Error("Bookmark not found");
    return updated;
  }

  async deleteBookmark(userId: string, id: number): Promise<void> {
    await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id));
    await db.delete(bookmarks).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
  }

  async getTags(userId: string): Promise<Tag[]> {
    return await db.select().from(tags).where(eq(tags.userId, userId));
  }

  async updateTag(userId: string, id: number, name: string): Promise<Tag> {
    const [updated] = await db.update(tags).set({ name }).where(and(eq(tags.id, id), eq(tags.userId, userId))).returning();
    if (!updated) throw new Error("Tag not found");
    return updated;
  }

  async deleteTag(userId: string, id: number): Promise<void> {
    await db.delete(bookmarkTags).where(eq(bookmarkTags.tagId, id));
    const [deleted] = await db.delete(tags).where(and(eq(tags.id, id), eq(tags.userId, userId))).returning();
    if (!deleted) throw new Error("Tag not found");
  }

  // Workspaces implementation
  async getWorkspaces(userId: string): Promise<Workspace[]> {
    return await db.select().from(workspaces).where(eq(workspaces.userId, userId)).orderBy(desc(workspaces.createdAt));
  }

  async createWorkspace(userId: string, workspace: InsertWorkspace): Promise<Workspace> {
    const [newWorkspace] = await db.insert(workspaces).values({ ...workspace, userId }).returning();
    return newWorkspace;
  }

  async deleteWorkspace(userId: string, id: number): Promise<void> {
    await db.delete(workspaces).where(and(eq(workspaces.id, id), eq(workspaces.userId, userId)));
  }

  // Companion Settings implementation
  async getCompanionSettings(userId: string): Promise<CompanionSettings> {
    const [settings] = await db.select().from(companionSettings).where(eq(companionSettings.userId, userId));
    if (!settings) {
      const [newSettings] = await db.insert(companionSettings).values({ userId }).returning();
      return newSettings;
    }
    return settings;
  }

  async updateCompanionSettings(userId: string, updates: Partial<InsertCompanionSettings>): Promise<CompanionSettings> {
    const [updated] = await db.update(companionSettings)
      .set(updates)
      .where(eq(companionSettings.userId, userId))
      .returning();
    
    if (!updated) {
       // @ts-ignore
       const [newSettings] = await db.insert(companionSettings).values({ ...updates, userId }).returning();
       return newSettings;
    }
    return updated;
  }

  // ── Todo Statuses ───────────────────────────────────────────────────────────
  async getTodoStatuses(userId: string): Promise<TodoStatus[]> {
    const statuses = await db.select().from(todoStatuses)
      .where(eq(todoStatuses.userId, userId))
      .orderBy(asc(todoStatuses.sortOrder), asc(todoStatuses.id));

    if (statuses.length === 0) {
      // Seed defaults on first fetch
      const defaults = [
        { userId, name: "To Do",      color: "#c08552", sortOrder: 0 },
        { userId, name: "In Progress", color: "#895737", sortOrder: 1 },
        { userId, name: "Done",        color: "#4ade80", sortOrder: 2 },
      ];
      const seeded = await db.insert(todoStatuses).values(defaults).returning();
      return seeded;
    }
    return statuses;
  }

  async createTodoStatus(userId: string, status: InsertTodoStatus): Promise<TodoStatus> {
    const [created] = await db.insert(todoStatuses).values({ ...status, userId }).returning();
    return created;
  }

  async updateTodoStatus(userId: string, id: number, updates: Partial<InsertTodoStatus>): Promise<TodoStatus> {
    const [updated] = await db.update(todoStatuses)
      .set(updates)
      .where(and(eq(todoStatuses.id, id), eq(todoStatuses.userId, userId)))
      .returning();
    if (!updated) throw new Error("Status not found");
    return updated;
  }

  async deleteTodoStatus(userId: string, id: number): Promise<void> {
    // Unlink todos referencing this status
    await db.update(todos).set({ statusId: null }).where(and(eq(todos.userId, userId), eq(todos.statusId, id)));
    await db.delete(todoStatuses).where(and(eq(todoStatuses.id, id), eq(todoStatuses.userId, userId)));
  }

  // ── Todos ───────────────────────────────────────────────────────────────────
  async getTodos(userId: string): Promise<Todo[]> {
    return db.select().from(todos)
      .where(eq(todos.userId, userId))
      .orderBy(desc(todos.createdAt));
  }

  async createTodo(userId: string, todo: InsertTodo): Promise<Todo> {
    const [created] = await db.insert(todos).values({ ...todo, userId }).returning();
    return created;
  }

  async updateTodo(userId: string, id: number, updates: Partial<InsertTodo>): Promise<Todo> {
    const [updated] = await db.update(todos)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(todos.id, id), eq(todos.userId, userId)))
      .returning();
    if (!updated) throw new Error("Todo not found");
    return updated;
  }

  async deleteTodo(userId: string, id: number): Promise<void> {
    await db.delete(todos).where(and(eq(todos.id, id), eq(todos.userId, userId)));
  }
}

export const storage = new DatabaseStorage();
