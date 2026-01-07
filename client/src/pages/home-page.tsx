import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { BookmarkCard } from '@/components/bookmark-card';
import { Sidebar } from '@/components/sidebar';
import { AddBookmarkDialog } from '@/components/add-bookmark-dialog';
import { ShinyButton } from '@/components/ui/shiny-button';
import { Input } from '@/components/ui/input';
import { Plus, Search, FilterX, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [location] = useLocation();
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Parse query params
  const params = new URLSearchParams(window.location.search);
  const tag = params.get('tag') || undefined;
  
  const { data: bookmarks, isLoading, isError } = useBookmarks({ 
    search: debouncedSearch || undefined, 
    tag 
  });

  const clearFilters = () => {
    setSearch('');
    window.history.pushState({}, '', '/');
    // Force re-render/nav by dispatching event or relying on wouter if we used Link
    window.location.href = '/'; 
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">
      {/* Sidebar - hidden on mobile default, visible on larger screens */}
      <Sidebar className="w-64 hidden md:flex flex-shrink-0 z-20" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header */}
        <header className="h-16 border-b border-white/5 bg-background/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center flex-1 max-w-xl gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search bookmarks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-secondary/50 border-transparent focus:bg-secondary focus:border-primary/30 transition-all rounded-xl"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4 ml-4">
            <AddBookmarkDialog trigger={
              <ShinyButton className="h-9 text-sm px-4">
                <Plus className="w-4 h-4 mr-1.5" />
                Add Bookmark
              </ShinyButton>
            } />
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="max-w-7xl mx-auto">
            
            {/* Page Title / Filter Status */}
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-3xl font-display font-bold text-white mb-2">
                  {tag ? `#${tag}` : search ? `Search: ${search}` : 'All Bookmarks'}
                </h2>
                <p className="text-muted-foreground">
                  {isLoading 
                    ? 'Syncing your library...' 
                    : `${bookmarks?.length || 0} items found`}
                </p>
              </div>
              
              {(tag || search) && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={clearFilters}
                  className="text-muted-foreground hover:text-white border-white/10"
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
