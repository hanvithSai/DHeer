/**
 * shared/routes.ts
 *
 * Typed API contract used by both the server (server/routes.ts) and
 * any typed client callers.
 *
 * The `api` object maps each endpoint to:
 *  - `method`    — HTTP verb (GET, POST, PUT, PATCH, DELETE)
 *  - `path`      — Express-compatible path string (e.g. "/api/bookmarks/:id")
 *  - `input`     — Optional Zod schema for the request body
 *  - `responses` — Map of status code → Zod schema for the response body
 *
 * Currently, only bookmarks and tags are registered here.
 * Workspaces, companion settings, and todos use inline paths in routes.ts
 * (a legacy pattern; they can be migrated here progressively).
 *
 * Impact if changed:
 *  - Changing a `.path` string must be updated in routes.ts (server) and any
 *    frontend code that builds URLs from these paths
 *  - Changing `.input` schema adds or removes validation at the route layer
 *  - Adding new endpoints here does NOT auto-register them — routes.ts must
 *    explicitly call `app.METHOD(api.x.y.path, ...)` to activate them
 *
 * `buildUrl` is a utility to substitute path params at call time:
 *   buildUrl('/api/bookmarks/:id', { id: 42 }) → '/api/bookmarks/42'
 */

import { z } from "zod";
import { insertBookmarkSchema, bookmarks, tags, insertTagSchema } from "./schema";

// ── Shared error response schemas ──────────────────────────────────────────────

/**
 * errorSchemas
 *
 * Standardised Zod schemas for error response bodies.
 * Every API endpoint's `responses` map references these to make the
 * error contract explicit and type-checkable.
 *
 * Impact if changed:
 *  - Adding a `code` field to `validation` enables machine-readable error codes
 *    but requires frontend error-handling updates
 */
export const errorSchemas = {
  /** 400 — Request body failed Zod validation */
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  /** 404 — Requested resource does not exist (or user doesn't own it) */
  notFound: z.object({ message: z.string() }),
  /** 500 — Unexpected server-side error */
  internal: z.object({ message: z.string() }),
  /** 401 — No valid session / not logged in */
  unauthorized: z.object({ message: z.string() }),
};

// ── API contract object ────────────────────────────────────────────────────────

/**
 * api
 *
 * The central registry of typed API endpoints.
 * Used by routes.ts to reference paths and input schemas in route registration.
 *
 * Structure: api.<resource>.<operation> = { method, path, input?, responses }
 *
 * Impact if changed:
 *  - Every property accessed in routes.ts (e.g. `api.bookmarks.list.path`) must
 *    remain present or TypeScript will error at compile time
 *  - Adding a new resource here is safe — it won't affect existing routes
 */
export const api = {
  bookmarks: {
    /**
     * GET /api/bookmarks
     * List all bookmarks for the authenticated user.
     * Accepts optional query params: ?search=... and ?tag=...
     * (query params are NOT part of the Zod input schema here — validated manually)
     */
    list: {
      method: "GET" as const,
      path: "/api/bookmarks",
      input: z.object({
        search: z.string().optional(),
        tag: z.string().optional(),
        folder: z.string().optional(), // reserved for future folder feature
      }).optional(),
      responses: {
        200: z.array(
          z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>(),
        ),
        401: errorSchemas.unauthorized,
      },
    },

    /**
     * GET /api/bookmarks/:id
     * Fetch a single bookmark by numeric ID.
     * Route enforces ownership (403 if the user doesn't own it).
     */
    get: {
      method: "GET" as const,
      path: "/api/bookmarks/:id",
      responses: {
        200: z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },

    /**
     * POST /api/bookmarks
     * Create a new bookmark.
     * `tags` is an optional string array — tag names are resolved in storage
     * (existing tags are reused; new ones are created automatically).
     */
    create: {
      method: "POST" as const,
      path: "/api/bookmarks",
      input: insertBookmarkSchema.extend({ tags: z.array(z.string()).optional() }),
      responses: {
        201: z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },

    /**
     * PUT /api/bookmarks/:id
     * Full or partial bookmark update.
     * Providing a `tags` array replaces ALL existing tags on the bookmark.
     * Omitting `tags` leaves the existing tag set unchanged.
     */
    update: {
      method: "PUT" as const,
      path: "/api/bookmarks/:id",
      input: insertBookmarkSchema.partial().extend({ tags: z.array(z.string()).optional() }),
      responses: {
        200: z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },

    /**
     * DELETE /api/bookmarks/:id
     * Delete a bookmark and all its bookmark_tags junction rows.
     * Storage enforces ownership — deleting another user's bookmark silently no-ops.
     */
    delete: {
      method: "DELETE" as const,
      path: "/api/bookmarks/:id",
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
  },

  tags: {
    /**
     * GET /api/tags
     * List all tags owned by the authenticated user.
     * Used by the sidebar tag list and bookmark editor autocomplete.
     */
    list: {
      method: "GET" as const,
      path: "/api/tags",
      responses: {
        200: z.array(z.custom<typeof tags.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },

    /**
     * PATCH /api/tags/:id
     * Rename a tag.
     * All bookmarks using this tag automatically reflect the new name
     * because they reference the tag by ID, not name.
     */
    update: {
      method: "PATCH" as const,
      path: "/api/tags/:id",
      input: z.object({ name: z.string().min(1) }),
      responses: {
        200: z.custom<typeof tags.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },

    /**
     * DELETE /api/tags/:id
     * Delete a tag and remove it from all bookmarks.
     * The bookmarks themselves are NOT deleted.
     */
    delete: {
      method: "DELETE" as const,
      path: "/api/tags/:id",
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
  },

  public: {
    /**
     * GET /api/public/bookmarks
     * Unauthenticated endpoint.  Returns up to 50 bookmarks marked `is_public = true`
     * from all users.  Used by the public feed page (/public).
     */
    list: {
      method: "GET" as const,
      path: "/api/public/bookmarks",
      responses: {
        200: z.array(
          z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>(),
        ),
      },
    },
  },
};

// ── URL builder utility ────────────────────────────────────────────────────────

/**
 * buildUrl
 *
 * Substitutes Express-style path parameters (`:param`) with concrete values.
 * Used wherever the frontend needs to construct a parameterised URL from an
 * `api` object path without string interpolation.
 *
 * @param path   — A path string with optional `:param` segments
 * @param params — Key-value pairs where keys match the `:param` names
 * @returns       Fully resolved URL string with params substituted
 *
 * Example:
 *   buildUrl('/api/bookmarks/:id', { id: 42 }) → '/api/bookmarks/42'
 *
 * Impact if changed:
 *  - This function is pure and stateless — changes only affect call sites
 *  - Non-matching param keys are silently ignored (no error thrown)
 */
export function buildUrl(
  path: string,
  params?: Record<string, string | number>,
): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
