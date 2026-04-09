/**
 * client/src/components/companion-panel.tsx
 *
 * The DHeer Companion Panel — a slide-out drawer accessible by clicking
 * the mascot icon in the sidebar.
 *
 * Features:
 *  1. Companion Insights — real-time tab count and tab-switch count from
 *     the browser extension (via chrome.runtime.sendMessage)
 *  2. Workspaces — create, launch, and delete named URL collections
 *  3. Nudge Settings — toggle mascot nudges and configure the tab threshold
 *
 * This component renders inside a `<Sheet>` portal in sidebar.tsx.
 * It gracefully degrades when the extension is not installed (chrome.runtime absent).
 *
 * Impact if changed:
 *  - Changes to query keys must match server/routes.ts and storage.ts paths
 *  - The `updateSettings` mutation sends the updated config to the extension via
 *    chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', config }) — any shape
 *    change here must be mirrored in background.js's UPDATE_CONFIG handler
 *  - The workspace prompt-based creation is intentional (quick prototype UX)
 */

import React, { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Play, Trash2, Plus, Monitor, Bell, Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SheetTrigger } from "@/components/ui/sheet";
import type { Workspace, CompanionSettings } from "@shared/schema";

/**
 * CompanionPanel
 *
 * Root component for the companion side-panel.
 * Rendered inside a `<SheetContent>` in sidebar.tsx.
 *
 * State:
 *  - `sessionData` — tab count + switch count polled from the extension every 5s
 *
 * Queries:
 *  - `/api/companion/settings` — nudge settings (refreshed after PATCH)
 *  - `/api/workspaces`         — user's workspace list
 *
 * Impact if changed:
 *  - Adding a new section here requires no changes elsewhere
 *  - Removing the Settings section would leave nudge config inaccessible
 */
export function CompanionPanel() {
  const { toast } = useToast();

  /**
   * sessionData
   *
   * In-memory state for browser session metadata received from the extension.
   * Updated every 5 seconds via a polled chrome.runtime.sendMessage call.
   * Defaults to zeros when the extension is absent or hasn't responded yet.
   *
   * Impact if changed:
   *  - This is display-only; changing it doesn't affect the extension's tracking state
   *  - Increasing the poll interval reduces CPU usage but makes the display stale longer
   */
  const [sessionData, setSessionData] = useState({ tabCount: 0, tabSwitches: 0 });

  /**
   * settings query
   *
   * Fetches companion settings (nudgesEnabled, tabCountThreshold, etc.).
   * The server auto-creates a default row for new users so this never returns null.
   * `staleTime: Infinity` (from queryClient defaults) means it re-fetches only
   * after `invalidateQueries` is called by the updateSettings mutation.
   *
   * Impact if changed:
   *  - The settings object drives the Switch and Slider initial values
   *  - If this query fails, the controls render with their `?? default` fallbacks
   */
  const { data: settings } = useQuery<CompanionSettings>({
    queryKey: ["/api/companion/settings"],
  });

  /**
   * workspaces query
   *
   * Fetches the list of workspaces for the user.
   * Re-fetches after createWorkspace or deleteWorkspace mutations succeed.
   *
   * Impact if changed:
   *  - Removing this query breaks the workspace list and launch buttons
   */
  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
  });

  /**
   * Extension metadata polling effect
   *
   * Sends `GET_SESSION_METADATA` to the browser extension every 5 seconds
   * and stores the response in `sessionData` to display tab count and switches.
   * Gracefully skips if `window.chrome.runtime` is unavailable (web-only view).
   *
   * Cleanup: clears the interval on unmount to prevent state updates on dead components.
   *
   * Impact if changed:
   *  - The 5-second interval matches the extension's broadcast rate from background.js
   *  - Removing this effect means the Insights card always shows "--"
   *  - Adding a real-time listener (chrome.runtime.onMessage) would eliminate
   *    the poll entirely, but requires the panel to always be mounted
   */
  useEffect(() => {
    const chromeObj = (window as any).chrome;
    if (!chromeObj?.runtime) return;

    const fetchMetadata = () => {
      chromeObj.runtime.sendMessage(
        { type: "GET_SESSION_METADATA" },
        (response: any) => {
          if (response) {
            setSessionData({
              tabCount: response.tabCount || 0,
              tabSwitches: response.tabSwitches || 0,
            });
          }
        },
      );
    };

    fetchMetadata();
    const interval = setInterval(fetchMetadata, 5000);
    return () => clearInterval(interval);
  }, []);

  /**
   * updateSettings mutation
   *
   * PATCHes one or more companion setting fields on the server.
   * On success:
   *  1. Parses the updated settings JSON from the response
   *  2. Invalidates the settings query cache to re-fetch fresh data
   *  3. Sends the new config to the extension via chrome.runtime.sendMessage
   *     so background.js can update its in-memory `config` object immediately
   *     without waiting for the sidepanel to re-open.
   *
   * ⚠️  BUG FIX: `apiRequest` returns the raw `Response` object.
   *     We must call `.json()` before passing to the extension.
   *     Previously, the raw Response was passed as `config`, which caused
   *     the extension to receive an unserializable object.
   *
   * @param updates — Partial<CompanionSettings> (any subset of settings fields)
   *
   * Impact if changed:
   *  - The extension's `config` object in background.js is updated here — if the
   *    JSON shape changes, background.js's UPDATE_CONFIG handler must also change
   *  - Removing the `invalidateQueries` call means the UI sliders won't reflect
   *    the saved value until the page is reloaded
   */
  const updateSettings = useMutation({
    mutationFn: (updates: Partial<CompanionSettings>) =>
      apiRequest("PATCH", "/api/companion/settings", updates),
    onSuccess: async (response) => {
      // Parse the JSON body from the raw Response before using it
      const newSettings = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/companion/settings"] });

      // Forward the updated config to the extension background worker
      const chromeObj = (window as any).chrome;
      if (chromeObj?.runtime) {
        chromeObj.runtime.sendMessage({ type: "UPDATE_CONFIG", config: newSettings });
      }
    },
  });

  /**
   * createWorkspace mutation
   *
   * POSTs a new workspace (name + urls[]) to the server.
   * On success: invalidates the workspaces cache and shows a toast notification.
   *
   * The creation UI uses `window.prompt()` — a quick prototype approach that
   * blocks the browser tab.  Replacing with an inline form would be more
   * accessible but requires additional state management.
   *
   * @param newWorkspace — { name: string, urls: string[] }
   *
   * Impact if changed:
   *  - URLs are not validated before storage — any string is accepted
   *  - The workspace appears immediately in the list after cache invalidation
   */
  const createWorkspace = useMutation({
    mutationFn: (newWorkspace: { name: string; urls: string[] }) =>
      apiRequest("POST", "/api/workspaces", newWorkspace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      toast({ title: "Workspace created" });
    },
  });

  /**
   * deleteWorkspace mutation
   *
   * DELETEs a workspace by ID.  On success: invalidates the workspaces cache.
   * No confirmation dialog — deletion is immediate.
   *
   * @param id — Workspace numeric PK
   *
   * Impact if changed:
   *  - Adding a confirmation dialog here would improve UX but requires state
   *  - The server enforces ownership, so deleting another user's ID silently no-ops
   */
  const deleteWorkspace = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/workspaces/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] }),
  });

  /**
   * launchWorkspace
   *
   * Launches all URLs in a workspace.
   * If running inside the browser extension context (chrome.runtime present):
   *   → sends LAUNCH_WORKSPACE to background.js which calls chrome.windows.create
   * Otherwise (web-only view):
   *   → opens each URL in a new browser tab via window.open
   *
   * @param urls — Array of URL strings from the workspace
   *
   * Impact if changed:
   *  - Changing the message type must be mirrored in background.js onMessage handler
   *  - window.open may be blocked by popup blockers for multiple simultaneous calls
   */
  const launchWorkspace = (urls: string[]) => {
    const chromeObj = (window as any).chrome;
    if (chromeObj?.runtime) {
      chromeObj.runtime.sendMessage({ type: "LAUNCH_WORKSPACE", urls });
    } else {
      urls.forEach(url => window.open(url, "_blank"));
    }
    toast({ title: "Launching workspace..." });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-8 p-6 overflow-y-auto h-full pb-24 bg-[#1a1412] text-[#f3e9dc]">

      {/* ── Companion Insights ──────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[#c08552] font-bold tracking-wide">
            <Activity className="w-5 h-5 stroke-[2.5px]" />
            <h2 className="text-lg uppercase">Companion Insights</h2>
          </div>
          {/* Close button — only visible on mobile where the Sheet lacks a built-in X */}
          <SheetTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-[#895737] hover:text-[#f3e9dc] md:hidden"
              data-testid="btn-close-companion"
            >
              <X className="w-5 h-5" />
            </Button>
          </SheetTrigger>
        </div>

        <Card className="bg-[#2a1f1b] border-none shadow-2xl">
          <CardContent className="pt-8 pb-8">
            <div className="grid grid-cols-2 gap-8 text-center relative">
              <div className="space-y-1">
                <p className="text-4xl font-display font-bold text-[#f3e9dc]" data-testid="text-tab-count">
                  {sessionData.tabCount || "--"}
                </p>
                <p className="text-[10px] text-[#895737] font-black uppercase tracking-[0.2em]">Tabs Open</p>
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1px] h-12 bg-[#3d2b26]" />
              <div className="space-y-1">
                <p className="text-4xl font-display font-bold text-[#f3e9dc]" data-testid="text-tab-switches">
                  {sessionData.tabSwitches || "--"}
                </p>
                <p className="text-[10px] text-[#895737] font-black uppercase tracking-[0.2em]">Switches</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Workspaces ──────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 text-[#c08552] font-bold tracking-wide">
          <Monitor className="w-5 h-5 stroke-[2.5px]" />
          <h2 className="text-lg uppercase">Workspaces</h2>
        </div>

        <div className="grid gap-3">
          {workspaces?.map(ws => (
            <div
              key={ws.id}
              className="group relative flex items-center justify-between p-4 rounded-xl bg-[#2a1f1b] border border-transparent hover:border-[#5e3023] transition-all duration-300"
              data-testid={`card-workspace-${ws.id}`}
            >
              <div className="flex-1 cursor-pointer" onClick={() => launchWorkspace(ws.urls)}>
                <h3 className="text-sm font-bold text-[#f3e9dc]" data-testid={`text-workspace-name-${ws.id}`}>{ws.name}</h3>
                <p className="text-[10px] text-[#895737] uppercase tracking-wider">
                  {ws.urls.length} Resources
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => launchWorkspace(ws.urls)}
                  className="h-8 w-8 text-[#c08552] hover:bg-[#5e3023]/20"
                  data-testid={`btn-launch-workspace-${ws.id}`}
                >
                  <Play className="w-4 h-4 fill-current" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteWorkspace.mutate(ws.id)}
                  className="h-8 w-8 text-[#895737] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-300"
                  data-testid={`btn-delete-workspace-${ws.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* New Workspace button — uses window.prompt for quick entry */}
          <Button
            variant="outline"
            className="w-full border-dashed border-[#3d2b26] bg-transparent h-14 rounded-xl text-sm font-bold text-[#895737] hover:bg-[#2a1f1b] hover:text-[#c08552] hover:border-[#c08552]/50 transition-all duration-300"
            data-testid="btn-new-workspace"
            onClick={() => {
              const name = prompt("Workspace Name?");
              const urlsInput = prompt("URLs (comma separated)?");
              if (name && urlsInput) {
                const urls = urlsInput.split(",").map(u => u.trim()).filter(Boolean);
                createWorkspace.mutate({ name, urls });
              }
            }}
          >
            <Plus className="w-5 h-5 mr-3" /> New Workspace
          </Button>
        </div>
      </section>

      {/* ── Nudge Settings ──────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 text-[#c08552] font-bold tracking-wide">
          <Bell className="w-5 h-5 stroke-[2.5px]" />
          <h2 className="text-lg uppercase">Nudge Settings</h2>
        </div>

        <Card className="bg-[#2a1f1b] border-none shadow-xl">
          <CardContent className="pt-8 space-y-8">
            {/* Enable / disable all nudges */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-[#f3e9dc]">Enable Nudges</span>
                <p className="text-[10px] text-[#895737] uppercase tracking-wider italic">Mascot feedback</p>
              </div>
              <Switch
                className="data-[state=checked]:bg-[#c08552] data-[state=unchecked]:bg-[#3d2b26]"
                checked={settings?.nudgesEnabled ?? true}
                onCheckedChange={checked => updateSettings.mutate({ nudgesEnabled: checked })}
                data-testid="switch-nudges-enabled"
              />
            </div>

            {/* Tab threshold slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-sm font-bold text-[#f3e9dc]">Tab Threshold</label>
                <span className="text-xl font-display font-bold text-[#c08552]" data-testid="text-tab-threshold">
                  ({settings?.tabCountThreshold ?? 10})
                </span>
              </div>
              <Slider
                min={2}
                max={50}
                step={1}
                value={[settings?.tabCountThreshold ?? 10]}
                onValueChange={([val]) => updateSettings.mutate({ tabCountThreshold: val })}
                className="[&_[role=slider]]:bg-[#c08552] [&_[role=slider]]:border-none"
                data-testid="slider-tab-threshold"
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
