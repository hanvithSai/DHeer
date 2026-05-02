/**
 * client/src/pages/home-page.tsx
 *
 * The authenticated user's main bookmark library page.
 *
 * Layout:
 *  - Desktop: persistent Sidebar on the left (w-64, hidden on mobile)
 *  - Mobile: hamburger button in the header opens the Sidebar in a Sheet drawer
 *
 * Features:
 *  - Live search with 300 ms debounce (delegates to server via ?search=)
 *  - Tag filter via ?tag= query param (populated by sidebar tag links)
 *  - Bookmark grid with animated cards
 *  - "Add Bookmark" dialog in the header
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { BookmarkCard } from '@/components/bookmark-card';
import { Sidebar } from '@/components/sidebar';
import { AddBookmarkDialog } from '@/components/add-bookmark-dialog';
import { ShinyButton } from '@/components/ui/shiny-button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Plus, Search, FilterX, Loader2, Menu, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ImportBookmarksDialog } from '@/components/import-bookmarks-dialog';

export default function HomePage() {
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [location] = useLocation();

  // 300 ms debounce keeps the API call count low while typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = new URLSearchParams(window.location.search);
  const tag    = params.get('tag') || undefined;

  const { data: bookmarks, isLoading, isError } = useBookmarks({
    search: debouncedSearch || undefined,
    tag,
  });

  const clearFilters = () => {
    setSearch('');
    window.location.href = '/';
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">

      {/* Desktop sidebar — hidden below md */}
      <Sidebar className="w-64 hidden md:flex flex-shrink-0 z-20" />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="h-16 border-b border-white/5 bg-background/80 backdrop-blur-md flex items-center gap-3 px-4 md:px-6 sticky top-0 z-10">

          {/* Mobile hamburger — opens Sidebar in a Sheet, visible only below md */}
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

          {/* Search bar */}
          <div className="flex items-center flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search bookmarks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-secondary/50 border-transparent focus:bg-secondary focus:border-primary/30 transition-all rounded-xl"
                data-testid="input-search"
              />
            </div>
          </div>

          {/* Import + Add bookmark CTAs */}
          <div className="ml-auto flex-shrink-0 flex items-center gap-2">
            <ImportBookmarksDialog trigger={
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-sm px-3 sm:px-4 border-white/10 hover:text-white flex"
                data-testid="btn-import-bookmarks"
              >
                <Upload className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Import</span>
              </Button>
            } />
            <AddBookmarkDialog trigger={
              <ShinyButton className="h-9 text-sm px-4">
                <Plus className="w-4 h-4 mr-1.5" />
                Add Bookmark
              </ShinyButton>
            } />
          </div>
        </header>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="max-w-7xl mx-auto">

            {/* Page title + filter status */}
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-3xl font-display font-bold text-white mb-2">
                  {tag ? `#${tag}` : search ? `"${search}"` : 'All Bookmarks'}
                </h2>
                <p className="text-muted-foreground" data-testid="text-bookmark-count">
                  {isLoading
                    ? 'Syncing your library...'
                    : `${bookmarks?.length ?? 0} bookmark${bookmarks?.length !== 1 ? 's' : ''} found`}
                </p>
              </div>

              {(tag || search) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="text-muted-foreground hover:text-white border-white/10"
                  data-testid="btn-clear-filters"
                >
                  <FilterX className="w-4 h-4 mr-2" />
                  Clear Filters
                </Button>
              )}
            </div>

            {/* Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : isError ? (
              <div className="text-center py-20 bg-destructive/5 rounded-2xl border border-destructive/10">
                <p className="text-destructive font-semibold">Failed to load bookmarks</p>
                <p className="text-sm text-muted-foreground mt-1">Please try refreshing the page</p>
              </div>
            ) : bookmarks && bookmarks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <AnimatePresence>
                  {bookmarks.map((bookmark, idx) => (
                    <BookmarkCard key={bookmark.id} bookmark={bookmark} index={idx} />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/10 rounded-3xl bg-white/5">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-primary/50" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No bookmarks found</h3>
                <p className="text-muted-foreground max-w-sm mb-6">
                  {tag || search
                    ? "Try adjusting your filters or search query."
                    : "Your library is empty. Add your first bookmark to get started."}
                </p>
                {!tag && !search && (
                  <AddBookmarkDialog trigger={
                    <ShinyButton>
                      <Plus className="w-4 h-4 mr-2" />
                      Add your first bookmark
                    </ShinyButton>
                  } />
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
