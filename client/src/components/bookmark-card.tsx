/**
 * client/src/components/bookmark-card.tsx
 *
 * Renders a single bookmark as a card.
 *
 * Behaviour:
 *  - Own cards (no authorName): shows edit + delete action buttons on hover.
 *  - Public-feed cards (authorName present): hides edit/delete and shows
 *    an author attribution chip at the bottom instead.
 *
 * data-testid conventions used here:
 *  card-bookmark-{id}    — card root
 *  link-title-{id}       — clickable title
 *  link-url-{id}         — domain link
 *  btn-edit-{id}         — edit action button (own cards only)
 *  btn-delete-{id}       — delete action button (own cards only)
 *  badge-tag-{tagId}     — each tag badge
 *  text-note-{id}        — note text (when present)
 *  author-{id}           — author attribution row (public cards only)
 *  text-author-name-{id} — author display name (public cards only)
 */

import React, { useState } from 'react';
import { format } from 'date-fns';
import { ExternalLink, Edit2, Trash2, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BookmarkResponse } from '@shared/schema';
import { useDeleteBookmark } from '@/hooks/use-bookmarks';
import { AddBookmarkDialog } from './add-bookmark-dialog';

interface BookmarkCardProps {
  bookmark: BookmarkResponse;
  index: number;
}

export function BookmarkCard({ bookmark, index }: BookmarkCardProps) {
  const { mutate: deleteBookmark, isPending: isDeleting } = useDeleteBookmark();
  const [isHovered, setIsHovered] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  /** True when the card came from the public feed (belongs to another user). */
  const isReadOnly = !!bookmark.authorName;

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "group relative flex flex-col justify-between h-full p-5 rounded-2xl border transition-all duration-300",
          "bg-card/50 hover:bg-card border-white/5 hover:border-primary/30",
          "hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1",
        )}
        data-testid={`card-bookmark-${bookmark.id}`}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex-1 pr-2">
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group-hover:text-primary transition-colors duration-200"
                data-testid={`link-title-${bookmark.id}`}
              >
                <h3 className="text-lg font-display font-semibold line-clamp-2 leading-tight">
                  {bookmark.title || bookmark.url}
                </h3>
              </a>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`link-url-${bookmark.id}`}
                >
                  <ExternalLink className="w-3 h-3" />
                  {getDomain(bookmark.url)}
                </a>
                <span>•</span>
                <span className="font-mono">
                  {format(new Date(bookmark.createdAt || new Date()), 'MMM d, yyyy')}
                </span>
                {bookmark.isPublic && !isReadOnly && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Globe className="w-3 h-3 text-accent ml-1" />
                      </TooltipTrigger>
                      <TooltipContent>Public Bookmark</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            {/* Edit / Delete — hidden for public-feed read-only cards */}
            {!isReadOnly && (
              <div className={cn(
                "flex gap-1 transition-opacity duration-200 shrink-0",
                isHovered ? "opacity-100" : "opacity-0",
              )}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => setIsEditDialogOpen(true)}
                  data-testid={`btn-edit-${bookmark.id}`}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deleteBookmark(bookmark.id)}
                  disabled={isDeleting}
                  data-testid={`btn-delete-${bookmark.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {bookmark.note && (
            <p
              className="text-sm text-muted-foreground line-clamp-3"
              data-testid={`text-note-${bookmark.id}`}
            >
              {bookmark.note}
            </p>
          )}
        </div>

        {/* ── Tags + author attribution ─────────────────────────────────── */}
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            {bookmark.tags && bookmark.tags.length > 0 ? (
              bookmark.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="px-2 py-0.5 text-xs font-normal bg-secondary/50 text-secondary-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                  data-testid={`badge-tag-${tag.id}`}
                >
                  #{tag.name}
                </Badge>
              ))
            ) : (
              <div className="h-6" />
            )}
          </div>

          {/* Author chip — only shown for public-feed cards */}
          {bookmark.authorName && (
            <div
              className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]"
              data-testid={`author-${bookmark.id}`}
            >
              {bookmark.authorAvatar ? (
                <img
                  src={bookmark.authorAvatar}
                  alt={bookmark.authorName}
                  className="w-5 h-5 rounded-full object-cover ring-1 ring-white/10 flex-shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary flex-shrink-0">
                  {bookmark.authorName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-muted-foreground truncate">
                by{" "}
                <span
                  className="text-foreground/70 font-medium"
                  data-testid={`text-author-name-${bookmark.id}`}
                >
                  {bookmark.authorName}
                </span>
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {!isReadOnly && (
        <AddBookmarkDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          mode="edit"
          initialData={bookmark}
        />
      )}
    </>
  );
}
