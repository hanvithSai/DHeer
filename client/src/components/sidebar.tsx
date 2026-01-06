import React from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Hash, Home, Star, Tag, LogOut, Loader2, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useTags } from '@/hooks/use-tags';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import icon32 from '@assets/icon32_1767721345186.png';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();
  const { data: tags, isLoading: isLoadingTags } = useTags();

  // Get search param 'tag'
  const params = new URLSearchParams(window.location.search);
  const currentTag = params.get('tag');

  const navItems = [
    { label: 'All Bookmarks', icon: Home, path: '/', active: location === '/' && !currentTag },
    { label: 'Public Feed', icon: Globe, path: '/public', active: location === '/public' },
  ];

  return (
    <div className={cn("flex flex-col h-full bg-card border-r border-border", className)}>
      <div className="p-6">
        <div className="flex items-center gap-3">
          <img src={icon32} alt="Logo" className="w-8 h-8 rounded-lg shadow-lg shadow-primary/20" />
          <h1 className="text-xl font-display font-bold tracking-tight text-white">
            MMarkit
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-8">
        {/* Main Navigation */}
        <div className="space-y-1">
          <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Library
          </p>
          {navItems.map((item) => (
            <Link key={item.path} href={item.path}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                  item.active 
                    ? "bg-primary/10 text-primary shadow-sm border border-primary/20" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-4 h-4", item.active && "text-primary")} />
                {item.label}
              </div>
            </Link>
          ))}
        </div>

        {/* Tags Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tags
            </p>
            {tags && tags.length > 0 && (
              <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-muted-foreground">
                {tags.length}
              </span>
            )}
          </div>
          
          <div className="space-y-0.5">
            {isLoadingTags ? (
              <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading tags...
              </div>
            ) : tags && tags.length > 0 ? (
              tags.map((tag) => (
                <Link key={tag.id} href={`/?tag=${tag.name}`}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer group",
                      currentTag === tag.name 
                        ? "text-primary bg-primary/5" 
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    <Hash className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                    <span className="truncate">{tag.name}</span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground italic opacity-50">
                No tags created yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User Footer */}
      <div className="p-4 border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-9 w-9 border border-white/10">
            <AvatarImage src={user?.profileImageUrl} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate text-white">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full justify-start text-muted-foreground hover:text-white border-white/10 hover:bg-white/5"
          onClick={() => logout()}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4 mr-2" />
          )}
          Sign Out
        </Button>
      </div>
    </div>
  );
}
