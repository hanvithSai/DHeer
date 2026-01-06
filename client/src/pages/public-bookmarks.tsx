import React from 'react';
import { usePublicBookmarks } from '@/hooks/use-bookmarks';
import { BookmarkCard } from '@/components/bookmark-card';
import { Sidebar } from '@/components/sidebar';
import { ShinyButton } from '@/components/ui/shiny-button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'wouter';

export default function PublicBookmarksPage() {
  const { data: bookmarks, isLoading } = usePublicBookmarks();
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground">
      {/* Only show sidebar if authenticated */}
      {isAuthenticated && <Sidebar className="w-64 hidden md:flex flex-shrink-0 z-20" />}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b border-white/5 bg-background/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            {!isAuthenticated && (
              <Link href="/">
                <Button variant="ghost" size="icon" className="mr-2">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
            )}
            <h1 className="text-xl font-display font-bold">Public Feed</h1>
          </div>
          
          {!isAuthenticated && (
             <ShinyButton className="h-9 text-sm px-4" onClick={() => window.location.href = '/api/login'}>
               Sign In to Save
             </ShinyButton>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h2 className="text-3xl font-display font-bold text-white mb-2">
                Discover
              </h2>
              <p className="text-muted-foreground">
                See what the community is saving.
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
              <div className="text-center py-20 text-muted-foreground">
                No public bookmarks yet. Be the first to share!
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
