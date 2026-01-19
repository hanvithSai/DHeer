import { pgTable, text, serial, timestamp, boolean, varchar, integer, jsonb } from "drizzle-orm/pg-core";
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
  bookmarkId: integer("bookmark_id").notNull(),
  tagId: integer("tag_id").notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  urls: jsonb("urls").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companionSettings = pgTable("companion_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  trackingEnabled: boolean("tracking_enabled").default(true),
  idleThreshold: integer("idle_threshold").default(300), // in seconds
  tabCountThreshold: integer("tab_count_threshold").default(10),
  nudgesEnabled: boolean("nudges_enabled").default(true),
  nudgeFrequency: varchar("nudge_frequency", { length: 20 }).default("medium"), // low, medium, high
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
    references: [tags.id],
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

export const workspacesRelations = relations(workspaces, ({ one }) => ({
  user: one(users, {
    fields: [workspaces.userId],
    references: [users.id],
  }),
}));

export const companionSettingsRelations = relations(companionSettings, ({ one }) => ({
  user: one(users, {
    fields: [companionSettings.userId],
    references: [users.id],
  }),
}));

export const insertBookmarkSchema = createInsertSchema(bookmarks).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  userId: true 
});

export const insertTagSchema = createInsertSchema(tags).omit({ id: true });
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ 
  id: true, 
  createdAt: true, 
  userId: true 
});
export const insertCompanionSettingsSchema = createInsertSchema(companionSettings).omit({ 
  id: true, 
  userId: true 
});

export type Bookmark = typeof bookmarks.$inferSelect;
export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type CompanionSettings = typeof companionSettings.$inferSelect;
export type InsertCompanionSettings = z.infer<typeof insertCompanionSettingsSchema>;

// API Types
export type CreateBookmarkRequest = InsertBookmark & { tags?: string[] };
export type UpdateBookmarkRequest = Partial<CreateBookmarkRequest>;
export type BookmarkResponse = Bookmark & { tags: Tag[] };
