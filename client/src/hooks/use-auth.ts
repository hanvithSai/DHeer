/**
 * client/src/hooks/use-auth.ts
 *
 * React hook that provides authentication state and logout action
 * to any component in the application.
 *
 * Uses TanStack Query to cache the current user for 5 minutes so that
 * navigating between pages doesn't re-fetch the auth endpoint on every mount.
 *
 * Exports:
 *  - `useAuth()` — returns { user, isLoading, isAuthenticated, logout, isLoggingOut }
 *
 * Impact if changed:
 *  - Every component that gates content behind authentication uses this hook
 *    (App.tsx router, sidebar.tsx user footer, bookmark forms, etc.)
 *  - Changing the queryKey ["/api/auth/user"] would de-sync the cache from
 *    any other place that calls `queryClient.setQueryData(["/api/auth/user"], ...)`
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

// ── Helper functions ───────────────────────────────────────────────────────────

/**
 * fetchUser
 *
 * Fetches the currently authenticated user from the server.
 * Returns `null` (not an error) when the session is absent (401) so that
 * the app can render the unauthenticated landing page gracefully.
 * Any other non-2xx status is thrown as an error and surfaced by TanStack Query.
 *
 * This function is used as the `queryFn` for the auth query instead of
 * the default `getQueryFn` because:
 *  1. It needs `returnNull` on 401 (not the global default `throw`)
 *  2. It can't use the global queryKey-as-URL derivation (same result, but explicit)
 *
 * @returns  User object if logged in, null if not authenticated
 * @throws   Error for any server-side failure (5xx, network error, etc.)
 *
 * Impact if changed:
 *  - Throwing on 401 instead of returning null would crash the router
 *    for unauthenticated visitors (they'd see an error page instead of landing)
 *  - Changing the endpoint path requires matching change in server/replit_integrations/auth.ts
 */
async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null; // No session — not an error, just unauthenticated
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * logout
 *
 * Navigates the browser to the server-side logout endpoint.
 * The server destroys the session and redirects back to the landing page.
 *
 * This is a hard navigation (`window.location.href`) rather than an API call
 * because the server needs to set/clear cookies and redirect — which only
 * works correctly as a full page navigation, not an AJAX request.
 *
 * Impact if changed:
 *  - Switching to `fetch('/api/logout', { method: 'POST' })` would require
 *    the server endpoint to also handle CORS and the frontend to manually
 *    clear state and navigate — significantly more complex
 *  - The redirect destination is controlled by the server logout handler
 */
async function logout(): Promise<void> {
  window.location.href = "/api/logout";
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useAuth
 *
 * Central authentication hook for the DHeer web app.
 * Should be called at the component level (React rules of hooks apply).
 *
 * Internal state:
 *  - Uses `useQuery` with `queryKey: ["/api/auth/user"]` to cache the user
 *    for 5 minutes (`staleTime: 1000 * 60 * 5`).
 *  - Uses `useMutation` for the logout action so `isPending` is trackable.
 *  - On logout success: sets the cached user to `null` to immediately reflect
 *    the logged-out state in all components without waiting for a re-fetch.
 *
 * Returns:
 *  - `user`            — User | null | undefined (undefined = loading)
 *  - `isLoading`       — true while the initial auth check is in flight
 *  - `isAuthenticated` — boolean shorthand for `!!user`
 *  - `logout`          — Call to start the logout flow; triggers navigation
 *  - `isLoggingOut`    — true while the logout mutation is pending
 *
 * Impact if changed:
 *  - The `staleTime: 5 minutes` means user data can be up to 5 minutes
 *    stale.  Reducing it increases server load; increasing it risks showing
 *    outdated user info (e.g. after a profile update)
 *  - `queryClient.setQueryData(["/api/auth/user"], null)` in onSuccess
 *    immediately clears the cached user so the UI reflects logout instantly
 *    without a re-fetch — removing it would cause a brief flash of authenticated UI
 *  - Components that use this hook:
 *      App.tsx (route guarding), sidebar.tsx (user footer), home-page.tsx
 */
export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes before allowing re-fetch
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Immediately clear cached user so all components re-render as logged-out
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
