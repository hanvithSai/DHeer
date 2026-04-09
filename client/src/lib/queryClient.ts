/**
 * client/src/lib/queryClient.ts
 *
 * Configures the TanStack Query client and provides utility functions
 * for HTTP requests used by mutation functions throughout the app.
 *
 * Exports:
 *  - `throwIfResNotOk` — shared response error guard
 *  - `apiRequest`      — fetch wrapper for mutations (POST/PATCH/PUT/DELETE)
 *  - `getQueryFn`      — factory for query functions with configurable 401 behavior
 *  - `queryClient`     — the singleton QueryClient instance
 *
 * Impact if changed:
 *  - `apiRequest` is called in every mutation across companion-panel.tsx,
 *    todo-panel.tsx, sidebar tags, and use-auth.ts — any signature change
 *    breaks all of them simultaneously
 *  - `getQueryFn` is the default `queryFn` for ALL queries — changing its
 *    behavior affects every `useQuery` call in the app
 *  - `queryClient` options (staleTime, retry, refetchOnWindowFocus) control
 *    global caching behavior; tightening staleTime increases server load
 */

import { QueryClient, QueryFunction } from "@tanstack/react-query";

// ── Response guard ─────────────────────────────────────────────────────────────

/**
 * throwIfResNotOk
 *
 * Reads the response and throws a descriptive Error if the HTTP status
 * is not in the 2xx range.  Used by both `apiRequest` and `getQueryFn`.
 *
 * The error message format is `"STATUS: body text"` so callers can
 * extract the status code if needed.
 *
 * @param res — The raw fetch Response object
 * @throws     Error with `"STATUS: message"` string if `!res.ok`
 *
 * Impact if changed:
 *  - The error message format is relied on by useToast callers that display
 *    the error to the user — changing the format affects error display
 *  - `res.text()` consumes the response body; calling `.json()` afterwards
 *    would throw — this is safe because we only use `throwIfResNotOk`
 *    before reading the body in `getQueryFn`, and `apiRequest` returns the
 *    Response before any further body reading
 */
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// ── Mutation fetch wrapper ─────────────────────────────────────────────────────

/**
 * apiRequest
 *
 * Thin fetch wrapper used by all TanStack Query `mutationFn` callbacks.
 * Handles Content-Type header injection and JSON serialization for the body.
 * Always sends credentials (session cookie) for authentication.
 *
 * Returns the raw Response object — callers must call `.json()` if they need
 * the parsed body in `onSuccess`.  Most mutations just call
 * `queryClient.invalidateQueries(...)` on success without reading the body.
 *
 * @param method — HTTP verb: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
 * @param url    — Relative API path, e.g. "/api/todos/42"
 * @param data   — Optional request body (will be JSON-serialised)
 * @returns       Raw Response (check ok before reading body)
 * @throws        Error if response status is not 2xx (via throwIfResNotOk)
 *
 * Impact if changed:
 *  - Returning parsed JSON here (instead of Response) would break the
 *    companion-panel.tsx `updateSettings.onSuccess` which calls `.json()`
 *    on the result, and would double-parse in other callers
 *  - Removing `credentials: "include"` would break auth on all mutations
 *    because the session cookie would not be sent
 *  - Removing Content-Type header would cause Express's JSON parser to
 *    ignore the body, making `req.body` empty
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// ── Query function factory ─────────────────────────────────────────────────────

/**
 * UnauthorizedBehavior
 *
 * Controls what `getQueryFn` does when the server returns 401:
 *  - "returnNull" — treats 401 as "not logged in", returns null instead of throwing
 *  - "throw"      — treats 401 as a hard error, propagates it to the error boundary
 *
 * `returnNull` is used for the auth user query so the app can gracefully
 * detect "no session" without crashing.
 * `throw` is used everywhere else so stale/missing sessions surface as errors.
 *
 * Impact if changing the default:
 *  - The QueryClient default uses "throw" — switching to "returnNull" would
 *    hide auth errors silently across the entire app
 */
type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * getQueryFn
 *
 * Factory that returns a TanStack Query `queryFn` compatible function.
 * The returned function:
 *  1. Joins the `queryKey` array with "/" to build the URL
 *     (e.g. ['/api/todos'] → '/api/todos', ['/api/bookmarks', '42'] → '/api/bookmarks/42')
 *  2. Fetches with credentials
 *  3. Handles 401 per `on401` behavior
 *  4. Throws on any other non-2xx status
 *  5. Returns the parsed JSON body
 *
 * @param options.on401 — "returnNull" | "throw"
 * @returns               TanStack QueryFunction<T>
 *
 * Impact if changed:
 *  - This is the default `queryFn` for EVERY `useQuery` call that doesn't
 *    supply its own `queryFn`.  Any change here is app-wide.
 *  - The `queryKey.join("/")` URL derivation means queryKeys must always
 *    start with the API path (e.g. '/api/todos').  Using non-path keys would
 *    produce invalid URLs and silent fetch failures.
 */
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// ── Singleton QueryClient ──────────────────────────────────────────────────────

/**
 * queryClient
 *
 * The singleton TanStack Query client instance.
 * Configured with aggressive caching defaults to minimise redundant network requests:
 *
 *  - `staleTime: Infinity`       — data is never considered stale automatically;
 *                                   only manual `invalidateQueries` triggers re-fetches
 *  - `refetchInterval: false`    — no polling; the app is event-driven
 *  - `refetchOnWindowFocus: false` — no re-fetch when the browser tab regains focus
 *  - `retry: false`              — failed requests are not retried (prevents double
 *                                   error toasts and confused UX on auth failures)
 *
 * This instance is imported directly in mutation `onSuccess` callbacks to call
 * `queryClient.invalidateQueries(...)`.
 *
 * Impact if changed:
 *  - Setting `staleTime` to a finite value (e.g. 60000) enables background
 *    re-fetching but may cause flickers or overwrites of optimistic updates
 *  - Setting `retry: 2` would hide transient 500 errors from the UI but
 *    could mask real backend problems
 *  - Changing the default `queryFn` affects all queries app-wide
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
