/**
 * client/src/pages/public-bookmarks.tsx
 *
 * Unauthenticated-accessible public feed showing community bookmarks.
 *
 * Layout:
 *  - Authenticated users see the full Sidebar on desktop, plus a hamburger
 *    on mobile that opens the Sidebar in a Sheet.
 *  - Unauthenticated visitors see a back-arrow and a "Sign In to Save" CTA.
 *
 * Features:
 *  - Bookmark count subtitle below "Discover" heading
 *  - BookmarkCard shows author attribution chip (authorName, authorAvatar)
 *    populated by the server via getPublicBookmarks() → users JOIN
 *  - Styled empty state with icon + CTA
 */

import React from 'react';
import { usePublicBookmarks } from '@/hooks/use-bookmarks';
import { BookmarkCard } from '@/components/bookmark-card';
import { Sidebar } from '@/components/sidebar';
import { ShinyButton } from '@/components/ui/shiny-button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Loader2, ArrowLeft, Menu, Globe, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'wouter';

export default function PublicBookmarksPage() {
  const { data: bookmarks, isLoading } = usePublicBookmarks();
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">

      {/* Desktop sidebar — authenticated users only, hidden below md */}
      {isAuthenticated && (
        <Sidebar className="w-64 hidden md:flex flex-shrink-0 z-20" />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="h-16 border-b border-white/5 bg-background/80 backdrop-blur-md flex items-center gap-3 px-4 md:px-6 sticky top-0 z-10">

          {/* Mobile hamburger (authenticated only, below md) */}
          {isAuthenticated && (
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden flex-shrink-0"
                  data-testid="btn-mobile-menu"
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-background border-r border-white/5">
                <Sidebar className="flex w-full h-full" />
              </SheetContent>
            </Sheet>
          )}

          {/* Back arrow for unauthenticated visitors */}
          {!isAuthenticated && (
            <Link href="/">
              <Button variant="ghost" size="icon" className="flex-shrink-0" data-testid="btn-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
          )}

          <h1 className="text-xl font-display font-bold flex-1">Public Feed</h1>

          {/* Sign-in CTA for guests */}
          {!isAuthenticated && (
            <ShinyButton
              className="h-9 text-sm px-4"
              onClick={() => (window.location.href = '/api/login')}
              data-testid="btn-sign-in"
            >
              Sign In to Save
            </ShinyButton>
          )}
        </header>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="max-w-7xl mx-auto">

            {/* Page heading + count */}
            <div className="mb-8">
              <h2 className="text-3xl font-display font-bold text-white mb-1">Discover</h2>
              <p className="text-muted-foreground" data-testid="text-bookmark-count">
                {isLoading
                  ? 'Loading community bookmarks…'
                  : `${bookmarks?.length ?? 0} bookmark${bookmarks?.length !== 1 ? 's' : ''} shared by the community`}
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : bookmarks && bookmarks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {bookmarks.map((bookmark, idx) => (
                  <BookmarkCard key={bookmark.id} bookmark={bookmark} index={idx} />
                ))}
              </div>
            ) : (
              /* ── Styled empty state ─────────────────────────────────────── */
              <div
                className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/10 rounded-3xl bg-white/[0.02]"
                data-testid="empty-state-public"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Globe className="w-8 h-8 text-primary/50" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No public bookmarks yet</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  Be the first to share something interesting with the community.
                </p>
                {isAuthenticated ? (
                  <Link href="/">
                    <ShinyButton data-testid="btn-share-cta">
                      <Bookmark className="w-4 h-4 mr-2" />
                      Share your bookmarks
                    </ShinyButton>
                  </Link>
                ) : (
                  <ShinyButton
                    onClick={() => (window.location.href = '/api/login')}
                    data-testid="btn-signin-cta"
                  >
                    Sign in to share
                  </ShinyButton>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
