import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, Home, Star, Tag, LogOut, Loader2, Globe, MoreVertical, Edit2, Trash2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useTags, useUpdateTag, useDeleteTag } from '@/hooks/use-tags';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import icon32 from '@assets/icon32_1767721345186.png';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();
  const { data: tags, isLoading: isLoadingTags } = useTags();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

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
           DHeer
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
                <div key={tag.id} className="relative group">
                  {editingTagId === tag.id ? (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-xs bg-white/5 border-white/10"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateTag.mutate({ id: tag.id, name: editName });
                            setEditingTagId(null);
                          } else if (e.key === 'Escape') {
                            setEditingTagId(null);
                          }
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-green-500 hover:bg-green-500/10"
                        onClick={() => {
                          updateTag.mutate({ id: tag.id, name: editName });
                          setEditingTagId(null);
                        }}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-red-500 hover:bg-red-500/10"
                        onClick={() => setEditingTagId(null)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center group/item">
                      <Link href={`/?tag=${tag.name}`} className="flex-1">
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
                      
                      <div className="absolute right-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-white">
                              <MoreVertical className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32 bg-card border-white/10">
                            <DropdownMenuItem 
                              onClick={() => {
                                setEditingTagId(tag.id);
                                setEditName(tag.name);
                              }}
                              className="text-xs flex items-center gap-2 hover:bg-white/5 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteTag.mutate(tag.id)}
                              className="text-xs flex items-center gap-2 text-destructive hover:bg-destructive/10 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )}
                </div>
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
