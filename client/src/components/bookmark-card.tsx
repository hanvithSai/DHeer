import React, { useState } from 'react';
import { format } from 'date-fns';
import { ExternalLink, Tag, Edit2, Trash2, Globe, Lock } from 'lucide-react';
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
          "hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1"
        )}
      >
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex-1 pr-2">
              <a 
                href={bookmark.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block group-hover:text-primary transition-colors duration-200"
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
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  {getDomain(bookmark.url)}
                </a>
                <span>•</span>
                <span className="font-mono">{format(new Date(bookmark.createdAt || new Date()), 'MMM d, yyyy')}</span>
                {bookmark.isPublic && (
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
            <div className={cn(
              "flex gap-1 transition-opacity duration-200 shrink-0",
              isHovered ? "opacity-100" : "opacity-0"
            )}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={() => setIsEditDialogOpen(true)}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => deleteBookmark(bookmark.id)}
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {bookmark.note && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {bookmark.note}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {bookmark.tags && bookmark.tags.length > 0 ? (
            bookmark.tags.map(tag => (
              <Badge 
                key={tag.id} 
                variant="secondary" 
                className="px-2 py-0.5 text-xs font-normal bg-secondary/50 text-secondary-foreground hover:bg-primary/20 hover:text-primary transition-colors"
              >
                #{tag.name}
              </Badge>
            ))
          ) : (
            <div className="h-6"></div>
          )}
        </div>
      </motion.div>

      <AddBookmarkDialog 
        open={isEditDialogOpen} 
        onOpenChange={setIsEditDialogOpen} 
        mode="edit"
        initialData={bookmark}
      />
    </>
  );
}
