import { z } from 'zod';
import { insertBookmarkSchema, bookmarks, tags, insertTagSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  })
};

export const api = {
  bookmarks: {
    list: {
      method: 'GET' as const,
      path: '/api/bookmarks',
      input: z.object({
        search: z.string().optional(),
        tag: z.string().optional(),
        folder: z.string().optional() // kept for future use if we add folders
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>()),
        401: errorSchemas.unauthorized
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/bookmarks/:id',
      responses: {
        200: z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/bookmarks',
      input: insertBookmarkSchema.extend({ tags: z.array(z.string()).optional() }),
      responses: {
        201: z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/bookmarks/:id',
      input: insertBookmarkSchema.partial().extend({ tags: z.array(z.string()).optional() }),
      responses: {
        200: z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/bookmarks/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized
      },
    },
  },
  tags: {
    list: {
      method: 'GET' as const,
      path: '/api/tags',
      responses: {
        200: z.array(z.custom<typeof tags.$inferSelect>()),
        401: errorSchemas.unauthorized
      }
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/tags/:id',
      input: z.object({ name: z.string().min(1) }),
      responses: {
        200: z.custom<typeof tags.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/tags/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized
      },
    }
  },
  public: {
    list: {
      method: 'GET' as const,
      path: '/api/public/bookmarks',
      responses: {
         200: z.array(z.custom<typeof bookmarks.$inferSelect & { tags: typeof tags.$inferSelect[] }>()),
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
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
