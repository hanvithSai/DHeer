/**
 * client/src/components/sidebar.tsx
 *
 * The persistent left-side navigation panel for the DHeer web app.
 *
 * Sections (top to bottom):
 *  1. Logo + mascot icon — click opens the Companion Panel in a Sheet drawer
 *  2. Main navigation    — All Bookmarks, Public Feed
 *  3. My Tasks           — click opens the Todo Panel in a Sheet drawer
 *  4. Tags               — editable list of user-created tags with rename/delete
 *  5. User footer        — avatar, name, email, sign-out button
 *
 * The sidebar is always rendered in the layout for authenticated users.
 * On mobile it is typically hidden or shown via a hamburger menu in the parent layout.
 *
 * Impact if this file changes:
 *  - The Companion Sheet houses `<CompanionPanel>` — removing it hides the entire
 *    companion feature for web-app users
 *  - The Todo Sheet houses `<TodoPanel>` — removing it removes the web todo access
 *  - The tag list uses the `useTags`, `useUpdateTag`, `useDeleteTag` hooks from
 *    client/src/hooks/use-tags.ts — any shape change there affects the sidebar
 */

import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Hash, Home, Globe, LogOut, Loader2, MoreVertical, Edit2, Trash2, Check, X, CheckSquare, BarChart2 } from "lucide-react";
import { CompanionPanel } from "./companion-panel";
import { TodoPanel } from "./todo-panel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTags, useUpdateTag, useDeleteTag } from "@/hooks/use-tags";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import icon32 from "@assets/icon32_1767721345186.png";

/**
 * SidebarProps
 *
 * @property className — Optional extra Tailwind classes passed by the parent layout
 *                       to control width, visibility, or z-index on different breakpoints
 */
interface SidebarProps {
  className?: string;
}

/**
 * Sidebar
 *
 * The main navigation sidebar component for authenticated users.
 * Stateful for:
 *  - `editingTagId` / `editName`  — inline tag rename UX (one tag editable at a time)
 *  - `todoSheetOpen`              — controls the Todo Panel Sheet open/close state
 *
 * Auth data, tags, and mutation hooks are fetched here rather than in child
 * components so the sidebar does not re-mount children on sheet open/close.
 *
 * Impact if changed:
 *  - This component is rendered inside the authenticated layout (App.tsx) and
 *    persists across client-side route changes — changes here affect every page
 *  - The `<Sheet>` for the companion is uncontrolled (no open state) — the
 *    SheetTrigger manages it internally
 *  - The `<Sheet>` for todos uses controlled open state (`todoSheetOpen`) so
 *    it can be closed programmatically if needed in the future
 */
export function Sidebar({ className }: SidebarProps) {
  const [location]  = useLocation();
  const { user, logout, isLoggingOut } = useAuth();
  const { data: tags, isLoading: isLoadingTags } = useTags();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  /**
   * editingTagId / editName
   *
   * Track which tag (if any) is currently being renamed inline.
   * `editingTagId = null` means no tag is in edit mode.
   * `editName` holds the draft value shown in the Input during rename.
   *
   * Impact if changed:
   *  - Only one tag can be edited at a time — `setEditingTagId(tag.id)` closes
   *    any previously open editor (React re-render collapses it)
   *  - On save, `updateTag.mutate` is called and `setEditingTagId(null)` collapses the editor
   */
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editName,     setEditName]     = useState<string>("");

  /**
   * todoSheetOpen
   *
   * Controls the open state of the My Tasks Sheet.
   * Controlled rather than uncontrolled so the Sheet can be closed
   * from within the TodoPanel if needed (e.g. after a keyboard shortcut).
   *
   * Impact if changed:
   *  - Setting to `true` programmatically opens the sheet; `false` closes it
   *  - The `onOpenChange` callback keeps `todoSheetOpen` in sync when the user
   *    closes the sheet by clicking outside or pressing Escape
   */
  const [todoSheetOpen, setTodoSheetOpen] = useState(false);

  /**
   * currentTag
   *
   * Reads the `?tag=` query param from the current URL to highlight the
   * active tag in the sidebar tag list.
   *
   * Impact if changed:
   *  - Switching from `window.location.search` to a Wouter useSearch hook would
   *    make this reactive to programmatic navigation without full page reloads
   */
  const currentTag = new URLSearchParams(window.location.search).get("tag");

  /**
   * navItems
   *
   * Static navigation items for the main Library section.
   * Each item has:
   *  - `label`  — display text
   *  - `icon`   — Lucide icon component
   *  - `path`   — Wouter route path
   *  - `active` — whether this item is currently active (highlights the row)
   *
   * Impact if changed:
   *  - Adding a new route here also requires registering it in App.tsx's router
   *  - The `active` logic for '/' excludes tag-filtered views (`!currentTag`)
   *    so the tag items in the Tags section can be highlighted independently
   */
  const navItems = [
    { label: "All Bookmarks", icon: Home,      path: "/",             active: location === "/"             && !currentTag },
    { label: "Public Feed",   icon: Globe,     path: "/public",       active: location === "/public"       },
    { label: "Productivity",  icon: BarChart2, path: "/productivity", active: location === "/productivity" },
  ];

  return (
    <div className={cn("flex flex-col h-full bg-card border-r border-border md:w-64", className)}>

      {/* ── Header: Logo + Companion trigger ──────────────────────────────── */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          {/**
           * Companion Sheet
           *
           * An uncontrolled `<Sheet>` triggered by clicking the mascot logo.
           * `side="left"` opens the sheet sliding in from the left.
           * `<SheetContent>` hosts `<CompanionPanel>` for insights, workspaces,
           * and nudge settings.
           *
           * The pulsing dot overlay signals that the companion is "active".
           *
           * Impact if changed:
           *  - Removing this Sheet removes the entire companion feature in the web app
           *  - The `w-80` width (320px) was chosen to not overlap the main content
           *    on typical laptop viewports (sidebar=256px + companion=320px = 576px < 768px breakpoint)
           */}
          <Sheet>
            <SheetTrigger asChild>
              <div
                className="relative cursor-pointer group hover-elevate"
                data-testid="btn-open-companion"
              >
                <img
                  src={icon32}
                  alt="DHeer Logo"
                  className="w-8 h-8 rounded-lg shadow-lg shadow-primary/20 transition-transform group-hover:scale-110"
                />
                <div
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-accent rounded-full border-2 border-card animate-pulse shadow-[0_0_10px_rgba(206,152,105,0.5)]"
                  title="DHeer is watching!"
                />
              </div>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 border-r border-white/5 bg-background">
              <SheetHeader className="p-6 border-b border-white/5">
                <SheetTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-lg">🦌</div>
                  DHeer Companion
                </SheetTitle>
              </SheetHeader>
              <CompanionPanel />
            </SheetContent>
          </Sheet>

          {/* App title and online indicator */}
          <div className="flex flex-col">
            <h1 className="text-xl font-display font-bold tracking-tight text-white leading-tight">
              DHeer
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-accent font-bold uppercase tracking-wider">Mascot Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content (scrollable) ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-8">

        {/* ── Library navigation ─────────────────────────────────────────── */}
        <div className="space-y-1">
          <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Library
          </p>
          {navItems.map(item => (
            <Link key={item.path} href={item.path}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                  item.active
                    ? "bg-primary/10 text-primary shadow-sm border border-primary/20"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
                data-testid={`nav-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <item.icon className={cn("w-4 h-4", item.active && "text-primary")} />
                {item.label}
              </div>
            </Link>
          ))}
        </div>

        {/* ── My Tasks (Todo Sheet) ──────────────────────────────────────── */}
        {/**
         * Todo Sheet
         *
         * A controlled `<Sheet>` triggered by clicking "My Tasks" in the sidebar.
         * `open`/`onOpenChange` allow programmatic control.
         * `side="left"` keeps it consistent with the companion sheet.
         * Width is 360px (`w-[360px]`), slightly wider than the sidebar for readability.
         *
         * The `<TodoPanel>` component lives inside the Sheet content.
         * Its height is constrained to `calc(100vh - 88px)` where 88px is the
         * SheetHeader height, giving it a full-height scrollable area.
         *
         * Impact if changed:
         *  - Removing this Sheet makes todos inaccessible from the web app
         *  - The Sheet is a portal rendered outside the sidebar DOM — z-index issues
         *    should be handled at the global level, not inside Sidebar
         */}
        <Sheet open={todoSheetOpen} onOpenChange={setTodoSheetOpen}>
          <SheetTrigger asChild>
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
                "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
              data-testid="nav-my-tasks"
            >
              <CheckSquare className="w-4 h-4" />
              My Tasks
            </div>
          </SheetTrigger>
          <SheetContent side="left" className="w-[360px] p-0 border-r border-white/5 bg-background">
            <SheetHeader className="p-6 border-b border-white/5">
              <SheetTitle className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-lg">✅</div>
                My Tasks
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden h-[calc(100vh-88px)]">
              <TodoPanel />
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Tags list ──────────────────────────────────────────────────── */}
        {/**
         * Tags section
         *
         * Lists all tags owned by the authenticated user.
         * Each tag is clickable (navigates to `/?tag=<name>`) and has a
         * hover-revealed dropdown with Rename and Delete options.
         *
         * Rename flow:
         *  1. Dropdown → Rename → `setEditingTagId(tag.id)` + `setEditName(tag.name)`
         *  2. Tag row switches to an inline Input + Save/Cancel buttons
         *  3. Enter or Save button calls `updateTag.mutate({ id, name })`
         *  4. `setEditingTagId(null)` collapses the editor
         *
         * Delete flow:
         *  1. Dropdown → Delete → `deleteTag.mutate(tag.id)`
         *  2. Server removes the tag and all bookmark_tags junction rows
         *  3. Query cache is invalidated — the tag disappears from the list
         *
         * Impact if changed:
         *  - `useTags`, `useUpdateTag`, `useDeleteTag` are in client/src/hooks/use-tags.ts
         *  - Changing the query key in those hooks must be reflected here for correct invalidation
         */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tags</p>
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
              tags.map(tag => (
                <div key={tag.id} className="relative group">
                  {editingTagId === tag.id ? (
                    /* ── Inline rename form ──────────────────────────── */
                    <div className="flex items-center gap-1 px-2 py-1">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="h-7 text-xs bg-white/5 border-white/10"
                        autoFocus
                        data-testid={`input-rename-tag-${tag.id}`}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            updateTag.mutate({ id: tag.id, name: editName });
                            setEditingTagId(null);
                          } else if (e.key === "Escape") {
                            setEditingTagId(null);
                          }
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-green-500 hover:bg-green-500/10"
                        data-testid={`btn-confirm-rename-tag-${tag.id}`}
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
                        data-testid={`btn-cancel-rename-tag-${tag.id}`}
                        onClick={() => setEditingTagId(null)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    /* ── Normal tag row ──────────────────────────────── */
                    <div className="flex items-center group/item">
                      <Link href={`/?tag=${tag.name}`} className="flex-1">
                        <div
                          className={cn(
                            "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer group",
                            currentTag === tag.name
                              ? "text-primary bg-primary/5"
                              : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                          )}
                          data-testid={`nav-tag-${tag.id}`}
                        >
                          <Hash className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                          <span className="truncate">{tag.name}</span>
                        </div>
                      </Link>

                      {/* ── Tag action dropdown ──────────────────────── */}
                      <div className="absolute right-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-white"
                              data-testid={`btn-tag-menu-${tag.id}`}
                            >
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
                              data-testid={`menu-rename-tag-${tag.id}`}
                            >
                              <Edit2 className="w-3 h-3" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteTag.mutate(tag.id)}
                              className="text-xs flex items-center gap-2 text-destructive hover:bg-destructive/10 cursor-pointer"
                              data-testid={`menu-delete-tag-${tag.id}`}
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

      {/* ── User footer ───────────────────────────────────────────────────── */}
      {/**
       * User footer
       *
       * Displays the authenticated user's avatar, display name, and email.
       * The Sign Out button calls `logout()` from `useAuth` which navigates
       * to /api/logout (server-side session destruction + redirect).
       *
       * Avatar fallback: first letter of firstName + first letter of lastName.
       * If the user has no profile image, a colored placeholder is shown.
       *
       * Impact if changed:
       *  - `user?.profileImageUrl ?? undefined` — Replit Auth provides this field;
       *    other auth providers may use different field names
       *  - `isLoggingOut` shows a spinner while the mutation is in flight,
       *    preventing double-clicks that would cause double logout requests
       */}
      <div className="p-4 border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-9 w-9 border border-white/10">
            <AvatarImage src={user?.profileImageUrl ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate text-white" data-testid="text-user-name">
              {user?.firstName ?? ""} {user?.lastName ?? ""}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
              {user?.email}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start text-muted-foreground hover:text-white border-white/10 hover:bg-white/5"
          onClick={() => logout()}
          disabled={isLoggingOut}
          data-testid="btn-sign-out"
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
