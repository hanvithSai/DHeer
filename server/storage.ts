import { db } from "./db";
import { 
  bookmarks, tags, bookmarkTags,
  type CreateBookmarkRequest,
  type UpdateBookmarkRequest,
  type BookmarkResponse,
  type Tag,
  type Bookmark
} from "@shared/schema";
import { eq, desc, and, ilike, sql, inArray } from "drizzle-orm";
import { users, type User } from "@shared/models/auth";

export interface IStorage {
  // Auth methods (re-exporting from auth/storage or implementing here)
  getUser(id: string): Promise<User | undefined>;
  
  // Bookmark methods
  getBookmarks(userId: string, options?: { search?: string, tag?: string }): Promise<BookmarkResponse[]>;
  getPublicBookmarks(): Promise<BookmarkResponse[]>;
  getBookmark(id: number): Promise<BookmarkResponse | undefined>;
  createBookmark(userId: string, bookmark: CreateBookmarkRequest): Promise<BookmarkResponse>;
  updateBookmark(userId: string, id: number, updates: UpdateBookmarkRequest): Promise<BookmarkResponse>;
  deleteBookmark(userId: string, id: number): Promise<void>;
  
  // Tag methods
  getTags(userId: string): Promise<Tag[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getBookmarks(userId: string, options?: { search?: string, tag?: string }): Promise<BookmarkResponse[]> {
    let query = db.select({
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
    .where(eq(bookmarks.userId, userId))
    .groupBy(bookmarks.id)
    .orderBy(desc(bookmarks.createdAt));

    if (options?.search) {
      query.where(and(
        eq(bookmarks.userId, userId),
        ilike(bookmarks.title, `%${options.search}%`)
      ));
    }

    if (options?.tag) {
      // filtering by tag requires a different approach or subquery, keeping simple for now
      // This is a basic implementation, can be improved for tag filtering
    }

    const rows = await query;
    return rows.map(row => ({ ...row.bookmark, tags: row.tags }));
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
    .limit(50); // Limit to recent 50 public bookmarks

    return rows.map(row => ({ ...row.bookmark, tags: row.tags }));
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

    if (rows.length === 0) return undefined;
    return { ...rows[0].bookmark, tags: rows[0].tags };
  }

  async createBookmark(userId: string, request: CreateBookmarkRequest): Promise<BookmarkResponse> {
    const { tags: tagNames, ...bookmarkData } = request;

    // Create bookmark
    const [bookmark] = await db.insert(bookmarks)
      .values({ ...bookmarkData, userId })
      .returning();

    // Handle tags
    const currentTags: Tag[] = [];
    if (tagNames && tagNames.length > 0) {
      for (const name of tagNames) {
        // Find or create tag
        let [tag] = await db.select().from(tags).where(and(eq(tags.userId, userId), eq(tags.name, name)));
        if (!tag) {
          [tag] = await db.insert(tags).values({ userId, name }).returning();
        }
        currentTags.push(tag);
        
        // Link tag to bookmark
        await db.insert(bookmarkTags).values({
          bookmarkId: bookmark.id,
          tagId: tag.id
        });
      }
    }

    return { ...bookmark, tags: currentTags };
  }

  async updateBookmark(userId: string, id: number, updates: UpdateBookmarkRequest): Promise<BookmarkResponse> {
    const { tags: tagNames, ...bookmarkUpdates } = updates;

    // Update bookmark fields
    if (Object.keys(bookmarkUpdates).length > 0) {
      await db.update(bookmarks)
        .set({ ...bookmarkUpdates, updatedAt: new Date() })
        .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
    }

    // Update tags if provided
    if (tagNames !== undefined) {
      // Remove existing associations
      await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id));

      // Add new associations
      if (tagNames.length > 0) {
        for (const name of tagNames) {
          let [tag] = await db.select().from(tags).where(and(eq(tags.userId, userId), eq(tags.name, name)));
          if (!tag) {
            [tag] = await db.insert(tags).values({ userId, name }).returning();
          }
          await db.insert(bookmarkTags).values({
            bookmarkId: id,
            tagId: tag.id
          });
        }
      }
    }

    const updated = await this.getBookmark(id);
    if (!updated) throw new Error("Bookmark not found after update");
    return updated;
  }

  async deleteBookmark(userId: string, id: number): Promise<void> {
    // Verify ownership
    const bookmark = await this.getBookmark(id);
    if (!bookmark || bookmark.userId !== userId) {
      throw new Error("Bookmark not found or unauthorized");
    }

    // Delete associations first (though cascade might handle this if configured, doing it manually to be safe)
    await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id));
    await db.delete(bookmarks).where(eq(bookmarks.id, id));
  }

  async getTags(userId: string): Promise<Tag[]> {
    return await db.select().from(tags).where(eq(tags.userId, userId));
  }
}

export const storage = new DatabaseStorage();
