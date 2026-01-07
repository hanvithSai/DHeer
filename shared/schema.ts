import { pgTable, text, serial, timestamp, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
// Export everything from auth to ensure tables are created
export * from "./models/auth";
import { users } from "./models/auth";

export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // References auth.users.id
  url: text("url").notNull(),
  title: text("title"),
  note: text("note"),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  savedFrom: varchar("saved_from", { length: 20 }).default("web"), // 'web' or 'extension'
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
});

export const bookmarkTags = pgTable("bookmark_tags", {
  id: serial("id").primaryKey(),
  bookmarkId: serial("bookmark_id").notNull(),
  tagId: serial("tag_id").notNull(),
});

export const bookmarksRelations = relations(bookmarks, ({ one, many }) => ({
  user: one(users, {
    fields: [bookmarks.userId],
    references: [users.id],
  }),
  bookmarkTags: many(bookmarkTags),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  bookmarkTags: many(bookmarkTags),
}));

export const bookmarkTagsRelations = relations(bookmarkTags, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkTags.bookmarkId],
    references: [bookmarks.id],
  }),
  tag: one(tags, {
    fields: [bookmarkTags.tagId],
    references: [tags.id],
  }),
}));

export const insertBookmarkSchema = createInsertSchema(bookmarks).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  userId: true 
});

export const insertTagSchema = createInsertSchema(tags).omit({ id: true });

export type Bookmark = typeof bookmarks.$inferSelect;
export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

// API Types
export type CreateBookmarkRequest = InsertBookmark & { tags?: string[] }; // Tags as strings for easy creation
export type UpdateBookmarkRequest = Partial<CreateBookmarkRequest>;
export type BookmarkResponse = Bookmark & { tags: Tag[] };
