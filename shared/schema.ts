/**
 * shared/schema.ts
 *
 * Single source of truth for the entire database schema.
 * Used by:
 *  - server/storage.ts  — Drizzle ORM queries
 *  - server/routes.ts   — Zod validation via insert schemas
 *  - client code        — TypeScript types for API responses
 *  - drizzle.config.ts  — Migration / push target
 *
 * ⚠️  Changing a table definition here requires running `npm run db:push`
 *     to sync the Postgres schema, which may involve destructive DDL if
 *     columns are removed or types change.
 */

import {
  pgTable, text, serial, timestamp, boolean,
  varchar, integer, jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Re-export auth tables (users, sessions) so Drizzle sees them during db:push.
// Changing this import path would break authentication entirely.
export * from "./models/auth";
import { users } from "./models/auth";

// ── Bookmarks ──────────────────────────────────────────────────────────────────
/**
 * Core bookmark table.
 * Each row represents one saved URL belonging to a user.
 *
 * Impact if changed:
 *  - Adding/removing columns → requires db:push
 *  - Removing `userId`       → breaks all storage queries that filter by user
 *  - Removing `isPublic`     → breaks the public feed page
 *  - Removing `savedFrom`    → breaks extension-specific filtering
 */
export const bookmarks = pgTable("bookmarks", {
  id:        serial("id").primaryKey(),
  userId:    varchar("user_id").notNull(),            // FK to auth.users.id (enforced at app layer)
  url:       text("url").notNull(),
  title:     text("title"),
  note:      text("note"),
  isPublic:  boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  savedFrom: varchar("saved_from", { length: 20 }).default("web"), // "web" | "extension"
});

// ── Tags ───────────────────────────────────────────────────────────────────────
/**
 * Tag definitions owned by a user.
 * Tags are created on-the-fly when a bookmark is saved with an unknown tag name.
 *
 * Impact if changed:
 *  - Removing `name`   → breaks tag display and search filtering
 *  - Removing `userId` → tags would become global, breaking isolation
 */
export const tags = pgTable("tags", {
  id:     serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name:   varchar("name", { length: 50 }).notNull(),
});

// ── Bookmark ↔ Tag join table ──────────────────────────────────────────────────
/**
 * Many-to-many junction between bookmarks and tags.
 * One bookmark can have many tags; one tag can belong to many bookmarks.
 *
 * Impact if changed:
 *  - Removing this table → bookmark tagging feature completely breaks
 *  - Changing FK columns → all bookmark tag queries break
 */
export const bookmarkTags = pgTable("bookmark_tags", {
  id:         serial("id").primaryKey(),
  bookmarkId: integer("bookmark_id").notNull(), // references bookmarks.id
  tagId:      integer("tag_id").notNull(),      // references tags.id
});

// ── Workspaces ─────────────────────────────────────────────────────────────────
/**
 * A named collection of URLs the user can launch all at once.
 * Used by both the web app companion panel and the browser extension.
 *
 * Impact if changed:
 *  - Removing `urls` JSON column → workspace launch feature breaks
 *  - Changing `urls` type        → companion-panel.tsx and sidepanel.js need updates
 */
export const workspaces = pgTable("workspaces", {
  id:        serial("id").primaryKey(),
  userId:    varchar("user_id").notNull(),
  name:      varchar("name", { length: 100 }).notNull(),
  urls:      jsonb("urls").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Companion Settings ─────────────────────────────────────────────────────────
/**
 * Per-user configuration for the DHeer mascot companion.
 * One row per user (enforced by the UNIQUE constraint on userId).
 *
 * Impact if changed:
 *  - Adding a column  → update `insertCompanionSettingsSchema.omit` and storage defaults
 *  - Removing a column → companion-panel.tsx UI controls that reference it will error
 *  - Changing defaults → affects first-time users before they configure settings
 */
export const companionSettings = pgTable("companion_settings", {
  id:                serial("id").primaryKey(),
  userId:            varchar("user_id").notNull().unique(),
  trackingEnabled:   boolean("tracking_enabled").default(true),
  idleThreshold:     integer("idle_threshold").default(300),       // seconds until "idle" nudge
  tabCountThreshold: integer("tab_count_threshold").default(10),   // tab count for overload nudge
  nudgesEnabled:     boolean("nudges_enabled").default(true),
  nudgeFrequency:    varchar("nudge_frequency", { length: 20 }).default("medium"), // low | medium | high
});

// ── Todo Statuses ──────────────────────────────────────────────────────────────
/**
 * Custom task statuses created per user (e.g. "To Do", "In Progress", "Done").
 * Three default rows are seeded automatically on first fetch (see storage.getTodoStatuses).
 *
 * Impact if changed:
 *  - Removing `color`     → todo-panel.tsx status color dots break
 *  - Removing `sortOrder` → statuses will fall back to insertion order
 *  - Removing this table  → entire todo feature collapses; todos.statusId FK will fail
 */
export const todoStatuses = pgTable("todo_statuses", {
  id:        serial("id").primaryKey(),
  userId:    varchar("user_id").notNull(),
  name:      varchar("name", { length: 50 }).notNull(),
  color:     varchar("color", { length: 7 }).notNull().default("#c08552"), // hex color
  sortOrder: integer("sort_order").default(0),
});

// ── Todos ──────────────────────────────────────────────────────────────────────
/**
 * Individual task items owned by a user.
 * Priority is a plain string enum: "low" | "medium" | "high".
 * statusId is a nullable FK → todoStatuses.id; set null if the status is deleted.
 *
 * Impact if changed:
 *  - Removing `priority`  → todo-panel.tsx sorting and badge rendering break
 *  - Removing `statusId`  → status dots, toggle-done logic, and extension done-toggle break
 *  - Changing FK behavior → storage.deleteTodoStatus update logic must also change
 */
export const todos = pgTable("todos", {
  id:        serial("id").primaryKey(),
  userId:    varchar("user_id").notNull(),
  title:     text("title").notNull(),
  note:      text("note"),
  priority:  varchar("priority", { length: 10 }).default("medium"), // "low" | "medium" | "high"
  statusId:  integer("status_id").references(() => todoStatuses.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Relations (ORM-level, not DB constraints) ──────────────────────────────────
/**
 * Relations define how Drizzle should JOIN tables in relational queries.
 * These are NOT DB foreign-key constraints — they are Drizzle ORM metadata.
 * Removing a relation breaks any `db.query.*` relational call that uses it,
 * but does NOT affect `db.select().from(...)` plain queries.
 */

export const bookmarksRelations = relations(bookmarks, ({ one, many }) => ({
  user:         one(users, { fields: [bookmarks.userId],    references: [users.id] }),
  bookmarkTags: many(bookmarkTags),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user:         one(users, { fields: [tags.userId], references: [users.id] }),
  bookmarkTags: many(bookmarkTags),
}));

export const bookmarkTagsRelations = relations(bookmarkTags, ({ one }) => ({
  bookmark: one(bookmarks, { fields: [bookmarkTags.bookmarkId], references: [bookmarks.id] }),
  tag:      one(tags,      { fields: [bookmarkTags.tagId],      references: [tags.id]      }),
}));

export const workspacesRelations = relations(workspaces, ({ one }) => ({
  user: one(users, { fields: [workspaces.userId], references: [users.id] }),
}));

export const companionSettingsRelations = relations(companionSettings, ({ one }) => ({
  user: one(users, { fields: [companionSettings.userId], references: [users.id] }),
}));

export const todoStatusesRelations = relations(todoStatuses, ({ one }) => ({
  user: one(users, { fields: [todoStatuses.userId], references: [users.id] }),
}));

export const todosRelations = relations(todos, ({ one }) => ({
  user:   one(users,        { fields: [todos.userId],   references: [users.id]        }),
  status: one(todoStatuses, { fields: [todos.statusId], references: [todoStatuses.id] }),
}));

// ── Insert schemas (Zod) ───────────────────────────────────────────────────────
/**
 * `createInsertSchema` generates a Zod schema from the Drizzle table definition.
 * `.omit()` removes server-generated fields (id, timestamps, userId) so clients
 * cannot supply them directly.
 *
 * Impact if changed:
 *  - Adding a new `.omit()` field → that field becomes read-only for clients
 *  - Removing an `.omit()` field  → clients could override server-generated values
 *  - These schemas are used in server/routes.ts for request body validation
 */
export const insertBookmarkSchema = createInsertSchema(bookmarks).omit({
  id: true, createdAt: true, updatedAt: true, userId: true,
});

export const insertTagSchema         = createInsertSchema(tags).omit({ id: true });
export const insertWorkspaceSchema   = createInsertSchema(workspaces).omit({ id: true, createdAt: true, userId: true });
export const insertCompanionSettingsSchema = createInsertSchema(companionSettings).omit({ id: true, userId: true });
export const insertTodoStatusSchema  = createInsertSchema(todoStatuses).omit({ id: true, userId: true });
export const insertTodoSchema        = createInsertSchema(todos).omit({ id: true, userId: true, createdAt: true, updatedAt: true });

// ── TypeScript types ───────────────────────────────────────────────────────────
/**
 * Inferred TypeScript types from the schema.
 * `$inferSelect` = full row type (SELECT *).
 * `z.infer<typeof insertSchema>` = validated insert payload type.
 *
 * Impact if changed:
 *  - Any rename here propagates to all imports in storage.ts, routes.ts, and client hooks
 */
export type Bookmark              = typeof bookmarks.$inferSelect;
export type InsertBookmark        = z.infer<typeof insertBookmarkSchema>;
export type Tag                   = typeof tags.$inferSelect;
export type InsertTag             = z.infer<typeof insertTagSchema>;
export type Workspace             = typeof workspaces.$inferSelect;
export type InsertWorkspace       = z.infer<typeof insertWorkspaceSchema>;
export type CompanionSettings     = typeof companionSettings.$inferSelect;
export type InsertCompanionSettings = z.infer<typeof insertCompanionSettingsSchema>;
export type TodoStatus            = typeof todoStatuses.$inferSelect;
export type InsertTodoStatus      = z.infer<typeof insertTodoStatusSchema>;
export type Todo                  = typeof todos.$inferSelect;
export type InsertTodo            = z.infer<typeof insertTodoSchema>;

// ── Composite API types ────────────────────────────────────────────────────────
/**
 * These types extend the raw DB types with joined/computed fields.
 * Used in storage.ts return types and API response shapes.
 *
 * Impact if changed:
 *  - Changing BookmarkResponse.tags type → breaks bookmark list rendering in home-page.tsx
 */
export type CreateBookmarkRequest = InsertBookmark & { tags?: string[] };
export type UpdateBookmarkRequest = Partial<CreateBookmarkRequest>;
export type BookmarkResponse      = Bookmark & { tags: Tag[]; authorName?: string | null; authorAvatar?: string | null };
